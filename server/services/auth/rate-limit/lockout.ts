import { db } from "../db/connection";
import { loginAttempts } from "../db/schema";
import { eq } from "drizzle-orm";
import { createChildLogger } from "@server/lib/logger";

const log = createChildLogger("auth-lockout");

const MAX_FAILED_ATTEMPTS = 5; // Lock after 5 failed attempts
const BASE_LOCKOUT_MINUTES = 15; // Initial lockout duration

// In-memory fallback for development mode (no database)
interface LoginAttemptRecord {
  email: string;
  failed: number;
  lastAttempt: Date;
  lockedUntil: Date | null;
}

const inMemoryLoginAttempts = new Map<string, LoginAttemptRecord>();

/**
 * Calculate exponential backoff lockout duration
 * Attempts: 1-5: not locked
 * 6th attempt: locked 15 minutes
 * 7th attempt: locked 30 minutes
 * 8th attempt: locked 60 minutes
 * Caps at 8 hours max
 */
function calculateLockoutDuration(failedAttempts: number): number {
  if (failedAttempts <= MAX_FAILED_ATTEMPTS) {
    return 0; // Not locked
  }

  // Exponential backoff: 15m, 30m, 60m, 120m, etc.
  const exponentialMinutes =
    BASE_LOCKOUT_MINUTES *
    Math.pow(2, failedAttempts - MAX_FAILED_ATTEMPTS - 1);
  const maxMinutes = 8 * 60; // 8 hours cap

  return Math.min(exponentialMinutes, maxMinutes);
}

/**
 * Check if an email is currently locked out
 */
export async function isAccountLocked(
  email: string,
): Promise<{ locked: boolean; lockedUntil?: Date }> {
  try {
    const [attempt] = await db
      .select()
      .from(loginAttempts)
      .where(eq(loginAttempts.email, email))
      .limit(1);

    if (!attempt?.lockedUntil) {
      return { locked: false };
    }

    const now = new Date();
    const isStillLocked = attempt.lockedUntil > now;

    if (isStillLocked) {
      return { locked: true, lockedUntil: attempt.lockedUntil };
    }

    // Unlock has expired, reset the attempts
    await db
      .update(loginAttempts)
      .set({
        failed: 0,
        lockedUntil: null,
        lastAttempt: now,
      })
      .where(eq(loginAttempts.email, email));

    return { locked: false };
  } catch (error) {
    // Fallback to in-memory storage — lockout enforcement is degraded
    log.warn(
      { err: error, email },
      "DB unavailable for lockout check, using in-memory fallback",
    );
    const attempt = inMemoryLoginAttempts.get(email);

    if (!attempt?.lockedUntil) {
      return { locked: false };
    }

    const now = new Date();
    const isStillLocked = attempt.lockedUntil > now;

    if (isStillLocked) {
      return { locked: true, lockedUntil: attempt.lockedUntil };
    }

    // Unlock has expired, reset the attempts
    inMemoryLoginAttempts.set(email, {
      email,
      failed: 0,
      lockedUntil: null,
      lastAttempt: now,
    });

    return { locked: false };
  }
}

/**
 * Record a failed login attempt
 */
export async function recordFailedAttempt(email: string): Promise<{
  locked: boolean;
  lockedUntil?: Date | null;
  attemptsRemaining?: number;
}> {
  try {
    const [existingAttempt] = await db
      .select()
      .from(loginAttempts)
      .where(eq(loginAttempts.email, email))
      .limit(1);

    const now = new Date();
    let failedCount = 1;
    let lockedUntil: Date | null = null;

    if (existingAttempt) {
      failedCount = existingAttempt.failed + 1;

      // Check if lockout period has expired
      if (existingAttempt.lockedUntil && existingAttempt.lockedUntil <= now) {
        // Reset the counter
        failedCount = 1;
        lockedUntil = null;
      } else if (failedCount > MAX_FAILED_ATTEMPTS) {
        // Calculate new lockout duration
        const lockoutMinutes = calculateLockoutDuration(failedCount);
        lockedUntil = new Date(now.getTime() + lockoutMinutes * 60000);
      }

      // Update existing record
      await db
        .update(loginAttempts)
        .set({
          failed: failedCount,
          lockedUntil,
          lastAttempt: now,
        })
        .where(eq(loginAttempts.email, email));
    } else {
      // Create new record
      await db.insert(loginAttempts).values({
        email,
        failed: 1,
        lockedUntil: null,
        lastAttempt: now,
        createdAt: now,
      });
    }

    return {
      locked: failedCount > MAX_FAILED_ATTEMPTS,
      lockedUntil,
      attemptsRemaining: Math.max(0, MAX_FAILED_ATTEMPTS - failedCount + 1),
    };
  } catch (error) {
    // Fallback to in-memory storage — lockout enforcement is degraded
    log.warn(
      { err: error, email },
      "DB unavailable for recording failed attempt, using in-memory fallback",
    );
    const now = new Date();
    let failedCount = 1;
    let lockedUntil: Date | null = null;

    const existingAttempt = inMemoryLoginAttempts.get(email);

    if (existingAttempt) {
      failedCount = existingAttempt.failed + 1;

      // Check if lockout period has expired
      if (existingAttempt.lockedUntil && existingAttempt.lockedUntil <= now) {
        // Reset the counter
        failedCount = 1;
        lockedUntil = null;
      } else if (failedCount > MAX_FAILED_ATTEMPTS) {
        // Calculate new lockout duration
        const lockoutMinutes = calculateLockoutDuration(failedCount);
        lockedUntil = new Date(now.getTime() + lockoutMinutes * 60000);
      }
    }

    // Store in memory
    inMemoryLoginAttempts.set(email, {
      email,
      failed: failedCount,
      lockedUntil,
      lastAttempt: now,
    });

    return {
      locked: failedCount > MAX_FAILED_ATTEMPTS,
      lockedUntil,
      attemptsRemaining: Math.max(0, MAX_FAILED_ATTEMPTS - failedCount + 1),
    };
  }
}

/**
 * Reset failed attempts after successful login
 */
export async function resetFailedAttempts(email: string): Promise<void> {
  try {
    const now = new Date();

    await db
      .update(loginAttempts)
      .set({
        failed: 0,
        lockedUntil: null,
        lastAttempt: now,
      })
      .where(eq(loginAttempts.email, email));
  } catch (error) {
    // Fallback to in-memory storage — lockout enforcement is degraded
    log.warn(
      { err: error, email },
      "DB unavailable for resetting lockout, using in-memory fallback",
    );
    const now = new Date();
    const attempt = inMemoryLoginAttempts.get(email);

    if (attempt) {
      inMemoryLoginAttempts.set(email, {
        ...attempt,
        failed: 0,
        lockedUntil: null,
        lastAttempt: now,
      });
    }
  }
}

/**
 * Get lockout status for an email (for debugging/admin purposes)
 */
export async function getLockoutStatus(email: string) {
  const [attempt] = await db
    .select()
    .from(loginAttempts)
    .where(eq(loginAttempts.email, email))
    .limit(1);

  return {
    email,
    failedAttempts: attempt?.failed ?? 0,
    lastAttemptTime: attempt?.lastAttempt,
    lockedUntil: attempt?.lockedUntil,
    isCurrentlyLocked: Boolean(
      attempt?.lockedUntil && attempt.lockedUntil > new Date(),
    ),
  };
}
