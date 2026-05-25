import { describe, it, expect } from "vitest";
import {
  buildAuthRequest,
  buildAuthorizationUrl,
} from "../../src/services/oauth/builder.js";

describe("buildAuthRequest", () => {
  it("auto-detects Google provider from gmail.com", () => {
    const request = buildAuthRequest(null, "user@gmail.com", "password123");

    expect(request.provider).toBe("Google");
    expect(request.url).toContain("googleapis.com");
    expect(request.method).toBe("POST");
    expect(request.headers["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    );
  });

  it("auto-detects Microsoft provider from outlook.com", () => {
    const request = buildAuthRequest(null, "user@outlook.com", "pass");

    expect(request.provider).toBe("Microsoft");
    expect(request.url).toContain("microsoftonline.com");
  });

  it("accepts explicit provider name", () => {
    const request = buildAuthRequest("Yahoo", "user@example.com", "pass");

    expect(request.provider).toBe("Yahoo");
    expect(request.url).toContain("yahoo.com");
  });

  it("formats data as form-urlencoded for Google", () => {
    const request = buildAuthRequest("Google", "test@gmail.com", "pass");

    expect(typeof request.data).toBe("string");
    expect(request.data).toContain("grant_type=password");
    expect(request.data).toContain("username=test%40gmail.com"); // @ is URL-encoded as %40
    expect(request.data).toContain("password=pass");
  });

  it("formats data as JSON for MailRu", () => {
    const request = buildAuthRequest("MailRu", "test@mail.ru", "pass");

    expect(request.headers["Content-Type"]).toBe("application/json");
    expect(typeof request.data).toBe("object");
    expect(request.data).toHaveProperty("grant_type", "password");
  });

  it("includes scope in request", () => {
    const request = buildAuthRequest("Google", "test@gmail.com", "pass", {
      scope: ["email", "profile"],
    });

    if (typeof request.data === "string") {
      expect(request.data).toContain("scope=email+profile");
    } else {
      expect(request.data.scope).toEqual(["email", "profile"]);
    }
  });

  it("includes client credentials", () => {
    const request = buildAuthRequest("Microsoft", "test@outlook.com", "pass", {
      clientId: "my-client-id",
      clientSecret: "my-secret",
    });

    if (typeof request.data === "string") {
      expect(request.data).toContain("client_id=my-client-id");
      expect(request.data).toContain("client_secret=my-secret");
    }
  });

  it("throws error for invalid email", () => {
    expect(() =>
      buildAuthRequest("Google", "invalid-email", "pass"),
    ).toThrow("Invalid email format");
  });

  it("throws error for unknown provider", () => {
    expect(() =>
      buildAuthRequest(null, "test@unknown-domain.xyz", "pass"),
    ).toThrow("Unable to determine OAuth provider");
  });

  it("accepts state parameter", () => {
    const request = buildAuthRequest("Google", "test@gmail.com", "pass", {
      state: "random-state-123",
    });

    if (typeof request.data === "string") {
      expect(request.data).toContain("state=random-state-123");
    }
  });
});

describe("buildAuthorizationUrl", () => {
  it("builds authorization URL for Google", () => {
    const url = buildAuthorizationUrl("Google", {
      clientId: "my-client",
      redirectUri: "https://myapp.com/callback",
    });

    expect(url).toContain("accounts.google.com");
    expect(url).toContain("client_id=my-client");
    expect(url).toContain("redirect_uri=https%3A%2F%2Fmyapp.com%2Fcallback");
    expect(url).toContain("response_type=code");
  });

  it("includes custom scope", () => {
    const url = buildAuthorizationUrl("Microsoft", {
      clientId: "client",
      redirectUri: "https://app.com/cb",
      scope: ["email", "profile"],
    });

    expect(url).toContain("scope=email+profile");
  });

  it("includes state parameter", () => {
    const url = buildAuthorizationUrl("Yahoo", {
      clientId: "client",
      redirectUri: "https://app.com/cb",
      state: "secure-state",
    });

    expect(url).toContain("state=secure-state");
  });
});
