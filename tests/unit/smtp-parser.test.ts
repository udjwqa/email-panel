import { describe, it, expect } from "vitest";
import { parseSmtpResponse } from "../../src/services/smtp/parser.js";

describe("parseSmtpResponse", () => {
  it("parses 220 banner as success", () => {
    const r = parseSmtpResponse("220 mail.example.com ESMTP\r\n");
    expect(r.code).toBe(220);
    expect(r.message).toBe("mail.example.com ESMTP");
    expect(r.status).toBe("success");
    expect(r.isMultiline).toBe(false);
    expect(r.lines).toEqual(["mail.example.com ESMTP"]);
  });

  it("parses 250 OK as success", () => {
    const r = parseSmtpResponse("250 OK\r\n");
    expect(r.code).toBe(250);
    expect(r.status).toBe("success");
    expect(r.isMultiline).toBe(false);
  });

  it("parses multiline 250 EHLO response", () => {
    const raw =
      "250-mail.example.com\r\n" +
      "250-SIZE 52428800\r\n" +
      "250-STARTTLS\r\n" +
      "250-AUTH LOGIN PLAIN\r\n" +
      "250 8BITMIME\r\n";
    const r = parseSmtpResponse(raw);
    expect(r.code).toBe(250);
    expect(r.status).toBe("success");
    expect(r.isMultiline).toBe(true);
    expect(r.lines).toHaveLength(5);
    expect(r.lines[0]).toBe("mail.example.com");
    expect(r.lines[2]).toBe("STARTTLS");
    expect(r.lines[4]).toBe("8BITMIME");
  });

  it("parses 354 as success (3xx intermediate)", () => {
    const r = parseSmtpResponse(
      "354 Start mail input; end with <CRLF>.<CRLF>\r\n",
    );
    expect(r.code).toBe(354);
    expect(r.status).toBe("success");
  });

  it("parses 421 as temporary_failure", () => {
    const r = parseSmtpResponse("421 Service not available\r\n");
    expect(r.code).toBe(421);
    expect(r.status).toBe("temporary_failure");
    expect(r.message).toBe("Service not available");
  });

  it("parses 450 as temporary_failure", () => {
    const r = parseSmtpResponse("450 Mailbox unavailable (greylisted)\r\n");
    expect(r.code).toBe(450);
    expect(r.status).toBe("temporary_failure");
  });

  it("parses 451 as temporary_failure", () => {
    const r = parseSmtpResponse("451 Requested action aborted: local error\r\n");
    expect(r.code).toBe(451);
    expect(r.status).toBe("temporary_failure");
  });

  it("parses 550 as error", () => {
    const r = parseSmtpResponse("550 User not found\r\n");
    expect(r.code).toBe(550);
    expect(r.status).toBe("error");
    expect(r.message).toBe("User not found");
  });

  it("parses 553 as error", () => {
    const r = parseSmtpResponse("553 Mailbox name not allowed\r\n");
    expect(r.code).toBe(553);
    expect(r.status).toBe("error");
  });

  it("parses 500 syntax error as error", () => {
    const r = parseSmtpResponse("500 Syntax error, command unrecognized\r\n");
    expect(r.code).toBe(500);
    expect(r.status).toBe("error");
  });

  it("handles empty input", () => {
    const r = parseSmtpResponse("");
    expect(r.code).toBe(0);
    expect(r.message).toBe("");
    expect(r.status).toBe("error");
    expect(r.lines).toEqual([]);
  });

  it("parses multiline 550 error", () => {
    const raw =
      "550-Verification failed for <bad@example.com>\r\n" +
      "550 Unrouteable address\r\n";
    const r = parseSmtpResponse(raw);
    expect(r.code).toBe(550);
    expect(r.status).toBe("error");
    expect(r.isMultiline).toBe(true);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toContain("Verification failed");
    expect(r.lines[1]).toBe("Unrouteable address");
  });
});
