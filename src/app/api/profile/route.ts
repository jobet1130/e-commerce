import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { prisma } from "@/lib/prisma";

// Type for API response data
type ApiResponseData = Record<string, unknown> | null;

// Helper function to create a response with CORS headers
const createResponse = (data: ApiResponseData, status: number = 200) => {
  return NextResponse.json(data, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
};

// Handle OPTIONS request for CORS preflight
const handleOptions = () => {
  return createResponse({}, 200);
};

// Handle GET request to fetch user profile
export async function GET(request: NextRequest) {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return handleOptions();
  }

  try {
    // Get the access token from the Authorization header
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.split(" ")[1];

    if (!token) {
      return createResponse(
        { success: false, message: "No token provided" },
        401,
      );
    }

    // Verify the access token
    const decoded = verifyAccessToken(token);
    if (!decoded) {
      return createResponse(
        { success: false, message: "Invalid or expired token" },
        401,
      );
    }

    // Fetch user data from the database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      return createResponse({ success: false, message: "User not found" }, 404);
    }

    return createResponse({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("Profile fetch error:", error);
    return createResponse(
      { success: false, message: "Internal server error" },
      500,
    );
  }
}

// Handle OPTIONS method for CORS
// This is required for CORS preflight requests
export async function OPTIONS() {
  return handleOptions();
}
