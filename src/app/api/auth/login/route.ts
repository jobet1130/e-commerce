import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { comparePasswords } from "@/lib/auth/password";
import { generateTokens, setAuthCookies } from "@/lib/auth/jwt";
import { LoginRequest, AuthResponse } from "../types";

export async function POST(request: Request) {
  try {
    const { email, password }: LoginRequest = await request.json();

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    // Check if user exists
    if (!user) {
      return NextResponse.json(
        { success: false, message: "Invalid credentials" } as AuthResponse,
        { status: 401 },
      );
    }

    // Check if password is correct
    const isPasswordValid = await comparePasswords(password, user.password);
    if (!isPasswordValid) {
      return NextResponse.json(
        { success: false, message: "Invalid credentials" } as AuthResponse,
        { status: 401 },
      );
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Create response
    const response = NextResponse.json(
      {
        success: true,
        message: "Login successful",
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
        accessToken,
        refreshToken,
      } as AuthResponse,
      { status: 200 },
    );

    // Set HTTP-only cookies
    setAuthCookies(accessToken, refreshToken);

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" } as AuthResponse,
      { status: 500 },
    );
  }
}
