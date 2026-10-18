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
  const today = () => new Date().toISOString().slice(0, 10);

  async function loadQueue() {
    const { data } = await supabase
      .from("visits")
      .select("id, queue_no, status, patients(name)")
      .eq("visit_date", today())
      .in("status", ["waiting", "in-consultation"])
      .order("queue_no", { ascending: true });

    if (data) setQueue(data as unknown as QueueItem[]);
  }

  useEffect(() => {
    loadQueue();

    const channel = supabase
      .channel("tv-queue-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "visits" }, () => {
        loadQueue();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const currentPatient = queue.find((item) => item.status === "in-consultation");
  const waitingPatients = queue.filter((item) => item.status === "waiting");

  return (
    <main className="min-h-screen bg-slate-900 text-white p-6 flex flex-col justify-between max-w-xl mx-auto">
      {/* Header */}
      <div className="text-center border-b border-slate-700 pb-4">
        <h1 className="text-3xl font-extrabold tracking-wide text-blue-400">CLINIC PATIENT DISPLAY</h1>
        <p className="text-slate-400 text-sm mt-1">Live Queue Updates</p>
      </div>

      {/* Vertical Single Column Content */}
      <div className="flex flex-col gap-6 my-auto py-4 w-full">
        {/* 1. TOP: Currently Consulting */}
        <div className="bg-slate-800 border-2 border-emerald-500/50 rounded-3xl p-8 flex flex-col items-center justify-center text-center shadow-2xl">
          <span className="bg-emerald-500/20 text-emerald-400 text-xs font-bold tracking-widest uppercase px-4 py-1.5 rounded-full border border-emerald-500/30">
            Now Consulting
          </span>
          {currentPatient ? (
            <>
              <h2 className="text-7xl font-black text-emerald-400 mt-4 tracking-tight">
                #{currentPatient.queue_no}
              </h2>
              <p className="text-2xl font-semibold text-slate-100 mt-2">
                {currentPatient.patients?.name}
              </p>
            </>
          ) : (
            <div className="py-6">
              <p className="text-xl text-slate-400 font-medium">Please wait for next call</p>
            </div>
          )}
        </div>

        {/* 2. BOTTOM: Next In Line List */}
        <div className="bg-slate-800/90 border border-slate-700 rounded-3xl p-6 flex flex-col">
          <h3 className="text-lg font-bold text-slate-300 border-b border-slate-700 pb-3 mb-3">
            Next In Line ({waitingPatients.length})
          </h3>
          <div className="space-y-3 overflow-y-auto max-h-[300px] pr-1">
            {waitingPatients.length === 0 ? (
              <p className="text-slate-500 py-4 text-center">No patients waiting</p>
            ) : (
              waitingPatients.map((item) => (
                <div
                  key={item.id}
                  className="bg-slate-900 border border-slate-700/80 px-5 py-3 rounded-2xl flex justify-between items-center"
                >
                  <span className="text-xl font-bold text-blue-400">Token #{item.queue_no}</span>
                  <span className="text-lg font-medium text-slate-200">{item.patients?.name}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-slate-500 border-t border-slate-800 pt-3">
        Automatic Realtime updates active
      </div>
    </main>
  );
}