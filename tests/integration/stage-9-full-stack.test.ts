/**
 * Integration tests for Stage 9: Web API Authentication Testing
 * Tests all 9 substeps working together
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { HttpClient } from "../../src/services/http/client.js";
import { SessionStore } from "../../src/services/http/session-store.js";
import { buildAuthRequest } from "../../src/services/oauth/builder.js";
import { OAuthClient } from "../../src/services/oauth/client.js";
import { analyzeHttpResponse } from "../../src/utils/http-response-analyzer/analyzer.js";
import { WebAuthVerifier } from "../../src/services/web-auth/verifier.js";
import { ParallelVerificationController } from "../../src/services/verification/controller.js";
import type { CredentialInput } from "../../src/services/verification/types.js";

// Mock external HTTP calls
vi.mock("axios");

describe("Stage 9: Full Stack Integration", () => {
  describe("HTTP Client + Response Analyzer", () => {
    it("creates HTTP client with proper configuration", () => {
      const client = new HttpClient({
        retryConfig: {
          enabled: true,
          maxRetries: 3,
          baseDelay: 1000,
          jitterFactor: 0.25,
        },
      });

      expect(client).toBeDefined();
    });

    it("analyzes successful response", () => {
      const analysis = analyzeHttpResponse(
        200,
        { "content-type": "application/json" },
        { access_token: "test-token", token_type: "Bearer" },
      );

      expect(analysis.classification).toBe("auth_success");
      expect(analysis.reason.confidence).toBe(100);
    });

    it("analyzes rate limit response", () => {
      const analysis = analyzeHttpResponse(
        429,
        { "retry-after": "60", "x-ratelimit-remaining": "0" },
        { error: "rate_limit_exceeded" },
      );

      expect(analysis.classification).toBe("rate_limited");
      expect(analysis.rateLimit?.retryAfter).toBe(60);
    });

    it("analyzes invalid credentials", () => {
      const analysis = analyzeHttpResponse(
        401,
        {},
        { error: "invalid_grant", error_description: "Invalid credentials" },
      );

      expect(analysis.classification).toBe("invalid_credentials");
      expect(analysis.reason.confidence).toBeGreaterThanOrEqual(90);
    });
  });

  describe("OAuth Builder + Request", () => {
    it("builds OAuth request for Google", () => {
      const request = buildAuthRequest("Google", "test@gmail.com", "password");

      expect(request.provider).toBe("Google");
      expect(request.url).toContain("googleapis.com");
      expect(request.headers["Content-Type"]).toBe(
        "application/x-www-form-urlencoded",
      );
      expect(request.data).toBeDefined();
    });

    it("builds OAuth request with auto-detection", () => {
      const request = buildAuthRequest(null, "test@outlook.com", "password");

      expect(request.provider).toBe("Microsoft");
      expect(request.url).toContain("microsoftonline.com");
    });

    it("supports multiple providers", () => {
      const providers = ["Google", "Microsoft", "Yahoo", "AOL"];

      providers.forEach((provider) => {
        const request = buildAuthRequest(
          provider as any,
          `test@${provider.toLowerCase()}.com`,
          "password",
        );

        expect(request.provider).toBe(provider);
        expect(request.url).toBeTruthy();
      });
    });
  });

  describe("Session Management", () => {
    it("creates session store", () => {
      const sessionStore = new SessionStore();
      expect(sessionStore).toBeDefined();
    });

    it("stores and retrieves cookies", async () => {
      const sessionStore = new SessionStore();

      await sessionStore.setCookie(
        "example.com",
        "session=abc123; Path=/; HttpOnly; Secure",
      );

      const cookies = await sessionStore.getCookies("example.com");
      expect(cookies.length).toBeGreaterThan(0);
      expect(cookies[0]).toContain("session=abc123");
    });

    it("clears session", async () => {
      const sessionStore = new SessionStore();

      await sessionStore.setCookie("example.com", "session=test");
      const cookiesBefore = await sessionStore.getCookies("example.com");
      expect(cookiesBefore.length).toBeGreaterThan(0);

      await sessionStore.clearSession("example.com");
      const cookiesAfter = await sessionStore.getCookies("example.com");
      expect(cookiesAfter).toHaveLength(0);
    });
  });

  describe("OAuth Client Integration", () => {
    it("creates OAuth client with HTTP client", () => {
      const httpClient = new HttpClient();
      const oauthClient = new OAuthClient(httpClient);

      expect(oauthClient).toBeDefined();
    });

    it("creates OAuth client with session store", () => {
      const sessionStore = new SessionStore();
      const httpClient = new HttpClient({ sessionStore });
      const oauthClient = new OAuthClient(httpClient);

      expect(oauthClient).toBeDefined();
    });
  });

  describe("Parallel Verification Controller", () => {
    it("creates controller", () => {
      const controller = new ParallelVerificationController();
      expect(controller).toBeDefined();
    });

    it("handles empty credentials array", async () => {
      const controller = new ParallelVerificationController();

      const result = await controller.verifyBatch([], {
        saveResults: false,
      });

      expect(result.total).toBe(0);
      expect(result.successful).toBe(0);
      expect(result.failed).toBe(0);
    });

    it("emits events during verification", async () => {
      const controller = new ParallelVerificationController();

      const events: string[] = [];
      controller.on("start", () => events.push("start"));
      controller.on("complete", () => events.push("complete"));

      const credentials: CredentialInput[] = [
        {
          protocol: "SMTP",
          email: "test@example.com",
        },
      ];

      await controller.verifyBatch(credentials, {
        saveResults: false,
      });

      expect(events).toContain("start");
      expect(events).toContain("complete");
    });

    it("calculates statistics", async () => {
      const controller = new ParallelVerificationController();

      const credentials: CredentialInput[] = [
        { protocol: "SMTP", email: "test1@example.com" },
        { protocol: "SMTP", email: "test2@example.com" },
      ];

      const result = await controller.verifyBatch(credentials, {
        saveResults: false,
      });

      expect(result.stats).toBeDefined();
      expect(result.stats.byProtocol).toHaveProperty("SMTP");
      expect(result.stats.averageResponseTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Multi-Component Integration", () => {
    it("integrates HTTP client, session store, and OAuth", () => {
      const sessionStore = new SessionStore();
      const httpClient = new HttpClient({
        sessionStore,
        retryConfig: {
          enabled: true,
          maxRetries: 3,
        },
      });
      const oauthClient = new OAuthClient(httpClient);

      expect(sessionStore).toBeDefined();
      expect(httpClient).toBeDefined();
      expect(oauthClient).toBeDefined();
    });

    it("builds OAuth request and analyzes response", () => {
      const request = buildAuthRequest("Google", "test@gmail.com", "password");

      expect(request.provider).toBe("Google");

      // Simulate response
      const mockResponse = {
        status: 200,
        headers: { "content-type": "application/json" },
        data: { access_token: "test-token" },
      };

      const analysis = analyzeHttpResponse(
        mockResponse.status,
        mockResponse.headers,
        mockResponse.data,
      );

      expect(analysis.classification).toBe("auth_success");
    });

    it("verifies provider configuration coverage", () => {
      const providers = [
        "Google",
        "Microsoft",
        "Yahoo",
        "AOL",
        "MailRu",
        "Apple",
        "ProtonMail",
        "Zoho",
      ];

      providers.forEach((provider) => {
        const request = buildAuthRequest(
          provider as any,
          `test@${provider.toLowerCase()}.com`,
          "password",
        );

        expect(request.provider).toBe(provider);
        expect(request.url).toBeTruthy();
        expect(request.headers).toBeDefined();
      });
    });
  });

  describe("Error Handling", () => {
    it("handles invalid provider gracefully", () => {
      expect(() => {
        buildAuthRequest("InvalidProvider" as any, "test@test.com", "password");
      }).toThrow();
    });

    it("handles malformed email", () => {
      expect(() => {
        buildAuthRequest("Google", "invalid-email", "password");
      }).toThrow();
    });

    it("analyzes error responses correctly", () => {
      const errorScenarios = [
        {
          status: 401,
          data: { error: "invalid_grant" },
          expected: "invalid_credentials",
        },
        {
          status: 429,
          data: { error: "rate_limit_exceeded" },
          expected: "rate_limited",
        },
        {
          status: 423,
          data: { error: "account_locked" },
          expected: "account_locked",
        },
      ];

      errorScenarios.forEach(({ status, data, expected }) => {
        const analysis = analyzeHttpResponse(status, {}, data);
        expect(analysis.classification).toBe(expected);
      });
    });
  });

  describe("Performance & Concurrency", () => {
    it("handles concurrent verification with p-limit", async () => {
      const controller = new ParallelVerificationController();

      const credentials: CredentialInput[] = Array.from(
        { length: 10 },
        (_, i) => ({
          protocol: "SMTP" as const,
          email: `test${i}@example.com`,
        }),
      );

      const startTime = Date.now();
      const result = await controller.verifyBatch(credentials, {
        concurrency: 3,
        useJitter: false,
        saveResults: false,
      });
      const duration = Date.now() - startTime;

      expect(result.total).toBe(10);
      expect(result.duration).toBeGreaterThan(0);
      expect(duration).toBeGreaterThan(0);
    });
  });
});
