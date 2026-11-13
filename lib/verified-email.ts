type EmailVerificationClaim = { email_verified?: unknown } | null | undefined;

/** True only for an authenticated Firebase token with an explicit verified email claim. */
export function hasVerifiedEmail(claims: EmailVerificationClaim): boolean {
  return claims?.email_verified === true;
}
