'use client'

import { useState } from 'react'
import { uploadScan } from '@/lib/scans/upload'

export default function UploadTestPage() {
  const [result, setResult] = useState<string>('')

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const scan = await uploadScan(file)
      setResult(JSON.stringify(scan, null, 2))
    } catch (err) {
      setResult('ERROR: ' + (err as Error).message)
    }
  }

  return (
    <div style={{ padding: 32 }}>
      <h1>Upload test</h1>
      <input type="file" accept="image/*" onChange={handleFile} />
      <pre>{result}</pre>
    </div>
  )
}