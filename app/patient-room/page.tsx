
"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type ActiveVisit = {
  id: string;
  queue_no: number;
  status: string;
  patients: {
    name: string;
  } | null;
};

function getLocalDate() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function PatientRoomPage() {
  const [activeVisit, setActiveVisit] = useState<ActiveVisit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cameraStarted, setCameraStarted] = useState(false);

  const doctorStreamId = "DrishyamDoctor2026";
  const patientStreamId = "DrishyamPatient2026";

  const loadActiveVisit = useCallback(async () => {
    try {
      const { data, error: queryError } = await supabase
        .from("visits")
        .select("id, queue_no, status, patients(name)")
        .eq("visit_date", getLocalDate())
        .eq("status", "in-consultation")
        .order("queue_no", { ascending: true })
        .limit(1);

      if (queryError) throw queryError;

      const visit = ((data ?? []) as unknown as ActiveVisit[])[0] ?? null;

      setActiveVisit((previous) => {
        if (previous?.id !== visit?.id) {
          setCameraStarted(false);
        }
        return visit;
      });

      setError("");
    } catch (err) {
      console.error("Patient room queue error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Patient queue load nahi hui."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadActiveVisit();

    const interval = window.setInterval(() => {
      void loadActiveVisit();
    }, 5000);

    const channel = supabase
      .channel("patient-room-active-visit")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "visits",
        },
        () => {
          void loadActiveVisit();
        }
      )
      .subscribe();

    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [loadActiveVisit]);

  const doctorVideoUrl =
    `https://vdo.ninja/?view=${doctorStreamId}&autoplay`;

  const patientVideoUrl =
    `https://vdo.ninja/?push=${patientStreamId}&webcam&quality=0`;

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-4 py-5 sm:px-6">
        <header className="mb-4 text-center">
          <h1 className="text-3xl font-extrabold tracking-wide text-blue-400">
            DRISHYAM
          </h1>
          <p className="mt-1 text-sm font-medium tracking-widest text-slate-300">
            CLINIC
          </p>
          <p className="mt-2 text-xs text-slate-400">
            VIDEO CONSULTATION ROOM
          </p>
        </header>

        <section className="mb-4 rounded-2xl border border-slate-700 bg-slate-900 p-4 text-center">
          <p className="text-sm font-semibold text-slate-300">
            CURRENT PATIENT TOKEN
          </p>

          {loading ? (
            <p className="mt-3 text-slate-400">Checking reception queue...</p>
          ) : activeVisit ? (
            <>
              <p className="mt-2 text-5xl font-black text-blue-400">
                #{activeVisit.queue_no}
              </p>
              <p className="mt-2 text-xl font-semibold">
                {activeVisit.patients?.name ?? "Patient"}
              </p>
              <span className="mt-3 inline-block rounded-full bg-emerald-950 px-4 py-2 text-xs font-bold text-emerald-300">
                SENT FOR CONSULTATION
              </span>
            </>
          ) : (
            <>
              <p className="mt-3 text-2xl font-bold text-slate-500">—</p>
              <p className="mt-2 text-slate-300">
                Waiting for reception to send a patient
              </p>
              <p className="mt-2 text-xs text-slate-500">
                This screen updates automatically.
              </p>
            </>
          )}

          {error && (
            <div className="mt-3 rounded-lg border border-red-700 bg-red-950 p-3 text-left text-sm text-red-200">
              {error}
              <button
                type="button"
                onClick={() => void loadActiveVisit()}
                className="ml-2 underline"
              >
                Retry
              </button>
            </div>
          )}
        </section>

        {activeVisit && (
          <>
            <section className="mb-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-base font-bold text-emerald-300">
                  Doctor
                </h2>
                <span className="rounded-full bg-emerald-950 px-3 py-1 text-xs text-emerald-300">
                  LIVE VIDEO
                </span>
              </div>

              <div className="aspect-[3/4] overflow-hidden rounded-2xl border border-emerald-700 bg-black shadow-lg">
                <iframe
                  key={`doctor-${activeVisit.id}`}
                  src={doctorVideoUrl}
                  title="Doctor Live Video"
                  className="h-full w-full border-0"
                  allow="autoplay; microphone; camera; encrypted-media; picture-in-picture"
                  referrerPolicy="no-referrer"
                />
              </div>
            </section>

            <section className="mb-4">
              <h2 className="mb-2 text-base font-bold text-blue-300">
                Patient Camera
              </h2>

              {!cameraStarted ? (
                <button
                  type="button"
                  onClick={() => setCameraStarted(true)}
                  className="w-full rounded-xl bg-blue-600 px-4 py-4 font-bold hover:bg-blue-700"
                >
                  Start Patient Camera
                </button>
              ) : (
                <div className="aspect-video overflow-hidden rounded-2xl border border-blue-700 bg-black">
                  <iframe
                    key={`patient-${activeVisit.id}`}
                    src={patientVideoUrl}
                    title="Patient Camera and Microphone"
                    className="h-full w-full border-0"
                    allow="camera; microphone; autoplay; display-capture; encrypted-media"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}

              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                Camera aur microphone permission maangne par Allow karein.
                Doctor ko patient ki video receive karne ke liye doctor page
                par bhi patient stream connect karna zaroori hai.
              </p>
            </section>
          </>
        )}

        <footer className="mt-auto border-t border-slate-800 pt-4 text-center">
          <p className="text-sm font-medium text-slate-300">
            DRISHYAM CLINIC
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Your health, our priority
          </p>
        </footer>
      </div>
    </main>
  );
}
