import { describe, it, expect } from "vitest";
import {
  generateRandomViewport,
  getRandomBrowserUserAgent,
  getRandomTimezone,
  getRandomLanguage,
  generateRandomFingerprint,
  BROWSER_USER_AGENTS,
  TIMEZONES,
  LANGUAGES,
} from "../../src/utils/fingerprint.js";

describe("Fingerprint Utilities", () => {
  describe("generateRandomViewport", () => {
    it("generates viewport within variance", () => {
      const viewport = generateRandomViewport(1920, 1080, 100);

      expect(viewport.width).toBeGreaterThanOrEqual(1820);
      expect(viewport.width).toBeLessThanOrEqual(2020);
      expect(viewport.height).toBeGreaterThanOrEqual(980);
      expect(viewport.height).toBeLessThanOrEqual(1180);
    });

    it("respects minimum size", () => {
      const viewport = generateRandomViewport(800, 600, 500);

      expect(viewport.width).toBeGreaterThanOrEqual(1024);
      expect(viewport.height).toBeGreaterThanOrEqual(768);
    });

    it("creates different viewports on repeated calls", () => {
      const viewports = Array(20)
        .fill(0)
        .map(() => generateRandomViewport());

      const unique = new Set(viewports.map((v) => `${v.width}x${v.height}`));
      expect(unique.size).toBeGreaterThan(1);
    });

    it("uses default parameters", () => {
      const viewport = generateRandomViewport();

      expect(viewport.width).toBeGreaterThanOrEqual(1820);
      expect(viewport.width).toBeLessThanOrEqual(2020);
      expect(viewport.height).toBeGreaterThanOrEqual(980);
      expect(viewport.height).toBeLessThanOrEqual(1180);
    });

    it("accepts custom base viewport", () => {
      const viewport = generateRandomViewport(1680, 1050, 50);

      expect(viewport.width).toBeGreaterThanOrEqual(1630);
      expect(viewport.width).toBeLessThanOrEqual(1730);
      expect(viewport.height).toBeGreaterThanOrEqual(1000);
      expect(viewport.height).toBeLessThanOrEqual(1100);
    });

    it("accepts custom variance", () => {
      const viewport = generateRandomViewport(1920, 1080, 200);

      expect(viewport.width).toBeGreaterThanOrEqual(1720);
      expect(viewport.width).toBeLessThanOrEqual(2120);
      expect(viewport.height).toBeGreaterThanOrEqual(880);
      expect(viewport.height).toBeLessThanOrEqual(1280);
    });

    it("handles extreme variance without breaking minimum", () => {
      const viewport = generateRandomViewport(1200, 900, 1000);

      // Even with extreme variance, should not go below minimum
      expect(viewport.width).toBeGreaterThanOrEqual(1024);
      expect(viewport.height).toBeGreaterThanOrEqual(768);
    });

    it("produces statistical variance over multiple calls", () => {
      const viewports = Array(50)
        .fill(0)
        .map(() => generateRandomViewport(1920, 1080, 100));

      const widths = viewports.map((v) => v.width);
      const heights = viewports.map((v) => v.height);

      // Check that we have a reasonable spread
      const widthMin = Math.min(...widths);
      const widthMax = Math.max(...widths);
      const heightMin = Math.min(...heights);
      const heightMax = Math.max(...heights);

      // Should have at least 100px spread in both dimensions
      expect(widthMax - widthMin).toBeGreaterThan(100);
      expect(heightMax - heightMin).toBeGreaterThan(100);
    });
  });

  describe("getRandomBrowserUserAgent", () => {
    it("returns valid UA string", () => {
      const ua = getRandomBrowserUserAgent();

      expect(ua).toBeDefined();
      expect(ua.length).toBeGreaterThan(0);
      expect(BROWSER_USER_AGENTS).toContain(ua);
    });

    it("returns different UAs over multiple calls", () => {
      const userAgents = Array(30)
        .fill(0)
        .map(() => getRandomBrowserUserAgent());

      const unique = new Set(userAgents);
      expect(unique.size).toBeGreaterThan(1);
    });

    it("all UAs are from the pool", () => {
      const userAgents = Array(50)
        .fill(0)
        .map(() => getRandomBrowserUserAgent());

      userAgents.forEach((ua) => {
        expect(BROWSER_USER_AGENTS).toContain(ua);
      });
    });
  });

  describe("getRandomTimezone", () => {
    it("returns valid timezone", () => {
      const timezone = getRandomTimezone();

      expect(timezone).toBeDefined();
      expect(timezone.length).toBeGreaterThan(0);
      expect(TIMEZONES).toContain(timezone);
    });

    it("returns different timezones over multiple calls", () => {
      const timezones = Array(30)
        .fill(0)
        .map(() => getRandomTimezone());

      const unique = new Set(timezones);
      expect(unique.size).toBeGreaterThan(1);
    });
  });

  describe("getRandomLanguage", () => {
    it("returns valid language code", () => {
      const language = getRandomLanguage();

      expect(language).toBeDefined();
      expect(language.length).toBeGreaterThan(0);
      expect(LANGUAGES).toContain(language);
    });

    it("returns different languages over multiple calls", () => {
      const languages = Array(30)
        .fill(0)
        .map(() => getRandomLanguage());

      const unique = new Set(languages);
      expect(unique.size).toBeGreaterThan(1);
    });
  });

  describe("generateRandomFingerprint", () => {
    it("generates complete fingerprint", () => {
      const fingerprint = generateRandomFingerprint();

      expect(fingerprint.viewport).toBeDefined();
      expect(fingerprint.userAgent).toBeDefined();
      expect(fingerprint.timezone).toBeDefined();
      expect(fingerprint.language).toBeDefined();
    });

    it("uses custom base viewport", () => {
      const fingerprint = generateRandomFingerprint(
        { width: 1680, height: 1050 },
        50,
      );

      expect(fingerprint.viewport.width).toBeGreaterThanOrEqual(1630);
      expect(fingerprint.viewport.width).toBeLessThanOrEqual(1730);
      expect(fingerprint.viewport.height).toBeGreaterThanOrEqual(1000);
      expect(fingerprint.viewport.height).toBeLessThanOrEqual(1100);
    });

    it("uses custom variance", () => {
      const fingerprint = generateRandomFingerprint(undefined, 200);

      expect(fingerprint.viewport.width).toBeGreaterThanOrEqual(1720);
      expect(fingerprint.viewport.width).toBeLessThanOrEqual(2120);
    });

    it("creates unique fingerprints", () => {
      const fingerprints = Array(20)
        .fill(0)
        .map(() => generateRandomFingerprint());

      const signatures = fingerprints.map(
        (f) =>
          `${f.viewport.width}x${f.viewport.height}:${f.userAgent}:${f.timezone}:${f.language}`,
      );

      const unique = new Set(signatures);
      expect(unique.size).toBeGreaterThan(10); // At least 50% unique
    });

    it("all fields are populated", () => {
      const fingerprints = Array(10)
        .fill(0)
        .map(() => generateRandomFingerprint());

      fingerprints.forEach((fp) => {
        expect(fp.viewport.width).toBeGreaterThan(0);
        expect(fp.viewport.height).toBeGreaterThan(0);
        expect(fp.userAgent).toBeTruthy();
        expect(fp.timezone).toBeTruthy();
        expect(fp.language).toBeTruthy();
      });
    });

    it("viewport within variance", () => {
      const fingerprints = Array(20)
        .fill(0)
        .map(() => generateRandomFingerprint({ width: 1920, height: 1080 }, 100));

      fingerprints.forEach((fp) => {
        expect(fp.viewport.width).toBeGreaterThanOrEqual(1820);
        expect(fp.viewport.width).toBeLessThanOrEqual(2020);
        expect(fp.viewport.height).toBeGreaterThanOrEqual(980);
        expect(fp.viewport.height).toBeLessThanOrEqual(1180);
      });
    });

    it("User Agent from pool", () => {
      const fingerprints = Array(20)
        .fill(0)
        .map(() => generateRandomFingerprint());

      fingerprints.forEach((fp) => {
        expect(BROWSER_USER_AGENTS).toContain(fp.userAgent);
      });
    });

    it("Timezone from pool", () => {
      const fingerprints = Array(20)
        .fill(0)
        .map(() => generateRandomFingerprint());

      fingerprints.forEach((fp) => {
        expect(TIMEZONES).toContain(fp.timezone);
      });
    });

    it("Language from pool", () => {
      const fingerprints = Array(20)
        .fill(0)
        .map(() => generateRandomFingerprint());

      fingerprints.forEach((fp) => {
        expect(LANGUAGES).toContain(fp.language);
      });
    });

    it("statistical uniqueness check", () => {
      const fingerprints = Array(100)
        .fill(0)
        .map(() => generateRandomFingerprint());

      const signatures = fingerprints.map(
        (f) =>
          `${f.viewport.width}x${f.viewport.height}:${f.userAgent}:${f.timezone}:${f.language}`,
      );

      const unique = new Set(signatures);

      // With 11 UAs, 15 timezones, 12 languages, and variable viewports,
      // we should see high uniqueness (>70%)
      expect(unique.size).toBeGreaterThan(70);
    });
  });
});
