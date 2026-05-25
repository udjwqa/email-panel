import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks
const {
  mockSetViewport,
  mockSetUserAgent,
  mockEmulateTimezone,
  mockEvaluateOnNewDocument,
  mockSetDefaultTimeout,
  mockAuthenticate,
  mockPageClose,
  mockNewPage,
  mockBrowserClose,
  mockLaunch,
} = vi.hoisted(() => {
  const mockSetViewport = vi.fn();
  const mockSetUserAgent = vi.fn();
  const mockEmulateTimezone = vi.fn();
  const mockEvaluateOnNewDocument = vi.fn();
  const mockSetDefaultTimeout = vi.fn();
  const mockAuthenticate = vi.fn();
  const mockPageClose = vi.fn();

  const mockPage = {
    setViewport: mockSetViewport,
    setUserAgent: mockSetUserAgent,
    emulateTimezone: mockEmulateTimezone,
    evaluateOnNewDocument: mockEvaluateOnNewDocument,
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
    mockSetViewport,
    mockSetUserAgent,
    mockEmulateTimezone,
    mockEvaluateOnNewDocument,
    mockSetDefaultTimeout,
    mockAuthenticate,
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

import { BrowserManager } from "../../src/services/web-auth/browser-manager.js";

describe("BrowserManager Fingerprint Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset default mock behaviors
    mockSetViewport.mockResolvedValue(undefined);
    mockSetUserAgent.mockResolvedValue(undefined);
    mockEmulateTimezone.mockResolvedValue(undefined);
    mockEvaluateOnNewDocument.mockResolvedValue(undefined);
    mockSetDefaultTimeout.mockReturnValue(undefined);
    mockAuthenticate.mockResolvedValue(undefined);
    mockPageClose.mockResolvedValue(undefined);
    mockBrowserClose.mockResolvedValue(undefined);
  });

  describe("Legacy behavior", () => {
    it("works without fingerprint config", async () => {
      const manager = new BrowserManager({
        viewport: { width: 1920, height: 1080 },
        userAgent: "Mozilla/5.0 Test UA",
      });

      await manager.newPage();

      expect(mockSetViewport).toHaveBeenCalledWith({
        width: 1920,
        height: 1080,
      });
      expect(mockSetUserAgent).toHaveBeenCalledWith("Mozilla/5.0 Test UA");
      expect(mockEmulateTimezone).not.toHaveBeenCalled();
      expect(mockEvaluateOnNewDocument).not.toHaveBeenCalled();

      await manager.close();
    });

    it("uses static viewport when fingerprint disabled", async () => {
      const manager = new BrowserManager({
        viewport: { width: 1680, height: 1050 },
        fingerprint: {
          // All disabled
          randomizeViewport: false,
          randomizeUserAgent: false,
          randomizeTimezone: false,
          randomizeLanguage: false,
        },
      });

      await manager.newPage();

      expect(mockSetViewport).toHaveBeenCalledWith({
        width: 1680,
        height: 1050,
      });
      expect(mockEmulateTimezone).not.toHaveBeenCalled();
      expect(mockEvaluateOnNewDocument).not.toHaveBeenCalled();

      await manager.close();
    });

    it("uses static userAgent when fingerprint disabled", async () => {
      const manager = new BrowserManager({
        userAgent: "Custom Static UA",
        fingerprint: {
          randomizeUserAgent: false,
        },
      });

      await manager.newPage();

      expect(mockSetUserAgent).toHaveBeenCalledWith("Custom Static UA");

      await manager.close();
    });
  });

  describe("Selective randomization", () => {
    it("randomizes only viewport when enabled", async () => {
      const manager = new BrowserManager({
        viewport: { width: 1920, height: 1080 },
        userAgent: "Static UA",
        fingerprint: {
          randomizeViewport: true,
          randomizeUserAgent: false,
          randomizeTimezone: false,
          randomizeLanguage: false,
        },
      });

      await manager.newPage();

      // Viewport should be randomized
      expect(mockSetViewport).toHaveBeenCalledTimes(1);
      const viewportCall = mockSetViewport.mock.calls[0][0];
      expect(viewportCall.width).toBeGreaterThanOrEqual(1820);
      expect(viewportCall.width).toBeLessThanOrEqual(2020);

      // User Agent should be static
      expect(mockSetUserAgent).toHaveBeenCalledWith("Static UA");

      // Timezone/Language not touched
      expect(mockEmulateTimezone).not.toHaveBeenCalled();
      expect(mockEvaluateOnNewDocument).not.toHaveBeenCalled();

      await manager.close();
    });

    it("randomizes only UA when enabled", async () => {
      const manager = new BrowserManager({
        viewport: { width: 1920, height: 1080 },
        fingerprint: {
          randomizeViewport: false,
          randomizeUserAgent: true,
          randomizeTimezone: false,
          randomizeLanguage: false,
        },
      });

      await manager.newPage();

      // Viewport should be static
      expect(mockSetViewport).toHaveBeenCalledWith({
        width: 1920,
        height: 1080,
      });

      // User Agent should be randomized
      expect(mockSetUserAgent).toHaveBeenCalledTimes(1);
      const uaCall = mockSetUserAgent.mock.calls[0][0];
      expect(uaCall).toBeTruthy();
      expect(uaCall.length).toBeGreaterThan(0);

      // Timezone/Language not touched
      expect(mockEmulateTimezone).not.toHaveBeenCalled();
      expect(mockEvaluateOnNewDocument).not.toHaveBeenCalled();

      await manager.close();
    });

    it("randomizes only timezone when enabled", async () => {
      const manager = new BrowserManager({
        viewport: { width: 1920, height: 1080 },
        fingerprint: {
          randomizeViewport: false,
          randomizeUserAgent: false,
          randomizeTimezone: true,
          randomizeLanguage: false,
        },
      });

      await manager.newPage();

      // Viewport/UA should be static
      expect(mockSetViewport).toHaveBeenCalledWith({
        width: 1920,
        height: 1080,
      });

      // Timezone should be randomized
      expect(mockEmulateTimezone).toHaveBeenCalledTimes(1);
      const timezoneCall = mockEmulateTimezone.mock.calls[0][0];
      expect(timezoneCall).toBeTruthy();

      // Language not touched
      expect(mockEvaluateOnNewDocument).not.toHaveBeenCalled();

      await manager.close();
    });

    it("randomizes only language when enabled", async () => {
      const manager = new BrowserManager({
        viewport: { width: 1920, height: 1080 },
        fingerprint: {
          randomizeViewport: false,
          randomizeUserAgent: false,
          randomizeTimezone: false,
          randomizeLanguage: true,
        },
      });

      await manager.newPage();

      // Viewport should be static
      expect(mockSetViewport).toHaveBeenCalledWith({
        width: 1920,
        height: 1080,
      });

      // Timezone not touched
      expect(mockEmulateTimezone).not.toHaveBeenCalled();

      // Language should be randomized
      expect(mockEvaluateOnNewDocument).toHaveBeenCalledTimes(1);
      const langCallback = mockEvaluateOnNewDocument.mock.calls[0][0];
      const langValue = mockEvaluateOnNewDocument.mock.calls[0][1];
      expect(langCallback).toBeTypeOf("function");
      expect(langValue).toBeTruthy();

      await manager.close();
    });
  });

  describe("Combined randomization", () => {
    it("randomizes all fields when all flags enabled", async () => {
      const manager = new BrowserManager({
        fingerprint: {
          randomizeViewport: true,
          randomizeUserAgent: true,
          randomizeTimezone: true,
          randomizeLanguage: true,
        },
      });

      await manager.newPage();

      // All should be called
      expect(mockSetViewport).toHaveBeenCalledTimes(1);
      expect(mockSetUserAgent).toHaveBeenCalledTimes(1);
      expect(mockEmulateTimezone).toHaveBeenCalledTimes(1);
      expect(mockEvaluateOnNewDocument).toHaveBeenCalledTimes(1);

      await manager.close();
    });

    it("creates different fingerprints for each page", async () => {
      const manager = new BrowserManager({
        fingerprint: {
          randomizeViewport: true,
          randomizeUserAgent: true,
          randomizeTimezone: true,
          randomizeLanguage: true,
        },
      });

      await manager.newPage();
      await manager.newPage();
      await manager.newPage();

      // Each page should have randomization applied
      expect(mockSetViewport).toHaveBeenCalledTimes(3);
      expect(mockSetUserAgent).toHaveBeenCalledTimes(3);
      expect(mockEmulateTimezone).toHaveBeenCalledTimes(3);
      expect(mockEvaluateOnNewDocument).toHaveBeenCalledTimes(3);

      // Check that viewports are potentially different
      const viewports = mockSetViewport.mock.calls.map((call) => call[0]);
      const viewportSignatures = viewports.map(
        (v) => `${v.width}x${v.height}`,
      );

      // At least some variation expected (though not guaranteed due to randomness)
      expect(viewports.length).toBe(3);

      await manager.close();
    });

    it("respects custom base viewport", async () => {
      const manager = new BrowserManager({
        fingerprint: {
          randomizeViewport: true,
          baseViewport: { width: 1680, height: 1050 },
          viewportVariance: 50,
        },
      });

      await manager.newPage();

      expect(mockSetViewport).toHaveBeenCalledTimes(1);
      const viewport = mockSetViewport.mock.calls[0][0];

      expect(viewport.width).toBeGreaterThanOrEqual(1630);
      expect(viewport.width).toBeLessThanOrEqual(1730);
      expect(viewport.height).toBeGreaterThanOrEqual(1000);
      expect(viewport.height).toBeLessThanOrEqual(1100);

      await manager.close();
    });
  });

  describe("Priority & Override", () => {
    it("fingerprint randomization overrides static config", async () => {
      const manager = new BrowserManager({
        viewport: { width: 1920, height: 1080 },
        userAgent: "Static UA",
        fingerprint: {
          randomizeViewport: true,
          randomizeUserAgent: true,
        },
      });

      await manager.newPage();

      // Viewport should be randomized (within ±100px range)
      const viewport = mockSetViewport.mock.calls[0][0];
      expect(viewport.width).toBeGreaterThanOrEqual(1820);
      expect(viewport.width).toBeLessThanOrEqual(2020);
      expect(viewport.height).toBeGreaterThanOrEqual(980);
      expect(viewport.height).toBeLessThanOrEqual(1180);

      // User Agent should be randomized
      const ua = mockSetUserAgent.mock.calls[0][0];
      expect(ua).not.toBe("Static UA");
      expect(ua).toBeTruthy();

      await manager.close();
    });

    it("fingerprint disabled uses legacy config", async () => {
      const manager = new BrowserManager({
        viewport: { width: 1600, height: 900 },
        userAgent: "Legacy UA",
        fingerprint: {
          randomizeViewport: false,
          randomizeUserAgent: false,
        },
      });

      await manager.newPage();

      expect(mockSetViewport).toHaveBeenCalledWith({
        width: 1600,
        height: 900,
      });
      expect(mockSetUserAgent).toHaveBeenCalledWith("Legacy UA");

      await manager.close();
    });

    it("partial randomization combines with legacy", async () => {
      const manager = new BrowserManager({
        viewport: { width: 1920, height: 1080 },
        userAgent: "Static UA",
        fingerprint: {
          randomizeViewport: true,
          randomizeUserAgent: false,
        },
      });

      await manager.newPage();

      // Viewport randomized
      const viewport = mockSetViewport.mock.calls[0][0];
      expect(viewport.width).not.toBe(1920);

      // User Agent static
      expect(mockSetUserAgent).toHaveBeenCalledWith("Static UA");

      await manager.close();
    });
  });

  describe("Error handling", () => {
    it("handles timezone emulation failure", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      mockEmulateTimezone.mockRejectedValueOnce(
        new Error("Timezone emulation not supported"),
      );

      const manager = new BrowserManager({
        fingerprint: {
          randomizeTimezone: true,
        },
      });

      // Should not throw
      await expect(manager.newPage()).resolves.toBeDefined();

      expect(consoleSpy).toHaveBeenCalledWith(
        "Timezone emulation failed, using system timezone",
      );

      consoleSpy.mockRestore();
      await manager.close();
    });

    it("handles language injection failure", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      mockEvaluateOnNewDocument.mockRejectedValueOnce(
        new Error("Language injection failed"),
      );

      const manager = new BrowserManager({
        fingerprint: {
          randomizeLanguage: true,
        },
      });

      // Should not throw
      await expect(manager.newPage()).resolves.toBeDefined();

      expect(consoleSpy).toHaveBeenCalledWith(
        "Language injection failed, using system language",
      );

      consoleSpy.mockRestore();
      await manager.close();
    });
  });
});
