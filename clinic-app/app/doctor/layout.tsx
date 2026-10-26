
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

export default function DoctorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;

    async function checkDoctorLogin() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!active) return;

      if (!session) {
        router.replace("/login");
        return;
      }

      const { data: profile, error } = await supabase
        .from("doctor_profiles")
        .select("id")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!active) return;

      if (error || !profile) {
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      setChecking(false);
    }

    void checkDoctorLogin();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        router.replace("/login");
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

  if (checking) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p>Checking doctor login...</p>
      </main>
    );
  }

  return <>{children}</>;
}
