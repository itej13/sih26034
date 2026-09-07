import { createClient } from '@/lib/supabase/client'

// Computes a SHA-256 hash of the raw file bytes.
// Why: this becomes the evidence fingerprint later (Day 2's hash chain).
// Computing it at upload time means we hash the ORIGINAL file,
// before anything else touches it.
async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function uploadScan(file: File) {
  const supabase = createClient()

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) throw new Error('Not logged in')

  const imageHash = await hashFile(file)
  const path = `${userData.user.id}/${crypto.randomUUID()}.jpg`

  // 1. Upload the actual bytes to Storage
  const { error: uploadError } = await supabase.storage
    .from('scan-photos')
    .upload(path, file)
  if (uploadError) throw uploadError

  // 2. Create the database row that POINTS to that file
  const { data: scan, error: insertError } = await supabase
    .from('scans')
    .insert({
      image_path: path,
      image_hash: imageHash,
      created_by: userData.user.id,
    })
    .select()
    .single()
  if (insertError) throw insertError
   const { appendEvidence } = await import('@/lib/evidence/chain')
  await appendEvidence(scan.id, imageHash, { device: 'browser test', uploaded_via: 'upload-test page' }, 'lmpc@2026-07-01')

  return scan
}