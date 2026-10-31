import { createHash } from "node:crypto";

export const sources = new Set([
  "CustomEmailSender_SignUp",
  "CustomEmailSender_ResendCode",
  "CustomEmailSender_ForgotPassword",
  "CustomEmailSender_UpdateUserAttribute",
  "CustomEmailSender_VerifyUserAttribute",
  "CustomEmailSender_AdminCreateUser",
  "CustomEmailSender_Authentication",
  "CustomEmailSender_AccountTakeOverNotification",
]);
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export const recipientKey = (email) => hash(email.trim().toLowerCase());
export function validateJob(job) {
  if (
    job?.version !== 1 ||
    !sources.has(job.source) ||
    typeof job.pool !== "string" ||
    !job.pool ||
    typeof job.to !== "string" ||
    job.to.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(job.to) ||
    !Number.isSafeInteger(job.notAfter) ||
    typeof job.id !== "string" ||
    !/^[a-f0-9]{64}$/.test(job.id) ||
    (job.source !== "CustomEmailSender_AccountTakeOverNotification" &&
      (typeof job.code !== "string" || !job.code || job.code.length > 16384))
  ) {
    throw new Error("Invalid email job");
  }
  return job;
}
export function template(source, code) {
  if (source === "CustomEmailSender_AccountTakeOverNotification") {
    return {
      subject: "Meshwork account security alert",
      text: "Suspicious account activity was detected. Review your account security and reset your password if necessary.",
    };
  }
  if (!sources.has(source) || !code)
    throw new Error("Unsupported email template");
  const temporary = source === "CustomEmailSender_AdminCreateUser";
  const reset = source === "CustomEmailSender_ForgotPassword";
  const auth = source === "CustomEmailSender_Authentication";
  // Cognito escapes temporary passwords before encryption. Plain-text mail only.
  const secret = temporary
    ? code.replace(
        /&(lt|gt|amp|quot|apos);/g,
        (_, name) =>
          ({ lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" })[name],
      )
    : code;
  const purpose = temporary
    ? "temporary password"
    : reset
      ? "password reset code"
      : auth
        ? "sign-in code"
        : "verification code";
  return {
    subject: `Your Meshwork ${purpose}`,
    text: `Your ${purpose} is: ${secret}\n\nEnter it on the Meshwork sign-in page. If you did not request this, you can ignore this email.`,
  };
}
