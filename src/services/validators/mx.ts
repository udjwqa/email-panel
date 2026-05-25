import dns from "node:dns/promises";

export async function checkMxRecords(
  domain: string,
  cache: Map<string, boolean>,
): Promise<boolean> {
  const cached = cache.get(domain);
  if (cached !== undefined) return cached;

  try {
    const records = await dns.resolveMx(domain);
    const hasMx = records.length > 0;
    cache.set(domain, hasMx);
    return hasMx;
  } catch {
    cache.set(domain, false);
    return false;
  }
}
