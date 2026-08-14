// Validates req[source] against a Zod schema, replacing it with parsed data.
export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(result.error); // handled by central errorHandler (ZodError branch)
    }
    req[source] = result.data;
    next();
  };
}
