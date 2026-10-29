
"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type QueueItem = {
  id: string;
  queue_no: number;
  status: string;
  patients: { name: string } | null;
};

export default function TVDisplay() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueError, setQueueError] = useState("");

  const roomName = "DrishyamClinicPermanentRoom2026";
  const doctorStreamId = "DrishyamDoctor2026";

  // TV only receives the doctor's stream. It does not publish a camera.
  const videoUrl =
    `https://vdo.ninja/?view=${doctorStreamId}` +
    `&room=${roomName}&autoplay&muted`;

  const getLocalDate = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };

  const loadQueue = useCallback(async () => {
    const { data, error } = await supabase
      .from("visits")
      .select("id, queue_no, status, patients(name)")
      .eq("visit_date", getLocalDate())
      .in("status", ["waiting", "in-consultation"])
      .order("queue_no", { ascending: true });

    if (error) {
      console.error("TV queue error:", error);
      setQueueError("Queue load nahi hui. Please retry karein.");
      return;
    }

    setQueueError("");
    setQueue((data ?? []) as unknown as QueueItem[]);
  }, []);

  useEffect(() => {
    void loadQueue();

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
          void loadQueue();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadQueue]);

  const currentPatient = queue.find(
    (item) => item.status === "in-consultation"
  );

  const waitingPatients = queue.filter(
    (item) => item.status === "waiting"
  );

  return (
    <main className="min-h-screen bg-slate-900 p-4 text-white flex flex-col justify-between max-w-xl mx-auto">
      <header className="text-center border-b border-slate-700 pb-3">
        <h1 className="text-2xl font-extrabold tracking-wide text-blue-400">
          DRISHYAM CLINIC
        </h1>
        <p className="text-slate-400 text-xs mt-1">
          Live Queue &amp; Doctor Consultation
        </p>
      </header>

      <div className="my-auto flex w-full flex-col gap-4 py-4">
        <section className="bg-slate-800 border-2 border-emerald-500/50 rounded-2xl p-4 flex flex-col items-center text-center shadow-2xl">
          <span className="bg-emerald-500/20 text-emerald-400 text-xs font-bold tracking-widest uppercase px-3 py-1 rounded-full border border-emerald-500/30">
            Now Consulting
          </span>

          {currentPatient ? (
            <>
              <div className="flex flex-wrap items-center justify-center gap-3 mt-3">
                <h2 className="text-4xl font-black text-emerald-400">
                  #{currentPatient.queue_no}
                </h2>
                <p className="text-xl font-semibold text-slate-100">
                  {currentPatient.patients?.name ?? "Patient"}
                </p>
              </div>

              <div className="w-full h-[280px] bg-black rounded-xl overflow-hidden border border-slate-700 mt-4">
                <iframe
                  src={videoUrl}
                  title="Doctor Live Video"
                  className="w-full h-full border-0"
                  allow="autoplay; encrypted-media"
                />
              </div>

              <p className="text-xs text-slate-400 mt-2">
                Doctor video stream
              </p>
            </>
          ) : (
            <div className="py-6">
              <p className="text-lg text-slate-400 font-medium">
                Please wait for the next call
              </p>
              <p className="text-sm text-slate-500 mt-2">
                Doctor video will appear when a patient is being consulted.
              </p>
            </div>
          )}
        </section>

        <section className="bg-slate-800/90 border border-slate-700 rounded-2xl p-4">
          <h3 className="text-md font-bold text-slate-300 border-b border-slate-700 pb-2 mb-3">
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
                  className="bg-slate-900 border border-slate-700/80 px-4 py-3 rounded-xl flex justify-between items-center gap-3"
                >
                  <span className="text-lg font-bold text-blue-400">
                    Token #{item.queue_no}
                  </span>
                  <span className="text-md font-medium text-slate-200 text-right">
                    {item.patients?.name ?? "Patient"}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        {queueError && (
          <div className="rounded-lg border border-red-500/40 bg-red-950 p-3 text-sm text-red-200">
            {queueError}
            <button
              type="button"
              onClick={() => void loadQueue()}
              className="ml-3 underline"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      <footer className="text-center text-[10px] text-slate-500 border-t border-slate-800 pt-2">
        Automatic realtime queue updates active
      </footer>
    </main>
  );
}
