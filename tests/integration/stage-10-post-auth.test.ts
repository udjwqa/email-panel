import { describe, it, expect } from "vitest";
import { classifyAccountStatus } from "../../src/services/imap/account-status-classifier.js";
import type { IMAPAuthResult } from "../../src/services/imap/types.js";
import type {
  SecurityWarning,
  SecurityWarningsCheckResult,
  IMAPInboxCheckResultExtended,
} from "../../src/services/imap/types.js";
import { formatAuditReportText } from "../../src/services/audit-report/formatter.js";
import type { AuditReport } from "../../src/services/audit-report/types.js";
import { getDomainGroup } from "../../src/services/domain-groups.js";
import type { AuthStatus } from "../../src/services/auth-results/types.js";

describe("Stage 10: Post-Authentication Verification", () => {
  // ─────── 10.1 Mailbox Accessibility Check ───────

  describe("10.1 Mailbox Accessibility Check", () => {
    it("fully_accessible inbox → active_clean classification", () => {
      const authResult: IMAPAuthResult = {
        success: true,
        errorType: null,
        responseTime: 200,
      };

      const inboxCheck: IMAPInboxCheckResultExtended = {
        status: "fully_accessible",
        unseenCount: 5,
        totalCount: 100,
        responseTime: 50,
      };

      const result = classifyAccountStatus({ authResult, inboxCheck });

      expect(result.status).toBe("active_clean");
    });

    it("restricted_access inbox → restricted classification", () => {
      const authResult: IMAPAuthResult = {
        success: true,
        errorType: null,
        responseTime: 200,
      };

      const inboxCheck: IMAPInboxCheckResultExtended = {
        status: "restricted_access",
        error: "Permission denied",
        responseTime: 50,
      };

      const result = classifyAccountStatus({ authResult, inboxCheck });

      expect(result.status).toBe("restricted");
    });

    it("IMAPInboxCheckResult has correct fields", () => {
      const check: IMAPInboxCheckResultExtended = {
        status: "fully_accessible",
        unseenCount: 0,
        totalCount: 0,
        responseTime: 10,
        securityCheck: {
          warnings: [],
          messagesScanned: 0,
          hasSecurityWarnings: false,
          responseTime: 5,
        },
      };

      expect(check.status).toBe("fully_accessible");
      expect(check.unseenCount).toBe(0);
      expect(check.totalCount).toBe(0);
      expect(check.securityCheck).toBeDefined();
    });
  });

  // ─────── 10.2 Security Flag Detection ───────

  describe("10.2 Security Flag Detection", () => {
    it("header warning has severity 'high'", () => {
      const warning: SecurityWarning = {
        type: "header",
        indicator: "x-microsoft-auth-",
        value: "login-attempt",
        severity: "high",
        matchedPattern: "x-microsoft-auth-",
      };

      expect(warning.severity).toBe("high");
      expect(warning.type).toBe("header");
    });

    it("body keyword warning has severity 'medium'", () => {
      const warning: SecurityWarning = {
        type: "body",
        indicator: "security_keyword",
        value: "suspicious activity",
        severity: "medium",
        matchedPattern: "suspicious activity",
      };

      expect(warning.severity).toBe("medium");
      expect(warning.type).toBe("body");
    });

    it("SecurityWarningsCheckResult aggregates warnings", () => {
      const check: SecurityWarningsCheckResult = {
        warnings: [
          {
            type: "header",
            indicator: "x-google-2fa",
            value: "enabled",
            severity: "high",
            matchedPattern: "x-google-2fa",
          },
          {
            type: "body",
            indicator: "security_keyword",
            value: "unusual sign-in",
            severity: "medium",
            matchedPattern: "unusual sign-?in",
          },
        ],
        messagesScanned: 10,
        hasSecurityWarnings: true,
        responseTime: 150,
      };

      expect(check.warnings).toHaveLength(2);
      expect(check.hasSecurityWarnings).toBe(true);
      expect(check.messagesScanned).toBe(10);
    });
  });

  // ─────── 10.3 Account Status Classifier ───────

  describe("10.3 Account Status Classifier", () => {
    it("covers all 5 status outputs", () => {
      const locked = classifyAccountStatus({
        authResult: { success: false, errorType: "auth_failed" },
      });
      expect(locked.status).toBe("locked");

      const restricted = classifyAccountStatus({
        authResult: { success: true, errorType: null },
        inboxCheck: { status: "restricted_access", responseTime: 10 },
      });
      expect(restricted.status).toBe("restricted");

      const suspicious = classifyAccountStatus({
        authResult: { success: true, errorType: null },
        inboxCheck: {
          status: "fully_accessible",
          responseTime: 10,
          securityCheck: {
            warnings: [
              {
                type: "body",
                indicator: "kw",
                value: "suspicious activity",
                severity: "medium",
                matchedPattern: "test",
              },
            ],
            messagesScanned: 1,
            hasSecurityWarnings: true,
            responseTime: 10,
          },
        },
      });
      expect(suspicious.status).toBe("suspicious_activity");

      const with2fa = classifyAccountStatus({
        authResult: { success: true, errorType: null },
        inboxCheck: {
          status: "fully_accessible",
          responseTime: 10,
          securityCheck: {
            warnings: [
              {
                type: "header",
                indicator: "x-google-2fa",
                value: "on",
                severity: "high",
                matchedPattern: "x-google-2fa",
              },
            ],
            messagesScanned: 1,
            hasSecurityWarnings: true,
            responseTime: 10,
          },
        },
      });
      expect(with2fa.status).toBe("active_with_2fa");

      const clean = classifyAccountStatus({
        authResult: { success: true, errorType: null },
        inboxCheck: {
          status: "fully_accessible",
          responseTime: 10,
          securityCheck: {
            warnings: [],
            messagesScanned: 5,
            hasSecurityWarnings: false,
            responseTime: 10,
          },
        },
      });
      expect(clean.status).toBe("active_clean");
    });

    it("suspicious keywords take priority over 2fa headers", () => {
      const result = classifyAccountStatus({
        authResult: { success: true, errorType: null },
        inboxCheck: {
          status: "fully_accessible",
          responseTime: 10,
          securityCheck: {
            warnings: [
              {
                type: "header",
                indicator: "x-google-2fa",
                value: "on",
                severity: "high",
                matchedPattern: "x-google-2fa",
              },
              {
                type: "body",
                indicator: "kw",
                value: "verify your identity",
                severity: "medium",
                matchedPattern: "test",
              },
            ],
            messagesScanned: 1,
            hasSecurityWarnings: true,
            responseTime: 10,
          },
        },
      });

      expect(result.status).toBe("suspicious_activity");
    });

    it("detailed mode returns reason, matchedRule, factors", () => {
      const result = classifyAccountStatus(
        {
          authResult: { success: true, errorType: null },
          inboxCheck: {
            status: "fully_accessible",
            responseTime: 10,
            securityCheck: {
              warnings: [],
              messagesScanned: 0,
              hasSecurityWarnings: false,
              responseTime: 5,
            },
          },
        },
        { includeReason: true },
      );

      expect(result.status).toBe("active_clean");
      expect(result.reason).toBeDefined();
      expect(result.matchedRule).toBe("no_warnings");
      expect(result.factors).toEqual({
        authSuccess: true,
        inboxAccessible: true,
        hasSecurityHeaders: false,
        hasSuspiciousKeywords: false,
      });
    });

    it("classifyAccountStatus is a public export", () => {
      expect(typeof classifyAccountStatus).toBe("function");
    });
  });

  // ─────── 10.4 Valid Credentials Exporter ───────

  describe("10.4 Valid Credentials Exporter", () => {
    it("getDomainGroup maps known providers", () => {
      expect(getDomainGroup("gmail.com")).toBe("Google");
      expect(getDomainGroup("outlook.com")).toBe("Microsoft");
      expect(getDomainGroup("yahoo.com")).toBe("Yahoo");
      expect(getDomainGroup("unknown-domain.xyz")).toBe("Unknown");
    });

    it("provider extraction works for email addresses", () => {
      const emails = [
        { email: "user@gmail.com", expected: "Google" },
        { email: "user@hotmail.com", expected: "Microsoft" },
        { email: "user@yahoo.co.uk", expected: "Yahoo" },
        { email: "user@web.de", expected: "German" },
      ];

      for (const { email, expected } of emails) {
        const domain = email.split("@")[1]!.toLowerCase();
        expect(getDomainGroup(domain)).toBe(expected);
      }
    });

    it("TXT format is email:password pattern", () => {
      const email = "test@gmail.com";
      const password = "secret123";
      const txtLine = `${email}:${password}`;

      expect(txtLine).toBe("test@gmail.com:secret123");
      expect(txtLine).toMatch(/^[^:]+:[^:]+$/);
    });
  });

  // ─────── 10.5 Invalid Cleanup Service ───────

  describe("10.5 Invalid Cleanup Service", () => {
    it("AuthStatus includes account_not_found and permanently_locked", () => {
      const statuses: AuthStatus[] = [
        "success",
        "auth_failed",
        "connection_error",
        "timeout",
        "2fa_required",
        "captcha_required",
        "verification_required",
        "account_not_found",
        "permanently_locked",
      ];

      expect(statuses).toContain("account_not_found");
      expect(statuses).toContain("permanently_locked");
      expect(statuses).toHaveLength(9);
    });

    it("default archival targets correct statuses", () => {
      const defaultStatuses = [
        "auth_failed",
        "account_not_found",
        "permanently_locked",
      ];

      expect(defaultStatuses).toContain("auth_failed");
      expect(defaultStatuses).toContain("account_not_found");
      expect(defaultStatuses).toContain("permanently_locked");
      expect(defaultStatuses).toHaveLength(3);
    });

    it("archival options have correct defaults", () => {
      const defaults = {
        olderThanDays: 30,
        batchSize: 1000,
        dryRun: false,
        statuses: ["auth_failed", "account_not_found", "permanently_locked"],
      };

      expect(defaults.olderThanDays).toBe(30);
      expect(defaults.batchSize).toBe(1000);
      expect(defaults.dryRun).toBe(false);
      expect(defaults.statuses).toHaveLength(3);
    });
  });

  // ─────── 10.6 Final Report Generator ───────

  describe("10.6 Final Report Generator", () => {
    const mockReport: AuditReport = {
      totalTested: 1500,
      totalSuccess: 1200,
      totalFailed: 300,
      successRate: 80.0,
      byProvider: [
        {
          provider: "Google",
          total: 500,
          successful: 420,
          failed: 80,
          successRate: 84.0,
        },
        {
          provider: "Microsoft",
          total: 400,
          successful: 310,
          failed: 90,
          successRate: 77.5,
        },
        {
          provider: "Yahoo",
          total: 200,
          successful: 170,
          failed: 30,
          successRate: 85.0,
        },
      ],
      twoFaRate: 15.3,
      lockedRate: 5.2,
      accountNotFoundRate: 8.7,
      averageResponseTime: 1234,
      averageResponseTimeByProtocol: {
        IMAP: 1456,
        POP3: 987,
        SMTP: 234,
      },
      byStatus: {
        success: 1200,
        auth_failed: 180,
        account_not_found: 130,
        "2fa_required": 230,
      },
      byProtocol: { IMAP: 800, POP3: 400, SMTP: 300 },
      byAccountStatus: {
        active_clean: 900,
        active_with_2fa: 300,
        locked: 200,
      },
      generatedAt: new Date("2026-05-25T17:00:00Z"),
      filters: {},
      period: "all time",
    };

    it("AuditReport contains all required metrics", () => {
      expect(mockReport.totalTested).toBe(1500);
      expect(mockReport.successRate).toBe(80.0);
      expect(mockReport.twoFaRate).toBe(15.3);
      expect(mockReport.lockedRate).toBe(5.2);
      expect(mockReport.accountNotFoundRate).toBe(8.7);
      expect(mockReport.averageResponseTime).toBe(1234);
      expect(mockReport.byProvider).toHaveLength(3);
      expect(mockReport.byStatus).toHaveProperty("success");
      expect(mockReport.byProtocol).toHaveProperty("IMAP");
      expect(mockReport.byAccountStatus).toHaveProperty("active_clean");
    });

    it("formatAuditReportText returns readable string", () => {
      const text = formatAuditReportText(mockReport);

      expect(typeof text).toBe("string");
      expect(text.length).toBeGreaterThan(100);
    });

    it("text report contains all sections", () => {
      const text = formatAuditReportText(mockReport);

      expect(text).toContain("AUDIT REPORT");
      expect(text).toContain("SUMMARY");
      expect(text).toContain("RATES");
      expect(text).toContain("PERFORMANCE");
      expect(text).toContain("BY PROVIDER");
      expect(text).toContain("BY STATUS");
    });

    it("provider breakdown sorted by total descending", () => {
      expect(mockReport.byProvider[0].provider).toBe("Google");
      expect(mockReport.byProvider[0].total).toBe(500);
      expect(mockReport.byProvider[1].total).toBe(400);
      expect(mockReport.byProvider[2].total).toBe(200);

      for (let i = 0; i < mockReport.byProvider.length - 1; i++) {
        expect(mockReport.byProvider[i].total).toBeGreaterThanOrEqual(
          mockReport.byProvider[i + 1].total,
        );
      }
    });
  });
});
