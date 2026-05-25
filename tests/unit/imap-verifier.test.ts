import { describe, it, expect, vi, beforeEach } from "vitest";
import { IMAPVerifier } from "../../src/services/imap/verifier.js";

const { mockConnect, mockEnd } = vi.hoisted(() => ({
  mockConnect: vi.fn(),
  mockEnd: vi.fn(),
}));

vi.mock("imap-simple", () => ({
  default: {
    connect: mockConnect,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockEnd.mockResolvedValue(undefined);
});

describe("IMAPVerifier", () => {
  const config = {
    host: "imap.test.com",
    port: 993,
    user: "test@test.com",
    password: "password",
    tls: true,
  };

  it("connects successfully and returns success", async () => {
    mockConnect.mockResolvedValue({ end: mockEnd });

    const verifier = new IMAPVerifier();
    const result = await verifier.connect(config);

    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
    expect(result.responseTime).toBeGreaterThanOrEqual(0);
    expect(mockEnd).toHaveBeenCalled();
  });

  it("handles connection timeout", async () => {
    const err = new Error("Timeout") as NodeJS.ErrnoException;
    err.code = "ETIMEDOUT";
    mockConnect.mockRejectedValue(err);

    const verifier = new IMAPVerifier();
    const result = await verifier.connect(config);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Connection timeout");
  });

  it("handles connection refused", async () => {
    const err = new Error("Refused") as NodeJS.ErrnoException;
    err.code = "ECONNREFUSED";
    mockConnect.mockRejectedValue(err);

    const verifier = new IMAPVerifier();
    const result = await verifier.connect(config);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Connection refused");
  });

  it("handles host not found", async () => {
    const err = new Error("Not found") as NodeJS.ErrnoException;
    err.code = "ENOTFOUND";
    mockConnect.mockRejectedValue(err);

    const verifier = new IMAPVerifier();
    const result = await verifier.connect(config);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Host not found");
  });

  it("handles authentication failure", async () => {
    mockConnect.mockRejectedValue(new Error("AUTHENTICATIONFAILED"));

    const verifier = new IMAPVerifier();
    const result = await verifier.connect(config);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Authentication failed");
  });

  it("uses custom timeout", async () => {
    mockConnect.mockResolvedValue({ end: mockEnd });

    const verifier = new IMAPVerifier(5000);
    await verifier.connect(config);

    expect(mockConnect).toHaveBeenCalledWith(
      expect.objectContaining({
        imap: expect.objectContaining({
          authTimeout: 5000,
          connTimeout: 5000,
        }),
      }),
    );
  });

  describe("tryAuthenticate", () => {
    const credentials = {
      host: "imap.test.com",
      port: 993,
      user: "test@test.com",
      password: "password",
      tls: true,
    };

    it("authenticates successfully", async () => {
      mockConnect.mockResolvedValue({ end: mockEnd });

      const verifier = new IMAPVerifier();
      const result = await verifier.tryAuthenticate(credentials);

      expect(result.success).toBe(true);
      expect(result.errorType).toBeNull();
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
      expect(mockEnd).toHaveBeenCalled();
    });

    it("detects authentication failure", async () => {
      mockConnect.mockRejectedValue(new Error("Authentication failed"));

      const verifier = new IMAPVerifier();
      const result = await verifier.tryAuthenticate(credentials);

      expect(result.success).toBe(false);
      expect(result.errorType).toBe("auth_failed");
      expect(result.message).toBe("Authentication failed");
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
    });

    it("detects connection error (ECONNREFUSED)", async () => {
      const err = new Error("Connection refused") as NodeJS.ErrnoException;
      err.code = "ECONNREFUSED";
      mockConnect.mockRejectedValue(err);

      const verifier = new IMAPVerifier();
      const result = await verifier.tryAuthenticate(credentials);

      expect(result.success).toBe(false);
      expect(result.errorType).toBe("connection_error");
      expect(result.message).toBe("Connection refused");
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
    });

    it("detects timeout", async () => {
      const err = new Error("Timeout") as NodeJS.ErrnoException;
      err.code = "ETIMEDOUT";
      mockConnect.mockRejectedValue(err);

      const verifier = new IMAPVerifier();
      const result = await verifier.tryAuthenticate(credentials);

      expect(result.success).toBe(false);
      expect(result.errorType).toBe("timeout");
      expect(result.message).toBe("Connection timeout");
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
    });

    it("detects too many connections", async () => {
      mockConnect.mockRejectedValue(new Error("Too many connections"));

      const verifier = new IMAPVerifier();
      const result = await verifier.tryAuthenticate(credentials);

      expect(result.success).toBe(false);
      expect(result.errorType).toBe("connection_error");
      expect(result.message).toBe("Too many connections");
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
    });

    it("detects 2FA required", async () => {
      mockConnect.mockRejectedValue(new Error("2FA required"));

      const verifier = new IMAPVerifier();
      const result = await verifier.tryAuthenticate(credentials);

      expect(result.success).toBe(false);
      expect(result.errorType).toBe("additional_verification_required");
      expect(result.message).toContain("two_factor");
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
    });

    it("handles AUTHENTICATIONFAILED error", async () => {
      mockConnect.mockRejectedValue(new Error("AUTHENTICATIONFAILED"));

      const verifier = new IMAPVerifier();
      const result = await verifier.tryAuthenticate(credentials);

      expect(result.success).toBe(false);
      expect(result.errorType).toBe("auth_failed");
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
    });

    it("detects CAPTCHA requirement", async () => {
      mockConnect.mockRejectedValue({
        message: "Please solve the CAPTCHA to continue",
      });

      const verifier = new IMAPVerifier();
      const result = await verifier.tryAuthenticate(credentials);

      expect(result.success).toBe(false);
      expect(result.errorType).toBe("additional_verification_required");
      expect(result.message).toContain("captcha");
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
    });

    it("detects verification code requirement", async () => {
      mockConnect.mockRejectedValue({
        message: "Please enter verification code sent to your phone",
      });

      const verifier = new IMAPVerifier();
      const result = await verifier.tryAuthenticate(credentials);

      expect(result.success).toBe(false);
      expect(result.errorType).toBe("additional_verification_required");
      expect(result.message).toContain("two_factor");
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
    });

    it("detects suspicious activity", async () => {
      mockConnect.mockRejectedValue({
        message: "Suspicious activity detected. Verify your identity.",
      });

      const verifier = new IMAPVerifier();
      const result = await verifier.tryAuthenticate(credentials);

      expect(result.success).toBe(false);
      expect(result.errorType).toBe("additional_verification_required");
      expect(result.message).toContain("verification");
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe("tryAuthenticateWithInbox", () => {
    const credentials = {
      host: "imap.test.com",
      port: 993,
      user: "test@test.com",
      password: "password",
      tls: true,
    };

    it("returns fully_accessible with message counts", async () => {
      const mockStatus = vi.fn((box, callback) => {
        callback(null, {
          messages: {
            unseen: 5,
            total: 100,
            new: 2,
          },
        });
      });

      const mockConnection = {
        imap: {
          status: mockStatus,
        },
        end: mockEnd,
      };

      mockConnect.mockResolvedValue(mockConnection);

      const verifier = new IMAPVerifier();
      const result = await verifier.tryAuthenticateWithInbox(credentials);

      expect(result.success).toBe(true);
      expect(result.errorType).toBeNull();
      expect(result.inboxCheck).toBeDefined();
      expect(result.inboxCheck?.status).toBe("fully_accessible");
      expect(result.inboxCheck?.unseenCount).toBe(5);
      expect(result.inboxCheck?.totalCount).toBe(100);
      expect(result.inboxCheck?.responseTime).toBeGreaterThanOrEqual(0);
      expect(mockEnd).toHaveBeenCalled();
    });

    it("returns restricted_access on permission error", async () => {
      const mockStatus = vi.fn((box, callback) => {
        callback(new Error("Permission denied"));
      });

      const mockConnection = {
        imap: {
          status: mockStatus,
        },
        end: mockEnd,
      };

      mockConnect.mockResolvedValue(mockConnection);

      const verifier = new IMAPVerifier();
      const result = await verifier.tryAuthenticateWithInbox(credentials);

      expect(result.success).toBe(true);
      expect(result.inboxCheck).toBeDefined();
      expect(result.inboxCheck?.status).toBe("restricted_access");
      expect(result.inboxCheck?.error).toBe("Access restricted");
      expect(mockEnd).toHaveBeenCalled();
    });

    it("returns restricted_access on generic error", async () => {
      const mockStatus = vi.fn((box, callback) => {
        callback(new Error("Mailbox does not exist"));
      });

      const mockConnection = {
        imap: {
          status: mockStatus,
        },
        end: mockEnd,
      };

      mockConnect.mockResolvedValue(mockConnection);

      const verifier = new IMAPVerifier();
      const result = await verifier.tryAuthenticateWithInbox(credentials);

      expect(result.success).toBe(true);
      expect(result.inboxCheck?.status).toBe("restricted_access");
      expect(result.inboxCheck?.error).toBe("Mailbox does not exist");
    });

    it("does not check inbox if auth fails", async () => {
      const err = new Error("Authentication failed");
      mockConnect.mockRejectedValue(err);

      const verifier = new IMAPVerifier();
      const result = await verifier.tryAuthenticateWithInbox(credentials);

      expect(result.success).toBe(false);
      expect(result.errorType).toBe("auth_failed");
      expect(result.inboxCheck).toBeUndefined();
    });

    it("handles connection timeout during auth", async () => {
      const err = new Error("Timeout") as NodeJS.ErrnoException;
      err.code = "ETIMEDOUT";
      mockConnect.mockRejectedValue(err);

      const verifier = new IMAPVerifier();
      const result = await verifier.tryAuthenticateWithInbox(credentials);

      expect(result.success).toBe(false);
      expect(result.errorType).toBe("timeout");
      expect(result.message).toBe("Connection timeout");
      expect(result.inboxCheck).toBeUndefined();
    });

    it("handles connection refused during auth", async () => {
      const err = new Error("Connection refused") as NodeJS.ErrnoException;
      err.code = "ECONNREFUSED";
      mockConnect.mockRejectedValue(err);

      const verifier = new IMAPVerifier();
      const result = await verifier.tryAuthenticateWithInbox(credentials);

      expect(result.success).toBe(false);
      expect(result.errorType).toBe("connection_error");
      expect(result.message).toBe("Connection refused");
      expect(result.inboxCheck).toBeUndefined();
    });

    it("returns message counts with zero unseen", async () => {
      const mockStatus = vi.fn((box, callback) => {
        callback(null, {
          messages: {
            unseen: 0,
            total: 50,
            new: 0,
          },
        });
      });

      const mockConnection = {
        imap: {
          status: mockStatus,
        },
        end: mockEnd,
      };

      mockConnect.mockResolvedValue(mockConnection);

      const verifier = new IMAPVerifier();
      const result = await verifier.tryAuthenticateWithInbox(credentials);

      expect(result.success).toBe(true);
      expect(result.inboxCheck?.status).toBe("fully_accessible");
      expect(result.inboxCheck?.unseenCount).toBe(0);
      expect(result.inboxCheck?.totalCount).toBe(50);
    });

    it("handles protection mechanism during auth", async () => {
      const err = new Error(
        "Too many login attempts. Please verify your identity.",
      );
      mockConnect.mockRejectedValue(err);

      const verifier = new IMAPVerifier();
      const result = await verifier.tryAuthenticateWithInbox(credentials);

      expect(result.success).toBe(false);
      expect(result.errorType).toBe("additional_verification_required");
      expect(result.message).toContain("Protection detected");
      expect(result.inboxCheck).toBeUndefined();
    });
  });

  describe("tryAuthenticateWithSecurity", () => {
    const credentials = {
      host: "imap.test.com",
      port: 993,
      user: "test@test.com",
      password: "password",
      tls: true,
    };

    const mockOpenBox = vi.fn();
    const mockSearch = vi.fn();

    beforeEach(() => {
      mockOpenBox.mockResolvedValue();
      mockSearch.mockResolvedValue([]);
    });

    it("detects security headers", async () => {
      const mockStatus = vi.fn((box, callback) => {
        callback(null, {
          messages: { unseen: 1, total: 5, new: 0 },
        });
      });

      const mockMessages = [
        {
          parts: [
            {
              which: "HEADER",
              body: {
                "x-microsoft-auth-": ["login-attempt-123"],
                subject: ["Security Alert"],
              },
            },
            { which: "TEXT", body: "Normal email content" },
          ],
        },
      ];

      mockSearch.mockResolvedValue(mockMessages);

      const mockConnection = {
        imap: { status: mockStatus },
        openBox: mockOpenBox,
        search: mockSearch,
        end: mockEnd,
      };

      mockConnect.mockResolvedValue(mockConnection);

      const verifier = new IMAPVerifier();
      const result = await verifier.tryAuthenticateWithSecurity(credentials, 10);

      expect(result.success).toBe(true);
      expect(result.inboxCheck?.securityCheck?.hasSecurityWarnings).toBe(true);
      expect(result.inboxCheck?.securityCheck?.warnings?.length).toBeGreaterThan(0);
      expect(result.inboxCheck?.securityCheck?.warnings?.[0].type).toBe("header");
    });

    it("detects body keywords", async () => {
      const mockStatus = vi.fn((box, callback) => {
        callback(null, {
          messages: { unseen: 0, total: 1, new: 0 },
        });
      });

      const mockMessages = [
        {
          parts: [
            { which: "HEADER", body: { subject: ["Notification"] } },
            {
              which: "TEXT",
              body: "We detected suspicious activity on your account.",
            },
          ],
        },
      ];

      mockSearch.mockResolvedValue(mockMessages);

      const mockConnection = {
        imap: { status: mockStatus },
        openBox: mockOpenBox,
        search: mockSearch,
        end: mockEnd,
      };

      mockConnect.mockResolvedValue(mockConnection);

      const verifier = new IMAPVerifier();
      const result = await verifier.tryAuthenticateWithSecurity(credentials);

      expect(result.inboxCheck?.securityCheck?.warnings?.[0].type).toBe("body");
      expect(result.inboxCheck?.securityCheck?.warnings?.[0].value).toContain(
        "suspicious activity",
      );
    });

    it("handles empty inbox", async () => {
      const mockStatus = vi.fn((box, callback) => {
        callback(null, {
          messages: { unseen: 0, total: 0, new: 0 },
        });
      });

      mockSearch.mockResolvedValue([]);

      const mockConnection = {
        imap: { status: mockStatus },
        openBox: mockOpenBox,
        search: mockSearch,
        end: mockEnd,
      };

      mockConnect.mockResolvedValue(mockConnection);

      const verifier = new IMAPVerifier();
      const result = await verifier.tryAuthenticateWithSecurity(credentials);

      expect(result.inboxCheck?.securityCheck?.messagesScanned).toBe(0);
      expect(result.inboxCheck?.securityCheck?.hasSecurityWarnings).toBe(false);
    });
  });

  describe("tryAuthenticateWithStatus", () => {
    const credentials = {
      host: "imap.test.com",
      port: 993,
      user: "test@test.com",
      password: "password",
      tls: true,
    };

    const mockOpenBox = vi.fn();
    const mockSearch = vi.fn();

    beforeEach(() => {
      mockOpenBox.mockResolvedValue();
      mockSearch.mockResolvedValue([]);
    });

    it("includes account status in result", async () => {
      const mockStatus = vi.fn((box, callback) => {
        callback(null, {
          messages: { unseen: 1, total: 5, new: 0 },
        });
      });

      const mockMessages = [
        {
          parts: [
            {
              which: "HEADER",
              body: { subject: ["Test"] },
            },
            { which: "TEXT", body: "Normal email content" },
          ],
        },
      ];

      mockSearch.mockResolvedValue(mockMessages);

      const mockConnection = {
        imap: { status: mockStatus },
        openBox: mockOpenBox,
        search: mockSearch,
        end: mockEnd,
      };

      mockConnect.mockResolvedValue(mockConnection);

      const verifier = new IMAPVerifier();
      const result = await verifier.tryAuthenticateWithStatus(credentials, 10);

      expect(result.success).toBe(true);
      expect(result.accountStatus).toBeDefined();
      expect(result.accountStatus?.status).toBe("active_clean");
      expect(result.accountStatus?.reason).toBeDefined();
      expect(result.accountStatus?.matchedRule).toBeDefined();
      expect(result.accountStatus?.factors).toBeDefined();
    });

    it("classifies account as active_clean when no warnings", async () => {
      const mockStatus = vi.fn((box, callback) => {
        callback(null, {
          messages: { unseen: 0, total: 1, new: 0 },
        });
      });

      mockSearch.mockResolvedValue([]);

      const mockConnection = {
        imap: { status: mockStatus },
        openBox: mockOpenBox,
        search: mockSearch,
        end: mockEnd,
      };

      mockConnect.mockResolvedValue(mockConnection);

      const verifier = new IMAPVerifier();
      const result = await verifier.tryAuthenticateWithStatus(credentials);

      expect(result.accountStatus?.status).toBe("active_clean");
      expect(result.accountStatus?.matchedRule).toBe("no_warnings");
    });

    it("classifies account as locked on auth failure", async () => {
      mockConnect.mockRejectedValue(new Error("Authentication failed"));

      const verifier = new IMAPVerifier();
      const result = await verifier.tryAuthenticateWithStatus(credentials);

      expect(result.success).toBe(false);
      expect(result.accountStatus?.status).toBe("locked");
      expect(result.accountStatus?.matchedRule).toBe("auth_failed");
    });
  });
});
