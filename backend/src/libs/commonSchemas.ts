import { z } from 'zod';

export const responseActions = [
  'reloadReservation',
  'forceLogout',
  'historyBack',
  'reloadApp',
] as const;
export type ResponseAction = (typeof responseActions)[number];

const errorSchema = z.object({
  message: z.string().optional(),
  actions: z.array(z.enum(responseActions)).optional(),
  errors: z.any().optional(),
});

export const commonErrorsSchema = {
  400: errorSchema, // Bad Request
  401: errorSchema, // Unauthorized
  403: errorSchema, // Forbidden
  404: errorSchema, // Not Found
  409: errorSchema, // Conflict
  500: errorSchema, // Internal Server Error
};

export const commonRequestHeadersSchema = z.object({
  'x-tenant-id': z.string().optional(),
  'x-for-preflight': z.string().optional(),
  'x-client-version': z.string().optional(),
  'x-forwarded-for': z.string().optional(),
});

export const commonRequestHeadersKeys = Object.keys(
  commonRequestHeadersSchema.shape
);
