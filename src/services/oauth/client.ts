import { HttpClient } from "../http/client.js";
import type { ProxyEntry } from "../proxy/types.js";
import type {
  OAuthProvider,
  OAuthRequestParams,
  OAuthResponse,
  OAuthAuthResult,
} from "./types.js";
import { buildAuthRequest } from "./builder.js";

/**
 * OAuth Client for authentication
 */
export class OAuthClient {
  private httpClient: HttpClient;

  constructor(httpClient?: HttpClient) {
    this.httpClient =
      httpClient ??
      new HttpClient({
        retryConfig: {
          enabled: true,
          maxRetries: 5,
          baseDelay: 1000,
          jitterFactor: 0.25,
        },
      });
  }

  /**
   * Authenticate user with OAuth provider
   *
   * @param provider - OAuth provider (null for auto-detect)
   * @param email - User email
   * @param password - User password
   * @param options - OAuth request options
   * @param proxy - Optional proxy configuration
   * @returns Authentication result
   */
  async authenticate(
    provider: OAuthProvider | string | null,
    email: string,
    password: string,
    options: Partial<OAuthRequestParams> = {},
    proxy?: ProxyEntry,
  ): Promise<OAuthAuthResult> {
    const startTime = Date.now();

    try {
      // Build OAuth request
      const request = buildAuthRequest(provider, email, password, options);

      // Send HTTP request
      const response = await this.httpClient.post(
        request.url,
        request.data,
        {
          headers: request.headers,
          proxy,
        },
      );

      // Parse OAuth response
      const oauthResponse = this.parseOAuthResponse(response.data);

      return {
        provider: request.provider,
        email,
        success: oauthResponse.success,
        response: oauthResponse,
        responseTime: Date.now() - startTime,
        endpoint: request.url,
        retryMetadata: response.retryMetadata,
      };
    } catch (error) {
      return {
        provider: "Unknown",
        email,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Parse OAuth provider response
   */
  private parseOAuthResponse(data: any): OAuthResponse {
    // Success response
    if (data.access_token) {
      return {
        success: true,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
        tokenType: data.token_type ?? "Bearer",
        scope: data.scope,
      };
    }

    // Error response
    return {
      success: false,
      errorCode: data.error,
      errorDescription: data.error_description,
      errorUri: data.error_uri,
    };
  }
}
