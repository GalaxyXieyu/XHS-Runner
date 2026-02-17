import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'xhs_runner_session';

function isPublicPath(pathname: string) {
  if (pathname === '/login' || pathname === '/register') return true;
  if (pathname.startsWith('/_next')) return true;
  if (pathname.startsWith('/public')) return true;
  if (pathname === '/favicon.ico') return true;
  // app auth endpoints are public (login/register)
  if (pathname.startsWith('/api/app-auth')) return true;
  // XHS login endpoints must be accessible after app login; they do their own auth checks.
  if (pathname.startsWith('/api/auth')) return true;
  return false;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Token validity is checked server-side on API calls; middleware just gates obvious anonymous access.
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api/health).*)'],
};
