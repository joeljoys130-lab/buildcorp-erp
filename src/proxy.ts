import { NextResponse, type NextRequest } from 'next/server';
import { clerkMiddleware } from '@clerk/nextjs/server';

/**
 * Next.js 16 Proxy configuration using Clerk middleware with legacy fallback.
 * Uses direct path matching to eliminate createRouteMatcher deprecation warnings.
 */
const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth',
  '/api/request-otp',
  '/api/verify-otp',
  '/api/logout',
  '/sw.js',
  '/favicon.ico',
];

const isPublicRoute = (pathname: string): boolean => {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
};

const CLERK_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  'pk_test_c2hhcnAtcGlnbGV0LTg0ODEuY2xlcmsuYWNjb3VudHMuZGV2JA';
const hasClerkKey = Boolean(CLERK_PUBLISHABLE_KEY);

const legacyHandler = (request: NextRequest) => {
  const { pathname } = request.nextUrl;
  if (!isPublicRoute(pathname)) {
    const legacyToken = request.cookies.get('auth_token')?.value;
    if (!legacyToken) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }
  return NextResponse.next();
};

const clerkHandler = hasClerkKey
  ? clerkMiddleware(
      async (auth, request) => {
        const { pathname } = request.nextUrl;

        // If not a public route, enforce authentication
        if (!isPublicRoute(pathname)) {
          // Check if legacy authentication token is present to ensure seamless migration
          const legacyToken = request.cookies.get('auth_token')?.value;
          if (!legacyToken) {
            await auth.protect();
          }
        }
      },
      {
        publishableKey: CLERK_PUBLISHABLE_KEY,
      }
    )
  : legacyHandler;

// Support both Next.js 16 named `proxy` export and default export
export const proxy = clerkHandler;
export default clerkHandler;

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
