import { NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";
import {
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/api/api-response";

import type { TokenPayload } from "@/lib/auth/jwt";

type AdminUser = TokenPayload;

type AdminResponse = AdminUser | NextResponse<{ error: string }>;

export function isAdminUser(response: unknown): response is AdminUser {
  return (
    response !== null &&
    typeof response === "object" &&
    "userId" in response &&
    "role" in response &&
    typeof (response as { userId: unknown }).userId === "string" &&
    typeof (response as { role: unknown }).role === "string"
  );
}

export async function requireAdmin(request: Request): Promise<AdminResponse> {
  const authHeader = request.headers.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return unauthorizedResponse("No token provided");
  }

  const token = authHeader.split(" ")[1];
  const user = verifyAccessToken(token) as TokenPayload | null;

  if (!user) {
    return unauthorizedResponse("Invalid or expired token");
  }

  if (user.role !== "ADMIN") {
    return forbiddenResponse("Insufficient permissions");
  }

  return user;
}
