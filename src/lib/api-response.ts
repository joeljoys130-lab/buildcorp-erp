/**
 * api-response.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Standardized API response wrappers for BuildCorp ERP SaaS endpoints.
 */

import { NextApiResponse } from 'next';

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiErrorDetails {
  code: string;
  message: string;
  details?: any;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorDetails;
  requestId?: string;
}

export class ApiResponse {
  static success<T>(res: NextApiResponse, data: T, message?: string, statusCode: number = 200) {
    return res.status(statusCode).json({
      success: true,
      data,
      ...(message ? { message } : {}),
    } as ApiSuccessResponse<T>);
  }

  static error(
    res: NextApiResponse,
    message: string,
    code: string = 'BAD_REQUEST',
    statusCode: number = 400,
    details?: any,
  ) {
    const requestId = `REQ-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
    return res.status(statusCode).json({
      success: false,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
      requestId,
    } as ApiErrorResponse);
  }

  static unauthorized(res: NextApiResponse, message: string = 'Authentication required') {
    return ApiResponse.error(res, message, 'UNAUTHORIZED', 401);
  }

  static forbidden(res: NextApiResponse, message: string = 'Access denied for this tenant or role') {
    return ApiResponse.error(res, message, 'FORBIDDEN', 403);
  }

  static notFound(res: NextApiResponse, message: string = 'Resource not found') {
    return ApiResponse.error(res, message, 'NOT_FOUND', 404);
  }

  static serverError(res: NextApiResponse, message: string = 'An unexpected server error occurred') {
    return ApiResponse.error(res, message, 'INTERNAL_SERVER_ERROR', 500);
  }
}
