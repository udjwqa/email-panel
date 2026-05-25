import { describe, it, expect } from "vitest";
import {
  detectProtectionMechanism,
  PROTECTION_PATTERNS,
} from "../../src/utils/protection-detector.js";

describe("detectProtectionMechanism", () => {
  describe("CAPTCHA detection", () => {
    it("detects 'captcha' keyword", () => {
      const result = detectProtectionMechanism("Please solve the CAPTCHA");
      expect(result.isProtected).toBe(true);
      expect(result.type).toBe("captcha");
    });

    it("detects 'challenge required'", () => {
      const result = detectProtectionMechanism(
        "Challenge required to continue",
      );
      expect(result.isProtected).toBe(true);
      expect(result.type).toBe("captcha");
    });

    it("is case-insensitive", () => {
      const result = detectProtectionMechanism("solve the captcha");
      expect(result.isProtected).toBe(true);
    });
  });

  describe("2FA detection", () => {
    it("detects '2fa' keyword", () => {
      const result = detectProtectionMechanism("2FA required");
      expect(result.isProtected).toBe(true);
      expect(result.type).toBe("two_factor");
    });

    it("detects 'two-factor'", () => {
      const result = detectProtectionMechanism(
        "Two-factor authentication required",
      );
      expect(result.isProtected).toBe(true);
      expect(result.type).toBe("two_factor");
    });

    it("detects 'verification code'", () => {
      const result = detectProtectionMechanism("Enter verification code");
      expect(result.isProtected).toBe(true);
      expect(result.type).toBe("two_factor");
    });
  });

  describe("Verification detection", () => {
    it("detects 'additional verification'", () => {
      const result = detectProtectionMechanism(
        "Additional verification required",
      );
      expect(result.isProtected).toBe(true);
      expect(result.type).toBe("verification");
    });

    it("detects 'suspicious activity'", () => {
      const result = detectProtectionMechanism("Suspicious activity detected");
      expect(result.isProtected).toBe(true);
      expect(result.type).toBe("verification");
    });
  });

  describe("No detection", () => {
    it("returns false for normal auth failure", () => {
      const result = detectProtectionMechanism("Authentication failed");
      expect(result.isProtected).toBe(false);
      expect(result.type).toBe(null);
    });

    it("returns false for empty message", () => {
      const result = detectProtectionMechanism("");
      expect(result.isProtected).toBe(false);
    });
  });
});
