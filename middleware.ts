import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Refreshes the Supabase session on every request. Without this, a request handled by a
// Server Component alone can never renew an expiring session — lib/supabase/server.ts's
// cookie writer is a no-op there (Server Components can't set cookies), so the refreshed
// token from createClient/createServerClient had nowhere to land until this file existed.
// This does not gate any route: the app has no auth-based redirects yet, so it only
// refreshes and passes the request through.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  // This runs on every route, so it must not be the thing that takes the app down. With no
  // Supabase project configured — a fresh clone, a teammate's laptop, the demo machine before
  // someone remembers the .env — createServerClient(undefined!, undefined!) throws, and
  // because middleware wraps every request the whole site 500s rather than just the pages
  // that actually need auth. Nothing here is authenticated yet, so pass through instead.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return response

  const supabase = createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet, headers) => {
          // Cookies must land on both request and response: the request copy so any
          // downstream Server Component sees the refreshed session this render, the
          // response copy so the browser gets it for the next request.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
          Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value))
        },
      },
    }
  )

  // Forces the auth server round trip that actually refreshes an expiring token; a
  // cheaper getSession() would just read the existing cookie back without renewing it.
  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
