"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="page-shell flex flex-1 items-center justify-center">
      <form onSubmit={handleLogin} className="panel w-full max-w-sm p-6">
        <p className="eyebrow">Legal Metrology Inspection</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Sign in</h1>
        <p className="mt-2 text-sm text-ink-muted">Officer credentials issued by the department.</p>

        <label className="mt-6 block text-sm font-semibold text-ink-muted">
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="officer@example.gov.in" type="email" autoComplete="username" required className="field-input" />
        </label>

        <label className="mt-4 block text-sm font-semibold text-ink-muted">
          Password
          <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" type="password" autoComplete="current-password" required className="field-input" />
        </label>

        {error && (
          <div role="alert" className="mt-4 rounded-xl border-2 border-verdict-violation-border bg-verdict-violation-surface p-4 text-sm text-verdict-violation">
            <p className="font-semibold">Sign-in failed</p>
            <p className="mt-1 leading-6">{error}</p>
          </div>
        )}

        <button type="submit" className="button-primary mt-6 w-full">Sign in</button>
      </form>
    </main>
  );
}
