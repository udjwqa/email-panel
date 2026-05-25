import type { Page } from "puppeteer-core";
import type { WebAuthSelectors } from "./types.js";

/**
 * Default selectors for common form patterns
 */
const DEFAULT_SELECTORS: Required<WebAuthSelectors> = {
  emailInput:
    'input[name="email"], input[type="email"], input[name="username"], input[id*="email"], input[id*="user"]',
  passwordInput:
    'input[name="password"], input[type="password"], input[id*="pass"]',
  submitButton:
    'button[type="submit"], input[type="submit"], button:has-text("sign in"), button:has-text("log in"), button:has-text("login")',
  errorContainer:
    '[class*="error"], [class*="alert"], [role="alert"], .error-message, .alert-danger',
  successIndicator: '[class*="success"], [class*="welcome"]',
};

/**
 * Page interaction utilities
 */
export class PageActions {
  private page: Page;
  private selectors: Required<WebAuthSelectors>;

  constructor(page: Page, selectors?: WebAuthSelectors) {
    this.page = page;
    this.selectors = { ...DEFAULT_SELECTORS, ...selectors };
  }

  /**
   * Navigate to URL and wait for page load
   */
  async navigateTo(url: string, timeout: number): Promise<void> {
    await this.page.goto(url, {
      waitUntil: "networkidle2",
      timeout,
    });
  }

  /**
   * Fill email input field
   */
  async fillEmail(email: string): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.selectors.emailInput, {
        timeout: 5000,
      });
      await this.page.type(this.selectors.emailInput, email, { delay: 100 });
      return true;
    } catch (error) {
      console.error("Failed to fill email:", error);
      return false;
    }
  }

  /**
   * Fill password input field
   */
  async fillPassword(password: string): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.selectors.passwordInput, {
        timeout: 5000,
      });
      await this.page.type(this.selectors.passwordInput, password, {
        delay: 100,
      });
      return true;
    } catch (error) {
      console.error("Failed to fill password:", error);
      return false;
    }
  }

  /**
   * Click submit button
   */
  async clickSubmit(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.selectors.submitButton, {
        timeout: 5000,
      });
      await this.page.click(this.selectors.submitButton);
      return true;
    } catch (error) {
      console.error("Failed to click submit:", error);
      return false;
    }
  }

  /**
   * Wait for navigation after form submission
   */
  async waitForNavigation(timeout: number): Promise<void> {
    await this.page.waitForNavigation({
      waitUntil: "networkidle2",
      timeout,
    });
  }

  /**
   * Get current URL
   */
  getCurrentUrl(): string {
    return this.page.url();
  }

  /**
   * Get error message from page
   */
  async getErrorMessage(): Promise<string | null> {
    const selectors = [
      '[role="alert"]',
      '[class*="error"]',
      '[class*="alert"]',
      ".error-message",
      ".alert-danger",
      ".notification.error",
    ];

    for (const selector of selectors) {
      try {
        const element = await this.page.$(selector);
        if (element) {
          const text = await this.page.evaluate(
            (el) => el.textContent,
            element,
          );
          if (text) return text.trim();
        }
      } catch {
        continue;
      }
    }

    return null;
  }
}
