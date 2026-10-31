/** Core readiness deliberately excludes optional AI and metrics capabilities. */
export async function coreReady(options: {
  started: boolean;
  postgres: boolean;
  redisRequired: boolean;
  redis: boolean;
  canvas: () => Promise<boolean>;
}): Promise<boolean> {
  if (
    !options.started ||
    !options.postgres ||
    (options.redisRequired && !options.redis)
  )
    return false;
  try {
    return await options.canvas();
  } catch {
    return false;
  }
}
