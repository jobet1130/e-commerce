import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";

// Define the roles in order of increasing privileges
const ROLES = ["USER", "STAFF", "MANAGER", "ADMIN"] as const;
type Role = (typeof ROLES)[number];

/**
 * Middleware function to verify if the user has admin or manager role
 * @param request NextRequest object
 * @returns NextResponse or undefined if user is authorized
 */
export async function requireAdminOrManager(request: Request) {
  const token = (
    request as unknown as {
      cookies?: { get: (name: string) => { value: string } | undefined };
    }
  ).cookies?.get("accessToken")?.value;

  if (!token) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const decoded = verifyAccessToken(token);

  if (!decoded) {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 },
    );
  }

  const userRole = decoded.role as Role;

  if (userRole !== "ADMIN" && userRole !== "MANAGER") {
    return NextResponse.json(
      { error: "Insufficient permissions" },
      { status: 403 },
    );
  }

  // If we get here, the user is authorized
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (auth routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes that don't require authentication
  const publicPaths = ["/login", "/register", "/"];
  const isPublicPath = publicPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  // Get the token from the request cookies
  const token = request.cookies.get("accessToken")?.value;

  // If it's a public path, allow access
  if (isPublicPath) {
    return NextResponse.next();
  }

  // If no token and not a public path, redirect to login
  if (!token) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Verify the token
  const decoded = verifyAccessToken(token);

  // If token is invalid, redirect to login
  if (!decoded) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Check role-based access if needed
  const userRole = decoded.role as Role;

  // Example: Protect admin routes - user must have ADMIN role
  if (pathname.startsWith("/admin") && !hasRequiredRole(userRole, "ADMIN")) {
    // Redirect to unauthorized or home page
    const homeUrl = new URL("/", request.url);
    return NextResponse.redirect(homeUrl);
  }

  // Continue with the request
  return NextResponse.next();
}

// Helper function to check if user has required role
function hasRequiredRole(userRole: Role, requiredRole: Role): boolean {
  return ROLES.indexOf(userRole) >= ROLES.indexOf(requiredRole);
}
