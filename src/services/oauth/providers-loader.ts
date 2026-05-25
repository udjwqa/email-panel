import type { OAuthProvider, OAuthEndpointConfig } from "./types.js";
import type {
  ProvidersConfigJSON,
  OAuthProviderConfigJSON,
} from "./types-json.js";

// Load providers.json (works with resolveJsonModule in tsconfig)
import * as providersJSONModule from "./providers.json";

function loadProvidersJSON(): ProvidersConfigJSON {
  return providersJSONModule as unknown as ProvidersConfigJSON;
}

/**
 * Cached provider configurations
 * Loaded once at startup for performance
 */
let cachedProviders: Map<OAuthProvider, OAuthEndpointConfig> | null = null;
let cachedAliasMap: Map<string, OAuthProvider> | null = null;
let cachedAllProviders: Record<
  Exclude<OAuthProvider, "Unknown">,
  OAuthEndpointConfig
> | null = null;

/**
 * Load and parse providers.json
 * Converts JSON format to runtime OAuthEndpointConfig format
 */
function loadProviders(): {
  providers: Map<OAuthProvider, OAuthEndpointConfig>;
  aliases: Map<string, OAuthProvider>;
} {
  if (cachedProviders && cachedAliasMap) {
    return {
      providers: cachedProviders,
      aliases: cachedAliasMap,
    };
  }

  const config = loadProvidersJSON();
  const providers = new Map<OAuthProvider, OAuthEndpointConfig>();
  const aliases = new Map<string, OAuthProvider>();

  // Validate version (basic check)
  if (!config.version || !config.providers) {
    throw new Error("Invalid providers.json: missing version or providers");
  }

  // Convert JSON format to OAuthEndpointConfig format
  for (const [providerName, providerConfig] of Object.entries(
    config.providers,
  )) {
    const provider = providerName as OAuthProvider;

    // Build OAuthEndpointConfig
    const endpointConfig: OAuthEndpointConfig = {
      provider,
      authorizationEndpoint: providerConfig.endpoints.authorization.url,
      tokenEndpoint: providerConfig.endpoints.token.url,
      defaultScope: providerConfig.defaultScope,
      contentType: providerConfig.contentType,
      requiredParams: providerConfig.requiredParams,
      optionalParams: providerConfig.optionalParams,
    };

    providers.set(provider, endpointConfig);

    // Build alias map
    for (const alias of providerConfig.aliases) {
      aliases.set(alias.toLowerCase(), provider);
    }
  }

  // Cache for future calls
  cachedProviders = providers;
  cachedAliasMap = aliases;

  return { providers, aliases };
}

/**
 * Get provider configuration by provider name
 */
export function getProviderConfig(
  provider: OAuthProvider,
): OAuthEndpointConfig | null {
  if (provider === "Unknown") {
    return null;
  }

  const { providers } = loadProviders();
  return providers.get(provider) || null;
}

/**
 * Get provider by name or alias (case-insensitive)
 */
export function getProviderByName(name: string): OAuthProvider {
  const normalized = name.toLowerCase();
  const { aliases } = loadProviders();
  return aliases.get(normalized) || "Unknown";
}

/**
 * Check if provider is supported
 */
export function isProviderSupported(provider: OAuthProvider): boolean {
  if (provider === "Unknown") {
    return false;
  }

  const { providers } = loadProviders();
  return providers.has(provider);
}

/**
 * Get all provider configurations (for testing/debugging)
 */
export function getAllProviders(): Record<
  Exclude<OAuthProvider, "Unknown">,
  OAuthEndpointConfig
> {
  if (cachedAllProviders) {
    return cachedAllProviders;
  }

  const { providers } = loadProviders();
  const result: Record<string, OAuthEndpointConfig> = {};

  for (const [provider, config] of providers.entries()) {
    result[provider] = config;
  }

  const typedResult = result as Record<
    Exclude<OAuthProvider, "Unknown">,
    OAuthEndpointConfig
  >;

  cachedAllProviders = typedResult;
  return typedResult;
}

/**
 * Get provider configuration version
 */
export function getProvidersVersion(): string {
  const config = loadProvidersJSON();
  return config.version;
}

/**
 * Get custom headers for provider (new functionality)
 */
export function getProviderCustomHeaders(
  provider: OAuthProvider,
): Record<string, string> {
  if (provider === "Unknown") {
    return {};
  }

  const config = loadProvidersJSON();
  const providerConfig = config.providers[provider];
  return providerConfig?.customHeaders || {};
}
