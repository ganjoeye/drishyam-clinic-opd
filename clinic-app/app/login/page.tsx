"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  async function handleLogin() {
    setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMsg("Login failed: " + error.message);
      return;
    }
    router.push("/reception");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-xl border p-6 space-y-3">
        <h1 className="text-xl font-semibold">Clinic login</h1>
        <input 
          className="w-full border rounded p-2" 
          placeholder="Email" 
          value={email} 
          onChange={(e) => setEmail(e.target.value)} 
        />
        <input 
          className="w-full border rounded p-2" 
          placeholder="Password" 
          type="password" 
          value={password} 
          onChange={(e) => setPassword(e.target.value)} 
        />
        <button className="w-full bg-black text-white rounded p-2" onClick={handleLogin}>
          Log in
        </button>
        {msg && <p className="text-sm text-red-600">{msg}</p>}
      </div>
    </main>
  );
}