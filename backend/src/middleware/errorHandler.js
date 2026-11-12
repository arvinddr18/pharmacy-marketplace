import { isProd } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

export function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  let statusCode = err.statusCode ?? 500;
  let message = err.message ?? 'Internal server error';
  let details = err.details;

  // Mongoose validation / duplicate-key errors → 400/409
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err.code === 11000) {
    statusCode = 409;
    message = 'Duplicate value';
    details = err.keyValue;
  }

  if (statusCode >= 500) {
    console.error('[error]', err);
  }

  res.status(statusCode).json({
    error: { message, ...(details ? { details } : {}) },
    ...(isProd ? {} : { stack: statusCode >= 500 ? err.stack : undefined }),
  });
}
