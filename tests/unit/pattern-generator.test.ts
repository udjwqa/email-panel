import { describe, it, expect } from "vitest";
import { generatePasswordPatterns } from "../../src/services/dictionary/pattern-generator.js";

describe("generatePasswordPatterns", () => {
  it("generates basic name combinations", () => {
    const result = generatePasswordPatterns({
      firstName: "John",
      lastName: "Smith",
    });

    expect(result.passwords).toContain("JohnSmith");
    expect(result.passwords).toContain("johnsmith");
    expect(result.passwords).toContain("SmithJohn");
    expect(result.passwords).toContain("john.smith");
    expect(result.passwords).toContain("john_smith");
    expect(result.templateCount).toBeGreaterThan(20);
  });

  it("generates date-based patterns", () => {
    const result = generatePasswordPatterns({
      firstName: "John",
      lastName: "Smith",
      birthDate: "1990-05-15",
    });

    expect(result.passwords).toContain("John1990");
    expect(result.passwords).toContain("john1990");
    expect(result.passwords).toContain("John90");
    expect(result.passwords).toContain("john1505");
    expect(result.passwords).toContain("John0515");
    expect(result.templateCount).toBeGreaterThan(50);
  });

  it("generates leet speak variants", () => {
    const result = generatePasswordPatterns({
      firstName: "John",
      lastName: "Smith",
    });

    const hasLeet = result.passwords.some(
      (p) => p.includes("0") || p.includes("1") || p.includes("$"),
    );
    expect(hasLeet).toBe(true);
  });

  it("generates suffix patterns", () => {
    const result = generatePasswordPatterns({
      firstName: "John",
      lastName: "Smith",
    });

    expect(result.passwords).toContain("John123");
    expect(result.passwords).toContain("John1234");
    expect(result.passwords).toContain("john!");
  });

  it("includes custom words", () => {
    const result = generatePasswordPatterns({
      firstName: "John",
      lastName: "Smith",
      nickname: "coolcat",
    });

    expect(result.passwords).toContain("coolcat123");
    expect(result.passwords).toContain("Coolcat!");
  });

  it("includes phone patterns", () => {
    const result = generatePasswordPatterns({
      firstName: "John",
      lastName: "Smith",
      phone: "+1234567890",
    });

    expect(result.passwords).toContain("John7890");
    expect(result.passwords).toContain("john7890");
  });

  it("returns empty for missing names", () => {
    const result = generatePasswordPatterns({
      firstName: "",
      lastName: "",
    });

    expect(result.passwords).toHaveLength(0);
  });

  it("deduplicates passwords", () => {
    const result = generatePasswordPatterns({
      firstName: "John",
      lastName: "Smith",
    });

    const unique = new Set(result.passwords);
    expect(unique.size).toBe(result.passwords.length);
  });

  it("all passwords are at least 4 chars", () => {
    const result = generatePasswordPatterns({
      firstName: "Jo",
      lastName: "Li",
      birthDate: "2000-01-01",
    });

    for (const pw of result.passwords) {
      expect(pw.length).toBeGreaterThanOrEqual(4);
    }
  });
});
