import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/middleware/admin";
import { verifyAccessToken } from "@/lib/auth/jwt";
import {
  successResponse,
  notFoundResponse,
  serverErrorResponse,
  unauthorizedResponse,
  forbiddenResponse,
  badRequestResponse,
} from "@/lib/api/api-response";

// GET /api/users/[id] - Get user by ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const userId = params.id;
    const authHeader = request.headers.get("authorization");

    // If no auth header, return public profile (if allowed)
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      // For public access, only return basic info
      const user = await prisma.user.findUnique({
        where: { id: userId, isActive: true },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          profileImage: true,
          isActive: true,
          createdAt: true,
        },
      });

      if (!user) {
        return notFoundResponse("User not found");
      }

      return successResponse(user);
    }

    // For authenticated users, check if they can view the profile
    const token = authHeader.split(" ")[1];
    const currentUser = requireAccessToken(token);

    if (currentUser instanceof NextResponse) return currentUser;

    // If user is not admin and not the profile owner
    if (currentUser.userId !== userId && currentUser.role !== "ADMIN") {
      return forbiddenResponse("Insufficient permissions");
    }

    // Get full profile for the user or admin
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        phone: true,
        dateOfBirth: true,
        isVerified: true,
        loyaltyPoints: true,
        profileImage: true,
        isActive: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
        addresses: {
          select: {
            id: true,
            street: true,
            city: true,
            state: true,
            postalCode: true,
            country: true,
            isDefault: true,
          },
        },
      },
    });

    if (!user) {
      return notFoundResponse("User not found");
    }

    return successResponse(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    return serverErrorResponse("Failed to fetch user");
  }
}

// PATCH /api/users/[id] - Update user profile
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const userId = params.id;
    const data = await request.json();

    // Check authentication
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return unauthorizedResponse("Authentication required");
    }

    const token = authHeader.split(" ")[1];
    const currentUser = requireAccessToken(token);
    if (currentUser instanceof NextResponse) return currentUser;

    // Check if user is updating their own profile or is admin
    if (currentUser.userId !== userId && currentUser.role !== "ADMIN") {
      return forbiddenResponse("You can only update your own profile");
    }

    // Prevent role updates for non-admin users
    if (data.role && currentUser.role !== "ADMIN") {
      return forbiddenResponse("Only admins can update user roles");
    }

    // Prevent isActive updates for non-admin users
    if (data.isActive !== undefined && currentUser.role !== "ADMIN") {
      return forbiddenResponse("Only admins can deactivate accounts");
    }

    // Initialize update data object with non-sensitive fields
    const updateData = { ...data };

    // Remove sensitive fields that will be handled separately
    delete updateData.password;
    delete updateData.email;

    // Handle email update if provided
    if (data.email && data.email !== currentUser.email) {
      // Check if the new email is already in use
      const existingUser = await prisma.user.findUnique({
        where: { email: data.email },
      });

      if (existingUser) {
        return badRequestResponse("Email is already in use");
      }
      updateData.email = data.email;
    }

    // Handle password update if provided
    if (data.password) {
      // In a real app, you should validate password strength here
      if (data.password.length < 8) {
        return badRequestResponse(
          "Password must be at least 8 characters long",
        );
      }
      // Hash the new password
      const bcrypt = await import("bcryptjs");
      updateData.password = await bcrypt.hash(data.password, 10);
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        phone: true,
        dateOfBirth: true,
        profileImage: true,
        isActive: true,
        updatedAt: true,
      },
    });

    return successResponse(updatedUser);
  } catch (error) {
    console.error("Error updating user:", error);
    return serverErrorResponse("Failed to update user");
  }
}

// DELETE /api/users/[id] - Delete user (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const userId = params.id;

    // Check admin access
    const adminCheck = await requireAdmin(request);
    if (adminCheck instanceof NextResponse) return adminCheck;

    // Soft delete by setting isActive to false
    const user = await prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
      select: {
        id: true,
        email: true,
        isActive: true,
      },
    });

    return successResponse({
      message: "User deactivated successfully",
      user,
    });
  } catch (error) {
    console.error("Error deactivating user:", error);
    return serverErrorResponse("Failed to deactivate user");
  }
}

// Helper function to verify access token
function requireAccessToken(token: string) {
  const user = verifyAccessToken(token);
  if (!user) {
    return unauthorizedResponse("Invalid or expired token");
  }
  return user;
}
