import { db } from "../db.js";

export interface AttemptConfig {
  delayMs: number;
  jitterFactor: number;
  maxAttemptsPerEmail: number;
  proxyRotateEvery: number;
  domainCooldownMs: number;
  enabled: boolean;
}

interface ProxyEntry {
  id: number;
  host: string;
  port: number;
  protocol: string;
  username: string | null;
  password: string | null;
}

export interface AttemptCheck {
  allowed: boolean;
  proxy?: ProxyEntry;
  reason?: string;
}

const DEFAULT_CONFIG: AttemptConfig = {
  delayMs: 2000,
  jitterFactor: 0.3,
  maxAttemptsPerEmail: 20,
  proxyRotateEvery: 5,
  domainCooldownMs: 30000,
  enabled: true,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class AuthAttemptController {
  private config: AttemptConfig;
  private attemptCounts = new Map<string, number>();
  private domainCooldowns = new Map<string, number>();
  private totalAttempts = 0;
  private currentProxyIndex = 0;
  private proxies: ProxyEntry[] = [];

  constructor(config?: Partial<AttemptConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async loadProxies(): Promise<void> {
    this.proxies = await db.proxy.findMany({
      where: { status: "alive" },
      orderBy: { latency: "asc" },
      select: {
        id: true,
        host: true,
        port: true,
        protocol: true,
        username: true,
        password: true,
      },
    });
  }

  async beforeAttempt(email: string): Promise<AttemptCheck> {
    if (!this.config.enabled) {
      return { allowed: true };
    }

    // Check per-email limit
    const count = this.attemptCounts.get(email) ?? 0;
    if (count >= this.config.maxAttemptsPerEmail) {
      return { allowed: false, reason: "max_attempts_reached" };
    }

    // Check domain cooldown
    const domain = email.split("@")[1]?.toLowerCase() ?? "";
    const cooldownUntil = this.domainCooldowns.get(domain);
    if (cooldownUntil && Date.now() < cooldownUntil) {
      const waitMs = cooldownUntil - Date.now();
      await sleep(waitMs);
    }

    // Apply delay with jitter
    const jitter =
      this.config.delayMs *
      this.config.jitterFactor *
      (Math.random() * 2 - 1);
    const finalDelay = Math.max(100, this.config.delayMs + jitter);
    await sleep(finalDelay);

    // Select proxy (round-robin rotation)
    let proxy: ProxyEntry | undefined;
    if (this.proxies.length > 0) {
      if (
        this.totalAttempts > 0 &&
        this.totalAttempts % this.config.proxyRotateEvery === 0
      ) {
        this.currentProxyIndex =
          (this.currentProxyIndex + 1) % this.proxies.length;
      }
      proxy = this.proxies[this.currentProxyIndex];
    }

    return { allowed: true, proxy };
  }

  afterAttempt(email: string, rateLimited: boolean): void {
    this.totalAttempts++;

    const count = this.attemptCounts.get(email) ?? 0;
    this.attemptCounts.set(email, count + 1);

    if (rateLimited) {
      const domain = email.split("@")[1]?.toLowerCase() ?? "";
      this.domainCooldowns.set(
        domain,
        Date.now() + this.config.domainCooldownMs,
      );
    }
  }

  getStats() {
    return {
      totalAttempts: this.totalAttempts,
      emailsTracked: this.attemptCounts.size,
      domainsInCooldown: Array.from(this.domainCooldowns.entries())
        .filter(([, until]) => Date.now() < until)
        .map(([domain]) => domain),
      proxiesLoaded: this.proxies.length,
      currentProxyIndex: this.currentProxyIndex,
      config: this.config,
    };
  }

  resetEmail(email: string): void {
    this.attemptCounts.delete(email);
  }

  resetAll(): void {
    this.attemptCounts.clear();
    this.domainCooldowns.clear();
    this.totalAttempts = 0;
    this.currentProxyIndex = 0;
  }
}
