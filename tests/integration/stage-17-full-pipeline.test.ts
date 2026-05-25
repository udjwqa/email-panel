import { describe, it, expect } from "vitest";
import { parsePasswordFile } from "../../src/services/dictionary/parser.js";
import {
  generatePasswordPatterns,
  type PatternInput,
} from "../../src/services/dictionary/pattern-generator.js";
import { AuthAttemptController } from "../../src/services/matching/attempt-controller.js";
import type { DetectionResult } from "../../src/services/matching/success-detector.js";
import type { MatchingProgress } from "../../src/services/matching/engine.js";
import type { RecoveryPipelineResult } from "../../src/services/pipeline/recovery-pipeline.js";

describe("Stage 17: Full Pipeline Integration", () => {
  describe("Step 1: Dictionary Loading", () => {
    it("parses test password file", () => {
      const content = "password123\nadmin\nletmein\nqwerty\n123456";
      const result = parsePasswordFile(content);

      expect(result.entries).toHaveLength(5);
      expect(result.validLines).toBe(5);
      expect(result.entries.map((e) => e.password)).toContain("password123");
    });
  });

  describe("Step 2: Pattern Generation", () => {
    it("generates patterns from user data", () => {
      const input: PatternInput = {
        firstName: "John",
        lastName: "Smith",
        birthDate: "1990-05-15",
      };

      const result = generatePasswordPatterns(input);

      expect(result.passwords.length).toBeGreaterThan(50);
      expect(result.passwords).toContain("JohnSmith");
      expect(result.passwords).toContain("John1990");
      expect(result.passwords).toContain("john1505");
    });

    it("merges with dictionary passwords", () => {
      const dictContent = "password123\nadmin\nletmein";
      const dictParsed = parsePasswordFile(dictContent);

      const patterns = generatePasswordPatterns({
        firstName: "John",
        lastName: "Smith",
      });

      const allPasswords = new Set([
        ...dictParsed.entries.map((e) => e.password),
        ...patterns.passwords,
      ]);

      expect(allPasswords.size).toBeGreaterThan(dictParsed.entries.length);
      expect(allPasswords.has("password123")).toBe(true);
      expect(allPasswords.has("JohnSmith")).toBe(true);
    });
  });

  describe("Step 3: Attempt Controller", () => {
    it("controls auth attempts with rate limiting", async () => {
      const controller = new AuthAttemptController({
        enabled: true,
        delayMs: 1,
        jitterFactor: 0,
        maxAttemptsPerEmail: 5,
        proxyRotateEvery: 10,
        domainCooldownMs: 50,
      });

      const results: boolean[] = [];
      for (let i = 0; i < 7; i++) {
        const check = await controller.beforeAttempt("test@gmail.com");
        results.push(check.allowed);
        if (check.allowed) {
          controller.afterAttempt("test@gmail.com", false);
        }
      }

      expect(results.slice(0, 5)).toEqual([true, true, true, true, true]);
      expect(results[5]).toBe(false);
      expect(results[6]).toBe(false);
    });
  });

  describe("Step 4: Success Detection Types", () => {
    it("full_access detection result", () => {
      const detection: DetectionResult = {
        success: true,
        accessLevel: "full_access",
        confidence: 100,
        has2fa: false,
        hasInbox: true,
        messageCount: 150,
        provider: "Google",
      };

      expect(detection.success).toBe(true);
      expect(detection.accessLevel).toBe("full_access");
      expect(detection.confidence).toBe(100);
    });

    it("partial_2fa detection result", () => {
      const detection: DetectionResult = {
        success: true,
        accessLevel: "partial_2fa",
        confidence: 80,
        has2fa: true,
        provider: "Microsoft",
      };

      expect(detection.has2fa).toBe(true);
      expect(detection.confidence).toBeLessThan(100);
    });
  });

  describe("Step 5: Matching Progress Structure", () => {
    it("tracks email and password-level progress", () => {
      const progress: MatchingProgress = {
        totalEmails: 100,
        processed: 45,
        found: 12,
        notFound: 33,
        errors: 0,
        currentEmail: "user45@gmail.com",
        currentPasswordIndex: 250,
        totalPasswords: 5000,
      };

      expect(progress.totalEmails).toBe(100);
      expect(progress.processed).toBe(45);
      expect(progress.found).toBe(12);
      expect(progress.currentPasswordIndex).toBe(250);
      expect(progress.totalPasswords).toBe(5000);

      const overallProgress =
        (progress.processed / progress.totalEmails) * 100;
      expect(overallProgress).toBe(45);
    });
  });

  describe("Step 6: Recovery Pipeline Result Structure", () => {
    it("aggregates all stages", () => {
      const result: RecoveryPipelineResult = {
        stage1: { patternsGenerated: 87 },
        stage2: {
          totalPasswords: 5087,
          fromDictionaries: 5000,
          fromPatterns: 87,
        },
        stage3: { emailsTested: 100, found: 35, notFound: 65 },
        stage4: { fullAccess: 22, partial2fa: 8, tokenOnly: 5 },
        totalRecovered: 35,
        duration: 272000,
      };

      expect(result.stage1.patternsGenerated).toBe(87);
      expect(result.stage2.totalPasswords).toBe(
        result.stage2.fromDictionaries + result.stage2.fromPatterns,
      );
      expect(result.stage3.found + result.stage3.notFound).toBe(
        result.stage3.emailsTested,
      );
      expect(
        result.stage4.fullAccess +
          result.stage4.partial2fa +
          result.stage4.tokenOnly,
      ).toBe(result.totalRecovered);
    });
  });

  describe("Step 7: End-to-End Data Flow", () => {
    it("dictionary → patterns → merge → complete flow", () => {
      // Step 1: Parse dictionary
      const dictPasswords = parsePasswordFile(
        "password\nadmin\n123456\nqwerty\nletmein",
      );
      expect(dictPasswords.entries).toHaveLength(5);

      // Step 2: Generate patterns
      const patterns = generatePasswordPatterns({
        firstName: "John",
        lastName: "Doe",
        birthDate: "1995-03-20",
      });
      expect(patterns.passwords.length).toBeGreaterThan(0);

      // Step 3: Merge (dedup)
      const allPasswords = new Set([
        ...dictPasswords.entries.map((e) => e.password),
        ...patterns.passwords,
      ]);
      expect(allPasswords.size).toBeGreaterThan(5);

      // Step 4: Verify no duplicates
      const arr = Array.from(allPasswords);
      const reDeduped = new Set(arr);
      expect(reDeduped.size).toBe(arr.length);

      // Step 5: Verify patterns contain expected values
      expect(patterns.passwords).toContain("JohnDoe");
      expect(patterns.passwords).toContain("john1995");
      expect(patterns.passwords).toContain("John2003");

      // Step 6: Export format check
      const csvLines = ["email,password,access_level,provider"];
      const mockResults = [
        { email: "test@gmail.com", password: "John1995", level: "full_access", provider: "Google" },
        { email: "user@yahoo.com", password: "admin", level: "partial_2fa", provider: "Yahoo" },
      ];
      for (const r of mockResults) {
        csvLines.push(`${r.email},${r.password},${r.level},${r.provider}`);
      }
      const csv = csvLines.join("\n");
      expect(csv).toContain("email,password,access_level,provider");
      expect(csv).toContain("test@gmail.com,John1995,full_access,Google");
      expect(csv.split("\n")).toHaveLength(3);
    });
  });
});
