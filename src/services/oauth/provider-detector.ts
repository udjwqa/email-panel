import { getDomainGroup } from "../domain-groups.js";
import { validateFormat } from "../validators/format.js";
import type { OAuthProvider } from "./types.js";

/**
 * Map domain groups to OAuth providers
 */
const DOMAIN_GROUP_TO_OAUTH: Record<string, OAuthProvider> = {
  Google: "Google",
  Microsoft: "Microsoft",
  Yahoo: "Yahoo",
  Asian: "MailRu", // mail.ru, yandex.ru, yandex.com
  Apple: "Apple",
  European: "ProtonMail", // Default for European providers
  // Note: Some European providers like GMX, Web.de don't have OAuth
  // but we map to ProtonMail as default
};

/**
 * Detect OAuth provider from email address
 *
 * @param email - Email address to analyze
 * @returns Detected OAuth provider or "Unknown"
 *
 * @example
 * detectProviderFromEmail("user@gmail.com") // Returns "Google"
 * detectProviderFromEmail("test@outlook.com") // Returns "Microsoft"
 */
export function detectProviderFromEmail(email: string): OAuthProvider {
  const domain = extractDomain(email);
  if (!domain) return "Unknown";

  // Special case handling for specific domains
  if (domain === "protonmail.com" || domain === "proton.me") {
    return "ProtonMail";
  }
  if (domain === "zoho.com") {
    return "Zoho";
  }
  if (domain === "aol.com") {
    return "AOL";
  }

  // Use domain group mapping
  const domainGroup = getDomainGroup(domain);
  return mapDomainGroupToOAuthProvider(domainGroup);
}

/**
 * Extract domain from email address
 *
 * @param email - Email address
 * @returns Domain part or null if invalid
 *
 * @example
 * extractDomain("user@gmail.com") // Returns "gmail.com"
 * extractDomain("invalid-email") // Returns null
 */
export function extractDomain(email: string): string | null {
  const validation = validateFormat(email);
  if (!validation.valid) {
    return null;
  }

  const parts = email.split("@");
  if (parts.length !== 2) {
    return null;
  }

  return parts[1].toLowerCase();
}

/**
 * Map domain group to OAuth provider
 */
function mapDomainGroupToOAuthProvider(domainGroup: string): OAuthProvider {
  return DOMAIN_GROUP_TO_OAUTH[domainGroup] || "Unknown";
}

/**
 * Check if OAuth is supported for provider
 *
 * @param provider - OAuth provider
 * @returns True if OAuth is supported
 */
export function isOAuthSupported(provider: OAuthProvider): boolean {
  return provider !== "Unknown";
}

/**
 * Check if email provider supports OAuth
 *
 * @param email - Email address
 * @returns True if provider supports OAuth
 */
export function emailSupportsOAuth(email: string): boolean {
  const provider = detectProviderFromEmail(email);
  return isOAuthSupported(provider);
}
