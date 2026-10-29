
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

  // Must match the stream ID used by the Doctor Page.
  const doctorStreamId = "DrishyamDoctor2026";

  // Receive only the doctor's published stream.
  const videoUrl =
    `https://vdo.ninja/?view=${doctorStreamId}&autoplay&muted`;

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
    <main className="min-h-screen bg-slate-950 p-4 text-white flex flex-col justify-between max-w-3xl mx-auto">
      <header className="text-center border-b border-slate-700 pb-4">
        <h1 className="text-3xl font-extrabold tracking-wide text-blue-400">
          DRISHYAM CLINIC
        </h1>

        <p className="text-slate-400 text-sm mt-1">
          Live Queue &amp; Doctor Consultation
        </p>
      </header>

      <div className="my-auto flex w-full flex-col gap-5 py-5">
        <section className="bg-slate-900 border-2 border-emerald-500/50 rounded-2xl p-5 flex flex-col items-center text-center shadow-2xl">
          <span className="bg-emerald-500/20 text-emerald-400 text-xs font-bold tracking-widest uppercase px-4 py-2 rounded-full border border-emerald-500/30">
            NOW CONSULTING
          </span>

          <h2 className="text-2xl font-bold text-emerald-300 mt-4">
            Doctor Consulting
          </h2>

          {currentPatient ? (
            <>
              <div className="flex flex-wrap items-center justify-center gap-3 mt-3">
                <span className="text-4xl font-black text-emerald-400">
                  #{currentPatient.queue_no}
                </span>

                <span className="text-xl font-semibold text-slate-100">
                  {currentPatient.patients?.name ?? "Patient"}
                </span>
              </div>

              <div className="w-full aspect-video bg-black rounded-xl overflow-hidden border border-slate-700 mt-5">
                <iframe
                  key={doctorStreamId}
                  src={videoUrl}
                  title="Doctor Live Video"
                  className="w-full h-full border-0"
                  allow="autoplay; encrypted-media; picture-in-picture"
                  referrerPolicy="no-referrer"
                />
              </div>

              <p className="text-xs text-slate-400 mt-3">
                Live doctor video
              </p>
            </>
          ) : (
            <div className="w-full py-8">
              <div className="w-full aspect-video bg-black rounded-xl border border-slate-700 flex items-center justify-center">
                <p className="text-slate-400 text-lg">
                  Waiting for the next consultation
                </p>
              </div>

              <p className="text-sm text-slate-500 mt-3">
                Doctor video will be displayed when a patient is called in.
              </p>
            </div>
          )}
        </section>

        <section className="bg-slate-900 border border-slate-700 rounded-2xl p-5">
          <h3 className="text-lg font-bold text-slate-200 border-b border-slate-700 pb-3 mb-3">
            Next In Line ({waitingPatients.length})
          </h3>

          <div className="space-y-2 overflow-y-auto max-h-[220px] pr-1">
            {waitingPatients.length === 0 ? (
              <p className="text-slate-500 py-3 text-center text-sm">
                No patients waiting
              </p>
            ) : (
              waitingPatients.map((item) => (
                <div
                  key={item.id}
                  className="bg-slate-950 border border-slate-700 px-4 py-3 rounded-xl flex justify-between items-center gap-3"
                >
                  <span className="text-lg font-bold text-blue-400">
                    Token #{item.queue_no}
                  </span>

                  <span className="font-medium text-slate-200 text-right">
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

      <footer className="text-center text-xs text-slate-500 border-t border-slate-800 pt-3">
        Drishyam Clinic · Automatic queue updates
      </footer>
    </main>
  );
}
