import { describe, it, expect } from "vitest";
import { classifyAccountStatus } from "../../src/services/imap/account-status-classifier.js";
import type { IMAPAuthResult } from "../../src/services/imap/types.js";

describe("classifyAccountStatus", () => {
  describe("Rule 1: locked status", () => {
    it("classifies auth_failed as locked", () => {
      const authResult: IMAPAuthResult = {
        success: false,
        errorType: "auth_failed",
        message: "Invalid credentials",
        responseTime: 100,
      };

      const result = classifyAccountStatus({ authResult });

      expect(result.status).toBe("locked");
    });

    it("classifies timeout as locked", () => {
      const authResult: IMAPAuthResult = {
        success: false,
        errorType: "timeout",
        message: "Connection timeout",
        responseTime: 10000,
      };

      const result = classifyAccountStatus({ authResult });

      expect(result.status).toBe("locked");
    });

    it("classifies connection_error as locked", () => {
      const authResult: IMAPAuthResult = {
        success: false,
        errorType: "connection_error",
        message: "Connection refused",
        responseTime: 50,
      };

      const result = classifyAccountStatus({ authResult });

      expect(result.status).toBe("locked");
    });

    it("classifies additional_verification_required as locked", () => {
      const authResult: IMAPAuthResult = {
        success: false,
        errorType: "additional_verification_required",
        message: "2FA required",
        responseTime: 200,
      };

      const result = classifyAccountStatus({ authResult });

      expect(result.status).toBe("locked");
    });
  });

  describe("Rule 2: restricted status", () => {
    it("classifies restricted_access inbox as restricted", () => {
      const authResult: IMAPAuthResult = {
        success: true,
        errorType: null,
        responseTime: 150,
      };

      const inboxCheck = {
        status: "restricted_access" as const,
        error: "Permission denied",
        responseTime: 50,
      };

      const result = classifyAccountStatus({ authResult, inboxCheck });

      expect(result.status).toBe("restricted");
    });
  });

  describe("Rule 3: suspicious_activity status", () => {
    it("detects suspicious keywords in message body", () => {
      const authResult: IMAPAuthResult = {
        success: true,
        errorType: null,
        responseTime: 150,
      };

      const inboxCheck = {
        status: "fully_accessible" as const,
        unseenCount: 2,
        totalCount: 10,
        responseTime: 50,
        securityCheck: {
          warnings: [
            {
              type: "body" as const,
              indicator: "security_keyword",
              value: "suspicious activity",
              severity: "medium" as const,
              matchedPattern: "/suspicious activity/i",
            },
          ],
          messagesScanned: 5,
          hasSecurityWarnings: true,
          responseTime: 100,
        },
      };

      const result = classifyAccountStatus({ authResult, inboxCheck });

      expect(result.status).toBe("suspicious_activity");
    });

    it("prioritizes suspicious keywords over security headers", () => {
      const authResult: IMAPAuthResult = {
        success: true,
        errorType: null,
        responseTime: 150,
      };

      const inboxCheck = {
        status: "fully_accessible" as const,
        unseenCount: 1,
        totalCount: 5,
        responseTime: 50,
        securityCheck: {
          warnings: [
            {
              type: "header" as const,
              indicator: "x-google-2fa",
              value: "enabled",
              severity: "high" as const,
              matchedPattern: "x-google-2fa",
            },
            {
              type: "body" as const,
              indicator: "security_keyword",
              value: "unusual sign-in",
              severity: "medium" as const,
              matchedPattern: "/unusual sign-?in/i",
            },
          ],
          messagesScanned: 3,
          hasSecurityWarnings: true,
          responseTime: 80,
        },
      };

      const result = classifyAccountStatus({ authResult, inboxCheck });

      expect(result.status).toBe("suspicious_activity");
    });
  });

  describe("Rule 4: active_with_2fa status", () => {
    it("detects security headers without suspicious keywords", () => {
      const authResult: IMAPAuthResult = {
        success: true,
        errorType: null,
        responseTime: 150,
      };

      const inboxCheck = {
        status: "fully_accessible" as const,
        unseenCount: 0,
        totalCount: 8,
        responseTime: 50,
        securityCheck: {
          warnings: [
            {
              type: "header" as const,
              indicator: "x-microsoft-auth-",
              value: "login-attempt-123",
              severity: "high" as const,
              matchedPattern: "x-microsoft-auth-",
            },
          ],
          messagesScanned: 5,
          hasSecurityWarnings: true,
          responseTime: 90,
        },
      };

      const result = classifyAccountStatus({ authResult, inboxCheck });

      expect(result.status).toBe("active_with_2fa");
    });

    it("detects multiple security headers", () => {
      const authResult: IMAPAuthResult = {
        success: true,
        errorType: null,
        responseTime: 150,
      };

      const inboxCheck = {
        status: "fully_accessible" as const,
        unseenCount: 1,
        totalCount: 12,
        responseTime: 50,
        securityCheck: {
          warnings: [
            {
              type: "header" as const,
              indicator: "x-google-2fa",
              value: "enabled",
              severity: "high" as const,
              matchedPattern: "x-google-2fa",
            },
            {
              type: "header" as const,
              indicator: "x-yahoo-vss",
              value: "verified",
              severity: "high" as const,
              matchedPattern: "x-yahoo-vss",
            },
          ],
          messagesScanned: 8,
          hasSecurityWarnings: true,
          responseTime: 110,
        },
      };

      const result = classifyAccountStatus({ authResult, inboxCheck });

      expect(result.status).toBe("active_with_2fa");
    });
  });

  describe("Rule 5: active_clean status", () => {
    it("classifies account with no warnings as active_clean", () => {
      const authResult: IMAPAuthResult = {
        success: true,
        errorType: null,
        responseTime: 150,
      };

      const inboxCheck = {
        status: "fully_accessible" as const,
        unseenCount: 3,
        totalCount: 20,
        responseTime: 50,
        securityCheck: {
          warnings: [],
          messagesScanned: 10,
          hasSecurityWarnings: false,
          responseTime: 120,
        },
      };

      const result = classifyAccountStatus({ authResult, inboxCheck });

      expect(result.status).toBe("active_clean");
    });

    it("classifies account without securityCheck as active_clean", () => {
      const authResult: IMAPAuthResult = {
        success: true,
        errorType: null,
        responseTime: 150,
      };

      const inboxCheck = {
        status: "fully_accessible" as const,
        unseenCount: 0,
        totalCount: 5,
        responseTime: 40,
      };

      const result = classifyAccountStatus({ authResult, inboxCheck });

      expect(result.status).toBe("active_clean");
    });
  });

  describe("Detailed mode", () => {
    it("returns detailed result with includeReason option", () => {
      const authResult: IMAPAuthResult = {
        success: true,
        errorType: null,
        responseTime: 150,
      };

      const inboxCheck = {
        status: "fully_accessible" as const,
        unseenCount: 1,
        totalCount: 5,
        responseTime: 50,
        securityCheck: {
          warnings: [
            {
              type: "body" as const,
              indicator: "security_keyword",
              value: "verify your identity",
              severity: "medium" as const,
              matchedPattern: "/verify your identity/i",
            },
          ],
          messagesScanned: 5,
          hasSecurityWarnings: true,
          responseTime: 100,
        },
      };

      const result = classifyAccountStatus(
        { authResult, inboxCheck },
        { includeReason: true }
      );

      expect(result.status).toBe("suspicious_activity");
      expect(result.reason).toContain("verify your identity");
      expect(result.matchedRule).toBe("suspicious_keywords");
      expect(result.factors).toEqual({
        authSuccess: true,
        inboxAccessible: true,
        hasSecurityHeaders: false,
        hasSuspiciousKeywords: true,
      });
    });

    it("includes all factors in detailed result", () => {
      const authResult: IMAPAuthResult = {
        success: false,
        errorType: "auth_failed",
        message: "Invalid password",
        responseTime: 100,
      };

      const result = classifyAccountStatus(
        { authResult },
        { includeReason: true }
      );

      expect(result.status).toBe("locked");
      expect(result.reason).toBe("Authentication failed: auth_failed");
      expect(result.matchedRule).toBe("auth_failed");
      expect(result.factors).toEqual({
        authSuccess: false,
        inboxAccessible: false,
        hasSecurityHeaders: false,
        hasSuspiciousKeywords: false,
      });
    });
  });

  describe("Edge cases", () => {
    it("handles missing inboxCheck when auth failed", () => {
      const authResult: IMAPAuthResult = {
        success: false,
        errorType: "timeout",
        message: "Connection timeout",
        responseTime: 10000,
      };

      const result = classifyAccountStatus({ authResult });

      expect(result.status).toBe("locked");
    });

    it("handles missing securityCheck when inbox accessible", () => {
      const authResult: IMAPAuthResult = {
        success: true,
        errorType: null,
        responseTime: 150,
      };

      const inboxCheck = {
        status: "fully_accessible" as const,
        unseenCount: 5,
        totalCount: 15,
        responseTime: 50,
      };

      const result = classifyAccountStatus({ authResult, inboxCheck });

      expect(result.status).toBe("active_clean");
    });

    it("handles empty warnings array", () => {
      const authResult: IMAPAuthResult = {
        success: true,
        errorType: null,
        responseTime: 150,
      };

      const inboxCheck = {
        status: "fully_accessible" as const,
        unseenCount: 0,
        totalCount: 10,
        responseTime: 50,
        securityCheck: {
          warnings: [],
          messagesScanned: 10,
          hasSecurityWarnings: false,
          responseTime: 100,
        },
      };

      const result = classifyAccountStatus({ authResult, inboxCheck });

      expect(result.status).toBe("active_clean");
    });
  });
});
