import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks
const {
  mockClose,
  mockClick,
  mockType,
  mockWaitForSelector,
  mockGoto,
  mockUrl,
  mockDollar,
  mockContent,
  mockEvaluate,
  mockSetViewport,
  mockSetUserAgent,
  mockSetDefaultTimeout,
  mockAuthenticate,
  mockWaitForNavigation,
  mockPageClose,
  mockNewPage,
  mockBrowserClose,
  mockLaunch,
} = vi.hoisted(() => {
  const mockClose = vi.fn();
  const mockClick = vi.fn();
  const mockType = vi.fn();
  const mockWaitForSelector = vi.fn();
  const mockGoto = vi.fn();
  const mockUrl = vi.fn();
  const mockDollar = vi.fn();
  const mockContent = vi.fn();
  const mockEvaluate = vi.fn();
  const mockSetViewport = vi.fn();
  const mockSetUserAgent = vi.fn();
  const mockSetDefaultTimeout = vi.fn();
  const mockAuthenticate = vi.fn();
  const mockWaitForNavigation = vi.fn();
  const mockPageClose = vi.fn();

  const mockPage = {
    goto: mockGoto,
    waitForSelector: mockWaitForSelector,
    type: mockType,
    click: mockClick,
    waitForNavigation: mockWaitForNavigation,
    url: mockUrl,
    $: mockDollar,
    content: mockContent,
    evaluate: mockEvaluate,
    setViewport: mockSetViewport,
    setUserAgent: mockSetUserAgent,
    setDefaultTimeout: mockSetDefaultTimeout,
    authenticate: mockAuthenticate,
    close: mockPageClose,
  };

  const mockNewPage = vi.fn().mockResolvedValue(mockPage);
  const mockBrowserClose = vi.fn();

  const mockBrowser = {
    newPage: mockNewPage,
    close: mockBrowserClose,
  };

  const mockLaunch = vi.fn().mockResolvedValue(mockBrowser);

  return {
    mockClose,
    mockClick,
    mockType,
    mockWaitForSelector,
    mockGoto,
    mockUrl,
    mockDollar,
    mockContent,
    mockEvaluate,
    mockSetViewport,
    mockSetUserAgent,
    mockSetDefaultTimeout,
    mockAuthenticate,
    mockWaitForNavigation,
    mockPageClose,
    mockNewPage,
    mockBrowserClose,
    mockLaunch,
  };
});

vi.mock("puppeteer-core", () => ({
  default: {
    launch: mockLaunch,
  },
}));

vi.mock("puppeteer-extra", () => ({
  default: {
    use: vi.fn().mockReturnThis(),
    launch: mockLaunch,
  },
}));

vi.mock("puppeteer-extra-plugin-stealth", () => ({
  default: vi.fn().mockReturnValue({}),
}));

import { WebAuthVerifier } from "../../src/services/web-auth/verifier.js";
import { mapWebAuthResultToAuthStatus } from "../../src/services/web-auth/mapper.js";

describe("WebAuthVerifier", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset default mock behaviors
    mockGoto.mockResolvedValue(undefined);
    mockUrl.mockReturnValue("https://example.com/login");
    mockWaitForSelector.mockResolvedValue(undefined);
    mockType.mockResolvedValue(undefined);
    mockClick.mockResolvedValue(undefined);
    mockWaitForNavigation.mockResolvedValue(undefined);
    mockDollar.mockResolvedValue(null);
    mockContent.mockResolvedValue("<html></html>");
    mockSetViewport.mockResolvedValue(undefined);
    mockPageClose.mockResolvedValue(undefined);
    mockBrowserClose.mockResolvedValue(undefined);
  });

  describe("testWebAuth", () => {
    it("returns selector_not_found when email input missing", async () => {
      const verifier = new WebAuthVerifier({ headless: true });

      // Mock waitForSelector to fail for email input
      mockWaitForSelector.mockRejectedValueOnce(
        new Error("Timeout waiting for selector"),
      );

      const result = await verifier.testWebAuth(
        "https://example.com/login",
        "user@example.com",
        "password123",
      );

      expect(result.type).toBe("selector_not_found");
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain("Email input");

      await verifier.close();
    });

    it("returns selector_not_found when password input missing", async () => {
      const verifier = new WebAuthVerifier({ headless: true });

      // Email succeeds, password fails
      mockWaitForSelector
        .mockResolvedValueOnce(undefined) // email selector
        .mockRejectedValueOnce(new Error("Timeout waiting for selector")); // password selector

      const result = await verifier.testWebAuth(
        "https://example.com/login",
        "user@example.com",
        "password123",
      );

      expect(result.type).toBe("selector_not_found");
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain("Password input");

      await verifier.close();
    });

    it("returns selector_not_found when submit button missing", async () => {
      const verifier = new WebAuthVerifier({ headless: true });

      // Email and password succeed, submit fails
      mockWaitForSelector
        .mockResolvedValueOnce(undefined) // email
        .mockResolvedValueOnce(undefined) // password
        .mockRejectedValueOnce(new Error("Timeout waiting for selector")); // submit

      const result = await verifier.testWebAuth(
        "https://example.com/login",
        "user@example.com",
        "password123",
      );

      expect(result.type).toBe("selector_not_found");
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain("Submit button");

      await verifier.close();
    });

    it("returns success when URL changes to dashboard", async () => {
      const verifier = new WebAuthVerifier({ headless: true });

      // All selectors succeed
      mockWaitForSelector.mockResolvedValue(undefined);

      // URL changes to dashboard
      // First call (originalUrl), then subsequent calls (finalUrl and analyzer)
      mockUrl
        .mockReturnValueOnce("https://example.com/login") // originalUrl in navigate
        .mockReturnValueOnce("https://example.com/dashboard") // finalUrl after submit
        .mockReturnValueOnce("https://example.com/dashboard") // in analyzer.classifyResult()
        .mockReturnValue("https://example.com/dashboard"); // any other calls

      const result = await verifier.testWebAuth(
        "https://example.com/login",
        "user@example.com",
        "password123",
      );

      expect(result.type).toBe("success");
      expect(result.success).toBe(true);
      expect(result.urlChanged).toBe(true);

      await verifier.close();
    });

    it("returns captcha_required when reCAPTCHA detected", async () => {
      const verifier = new WebAuthVerifier({ headless: true });

      // All selectors succeed
      mockWaitForSelector.mockResolvedValue(undefined);

      // URL doesn't change
      mockUrl.mockReturnValue("https://example.com/login");

      // CAPTCHA iframe detected
      mockDollar.mockImplementation((selector: string) => {
        if (selector.includes('iframe[src*="recaptcha"]')) {
          return Promise.resolve({ /* element */ });
        }
        return Promise.resolve(null);
      });

      const result = await verifier.testWebAuth(
        "https://example.com/login",
        "user@example.com",
        "password123",
      );

      expect(result.type).toBe("captcha_required");
      expect(result.success).toBe(false);
      expect(result.protection?.hasCaptcha).toBe(true);
      expect(result.protection?.captchaType).toBe("recaptcha");

      await verifier.close();
    });

    it("returns 2fa_required when 2FA input detected", async () => {
      const verifier = new WebAuthVerifier({ headless: true });

      // All selectors succeed
      mockWaitForSelector.mockResolvedValue(undefined);

      // URL doesn't change
      mockUrl.mockReturnValue("https://example.com/login");

      // 2FA input detected
      mockDollar.mockImplementation((selector: string) => {
        if (selector.includes('input[name="code"]')) {
          return Promise.resolve({ /* element */ });
        }
        return Promise.resolve(null);
      });

      const result = await verifier.testWebAuth(
        "https://example.com/login",
        "user@example.com",
        "password123",
      );

      expect(result.type).toBe("2fa_required");
      expect(result.success).toBe(false);
      expect(result.protection?.has2FA).toBe(true);

      await verifier.close();
    });

    it("returns invalid_credentials from error message", async () => {
      const verifier = new WebAuthVerifier({ headless: true });

      // All selectors succeed
      mockWaitForSelector.mockResolvedValue(undefined);

      // URL doesn't change
      mockUrl.mockReturnValue("https://example.com/login");

      // Error message detected
      mockDollar.mockImplementation((selector: string) => {
        if (selector.includes('[role="alert"]')) {
          return Promise.resolve({ /* element */ });
        }
        return Promise.resolve(null);
      });

      mockEvaluate.mockResolvedValue("Invalid password");

      const result = await verifier.testWebAuth(
        "https://example.com/login",
        "user@example.com",
        "wrong_password",
      );

      expect(result.type).toBe("invalid_credentials");
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe("Invalid password");

      await verifier.close();
    });

    it("handles timeout gracefully", async () => {
      const verifier = new WebAuthVerifier({
        headless: true,
        timeout: 100,
      });

      // Navigation times out
      mockGoto.mockRejectedValue(new Error("Navigation timeout"));

      const result = await verifier.testWebAuth(
        "https://example.com/login",
        "user@example.com",
        "password123",
      );

      expect(result.type).toBe("timeout");
      expect(result.success).toBe(false);

      await verifier.close();
    });
  });

  describe("mapWebAuthResultToAuthStatus", () => {
    it("maps success correctly", () => {
      expect(mapWebAuthResultToAuthStatus("success")).toBe("success");
    });

    it("maps invalid_credentials correctly", () => {
      expect(mapWebAuthResultToAuthStatus("invalid_credentials")).toBe(
        "auth_failed",
      );
    });

    it("maps captcha_required correctly", () => {
      expect(mapWebAuthResultToAuthStatus("captcha_required")).toBe(
        "captcha_required",
      );
    });

    it("maps 2fa_required correctly", () => {
      expect(mapWebAuthResultToAuthStatus("2fa_required")).toBe(
        "2fa_required",
      );
    });

    it("maps timeout correctly", () => {
      expect(mapWebAuthResultToAuthStatus("timeout")).toBe("timeout");
    });

    it("maps selector_not_found correctly", () => {
      expect(mapWebAuthResultToAuthStatus("selector_not_found")).toBe(
        "connection_error",
      );
    });

    it("maps unknown_error correctly", () => {
      expect(mapWebAuthResultToAuthStatus("unknown_error")).toBe(
        "auth_failed",
      );
    });
  });
});
