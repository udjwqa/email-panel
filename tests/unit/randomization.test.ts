import { describe, it, expect } from "vitest";
import {
  getRandomUserAgent,
  getRandomJitter,
  sleep,
  sleepWithJitter,
  USER_AGENTS,
} from "../../src/utils/randomization.js";

describe("randomization utils", () => {
  it("returns random user agent from list", () => {
    const ua = getRandomUserAgent();
    expect(USER_AGENTS).toContain(ua);
  });

  it("returns jitter within range", () => {
    const jitter = getRandomJitter(1000, 5000);
    expect(jitter).toBeGreaterThanOrEqual(1000);
    expect(jitter).toBeLessThanOrEqual(5000);
  });

  it("sleeps for specified duration", async () => {
    const start = Date.now();
    await sleep(100);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(90);
  });

  it("sleeps with jitter in specified range", async () => {
    const start = Date.now();
    await sleepWithJitter(100, 200);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(90);
    expect(elapsed).toBeLessThan(250);
  });
});
