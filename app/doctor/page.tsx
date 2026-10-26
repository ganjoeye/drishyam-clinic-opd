
"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Visit = {
  id: string;
  queue_no: number;
  status: string;
  patients: {
    name: string;
    age: number | null;
    gender: string | null;
    phone: string | null;
  } | null;
  vitals?: {
    id?: string;
    bp: string | null;
    weight: number | null;
    pulse: number | null;
    spo2: number | null;
  }[];
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
  "Cap Omeprazole 20mg",
  "Tab Telmikind 40mg",
  "Tab Metformin 500mg",
];

const COMMON_DIAGNOSES = [
  "Viral Fever",
  "Acute Acidity",
  "Upper Respiratory Infection",
  "Hypertension",
  "Type 2 Diabetes",
  "Bodyache / Headache",
];

function getLocalDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
}

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
  const [error, setError] = useState("");

  const [medSearch, setMedSearch] = useState("");
  const [selectedMedName, setSelectedMedName] = useState("");
  const [dosage, setDosage] = useState("1-0-1");
  const [duration, setDuration] = useState("3 Days");
  const [instruction, setInstruction] = useState("After Food");
  const [medicineList, setMedicineList] = useState<MedItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const roomName = "DrishyamClinicPermanentRoom2026";
  const videoUrl = `https://vdo.ninja/?room=${roomName}&webcam&quality=0`;

  async function loadDoctorQueue() {
    const { data, error: queryError } = await supabase
      .from("visits")
      .select(
        "id, queue_no, status, patients(name, age, gender, phone), vitals(id, bp, weight, pulse, spo2)"
      )
      .eq("visit_date", getLocalDate())
      .order("queue_no", { ascending: true });

    if (queryError) {
      console.error("Doctor queue error:", queryError);
      setError(queryError.message);
      return;
    }

    const rows = (data ?? []) as unknown as Visit[];
    setVisits(rows);

    if (selectedVisit) {
      const found = rows.find((v) => v.id === selectedVisit.id);
      if (found) setSelectedVisit(found);
    }
  }

  useEffect(() => {
    void loadDoctorQueue();

    const channel = supabase
      .channel("doctor-queue")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "visits" },
        () => void loadDoctorQueue()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const v = selectedVisit?.vitals?.[0];
    setBp(v?.bp ?? "");
    setWeight(v?.weight != null ? String(v.weight) : "");
    setPulse(v?.pulse != null ? String(v.pulse) : "");
    setSpo2(v?.spo2 != null ? String(v.spo2) : "");
  }, [selectedVisit?.id]);

  async function updateStatus(visit: Visit, newStatus: string) {
    const { error: statusError } = await supabase
      .from("visits")
      .update({ status: newStatus })
      .eq("id", visit.id);

    if (statusError) {
      console.error("Status update error:", statusError);
      alert("Could not update visit status: " + statusError.message);
      return;
    }

    await loadDoctorQueue();
    setSelectedVisit({ ...visit, status: newStatus });
  }

  function handleAddMedicine() {
    const medName = selectedMedName || medSearch.trim();

    if (!medName) {
      alert("Please select or type a medicine name.");
      return;
    }

    setMedicineList((previous) => [
      ...previous,
      { name: medName, dosage, duration, instruction },
    ]);
    setMedSearch("");
    setSelectedMedName("");
    setShowSuggestions(false);
  }

  async function handleSavePrescription() {
    if (!selectedVisit || isSaving) return;

    if (!diagnosis.trim()) {
      alert("Please enter the diagnosis.");
      return;
    }

    if (medicineList.length === 0) {
      alert("Please add at least one medicine.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      // STEP 1: Save vitals, if entered.
      const existingVitalId = selectedVisit.vitals?.[0]?.id;

      if (bp || weight || pulse || spo2) {
        const vitalData = {
          visit_id: selectedVisit.id,
          bp: bp || null,
          weight: weight ? Number(weight) : null,
          pulse: pulse ? Number(pulse) : null,
          spo2: spo2 ? Number(spo2) : null,
        };

        const vitalResult = existingVitalId
          ? await supabase
              .from("vitals")
              .update(vitalData)
              .eq("id", existingVitalId)
          : await supabase.from("vitals").insert(vitalData);

        if (vitalResult.error) {
          throw new Error("Vitals save failed: " + vitalResult.error.message);
        }
      }

      // STEP 2: Insert prescription and check the actual database response.
      const formattedMedicines = medicineList
        .map(
          (m, index) =>
            `${index + 1}. ${m.name} -- [${m.dosage}] -- ${m.duration} (${m.instruction})`
        )
        .join("\n");

      const { data: savedPrescription, error: prescriptionError } =
        await supabase
          .from("prescriptions")
          .insert({
            visit_id: selectedVisit.id,
            diagnosis: diagnosis.trim(),
            medicines: formattedMedicines,
            advice: advice.trim(),
          })
          .select("id")
          .single();

      if (prescriptionError) {
        console.error("Prescription insert failed:", prescriptionError);
        throw new Error(
          "Prescription was NOT saved: " + prescriptionError.message
        );
      }

      if (!savedPrescription?.id) {
        throw new Error(
          "The database did not confirm the saved prescription."
        );
      }

      // STEP 3: Update visit status only after prescription is saved.
      const { error: statusError } = await supabase
        .from("visits")
        .update({ status: "completed" })
        .eq("id", selectedVisit.id);

      if (statusError) {
        console.error("Visit status update failed:", statusError);
        alert(
          "Prescription saved, but visit status update failed:\n" +
            statusError.message
        );
      } else {
        alert("Prescription saved successfully and visit marked completed.");
      }

      setDiagnosis("");
      setMedicineList([]);
      setAdvice("");
      setSelectedVisit(null);
      await loadDoctorQueue();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unexpected error occurred.";

      setError(message);
      console.error("Save prescription error:", err);
      alert(message);
    } finally {
      setIsSaving(false);
    }
  }

  const filteredMedicines = COMMON_MEDICINES.filter((m) =>
    m.toLowerCase().includes(medSearch.toLowerCase())
  );

  return (
    <main className="max-w-7xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">
        Doctor Dashboard & Smart OPD Desk
      </h1>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-800 p-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <section className="bg-white border rounded-xl p-4 space-y-3">
          <h2 className="font-bold text-lg border-b pb-2">
            Today&apos;s Patients
          </h2>

          {visits.length === 0 && (
            <p className="text-gray-500 text-sm">No patients in queue.</p>
          )}

          {visits.map((visit) => (
            <button
              key={visit.id}
              type="button"
              onClick={() => setSelectedVisit(visit)}
              className={`block w-full text-left p-3 rounded-lg border ${
                selectedVisit?.id === visit.id
                  ? "border-blue-600 bg-blue-50"
                  : "hover:bg-gray-50"
              }`}
            >
              <strong>
                #{visit.queue_no} {visit.patients?.name ?? "Unknown"}
              </strong>
              <p className="text-xs mt-1">{visit.status}</p>
            </button>
          ))}
        </section>

        <section className="bg-white border rounded-xl p-5 space-y-5 md:col-span-2">
          {selectedVisit ? (
            <>
              <div>
                <h2 className="text-xl font-bold">
                  Token #{selectedVisit.queue_no} —{" "}
                  {selectedVisit.patients?.name}
                </h2>
                <p className="text-sm text-gray-500">
                  {selectedVisit.patients?.gender ?? "N/A"},{" "}
                  {selectedVisit.patients?.age ?? "N/A"} years | Phone:{" "}
                  {selectedVisit.patients?.phone ?? "N/A"}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    void updateStatus(selectedVisit, "in-consultation")
                  }
                  className="mt-3 bg-blue-600 text-white px-4 py-2 rounded-lg"
                >
                  Call In
                </button>
              </div>

              <div className="bg-blue-50 border rounded-xl p-4">
                <h3 className="font-bold mb-3">Patient Vitals</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <input className="border p-2 rounded" placeholder="BP" value={bp} onChange={(e) => setBp(e.target.value)} />
                  <input className="border p-2 rounded" type="number" placeholder="Weight (kg)" value={weight} onChange={(e) => setWeight(e.target.value)} />
                  <input className="border p-2 rounded" type="number" placeholder="Pulse" value={pulse} onChange={(e) => setPulse(e.target.value)} />
                  <input className="border p-2 rounded" type="number" placeholder="SpO2" value={spo2} onChange={(e) => setSpo2(e.target.value)} />
                </div>
              </div>

              <div className="bg-slate-50 border rounded-xl p-4 space-y-4">
                <h3 className="font-bold">Smart Prescription Builder</h3>

                <div>
                  <label className="text-sm font-semibold">Diagnosis</label>
                  <input
                    className="w-full border p-2 rounded mt-1"
                    value={diagnosis}
                    onChange={(e) => setDiagnosis(e.target.value)}
                    placeholder="Enter diagnosis"
                  />
                  <div className="flex flex-wrap gap-2 mt-2">
                    {COMMON_DIAGNOSES.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDiagnosis(d)}
                        className="text-xs bg-gray-200 px-2 py-1 rounded-full"
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold">Medicine</label>
                  <input
                    className="w-full border p-2 rounded"
                    value={medSearch}
                    onChange={(e) => {
                      setMedSearch(e.target.value);
                      setSelectedMedName("");
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    placeholder="Search or type medicine"
                  />

                  {showSuggestions && medSearch.trim() && (
                    <div className="border bg-white rounded max-h-40 overflow-y-auto">
                      {(filteredMedicines.length
                        ? filteredMedicines
                        : [medSearch.trim()]
                      ).map((m) => (
                        <button
                          key={m}
                          type="button"
                          className="block w-full text-left p-2 hover:bg-blue-50"
                          onClick={() => {
                            setSelectedMedName(m);
                            setMedSearch(m);
                            setShowSuggestions(false);
                          }}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <select className="border p-2 rounded" value={dosage} onChange={(e) => setDosage(e.target.value)}>
                      <option value="1-0-1">1-0-1</option>
                      <option value="1-0-0">1-0-0</option>
                      <option value="0-0-1">0-0-1</option>
                      <option value="1-1-1">1-1-1</option>
                      <option value="SOS">SOS</option>
                    </select>
                    <select className="border p-2 rounded" value={duration} onChange={(e) => setDuration(e.target.value)}>
                      <option>3 Days</option>
                      <option>5 Days</option>
                      <option>7 Days</option>
                      <option>10 Days</option>
                      <option>1 Month</option>
                    </select>
                    <select className="border p-2 rounded" value={instruction} onChange={(e) => setInstruction(e.target.value)}>
                      <option>After Food</option>
                      <option>Before Food</option>
                      <option>With Water</option>
                      <option>At Bedtime</option>
                    </select>
                  </div>

                  <button type="button" onClick={handleAddMedicine} className="w-full bg-blue-600 text-white p-2 rounded">
                    + Add Medicine to List
                  </button>
                </div>

                {medicineList.map((m, i) => (
                  <div key={`${m.name}-${i}`} className="flex justify-between gap-2 border-b py-2 text-sm">
                    <span>
                      {i + 1}. {m.name} — {m.dosage} — {m.duration} — {m.instruction}
                    </span>
                    <button type="button" className="text-red-600" onClick={() => setMedicineList((old) => old.filter((_, index) => index !== i))}>
                      Remove
                    </button>
                  </div>
                ))}

                <div>
                  <label className="text-sm font-semibold">Advice / Notes</label>
                  <input
                    className="w-full border p-2 rounded mt-1"
                    value={advice}
                    onChange={(e) => setAdvice(e.target.value)}
                    placeholder="Advice for patient"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => void handleSavePrescription()}
                  disabled={isSaving}
                  className="w-full bg-emerald-600 text-white p-3 rounded-xl font-bold disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Save Prescription & Send to Reception"}
                </button>
              </div>
            </>
          ) : (
            <p className="bg-amber-50 p-4 rounded-lg">
              Select a patient from the queue to write a prescription.
            </p>
          )}

          <div>
            <h3 className="font-semibold mb-2">Doctor Live Video Stream</h3>
            <iframe
              src={videoUrl}
              title="Doctor Live Video Stream"
              className="w-full h-[280px] bg-black rounded-xl border-0"
              allow="camera; microphone; display-capture; autoplay; encrypted-media"
            />
          </div>
        </section>
      </div>
    </main>
  );
}
