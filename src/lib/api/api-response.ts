import { NextResponse } from "next/server";

type ApiResponseOptions = {
  status?: number;
  headers?: Record<string, string>;
};

export function successResponse<T = unknown>(
  data: T,
  options: ApiResponseOptions = {},
) {
  return NextResponse.json(
    { success: true, data },
    {
      status: options.status || 200,
      headers: options.headers,
    },
  );
}

export function errorResponse(
  message: string,
  status: number = 400,
  errors: Record<string, string> = {},
  options: ApiResponseOptions = {},
) {
  return NextResponse.json(
    {
      success: false,
      error: message,
      ...(Object.keys(errors).length > 0 && { errors }),
    },
    {
      status,
      headers: options.headers,
    },
  );
}

export function unauthorizedResponse(message: string = "Unauthorized") {
  return errorResponse(message, 401);
}

export function forbiddenResponse(message: string = "Forbidden") {
  return errorResponse(message, 403);
}

export function badRequestResponse(
  message: string = "Bad request",
  errors: Record<string, string> = {},
) {
  return errorResponse(message, 400, errors);
}

export function notFoundResponse(message: string = "Resource not found") {
  return errorResponse(message, 404);
}

export function serverErrorResponse(message: string = "Internal server error") {
  return errorResponse(message, 500);
}
