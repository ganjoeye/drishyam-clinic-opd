"use client";
import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";

type Prescription = {
  id: string;
  diagnosis: string;
  medicines: string;
  advice: string;
};

type Visit = {
  id: string;
  queue_no: number;
  status: string;
  patients: { name: string; age: number; gender: string; phone: string } | null;
  prescriptions?: Prescription[];
};

export default function ReceptionDashboard() {
  // Form State
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("Male");
  const [phone, setPhone] = useState("");
  const [bp, setBp] = useState("");
  const [weight, setWeight] = useState("");
  const [pulse, setPulse] = useState("");
  const [spo2, setSpo2] = useState("");
  const [lastToken, setLastToken] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // Queue and Prescriptions State
  const [todayQueue, setTodayQueue] = useState<Visit[]>([]);
  const [completedVisits, setCompletedVisits] = useState<Visit[]>([]);

  const today = () => new Date().toISOString().slice(0, 10);

  async function loadData() {
    // 1. Fetch Today's Active Queue
    const { data: queueData } = await supabase
      .from("visits")
      .select("id, queue_no, status, patients(name, age, gender, phone)")
      .eq("visit_date", today())
      .order("queue_no", { ascending: true });

    if (queueData) setTodayQueue(queueData as unknown as Visit[]);

    // 2. Fetch Completed Visits with Prescriptions
    const { data: completedData } = await supabase
      .from("visits")
      .select("id, queue_no, status, patients(name, age, gender, phone), prescriptions(id, diagnosis, medicines, advice)")
      .eq("visit_date", today())
      .eq("status", "completed")
      .order("queue_no", { ascending: false });

    if (completedData) setCompletedVisits(completedData as unknown as Visit[]);
  }

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel("reception-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "visits" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "prescriptions" }, () => loadData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function handleAddPatient(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return alert("Patient name is required!");
    setLoading(true);

    try {
      // Step A: Insert Patient
      const { data: patientData, error: pErr } = await supabase
        .from("patients")
        .insert([{ name, age: Number(age) || 0, gender, phone }])
        .select()
        .single();

      if (pErr) throw pErr;

      // Step B: Calculate Queue Number
      const { data: maxVisit } = await supabase
        .from("visits")
        .select("queue_no")
        .eq("visit_date", today())
        .order("queue_no", { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextQueueNo = (maxVisit?.queue_no || 0) + 1;

      // Step C: Insert Visit
      const { data: visitData, error: vErr } = await supabase
        .from("visits")
        .insert([{ patient_id: patientData.id, visit_date: today(), queue_no: nextQueueNo, status: "waiting" }])
        .select()
        .single();

      if (vErr) throw vErr;

      // Step D: Insert Vitals if provided
      if (bp || weight || pulse || spo2) {
        await supabase.from("vitals").insert([
          {
            visit_id: visitData.id,
            bp: bp || null,
            weight: weight ? Number(weight) : null,
            pulse: pulse ? Number(pulse) : null,
            spo2: spo2 ? Number(spo2) : null,
          },
        ]);
      }

      setLastToken(nextQueueNo);
      // Reset Form
      setName("");
      setAge("");
      setPhone("");
      setBp("");
      setWeight("");
      setPulse("");
      setSpo2("");
      loadData();
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  function printPrescription(visit: Visit) {
    const p = visit.prescriptions?.[0];
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Prescription - Token #${visit.queue_no}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 30px; }
            .header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
            .header h1 { margin: 0; color: #1e3a8a; }
            .patient-info { display: flex; justify-content: space-between; margin-bottom: 20px; font-weight: bold; }
            .section { margin-bottom: 15px; }
            .section h3 { margin-bottom: 5px; color: #1e40af; border-bottom: 1px solid #ccc; }
            .meds { white-space: pre-wrap; font-family: monospace; font-size: 14px; background: #f8fafc; padding: 10px; border-radius: 5px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Drishyam Health Clinic</h1>
            <p>OPD Consultation Prescription</p>
          </div>
          <div class="patient-info">
            <div>Token: #${visit.queue_no} | Patient: ${visit.patients?.name || "N/A"}</div>
            <div>Age/Gender: ${visit.patients?.age || "N/A"} Yrs / ${visit.patients?.gender || "N/A"}</div>
          </div>
          <hr />
          <div class="section">
            <h3>Diagnosis</h3>
            <p>${p?.diagnosis || "N/A"}</p>
          </div>
          <div class="section">
            <h3>Rx (Medicines)</h3>
            <div class="meds">${p?.medicines || "N/A"}</div>
          </div>
          <div class="section">
            <h3>Advice</h3>
            <p>${p?.advice || "N/A"}</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  }

  function shareOnWhatsApp(visit: Visit) {
    const phone = visit.patients?.phone;
    const p = visit.prescriptions?.[0];
    if (!phone) {
      alert("Patient phone number not found!");
      return;
    }

    const message = encodeURIComponent(
      `*Drishyam Clinic Prescription*\n\n*Patient:* ${visit.patients?.name}\n*Diagnosis:* ${p?.diagnosis || "N/A"}\n\n*Medicines:*\n${p?.medicines || "N/A"}\n\n*Advice:* ${p?.advice || "N/A"}\n\nGet well soon!`
    );

    window.open(`https://wa.me/91${phone}?text=${message}`, "_blank");
  }

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold text-gray-800">Reception Desk</h1>

      {/* Patient Entry Form */}
      <div className="bg-white border rounded-xl p-6 shadow-sm space-y-4">
        <h2 className="font-bold text-gray-800 text-lg border-b pb-2">Add New Patient to Queue</h2>

        <form onSubmit={handleAddPatient} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="text"
              placeholder="Patient Name *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="border rounded-lg p-2.5 text-sm"
            />
            <input
              type="number"
              placeholder="Age"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="border rounded-lg p-2.5 text-sm"
            />
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="border rounded-lg p-2.5 text-sm bg-white"
            >
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <input
              type="text"
              placeholder="Phone Number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="border rounded-lg p-2.5 text-sm md:col-span-2"
            />
            <input
              type="text"
              placeholder="BP (e.g. 120/80)"
              value={bp}
              onChange={(e) => setBp(e.target.value)}
              className="border rounded-lg p-2.5 text-sm"
            />
            <input
              type="number"
              placeholder="Weight (kg)"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="border rounded-lg p-2.5 text-sm"
            />
            <input
              type="number"
              placeholder="SpO2 (%)"
              value={spo2}
              onChange={(e) => setSpo2(e.target.value)}
              className="border rounded-lg p-2.5 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-black text-white font-semibold py-2.5 rounded-lg hover:bg-gray-800 transition"
          >
            {loading ? "Adding..." : "Add to Queue"}
          </button>
        </form>

        {lastToken && (
          <p className="text-blue-600 font-bold text-sm text-center">Added as Token #{lastToken}</p>
        )}
      </div>

      {/* Today's Live Queue List */}
      <div className="bg-white border rounded-xl p-6 shadow-sm space-y-3">
        <h2 className="font-bold text-gray-800 text-lg border-b pb-2">Today's Queue ({todayQueue.length})</h2>
        <div className="space-y-2">
          {todayQueue.length === 0 ? (
            <p className="text-gray-400 text-sm py-2">No patients in queue today.</p>
          ) : (
            todayQueue.map((item) => (
              <div key={item.id} className="flex justify-between items-center border-b pb-2">
                <span className="font-semibold text-gray-800">
                  #{item.queue_no} {item.patients?.name}
                </span>
                <span className="text-xs px-2.5 py-1 rounded bg-gray-100 capitalize font-medium text-gray-600">
                  {item.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Completed Prescriptions Section */}
      <div className="bg-white border rounded-xl p-6 shadow-sm space-y-4">
        <h2 className="font-bold text-gray-800 text-lg border-b pb-2 flex justify-between items-center">
          <span>Ready Prescriptions (Print / WhatsApp)</span>
          <span className="text-xs bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full font-medium">
            Realtime Active
          </span>
        </h2>

        <div className="space-y-3">
          {completedVisits.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">No completed prescriptions today yet.</p>
          ) : (
            completedVisits.map((visit) => (
              <div key={visit.id} className="border rounded-lg p-3.5 flex justify-between items-center bg-slate-50">
                <div>
                  <p className="font-bold text-gray-800">
                    Token #{visit.queue_no} - {visit.patients?.name}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Diagnosis: {visit.prescriptions?.[0]?.diagnosis || "No notes"}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => printPrescription(visit)}
                    className="bg-blue-600 text-white text-xs px-3 py-2 rounded-lg font-semibold hover:bg-blue-700 flex items-center gap-1 shadow-sm"
                  >
                    🖨️ Print PDF
                  </button>
                  <button
                    onClick={() => shareOnWhatsApp(visit)}
                    className="bg-emerald-600 text-white text-xs px-3 py-2 rounded-lg font-semibold hover:bg-emerald-700 flex items-center gap-1 shadow-sm"
                  >
                    📱 WhatsApp
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}