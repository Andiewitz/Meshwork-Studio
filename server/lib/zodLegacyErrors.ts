import { z } from "zod";

// Keep established default validation messages while upgrading the parser.
// Schema-specific messages still take precedence over this fallback.
z.config({
  customError: (issue) => {
    if (issue.code === "invalid_type") {
      if (issue.input === undefined) return "Required";
      const expected = issue.expected === "int" ? "integer" : issue.expected;
      const received =
        issue.input === null
          ? "null"
          : Array.isArray(issue.input)
            ? "array"
            : typeof issue.input === "number" && !Number.isInteger(issue.input)
              ? "float"
              : typeof issue.input;
      return `Expected ${expected}, received ${received}`;
    }
    if (issue.code === "invalid_format") {
      if (issue.format === "regex") return "Invalid";
      if (issue.format) return `Invalid ${issue.format}`;
    }
    if (issue.code === "too_small" || issue.code === "too_big") {
      const small = issue.code === "too_small";
      const boundary = small ? issue.minimum : issue.maximum;
      const direction = small ? "at least" : "at most";
      if (issue.origin === "string")
        return `String must contain ${direction} ${boundary} character(s)`;
      if (issue.origin === "array")
        return `Array must contain ${direction} ${boundary} element(s)`;
      if (issue.origin === "number" || issue.origin === "int")
        return `Number must be ${small ? "greater" : "less"} than${issue.inclusive ? " or equal to" : ""} ${boundary}`;
    }
    if (issue.code === "invalid_value") {
      if (issue.input === undefined) return "Required";
      if (issue.inst?.constructor.name === "ZodLiteral")
        return `Invalid literal value, expected ${JSON.stringify(issue.values[0])}`;
      const options = issue.values
        .map((value) => `'${String(value)}'`)
        .join(" | ");
      return `Invalid enum value. Expected ${options}, received '${String(issue.input)}'`;
    }
    return undefined;
  },
});
