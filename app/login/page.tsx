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

  return (
    <form onSubmit={handleLogin} style={{ maxWidth: 320, margin: '4rem auto' }}>
      <h1>Sign in</h1>
      <input value={email} onChange={e => setEmail(e.target.value)} placeholder="email" type="email" required />
      <input value={password} onChange={e => setPassword(e.target.value)} placeholder="password" type="password" required />
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <button type="submit">Sign in</button>
    </form>
  )
}