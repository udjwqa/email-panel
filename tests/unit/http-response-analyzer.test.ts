import { describe, it, expect } from "vitest";
import { analyzeHttpResponse } from "../../src/utils/http-response-analyzer/analyzer.js";

describe("analyzeHttpResponse", () => {
  describe("auth_success classification", () => {
    it("classifies 200 + access_token as auth_success", () => {
      const analysis = analyzeHttpResponse(200, {}, { access_token: "token123" });

      expect(analysis.classification).toBe("auth_success");
      expect(analysis.reason.source).toBe("status_code");
      expect(analysis.reason.confidence).toBe(100);
    });

    it("classifies 201 + accessToken as auth_success", () => {
      const analysis = analyzeHttpResponse(201, {}, { accessToken: "token456" });

      expect(analysis.classification).toBe("auth_success");
      expect(analysis.reason.source).toBe("status_code");
    });

    it("does not classify 200 without token as success", () => {
      const analysis = analyzeHttpResponse(200, {}, {});

      expect(analysis.classification).not.toBe("auth_success");
    });
  });

  describe("invalid_credentials classification", () => {
    it("classifies 401 status as invalid_credentials", () => {
      const analysis = analyzeHttpResponse(401, {}, {});

      expect(analysis.classification).toBe("invalid_credentials");
      expect(analysis.reason.source).toBe("status_code");
      expect(analysis.reason.value).toBe("401");
    });

    it("classifies 403 status as invalid_credentials", () => {
      const analysis = analyzeHttpResponse(403, {}, {});

      expect(analysis.classification).toBe("invalid_credentials");
    });

    it("classifies JSON error invalid_grant", () => {
      const analysis = analyzeHttpResponse(400, {}, {
        error: "invalid_grant",
        error_description: "Wrong password",
      });

      expect(analysis.classification).toBe("invalid_credentials");
      expect(analysis.reason.source).toBe("json_error");
      expect(analysis.reason.value).toBe("invalid_grant");
      expect(analysis.errorMessage).toBe("Wrong password");
    });

    it("classifies JSON error invalid_client", () => {
      const analysis = analyzeHttpResponse(400, {}, {
        error: "invalid_client",
      });

      expect(analysis.classification).toBe("invalid_credentials");
      expect(analysis.reason.source).toBe("json_error");
    });

    it("classifies body keyword authentication failed", () => {
      const analysis = analyzeHttpResponse(500, {}, {
        message: "Authentication failed",
      });

      expect(analysis.classification).toBe("invalid_credentials");
      expect(analysis.reason.source).toBe("body_keyword");
    });
  });

  describe("rate_limited classification", () => {
    it("classifies 429 status as rate_limited", () => {
      const analysis = analyzeHttpResponse(429, {}, {});

      expect(analysis.classification).toBe("rate_limited");
      expect(analysis.reason.source).toBe("status_code");
      expect(analysis.reason.value).toBe("429");
    });

    it("classifies JSON error rate_limit_exceeded", () => {
      const analysis = analyzeHttpResponse(400, {}, {
        error: "rate_limit_exceeded",
      });

      expect(analysis.classification).toBe("rate_limited");
      expect(analysis.reason.source).toBe("json_error");
    });

    it("extracts rate limit info from headers", () => {
      const analysis = analyzeHttpResponse(
        429,
        {
          "X-RateLimit-Limit": "100",
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": "1640000000",
          "Retry-After": "60",
        },
        {},
      );

      expect(analysis.rateLimit?.detected).toBe(true);
      expect(analysis.rateLimit?.limit).toBe(100);
      expect(analysis.rateLimit?.remaining).toBe(0);
      expect(analysis.rateLimit?.resetAt).toBe(1640000000);
      expect(analysis.rateLimit?.retryAfter).toBe(60);
    });

    it("detects rate limit from headers", () => {
      const analysis = analyzeHttpResponse(
        500,
        { "X-RateLimit-Remaining": "0" },
        {},
      );

      expect(analysis.classification).toBe("rate_limited");
      expect(analysis.reason.source).toBe("header");
    });

    it("classifies body keyword rate limit", () => {
      const analysis = analyzeHttpResponse(500, {}, {
        message: "Rate limit exceeded",
      });

      expect(analysis.classification).toBe("rate_limited");
      expect(analysis.reason.source).toBe("body_keyword");
    });
  });

  describe("captcha_required classification", () => {
    it("classifies JSON error captcha_required", () => {
      const analysis = analyzeHttpResponse(400, {}, {
        error: "captcha_required",
      });

      expect(analysis.classification).toBe("captcha_required");
      expect(analysis.reason.source).toBe("json_error");
    });

    it("classifies body keyword captcha", () => {
      const analysis = analyzeHttpResponse(500, {}, {
        message: "Please solve the CAPTCHA",
      });

      expect(analysis.classification).toBe("captcha_required");
      expect(analysis.reason.source).toBe("body_keyword");
    });

    it("classifies body keyword recaptcha", () => {
      const analysis = analyzeHttpResponse(500, {}, {
        error_description: "reCAPTCHA verification required",
      });

      expect(analysis.classification).toBe("captcha_required");
    });
  });

  describe("account_locked classification", () => {
    it("classifies 423 status as account_locked", () => {
      const analysis = analyzeHttpResponse(423, {}, {});

      expect(analysis.classification).toBe("account_locked");
      expect(analysis.reason.source).toBe("status_code");
      expect(analysis.reason.value).toBe("423");
    });

    it("classifies JSON error account_locked", () => {
      const analysis = analyzeHttpResponse(400, {}, {
        error: "account_locked",
      });

      expect(analysis.classification).toBe("account_locked");
      expect(analysis.reason.source).toBe("json_error");
    });

    it("classifies JSON error account_suspended", () => {
      const analysis = analyzeHttpResponse(400, {}, {
        error: "account_suspended",
      });

      expect(analysis.classification).toBe("account_locked");
    });

    it("classifies body keyword account suspended", () => {
      const analysis = analyzeHttpResponse(500, {}, {
        message: "Your account has been suspended",
      });

      expect(analysis.classification).toBe("account_locked");
      expect(analysis.reason.source).toBe("body_keyword");
    });
  });

  describe("2fa_required classification", () => {
    it("classifies JSON error mfa_required", () => {
      const analysis = analyzeHttpResponse(400, {}, {
        error: "mfa_required",
      });

      expect(analysis.classification).toBe("2fa_required");
      expect(analysis.reason.source).toBe("json_error");
    });

    it("classifies JSON error 2fa_required", () => {
      const analysis = analyzeHttpResponse(400, {}, {
        error: "2fa_required",
      });

      expect(analysis.classification).toBe("2fa_required");
    });

    it("classifies body keyword two factor", () => {
      const analysis = analyzeHttpResponse(500, {}, {
        message: "Two-factor authentication required",
      });

      expect(analysis.classification).toBe("2fa_required");
      expect(analysis.reason.source).toBe("body_keyword");
    });

    it("classifies body keyword verification code", () => {
      const analysis = analyzeHttpResponse(500, {}, {
        error_description: "Please enter verification code",
      });

      expect(analysis.classification).toBe("2fa_required");
    });
  });

  describe("priority testing", () => {
    it("prioritizes JSON error over status code", () => {
      const analysis = analyzeHttpResponse(
        401,
        {},
        { error: "rate_limit_exceeded" },
      );

      expect(analysis.classification).toBe("rate_limited");
      expect(analysis.reason.source).toBe("json_error");
    });

    it("prioritizes status code over headers", () => {
      const analysis = analyzeHttpResponse(
        401,
        { "X-RateLimit-Remaining": "0" },
        {},
      );

      expect(analysis.classification).toBe("invalid_credentials");
      expect(analysis.reason.source).toBe("status_code");
    });

    it("prioritizes headers over keywords", () => {
      const analysis = analyzeHttpResponse(
        500,
        { "X-RateLimit-Remaining": "0" },
        { message: "Authentication failed" },
      );

      expect(analysis.classification).toBe("rate_limited");
      expect(analysis.reason.source).toBe("header");
    });
  });

  describe("edge cases", () => {
    it("handles empty body", () => {
      const analysis = analyzeHttpResponse(401, {}, {});

      expect(analysis.classification).toBe("invalid_credentials");
    });

    it("handles null body", () => {
      const analysis = analyzeHttpResponse(403, {}, null);

      expect(analysis.classification).toBe("invalid_credentials");
    });

    it("handles missing headers", () => {
      const analysis = analyzeHttpResponse(429, {}, {});

      expect(analysis.classification).toBe("rate_limited");
    });

    it("uses fallback for unknown status", () => {
      const analysis = analyzeHttpResponse(500, {}, {});

      expect(analysis.classification).toBe("invalid_credentials");
      expect(analysis.reason.confidence).toBe(50);
    });
  });
});
