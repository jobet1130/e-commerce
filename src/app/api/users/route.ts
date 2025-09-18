import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/middleware/admin";
import { successResponse, serverErrorResponse } from "@/lib/api/api-response";

// Type for user query parameters
type UserQueryParams = {
  page?: string;
  limit?: string;
  search?: string;
};

// Helper to get query params with defaults
const getQueryParams = (request: NextRequest): UserQueryParams => {
  const searchParams = request.nextUrl.searchParams;

  const getStringParam = (key: string, defaultValue: string): string => {
    const value = searchParams.get(key);
    return value !== null ? value.toString() : defaultValue;
  };

  return {
    page: getStringParam("page", "1"),
    limit: getStringParam("limit", "10"),
    search: getStringParam("search", ""),
  };
};

// GET /api/users - Get all users (admin only)
export async function GET(request: NextRequest) {
  try {
    // Check admin access
    const adminCheck = await requireAdmin(request);
    if (adminCheck instanceof NextResponse) return adminCheck;

    // Parse and validate pagination parameters
    const { search } = getQueryParams(request);

    // Get and validate page number
    const pageNum = Math.max(
      1,
      parseInt(request.nextUrl.searchParams.get("page") || "1", 10) || 1,
    );

    // Get and validate limit (enforce a reasonable maximum)
    const limitNum = Math.min(
      100, // Maximum allowed limit
      Math.max(
        1,
        parseInt(request.nextUrl.searchParams.get("limit") || "10", 10) || 10,
      ),
    );

    const skip = (pageNum - 1) * limitNum;

    // Build search conditions
    const searchCondition =
      search && search.trim() !== ""
        ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" as const } },
              { lastName: { contains: search, mode: "insensitive" as const } },
              { email: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : undefined;

    // Get users with pagination and search
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: {
          ...searchCondition,
        },
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
        },
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count({
        where: searchCondition,
      }),
    ]);

    return successResponse({
      users,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return serverErrorResponse("Failed to fetch users");
  }
}
