import { supabase } from "../lib/supabase";

export default function Home() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">Smart OPD - Clinic App</h1>
      <p className="text-gray-600 mt-2">Supabase connected successfully!</p>
    </main>
  );
}