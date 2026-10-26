
"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Patient = {
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
};

type Prescription = {
  id?: string;
  visit_id?: string;
  diagnosis?: string | null;
  medicines?: string | null;
  advice?: string | null;
  [key: string]: unknown;
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
  if (
    typeof err === "object" &&
    err !== null &&
    "message" in err
  ) {
    return String(err.message);
  }
  return String(err);
}

function safeText(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
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

  const loadData = useCallback(async () => {
    setError("");

    try {
      const { data: visitData, error: visitError } = await supabase
        .from("visits")
        .select(
          "id, queue_no, visit_date, status, patients(name, age, gender, phone)"
        )
        .eq("visit_date", getLocalDate())
        .order("queue_no", { ascending: true });

      if (visitError) {
        throw new Error("Visits: " + visitError.message);
      }

      const visits = (visitData ?? []) as unknown as Omit<
        Visit,
        "vitals" | "prescriptions"
      >[];

      const ids = visits.map((v) => v.id);

      let vitalRows: Vital[] = [];
      let prescriptionRows: Prescription[] = [];
      const secondaryErrors: string[] = [];

      if (ids.length > 0) {
        const { data: vitalData, error: vitalError } = await supabase
          .from("vitals")
          .select("id, visit_id, bp, weight, pulse, spo2")
          .in("visit_id", ids);

        if (vitalError) {
          console.error("Vitals query error:", vitalError);
          secondaryErrors.push("Vitals: " + vitalError.message);
        } else {
          vitalRows = (vitalData ?? []) as Vital[];
        }

        // Do not assume that optional prescription columns exist.
        const { data: prescriptionData, error: prescriptionError } =
          await supabase
            .from("prescriptions")
            .select("*")
            .in("visit_id", ids);

        if (prescriptionError) {
          console.error("Prescription query error:", prescriptionError);
          secondaryErrors.push(
            "Prescriptions: " + prescriptionError.message
          );
        } else {
          prescriptionRows = (prescriptionData ?? []) as Prescription[];
        }
      }

      const result: Visit[] = visits.map((visit) => ({
        ...visit,
        vitals:
          vitalRows.find((v) => v.visit_id === visit.id) ?? null,
        prescriptions: prescriptionRows.filter(
          (p) => p.visit_id === visit.id
        ),
      }));

      setQueue(result);

      if (secondaryErrors.length > 0) {
        setError(secondaryErrors.join(" | "));
      }
    } catch (err: unknown) {
      console.error("Reception load error:", err);
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();

    const interval = window.setInterval(() => {
      void loadData();
    }, 15000);

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
  }, [loadData]);

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
      const { data: patient, error: patientError } = await supabase
        .from("patients")
        .insert({
          name: name.trim(),
          age: age.trim() ? Number(age) : null,
          gender: gender || null,
          phone: phone.trim() || null,
        })
        .select("id")
        .single();

      if (patientError) {
        throw new Error("Patient: " + patientError.message);
      }

      const today = getLocalDate();

      const { data: latest, error: latestError } = await supabase
        .from("visits")
        .select("queue_no")
        .eq("visit_date", today)
        .order("queue_no", { ascending: false })
        .limit(1);

      if (latestError) {
        throw new Error("Queue number: " + latestError.message);
      }

      const nextQueue = (latest?.[0]?.queue_no ?? 0) + 1;

      const { data: visit, error: visitError } = await supabase
        .from("visits")
        .insert({
          patient_id: patient.id,
          visit_date: today,
          queue_no: nextQueue,
          status: "waiting",
        })
        .select("id")
        .single();

      if (visitError) {
        throw new Error("Visit: " + visitError.message);
      }

      const hasVitals = Boolean(
        bp.trim() || pulse.trim() || spo2.trim() || weight.trim()
      );

      if (hasVitals) {
        const { error: vitalError } = await supabase
          .from("vitals")
          .insert({
            visit_id: visit.id,
            bp: bp.trim() || null,
            pulse: pulse.trim() ? Number(pulse) : null,
            spo2: spo2.trim() ? Number(spo2) : null,
            weight: weight.trim() ? Number(weight) : null,
          });

        if (vitalError) {
          throw new Error(
            "Patient added, but vitals could not be saved: " +
              vitalError.message
          );
        }
      }

      setMessage(`Patient added successfully. Queue number: ${nextQueue}`);
      setName("");
      setAge("");
      setGender("Male");
      setPhone("");
      setBp("");
      setPulse("");
      setSpo2("");
      setWeight("");

      await loadData();
    } catch (err: unknown) {
      console.error("Add patient error:", err);
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
            const diagnosis = safeText(p.diagnosis);
            const medicines = safeText(p.medicines);
            const advice = safeText(p.advice);

            const otherFields = Object.entries(p)
              .filter(
                ([key, value]) =>
                  ![
                    "id",
                    "visit_id",
                    "diagnosis",
                    "medicines",
                    "advice",
                    "created_at",
                  ].includes(key) &&
                  value !== null &&
                  value !== ""
              )
              .map(
                ([key, value]) =>
                  `<p><b>${escapeHtml(
                    key.replace(/_/g, " ")
                  )}:</b> ${escapeHtml(safeText(value))}</p>`
              )
              .join("");

            return `
              <h3>Diagnosis</h3>
              <p>${escapeHtml(diagnosis)}</p>
              <h3>Medicines / Dosage / Duration / Instructions</h3>
              <pre>${escapeHtml(medicines)}</pre>
              <h3>Advice</h3>
              <pre>${escapeHtml(advice)}</pre>
              ${otherFields}
            `;
          })
          .join("<hr />")
      : "<p>No prescription has been saved for this visit yet.</p>";

    const html = `
      <html>
      <head>
        <title>Patient Prescription</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 30px; color: #111; }
          h1 { margin-bottom: 4px; }
          h3 { margin-bottom: 6px; }
          p { margin-top: 4px; }
          pre { white-space: pre-wrap; font-family: Arial, sans-serif; }
          hr { margin: 20px 0; }
        </style>
      </head>
      <body>
        <h1>Clinic Prescription</h1>
        <p>Queue Number: ${visit.queue_no}</p>
        <hr />
        <h3>Patient Details</h3>
        <p><b>Name:</b> ${escapeHtml(patient?.name ?? "—")}</p>
        <p><b>Age:</b> ${escapeHtml(String(patient?.age ?? "—"))}</p>
        <p><b>Gender:</b> ${escapeHtml(patient?.gender ?? "—")}</p>
        <p><b>Phone:</b> ${escapeHtml(patient?.phone ?? "—")}</p>
        <hr />
        <h3>Vitals</h3>
        <p><b>BP:</b> ${escapeHtml(vital?.bp ?? "—")}</p>
        <p><b>Pulse / Heart Rate:</b> ${escapeHtml(String(vital?.pulse ?? "—"))} bpm</p>
        <p><b>SpO2:</b> ${escapeHtml(String(vital?.spo2 ?? "—"))}%</p>
        <p><b>Weight:</b> ${escapeHtml(String(vital?.weight ?? "—"))} kg</p>
        <hr />
        <h2>Doctor's Prescription</h2>
        ${prescriptionsHtml}
        <script>window.onload = () => window.print();<\/script>
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
              Date: {getLocalDate()}
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
            <b>Database error:</b> {error}
          </div>
        )}

        {message && (
          <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-green-800">
            {message}
          </div>
        )}

        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold">
            Add Patient & Vitals
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
                className="w-full rounded-lg border p-3"
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
                className="w-full rounded-lg border p-3"
                placeholder="Age"
              />
            </label>

            <label>
              <span className="mb-1 block text-sm font-medium">Gender</span>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="w-full rounded-lg border p-3"
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
                className="w-full rounded-lg border p-3"
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
                disabled={saving}
                className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Saving..." : "Add Patient to Queue"}
              </button>
            </div>
          </form>
        </section>

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
                    <th className="p-3">Patient</th>
                    <th className="p-3">Age/Gender</th>
                    <th className="p-3">Phone</th>
                    <th className="p-3">BP</th>
                    <th className="p-3">Pulse</th>
                    <th className="p-3">SpO₂</th>
                    <th className="p-3">Weight</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Prescription</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((visit) => (
                    <tr key={visit.id} className="border-b last:border-0">
                      <td className="p-3 font-semibold">#{visit.queue_no}</td>
                      <td className="p-3">{visit.patients?.name ?? "Unknown"}</td>
                      <td className="p-3">
                        {visit.patients?.age ?? "—"} /{" "}
                        {visit.patients?.gender ?? "—"}
                      </td>
                      <td className="p-3">{visit.patients?.phone ?? "—"}</td>
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
                        <button
                          type="button"
                          onClick={() => printVisit(visit)}
                          className="rounded-lg bg-green-700 px-3 py-2 text-white"
                        >
                          View / Print
                        </button>
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
          <h2 className="text-xl font-bold">
            Doctor&apos;s Prescriptions
          </h2>

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
                        <h4 className="font-semibold">Advice / Notes</h4>
                        <p className="whitespace-pre-wrap">
                          {safeText(p.advice)}
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
