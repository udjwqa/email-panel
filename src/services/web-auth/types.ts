import type { ProxyEntry } from "../proxy/types.js";

/**
 * Fingerprint randomization configuration
 */
export interface FingerprintConfig {
  /** Randomize viewport (default: false) */
  randomizeViewport?: boolean;
  /** Randomize User Agent (default: false) */
  randomizeUserAgent?: boolean;
  /** Randomize timezone (default: false) */
  randomizeTimezone?: boolean;
  /** Randomize language (default: false) */
  randomizeLanguage?: boolean;
  /** Base viewport for randomization (default: 1920x1080) */
  baseViewport?: {
    width: number;
    height: number;
  };
  /** Viewport variance in pixels (default: 100) */
  viewportVariance?: number;
}

/**
 * Web Authentication Configuration
 */
export interface WebAuthConfig {
  /** Run browser in headless mode (default: true) */
  headless?: boolean;
  /** Navigation timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Viewport size */
  viewport?: {
    width: number;
    height: number;
  };
  /** User agent override */
  userAgent?: string;
  /** Enable stealth plugin (default: true) */
  stealth?: boolean;
  /** Proxy configuration */
  proxy?: ProxyEntry;
  /** Wait for navigation after form submission (default: true) */
  waitForNavigation?: boolean;
  /** Custom form selectors */
  selectors?: WebAuthSelectors;
  /** Fingerprint randomization configuration */
  fingerprint?: FingerprintConfig;
}

/**
 * CSS selectors for form elements
 */
export interface WebAuthSelectors {
  /** Email/username input selector */
  emailInput?: string;
  /** Password input selector */
  passwordInput?: string;
  /** Submit button selector */
  submitButton?: string;
  /** Error message container selector */
  errorContainer?: string;
  /** Success indicator selector */
  successIndicator?: string;
}

/**
 * Web Authentication Result Type
 */
export type WebAuthResultType =
  | "success"
  | "invalid_credentials"
  | "captcha_required"
  | "2fa_required"
  | "rate_limited"
  | "timeout"
  | "selector_not_found"
  | "unknown_error";

/**
 * Protection Detection Result
 */
export interface ProtectionDetection {
  /** CAPTCHA detected */
  hasCaptcha: boolean;
  /** 2FA/MFA required */
  has2FA: boolean;
  /** Rate limiting detected */
  hasRateLimit: boolean;
  /** Type of CAPTCHA detected */
  captchaType?: "recaptcha" | "hcaptcha" | "cloudflare" | "custom";
  /** Selectors that matched */
  detectedSelectors: string[];
}

/**
 * Web Authentication Result
 */
export interface WebAuthResult {
  /** Result type */
  type: WebAuthResultType;
  /** Success flag */
  success: boolean;
  /** Final URL after navigation */
  finalUrl?: string;
  /** URL changed (redirect occurred) */
  urlChanged: boolean;
  /** Error message (if any) */
  errorMessage?: string;
  /** Protection detection result */
  protection?: ProtectionDetection;
  /** Response time in milliseconds */
  responseTime: number;
}
