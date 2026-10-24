import { AppError } from '../utils/errors.js';

export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(
        new AppError({
          status: 400,
          code: 'VALIDATION_ERROR',
          message: 'Some submitted fields are invalid.',
          details: result.error.issues.map((issue) => ({
            field: issue.path.join('.') || source,
            message: issue.message,
          })),
        }),
      );
    }
    req[source] = result.data;
    next();
  };
}

export function parseObjectId(value, name = 'id') {
  if (!/^[a-f0-9]{24}$/i.test(String(value || ''))) {
    throw new AppError({
      status: 400,
      code: 'INVALID_IDENTIFIER',
      message: `Invalid ${name}.`,
    });
  }
  return String(value);
}
