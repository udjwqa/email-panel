import { CookieJar, Cookie } from "tough-cookie";
import type { Redis } from "ioredis";
import type { SessionStoreConfig, SessionData } from "./session-types.js";

const DEFAULT_TTL = 3600; // 1 hour
const REDIS_KEY_PREFIX = "session:";

/**
 * Session store for managing cookies across HTTP requests
 * Uses tough-cookie for RFC 6265 compliant cookie handling
 */
export class SessionStore {
  private jars: Map<string, CookieJar>;
  private redis?: Redis;
  private ttl: number;
  private strictDomain: boolean;

  constructor(config: SessionStoreConfig = {}) {
    this.jars = new Map();
    this.redis = config.redis;
    this.ttl = config.ttl ?? DEFAULT_TTL;
    this.strictDomain = config.strictDomain ?? true;
  }

  /**
   * Set a cookie for a specific domain
   * @param domain - Domain name (e.g., "example.com")
   * @param cookieString - Cookie string from Set-Cookie header
   * @throws Error if cookie parsing fails
   */
  async setCookie(domain: string, cookieString: string): Promise<void> {
    const normalizedDomain = this.normalizeDomain(domain);
    const jar = this.getOrCreateJar(normalizedDomain);

    try {
      // Parse and store cookie using tough-cookie
      const cookie = Cookie.parse(cookieString);
      if (!cookie) {
        throw new Error(`Failed to parse cookie: ${cookieString}`);
      }

      // Store cookie with the domain
      await jar.setCookie(cookie, `https://${normalizedDomain}`);

      // Persist to Redis if available
      await this.persistToRedis(normalizedDomain);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      throw new Error(`Failed to set cookie for ${normalizedDomain}: ${message}`);
    }
  }

  /**
   * Get all cookies for a domain
   * @param domain - Domain name
   * @returns Array of cookie strings
   */
  async getCookies(domain: string): Promise<string[]> {
    const normalizedDomain = this.normalizeDomain(domain);

    // Try to load from Redis first if not in memory
    if (this.redis && !this.jars.has(normalizedDomain)) {
      await this.loadFromRedis(normalizedDomain);
    }

    const jar = this.jars.get(normalizedDomain);
    if (!jar) {
      return [];
    }

    try {
      const cookies = await jar.getCookies(`https://${normalizedDomain}`);
      return cookies.map((c) => c.cookieString());
    } catch (err) {
      console.error(`Failed to get cookies for ${normalizedDomain}:`, err);
      return [];
    }
  }

  /**
   * Get cookies formatted for HTTP Cookie header
   * @param domain - Domain name
   * @returns Cookie header value (name=value; name2=value2)
   */
  async getHeaders(domain: string): Promise<Record<string, string>> {
    const normalizedDomain = this.normalizeDomain(domain);

    if (this.redis && !this.jars.has(normalizedDomain)) {
      await this.loadFromRedis(normalizedDomain);
    }

    const jar = this.jars.get(normalizedDomain);
    if (!jar) {
      return {};
    }

    try {
      const cookieString = await jar.getCookieString(
        `https://${normalizedDomain}`,
      );
      return cookieString ? { Cookie: cookieString } : {};
    } catch (err) {
      console.error(
        `Failed to get cookie header for ${normalizedDomain}:`,
        err,
      );
      return {};
    }
  }

  /**
   * Update session from response Set-Cookie headers
   * @param domain - Domain name
   * @param headers - Response headers object
   */
  async updateFromResponse(domain: string, headers: any): Promise<void> {
    const normalizedDomain = this.normalizeDomain(domain);
    const setCookieHeaders = this.extractSetCookieHeaders(headers);

    if (setCookieHeaders.length === 0) {
      return;
    }

    for (const cookieString of setCookieHeaders) {
      try {
        await this.setCookie(normalizedDomain, cookieString);
      } catch (err) {
        console.error(`Failed to update cookie from response:`, err);
      }
    }
  }

  /**
   * Clear session for a domain
   * @param domain - Domain name
   */
  async clearSession(domain: string): Promise<void> {
    const normalizedDomain = this.normalizeDomain(domain);

    // Remove from memory
    this.jars.delete(normalizedDomain);

    // Remove from Redis if available
    if (this.redis) {
      const key = this.getRedisKey(normalizedDomain);
      await this.redis.del(key);
    }
  }

  /**
   * Clear all sessions
   */
  async clearAll(): Promise<void> {
    // Clear memory
    this.jars.clear();

    // Clear Redis if available
    if (this.redis) {
      const keys = await this.redis.keys(`${REDIS_KEY_PREFIX}*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }

  /**
   * Get session data for a domain (for debugging/inspection)
   * @param domain - Domain name
   * @returns Session data or null if not found
   */
  async getSessionData(domain: string): Promise<SessionData | null> {
    const normalizedDomain = this.normalizeDomain(domain);

    if (this.redis && !this.jars.has(normalizedDomain)) {
      await this.loadFromRedis(normalizedDomain);
    }

    const jar = this.jars.get(normalizedDomain);
    if (!jar) {
      return null;
    }

    try {
      const serialized = await jar.serialize();
      const cookies = serialized.cookies || [];

      return {
        domain: normalizedDomain,
        cookies,
        metadata: {
          createdAt: Date.now(),
          lastAccessed: Date.now(),
          requestCount: 0,
        },
      };
    } catch (err) {
      console.error(
        `Failed to serialize session for ${normalizedDomain}:`,
        err,
      );
      return null;
    }
  }

  /**
   * Get or create a cookie jar for a domain
   */
  private getOrCreateJar(domain: string): CookieJar {
    let jar = this.jars.get(domain);

    if (!jar) {
      jar = new CookieJar(undefined, {
        rejectPublicSuffixes: this.strictDomain,
        looseMode: !this.strictDomain,
      });
      this.jars.set(domain, jar);
    }

    return jar;
  }

  /**
   * Normalize domain name (lowercase, remove protocol)
   */
  private normalizeDomain(domain: string): string {
    return (
      domain
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/:\d+$/, "")
        // Get just the hostname, remove path
        .split("/")[0]
    );
  }

  /**
   * Extract Set-Cookie headers from response headers
   */
  private extractSetCookieHeaders(headers: any): string[] {
    const setCookie = headers["set-cookie"] || headers["Set-Cookie"];

    if (!setCookie) {
      return [];
    }

    return Array.isArray(setCookie) ? setCookie : [setCookie];
  }

  /**
   * Get Redis key for a domain
   */
  private getRedisKey(domain: string): string {
    return `${REDIS_KEY_PREFIX}${domain}`;
  }

  /**
   * Persist cookie jar to Redis
   */
  private async persistToRedis(domain: string): Promise<void> {
    if (!this.redis) {
      return;
    }

    const jar = this.jars.get(domain);
    if (!jar) {
      return;
    }

    try {
      const serialized = await jar.serialize();
      const key = this.getRedisKey(domain);
      const value = JSON.stringify(serialized);

      await this.redis.setex(key, this.ttl, value);
    } catch (err) {
      console.error(`Failed to persist session to Redis for ${domain}:`, err);
    }
  }

  /**
   * Load cookie jar from Redis
   */
  private async loadFromRedis(domain: string): Promise<void> {
    if (!this.redis) {
      return;
    }

    try {
      const key = this.getRedisKey(domain);
      const value = await this.redis.get(key);

      if (!value) {
        return;
      }

      const serialized = JSON.parse(value);
      const jar = CookieJar.deserializeSync(serialized);

      this.jars.set(domain, jar);
    } catch (err) {
      console.error(`Failed to load session from Redis for ${domain}:`, err);
    }
  }

  /**
   * Get statistics about stored sessions
   */
  getStats(): { totalSessions: number; domains: string[] } {
    return {
      totalSessions: this.jars.size,
      domains: Array.from(this.jars.keys()),
    };
  }
}
