import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAccessToken } from "./jwt";
import { prisma } from "../prisma";

type Role = "USER" | "STAFF" | "MANAGER" | "ADMIN";

interface AuthUser {
  userId: string;
  email: string;
  role: Role;
}

export const withAuth = (
  handler: (req: NextRequest, user: AuthUser) => Promise<NextResponse>,
  requiredRoles: Role[] = [],
) => {
  return async (req: NextRequest) => {
    try {
      // Get the access token from the Authorization header
      const authHeader = req.headers.get("authorization");
      const token = authHeader?.split(" ")[1];

      if (!token) {
        return NextResponse.json(
          { success: false, message: "No token provided" },
          { status: 401 },
        );
      }

      // Verify the access token
      const decoded = verifyAccessToken(token);
      if (!decoded) {
        return NextResponse.json(
          { success: false, message: "Invalid or expired token" },
          { status: 401 },
        );
      }

      // Check if user exists and is active
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, email: true, role: true, isActive: true },
      });

      if (!user || !user.isActive) {
        return NextResponse.json(
          { success: false, message: "User not found or inactive" },
          { status: 401 },
        );
      }

      // Check if user has required role
      if (
        requiredRoles.length > 0 &&
        !requiredRoles.includes(user.role as Role)
      ) {
        return NextResponse.json(
          { success: false, message: "Insufficient permissions" },
          { status: 403 },
        );
      }

      // Call the handler with the authenticated user
      return handler(req, {
        userId: user.id,
        email: user.email,
        role: user.role as Role,
      });
    } catch (error) {
      console.error("Auth middleware error:", error);
      return NextResponse.json(
        { success: false, message: "Authentication error" },
        { status: 500 },
      );
    }
  };
};

// Role-based access control helper
export const hasRole = (userRole: Role, requiredRole: Role): boolean => {
  const roleHierarchy: Record<Role, number> = {
    USER: 1,
    STAFF: 2,
    MANAGER: 3,
    ADMIN: 4,
  };
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
};
