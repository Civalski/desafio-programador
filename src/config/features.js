/**
 * Hosted environments fail closed: time-card is only available locally while
 * its development work is still in progress.
 */
export function isTimeCardEnabled(env = process.env) {
  if (env.ENABLE_TIME_CARD !== undefined) return env.ENABLE_TIME_CARD === 'true';
  return !env.VERCEL;
}
