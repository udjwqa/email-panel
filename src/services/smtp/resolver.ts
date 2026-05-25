import dns from "node:dns/promises";
import { MxHost } from "./types.js";

export async function resolveMX(
  domain: string,
  cache?: Map<string, MxHost[]>,
): Promise<MxHost[]> {
  if (cache) {
    const cached = cache.get(domain);
    if (cached !== undefined) return cached;
  }

  let hosts: MxHost[];

  try {
    const records = await dns.resolveMx(domain);
    if (records.length > 0) {
      hosts = records
        .sort((a, b) => a.priority - b.priority)
        .map((r) => ({
          host: r.exchange,
          port: 25,
          priority: r.priority,
          isFallback: false,
        }));
    } else {
      hosts = await fallbackToAddress(domain);
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;

    switch (code) {
      case "ENOTFOUND":
      case "ECONNREFUSED":
        hosts = [];
        break;
      case "ENODATA":
        hosts = await fallbackToAddress(domain);
        break;
      case "SERVFAIL":
        throw new Error(`DNS server failure for ${domain}`);
      case "ETIMEOUT":
        throw new Error(`DNS timeout for ${domain}`);
      default:
        throw err;
    }
  }

  if (cache) {
    cache.set(domain, hosts);
  }

  return hosts;
}

async function fallbackToAddress(domain: string): Promise<MxHost[]> {
  try {
    const ipv4 = await dns.resolve4(domain);
    if (ipv4.length > 0) {
      return ipv4.map((ip, index) => ({
        host: ip,
        port: 25,
        priority: index + 10,
        isFallback: true,
      }));
    }
  } catch {
    // no A records, try AAAA
  }

  try {
    const ipv6 = await dns.resolve6(domain);
    if (ipv6.length > 0) {
      return ipv6.map((ip, index) => ({
        host: ip,
        port: 25,
        priority: index + 20,
        isFallback: true,
      }));
    }
  } catch {
    // no AAAA records either
  }

  return [];
}
