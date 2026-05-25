/**
 * OAuth 2.0 type definitions
 */

import type { RetryMetadata } from "../http/types.js";

/**
 * Supported OAuth providers
 */
export type OAuthProvider =
  | "Google"
  | "Microsoft"
  | "Yahoo"
  | "MailRu"
  | "Apple"
  | "ProtonMail"
  | "Zoho"
  | "AOL"
  | "Unknown";

/**
 * Content types for OAuth requests
 */
export type OAuthContentType =
  | "application/json"
  | "application/x-www-form-urlencoded";

/**
 * OAuth 2.0 grant types
 */
export type OAuthGrantType =
  | "authorization_code"
  | "password"
  | "refresh_token"
  | "client_credentials";

/**
 * OAuth provider endpoint configuration
 */
export interface OAuthEndpointConfig {
  /** Provider name */
  provider: OAuthProvider;
  /** Authorization endpoint URL */
  authorizationEndpoint: string;
  /** Token endpoint URL */
  tokenEndpoint: string;
  /** Default OAuth scopes */
  defaultScope: string[];
  /** Content type for requests */
  contentType: OAuthContentType;
  /** Required parameters for this provider */
  requiredParams?: string[];
  /** Optional parameters for this provider */
  optionalParams?: string[];
}

/**
 * Parameters for building OAuth request
 */
export interface OAuthRequestParams {
  /** OAuth grant type */
  grantType?: OAuthGrantType;
  /** Client ID */
  clientId?: string;
  /** Client secret */
  clientSecret?: string;
  /** OAuth scopes */
  scope?: string[];
  /** State parameter for CSRF protection */
  state?: string;
  /** Nonce parameter */
  nonce?: string;
  /** Redirect URI */
  redirectUri?: string;
  /** Authorization code (for authorization_code grant) */
  code?: string;
  /** Refresh token (for refresh_token grant) */
  refreshToken?: string;
  /** Additional custom parameters */
  additionalParams?: Record<string, string>;
}

/**
 * Built OAuth request ready to send
 */
export interface OAuthRequest {
  /** Provider name */
  provider: OAuthProvider;
  /** Endpoint type (authorization or token) */
  endpoint: "authorization" | "token";
  /** Request URL */
  url: string;
  /** HTTP method */
  method: "GET" | "POST";
  /** Request headers */
  headers: Record<string, string>;
  /** Request data (form-encoded string or JSON object) */
  data?: string | Record<string, any>;
  /** Query parameters (for GET requests) */
  query?: Record<string, string>;
}

/**
 * OAuth provider response (success)
 */
export interface OAuthSuccessResponse {
  /** Success flag */
  success: true;
  /** Access token */
  accessToken: string;
  /** Refresh token (optional) */
  refreshToken?: string;
  /** Token expiration in seconds */
  expiresIn?: number;
  /** Token type (usually "Bearer") */
  tokenType?: string;
  /** Scope granted */
  scope?: string;
}

/**
 * OAuth provider response (error)
 */
export interface OAuthErrorResponse {
  /** Success flag */
  success: false;
  /** Error code */
  errorCode?: string;
  /** Error description */
  errorDescription?: string;
  /** Error URI with more info */
  errorUri?: string;
}

/**
 * OAuth provider response (union type)
 */
export type OAuthResponse = OAuthSuccessResponse | OAuthErrorResponse;

/**
 * OAuth authentication result
 */
export interface OAuthAuthResult {
  /** Provider name */
  provider: OAuthProvider;
  /** User email */
  email: string;
  /** Success flag */
  success: boolean;
  /** OAuth response */
  response?: OAuthResponse;
  /** Error message (if failed) */
  error?: string;
  /** Response time in milliseconds */
  responseTime: number;
  /** Endpoint URL used */
  endpoint?: string;
  /** Retry metadata (if retries were made) */
  retryMetadata?: RetryMetadata;
}

/**
 * Re-export JSON types for external use
 */
export type {
  ProviderEndpoint,
  ProviderEndpoints,
  OAuthProviderConfigJSON,
  ProvidersConfigJSON,
} from "./types-json.js";
