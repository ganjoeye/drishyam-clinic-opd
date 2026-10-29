
"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type QueueItem = {
  id: string;
  queue_no: number;
  status: string;
  patients: { name: string } | null;
};

export default function TVDisplay() {
  const [queue, setQueue] = useState<QueueItem[]>([]);

  const today = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Dedicated doctor stream: match the working test link.
  const doctorStreamId = "DrishyamDoctor2026";
  const videoUrl = `https://vdo.ninja/?view=${doctorStreamId}&autoplay&muted`;

  async function loadQueue() {
    const { data, error } = await supabase
      .from("visits")
      .select("id, queue_no, status, patients(name)")
      .eq("visit_date", today())
      .in("status", ["waiting", "in-consultation"])
      .order("queue_no", { ascending: true });

    if (error) {
      console.error("TV queue loading error:", error);
      return;
    }

    if (data) {
      setQueue(data as unknown as QueueItem[]);
    }
  }

  useEffect(() => {
    loadQueue();

    const channel = supabase
      .channel("tv-queue-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "visits",
        },
        () => {
          loadQueue();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const currentPatient = queue.find(
    (item) => item.status === "in-consultation"
  );

  const waitingPatients = queue.filter(
    (item) => item.status === "waiting"
  );

  return (
    <main className="min-h-screen bg-slate-900 text-white p-4 flex flex-col justify-between max-w-xl mx-auto">
      {/* Header */}
      <div className="text-center border-b border-slate-700 pb-3">
        <h1 className="text-2xl font-extrabold tracking-wide text-blue-400">
          CLINIC PATIENT DISPLAY
        </h1>
        <p className="text-slate-400 text-xs mt-0.5">
          Live Queue & Doctor Consultation
        </p>
      </div>

      {/* Main Content */}
      <div className="flex flex-col gap-4 my-auto py-2 w-full">
        {/* Current Consultation */}
        <div className="bg-slate-800 border-2 border-emerald-500/50 rounded-2xl p-4 flex flex-col items-center justify-center text-center shadow-2xl">
          <span className="bg-emerald-500/20 text-emerald-400 text-xs font-bold tracking-widest uppercase px-3 py-1 rounded-full border border-emerald-500/30">
            Now Consulting
          </span>

          {currentPatient ? (
            <>
              <div className="flex items-center gap-3 mt-2">
                <h2 className="text-4xl font-black text-emerald-400 tracking-tight">
                  #{currentPatient.queue_no}
                </h2>

                <p className="text-xl font-semibold text-slate-100">
                  {currentPatient.patients?.name}
                </p>
              </div>

              {/* Doctor's dedicated live stream */}
              <div className="w-full h-[280px] bg-black rounded-xl overflow-hidden border border-slate-700 mt-3">
                <iframe
                  key={videoUrl}
                  src={videoUrl}
                  title="Doctor Live Video"
                  className="w-full h-full border-0"
                  allow="autoplay; encrypted-media; fullscreen"
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
            </>
          ) : (
            <div className="py-6">
              <p className="text-lg text-slate-400 font-medium">
                Please wait for next call
              </p>
            </div>
          )}
        </div>

        {/* Waiting Queue */}
        <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-4 flex flex-col">
          <h3 className="text-md font-bold text-slate-300 border-b border-slate-700 pb-2 mb-2">
            Next In Line ({waitingPatients.length})
          </h3>

          <div className="space-y-2 overflow-y-auto max-h-[180px] pr-1">
            {waitingPatients.length === 0 ? (
              <p className="text-slate-500 py-2 text-center text-sm">
                No patients waiting
              </p>
            ) : (
              waitingPatients.map((item) => (
                <div
                  key={item.id}
                  className="bg-slate-900 border border-slate-700/80 px-4 py-2 rounded-xl flex justify-between items-center"
                >
                  <span className="text-lg font-bold text-blue-400">
                    Token #{item.queue_no}
                  </span>

                  <span className="text-md font-medium text-slate-200">
                    {item.patients?.name}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-[10px] text-slate-500 border-t border-slate-800 pt-2">
        Automatic Realtime updates active
      </div>
    </main>
  );
}
