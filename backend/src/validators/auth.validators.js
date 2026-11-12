import { z } from 'zod';

const phone = z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number');

export const requestOtpSchema = z.object({
  phone,
  name: z.string().trim().min(1).max(120).optional(),
});

export const verifyOtpSchema = z.object({
  phone,
  code: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits'),
  name: z.string().trim().min(1).max(120).optional(),
});

export const dashboardLoginSchema = z.object({
  email: z.email().trim(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

/** Express middleware factory: validates req.body against a zod schema. */
export const validateBody = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return next(Object.assign(new Error('Validation failed'), { statusCode: 400, details }));
  }
  req.body = result.data;
  next();
};
