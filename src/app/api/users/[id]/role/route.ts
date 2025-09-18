import { NextRequest } from "next/server";
import { isAdminUser } from "@/middleware/admin";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/middleware/admin";
import {
  successResponse,
  errorResponse,
  notFoundResponse,
  serverErrorResponse,
  forbiddenResponse,
} from "@/lib/api/api-response";

// PATCH /api/users/[id]/role - Update user role (admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    // Check admin access
    const adminResponse = await requireAdmin(request);
    if (!isAdminUser(adminResponse)) {
      return adminResponse;
    }

    const { userId } = adminResponse;
    const targetUserId = params.id;
    const { role } = await request.json();

    // Validate role
    if (!["USER", "ADMIN", "MANAGER", "STAFF", "DELIVERY"].includes(role)) {
      return errorResponse("Invalid role", 400);
    }

    // Prevent changing own role
    if (userId === targetUserId && role !== "ADMIN") {
      return forbiddenResponse("Cannot change your own role");
    }

    // Update user role
    const user = await prisma.user.update({
      where: { id: targetUserId },
      data: { role },
      select: {
        id: true,
        email: true,
        role: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return notFoundResponse("User not found");
    }

    return successResponse({
      message: "User role updated successfully",
      user,
    });
  } catch (error) {
    console.error("Error updating user role:", error);
    return serverErrorResponse("Failed to update user role");
  }
}
