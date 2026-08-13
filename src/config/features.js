/**
 * Hosted environments fail closed: time-card is only available locally while
 * its development work is still in progress.
 */
export function isTimeCardEnabled(env = process.env) {
  const isProduction = env.APP_ENV === 'production' || Boolean(env.VERCEL);
  return !isProduction && env.ENABLE_TIME_CARD !== 'false';
}
