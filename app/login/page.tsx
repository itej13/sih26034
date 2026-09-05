'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  const inputClass =
    'mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-blue-800 focus:ring-2 focus:ring-blue-100'

  return (
    <main className="page-shell flex flex-1 items-center justify-center">
      <form onSubmit={handleLogin} className="panel w-full max-w-sm p-6">
        <p className="eyebrow">Legal Metrology Inspection</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Sign in</h1>

        <label className="mt-6 block text-sm font-semibold text-slate-700">
          Email
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="email"
            type="email"
            required
            className={inputClass}
          />
        </label>

        <label className="mt-4 block text-sm font-semibold text-slate-700">
          Password
          <input
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="password"
            type="password"
            required
            className={inputClass}
          />
        </label>

        {error && (
          <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-semibold">Sign-in failed</p>
            <p className="mt-1">{error}</p>
          </div>
        )}

        <button type="submit" className="button-primary mt-6 w-full">Sign in</button>
      </form>
    </main>
  )
}
