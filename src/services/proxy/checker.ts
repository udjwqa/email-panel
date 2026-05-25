import { SocksProxyAgent } from "socks-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import { ProxyEntry, ProxyCheckResult } from "./types.js";

const TEST_URL = "http://httpbin.org/ip";
const TIMEOUT = 10_000;
const SLOW_THRESHOLD = 5_000;

export async function checkProxy(entry: ProxyEntry): Promise<ProxyCheckResult> {
  const start = Date.now();

  try {
    const agent = createAgent(entry);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);

    const response = await fetch(TEST_URL, {
      agent,
      signal: controller.signal,
    } as any);

    clearTimeout(timer);

    if (!response.ok) {
      return { status: "dead", latency: null };
    }

    const latency = Date.now() - start;
    return {
      status: latency > SLOW_THRESHOLD ? "slow" : "alive",
      latency,
    };
  } catch {
    return { status: "dead", latency: null };
  }
}

function createAgent(entry: ProxyEntry) {
  const auth =
    entry.username && entry.password
      ? `${entry.username}:${entry.password}@`
      : "";

  if (entry.protocol === "SOCKS4" || entry.protocol === "SOCKS5") {
    const type = entry.protocol === "SOCKS4" ? 4 : 5;
    return new SocksProxyAgent(
      `socks${type}://${auth}${entry.host}:${entry.port}`,
    );
  }

  return new HttpsProxyAgent(
    `http://${auth}${entry.host}:${entry.port}`,
  );
}
