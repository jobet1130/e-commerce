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

type CustomErrorData = {
  outOfStockItems?: Array<{
    productId: string;
    name: string;
    available: number;
  }>;
  [key: string]: unknown;
};

type ErrorObject =
  | Record<string, string | string[] | ZodErrorFormat>
  | ZodErrorFormat
  | CustomErrorData;

export function errorResponse(
  message: string,
  status: number = 400,
  errors: ErrorObject = {},
  options: ApiResponseOptions = {},
) {
  return NextResponse.json(
    {
      success: false,
      error: message,
      ...(Object.keys(errors).length > 0 && {
        errors: errors as Record<string, unknown>,
      }),
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

type ZodErrorFormat = {
  _errors?: string[];
  [key: string]: string | string[] | ZodErrorFormat | undefined;
};

export function badRequestResponse(
  message: string = "Bad request",
  errors: ErrorObject = {},
) {
  return errorResponse(message, 400, errors);
}

export function notFoundResponse(message: string = "Resource not found") {
  return errorResponse(message, 404);
}

export function serverErrorResponse(message: string = "Internal server error") {
  return errorResponse(message, 500);
}
