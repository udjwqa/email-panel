import { describe, it, expect } from "vitest";
import { parsePasswordFile } from "../../src/services/dictionary/parser.js";

describe("parsePasswordFile", () => {
  it("parses simple password list", () => {
    const content = "password123\nadmin\nletmein\n";
    const result = parsePasswordFile(content);

    expect(result.entries).toHaveLength(3);
    expect(result.totalLines).toBe(3);
    expect(result.validLines).toBe(3);
    expect(result.duplicateCount).toBe(0);
  });

  it("deduplicates passwords", () => {
    const content = "password\npassword\nadmin\nadmin\nunique\n";
    const result = parsePasswordFile(content);

    expect(result.entries).toHaveLength(3);
    expect(result.validLines).toBe(3);
    expect(result.duplicateCount).toBe(2);
  });

  it("skips empty lines", () => {
    const content = "pass1\n\npass2";
    const result = parsePasswordFile(content);

    expect(result.entries).toHaveLength(2);
    expect(result.emptyLines).toBe(1);
  });

  it("rejects passwords over 128 chars", () => {
    const longPass = "a".repeat(129);
    const content = `short\n${longPass}\nvalid\n`;
    const result = parsePasswordFile(content);

    expect(result.entries).toHaveLength(2);
    expect(result.entries.map((e) => e.password)).toContain("short");
    expect(result.entries.map((e) => e.password)).toContain("valid");
  });

  it("analyzes password characteristics", () => {
    const content = "Password1!\nlowercase\n12345\n";
    const result = parsePasswordFile(content);

    const p1 = result.entries.find((e) => e.password === "Password1!");
    expect(p1?.hasDigits).toBe(true);
    expect(p1?.hasSpecial).toBe(true);
    expect(p1?.hasUpper).toBe(true);
    expect(p1?.length).toBe(10);

    const p2 = result.entries.find((e) => e.password === "lowercase");
    expect(p2?.hasDigits).toBe(false);
    expect(p2?.hasSpecial).toBe(false);
    expect(p2?.hasUpper).toBe(false);

    const p3 = result.entries.find((e) => e.password === "12345");
    expect(p3?.hasDigits).toBe(true);
    expect(p3?.hasUpper).toBe(false);
  });

  it("handles empty file", () => {
    const result = parsePasswordFile("");
    expect(result.entries).toHaveLength(0);
    expect(result.totalLines).toBe(0);
  });

  it("trims whitespace", () => {
    const content = "  password  \n  admin  \n";
    const result = parsePasswordFile(content);

    expect(result.entries[0].password).toBe("password");
    expect(result.entries[1].password).toBe("admin");
  });
});
