import { describe, it, expect, beforeEach, vi } from "vitest";
import { ParallelVerificationController } from "../../src/services/verification/controller.js";
import type { CredentialInput } from "../../src/services/verification/types.js";

// Simple mocks
vi.mock("../../src/services/imap/verifier.js", () => ({
  IMAPVerifier: class {
    constructor() {}
    async tryAuthenticate() {
      return { success: true, errorType: null };
    }
    async tryAuthenticateWithStatus() {
      return {
        success: true,
        errorType: null,
        accountStatus: {
          status: "active_clean",
          reason: "Account is active and secure",
          matchedRule: "Rule_1_ActiveClean",
          factors: {
            authSuccess: true,
            inboxAccessible: true,
            hasSecurityHeaders: false,
            hasSuspiciousKeywords: false,
          },
        },
      };
    }
  },
}));

vi.mock("../../src/services/pop3/verifier.js", () => ({
  POP3Verifier: class {
    constructor() {}
    async tryAuthenticate() {
      return { success: true, errorType: null };
    }
  },
}));

vi.mock("../../src/services/smtp/verifier.js", () => ({
  verifyMailbox: async () => ({
    email: "test@example.com",
    status: "deliverable",
    mxHost: "mx.example.com",
    smtpCode: 250,
    smtpMessage: "OK",
    responseTime: 100,
    error: null,
  }),
}));

vi.mock("../../src/services/web-auth/verifier.js", () => ({
  WebAuthVerifier: class {
    constructor() {}
    async testWebAuth() {
      return {
        type: "success",
        success: true,
        urlChanged: true,
        responseTime: 100,
      };
    }
  },
}));

vi.mock("../../src/services/oauth/client.js", () => ({
  OAuthClient: class {
    constructor() {}
    async authenticate() {
      return { success: true, provider: "Google", responseTime: 100 };
    }
  },
}));

vi.mock("../../src/services/auth-results/aggregator.js", () => ({
  saveAuthResult: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/utils/randomization.js", () => ({
  sleepWithJitter: vi.fn().mockResolvedValue(undefined),
}));

describe("ParallelVerificationController", () => {
  let controller: ParallelVerificationController;

  beforeEach(() => {
    controller = new ParallelVerificationController();
  });

  it("creates controller instance", () => {
    expect(controller).toBeInstanceOf(ParallelVerificationController);
  });

  it("verifies IMAP credentials", async () => {
    const credentials: CredentialInput[] = [
      {
        protocol: "IMAP",
        email: "user@example.com",
        password: "password",
        host: "imap.example.com",
        port: 993,
        tls: true,
      },
    ];

    const result = await controller.verifyBatch(credentials, {
      saveResults: false,
    });

    expect(result.total).toBe(1);
    expect(result.successful).toBe(1);
  });

  it("verifies SMTP emails", async () => {
    const credentials: CredentialInput[] = [
      {
        protocol: "SMTP",
        email: "user@example.com",
      },
    ];

    const result = await controller.verifyBatch(credentials, {
      saveResults: false,
    });

    expect(result.total).toBe(1);
    expect(result.successful).toBe(1);
  });

  it("verifies OAuth credentials", async () => {
    const credentials: CredentialInput[] = [
      {
        protocol: "OAUTH",
        email: "user@gmail.com",
        password: "password",
        provider: "Google",
      },
    ];

    const result = await controller.verifyBatch(credentials, {
      saveResults: false,
    });

    expect(result.total).toBe(1);
    expect(result.successful).toBe(1);
  });

  it("handles empty credentials array", async () => {
    const result = await controller.verifyBatch([], { saveResults: false });

    expect(result.total).toBe(0);
    expect(result.successful).toBe(0);
  });

  it("emits events", async () => {
    const startListener = vi.fn();
    const completeListener = vi.fn();
    controller.on("start", startListener);
    controller.on("complete", completeListener);

    const credentials: CredentialInput[] = [
      {
        protocol: "SMTP",
        email: "user@example.com",
      },
    ];

    await controller.verifyBatch(credentials, { saveResults: false });

    expect(startListener).toHaveBeenCalledTimes(1);
    expect(completeListener).toHaveBeenCalledTimes(1);
  });
});
