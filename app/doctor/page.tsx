"use client";
import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";

type Visit = {
  id: string;
  queue_no: number;
  status: string;
  patients: { name: string; age: number; gender: string; phone: string } | null;
  vitals?: { id?: string; bp: string; weight: number; pulse: number; spo2: number }[];
};

type MedItem = {
  name: string;
  dosage: string;
  duration: string;
  instruction: string;
};

const COMMON_MEDICINES = [
  "Tab Paracetamol 650mg",
  "Tab Paracetamol 500mg",
  "Tab Pantocid 40mg",
  "Tab Pan-D",
  "Cap Amoxyclav 625mg",
  "Tab Azithromycin 500mg",
  "Tab Cetirizine 10mg",
  "Tab Montair-LC",
  "Tab Meftal-Spas",
  "Tab Combiflam",
  "Tab Zero-P",
  "Syrup Benadryl",
  "Syrup Ascoril-D",
  "Tab Ondem 4mg",
  "Tab Ranitidine 150mg",
  "Cap Omeprazole 20mg",
  "Tab Telmikind 40mg",
  "Tab Metformin 500mg"
];

const COMMON_DIAGNOSES = ["Viral Fever", "Acute Acidity", "Upper Respiratory Infection", "Hypertension", "Type 2 Diabetes", "Bodyache / Headache"];

export default function DoctorDashboard() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);

  const [diagnosis, setDiagnosis] = useState("");
  const [advice, setAdvice] = useState("");
  const [bp, setBp] = useState("");
  const [weight, setWeight] = useState("");
  const [pulse, setPulse] = useState("");
  const [spo2, setSpo2] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [medSearch, setMedSearch] = useState("");
  const [selectedMedName, setSelectedMedName] = useState("");
  const [dosage, setDosage] = useState("1-0-1");
  const [duration, setDuration] = useState("3 Days");
  const [instruction, setInstruction] = useState("After Food");
  const [medicineList, setMedicineList] = useState<MedItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const today = () => new Date().toISOString().slice(0, 10);
  const roomName = "DrishyamClinicPermanentRoom2026";
  const videoUrl = `https://vdo.ninja/?room=${roomName}&webcam&quality=0`;

  async function loadDoctorQueue() {
    const { data } = await supabase
      .from("visits")
      .select("id, queue_no, status, patients(name, age, gender, phone), vitals(id, bp, weight, pulse, spo2)")
      .eq("visit_date", today())
      .order("queue_no", { ascending: true });

    if (data) {
      setVisits(data as unknown as Visit[]);
      // Keep selected visit updated if it exists in new data
      if (selectedVisit) {
        const found = data.find((v: any) => v.id === selectedVisit.id);
        if (found) setSelectedVisit(found as unknown as Visit);
      }
    }
  }

  useEffect(() => {
    loadDoctorQueue();

    const channel = supabase
      .channel("doctor-queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "visits" }, () => {
        loadDoctorQueue();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Sync vitals when patient selection changes
  useEffect(() => {
    if (selectedVisit?.vitals && selectedVisit.vitals.length > 0) {
      const v = selectedVisit.vitals[0];
      setBp(v.bp || "");
      setWeight(v.weight ? String(v.weight) : "");
      setPulse(v.pulse ? String(v.pulse) : "");
      setSpo2(v.spo2 ? String(v.spo2) : "");
    } else {
      setBp("");
      setWeight("");
      setPulse("");
      setSpo2("");
    }
  }, [selectedVisit?.id]);

  async function updateStatus(visitObj: Visit, newStatus: string) {
    await supabase.from("visits").update({ status: newStatus }).eq("id", visitObj.id);
    await loadDoctorQueue();
    // Automatically select and update state
    const updatedVisit = { ...visitObj, status: newStatus };
    setSelectedVisit(updatedVisit);
  }

  function handleAddMedicine() {
    const medName = selectedMedName || medSearch.trim();
    if (!medName) return alert("Please select or type a medicine name!");

    setMedicineList([...medicineList, { name: medName, dosage, duration, instruction }]);
    setMedSearch("");
    setSelectedMedName("");
    setShowSuggestions(false);
  }

  function handleRemoveMedicine(index: number) {
    setMedicineList(medicineList.filter((_, i) => i !== index));
  }

  async function handleSavePrescription() {
    if (!selectedVisit) return;
    setIsSaving(true);

    if (bp || weight || pulse || spo2) {
      const existingVitalId = selectedVisit.vitals?.[0]?.id;
      const vitalData = {
        visit_id: selectedVisit.id,
        bp: bp || null,
        weight: weight ? Number(weight) : null,
        pulse: pulse ? Number(pulse) : null,
        spo2: spo2 ? Number(spo2) : null,
      };

      if (existingVitalId) {
        await supabase.from("vitals").update(vitalData).eq("id", existingVitalId);
      } else {
        await supabase.from("vitals").insert([vitalData]);
      }
    }

    const formattedMedicines = medicineList
      .map((m, idx) => `${idx + 1}. ${m.name} -- [${m.dosage}] -- ${m.duration} (${m.instruction})`)
      .join("\n");

    await supabase.from("prescriptions").insert([
      {
        visit_id: selectedVisit.id,
        diagnosis,
        medicines: formattedMedicines,
        advice,
      },
    ]);

    await updateStatus(selectedVisit, "completed");

    setDiagnosis("");
    setMedicineList([]);
    setAdvice("");
    setBp("");
    setWeight("");
    setPulse("");
    setSpo2("");
    setIsSaving(false);
    setSelectedVisit(null);
    alert("Prescription saved & sent to reception!");
  }

  const filteredMedicines = COMMON_MEDICINES.filter((m) =>
    m.toLowerCase().includes(medSearch.toLowerCase())
  );

  return (
    <main className="max-w-7xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Doctor Dashboard & Smart OPD Desk</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Patient Queue List */}
        <div className="bg-white border rounded-xl p-4 shadow-sm space-y-3 md:col-span-1 h-fit">
          <h2 className="font-bold text-gray-700 text-lg border-b pb-2">Today's Patients</h2>
          <div className="space-y-2">
            {visits.length === 0 ? (
              <p className="text-gray-400 text-sm">No patients in queue.</p>
            ) : (
              visits.map((visit) => (
                <div
                  key={visit.id}
                  onClick={() => setSelectedVisit(visit)}
                  className={`p-3 rounded-lg border cursor-pointer transition ${
                    selectedVisit?.id === visit.id ? "border-blue-600 bg-blue-50 shadow-sm" : "hover:bg-gray-50"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-gray-800">#{visit.queue_no} {visit.patients?.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded uppercase font-semibold ${visit.status === 'in-consultation' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
                      {visit.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Active Patient Details, Smart Vitals, Prescription & Video */}
        <div className="bg-white border rounded-xl p-6 shadow-sm md:col-span-2 space-y-6">
          {selectedVisit ? (
            <div className="space-y-5 border-b pb-6">
              <div className="flex justify-between items-start border-b pb-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">
                    Token #{selectedVisit.queue_no} - {selectedVisit.patients?.name}
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {selectedVisit.patients?.gender}, {selectedVisit.patients?.age} yrs | Phone: {selectedVisit.patients?.phone || "N/A"}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => updateStatus(selectedVisit, "in-consultation")}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 shadow-sm"
                  >
                    Call In
                  </button>
                </div>
              </div>

              {/* Vitals Input / Quick Edit Bar */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
                <h4 className="text-xs font-bold text-blue-800 uppercase tracking-wider">Patient Vitals</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div>
                    <label className="text-[11px] text-gray-600 font-semibold">BP</label>
                    <input
                      type="text"
                      value={bp}
                      onChange={(e) => setBp(e.target.value)}
                      placeholder="120/80"
                      className="w-full border rounded-lg p-1.5 text-sm bg-white mt-0.5"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-600 font-semibold">Weight (kg)</label>
                    <input
                      type="number"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      placeholder="68"
                      className="w-full border rounded-lg p-1.5 text-sm bg-white mt-0.5"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-600 font-semibold">Pulse</label>
                    <input
                      type="number"
                      value={pulse}
                      onChange={(e) => setPulse(e.target.value)}
                      placeholder="72"
                      className="w-full border rounded-lg p-1.5 text-sm bg-white mt-0.5"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-600 font-semibold">SpO2 (%)</label>
                    <input
                      type="number"
                      value={spo2}
                      onChange={(e) => setSpo2(e.target.value)}
                      placeholder="98"
                      className="w-full border rounded-lg p-1.5 text-sm bg-white mt-0.5"
                    />
                  </div>
                </div>
              </div>

              {/* Doctor Smart Prescription Form */}
              <div className="bg-slate-50 border rounded-xl p-5 space-y-4">
                <h3 className="font-bold text-gray-800 text-md flex items-center justify-between">
                  <span>Smart Prescription Builder</span>
                  <span className="text-xs text-blue-600 font-normal">Fast Medicine Selector Enabled</span>
                </h3>

                {/* Diagnosis Section with Quick Chips */}
                <div>
                  <label className="text-xs text-gray-600 font-bold uppercase tracking-wider">Diagnosis</label>
                  <input
                    type="text"
                    value={diagnosis}
                    onChange={(e) => setDiagnosis(e.target.value)}
                    placeholder="Type diagnosis or click quick chips below"
                    className="w-full border rounded-lg p-2.5 text-sm mt-1 bg-white"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {COMMON_DIAGNOSES.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDiagnosis(d)}
                        className="text-xs bg-gray-200 hover:bg-blue-100 hover:text-blue-700 text-gray-700 px-2.5 py-1 rounded-full font-medium transition"
                      >
                        + {d}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Medicine Search & Selection Box */}
                <div className="bg-white border rounded-xl p-4 space-y-3 relative">
                  <label className="text-xs text-blue-700 font-bold uppercase tracking-wider">Add Medicine</label>

                  <div className="relative">
                    <input
                      type="text"
                      value={medSearch}
                      onChange={(e) => {
                        setMedSearch(e.target.value);
                        setSelectedMedName("");
                        setShowSuggestions(true);
                      }}
                      onFocus={() => setShowSuggestions(true)}
                      placeholder="Type medicine name (e.g. Paracetamol, Pan-D)..."
                      className="w-full border rounded-lg p-2.5 text-sm"
                    />

                    {showSuggestions && medSearch.trim().length > 0 && (
                      <div className="absolute z-20 left-0 right-0 top-12 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {filteredMedicines.length === 0 ? (
                          <div
                            className="p-2.5 text-sm text-gray-500 hover:bg-gray-50 cursor-pointer"
                            onClick={() => {
                              setSelectedMedName(medSearch);
                              setShowSuggestions(false);
                            }}
                          >
                            Use custom medicine: <strong>"{medSearch}"</strong>
                          </div>
                        ) : (
                          filteredMedicines.map((m) => (
                            <div
                              key={m}
                              className="p-2.5 text-sm hover:bg-blue-50 cursor-pointer font-medium text-gray-800"
                              onClick={() => {
                                setMedSearch(m);
                                setSelectedMedName(m);
                                setShowSuggestions(false);
                              }}
                            >
                              💊 {m}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 font-semibold">Dosage Frequency</label>
                      <select
                        value={dosage}
                        onChange={(e) => setDosage(e.target.value)}
                        className="w-full border rounded-lg p-2 text-sm bg-white mt-1"
                      >
                        <option value="1-0-1">1-0-1 (Twice a day)</option>
                        <option value="1-0-0">1-0-0 (Morning only)</option>
                        <option value="0-0-1">0-0-1 (Night only)</option>
                        <option value="1-1-1">1-1-1 (Thrice a day)</option>
                        <option value="1-1-1-1">1-1-1-1 (4 times a day)</option>
                        <option value="SOS">SOS (As needed)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs text-gray-500 font-semibold">Duration</label>
                      <select
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        className="w-full border rounded-lg p-2 text-sm bg-white mt-1"
                      >
                        <option value="3 Days">3 Days</option>
                        <option value="5 Days">5 Days</option>
                        <option value="7 Days">7 Days</option>
                        <option value="10 Days">10 Days</option>
                        <option value="1 Month">1 Month</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs text-gray-500 font-semibold">Instruction</label>
                      <select
                        value={instruction}
                        onChange={(e) => setInstruction(e.target.value)}
                        className="w-full border rounded-lg p-2 text-sm bg-white mt-1"
                      >
                        <option value="After Food">After Food</option>
                        <option value="Before Food">Before Food</option>
                        <option value="With Water">With Water</option>
                        <option value="At Bedtime">At Bedtime</option>
                      </select>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddMedicine}
                    className="w-full bg-blue-600 text-white font-semibold py-2 rounded-lg text-sm hover:bg-blue-700 transition"
                  >
                    + Add Medicine to List
                  </button>
                </div>

                {medicineList.length > 0 && (
                  <div className="bg-white border rounded-xl p-3 space-y-2">
                    <h4 className="text-xs font-bold text-gray-700 uppercase">Selected Medicines ({medicineList.length})</h4>
                    <div className="space-y-1.5">
                      {medicineList.map((med, idx) => (
                        <div key={idx} className="flex justify-between items-center text-sm border-b pb-1.5 pt-1">
                          <div>
                            <span className="font-bold text-gray-800">{idx + 1}. {med.name}</span>
                            <span className="text-xs text-gray-500 ml-2">
                              [{med.dosage}] • {med.duration} • ({med.instruction})
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveMedicine(idx)}
                            className="text-xs text-red-600 hover:text-red-800 font-bold px-2 py-0.5 rounded border border-red-200"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-xs text-gray-600 font-bold uppercase tracking-wider">Advice / Special Notes</label>
                  <input
                    type="text"
                    value={advice}
                    onChange={(e) => setAdvice(e.target.value)}
                    placeholder="e.g. Drink warm water, Avoid oily food"
                    className="w-full border rounded-lg p-2.5 text-sm mt-1 bg-white"
                  />
                </div>

                <button
                  onClick={handleSavePrescription}
                  disabled={isSaving}
                  className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold text-base hover:bg-emerald-700 transition shadow-md"
                >
                  {isSaving ? "Saving..." : "Save Prescription & Send to Reception"}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl text-center font-medium">
              👉 Please click on a patient from the queue list on the left to write prescription and vitals.
            </div>
          )}

          {/* Video Window */}
          <div className="space-y-2">
            <h3 className="font-semibold text-gray-700 text-sm flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
              Doctor Live Video Stream (Always Active)
            </h3>
            <div className="w-full h-[280px] bg-black rounded-xl overflow-hidden border">
              <iframe
                src={videoUrl}
                className="w-full h-full border-0"
                allow="camera; microphone; display-capture; autoplay; encrypted-media"
              ></iframe>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}