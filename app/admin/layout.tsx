import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  // Step 1: are they even logged in?
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Step 2: look up their role from the profiles table.
  // Why look it up instead of trusting something from the client:
  // anything sent by the browser can be faked. The role has to come
  // from a server-side query the user can't tamper with.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    redirect('/upload-test') // not an admin, bounce them somewhere safe
  }

  return <>{children}</>
}