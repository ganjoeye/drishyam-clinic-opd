
"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Patient = {
  id: string;
  name: string;
  age: number | null;
  gender: string | null;
  phone: string | null;
  patient_code: string | null;
};

type Vital = {
  id?: string;
  visit_id?: string;
  bp: string | null;
  pulse: number | null;
  spo2: number | null;
  weight: number | null;
  temperature: number | null;
  blood_sugar: number | null;
};

type Prescription = {
  id: string;
  diagnosis: string | null;
  medicines: unknown;
  investigations: string | null;
  advice: string | null;
  notes: string | null;
  doctor_name: string | null;
  doctor_qualification: string | null;
  doctor_reg_no: string | null;
};

type Visit = {
  id: string;
  patient_id: string;
  queue_no: number;
  status: string;
  visit_date: string;
  video_link: string | null;
  patients: Patient | null;
  vitals: Vital | null;
  prescriptions: Prescription[];
};

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
};

const emptyVitals = {
  bp: "",
  pulse: "",
  spo2: "",
  weight: "",
  temperature: "",
  blood_sugar: "",
};

function showError(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error
  ) {
    return String(error.message);
  }
  return "Something went wrong. Please try again.";
}

function safeText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

export default function ReceptionPage() {
  const [queue, setQueue] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [patientName, setPatientName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("Male");
  const [phone, setPhone] = useState("");
  const [vitals, setVitals] = useState(emptyVitals);

  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(
    null
  );
  const [searching, setSearching] = useState(false);

  const [historyPatient, setHistoryPatient] = useState<Patient | null>(null);
  const [historyVisits, setHistoryVisits] = useState<Visit[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [sendingVisitId, setSendingVisitId] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError("");

    const { data, error: fetchError } = await supabase
      .from("visits")
      .select(`
        id,
        patient_id,
        queue_no,
        status,
        visit_date,
        video_link,
        patients (
          id,
          name,
          age,
          gender,
          phone,
          patient_code
        ),
        vitals (
          id,
          visit_id,
          bp,
          pulse,
          spo2,
          weight,
          temperature,
          blood_sugar
        ),
        prescriptions (
          id,
          diagnosis,
          medicines,
          investigations,
          advice,
          notes,
          doctor_name,
          doctor_qualification,
          doctor_reg_no
        )
      `)
      .eq("visit_date", today())
      .order("queue_no", { ascending: true });

    if (fetchError) {
      setError(showError(fetchError));
      setQueue([]);
    } else {
      const rows = (data ?? []).map((row: any) => ({
        ...row,
        patients: Array.isArray(row.patients)
          ? row.patients[0] ?? null
          : row.patients,
        vitals: Array.isArray(row.vitals)
          ? row.vitals[0] ?? null
          : row.vitals,
        prescriptions: Array.isArray(row.prescriptions)
          ? row.prescriptions
          : row.prescriptions
            ? [row.prescriptions]
            : [],
      })) as Visit[];

      setQueue(rows);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadQueue();

    const channel = supabase
      .channel("reception-live-queue")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "visits" },
        () => void loadQueue()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vitals" },
        () => void loadQueue()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "prescriptions" },
        () => void loadQueue()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadQueue]);

  function updateVital(
    field: keyof typeof emptyVitals,
    value: string
  ) {
    setVitals((previous) => ({ ...previous, [field]: value }));
  }

  function resetForm() {
    setPatientName("");
    setAge("");
    setGender("Male");
    setPhone("");
    setVitals(emptyVitals);
    setSelectedPatient(null);
    setSearchText("");
    setSearchResults([]);
  }

  async function searchPatients() {
    const term = searchText.trim();

    if (term.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    setError("");

    const { data, error: searchError } = await supabase
      .from("patients")
      .select("id,name,age,gender,phone,patient_code")
      .or(
        `name.ilike.%${term}%,phone.ilike.%${term}%,patient_code.ilike.%${term}%`
      )
      .limit(10);

    if (searchError) {
      setError(showError(searchError));
      setSearchResults([]);
    } else {
      setSearchResults((data ?? []) as Patient[]);
    }

    setSearching(false);
  }

  function choosePatient(patient: Patient) {
    setSelectedPatient(patient);
    setPatientName(patient.name);
    setAge(patient.age?.toString() ?? "");
    setGender(patient.gender ?? "Male");
    setPhone(patient.phone ?? "");
    setSearchResults([]);
    setMessage(`Selected patient: ${patient.name}`);
  }

  function numericOrNull(value: string) {
    return value.trim() === "" ? null : Number(value);
  }

  async function registerPatient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!patientName.trim()) {
      setError("Please enter patient name.");
      return;
    }

    if (age.trim() && (!Number.isFinite(Number(age)) || Number(age) < 0)) {
      setError("Please enter a valid age.");
      return;
    }

    const numericFields = [
      ["Pulse", vitals.pulse],
      ["SpO₂", vitals.spo2],
      ["Weight", vitals.weight],
      ["Temperature", vitals.temperature],
      ["Blood Sugar", vitals.blood_sugar],
    ] as const;

    for (const [label, value] of numericFields) {
      if (value.trim() !== "" && !Number.isFinite(Number(value))) {
        setError(`${label} must be a valid number.`);
        return;
      }
    }

    if (
      vitals.temperature.trim() &&
      (Number(vitals.temperature) < 25 ||
        Number(vitals.temperature) > 45)
    ) {
      setError("Please enter a valid temperature between 25°C and 45°C.");
      return;
    }

    setSaving(true);

    try {
      let patientId = selectedPatient?.id;

      if (!patientId) {
        const { data: newPatient, error: patientError } = await supabase
          .from("patients")
          .insert({
            name: patientName.trim(),
            age: numericOrNull(age),
            gender,
            phone: phone.trim() || null,
          })
          .select("id")
          .single();

        if (patientError) throw patientError;
        patientId = newPatient.id;
      }

      const { data: previousVisits, error: queueError } = await supabase
        .from("visits")
        .select("queue_no")
        .eq("visit_date", today())
        .order("queue_no", { ascending: false })
        .limit(1);

      if (queueError) throw queueError;

      const nextQueue =
        (previousVisits?.[0]?.queue_no ?? 0) + 1;

      const { data: newVisit, error: visitError } = await supabase
        .from("visits")
        .insert({
          patient_id: patientId,
          queue_no: nextQueue,
          status: "waiting",
          visit_date: today(),
        })
        .select("id")
        .single();

      if (visitError) throw visitError;

      const hasVitals = Object.values(vitals).some(
        (value) => value.trim() !== ""
      );

      if (hasVitals) {
        const { error: vitalsError } = await supabase
          .from("vitals")
          .insert({
            visit_id: newVisit.id,
            bp: vitals.bp.trim() || null,
            pulse: numericOrNull(vitals.pulse),
            spo2: numericOrNull(vitals.spo2),
            weight: numericOrNull(vitals.weight),
            temperature: numericOrNull(vitals.temperature),
            blood_sugar: numericOrNull(vitals.blood_sugar),
          });

        if (vitalsError) throw vitalsError;
      }

      setMessage(
        `Patient registered successfully. Queue token: ${nextQueue}`
      );
      resetForm();
      await loadQueue();
    } catch (err) {
      setError(showError(err));
    } finally {
      setSaving(false);
    }
  }

  async function sendToPatientRoom(visit: Visit) {
    setSendingVisitId(visit.id);
    setError("");
    setMessage("");

    const { error: updateError } = await supabase
      .from("visits")
      .update({ status: "in-consultation" })
      .eq("id", visit.id);

    if (updateError) {
      setError(showError(updateError));
    } else {
      setMessage(
        `Queue #${visit.queue_no} sent to Patient Room.`
      );
      await loadQueue();
    }

    setSendingVisitId(null);
  }

  async function loadPatientHistory(patient: Patient) {
    setHistoryPatient(patient);
    setHistoryVisits([]);
    setHistoryLoading(true);
    setError("");

    const { data, error: historyError } = await supabase
      .from("visits")
      .select(`
        id,
        patient_id,
        queue_no,
        status,
        visit_date,
        video_link,
        patients (
          id,
          name,
          age,
          gender,
          phone,
          patient_code
        ),
        vitals (
          id,
          visit_id,
          bp,
          pulse,
          spo2,
          weight,
          temperature,
          blood_sugar
        ),
        prescriptions (
          id,
          diagnosis,
          medicines,
          investigations,
          advice,
          notes,
          doctor_name,
          doctor_qualification,
          doctor_reg_no
        )
      `)
      .eq("patient_id", patient.id)
      .order("visit_date", { ascending: false });

    if (historyError) {
      setError(showError(historyError));
    } else {
      const rows = (data ?? []).map((row: any) => ({
        ...row,
        patients: Array.isArray(row.patients)
          ? row.patients[0] ?? null
          : row.patients,
        vitals: Array.isArray(row.vitals)
          ? row.vitals[0] ?? null
          : row.vitals,
        prescriptions: Array.isArray(row.prescriptions)
          ? row.prescriptions
          : row.prescriptions
            ? [row.prescriptions]
            : [],
      })) as Visit[];

      setHistoryVisits(rows);
    }

    setHistoryLoading(false);
  }

  function printVisit(visit: Visit) {
    const patient = visit.patients;
    const vital = visit.vitals;
    const prescriptions = visit.prescriptions ?? [];

    const prescriptionHtml = prescriptions.length
      ? prescriptions
          .map(
            (p) => `
              <div class="prescription">
                <h3>Prescription</h3>
                <p><b>Diagnosis:</b> ${safeText(p.diagnosis)}</p>
                <p><b>Medicines / Dosage / Duration:</b></p>
                <pre>${safeText(p.medicines)}</pre>
                <p><b>Investigations:</b></p>
                <pre>${safeText(p.investigations)}</pre>
                <p><b>Advice:</b> ${safeText(p.advice ?? p.notes)}</p>
                <hr />
                <p><b>Doctor:</b> ${safeText(p.doctor_name)}</p>
                <p><b>Qualification:</b> ${safeText(p.doctor_qualification)}</p>
                <p><b>Registration No.:</b> ${safeText(p.doctor_reg_no)}</p>
              </div>
            `
          )
          .join("")
      : "<p>No prescription saved for this visit.</p>";

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Patient Prescription</title>
        <style>
          body { font-family: Arial, sans-serif; color: #111; padding: 24px; }
          h1 { text-align: center; margin-bottom: 4px; }
          h2 { text-align: center; margin-top: 0; font-size: 16px; }
          h3 { margin-bottom: 8px; }
          .line { border-top: 1px solid #333; margin: 14px 0; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
          .prescription { margin-top: 20px; }
          pre { white-space: pre-wrap; font-family: Arial, sans-serif; }
          @media print { button { display: none; } body { padding: 10px; } }
        </style>
      </head>
      <body>
        <h1>DRISHYAM CLINIC</h1>
        <h2>Patient Consultation Record</h2>
        <div class="line"></div>
        <div class="grid">
          <p><b>Patient:</b> ${safeText(patient?.name)}</p>
          <p><b>Patient ID:</b> ${safeText(patient?.patient_code)}</p>
          <p><b>Age / Gender:</b> ${safeText(patient?.age)} / ${safeText(patient?.gender)}</p>
          <p><b>Phone:</b> ${safeText(patient?.phone)}</p>
          <p><b>Date:</b> ${safeText(visit.visit_date)}</p>
          <p><b>Queue Token:</b> #${safeText(visit.queue_no)}</p>
        </div>
        <div class="line"></div>
        <h3>Vitals</h3>
        <div class="grid">
          <p><b>BP:</b> ${safeText(vital?.bp)}</p>
          <p><b>Pulse:</b> ${safeText(vital?.pulse)}</p>
          <p><b>SpO₂:</b> ${vital?.spo2 != null ? `${vital.spo2}%` : "—"}</p>
          <p><b>Weight:</b> ${vital?.weight != null ? `${vital.weight} kg` : "—"}</p>
          <p><b>Temperature:</b> ${vital?.temperature != null ? `${vital.temperature} °C` : "—"}</p>
          <p><b>Blood Sugar:</b> ${vital?.blood_sugar != null ? `${vital.blood_sugar} mg/dL` : "—"}</p>
        </div>
        <div class="line"></div>
        ${prescriptionHtml}
        <script>window.onload = () => window.print();</script>
      </body>
      </html>
    `;

    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      setError("Please allow pop-ups to print the prescription.");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-900 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Reception Dashboard</h1>
            <p className="text-sm text-slate-600">
              Drishyam Clinic · {today()}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadQueue()}
            className="rounded-lg bg-slate-800 px-4 py-2 text-white"
          >
            Refresh Queue
          </button>
        </header>

        {message && (
          <div className="rounded-lg bg-green-100 p-3 text-green-800">
            {message}
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-100 p-3 text-red-800">
            {error}
          </div>
        )}

        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-bold">
            Search Existing Patient
          </h2>

          <div className="flex flex-wrap gap-2">
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void searchPatients();
              }}
              placeholder="Name, phone number or Patient ID"
              className="min-w-60 flex-1 rounded-lg border p-3"
            />
            <button
              type="button"
              onClick={() => void searchPatients()}
              disabled={searching}
              className="rounded-lg bg-blue-700 px-5 py-3 text-white disabled:opacity-50"
            >
              {searching ? "Searching..." : "Search"}
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="mt-3 space-y-2">
              {searchResults.map((patient) => (
                <button
                  type="button"
                  key={patient.id}
                  onClick={() => choosePatient(patient)}
                  className="block w-full rounded-lg border p-3 text-left hover:bg-slate-50"
                >
                  <b>{patient.name}</b>
                  <span className="ml-2 text-sm text-slate-600">
                    {patient.patient_code ?? "No Patient ID"} · Age:{" "}
                    {patient.age ?? "—"} · {patient.phone ?? "No phone"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-bold">
            {selectedPatient ? "Register Repeat Visit" : "New Patient Registration"}
          </h2>

          {selectedPatient && (
            <div className="mb-4 rounded-lg bg-blue-50 p-3">
              Selected: <b>{selectedPatient.name}</b> ·{" "}
              {selectedPatient.patient_code}
              <button
                type="button"
                onClick={resetForm}
                className="ml-3 text-sm font-semibold text-red-700"
              >
                Clear selection
              </button>
            </div>
          )}

          <form onSubmit={registerPatient} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <label className="text-sm font-medium">
                Patient Name *
                <input
                  required
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  className="mt-1 w-full rounded-lg border p-3"
                  placeholder="Full name"
                />
              </label>

              <label className="text-sm font-medium">
                Age
                <input
                  type="number"
                  min="0"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="mt-1 w-full rounded-lg border p-3"
                  placeholder="Age"
                />
              </label>

              <label className="text-sm font-medium">
                Gender
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="mt-1 w-full rounded-lg border p-3"
                >
                  <option>Male</option>
                  <option>Female</option>
                  <option>Other</option>
                </select>
              </label>

              <label className="text-sm font-medium">
                Phone Number
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 w-full rounded-lg border p-3"
                  placeholder="Mobile number"
                />
              </label>
            </div>

            <div>
              <h3 className="mb-3 text-lg font-semibold">Patient Vitals</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-sm font-medium">
                  Blood Pressure (mmHg)
                  <input
                    value={vitals.bp}
                    onChange={(e) => updateVital("bp", e.target.value)}
                    className="mt-1 w-full rounded-lg border p-3"
                    placeholder="120/80"
                  />
                </label>

                <label className="text-sm font-medium">
                  Pulse (bpm)
                  <input
                    type="number"
                    value={vitals.pulse}
                    onChange={(e) => updateVital("pulse", e.target.value)}
                    className="mt-1 w-full rounded-lg border p-3"
                    placeholder="72"
                  />
                </label>

                <label className="text-sm font-medium">
                  SpO₂ (%)
                  <input
                    type="number"
                    value={vitals.spo2}
                    onChange={(e) => updateVital("spo2", e.target.value)}
                    className="mt-1 w-full rounded-lg border p-3"
                    placeholder="98"
                  />
                </label>

                <label className="text-sm font-medium">
                  Weight (kg)
                  <input
                    type="number"
                    step="0.1"
                    value={vitals.weight}
                    onChange={(e) => updateVital("weight", e.target.value)}
                    className="mt-1 w-full rounded-lg border p-3"
                    placeholder="65"
                  />
                </label>

                <label className="text-sm font-medium">
                  Temperature (°C)
                  <input
                    type="number"
                    min="25"
                    max="45"
                    step="0.1"
                    value={vitals.temperature}
                    onChange={(e) =>
                      updateVital("temperature", e.target.value)
                    }
                    className="mt-1 w-full rounded-lg border p-3"
                    placeholder="37.0"
                  />
                </label>

                <label className="text-sm font-medium">
                  Blood Sugar (mg/dL)
                  <input
                    type="number"
                    step="0.1"
                    value={vitals.blood_sugar}
                    onChange={(e) =>
                      updateVital("blood_sugar", e.target.value)
                    }
                    className="mt-1 w-full rounded-lg border p-3"
                    placeholder="100"
                  />
                </label>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-green-700 px-6 py-3 font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Registering..." : "Register Patient"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border px-6 py-3"
              >
                Reset Form
              </button>
            </div>
          </form>
        </section>

        {historyPatient && (
          <section className="rounded-xl bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">Patient History</h2>
                <p className="text-sm text-slate-600">
                  {historyPatient.name} — {historyPatient.patient_code}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setHistoryPatient(null);
                  setHistoryVisits([]);
                }}
                className="rounded-lg border px-3 py-2"
              >
                Close History
              </button>
            </div>

            {historyLoading ? (
              <p className="mt-4">Loading patient history...</p>
            ) : historyVisits.length === 0 ? (
              <p className="mt-4 rounded-lg bg-slate-50 p-4">
                No previous visits found for this patient.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {historyVisits.map((visit) => (
                  <article
                    key={visit.id}
                    className="rounded-lg border p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="font-bold">
                          {visit.visit_date} — Queue #{visit.queue_no}
                        </h3>
                        <p className="text-sm">
                          Status: {visit.status}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => printVisit(visit)}
                        className="rounded-lg bg-green-700 px-3 py-2 text-white"
                      >
                        View / Print
                      </button>
                    </div>

                    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                      <p>BP: {visit.vitals?.bp ?? "—"}</p>
                      <p>Pulse: {visit.vitals?.pulse ?? "—"}</p>
                      <p>
                        SpO₂:{" "}
                        {visit.vitals?.spo2 != null
                          ? `${visit.vitals.spo2}%`
                          : "—"}
                      </p>
                      <p>
                        Weight:{" "}
                        {visit.vitals?.weight != null
                          ? `${visit.vitals.weight} kg`
                          : "—"}
                      </p>
                      <p>
                        Temperature:{" "}
                        {visit.vitals?.temperature != null
                          ? `${visit.vitals.temperature} °C`
                          : "—"}
                      </p>
                      <p>
                        Blood Sugar:{" "}
                        {visit.vitals?.blood_sugar != null
                          ? `${visit.vitals.blood_sugar} mg/dL`
                          : "—"}
                      </p>
                    </div>

                    {visit.prescriptions.length === 0 ? (
                      <p className="mt-3 text-sm text-slate-500">
                        No prescription saved for this visit.
                      </p>
                    ) : (
                      visit.prescriptions.map((p, index) => (
                        <div
                          key={p.id ?? `${visit.id}-${index}`}
                          className="mt-3 space-y-2 border-t pt-3 text-sm"
                        >
                          <p>
                            <b>Diagnosis:</b> {safeText(p.diagnosis)}
                          </p>
                          <p><b>Medicines:</b></p>
                          <pre className="whitespace-pre-wrap font-sans">
                            {safeText(p.medicines)}
                          </pre>
                          <p><b>Investigations:</b></p>
                          <pre className="whitespace-pre-wrap font-sans">
                            {safeText(p.investigations)}
                          </pre>
                          <p>
                            <b>Advice:</b>{" "}
                            {safeText(p.advice ?? p.notes)}
                          </p>
                          <p><b>Doctor:</b> {safeText(p.doctor_name)}</p>
                          <p>
                            <b>Qualification:</b>{" "}
                            {safeText(p.doctor_qualification)}
                          </p>
                          <p>
                            <b>Registration No.:</b>{" "}
                            {safeText(p.doctor_reg_no)}
                          </p>
                        </div>
                      ))
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold">
            Today&apos;s Queue ({queue.length})
          </h2>

          {loading ? (
            <p>Loading queue...</p>
          ) : queue.length === 0 ? (
            <p className="rounded-lg bg-slate-50 p-4">
              No patients in today&apos;s queue.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="p-3">Queue</th>
                    <th className="p-3">Patient ID</th>
                    <th className="p-3">Patient</th>
                    <th className="p-3">Age/Gender</th>
                    <th className="p-3">Phone</th>
                    <th className="p-3">BP</th>
                    <th className="p-3">Pulse</th>
                    <th className="p-3">SpO₂</th>
                    <th className="p-3">Weight</th>
                    <th className="p-3">Temperature</th>
                    <th className="p-3">Blood Sugar</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((visit) => (
                    <tr key={visit.id} className="border-b last:border-0">
                      <td className="p-3 font-semibold">
                        #{visit.queue_no}
                      </td>
                      <td className="p-3">
                        {visit.patients?.patient_code ?? "—"}
                      </td>
                      <td className="p-3">
                        {visit.patients?.name ?? "Unknown"}
                      </td>
                      <td className="p-3">
                        {visit.patients?.age ?? "—"} /{" "}
                        {visit.patients?.gender ?? "—"}
                      </td>
                      <td className="p-3">
                        {visit.patients?.phone ?? "—"}
                      </td>
                      <td className="p-3">{visit.vitals?.bp ?? "—"}</td>
                      <td className="p-3">
                        {visit.vitals?.pulse ?? "—"}
                      </td>
                      <td className="p-3">
                        {visit.vitals?.spo2 != null
                          ? `${visit.vitals.spo2}%`
                          : "—"}
                      </td>
                      <td className="p-3">
                        {visit.vitals?.weight != null
                          ? `${visit.vitals.weight} kg`
                          : "—"}
                      </td>
                      <td className="p-3">
                        {visit.vitals?.temperature != null
                          ? `${visit.vitals.temperature} °C`
                          : "—"}
                      </td>
                      <td className="p-3">
                        {visit.vitals?.blood_sugar != null
                          ? `${visit.vitals.blood_sugar} mg/dL`
                          : "—"}
                      </td>
                      <td className="p-3">{visit.status}</td>
                      <td className="p-3">
                        <div className="flex flex-col gap-2">
                          {visit.status === "waiting" && (
                            <button
                              type="button"
                              disabled={sendingVisitId !== null}
                              onClick={() =>
                                void sendToPatientRoom(visit)
                              }
                              className="rounded-lg bg-blue-700 px-3 py-2 text-white disabled:opacity-50"
                            >
                              {sendingVisitId === visit.id
                                ? "Sending..."
                                : "Send to Patient Room"}
                            </button>
                          )}

                          {visit.status === "in-consultation" && (
                            <span className="rounded-lg bg-emerald-100 px-3 py-2 text-center text-emerald-800">
                              In Patient Room
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => printVisit(visit)}
                            className="rounded-lg bg-green-700 px-3 py-2 text-white"
                          >
                            View / Print
                          </button>

                          {visit.patients && (
                            <button
                              type="button"
                              onClick={() =>
                                void loadPatientHistory(visit.patients!)
                              }
                              className="rounded-lg bg-slate-700 px-3 py-2 text-white"
                            >
                              History
                            </button>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {visit.prescriptions.length
                            ? `${visit.prescriptions.length} saved prescription(s)`
                            : "No prescription yet"}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-bold">Doctor&apos;s Prescriptions</h2>

          {queue.filter((v) => v.prescriptions.length > 0).length === 0 ? (
            <div className="rounded-xl bg-white p-5 text-slate-600 shadow-sm">
              No saved prescriptions found for today.
            </div>
          ) : (
            queue
              .filter((v) => v.prescriptions.length > 0)
              .map((visit) => (
                <article
                  key={visit.id}
                  className="rounded-xl bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold">
                        Queue #{visit.queue_no} —{" "}
                        {visit.patients?.name ?? "Unknown"}
                      </h3>
                      <p className="text-sm text-slate-500">
                        Patient ID:{" "}
                        {visit.patients?.patient_code ?? "—"} | Status:{" "}
                        {visit.status}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => printVisit(visit)}
                      className="rounded-lg bg-green-700 px-4 py-2 text-white"
                    >
                      Print Prescription
                    </button>
                  </div>

                  {visit.prescriptions.map((p, index) => (
                    <div
                      key={p.id ?? `${visit.id}-${index}`}
                      className="mt-4 space-y-3 border-t pt-4"
                    >
                      <div>
                        <h4 className="font-semibold">Diagnosis</h4>
                        <p className="whitespace-pre-wrap">
                          {safeText(p.diagnosis)}
                        </p>
                      </div>
                      <div>
                        <h4 className="font-semibold">
                          Medicines / Dosage / Duration / Instructions
                        </h4>
                        <pre className="whitespace-pre-wrap font-sans">
                          {safeText(p.medicines)}
                        </pre>
                      </div>
                      <div>
                        <h4 className="font-semibold">Investigations</h4>
                        <pre className="whitespace-pre-wrap font-sans">
                          {safeText(p.investigations)}
                        </pre>
                      </div>
                      <div>
                        <h4 className="font-semibold">Advice / Notes</h4>
                        <p className="whitespace-pre-wrap">
                          {safeText(p.advice ?? p.notes)}
                        </p>
                      </div>
                      <div>
                        <h4 className="font-semibold">Doctor Details</h4>
                        <p>Name: {safeText(p.doctor_name)}</p>
                        <p>
                          Qualification:{" "}
                          {safeText(p.doctor_qualification)}
                        </p>
                        <p>
                          Registration No.: {safeText(p.doctor_reg_no)}
                        </p>
                      </div>
                    </div>
                  ))}
                </article>
              ))
          )}
        </section>
      </div>
    </main>
  );
}
