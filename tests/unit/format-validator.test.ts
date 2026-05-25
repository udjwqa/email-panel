import { describe, it, expect } from "vitest";
import { validateFormat } from "../../src/services/validators/format.js";

describe("validateFormat", () => {
  it("accepts valid email", () => {
    expect(validateFormat("user@example.com").valid).toBe(true);
  });

  it("accepts email with dots in local part", () => {
    expect(validateFormat("first.last@example.com").valid).toBe(true);
  });

  it("accepts email with plus", () => {
    expect(validateFormat("user+tag@example.com").valid).toBe(true);
  });

  it("rejects empty string", () => {
    expect(validateFormat("").valid).toBe(false);
  });

  it("rejects email without @", () => {
    expect(validateFormat("userexample.com").valid).toBe(false);
  });

  it("rejects double dots in local part", () => {
    expect(validateFormat("user..name@example.com").valid).toBe(false);
  });

  it("rejects email over 254 chars", () => {
    const long = "a".repeat(250) + "@b.com";
    expect(validateFormat(long).valid).toBe(false);
  });

  it("rejects local part over 64 chars", () => {
    const long = "a".repeat(65) + "@example.com";
    expect(validateFormat(long).valid).toBe(false);
  });

  it("rejects email without TLD", () => {
    expect(validateFormat("user@localhost").valid).toBe(false);
  });

  it("rejects email with spaces", () => {
    expect(validateFormat("user @example.com").valid).toBe(false);
  });
});
