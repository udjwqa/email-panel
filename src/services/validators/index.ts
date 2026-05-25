import { EmailStatus } from "@prisma/client";
import { validateFormat } from "./format.js";
import { checkDomainExists } from "./domain.js";
import { checkMxRecords } from "./mx.js";
import { getDomainGroup } from "../domain-groups.js";

export interface ValidationResult {
  status: EmailStatus;
  domainGroup: string;
  mxFound: boolean;
  errorReason: string | null;
}

export interface DnsCache {
  domain: Map<string, boolean>;
  mx: Map<string, boolean>;
}

export function createDnsCache(): DnsCache {
  return { domain: new Map(), mx: new Map() };
}

export async function validateEmail(
  email: string,
  domain: string,
  cache: DnsCache,
): Promise<ValidationResult> {
  const group = getDomainGroup(domain);

  const formatCheck = validateFormat(email);
  if (!formatCheck.valid) {
    return {
      status: "INVALID_FORMAT",
      domainGroup: group,
      mxFound: false,
      errorReason: formatCheck.reason ?? "Invalid format",
    };
  }

  const domainExists = await checkDomainExists(domain, cache.domain);
  if (!domainExists) {
    return {
      status: "DOMAIN_NOT_FOUND",
      domainGroup: group,
      mxFound: false,
      errorReason: `Domain ${domain} does not resolve`,
    };
  }

  const mxFound = await checkMxRecords(domain, cache.mx);
  if (!mxFound) {
    return {
      status: "MX_NOT_FOUND",
      domainGroup: group,
      mxFound: false,
      errorReason: `No MX records for ${domain}`,
    };
  }

  return {
    status: "MX_FOUND",
    domainGroup: group,
    mxFound: true,
    errorReason: null,
  };
}
