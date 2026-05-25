import { createPool, Pool, Factory } from "generic-pool";
import imaps, { ImapSimple } from "imap-simple";
import { IMAPAuthCredentials } from "./types.js";

interface IMAPPoolConfig {
  max?: number;
  min?: number;
  acquireTimeoutMillis?: number;
  idleTimeoutMillis?: number;
  evictionRunIntervalMillis?: number;
  rateLimitMinMs?: number;
  rateLimitMaxMs?: number;
}

interface RateLimiter {
  minDelayMs: number;
  maxDelayMs: number;
  lastConnectionTime: number;
}

export class IMAPConnectionPool {
  private pool: Pool<ImapSimple>;
  private credentials: IMAPAuthCredentials;
  private rateLimiter: RateLimiter;
  private timeout: number;

  constructor(
    credentials: IMAPAuthCredentials,
    config: IMAPPoolConfig = {},
    timeout = 10_000,
  ) {
    this.credentials = credentials;
    this.timeout = timeout;
    this.rateLimiter = {
      minDelayMs: config.rateLimitMinMs ?? 2000,
      maxDelayMs: config.rateLimitMaxMs ?? 5000,
      lastConnectionTime: 0,
    };

    const factory: Factory<ImapSimple> = {
      create: async () => this.createConnection(),
      destroy: async (client) => this.destroyConnection(client),
      validate: async (client) => this.validateConnection(client),
    };

    this.pool = createPool(factory, {
      max: config.max ?? 10,
      min: config.min ?? 0,
      acquireTimeoutMillis: config.acquireTimeoutMillis ?? 30000,
      idleTimeoutMillis: config.idleTimeoutMillis ?? 30000,
      evictionRunIntervalMillis: config.evictionRunIntervalMillis ?? 5000,
    });
  }

  private async enforceRateLimit(): Promise<void> {
    // Если rate limiting отключен (оба значения 0), пропускаем
    if (
      this.rateLimiter.minDelayMs === 0 &&
      this.rateLimiter.maxDelayMs === 0
    ) {
      return;
    }

    const now = Date.now();
    const elapsed = now - this.rateLimiter.lastConnectionTime;
    const requiredDelay =
      Math.random() *
        (this.rateLimiter.maxDelayMs - this.rateLimiter.minDelayMs) +
      this.rateLimiter.minDelayMs;

    if (elapsed < requiredDelay) {
      await new Promise((resolve) =>
        setTimeout(resolve, requiredDelay - elapsed),
      );
    }

    this.rateLimiter.lastConnectionTime = Date.now();
  }

  private async createConnection(): Promise<ImapSimple> {
    await this.enforceRateLimit();

    const connection = await imaps.connect({
      imap: {
        user: this.credentials.user,
        password: this.credentials.password,
        host: this.credentials.host,
        port: this.credentials.port,
        tls: this.credentials.tls,
        authTimeout: this.timeout,
        connTimeout: this.timeout,
        tlsOptions: { rejectUnauthorized: false },
      },
    });

    return connection;
  }

  private async destroyConnection(client: ImapSimple): Promise<void> {
    try {
      await client.end();
    } catch {
      // Игнорируем ошибки при закрытии
    }
  }

  private async validateConnection(client: ImapSimple): Promise<boolean> {
    if (!client) return false;

    try {
      // Проверка живости через состояние соединения
      const state = (client as any).connection?.state;
      return state === "authenticated" || state === "connected";
    } catch {
      return false;
    }
  }

  async acquire(): Promise<ImapSimple> {
    return this.pool.acquire();
  }

  async release(client: ImapSimple): Promise<void> {
    await this.pool.release(client);
  }

  async drain(): Promise<void> {
    await this.pool.drain();
  }

  async clear(): Promise<void> {
    await this.pool.clear();
  }

  getPoolSize(): number {
    return this.pool.size;
  }

  getAvailable(): number {
    return this.pool.available;
  }

  getPending(): number {
    return this.pool.pending;
  }
}
