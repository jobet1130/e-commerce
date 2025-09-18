import { NextResponse } from "next/server";
import { clearAuthCookies } from "@/lib/auth/jwt";

export async function POST() {
  try {
    // Clear the auth cookies
    const response = NextResponse.json(
      { success: true, message: "Logout successful" },
      { status: 200 },
    );

    // Clear the HTTP-only cookies
    clearAuthCookies();

    return response;
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 },
    );
  }
}
