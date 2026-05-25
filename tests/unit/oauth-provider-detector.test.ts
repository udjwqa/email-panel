import { describe, it, expect } from "vitest";
import {
  detectProviderFromEmail,
  extractDomain,
  isOAuthSupported,
  emailSupportsOAuth,
} from "../../src/services/oauth/provider-detector.js";

describe("detectProviderFromEmail", () => {
  it("detects Google from gmail.com", () => {
    expect(detectProviderFromEmail("user@gmail.com")).toBe("Google");
  });

  it("detects Google from googlemail.com", () => {
    expect(detectProviderFromEmail("test@googlemail.com")).toBe("Google");
  });

  it("detects Microsoft from outlook.com", () => {
    expect(detectProviderFromEmail("user@outlook.com")).toBe("Microsoft");
  });

  it("detects Microsoft from hotmail.com", () => {
    expect(detectProviderFromEmail("test@hotmail.com")).toBe("Microsoft");
  });

  it("detects Yahoo from yahoo.com", () => {
    expect(detectProviderFromEmail("user@yahoo.com")).toBe("Yahoo");
  });

  it("detects MailRu from mail.ru", () => {
    expect(detectProviderFromEmail("user@mail.ru")).toBe("MailRu");
  });

  it("detects MailRu from yandex.ru", () => {
    expect(detectProviderFromEmail("test@yandex.ru")).toBe("MailRu");
  });

  it("detects Apple from icloud.com", () => {
    expect(detectProviderFromEmail("user@icloud.com")).toBe("Apple");
  });

  it("detects ProtonMail from protonmail.com", () => {
    expect(detectProviderFromEmail("user@protonmail.com")).toBe("ProtonMail");
  });

  it("detects Zoho from zoho.com", () => {
    expect(detectProviderFromEmail("user@zoho.com")).toBe("Zoho");
  });

  it("detects AOL from aol.com", () => {
    expect(detectProviderFromEmail("user@aol.com")).toBe("AOL");
  });

  it("returns Unknown for unrecognized domain", () => {
    expect(detectProviderFromEmail("user@unknown-domain.xyz")).toBe("Unknown");
  });

  it("returns Unknown for invalid email", () => {
    expect(detectProviderFromEmail("invalid-email")).toBe("Unknown");
  });
});

describe("extractDomain", () => {
  it("extracts domain from valid email", () => {
    expect(extractDomain("user@example.com")).toBe("example.com");
  });

  it("returns lowercase domain", () => {
    expect(extractDomain("User@Example.COM")).toBe("example.com");
  });

  it("returns null for invalid email", () => {
    expect(extractDomain("invalid-email")).toBeNull();
  });

  it("returns null for email without @", () => {
    expect(extractDomain("nodomain")).toBeNull();
  });
});

describe("isOAuthSupported", () => {
  it("returns true for known providers", () => {
    expect(isOAuthSupported("Google")).toBe(true);
    expect(isOAuthSupported("Microsoft")).toBe(true);
    expect(isOAuthSupported("Yahoo")).toBe(true);
  });

  it("returns false for Unknown provider", () => {
    expect(isOAuthSupported("Unknown")).toBe(false);
  });
});

describe("emailSupportsOAuth", () => {
  it("returns true for Gmail", () => {
    expect(emailSupportsOAuth("user@gmail.com")).toBe(true);
  });

  it("returns true for Outlook", () => {
    expect(emailSupportsOAuth("user@outlook.com")).toBe(true);
  });

  it("returns false for unknown domain", () => {
    expect(emailSupportsOAuth("user@unknown.xyz")).toBe(false);
  });

  it("returns false for invalid email", () => {
    expect(emailSupportsOAuth("invalid")).toBe(false);
  });
});
