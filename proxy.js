import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/signup'];
const LOCAL_MODE_COOKIE = 'dutyroster.local';

export async function proxy(request) {
  let supabaseResponse = NextResponse.next({ request });

  // Deployment without the Supabase env vars: serve every page in local-only
  // mode rather than crashing the proxy with "URL and Key are required".
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const localMode = request.cookies.get(LOCAL_MODE_COOKIE)?.value === '1';

  // Signed in, in local-only mode, or on an auth page → proceed.
  if (user || localMode || PUBLIC_PATHS.includes(path)) {
    return supabaseResponse;
  }

  // Signed out and not in local mode → send to login.
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = '/login';
  redirectUrl.searchParams.set('redirectedFrom', path.slice(1));
  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|apple-icon.png|icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)',
  ],
};