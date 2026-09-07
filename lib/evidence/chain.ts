import { createClient } from '@/lib/supabase/client'

async function sha256(input: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Appends one new evidence row, linked to whatever the latest row's hash was.
export async function appendEvidence(scanId: string, imageHash: string, captureContext: object, packVersion: string) {
  const supabase = createClient()

  // Find the most recent evidence row system-wide — that's the link we chain onto.
  const { data: latest } = await supabase
    .from('evidence')
    .select('chain_hash')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const prevHash = latest?.chain_hash ?? 'genesis'
  const chainHash = await sha256(scanId + imageHash + prevHash)

  const { data, error } = await supabase
    .from('evidence')
    .insert({
      scan_id: scanId,
      image_hash: imageHash,
      prev_hash: prevHash,
      chain_hash: chainHash,
      capture_context: captureContext,
      pack_version: packVersion,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

// Walks every evidence row in order and recomputes each hash from scratch.
// If a row's stored data no longer produces its stored chain_hash, it's been tampered with.
export async function verifyChain() {
  const supabase = createClient()
  const { data: rows, error } = await supabase
    .from('evidence')
    .select('id, scan_id, image_hash, prev_hash, chain_hash, created_at')
    .order('created_at', { ascending: true })

  if (error) throw error

  const breaks: string[] = []
  for (const row of rows ?? []) {
    const expected = await sha256(row.scan_id + row.image_hash + (row.prev_hash ?? 'genesis'))
    if (expected !== row.chain_hash) {
      breaks.push(`Row ${row.id} (scan ${row.scan_id}) — expected ${expected}, stored ${row.chain_hash}. TAMPERED.`)
    }
  }
  return breaks
}