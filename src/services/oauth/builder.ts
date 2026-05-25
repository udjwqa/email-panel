import { validateFormat } from "../validators/format.js";
import type {
  OAuthProvider,
  OAuthRequest,
  OAuthRequestParams,
  OAuthEndpointConfig,
} from "./types.js";
import {
  getProviderConfig,
  getProviderByName,
  getProviderCustomHeaders,
} from "./providers.js";
import { detectProviderFromEmail } from "./provider-detector.js";
import {
  formatRequestData,
  buildOAuthHeaders,
  formatQueryParams,
} from "./formatters.js";

/**
 * Build OAuth authentication request
 *
 * @param provider - OAuth provider (null for auto-detect, string for name lookup, or OAuthProvider)
 * @param email - User email address
 * @param password - User password
 * @param options - Additional request options
 * @returns Built OAuth request ready to send
 *
 * @throws Error if email is invalid or provider is unknown
 *
 * @example
 * // Auto-detect provider from email
 * const request = buildAuthRequest(null, "user@gmail.com", "password123");
 *
 * @example
 * // Explicit provider with options
 * const request = buildAuthRequest("Google", "user@gmail.com", "pass", {
 *   clientId: "my-client-id",
 *   scope: ["email", "profile"],
 * });
 */
export function buildAuthRequest(
  provider: OAuthProvider | string | null,
  email: string,
  password: string,
  options: Partial<OAuthRequestParams> = {},
): OAuthRequest {
  // Step 1: Validate email
  const validation = validateFormat(email);
  if (!validation.valid) {
    throw new Error(`Invalid email format: ${validation.reason || "unknown"}`);
  }

  // Step 2: Determine provider
  let resolvedProvider: OAuthProvider;

  if (provider === null) {
    // Auto-detect from email
    resolvedProvider = detectProviderFromEmail(email);
  } else if (typeof provider === "string") {
    // Lookup by name
    resolvedProvider = getProviderByName(provider);
  } else {
    // Use as-is
    resolvedProvider = provider;
  }

  if (resolvedProvider === "Unknown") {
    throw new Error(
      `Unable to determine OAuth provider for email: ${email}`,
    );
  }

  // Step 3: Get provider configuration
  const config = getProviderConfig(resolvedProvider);
  if (!config) {
    throw new Error(`No configuration found for provider: ${resolvedProvider}`);
  }

  // Step 4: Build request parameters
  const params = buildRequestParams(email, password, config, options);

  // Step 5: Format data based on content type
  const data = formatRequestData(params, config.contentType);

  // Step 6: Build headers (with custom headers from provider config)
  const customHeaders = getProviderCustomHeaders(resolvedProvider);
  const headers = buildOAuthHeaders(config.contentType, customHeaders);

  // Step 7: Return OAuth request
  return {
    provider: resolvedProvider,
    endpoint: "token",
    url: config.tokenEndpoint,
    method: "POST",
    headers,
    data,
  };
}

/**
 * Build request parameters for OAuth token request
 */
function buildRequestParams(
  email: string,
  password: string,
  config: OAuthEndpointConfig,
  options: Partial<OAuthRequestParams>,
): Record<string, any> {
  const params: Record<string, any> = {
    grant_type: options.grantType ?? "password",
    username: email,
    password: password,
  };

  // Add client credentials if provided
  if (options.clientId) {
    params.client_id = options.clientId;
  }
  if (options.clientSecret) {
    params.client_secret = options.clientSecret;
  }

  // Add scope (from options or default)
  params.scope = options.scope ?? config.defaultScope;

  // Add optional parameters
  if (options.state) {
    params.state = options.state;
  }
  if (options.nonce) {
    params.nonce = options.nonce;
  }
  if (options.redirectUri) {
    params.redirect_uri = options.redirectUri;
  }
  if (options.code) {
    params.code = options.code;
  }
  if (options.refreshToken) {
    params.refresh_token = options.refreshToken;
  }

  // Add custom parameters
  if (options.additionalParams) {
    Object.assign(params, options.additionalParams);
  }

  return params;
}

/**
 * Build OAuth authorization URL (for authorization code flow)
 *
 * @param provider - OAuth provider (string or OAuthProvider)
 * @param options - Authorization options
 * @returns Authorization URL
 *
 * @throws Error if provider is unknown or required params missing
 *
 * @example
 * const url = buildAuthorizationUrl("Google", {
 *   clientId: "my-client-id",
 *   redirectUri: "https://myapp.com/callback",
 *   state: "random-state",
 * });
 */
export function buildAuthorizationUrl(
  provider: OAuthProvider | string,
  options: {
    clientId: string;
    redirectUri: string;
    scope?: string[];
    state?: string;
    nonce?: string;
    responseType?: string;
    additionalParams?: Record<string, string>;
  },
): string {
  // Resolve provider
  const resolvedProvider =
    typeof provider === "string" ? getProviderByName(provider) : provider;

  if (resolvedProvider === "Unknown") {
    throw new Error(`Unknown OAuth provider: ${provider}`);
  }

  // Get configuration
  const config = getProviderConfig(resolvedProvider);
  if (!config) {
    throw new Error(
      `No configuration found for provider: ${resolvedProvider}`,
    );
  }

  // Build query parameters
  const params: Record<string, any> = {
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    response_type: options.responseType ?? "code",
    scope: options.scope ?? config.defaultScope,
  };

  if (options.state) {
    params.state = options.state;
  }
  if (options.nonce) {
    params.nonce = options.nonce;
  }

  // Add custom parameters
  if (options.additionalParams) {
    Object.assign(params, options.additionalParams);
  }

  // Build URL with query parameters
  const queryString = formatQueryParams(params);
  return `${config.authorizationEndpoint}?${queryString}`;
}
