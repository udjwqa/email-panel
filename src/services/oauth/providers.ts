/**
 * OAuth provider configurations (JSON-based)
 *
 * IMPORTANT: These are mock OAuth endpoints for testing architecture.
 * For production use, you need to:
 * 1. Register your application with each provider
 * 2. Obtain client_id and client_secret
 * 3. Configure redirect_uri
 * 4. Update endpoints if needed
 *
 * Configurations are now stored in providers.json for easy updates.
 */

// Re-export everything from providers-loader.ts
export {
  getProviderConfig,
  getProviderByName,
  isProviderSupported,
  getAllProviders,
  getProvidersVersion,
  getProviderCustomHeaders,
} from "./providers-loader.js";

// Backward compatibility export
import { getAllProviders } from "./providers-loader.js";

/**
 * OAuth provider configurations
 * @deprecated Use getAllProviders() from providers-loader.ts or import from providers.json
 */
export const OAUTH_PROVIDERS = getAllProviders();
