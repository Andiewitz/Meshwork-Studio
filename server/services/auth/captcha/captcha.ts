import { createChildLogger } from "@server/lib/logger";
import type { Request, Response, NextFunction } from "express";

const log = createChildLogger("auth-captcha");

interface CaptchaConfig {
  secretKey: string;
  provider: "hcaptcha" | "recaptcha";
  scoreThreshold?: number;
}

// Track used tokens to prevent replay attacks
const usedTokens = new Set<string>();
const tokenTimestamps = new Map<string, number>();

// Token expiration: 5 minutes
const TOKEN_EXPIRY_MS = 5 * 60 * 1000;

// Cleanup old tokens every 10 minutes
setInterval(
  () => {
    const now = Date.now();
    Array.from(tokenTimestamps.entries()).forEach(([token, timestamp]) => {
      if (now - timestamp > TOKEN_EXPIRY_MS) {
        usedTokens.delete(token);
        tokenTimestamps.delete(token);
      }
    });
  },
  10 * 60 * 1000,
);

function getCaptchaConfig(): CaptchaConfig | null {
  const hcaptchaSecret = process.env.HCAPTCHA_SECRET;
  const recaptchaSecret = process.env.RECAPTCHA_SECRET;
  const scoreThreshold = parseFloat(
    process.env.RECAPTCHA_SCORE_THRESHOLD || "0.5",
  );

  if (hcaptchaSecret) {
    return { secretKey: hcaptchaSecret, provider: "hcaptcha" };
  }

  if (recaptchaSecret) {
    return {
      secretKey: recaptchaSecret,
      provider: "recaptcha",
      scoreThreshold,
    };
  }

  return null;
}

export interface CaptchaVerificationResult {
  success: boolean;
  error?: string;
  score?: number;
}

/**
 * Verify a CAPTCHA token with production-grade security
 */
export async function verifyCaptcha(
  token: string,
  remoteIp?: string,
): Promise<CaptchaVerificationResult> {
  const config = getCaptchaConfig();

  // If no CAPTCHA configured, skip verification (dev mode only)
  if (!config) {
    log.debug("No CAPTCHA configured, skipping verification (dev mode)");
    return { success: true };
  }

  // Validate token format (prevent injection)
  if (
    !token ||
    typeof token !== "string" ||
    token.length < 10 ||
    token.length > 2000
  ) {
    log.warn("Invalid token format");
    return { success: false, error: "Invalid CAPTCHA token format" };
  }

  // Check for replay attacks
  if (usedTokens.has(token)) {
    log.warn("Token reuse detected (possible replay attack)");
    return {
      success: false,
      error: "CAPTCHA already used - please complete a new challenge",
    };
  }

  try {
    const verifyUrl =
      config.provider === "hcaptcha"
        ? "https://hcaptcha.com/siteverify"
        : "https://www.google.com/recaptcha/api/siteverify";

    const bodyParams: Record<string, string> = {
      secret: config.secretKey,
      response: token,
    };

    if (remoteIp) {
      bodyParams.remoteip = remoteIp;
    }

    const response = await fetch(verifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(bodyParams),
    });

    if (!response.ok) {
      log.error({ status: response.status }, "Verification service error");
      return {
        success: false,
        error: "CAPTCHA verification service unavailable",
      };
    }

    const data = (await response.json()) as {
      success: boolean;
      score?: number;
      "error-codes"?: string[];
    };

    if (data.success) {
      if (config.provider === "recaptcha" && data.score !== undefined) {
        const threshold = config.scoreThreshold || 0.5;
        if (data.score !== undefined && data.score < threshold) {
          log.warn({ score: data.score, threshold }, "Score too low");
          return {
            success: false,
            error: "CAPTCHA verification failed - suspicious activity detected",
            score: data.score,
          };
        }
        log.debug(
          { score: data.score, provider: config.provider },
          "Passed with score",
        );
      } else {
        log.debug({ provider: config.provider }, "Verification passed");
      }

      usedTokens.add(token);
      tokenTimestamps.set(token, Date.now());

      return { success: true, score: data.score };
    } else {
      const errorCodes = data["error-codes"] ?? [];
      log.warn(
        { provider: config.provider, errorCodes },
        "Verification failed",
      );

      const errorMessage = mapErrorCodes(errorCodes, config.provider);
      return { success: false, error: errorMessage };
    }
  } catch (err) {
    log.error({ err }, "Verification error");
    return {
      success: false,
      error: "CAPTCHA verification failed - please try again",
    };
  }
}

function mapErrorCodes(errorCodes: string[], _provider: string): string {
  const codeMap: Record<string, string> = {
    "missing-input-secret": "CAPTCHA configuration error",
    "invalid-input-secret": "CAPTCHA configuration error",
    "missing-input-response": "Please complete the CAPTCHA challenge",
    "invalid-input-response": "CAPTCHA response invalid - please try again",
    "bad-request": "Invalid CAPTCHA request",
    "timeout-or-duplicate": "CAPTCHA expired - please complete a new challenge",
  };

  for (const code of errorCodes) {
    if (codeMap[code]) {
      return codeMap[code];
    }
  }

  return "CAPTCHA verification failed - please try again";
}

export function captchaMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const token = req.body.captchaToken;
  const remoteIp =
    req.ip ??
    req.socket.remoteAddress ??
    (req.headers["x-forwarded-for"] as string | undefined);

  if (!token) {
    return res.status(400).json({
      message:
        "CAPTCHA verification required - please complete the security challenge",
    });
  }

  verifyCaptcha(token, remoteIp)
    .then((result) => {
      if (result.success) {
        (req as Request & { captchaScore?: number }).captchaScore =
          result.score;
        next();
      } else {
        res.status(400).json({
          message:
            result.error || "CAPTCHA verification failed - please try again",
        });
      }
    })
    .catch((err) => {
      log.error({ err }, "Middleware error");
      res.status(500).json({
        message: "CAPTCHA verification error - please try again later",
      });
    });
}

export function optionalCaptchaMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const config = getCaptchaConfig();

  if (!config) {
    log.debug("Skipping verification (no CAPTCHA keys configured)");
    return next();
  }

  return captchaMiddleware(req, res, next);
}
