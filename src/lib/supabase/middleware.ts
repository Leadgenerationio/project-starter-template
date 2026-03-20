import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // Allow public routes
  const publicRoutes = ['/login', '/register', '/forgot-password', '/api/health', '/api/auth']
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route))
  const isInviteRoute = pathname.startsWith('/invite/')
  const isMfaRoute = pathname === '/mfa-verify'

  if (!user && !isPublicRoute && !isInviteRoute && !isMfaRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && (pathname === '/login' || pathname === '/register')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Enforce MFA: if user has TOTP factors enrolled but session is only AAL1, redirect to /mfa-verify
  if (user && !isPublicRoute && !isMfaRoute) {
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aalData && aalData.nextLevel === 'aal2' && aalData.currentLevel === 'aal1') {
      const url = request.nextUrl.clone()
      url.pathname = '/mfa-verify'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
