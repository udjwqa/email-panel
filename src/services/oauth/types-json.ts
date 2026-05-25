/**
 * JSON-based provider configuration types
 * These match the providers.json structure
 */

/**
 * OAuth endpoint configuration (authorization or token)
 */
export interface ProviderEndpoint {
  /** Endpoint URL */
  url: string;
  /** HTTP method */
  method: "GET" | "POST";
}

/**
 * OAuth provider endpoints (authorization + token)
 */
export interface ProviderEndpoints {
  /** Authorization endpoint */
  authorization: ProviderEndpoint;
  /** Token endpoint */
  token: ProviderEndpoint;
}

/**
 * OAuth provider configuration from JSON
 */
export interface OAuthProviderConfigJSON {
  /** Provider name */
  provider: string;
  /** Provider name aliases for lookup */
  aliases: string[];
  /** OAuth endpoints */
  endpoints: ProviderEndpoints;
  /** Default OAuth scopes */
  defaultScope: string[];
  /** Request content type */
  contentType: "application/json" | "application/x-www-form-urlencoded";
  /** Required OAuth parameters */
  requiredParams?: string[];
  /** Optional OAuth parameters */
  optionalParams?: string[];
  /** Custom HTTP headers */
  customHeaders?: Record<string, string>;
}

/**
 * Complete providers configuration from JSON
 */
export interface ProvidersConfigJSON {
  /** Configuration version */
  version: string;
  /** Provider configurations keyed by provider name */
  providers: Record<string, OAuthProviderConfigJSON>;
}
