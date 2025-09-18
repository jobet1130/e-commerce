import { NextRequest, NextResponse } from "next/server";
import {
  verifyRefreshToken,
  generateTokens,
  setAuthCookies,
} from "@/lib/auth/jwt";
import { prisma } from "@/lib/prisma";
import { RefreshTokenResponse } from "../types";

export async function POST(request: NextRequest) {
  try {
    // Get refresh token from cookies
    const refreshToken = request.cookies.get("refreshToken")?.value;

    if (!refreshToken) {
      return NextResponse.json(
        {
          success: false,
          message: "No refresh token provided",
        } as RefreshTokenResponse,
        { status: 401 },
      );
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);

    if (!decoded) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid refresh token",
        } as RefreshTokenResponse,
        { status: 401 },
      );
    }

    // Check if user still exists
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found" } as RefreshTokenResponse,
        { status: 404 },
      );
    }

    // Generate new tokens
    const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
      generateTokens({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

    // Create response
    const response = NextResponse.json(
      {
        success: true,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      } as RefreshTokenResponse,
      { status: 200 },
    );

    // Set new HTTP-only cookies
    setAuthCookies(newAccessToken, newRefreshToken);

    return response;
  } catch (error) {
    console.error("Refresh token error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Internal server error",
      } as RefreshTokenResponse,
      { status: 500 },
    );
  }
}
