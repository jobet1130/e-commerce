import jwt from "jsonwebtoken";
import { cookies as nextCookies } from "next/headers";

type TokenPayload = {
  userId: string;
  email: string;
  role: string;
};

export const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
export const REFRESH_TOKEN_SECRET =
  process.env.REFRESH_TOKEN_SECRET || "your-refresh-secret-key";

export const generateTokens = (payload: TokenPayload) => {
  const accessToken = jwt.sign(payload, JWT_SECRET, {
    expiresIn: "15m", // Access token expires in 15 minutes
  });

  const refreshToken = jwt.sign(payload, REFRESH_TOKEN_SECRET, {
    expiresIn: "7d", // Refresh token expires in 7 days
  });

  return { accessToken, refreshToken };
};

export const verifyAccessToken = (token: string) => {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch (error) {
    console.error("Access token verification error:", error);
    return null;
  }
};

export const verifyRefreshToken = (token: string) => {
  try {
    return jwt.verify(token, REFRESH_TOKEN_SECRET) as TokenPayload;
  } catch (error) {
    console.error("Refresh token verification error:", error);
    return null;
  }
};

// Server-side cookie setting function (for use in Server Components, Server Actions, or Route Handlers)
export const setAuthCookies = async (
  accessToken: string,
  refreshToken: string,
) => {
  const cookieStore = nextCookies();

  // In Next.js 13+, we need to use the cookie store from the request/response
  // This function should be used in a Server Component or Route Handler
  type CookieOptions = {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "strict" | "lax" | "none";
    maxAge?: number;
    path?: string;
    [key: string]: string | number | boolean | undefined;
  };

  const setCookie = (name: string, value: string, options: CookieOptions) => {
    if (typeof document !== "undefined") {
      // Client-side fallback (though this function should only run server-side)
      const cookieParts = [`${name}=${value}`];

      for (const [key, value] of Object.entries(options)) {
        if (value === true) {
          cookieParts.push(key);
        } else if (value !== undefined && value !== false) {
          cookieParts.push(`${key}=${value}`);
        }
      }

      document.cookie = cookieParts.join("; ");
    }
  };

  // Set access token cookie
  setCookie("accessToken", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 15 * 60, // 15 minutes
    path: "/",
  } as const);

  // Set refresh token cookie
  setCookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60, // 7 days
    path: "/",
  } as const);

  return cookieStore;
};

// Client-side cookie setting function (for use in client components)
// Note: This won't set HttpOnly cookies, so it's better to use server actions when possible
export const setClientAuthCookies = (
  accessToken: string,
  refreshToken: string,
) => {
  if (typeof window === "undefined") return;

  document.cookie = `accessToken=${accessToken}; Path=/; Max-Age=900; ${process.env.NODE_ENV === "production" ? "Secure; SameSite=Strict" : ""}`;
  document.cookie = `refreshToken=${refreshToken}; Path=/; Max-Age=604800; ${process.env.NODE_ENV === "production" ? "Secure; SameSite=Strict" : ""}`;
};

export const clearAuthCookies = () => {
  // In Next.js 13+, we need to use the cookies() API in a Server Component or Route Handler
  // This function returns the cookie strings that should be set in the response headers
  return [
    "accessToken=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly" +
      (process.env.NODE_ENV === "production"
        ? "; Secure; SameSite=Strict"
        : ""),
    "refreshToken=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly" +
      (process.env.NODE_ENV === "production"
        ? "; Secure; SameSite=Strict"
        : ""),
  ];
};
