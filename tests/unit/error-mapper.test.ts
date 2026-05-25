import { describe, it, expect } from "vitest";
import { mapErrorTypeToAuthStatus } from "../../src/utils/error-mapper.js";

describe("mapErrorTypeToAuthStatus", () => {
  it("maps success to success status", () => {
    expect(mapErrorTypeToAuthStatus(true, null)).toBe("success");
  });

  it("maps auth_failed correctly", () => {
    expect(mapErrorTypeToAuthStatus(false, "auth_failed")).toBe("auth_failed");
  });

  it("maps connection_error correctly", () => {
    expect(mapErrorTypeToAuthStatus(false, "connection_error")).toBe(
      "connection_error",
    );
  });

  it("maps timeout correctly", () => {
    expect(mapErrorTypeToAuthStatus(false, "timeout")).toBe("timeout");
  });

  it("maps 2fa_required correctly", () => {
    expect(mapErrorTypeToAuthStatus(false, "2fa_required")).toBe(
      "2fa_required",
    );
  });

  it("maps additional_verification_required to captcha_required", () => {
    expect(
      mapErrorTypeToAuthStatus(false, "additional_verification_required"),
    ).toBe("captcha_required");
  });

  it("maps unknown error types to auth_failed", () => {
    expect(mapErrorTypeToAuthStatus(false, "unknown_error")).toBe(
      "auth_failed",
    );
  });

  it("maps null error type to auth_failed", () => {
    expect(mapErrorTypeToAuthStatus(false, null)).toBe("auth_failed");
  });
});
