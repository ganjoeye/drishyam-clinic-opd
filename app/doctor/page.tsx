
"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type DoctorProfile = {
  name: string;
  qualification: string | null;
  reg_no: string | null;
};

type Vital = {
  id?: string;
  bp: string | null;
  weight: number | null;
  pulse: number | null;
  spo2: number | null;
};

type Visit = {
  id: string;
  queue_no: number;
  status: string;
  visit_date?: string;
  patients: {
    name: string;
    age: number | null;
    gender: string | null;
    phone: string | null;
  } | null;
  vitals?: Vital[];
};

type Medicine = {
  name: string;
  dosage: string;
  duration: string;
  instruction: string;
};

const COMMON_MEDICINES = [
  "Tab Paracetamol 500mg",
  "Tab Paracetamol 650mg",
  "Tab Ibuprofen 400mg",
  "Tab Pantoprazole 40mg",
  "Tab Ondansetron 4mg",
  "Tab Cetirizine 10mg",
  "Tab Levocetirizine 5mg",
  "Tab Amoxicillin 500mg",
  "Tab Amoxyclav 625mg",
  "Tab Azithromycin 500mg",
  "Tab Cefixime 200mg",
  "Tab Metformin 500mg",
  "Tab Telmisartan 40mg",
  "Tab Amlodipine 5mg",
  "Tab Atorvastatin 10mg",
  "Tab Rosuvastatin 10mg",
  "Tab Folic Acid 5mg",
  "ORS Sachet",
  "Syrup Paracetamol",
  "Syrup Cetirizine",
];

const COMMON_DIAGNOSES = [
  "Viral Fever",
  "Acute Acidity",
  "Upper Respiratory Infection",
  "Hypertension",
  "Type 2 Diabetes",
  "Bodyache / Headache",
];

const COMMON_INVESTIGATIONS = [
  "CBC",
  "ESR",
  "CRP",
  "Peripheral Blood Smear",
  "Reticulocyte Count",
  "Platelet Count",
  "PT / INR",
  "aPTT",
  "Blood Grouping and Rh Typing",
  "Fasting Blood Sugar",
  "Random Blood Sugar (RBS)",
  "PPBS",
  "HbA1c",
  "Liver Function Test (LFT)",
  "Kidney Function Test (KFT)",
  "Serum Creatinine",
  "Blood Urea",
  "Serum Electrolytes",
  "Lipid Profile",
  "Thyroid Profile (TSH)",
  "Urine Routine and Microscopy",
  "Urine Culture and Sensitivity",
  "Blood Culture",
  "Dengue NS1 Antigen",
  "Dengue IgM / IgG",
  "Malaria Antigen",
  "Vitamin B12",
  "Vitamin D",
  "ECG",
  "Chest X-ray",
  "Ultrasound Abdomen and Pelvis",
  "CT Scan",
  "MRI",
  "Pregnancy Test",
];

function getLocalDate(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function DoctorDashboard() {
  const [doctor, setDoctor] = useState<DoctorProfile | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);

  const [diagnosis, setDiagnosis] = useState("");
  const [advice, setAdvice] = useState("");

  const [bp, setBp] = useState("");
  const [weight, setWeight] = useState("");
  const [pulse, setPulse] = useState("");
  const [spo2, setSpo2] = useState("");

  const [medicineSearch, setMedicineSearch] = useState("");
  const [selectedMedicine, setSelectedMedicine] = useState("");
  const [dosage, setDosage] = useState("1-0-1");
  const [duration, setDuration] = useState("3 Days");
  const [instruction, setInstruction] = useState("After Food");
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [showMedicineSuggestions, setShowMedicineSuggestions] =
    useState(false);

  const [investigationSearch, setInvestigationSearch] = useState("");
  const [investigations, setInvestigations] = useState<string[]>([]);
  const [showInvestigationSuggestions, setShowInvestigationSuggestions] =
    useState(false);

  const [error, setError] = useState("");
  const [queueMessage, setQueueMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isLoadingQueue, setIsLoadingQueue] = useState(false);
  const [queueDate, setQueueDate] = useState("");

  // Doctor publishes the webcam stream using this fixed stream ID.
  const roomName = "DrishyamClinicPermanentRoom2026";
  const doctorStreamId = "DrishyamDoctor2026";
  const videoUrl = `https://vdo.ninja/?push=${doctorStreamId}&room=${roomName}&webcam&quality=0`;

  const loadDoctorProfile = useCallback(async () => {
    setIsLoadingProfile(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        throw new Error("Login verification failed: " + authError.message);
      }

      if (!user) {
        throw new Error("Doctor login nahi mila. Please log in again.");
      }

      const { data, error: profileError } = await supabase
        .from("doctor_profiles")
        .select("user_id, name, qualification, reg_no")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileError) {
        throw new Error(
          "Doctor profile query failed: " + profileError.message
        );
      }

      if (!data) {
        throw new Error(
          "Doctor profile row nahi mila. Supabase mein doctor_profiles aur RLS policy check karein."
        );
      }

      setDoctor({
        name: data.name,
        qualification: data.qualification,
        reg_no: data.reg_no,
      });

      setError("");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown profile error";

      console.error("Doctor profile loading error:", err);
      setError(message);
      setDoctor(null);
    } finally {
      setIsLoadingProfile(false);
    }
  }, []);

  const loadDoctorQueue = useCallback(async () => {
    const today = getLocalDate();

    setQueueDate(today);
    setIsLoadingQueue(true);
    setQueueMessage("");

    try {
      const { data, error: queueError } = await supabase
        .from("visits")
        .select(
          "id, queue_no, status, visit_date, patients(name, age, gender, phone), vitals(id, bp, weight, pulse, spo2)"
        )
        .eq("visit_date", today)
        .order("queue_no", { ascending: true });

      if (queueError) {
        console.error("Queue loading error:", queueError);
        setQueueMessage("Queue load nahi hui: " + queueError.message);
        return;
      }

      const rows = (data ?? []) as unknown as Visit[];

      console.log("Doctor queue date:", today);
      console.log("Doctor queue records:", rows.length);

      setVisits(rows);

      setSelectedVisit((previous) => {
        if (!previous) return null;
        return rows.find((visit) => visit.id === previous.id) ?? null;
      });

      if (rows.length === 0) {
        setQueueMessage(
          `Aaj (${today}) ke liye koi visit nahi mili. Reception mein visit_date check karein.`
        );
      } else {
        setQueueMessage("");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown queue error";

      console.error("Queue loading failed:", err);
      setQueueMessage("Queue load nahi hui: " + message);
    } finally {
      setIsLoadingQueue(false);
    }
  }, []);

  useEffect(() => {
    void loadDoctorProfile();
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
  }, [loadDoctorProfile, loadDoctorQueue]);

  useEffect(() => {
    const vital = selectedVisit?.vitals?.[0];

    setBp(vital?.bp ?? "");
    setWeight(vital?.weight != null ? String(vital.weight) : "");
    setPulse(vital?.pulse != null ? String(vital.pulse) : "");
    setSpo2(vital?.spo2 != null ? String(vital.spo2) : "");

    setDiagnosis("");
    setAdvice("");
    setMedicines([]);
    setInvestigations([]);
    setMedicineSearch("");
    setSelectedMedicine("");
    setInvestigationSearch("");
    setShowMedicineSuggestions(false);
    setShowInvestigationSuggestions(false);
  }, [selectedVisit?.id]);

  async function updateStatus(visit: Visit, status: string) {
    const { error: statusError } = await supabase
      .from("visits")
      .update({ status })
      .eq("id", visit.id);

    if (statusError) {
      alert("Status update failed: " + statusError.message);
      return;
    }

    await loadDoctorQueue();
  }

  function addMedicine() {
    const name = selectedMedicine || medicineSearch.trim();

    if (!name) {
      alert("Please enter a medicine name.");
      return;
    }

    setMedicines((previous) => [
      ...previous,
      { name, dosage, duration, instruction },
    ]);

    setMedicineSearch("");
    setSelectedMedicine("");
    setShowMedicineSuggestions(false);
  }

  function addInvestigation(name?: string) {
    const value = (name ?? investigationSearch).trim();

    if (!value) {
      alert("Please enter an investigation.");
      return;
    }

    if (
      investigations.some(
        (item) => item.toLowerCase() === value.toLowerCase()
      )
    ) {
      alert("Investigation already added.");
      return;
    }

    setInvestigations((previous) => [...previous, value]);
    setInvestigationSearch("");
    setShowInvestigationSuggestions(false);
  }

  async function savePrescription() {
    if (!selectedVisit || isSaving) return;

    if (!doctor) {
      alert("Doctor profile load nahi hua. Profile error check karein.");
      return;
    }

    if (!diagnosis.trim()) {
      alert("Please enter the diagnosis.");
      return;
    }

    if (medicines.length === 0) {
      alert("Please add at least one medicine.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
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
          throw new Error(
            "Vitals save failed: " + vitalResult.error.message
          );
        }
      }

      const formattedMedicines = medicines
        .map(
          (medicine, index) =>
            `${index + 1}. ${medicine.name} -- [${medicine.dosage}] -- ${medicine.duration} (${medicine.instruction})`
        )
        .join("\n");

      const { data: savedPrescription, error: prescriptionError } =
        await supabase
          .from("prescriptions")
          .insert({
            visit_id: selectedVisit.id,
            doctor_name: doctor.name,
            doctor_qualification: doctor.qualification,
            doctor_reg_no: doctor.reg_no,
            diagnosis: diagnosis.trim(),
            medicines: formattedMedicines,
            investigations: investigations.join("\n"),
            advice: advice.trim(),
          })
          .select("id")
          .single();

      if (prescriptionError) {
        throw new Error(
          "Prescription save failed: " + prescriptionError.message
        );
      }

      if (!savedPrescription?.id) {
        throw new Error("Database did not confirm the saved prescription.");
      }

      const { error: statusError } = await supabase
        .from("visits")
        .update({ status: "completed" })
        .eq("id", selectedVisit.id);

      if (statusError) {
        alert(
          "Prescription saved, but status update failed: " +
            statusError.message
        );
      } else {
        alert("Prescription saved successfully!");
      }

      setDiagnosis("");
      setAdvice("");
      setMedicines([]);
      setInvestigations([]);
      setSelectedVisit(null);

      await loadDoctorQueue();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unexpected error occurred.";

      console.error("Prescription saving error:", err);
      setError(message);
      alert(message);
    } finally {
      setIsSaving(false);
    }
  }

  const filteredMedicines = COMMON_MEDICINES.filter((medicine) =>
    medicine.toLowerCase().includes(medicineSearch.toLowerCase())
  );

  const filteredInvestigations = COMMON_INVESTIGATIONS.filter((item) =>
    item.toLowerCase().includes(investigationSearch.toLowerCase())
  );

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6">
      <header className="rounded-xl border bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-800">
          {doctor ? `Welcome, ${doctor.name}` : "Doctor Dashboard"}
        </h1>

        <p className="mt-1 text-sm text-gray-600">
          Doctor Dashboard &amp; Smart OPD Desk
        </p>

        {doctor && (
          <div className="mt-3 space-y-1 text-sm text-gray-700">
            <p>
              <strong>Qualification:</strong>{" "}
              {doctor.qualification || "Not added"}
            </p>
            <p>
              <strong>Registration No.:</strong>{" "}
              {doctor.reg_no || "Not added"}
            </p>
          </div>
        )}

        {isLoadingProfile && (
          <p className="mt-3 text-sm text-blue-700">
            Loading doctor profile...
          </p>
        )}

        <button
          type="button"
          onClick={() => void loadDoctorProfile()}
          className="mt-3 rounded bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200"
        >
          Reload Doctor Profile
        </button>
      </header>

      {error && (
        <div className="whitespace-pre-wrap rounded-lg border border-red-300 bg-red-50 p-3 text-red-800">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <section className="space-y-3 rounded-xl border bg-white p-4">
          <h2 className="border-b pb-2 text-lg font-bold">
            Today&apos;s Patients
          </h2>

          <p className="text-xs text-gray-500">
            Queue date: {queueDate || "Loading..."}
          </p>

          {isLoadingQueue && (
            <p className="text-sm text-blue-700">Loading queue...</p>
          )}

          {queueMessage && (
            <p className="whitespace-pre-wrap rounded bg-amber-50 p-3 text-sm text-amber-900">
              {queueMessage}
            </p>
          )}

          {visits.length === 0 && !isLoadingQueue && (
            <p className="text-sm text-gray-500">
              No patients in today&apos;s queue.
            </p>
          )}

          {visits.map((visit) => (
            <button
              key={visit.id}
              type="button"
              onClick={() => setSelectedVisit(visit)}
              className={`block w-full rounded-lg border p-3 text-left ${
                selectedVisit?.id === visit.id
                  ? "border-blue-600 bg-blue-50"
                  : "hover:bg-gray-50"
              }`}
            >
              <strong>
                #{visit.queue_no} {visit.patients?.name ?? "Unknown Patient"}
              </strong>
              <p className="mt-1 text-xs">Status: {visit.status}</p>
            </button>
          ))}

          <button
            type="button"
            onClick={() => void loadDoctorQueue()}
            disabled={isLoadingQueue}
            className="w-full rounded bg-gray-100 p-2 text-sm hover:bg-gray-200 disabled:opacity-50"
          >
            {isLoadingQueue ? "Refreshing..." : "Refresh Queue"}
          </button>
        </section>

        <section className="space-y-5 rounded-xl border bg-white p-5 md:col-span-2">
          {selectedVisit ? (
            <>
              <div>
                <h2 className="text-xl font-bold">
                  Token #{selectedVisit.queue_no} —{" "}
                  {selectedVisit.patients?.name ?? "Unknown Patient"}
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
                  className="mt-3 rounded bg-blue-600 px-4 py-2 text-white"
                >
                  Call In
                </button>
              </div>

              <div className="rounded-xl border bg-blue-50 p-4">
                <h3 className="mb-3 font-bold">Patient Vitals</h3>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <input
                    className="min-w-0 rounded border p-2"
                    placeholder="BP (e.g. 120/80)"
                    value={bp}
                    onChange={(event) => setBp(event.target.value)}
                  />

                  <input
                    className="min-w-0 rounded border p-2"
                    type="number"
                    placeholder="Weight (kg)"
                    value={weight}
                    onChange={(event) => setWeight(event.target.value)}
                  />

                  <input
                    className="min-w-0 rounded border p-2"
                    type="number"
                    placeholder="Pulse"
                    value={pulse}
                    onChange={(event) => setPulse(event.target.value)}
                  />

                  <input
                    className="min-w-0 rounded border p-2"
                    type="number"
                    placeholder="SpO2 (%)"
                    value={spo2}
                    onChange={(event) => setSpo2(event.target.value)}
                  />
                </div>

                <p className="mt-2 text-xs text-gray-600">
                  Verify all vital readings before saving.
                </p>
              </div>

              <div className="space-y-5 rounded-xl border bg-slate-50 p-4">
                <h3 className="font-bold">Smart Prescription Builder</h3>

                <div>
                  <label className="text-sm font-semibold">Diagnosis</label>
                  <input
                    className="mt-1 w-full rounded border p-2"
                    value={diagnosis}
                    onChange={(event) => setDiagnosis(event.target.value)}
                    placeholder="Enter diagnosis"
                  />

                  <div className="mt-2 flex flex-wrap gap-2">
                    {COMMON_DIAGNOSES.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setDiagnosis(item)}
                        className="rounded-full bg-gray-200 px-2 py-1 text-xs"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold">Medicines</label>

                  <input
                    className="w-full rounded border p-2"
                    value={medicineSearch}
                    onChange={(event) => {
                      setMedicineSearch(event.target.value);
                      setSelectedMedicine("");
                      setShowMedicineSuggestions(true);
                    }}
                    onFocus={() => setShowMedicineSuggestions(true)}
                    placeholder="Search or type medicine name"
                  />

                  {showMedicineSuggestions && medicineSearch.trim() && (
                    <div className="max-h-48 overflow-y-auto rounded border bg-white">
                      {(filteredMedicines.length
                        ? filteredMedicines
                        : [medicineSearch.trim()]
                      ).map((item) => (
                        <button
                          key={item}
                          type="button"
                          className="block w-full p-2 text-left hover:bg-blue-50"
                          onClick={() => {
                            setSelectedMedicine(item);
                            setMedicineSearch(item);
                            setShowMedicineSuggestions(false);
                          }}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    <select
                      className="rounded border p-2"
                      value={dosage}
                      onChange={(event) => setDosage(event.target.value)}
                    >
                      <option value="1-0-1">1-0-1</option>
                      <option value="1-0-0">1-0-0</option>
                      <option value="0-0-1">0-0-1</option>
                      <option value="1-1-1">1-1-1</option>
                      <option value="SOS">SOS</option>
                      <option value="As directed">As directed</option>
                    </select>

                    <select
                      className="rounded border p-2"
                      value={duration}
                      onChange={(event) => setDuration(event.target.value)}
                    >
                      <option>3 Days</option>
                      <option>5 Days</option>
                      <option>7 Days</option>
                      <option>10 Days</option>
                      <option>14 Days</option>
                      <option>1 Month</option>
                      <option>As directed</option>
                    </select>

                    <select
                      className="rounded border p-2"
                      value={instruction}
                      onChange={(event) => setInstruction(event.target.value)}
                    >
                      <option>After Food</option>
                      <option>Before Food</option>
                      <option>With Water</option>
                      <option>At Bedtime</option>
                      <option>Empty Stomach</option>
                      <option>As directed</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={addMedicine}
                    className="w-full rounded bg-blue-600 p-2 text-white"
                  >
                    + Add Medicine to List
                  </button>
                </div>

                {medicines.map((medicine, index) => (
                  <div
                    key={`${medicine.name}-${index}`}
                    className="flex justify-between gap-2 border-b py-2 text-sm"
                  >
                    <span>
                      {index + 1}. {medicine.name} — {medicine.dosage} —{" "}
                      {medicine.duration} — {medicine.instruction}
                    </span>

                    <button
                      type="button"
                      className="text-red-600"
                      onClick={() =>
                        setMedicines((previous) =>
                          previous.filter((_, i) => i !== index)
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}

                <div className="space-y-3 border-t pt-4">
                  <h3 className="text-lg font-bold">Investigations</h3>

                  <input
                    className="w-full rounded border p-2"
                    value={investigationSearch}
                    onChange={(event) => {
                      setInvestigationSearch(event.target.value);
                      setShowInvestigationSuggestions(true);
                    }}
                    onFocus={() => setShowInvestigationSuggestions(true)}
                    placeholder="Search CBC, LFT, KFT, HbA1c, ECG..."
                  />

                  {showInvestigationSuggestions &&
                    investigationSearch.trim() && (
                      <div className="max-h-48 overflow-y-auto rounded border bg-white">
                        {(filteredInvestigations.length
                          ? filteredInvestigations
                          : [investigationSearch.trim()]
                        ).map((item) => (
                          <button
                            key={item}
                            type="button"
                            className="block w-full p-2 text-left hover:bg-blue-50"
                            onClick={() => addInvestigation(item)}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    )}

                  <button
                    type="button"
                    onClick={() => addInvestigation()}
                    className="w-full rounded bg-indigo-600 p-2 text-white"
                  >
                    + Add Investigation
                  </button>

                  {investigations.map((item, index) => (
                    <div
                      key={`${item}-${index}`}
                      className="flex items-center justify-between gap-3 rounded border p-2"
                    >
                      <span>
                        {index + 1}. {item}
                      </span>

                      <button
                        type="button"
                        className="text-red-600"
                        onClick={() =>
                          setInvestigations((previous) =>
                            previous.filter((_, i) => i !== index)
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>

                <div>
                  <label className="text-sm font-semibold">Advice / Notes</label>
                  <textarea
                    className="mt-1 w-full rounded border p-2"
                    rows={3}
                    value={advice}
                    onChange={(event) => setAdvice(event.target.value)}
                    placeholder="Advice for patient"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => void savePrescription()}
                  disabled={isSaving || !doctor}
                  className="w-full rounded-xl bg-emerald-600 p-3 font-bold text-white disabled:opacity-50"
                >
                  {isSaving
                    ? "Saving..."
                    : "Save Prescription & Send to Reception"}
                </button>
              </div>
            </>
          ) : (
            <p className="rounded-lg bg-amber-50 p-4">
              Select a patient from the queue to write a prescription.
            </p>
          )}

          <div>
            <h3 className="mb-2 font-semibold">Doctor Live Video Stream</h3>
            <p className="mb-2 text-xs text-gray-500">
              Keep this page open during consultation to publish the doctor's webcam stream.
            </p>
            <iframe
              src={videoUrl}
              title="Doctor Live Video Stream"
              className="h-[280px] w-full rounded-xl border-0 bg-black"
              allow="camera; microphone; display-capture; autoplay; encrypted-media"
            />
          </div>
        </section>
      </div>
    </main>
  );
}
