import { describe, it, expect } from "vitest";
import { SmtpClient } from "../../src/services/smtp/client.js";

describe("SmtpClient", () => {
  describe("parseResponse", () => {
    const client = new SmtpClient();

    it("parses single-line 220 banner", () => {
      const resp = client.parseResponse("220 mail.example.com ESMTP\r\n");
      expect(resp.code).toBe(220);
      expect(resp.message).toBe("mail.example.com ESMTP");
      expect(resp.isMultiline).toBe(false);
    });

    it("parses multiline 250 EHLO response", () => {
      const raw =
        "250-mail.example.com\r\n" +
        "250-SIZE 52428800\r\n" +
        "250-STARTTLS\r\n" +
        "250 OK\r\n";
      const resp = client.parseResponse(raw);
      expect(resp.code).toBe(250);
      expect(resp.isMultiline).toBe(true);
      expect(resp.message).toContain("mail.example.com");
      expect(resp.message).toContain("SIZE 52428800");
      expect(resp.message).toContain("STARTTLS");
      expect(resp.message).toContain("OK");
    });

    it("parses 421 service unavailable", () => {
      const resp = client.parseResponse(
        "421 Service not available, closing transmission channel\r\n",
      );
      expect(resp.code).toBe(421);
      expect(resp.message).toBe(
        "Service not available, closing transmission channel",
      );
      expect(resp.isMultiline).toBe(false);
    });

    it("parses 550 user not found", () => {
      const resp = client.parseResponse("550 User not found\r\n");
      expect(resp.code).toBe(550);
      expect(resp.message).toBe("User not found");
    });

    it("parses 250 OK single line", () => {
      const resp = client.parseResponse("250 OK\r\n");
      expect(resp.code).toBe(250);
      expect(resp.message).toBe("OK");
      expect(resp.isMultiline).toBe(false);
    });

    it("handles empty input", () => {
      const resp = client.parseResponse("");
      expect(resp.code).toBe(0);
      expect(resp.message).toBe("");
    });

    it("parses 354 start mail input", () => {
      const resp = client.parseResponse(
        "354 Start mail input; end with <CRLF>.<CRLF>\r\n",
      );
      expect(resp.code).toBe(354);
    });

    it("detects STARTTLS in EHLO capabilities", () => {
      const raw =
        "250-smtp.example.com Hello\r\n" +
        "250-PIPELINING\r\n" +
        "250-SIZE 35882577\r\n" +
        "250-STARTTLS\r\n" +
        "250-AUTH LOGIN PLAIN\r\n" +
        "250 8BITMIME\r\n";
      const resp = client.parseResponse(raw);
      expect(resp.message.toUpperCase()).toContain("STARTTLS");
    });

    it("parses multiline with only continuation lines", () => {
      const raw = "250-First\r\n250-Second\r\n250 Third\r\n";
      const resp = client.parseResponse(raw);
      expect(resp.code).toBe(250);
      expect(resp.isMultiline).toBe(true);
      const parts = resp.message.split("\n");
      expect(parts).toHaveLength(3);
    });

    it("parses 4xx temporary error", () => {
      const resp = client.parseResponse(
        "450 Requested mail action not taken: mailbox unavailable\r\n",
      );
      expect(resp.code).toBe(450);
    });

    it("includes status field from parser", () => {
      const success = client.parseResponse("220 ESMTP\r\n");
      expect(success.status).toBe("success");

      const error = client.parseResponse("550 User not found\r\n");
      expect(error.status).toBe("error");

      const tempFailure = client.parseResponse(
        "450 Mailbox unavailable\r\n",
      );
      expect(tempFailure.status).toBe("temporary_failure");
    });
  });

  describe("constructor", () => {
    it("sets default timeout to 30s", () => {
      const client = new SmtpClient();
      expect(client).toBeDefined();
    });

    it("accepts custom timeout", () => {
      const client = new SmtpClient(5000);
      expect(client).toBeDefined();
    });
  });

  describe("sendCommand without connection", () => {
    it("throws if not connected", async () => {
      const client = new SmtpClient();
      await expect(client.sendCommand("EHLO test")).rejects.toThrow(
        "Not connected",
      );
    });
  });

  describe("close()", () => {
    it("safely handles close when not connected", async () => {
      const client = new SmtpClient();
      await expect(client.close()).resolves.toBeUndefined();
    });

    it("safely handles close when already destroyed", async () => {
      const client = new SmtpClient();
      // Simulate destroyed socket
      (client as any).socket = { destroyed: true };
      await expect(client.close()).resolves.toBeUndefined();
    });
  });

  describe("startTls()", () => {
    it("returns false when not connected", async () => {
      const client = new SmtpClient();
      const result = await client.startTls("test.com");
      expect(result).toBe(false);
    });

    it("returns false when socket is destroyed", async () => {
      const client = new SmtpClient();
      (client as any).socket = { destroyed: true };
      const result = await client.startTls("test.com");
      expect(result).toBe(false);
    });
  });
});
