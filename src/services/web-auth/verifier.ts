import type { Page } from "puppeteer-core";
import { BrowserManager } from "./browser-manager.js";
import { PageActions } from "./page-actions.js";
import { ResultAnalyzer } from "./result-analyzer.js";
import type { WebAuthConfig, WebAuthResult } from "./types.js";

/**
 * Web Authentication Verifier with puppeteer-extra
 */
export class WebAuthVerifier {
  private browserManager: BrowserManager;
  private config: WebAuthConfig;

  constructor(config: WebAuthConfig = {}) {
    this.config = {
      headless: true,
      timeout: 30_000,
      stealth: true,
      waitForNavigation: true,
      ...config,
    };

    this.browserManager = new BrowserManager(this.config);
  }

  /**
   * Test web authentication
   *
   * @param url - Login page URL
   * @param email - User email/username
   * @param password - User password
   * @param options - Additional options
   * @returns Authentication result
   */
  async testWebAuth(
    url: string,
    email: string,
    password: string,
    options: Partial<WebAuthConfig> = {},
  ): Promise<WebAuthResult> {
    const startTime = Date.now();
    let page: Page | null = null;

    try {
      // Launch browser if not running
      if (!this.browserManager.isRunning()) {
        await this.browserManager.launch();
      }

      // Create new page
      page = await this.browserManager.newPage();

      // Initialize page actions and analyzer
      const actions = new PageActions(page, {
        ...this.config.selectors,
        ...options.selectors,
      });
      const analyzer = new ResultAnalyzer(page);

      // Step 1: Navigate to login page
      await actions.navigateTo(url, this.config.timeout!);
      const originalUrl = actions.getCurrentUrl();

      // Step 2: Fill credentials
      const emailFilled = await actions.fillEmail(email);
      if (!emailFilled) {
        return {
          type: "selector_not_found",
          success: false,
          urlChanged: false,
          errorMessage: "Email input selector not found",
          responseTime: Date.now() - startTime,
        };
      }

      const passwordFilled = await actions.fillPassword(password);
      if (!passwordFilled) {
        return {
          type: "selector_not_found",
          success: false,
          urlChanged: false,
          errorMessage: "Password input selector not found",
          responseTime: Date.now() - startTime,
        };
      }

      // Step 3: Submit form
      const submitClicked = await actions.clickSubmit();
      if (!submitClicked) {
        return {
          type: "selector_not_found",
          success: false,
          urlChanged: false,
          errorMessage: "Submit button selector not found",
          responseTime: Date.now() - startTime,
        };
      }

      // Step 4: Wait for navigation or response
      if (this.config.waitForNavigation) {
        try {
          await actions.waitForNavigation(this.config.timeout!);
        } catch (navError) {
          // Navigation timeout or error - analyze current state anyway
        }
      } else {
        // Wait for potential AJAX response
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      // Step 5: Analyze result
      const finalUrl = actions.getCurrentUrl();
      const urlChanged = finalUrl !== originalUrl;

      const resultType = await analyzer.classifyResult(originalUrl, urlChanged);
      const protection = await analyzer.detectProtection();

      const errorMessage = await actions.getErrorMessage();

      // Build result
      const result: WebAuthResult = {
        type: resultType,
        success: resultType === "success",
        finalUrl,
        urlChanged,
        errorMessage: errorMessage || undefined,
        protection:
          protection.hasCaptcha || protection.has2FA || protection.hasRateLimit
            ? protection
            : undefined,
        responseTime: Date.now() - startTime,
      };

      return result;
    } catch (error) {
      // Handle unexpected errors
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      return {
        type:
          error instanceof Error && error.message.includes("timeout")
            ? "timeout"
            : "unknown_error",
        success: false,
        urlChanged: false,
        errorMessage,
        responseTime: Date.now() - startTime,
      };
    } finally {
      // Close page (but keep browser running for reuse)
      if (page) {
        await page.close();
      }
    }
  }

  /**
   * Close browser instance
   */
  async close(): Promise<void> {
    await this.browserManager.close();
  }

  /**
   * Check if browser is running
   */
  isRunning(): boolean {
    return this.browserManager.isRunning();
  }
}
