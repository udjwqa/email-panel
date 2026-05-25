// Functions
export { buildAuthRequest, buildAuthorizationUrl } from "./builder.js";
export { OAuthClient } from "./client.js";
export {
  detectProviderFromEmail,
  extractDomain,
  isOAuthSupported,
  emailSupportsOAuth,
} from "./provider-detector.js";
export { saveOAuthResult } from "./aggregator.js";
export {
  getProviderConfig,
  getProviderByName,
  isProviderSupported,
  getProvidersVersion,
  getProviderCustomHeaders,
} from "./providers.js";
export {
  formatRequestData,
  formatAsFormUrlEncoded,
  buildOAuthHeaders,
} from "./formatters.js";

// Types
export type {
  OAuthProvider,
  OAuthContentType,
  OAuthGrantType,
  OAuthRequest,
  OAuthResponse,
  OAuthAuthResult,
  OAuthRequestParams,
  OAuthEndpointConfig,
  OAuthSuccessResponse,
  OAuthErrorResponse,
} from "./types.js";

// JSON types
export type {
  ProviderEndpoint,
  ProviderEndpoints,
  OAuthProviderConfigJSON,
  ProvidersConfigJSON,
} from "./types-json.js";

// Constants
export { OAUTH_PROVIDERS } from "./providers.js";
export { MockOAuthServer } from "./mock-server.js";
