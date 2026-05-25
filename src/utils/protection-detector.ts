export const PROTECTION_PATTERNS = {
  captcha: [
    /captcha/i,
    /challenge required/i,
    /complete the challenge/i,
  ],
  twoFactor: [
    /2fa/i,
    /two.?factor/i,
    /verification code/i,
    /enter code/i,
    /security code/i,
    /authentication code/i,
  ],
  verification: [
    /additional verification/i,
    /verify your identity/i,
    /account verification required/i,
    /suspicious activity/i,
    /unusual activity/i,
  ],
};

export interface ProtectionDetectionResult {
  isProtected: boolean;
  type: "captcha" | "two_factor" | "verification" | null;
  matchedPattern?: string;
}

export function detectProtectionMechanism(
  message: string,
): ProtectionDetectionResult {
  if (!message) {
    return { isProtected: false, type: null };
  }

  // Check CAPTCHA patterns
  for (const pattern of PROTECTION_PATTERNS.captcha) {
    if (pattern.test(message)) {
      return {
        isProtected: true,
        type: "captcha",
        matchedPattern: pattern.source,
      };
    }
  }

  // Check 2FA patterns
  for (const pattern of PROTECTION_PATTERNS.twoFactor) {
    if (pattern.test(message)) {
      return {
        isProtected: true,
        type: "two_factor",
        matchedPattern: pattern.source,
      };
    }
  }

  // Check verification patterns
  for (const pattern of PROTECTION_PATTERNS.verification) {
    if (pattern.test(message)) {
      return {
        isProtected: true,
        type: "verification",
        matchedPattern: pattern.source,
      };
    }
  }

  return { isProtected: false, type: null };
}
