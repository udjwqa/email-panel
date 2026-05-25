import { describe, it, expect } from "vitest";
import { parseEmailFile } from "../../src/services/parser.js";

describe("parseEmailFile", () => {
  it("parses plain email lines", () => {
    const result = parseEmailFile("test@example.com\nuser@gmail.com");
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].email).toBe("test@example.com");
    expect(result.entries[0].password).toBeNull();
    expect(result.validLines).toBe(2);
  });

  it("parses email:password format", () => {
    const result = parseEmailFile("test@example.com:mypass123");
    expect(result.entries[0].email).toBe("test@example.com");
    expect(result.entries[0].password).toBe("mypass123");
  });

  it("parses email | data format", () => {
    const result = parseEmailFile("test@example.com | somedata");
    expect(result.entries[0].email).toBe("test@example.com");
    expect(result.entries[0].password).toBe("somedata");
  });

  it("parses email,data format", () => {
    const result = parseEmailFile("test@example.com,extradata");
    expect(result.entries[0].email).toBe("test@example.com");
    expect(result.entries[0].password).toBe("extradata");
  });

  it("parses email;password format", () => {
    const result = parseEmailFile("test@example.com;mypass123");
    expect(result.entries[0].email).toBe("test@example.com");
    expect(result.entries[0].password).toBe("mypass123");
  });

  it("skips empty lines", () => {
    const result = parseEmailFile("test@example.com\n\n\nuser@gmail.com\n");
    expect(result.entries).toHaveLength(2);
    expect(result.totalLines).toBe(2);
  });

  it("marks invalid emails", () => {
    const result = parseEmailFile("notanemail\ntest@example.com\n@bad\nno-at-sign");
    expect(result.validLines).toBe(1);
    expect(result.invalidLines).toBe(3);
  });

  it("deduplicates emails", () => {
    const result = parseEmailFile("test@example.com\ntest@example.com\ntest@example.com");
    expect(result.entries).toHaveLength(1);
    expect(result.duplicateCount).toBe(2);
  });

  it("normalizes to lowercase", () => {
    const result = parseEmailFile("TEST@EXAMPLE.COM");
    expect(result.entries[0].email).toBe("test@example.com");
  });

  it("extracts domain correctly", () => {
    const result = parseEmailFile("user@gmail.com");
    expect(result.entries[0].domain).toBe("gmail.com");
  });

  it("handles mixed formats", () => {
    const input = [
      "plain@example.com",
      "colon@example.com:pass",
      "pipe@example.com | data",
      "comma@example.com,extra",
      "semi@example.com;secret",
      "invalid-no-at",
      "plain@example.com",
    ].join("\n");

    const result = parseEmailFile(input);
    expect(result.validLines).toBe(5);
    expect(result.invalidLines).toBe(1);
    expect(result.duplicateCount).toBe(1);
    expect(result.totalLines).toBe(7);
  });

  it("handles Windows line endings", () => {
    const result = parseEmailFile("a@b.com\r\nc@d.com\r\n");
    expect(result.entries).toHaveLength(2);
  });
});
