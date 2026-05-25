/**
 * Browser User Agents - актуальные версии Chrome 131, Firefox 133, Edge 131
 */
export const BROWSER_USER_AGENTS = [
  // Chrome 131 - Windows/macOS/Linux
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",

  // Firefox 133 - Windows/macOS/Linux
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0",
  "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",

  // Edge 131 - Windows/macOS
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",

  // Chrome 130 (чуть старая версия для разнообразия)
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
];

/**
 * Timezones - 15 популярных timezone IDs
 */
export const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Australia/Sydney",
  "Pacific/Auckland",
];

/**
 * Languages - 12 популярных языковых кодов
 */
export const LANGUAGES = [
  "en-US",
  "en-GB",
  "de-DE",
  "fr-FR",
  "es-ES",
  "it-IT",
  "pt-BR",
  "ja-JP",
  "zh-CN",
  "ko-KR",
  "ru-RU",
  "ar-SA",
];

/**
 * Viewport interface
 */
export interface Viewport {
  width: number;
  height: number;
}

/**
 * Browser fingerprint interface
 */
export interface BrowserFingerprint {
  viewport: Viewport;
  userAgent: string;
  timezone: string;
  language: string;
}

/**
 * Generate random viewport with variance
 *
 * @param baseWidth - Base width (default: 1920)
 * @param baseHeight - Base height (default: 1080)
 * @param variance - Variance in pixels (default: 100)
 * @returns Random viewport with minimum 1024x768
 */
export function generateRandomViewport(
  baseWidth = 1920,
  baseHeight = 1080,
  variance = 100,
): Viewport {
  const randomOffsetX = Math.floor((Math.random() - 0.5) * 2 * variance);
  const randomOffsetY = Math.floor((Math.random() - 0.5) * 2 * variance);

  return {
    width: Math.max(1024, baseWidth + randomOffsetX),
    height: Math.max(768, baseHeight + randomOffsetY),
  };
}

/**
 * Get random browser User Agent from pool
 *
 * @returns Random User Agent string
 */
export function getRandomBrowserUserAgent(): string {
  return BROWSER_USER_AGENTS[
    Math.floor(Math.random() * BROWSER_USER_AGENTS.length)
  ];
}

/**
 * Get random timezone from pool
 *
 * @returns Random timezone ID
 */
export function getRandomTimezone(): string {
  return TIMEZONES[Math.floor(Math.random() * TIMEZONES.length)];
}

/**
 * Get random language from pool
 *
 * @returns Random language code
 */
export function getRandomLanguage(): string {
  return LANGUAGES[Math.floor(Math.random() * LANGUAGES.length)];
}

/**
 * Generate complete random browser fingerprint
 *
 * @param baseViewport - Base viewport for randomization
 * @param viewportVariance - Viewport variance in pixels
 * @returns Complete fingerprint with all randomized fields
 */
export function generateRandomFingerprint(
  baseViewport?: Viewport,
  viewportVariance?: number,
): BrowserFingerprint {
  return {
    viewport: generateRandomViewport(
      baseViewport?.width,
      baseViewport?.height,
      viewportVariance,
    ),
    userAgent: getRandomBrowserUserAgent(),
    timezone: getRandomTimezone(),
    language: getRandomLanguage(),
  };
}
