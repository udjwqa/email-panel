import dns from "node:dns/promises";

export async function checkDomainExists(
  domain: string,
  cache: Map<string, boolean>,
): Promise<boolean> {
  const cached = cache.get(domain);
  if (cached !== undefined) return cached;

  try {
    await dns.resolve(domain, "A");
    cache.set(domain, true);
    return true;
  } catch {
    try {
      await dns.resolve(domain, "AAAA");
      cache.set(domain, true);
      return true;
    } catch {
      cache.set(domain, false);
      return false;
    }
  }
}
