import puppeteer, { Browser, Page } from "puppeteer-core";
import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { WebAuthConfig, FingerprintConfig } from "./types.js";
import type { ProxyEntry } from "../proxy/types.js";
import { generateRandomFingerprint } from "../../utils/fingerprint.js";

/**
 * Browser lifecycle manager with stealth mode support
 */
export class BrowserManager {
  private browser: any = null;
  private config: Required<Omit<WebAuthConfig, "proxy" | "selectors" | "fingerprint">>;
  private proxy?: ProxyEntry;
  private fingerprintConfig?: FingerprintConfig;
  private isInitialized = false;

  constructor(config: WebAuthConfig = {}) {
    this.config = {
      headless: config.headless ?? true,
      timeout: config.timeout ?? 30_000,
      viewport: config.viewport ?? { width: 1920, height: 1080 },
      userAgent: config.userAgent ?? "",
      stealth: config.stealth ?? true,
      waitForNavigation: config.waitForNavigation ?? true,
    };

    this.proxy = config.proxy;
    this.fingerprintConfig = config.fingerprint;
  }

  /**
   * Launch browser with stealth configuration
   */
  async launch(): Promise<void> {
    if (this.isInitialized && this.browser) {
      return;
    }

    // Apply stealth plugin if enabled
    const puppeteerInstance = this.config.stealth
      ? puppeteerExtra.use(StealthPlugin())
      : puppeteer;

    // Build launch args
    const args = [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
    ];

    // Add proxy args if configured
    if (this.proxy) {
      args.push(`--proxy-server=${this.proxy.host}:${this.proxy.port}`);
    }

    this.browser = await puppeteerInstance.launch({
      headless: this.config.headless,
      args,
      defaultViewport: this.config.viewport,
    });

    this.isInitialized = true;
  }

  /**
   * Create new page with custom user agent
   */
  async newPage(): Promise<Page> {
    if (!this.browser) {
      await this.launch();
    }

    const page = await this.browser!.newPage();

    // Apply fingerprint randomization if enabled
    if (this.fingerprintConfig && this.isAnyRandomizationEnabled()) {
      await this.applyFingerprint(page);
    } else {
      // Legacy behavior (backward compatibility)
      await this.applyLegacySettings(page);
    }

    // Set default timeout
    page.setDefaultTimeout(this.config.timeout);

    // Handle proxy authentication if needed
    if (this.proxy?.username && this.proxy?.password) {
      await page.authenticate({
        username: this.proxy.username,
        password: this.proxy.password,
      });
    }

    return page;
  }

  /**
   * Apply fingerprint randomization to page
   */
  private async applyFingerprint(page: Page): Promise<void> {
    const fingerprint = generateRandomFingerprint(
      this.fingerprintConfig?.baseViewport ?? this.config.viewport,
      this.fingerprintConfig?.viewportVariance ?? 100,
    );

    // Apply viewport (if randomization enabled)
    if (this.fingerprintConfig?.randomizeViewport) {
      await page.setViewport(fingerprint.viewport);
    } else {
      await page.setViewport(this.config.viewport);
    }

    // Apply User Agent (if randomization enabled)
    if (this.fingerprintConfig?.randomizeUserAgent) {
      await page.setUserAgent(fingerprint.userAgent);
    } else if (this.config.userAgent) {
      await page.setUserAgent(this.config.userAgent);
    }

    // Apply timezone (if randomization enabled)
    if (this.fingerprintConfig?.randomizeTimezone) {
      try {
        await page.emulateTimezone(fingerprint.timezone);
      } catch (error) {
        console.warn("Timezone emulation failed, using system timezone");
      }
    }

    // Apply language (if randomization enabled)
    if (this.fingerprintConfig?.randomizeLanguage) {
      try {
        await page.evaluateOnNewDocument((lang: string) => {
          Object.defineProperty(navigator, "language", {
            get() {
              return lang;
            },
          });
          Object.defineProperty(navigator, "languages", {
            get() {
              return [lang];
            },
          });
        }, fingerprint.language);
      } catch (error) {
        console.warn("Language injection failed, using system language");
      }
    }
  }

  /**
   * Apply legacy settings (backward compatibility)
   */
  private async applyLegacySettings(page: Page): Promise<void> {
    await page.setViewport(this.config.viewport);

    if (this.config.userAgent) {
      await page.setUserAgent(this.config.userAgent);
    }
  }

  /**
   * Check if any randomization is enabled
   */
  private isAnyRandomizationEnabled(): boolean {
    if (!this.fingerprintConfig) return false;

    return !!(
      this.fingerprintConfig.randomizeViewport ||
      this.fingerprintConfig.randomizeUserAgent ||
      this.fingerprintConfig.randomizeTimezone ||
      this.fingerprintConfig.randomizeLanguage
    );
  }

  /**
   * Close browser instance
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.isInitialized = false;
    }
  }

  /**
   * Get browser instance
   */
  getBrowser(): any {
    return this.browser;
  }

  /**
   * Check if browser is running
   */
  isRunning(): boolean {
    return this.browser !== null && this.isInitialized;
  }
}
