'use client'

import { useState } from 'react'
import { verifyChain } from '@/lib/evidence/chain'

export default function VerifyTestPage() {
  const [result, setResult] = useState<string>('')

  async function runCheck() {
    try {
      const breaks = await verifyChain()
      setResult(
        breaks.length === 0
          ? 'Chain intact — no tampering detected.'
          : breaks.join('\n')
      )
    } catch (err) {
      setResult('ERROR: ' + (err as Error).message)
    }
  }

  return (
    <div style={{ padding: 32 }}>
      <h1>Verify evidence chain</h1>
      <button onClick={runCheck}>Run check</button>
      <pre>{result}</pre>
    </div>
  )
}