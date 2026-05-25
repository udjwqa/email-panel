import type { OAuthResponse } from "./types.js";

/**
 * Mock OAuth server for testing
 */
export class MockOAuthServer {
  /**
   * Success response with access token
   * Returns raw OAuth response format (for mocking HTTP responses)
   */
  static successResponse(): any {
    return {
      access_token: `mock_access_token_${Date.now()}`,
      refresh_token: `mock_refresh_token_${Date.now()}`,
      expires_in: 3600,
      token_type: "Bearer",
      scope: "email profile",
    };
  }

  /**
   * Invalid grant error (wrong credentials)
   * Returns raw OAuth error response format
   */
  static invalidGrantResponse(): any {
    return {
      error: "invalid_grant",
      error_description: "Invalid username or password",
    };
  }

  /**
   * Invalid client error (wrong client_id)
   * Returns raw OAuth error response format
   */
  static invalidClientResponse(): any {
    return {
      error: "invalid_client",
      error_description: "Client authentication failed",
    };
  }

  /**
   * Rate limit exceeded error
   * Returns raw OAuth error response format
   */
  static rateLimitResponse(): any {
    return {
      error: "rate_limit_exceeded",
      error_description: "Too many requests",
    };
  }

  /**
   * Access denied error
   * Returns raw OAuth error response format
   */
  static accessDeniedResponse(): any {
    return {
      error: "access_denied",
      error_description: "User denied authorization",
    };
  }
}
