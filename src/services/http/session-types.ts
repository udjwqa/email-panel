import type { Redis } from "ioredis";

/**
 * Session storage configuration
 */
export interface SessionStoreConfig {
  /** Redis client for persistent storage (optional) */
  redis?: Redis;
  /** Session TTL in seconds for Redis (default: 3600) */
  ttl?: number;
  /** Enable strict domain matching (default: true) */
  strictDomain?: boolean;
}

/**
 * Session data for a domain
 */
export interface SessionData {
  /** Domain name */
  domain: string;
  /** Cookie jar serialized state */
  cookies: any[];
  /** Session metadata */
  metadata?: {
    createdAt: number;
    lastAccessed: number;
    requestCount: number;
  };
}
