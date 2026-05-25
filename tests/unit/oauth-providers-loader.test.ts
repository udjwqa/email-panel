import { describe, it, expect } from "vitest";
import {
  getProviderConfig,
  getProviderByName,
  isProviderSupported,
  getAllProviders,
  getProvidersVersion,
  getProviderCustomHeaders,
} from "../../src/services/oauth/providers-loader.js";

describe("OAuth Providers Loader", () => {
  describe("getProviderConfig", () => {
    it("loads Google provider from JSON", () => {
      const config = getProviderConfig("Google");

      expect(config).toBeDefined();
      expect(config?.provider).toBe("Google");
      expect(config?.authorizationEndpoint).toContain("google.com");
      expect(config?.tokenEndpoint).toContain("googleapis.com");
      expect(config?.contentType).toBe("application/x-www-form-urlencoded");
    });

    it("loads Microsoft provider from JSON", () => {
      const config = getProviderConfig("Microsoft");

      expect(config).toBeDefined();
      expect(config?.provider).toBe("Microsoft");
      expect(config?.authorizationEndpoint).toContain("microsoftonline.com");
      expect(config?.tokenEndpoint).toContain("microsoftonline.com");
    });

    it("loads Yahoo provider from JSON", () => {
      const config = getProviderConfig("Yahoo");

      expect(config).toBeDefined();
      expect(config?.provider).toBe("Yahoo");
      expect(config?.authorizationEndpoint).toContain("yahoo.com");
      expect(config?.tokenEndpoint).toContain("yahoo.com");
    });

    it("loads AOL provider from JSON", () => {
      const config = getProviderConfig("AOL");

      expect(config).toBeDefined();
      expect(config?.provider).toBe("AOL");
      expect(config?.authorizationEndpoint).toContain("aol.com");
      expect(config?.tokenEndpoint).toContain("aol.com");
    });

    it("loads all 8 providers", () => {
      const providers = [
        "Google",
        "Microsoft",
        "Yahoo",
        "MailRu",
        "Apple",
        "ProtonMail",
        "Zoho",
        "AOL",
      ];

      providers.forEach((provider) => {
        const config = getProviderConfig(provider as any);
        expect(config).toBeDefined();
        expect(config?.provider).toBe(provider);
      });
    });

    it("returns null for Unknown provider", () => {
      const config = getProviderConfig("Unknown");
      expect(config).toBeNull();
    });

    it("validates provider config structure", () => {
      const config = getProviderConfig("Google");

      expect(config).toHaveProperty("provider");
      expect(config).toHaveProperty("authorizationEndpoint");
      expect(config).toHaveProperty("tokenEndpoint");
      expect(config).toHaveProperty("defaultScope");
      expect(config).toHaveProperty("contentType");
      expect(config).toHaveProperty("requiredParams");
      expect(config).toHaveProperty("optionalParams");
    });

    it("loads correct default scopes", () => {
      const googleConfig = getProviderConfig("Google");
      expect(googleConfig?.defaultScope).toContain("email");
      expect(googleConfig?.defaultScope).toContain("profile");

      const microsoftConfig = getProviderConfig("Microsoft");
      expect(microsoftConfig?.defaultScope).toContain("offline_access");
    });

    it("loads correct content types", () => {
      const googleConfig = getProviderConfig("Google");
      expect(googleConfig?.contentType).toBe(
        "application/x-www-form-urlencoded",
      );

      const mailruConfig = getProviderConfig("MailRu");
      expect(mailruConfig?.contentType).toBe("application/json");
    });
  });

  describe("getProviderByName", () => {
    it("resolves gmail alias to Google", () => {
      expect(getProviderByName("gmail")).toBe("Google");
    });

    it("resolves google alias to Google", () => {
      expect(getProviderByName("google")).toBe("Google");
    });

    it("resolves outlook alias to Microsoft", () => {
      expect(getProviderByName("outlook")).toBe("Microsoft");
    });

    it("resolves hotmail alias to Microsoft", () => {
      expect(getProviderByName("hotmail")).toBe("Microsoft");
    });

    it("resolves live alias to Microsoft", () => {
      expect(getProviderByName("live")).toBe("Microsoft");
    });

    it("resolves microsoft alias to Microsoft", () => {
      expect(getProviderByName("microsoft")).toBe("Microsoft");
    });

    it("resolves yahoo alias to Yahoo", () => {
      expect(getProviderByName("yahoo")).toBe("Yahoo");
    });

    it("resolves aol alias to AOL", () => {
      expect(getProviderByName("aol")).toBe("AOL");
    });

    it("is case-insensitive", () => {
      expect(getProviderByName("GOOGLE")).toBe("Google");
      expect(getProviderByName("Gmail")).toBe("Google");
      expect(getProviderByName("OUTLOOK")).toBe("Microsoft");
    });

    it("returns Unknown for unrecognized names", () => {
      expect(getProviderByName("invalid")).toBe("Unknown");
      expect(getProviderByName("notaprovider")).toBe("Unknown");
    });

    it("resolves all configured aliases", () => {
      const aliasTests = [
        { alias: "apple", expected: "Apple" },
        { alias: "icloud", expected: "Apple" },
        { alias: "protonmail", expected: "ProtonMail" },
        { alias: "proton", expected: "ProtonMail" },
        { alias: "zoho", expected: "Zoho" },
        { alias: "mailru", expected: "MailRu" },
        { alias: "mail.ru", expected: "MailRu" },
        { alias: "yandex", expected: "MailRu" },
      ];

      aliasTests.forEach(({ alias, expected }) => {
        expect(getProviderByName(alias)).toBe(expected);
      });
    });
  });

  describe("isProviderSupported", () => {
    it("returns true for Google", () => {
      expect(isProviderSupported("Google")).toBe(true);
    });

    it("returns true for Microsoft", () => {
      expect(isProviderSupported("Microsoft")).toBe(true);
    });

    it("returns true for all 8 providers", () => {
      const providers = [
        "Google",
        "Microsoft",
        "Yahoo",
        "MailRu",
        "Apple",
        "ProtonMail",
        "Zoho",
        "AOL",
      ];

      providers.forEach((provider) => {
        expect(isProviderSupported(provider as any)).toBe(true);
      });
    });

    it("returns false for Unknown", () => {
      expect(isProviderSupported("Unknown")).toBe(false);
    });
  });

  describe("getAllProviders", () => {
    it("returns all 8 providers", () => {
      const providers = getAllProviders();
      const keys = Object.keys(providers);

      expect(keys).toHaveLength(8);
      expect(keys).toContain("Google");
      expect(keys).toContain("Microsoft");
      expect(keys).toContain("Yahoo");
      expect(keys).toContain("AOL");
      expect(keys).toContain("MailRu");
      expect(keys).toContain("Apple");
      expect(keys).toContain("ProtonMail");
      expect(keys).toContain("Zoho");
    });

    it("returns valid configs for all providers", () => {
      const providers = getAllProviders();

      Object.values(providers).forEach((config) => {
        expect(config).toHaveProperty("provider");
        expect(config).toHaveProperty("authorizationEndpoint");
        expect(config).toHaveProperty("tokenEndpoint");
        expect(config).toHaveProperty("defaultScope");
        expect(config).toHaveProperty("contentType");
      });
    });
  });

  describe("getProvidersVersion", () => {
    it("returns version string", () => {
      const version = getProvidersVersion();
      expect(version).toBeDefined();
      expect(typeof version).toBe("string");
    });

    it("version matches semantic versioning format", () => {
      const version = getProvidersVersion();
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it("version is 1.0.0", () => {
      const version = getProvidersVersion();
      expect(version).toBe("1.0.0");
    });
  });

  describe("getProviderCustomHeaders", () => {
    it("returns empty object for Google", () => {
      const headers = getProviderCustomHeaders("Google");
      expect(headers).toEqual({});
    });

    it("returns empty object for Microsoft", () => {
      const headers = getProviderCustomHeaders("Microsoft");
      expect(headers).toEqual({});
    });

    it("returns empty object for all providers", () => {
      const providers = [
        "Google",
        "Microsoft",
        "Yahoo",
        "MailRu",
        "Apple",
        "ProtonMail",
        "Zoho",
        "AOL",
      ];

      providers.forEach((provider) => {
        const headers = getProviderCustomHeaders(provider as any);
        expect(headers).toEqual({});
      });
    });

    it("returns empty object for Unknown provider", () => {
      const headers = getProviderCustomHeaders("Unknown");
      expect(headers).toEqual({});
    });
  });

  describe("caching behavior", () => {
    it("caches provider configurations", () => {
      const config1 = getProviderConfig("Google");
      const config2 = getProviderConfig("Google");

      // Same object reference (cached)
      expect(config1).toBe(config2);
    });

    it("caches all providers", () => {
      const providers1 = getAllProviders();
      const providers2 = getAllProviders();

      // Same object reference (cached)
      expect(providers1).toBe(providers2);
    });
  });
});
