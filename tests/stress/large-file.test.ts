import { describe, it, expect } from "vitest";
import { parseEmailFile } from "../../src/services/parser.js";

describe("Large file parsing", () => {
  it("parses 100K email lines under 5 seconds", () => {
    const lines: string[] = [];
    for (let i = 0; i < 100_000; i++) {
      lines.push(`user${i}@domain${i % 1000}.com:pass${i}`);
    }
    const content = lines.join("\n");

    const start = Date.now();
    const result = parseEmailFile(content);
    const elapsed = Date.now() - start;

    expect(result.validLines).toBe(100_000);
    expect(result.duplicateCount).toBe(0);
    expect(result.entries).toHaveLength(100_000);
    expect(elapsed).toBeLessThan(5000);
  });

  it("deduplicates correctly at scale", () => {
    const lines: string[] = [];
    for (let i = 0; i < 50_000; i++) {
      lines.push(`user${i % 10000}@example.com`);
    }
    const content = lines.join("\n");

    const result = parseEmailFile(content);
    expect(result.entries).toHaveLength(10_000);
    expect(result.duplicateCount).toBe(40_000);
  });

  it("handles mixed valid/invalid at scale", () => {
    const lines: string[] = [];
    for (let i = 0; i < 50_000; i++) {
      if (i % 5 === 0) {
        lines.push("not-an-email");
      } else {
        lines.push(`user${i}@test.com`);
      }
    }
    const content = lines.join("\n");

    const result = parseEmailFile(content);
    expect(result.invalidLines).toBe(10_000);
    expect(result.validLines).toBe(40_000);
    expect(result.totalLines).toBe(50_000);
  });
});
