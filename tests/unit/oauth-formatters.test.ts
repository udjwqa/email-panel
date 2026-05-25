import { describe, it, expect } from "vitest";
import {
  formatRequestData,
  formatAsFormUrlEncoded,
  buildOAuthHeaders,
} from "../../src/services/oauth/formatters.js";

describe("formatRequestData", () => {
  it("formats as JSON when content-type is application/json", () => {
    const params = { username: "test", password: "pass" };
    const result = formatRequestData(params, "application/json");

    expect(typeof result).toBe("object");
    expect(result).toEqual({ username: "test", password: "pass" });
  });

  it("formats as form-urlencoded when content-type is application/x-www-form-urlencoded", () => {
    const params = { username: "test", password: "pass" };
    const result = formatRequestData(
      params,
      "application/x-www-form-urlencoded",
    );

    expect(typeof result).toBe("string");
    expect(result).toContain("username=test");
    expect(result).toContain("password=pass");
  });
});

describe("formatAsFormUrlEncoded", () => {
  it("formats simple parameters", () => {
    const params = { username: "test", password: "pass123" };
    const result = formatAsFormUrlEncoded(params);

    expect(result).toContain("username=test");
    expect(result).toContain("password=pass123");
  });

  it("joins array values with spaces", () => {
    const params = { scope: ["email", "profile", "openid"] };
    const result = formatAsFormUrlEncoded(params);

    expect(result).toBe("scope=email+profile+openid");
  });

  it("skips null values", () => {
    const params = { username: "test", password: null };
    const result = formatAsFormUrlEncoded(params);

    expect(result).toBe("username=test");
    expect(result).not.toContain("password");
  });

  it("skips undefined values", () => {
    const params = { username: "test", password: undefined };
    const result = formatAsFormUrlEncoded(params);

    expect(result).toBe("username=test");
  });

  it("encodes special characters", () => {
    const params = { username: "test@example.com", state: "abc+def" };
    const result = formatAsFormUrlEncoded(params);

    expect(result).toContain("username=test%40example.com");
    expect(result).toContain("state=abc%2Bdef");
  });

  it("handles empty object", () => {
    const result = formatAsFormUrlEncoded({});

    expect(result).toBe("");
  });
});

describe("buildOAuthHeaders", () => {
  it("builds headers for JSON content-type", () => {
    const headers = buildOAuthHeaders("application/json");

    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers.Accept).toBe("application/json");
  });

  it("builds headers for form-urlencoded content-type", () => {
    const headers = buildOAuthHeaders(
      "application/x-www-form-urlencoded",
    );

    expect(headers["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    );
    expect(headers.Accept).toBe("application/json");
  });

  it("merges additional headers", () => {
    const headers = buildOAuthHeaders("application/json", {
      Authorization: "Bearer token",
      "X-Custom": "value",
    });

    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers.Authorization).toBe("Bearer token");
    expect(headers["X-Custom"]).toBe("value");
  });
});
