import type { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import { errorBody } from "../lib/errorEnvelope";

interface ValidationSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

export function validate(schemas: ValidationSchemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query);
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map((err) => ({
          field: err.path.join("."),
          message: err.message,
        }));

        // Find the first informative message to show at the top level
        const firstError = errors[0];
        const defaultMessage = firstError
          ? `${firstError.field}: ${firstError.message}`
          : "Validation failed";

        return res.status(400).json({
          ...errorBody(
            defaultMessage,
            req.requestId ?? "unscoped",
            "VALIDATION_FAILED",
          ),
          errors,
        });
      }
      next(error);
    }
  };
}
