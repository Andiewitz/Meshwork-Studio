import type { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import { fail } from "../lib/errorEnvelope";
import { firstIssueMessage, zodIssues } from "../lib/validation";

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
        return fail(req, res, "VALIDATION_FAILED", firstIssueMessage(error), {
          issues: zodIssues(error),
        });
      }
      next(error);
    }
  };
}
