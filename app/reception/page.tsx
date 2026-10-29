
"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Patient = {
  id: string;
  patient_code: string;
  name: string;
  age: number | null;
  gender: string | null;
  phone: string | null;
};

type Vital = {
  id: string;
  visit_id: string;
  bp: string | null;
  weight: number | null;
  pulse: number | null;
  spo2: number | null;
  temperature?: number | null;
};

type Prescription = {
  id?: string;
  visit_id?: string;
  diagnosis?: string | null;
  medicines?: unknown;
  investigations?: string | null;
  advice?: string | null;
  notes?: string | null;
  doctor_name?: string | null;
  doctor_qualification?: string | null;
  doctor_reg_no?: string | null;
  created_at?: string;
};

type Visit = {
  id: string;
  queue_no: number;
  visit_date: string;
  status: string;
  patients: Patient | null;
  vitals: Vital | null;
  prescriptions: Prescription[];
};

function getLocalDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
}

function readableError(err: unknown) {
  if (typeof err === "object" && err !== null && "message" in err) {
    return String(err.message);
  }
  return String(err);
}

function safeText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export default function ReceptionPage() {
  const [today, setToday] = useState("");

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("Male");
  const [phone, setPhone] = useState("");

  const [bp, setBp] = useState("");
  const [pulse, setPulse] = useState("");
  const [spo2, setSpo2] = useState("");
  const [weight, setWeight] = useState("");

  const [queue, setQueue] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  const [historyPatient, setHistoryPatient] = useState<Patient | null>(null);
  const [historyVisits, setHistoryVisits] = useState<Visit[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!today) return;

    try {
      const { data: visitData, error: visitError } = await supabase
        .from("visits")
        .select(
          "id, queue_no, visit_date, status, patients(id, patient_code, name, age, gender, phone)"
        )
        .eq("visit_date", today)
        .order("queue_no", { ascending: true });

      if (visitError) throw new Error("Visits: " + visitError.message);

      const visits = (visitData ?? []) as unknown as Omit<
        Visit,
        "vitals" | "prescriptions"
      >[];

      const ids = visits.map((v) => v.id);
      let vitalRows: Vital[] = [];
      let prescriptionRows: Prescription[] = [];

      if (ids.length > 0) {
        const { data: vitalData, error: vitalError } = await supabase
          .from("vitals")
          .select("id, visit_id, bp, weight, pulse, spo2, temperature")
          .in("visit_id", ids);

        if (vitalError) throw new Error("Vitals: " + vitalError.message);
        vitalRows = (vitalData ?? []) as Vital[];

        const { data: prescriptionData, error: prescriptionError } =
          await supabase
            .from("prescriptions")
            .select("*")
            .in("visit_id", ids);

        if (prescriptionError) {
          throw new Error("Prescriptions: " + prescriptionError.message);
        }

        prescriptionRows = (prescriptionData ?? []) as Prescription[];
      }

      setQueue(
        visits.map((visit) => ({
          ...visit,
          vitals: vitalRows.find((v) => v.visit_id === visit.id) ?? null,
          prescriptions: prescriptionRows.filter(
            (p) => p.visit_id === visit.id
          ),
        }))
      );

      setError("");
    } catch (err) {
      console.error("Reception load error:", err);
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    setToday(getLocalDate());
  }, []);

  useEffect(() => {
    if (!today) return;

    void loadData();

    const interval = window.setInterval(() => void loadData(), 15000);

    const channel = supabase
      .channel("reception-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "visits" },
        () => void loadData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vitals" },
        () => void loadData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "prescriptions" },
        () => void loadData()
      )
      .subscribe();

    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [today, loadData]);

  function resetVitals() {
    setBp("");
    setPulse("");
    setSpo2("");
    setWeight("");
  }

  function clearSelectedPatient() {
    setSelectedPatient(null);
    setName("");
    setAge("");
    setGender("Male");
    setPhone("");
    resetVitals();
  }

  async function searchPatients() {
    const term = searchTerm.trim();

    setError("");
    setMessage("");
    setSelectedPatient(null);

    if (!term) {
      setError("Patient ID, mobile number, ya name enter karo.");
      return;
    }

    setSearching(true);

    try {
      const [codeResult, phoneResult, nameResult] = await Promise.all([
        supabase
          .from("patients")
          .select("id, patient_code, name, age, gender, phone")
          .ilike("patient_code", `%${term}%`)
          .limit(20),
        supabase
          .from("patients")
          .select("id, patient_code, name, age, gender, phone")
          .ilike("phone", `%${term}%`)
          .limit(20),
        supabase
          .from("patients")
          .select("id, patient_code, name, age, gender, phone")
          .ilike("name", `%${term}%`)
          .limit(20),
      ]);

      const queryError =
        codeResult.error || phoneResult.error || nameResult.error;

      if (queryError) throw new Error(queryError.message);

      const combined = [
        ...(codeResult.data ?? []),
        ...(phoneResult.data ?? []),
        ...(nameResult.data ?? []),
      ] as Patient[];

      const unique = Array.from(
        new Map(combined.map((p) => [p.id, p])).values()
      );

      setSearchResults(unique);

      if (unique.length === 0) {
        setMessage(
          "Existing patient nahi mila. Neeche form se new patient register kar sakte ho."
        );
      }
    } catch (err) {
      setError("Patient search failed: " + readableError(err));
    } finally {
      setSearching(false);
    }
  }

  function selectExistingPatient(patient: Patient) {
    setSelectedPatient(patient);
    setName(patient.name);
    setAge(patient.age === null ? "" : String(patient.age));
    setGender(patient.gender || "Other");
    setPhone(patient.phone || "");
    setSearchResults([]);
    setMessage(`Selected patient: ${patient.patient_code}`);
    setError("");
  }

  async function loadPatientHistory(patient: Patient) {
    setHistoryPatient(patient);
    setHistoryVisits([]);
    setHistoryLoading(true);
    setError("");

    try {
      const { data: visitData, error: visitError } = await supabase
        .from("visits")
        .select(
          "id, queue_no, visit_date, status, patients(id, patient_code, name, age, gender, phone)"
        )
        .eq("patient_id", patient.id)
        .order("visit_date", { ascending: false });

      if (visitError) throw new Error(visitError.message);

      const visits = (visitData ?? []) as unknown as Omit<
        Visit,
        "vitals" | "prescriptions"
      >[];

      const ids = visits.map((v) => v.id);
      let vitalRows: Vital[] = [];
      let prescriptionRows: Prescription[] = [];

      if (ids.length > 0) {
        const [vitalsResult, prescriptionsResult] = await Promise.all([
          supabase
            .from("vitals")
            .select("id, visit_id, bp, weight, pulse, spo2, temperature")
            .in("visit_id", ids),
          supabase.from("prescriptions").select("*").in("visit_id", ids),
        ]);

        if (vitalsResult.error) throw new Error(vitalsResult.error.message);

        if (prescriptionsResult.error) {
          throw new Error(prescriptionsResult.error.message);
        }

        vitalRows = (vitalsResult.data ?? []) as Vital[];
        prescriptionRows = (prescriptionsResult.data ?? []) as Prescription[];
      }

      setHistoryVisits(
        visits.map((visit) => ({
          ...visit,
          vitals: vitalRows.find((v) => v.visit_id === visit.id) ?? null,
          prescriptions: prescriptionRows.filter(
            (p) => p.visit_id === visit.id
          ),
        }))
      );
    } catch (err) {
      setError("Patient history failed: " + readableError(err));
    } finally {
      setHistoryLoading(false);
    }
  }

  async function createVisit(patientId: string) {
    const visitDate = getLocalDate();

    const { data: latest, error: latestError } = await supabase
      .from("visits")
      .select("queue_no")
      .eq("visit_date", visitDate)
      .order("queue_no", { ascending: false })
      .limit(1);

    if (latestError) throw new Error("Queue number: " + latestError.message);

    const nextQueue = (latest?.[0]?.queue_no ?? 0) + 1;

    const { data: visit, error: visitError } = await supabase
      .from("visits")
      .insert({
        patient_id: patientId,
        visit_date: visitDate,
        queue_no: nextQueue,
        status: "waiting",
      })
      .select("id")
      .single();

    if (visitError) throw new Error("Visit: " + visitError.message);

    const hasVitals = Boolean(
      bp.trim() || pulse.trim() || spo2.trim() || weight.trim()
    );

    if (hasVitals) {
      const { error: vitalError } = await supabase.from("vitals").insert({
        visit_id: visit.id,
        bp: bp.trim() || null,
        pulse: pulse.trim() ? Number(pulse) : null,
        spo2: spo2.trim() ? Number(spo2) : null,
        weight: weight.trim() ? Number(weight) : null,
      });

      if (vitalError) {
        throw new Error(
          `Visit #${nextQueue} created, but vitals could not be saved: ${vitalError.message}`
        );
      }
    }

    return nextQueue;
  }

  async function addPatient(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!name.trim()) {
      setError("Please enter the patient's name.");
      return;
    }

    for (const [label, value] of [
      ["Age", age],
      ["Pulse", pulse],
      ["SpO2", spo2],
      ["Weight", weight],
    ]) {
      if (
        value.trim() &&
        (!Number.isFinite(Number(value)) || Number(value) < 0)
      ) {
        setError(`Please enter a valid ${label}.`);
        return;
      }
    }

    if (spo2.trim() && Number(spo2) > 100) {
      setError("SpO2 cannot be greater than 100.");
      return;
    }

    setSaving(true);

    try {
      let patientId: string;
      let patientCode = "";

      if (selectedPatient) {
        patientId = selectedPatient.id;
        patientCode = selectedPatient.patient_code;
      } else {
        const { data: patient, error: patientError } = await supabase
          .from("patients")
          .insert({
            name: name.trim(),
            age: age.trim() ? Number(age) : null,
            gender: gender || null,
            phone: phone.trim() || null,
          })
          .select("id, patient_code")
          .single();

        if (patientError) throw new Error("Patient: " + patientError.message);

        patientId = patient.id;
        patientCode = patient.patient_code;
      }

      const nextQueue = await createVisit(patientId);

      setMessage(
        `Visit created successfully! Patient ID: ${patientCode}. Queue number: ${nextQueue}.`
      );

      clearSelectedPatient();
      setSearchTerm("");
      setSearchResults([]);
      await loadData();
    } catch (err) {
      console.error("Add patient/visit error:", err);
      setError(readableError(err));
    } finally {
      setSaving(false);
    }
  }

  function printVisit(visit: Visit) {
    const patient = visit.patients;
    const vital = visit.vitals;

    const prescriptionsHtml = visit.prescriptions.length
      ? visit.prescriptions
          .map((p) => {
            const medicines = safeText(p.medicines);
            const investigations = safeText(p.investigations);
            const advice = safeText(p.advice ?? p.notes);

            return `
              <section class="prescription-section">
                <h2>Clinical Assessment & Prescription</h2>

                <h3>Diagnosis</h3>
                <div class="content">${escapeHtml(safeText(p.diagnosis))}</div>

                <h3>Medicines / Dosage / Duration / Instructions</h3>
                <div class="content">${escapeHtml(medicines)}</div>

                <h3>Investigations</h3>
                <div class="content">${escapeHtml(investigations)}</div>

                <h3>Advice / Follow-up</h3>
                <div class="content">${escapeHtml(advice)}</div>

                <div class="doctor-block">
                  <h3>Prescribing Doctor</h3>
                  <p><b>Name:</b> ${escapeHtml(safeText(p.doctor_name))}</p>
                  <p><b>Qualification:</b> ${escapeHtml(
                    safeText(p.doctor_qualification)
                  )}</p>
                  <p><b>Registration No.:</b> ${escapeHtml(
                    safeText(p.doctor_reg_no)
                  )}</p>
                </div>
              </section>
            `;
          })
          .join('<hr class="separator" />')
      : "<p>No prescription has been saved for this visit yet.</p>";

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8" />
        <title>Clinic Prescription</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: Arial, Helvetica, sans-serif;
            color: #111827;
            margin: 0 auto;
            padding: 28px;
            max-width: 850px;
            font-size: 13px;
            line-height: 1.5;
          }
          .clinic-header {
            text-align: center;
            border-bottom: 2px solid #111827;
            padding-bottom: 12px;
            margin-bottom: 16px;
          }
          .clinic-header h1 {
            margin: 0 0 4px;
            font-size: 25px;
          }
          .clinic-header p { margin: 2px 0; }
          h2 {
            font-size: 17px;
            margin: 18px 0 8px;
            border-bottom: 1px solid #9ca3af;
            padding-bottom: 5px;
          }
          h3 {
            font-size: 13px;
            margin: 12px 0 4px;
          }
          p { margin: 4px 0; }
          .meta, .patient-grid, .vitals-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 7px 18px;
          }
          .panel {
            border: 1px solid #d1d5db;
            padding: 10px 12px;
            border-radius: 5px;
            margin: 10px 0;
          }
          .content {
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            padding: 4px 0 8px;
          }
          .doctor-block {
            margin-top: 20px;
            padding-top: 10px;
            border-top: 1px solid #9ca3af;
          }
          .separator {
            border: 0;
            border-top: 1px dashed #9ca3af;
            margin: 22px 0;
          }
          .footer {
            margin-top: 28px;
            display: flex;
            justify-content: space-between;
            gap: 30px;
          }
          .signature {
            width: 210px;
            border-top: 1px solid #111;
            padding-top: 6px;
            text-align: center;
            margin-top: 35px;
          }
          @media print {
            body { padding: 8mm; max-width: none; }
            .panel { break-inside: avoid; }
            .prescription-section { break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <header class="clinic-header">
          <h1>DRISHYAM CLINIC</h1>
          <p>Patient Consultation & Prescription</p>
        </header>

        <div class="meta">
          <p><b>Patient ID:</b> ${escapeHtml(
            patient?.patient_code ?? "—"
          )}</p>
          <p><b>Visit Date:</b> ${escapeHtml(visit.visit_date)}</p>
          <p><b>Visit ID:</b> ${escapeHtml(visit.id)}</p>
          <p><b>Queue Number:</b> ${escapeHtml(String(visit.queue_no))}</p>
        </div>

        <div class="panel">
          <h2>Patient Details</h2>
          <div class="patient-grid">
            <p><b>Name:</b> ${escapeHtml(patient?.name ?? "—")}</p>
            <p><b>Age:</b> ${escapeHtml(String(patient?.age ?? "—"))}</p>
            <p><b>Gender:</b> ${escapeHtml(patient?.gender ?? "—")}</p>
            <p><b>Phone:</b> ${escapeHtml(patient?.phone ?? "—")}</p>
          </div>
        </div>

        <div class="panel">
          <h2>Vitals</h2>
          <div class="vitals-grid">
            <p><b>Blood Pressure:</b> ${escapeHtml(vital?.bp ?? "—")}</p>
            <p><b>Pulse:</b> ${escapeHtml(
              String(vital?.pulse ?? "—")
            )} bpm</p>
            <p><b>SpO₂:</b> ${escapeHtml(
              String(vital?.spo2 ?? "—")
            )}${vital?.spo2 != null ? "%" : ""}</p>
            <p><b>Weight:</b> ${escapeHtml(
              String(vital?.weight ?? "—")
            )}${vital?.weight != null ? " kg" : ""}</p>
            <p><b>Temperature:</b> ${escapeHtml(
              String(vital?.temperature ?? "—")
            )}${vital?.temperature != null ? " °C" : ""}</p>
          </div>
        </div>

        ${prescriptionsHtml}

        <div class="footer">
          <p><b>Prescription date:</b> ${escapeHtml(visit.visit_date)}</p>
          <div class="signature">
            Doctor's Signature
          </div>
        </div>

        <script>
          window.onload = function () {
            window.print();
          };
        <\/script>
      </body>
      </html>
    `;

    const win = window.open("", "_blank");

    if (!win) {
      setError("Please allow pop-ups to print the prescription.");
      return;
    }

    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-900 sm:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Reception Dashboard</h1>
            <p className="mt-1 text-sm text-slate-600">
              Date: {today || "Loading date..."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadData()}
            className="rounded-lg bg-slate-800 px-4 py-2 text-white"
          >
            Refresh Queue
          </button>
        </header>

        {error && (
          <div className="whitespace-pre-wrap break-words rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">
            <b>Error:</b> {error}
          </div>
        )}

        {message && (
          <div className="whitespace-pre-wrap rounded-lg border border-green-300 bg-green-50 p-4 text-green-800">
            {message}
          </div>
        )}

        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-xl font-semibold">
            Search Existing Patient
          </h2>
          <p className="mb-3 text-sm text-slate-600">
            Patient ID, mobile number, ya patient name se search karo.
            Multiple matching patients hon toh correct record select karo.
          </p>

          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void searchPatients();
                }
              }}
              className="min-w-0 flex-1 rounded-lg border p-3"
              placeholder="e.g. DRI-000001 or mobile number"
            />
            <button
              type="button"
              disabled={searching}
              onClick={() => void searchPatients()}
              className="rounded-lg bg-indigo-700 px-5 py-3 font-semibold text-white disabled:opacity-50"
            >
              {searching ? "Searching..." : "Search Patient"}
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="mt-4 space-y-2">
              <h3 className="font-semibold">
                Search Results ({searchResults.length})
              </h3>

              {searchResults.map((patient) => (
                <div
                  key={patient.id}
                  className="flex flex-col justify-between gap-3 rounded-lg border p-3 sm:flex-row sm:items-center"
                >
                  <div>
                    <p className="font-semibold">{patient.name}</p>
                    <p className="text-sm text-slate-600">
                      ID: {patient.patient_code} | Phone: {patient.phone || "—"}
                    </p>
                    <p className="text-sm text-slate-600">
                      Age: {patient.age ?? "—"} | Gender:{" "}
                      {patient.gender || "—"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => selectExistingPatient(patient)}
                      className="rounded-lg bg-blue-700 px-3 py-2 text-white"
                    >
                      Select for Visit
                    </button>
                    <button
                      type="button"
                      onClick={() => void loadPatientHistory(patient)}
                      className="rounded-lg bg-slate-700 px-3 py-2 text-white"
                    >
                      View History
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedPatient && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-300 bg-blue-50 p-3">
              <p>
                Selected: <b>{selectedPatient.name}</b> —{" "}
                <b>{selectedPatient.patient_code}</b>
              </p>
              <button
                type="button"
                onClick={clearSelectedPatient}
                className="rounded-lg border border-blue-700 px-3 py-2 text-blue-800"
              >
                Clear Selection
              </button>
            </div>
          )}
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold">
            {selectedPatient ? "Create Repeat Visit" : "Register New Patient"}{" "}
            & Vitals
          </h2>

          <form
            onSubmit={addPatient}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <label>
              <span className="mb-1 block text-sm font-medium">
                Patient Name *
              </span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={Boolean(selectedPatient)}
                className="w-full rounded-lg border p-3 disabled:bg-slate-100"
                placeholder="Patient name"
              />
            </label>

            <label>
              <span className="mb-1 block text-sm font-medium">Age</span>
              <input
                type="number"
                min="0"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                disabled={Boolean(selectedPatient)}
                className="w-full rounded-lg border p-3 disabled:bg-slate-100"
                placeholder="Age"
              />
            </label>

            <label>
              <span className="mb-1 block text-sm font-medium">Gender</span>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                disabled={Boolean(selectedPatient)}
                className="w-full rounded-lg border p-3 disabled:bg-slate-100"
              >
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </select>
            </label>

            <label>
              <span className="mb-1 block text-sm font-medium">Phone</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={Boolean(selectedPatient)}
                className="w-full rounded-lg border p-3 disabled:bg-slate-100"
                placeholder="Phone number"
              />
            </label>

            <label>
              <span className="mb-1 block text-sm font-medium">
                BP (e.g. 120/80)
              </span>
              <input
                value={bp}
                onChange={(e) => setBp(e.target.value)}
                className="w-full rounded-lg border p-3"
                placeholder="120/80"
              />
            </label>

            <label>
              <span className="mb-1 block text-sm font-medium">
                Pulse / Heart Rate
              </span>
              <input
                type="number"
                min="0"
                value={pulse}
                onChange={(e) => setPulse(e.target.value)}
                className="w-full rounded-lg border p-3"
                placeholder="bpm"
              />
            </label>

            <label>
              <span className="mb-1 block text-sm font-medium">SpO₂ (%)</span>
              <input
                type="number"
                min="0"
                max="100"
                value={spo2}
                onChange={(e) => setSpo2(e.target.value)}
                className="w-full rounded-lg border p-3"
                placeholder="e.g. 98"
              />
            </label>

            <label>
              <span className="mb-1 block text-sm font-medium">
                Weight (kg)
              </span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="w-full rounded-lg border p-3"
                placeholder="Weight"
              />
            </label>

            <div className="sm:col-span-2 lg:col-span-4">
              <button
                type="submit"
                disabled={saving || !today}
                className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-50"
              >
                {saving
                  ? "Saving..."
                  : selectedPatient
                    ? "Create Repeat Visit"
                    : "Register Patient & Add to Queue"}
              </button>
            </div>
          </form>

          <p className="mt-3 text-xs text-slate-500">
            Repeat visit ke liye pehle patient search karke Select for Visit
            dabao. Bina selection ke form submit karne par naya patient record
            banega.
          </p>
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
                  <article key={visit.id} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="font-bold">
                          {visit.visit_date} — Queue #{visit.queue_no}
                        </h3>
                        <p className="break-all text-xs text-slate-500">
                          Visit ID: {visit.id}
                        </p>
                        <p className="text-sm">Status: {visit.status}</p>
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
                      <p>SpO₂: {visit.vitals?.spo2 ?? "—"}</p>
                      <p>Weight: {visit.vitals?.weight ?? "—"} kg</p>
                      <p>
                        Temperature: {visit.vitals?.temperature ?? "—"}
                        {visit.vitals?.temperature != null ? " °C" : ""}
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
                            <b>Advice:</b> {safeText(p.advice ?? p.notes)}
                          </p>
                          <p>
                            <b>Doctor:</b> {safeText(p.doctor_name)}
                          </p>
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
              <table className="w-full min-w-[1400px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="p-3">Queue</th>
                    <th className="p-3">Patient ID</th>
                    <th className="p-3">Patient</th>
                    <th className="p-3">Visit ID</th>
                    <th className="p-3">Age/Gender</th>
                    <th className="p-3">Phone</th>
                    <th className="p-3">BP</th>
                    <th className="p-3">Pulse</th>
                    <th className="p-3">SpO₂</th>
                    <th className="p-3">Weight</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {queue.map((visit) => (
                    <tr key={visit.id} className="border-b last:border-0">
                      <td className="p-3 font-semibold">#{visit.queue_no}</td>
                      <td className="p-3">
                        {visit.patients?.patient_code ?? "—"}
                      </td>
                      <td className="p-3">
                        {visit.patients?.name ?? "Unknown"}
                      </td>
                      <td className="max-w-36 break-all p-3 text-xs">
                        {visit.id}
                      </td>
                      <td className="p-3">
                        {visit.patients?.age ?? "—"} /{" "}
                        {visit.patients?.gender ?? "—"}
                      </td>
                      <td className="p-3">
                        {visit.patients?.phone ?? "—"}
                      </td>
                      <td className="p-3">{visit.vitals?.bp ?? "—"}</td>
                      <td className="p-3">{visit.vitals?.pulse ?? "—"}</td>
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
                      <td className="p-3">{visit.status}</td>
                      <td className="p-3">
                        <div className="flex flex-col gap-2">
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
                            ? `${visit.prescriptions.length} saved`
                            : "Not saved yet"}
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
                        Patient ID: {visit.patients?.patient_code ?? "—"} |
                        Status: {visit.status}
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
                        <p>Qualification: {safeText(p.doctor_qualification)}</p>
                        <p>Registration No.: {safeText(p.doctor_reg_no)}</p>
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
