
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (loading) return;

    setMsg("");
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error || !data.user) {
        setMsg("Login failed: " + (error?.message ?? "User not found."));
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("doctor_profiles")
        .select("id")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (profileError) {
        await supabase.auth.signOut();
        setMsg("Could not verify doctor profile: " + profileError.message);
        return;
      }

      if (profile) {
        router.replace("/doctor");
      } else {
        router.replace("/reception");
      }
    } catch {
      setMsg("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-xl border p-6 space-y-3">
        <h1 className="text-xl font-semibold">Clinic login</h1>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void handleLogin();
          }}
        >
          <input
            className="w-full border rounded p-2"
            placeholder="Email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            className="w-full border rounded p-2"
            placeholder="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            className="w-full bg-black text-white rounded p-2 disabled:opacity-50"
            type="submit"
            disabled={loading}
          >
            {loading ? "Logging in..." : "Log in"}
          </button>
        </form>

        {msg && (
          <p className="text-sm text-red-600 break-words">{msg}</p>
        )}
      </div>
    </main>
  );
}
