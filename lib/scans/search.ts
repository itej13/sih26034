import { createClient } from '@/lib/supabase/client'

export type ScanFilters = {
  verdict?: 'COMPLIANT' | 'NON_COMPLIANT' | 'INDETERMINATE'
  rule?: string
  dateFrom?: string
  dateTo?: string
  search?: string // matches manufacturer or product_name
}

export async function searchScans(filters: ScanFilters = {}) {
  const supabase = createClient()

  let query = supabase
    .from('scans')
    .select('id, captured_at, overall, manufacturer, product_name, rule_pack_id')
    .order('captured_at', { ascending: false })

  if (filters.verdict) query = query.eq('overall', filters.verdict)
  if (filters.dateFrom) query = query.gte('captured_at', filters.dateFrom)
  if (filters.dateTo) query = query.lte('captured_at', filters.dateTo)
  if (filters.search) {
    query = query.or(`manufacturer.ilike.%${filters.search}%,product_name.ilike.%${filters.search}%`)
  }

  const { data: scans, error } = await query
  if (error) throw error

  // Rule filter needs a join, so it's a separate step:
  // find scan_ids that have a finding matching this rule, then filter down.
  if (filters.rule) {
    const { data: matches, error: findErr } = await supabase
      .from('findings')
      .select('scan_id')
      .eq('rule', filters.rule)
    if (findErr) throw findErr
    const matchingIds = new Set((matches ?? []).map(m => m.scan_id))
    return (scans ?? []).filter(s => matchingIds.has(s.id))
  }

  return scans ?? []
}

export async function getScanById(id: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('scans')
    .select('*, findings(*), evidence(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}