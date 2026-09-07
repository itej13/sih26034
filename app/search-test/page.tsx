'use client'

import { useState } from 'react'
import { searchScans } from '@/lib/scans/search'

export default function SearchTestPage() {
  const [result, setResult] = useState('')
  const [text, setText] = useState('')

  async function runSearch() {
    try {
      const scans = await searchScans({ search: text })
      setResult(JSON.stringify(scans, null, 2))
    } catch (err) {
      setResult('ERROR: ' + (err as Error).message)
    }
  }

  return (
    <div style={{ padding: 32 }}>
      <h1>Search test</h1>
      <input value={text} onChange={e => setText(e.target.value)} placeholder="manufacturer or product name" />
      <button onClick={runSearch}>Search</button>
      <pre>{result}</pre>
    </div>
  )
}