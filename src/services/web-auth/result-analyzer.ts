import type { Page } from "puppeteer-core";
import type { ProtectionDetection, WebAuthResultType } from "./types.js";

/**
 * CAPTCHA detection selectors
 */
const CAPTCHA_SELECTORS = {
  recaptcha: ['iframe[src*="recaptcha"]', ".g-recaptcha", "#recaptcha"],
  hcaptcha: ['iframe[src*="hcaptcha"]', ".h-captcha", "#hcaptcha"],
  cloudflare: [
    "#challenge-form",
    ".cf-challenge",
    'iframe[src*="challenges.cloudflare.com"]',
  ],
  generic: [
    '[class*="captcha"]',
    '[id*="captcha"]',
    'img[src*="captcha"]',
    'input[name="captcha"]',
  ],
};

/**
 * 2FA/MFA detection selectors
 */
const TWO_FA_SELECTORS = [
  'input[name="code"]',
  'input[name="otp"]',
  'input[name="verification_code"]',
  'input[placeholder*="code"]',
  'input[placeholder*="verification"]',
  '[class*="verification"]',
  '[class*="two-factor"]',
  '[class*="2fa"]',
];

/**
 * Rate limit detection patterns (text-based)
 */
const RATE_LIMIT_PATTERNS = [
  /too many (requests|attempts)/i,
  /rate limit/i,
  /try again (later|in)/i,
  /slow down/i,
  /throttled/i,
];

/**
 * Invalid credentials patterns
 */
const INVALID_CREDENTIALS_PATTERNS = [
  /invalid (password|credentials|username|email)/i,
  /incorrect (password|username)/i,
  /wrong (password|username)/i,
  /authentication failed/i,
  /login failed/i,
];

/**
 * Success indicators (URL patterns)
 */
const SUCCESS_URL_PATTERNS = [
  /dashboard/i,
  /home/i,
  /inbox/i,
  /account/i,
  /profile/i,
  /welcome/i,
];

/**
 * Analyze page result after authentication attempt
 */
export class ResultAnalyzer {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Detect protection mechanisms on page
   */
  async detectProtection(): Promise<ProtectionDetection> {
    const result: ProtectionDetection = {
      hasCaptcha: false,
      has2FA: false,
      hasRateLimit: false,
      detectedSelectors: [],
    };

    // Check for CAPTCHA
    const captchaType = await this.detectCaptchaType();
    if (captchaType) {
      result.hasCaptcha = true;
      result.captchaType = captchaType;
    }

    // Check for 2FA
    result.has2FA = await this.detect2FA();

    // Check for rate limiting
    result.hasRateLimit = await this.detectRateLimit();

    return result;
  }

  /**
   * Classify authentication result
   */
  async classifyResult(
    originalUrl: string,
    urlChanged: boolean,
  ): Promise<WebAuthResultType> {
    // Priority 1: Check for protection mechanisms
    const protection = await this.detectProtection();

    if (protection.hasCaptcha) {
      return "captcha_required";
    }

    if (protection.has2FA) {
      return "2fa_required";
    }

    if (protection.hasRateLimit) {
      return "rate_limited";
    }

    // Priority 2: Check URL change for success
    if (urlChanged) {
      const currentUrl = this.page.url();
      const isSuccessUrl = SUCCESS_URL_PATTERNS.some((pattern) =>
        pattern.test(currentUrl),
      );

      if (isSuccessUrl) {
        return "success";
      }
    }

    // Priority 3: Check for error messages
    const errorMessage = await this.getPageErrorMessage();

    if (errorMessage) {
      if (INVALID_CREDENTIALS_PATTERNS.some((p) => p.test(errorMessage))) {
        return "invalid_credentials";
      }

      if (RATE_LIMIT_PATTERNS.some((p) => p.test(errorMessage))) {
        return "rate_limited";
      }
    }

    // Priority 4: URL changed but no success pattern = likely invalid
    if (urlChanged) {
      return "invalid_credentials";
    }

    // Fallback: no URL change, no clear error
    return "unknown_error";
  }

  /**
   * Detect CAPTCHA type
   */
  private async detectCaptchaType(): Promise<
    "recaptcha" | "hcaptcha" | "cloudflare" | "custom" | null
  > {
    // Check reCAPTCHA
    for (const selector of CAPTCHA_SELECTORS.recaptcha) {
      const exists = await this.elementExists(selector);
      if (exists) return "recaptcha";
    }

    // Check hCaptcha
    for (const selector of CAPTCHA_SELECTORS.hcaptcha) {
      const exists = await this.elementExists(selector);
      if (exists) return "hcaptcha";
    }

    // Check Cloudflare
    for (const selector of CAPTCHA_SELECTORS.cloudflare) {
      const exists = await this.elementExists(selector);
      if (exists) return "cloudflare";
    }

    // Check generic CAPTCHA
    for (const selector of CAPTCHA_SELECTORS.generic) {
      const exists = await this.elementExists(selector);
      if (exists) return "custom";
    }

    return null;
  }

  /**
   * Detect 2FA requirement
   */
  private async detect2FA(): Promise<boolean> {
    for (const selector of TWO_FA_SELECTORS) {
      const exists = await this.elementExists(selector);
      if (exists) return true;
    }
    return false;
  }

  /**
   * Detect rate limiting
   */
  private async detectRateLimit(): Promise<boolean> {
    const pageContent = await this.getPageContent();

    return RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(pageContent));
  }

  /**
   * Get error message from page
   */
  private async getPageErrorMessage(): Promise<string | null> {
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

  /**
   * Check if element exists on page
   */
  private async elementExists(selector: string): Promise<boolean> {
    try {
      const element = await this.page.$(selector);
      return element !== null;
    } catch {
      return false;
    }
  }

  /**
   * Get full page content
   */
  private async getPageContent(): Promise<string> {
    return this.page.content();
  }
}
