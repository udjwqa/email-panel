import { db } from "../db.js";
import { parseProxyList, ProxyParseResult } from "./parser.js";
import { ProxyStats } from "./types.js";

let roundRobinIndex = 0;

export async function loadFromText(text: string): Promise<ProxyParseResult> {
  const result = parseProxyList(text);

  for (const entry of result.entries) {
    await db.proxy.upsert({
      where: { host_port: { host: entry.host, port: entry.port } },
      create: {
        host: entry.host,
        port: entry.port,
        protocol: entry.protocol,
        username: entry.username ?? null,
        password: entry.password ?? null,
      },
      update: {
        protocol: entry.protocol,
        username: entry.username ?? null,
        password: entry.password ?? null,
      },
    });
  }

  return result;
}

export async function loadFromUrl(url: string): Promise<ProxyParseResult> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch proxy list: HTTP ${response.status}`);
  }
  const text = await response.text();
  return loadFromText(text);
}

export async function getNext() {
  const proxies = await db.proxy.findMany({
    where: { status: "alive" },
    orderBy: { id: "asc" },
  });

  if (proxies.length === 0) return null;
  roundRobinIndex = (roundRobinIndex + 1) % proxies.length;
  return proxies[roundRobinIndex];
}

export async function getRandom() {
  const count = await db.proxy.count({ where: { status: "alive" } });
  if (count === 0) return null;

  const skip = Math.floor(Math.random() * count);
  const [proxy] = await db.proxy.findMany({
    where: { status: "alive" },
    skip,
    take: 1,
  });

  return proxy ?? null;
}

export async function getByProtocol(protocol: string) {
  return db.proxy.findMany({
    where: { status: "alive", protocol },
    orderBy: { latency: "asc" },
  });
}

export async function getStats(): Promise<ProxyStats> {
  const [total, alive, dead, slow, unchecked, latencyAgg] = await Promise.all([
    db.proxy.count(),
    db.proxy.count({ where: { status: "alive" } }),
    db.proxy.count({ where: { status: "dead" } }),
    db.proxy.count({ where: { status: "slow" } }),
    db.proxy.count({ where: { status: "unchecked" } }),
    db.proxy.aggregate({
      where: { status: "alive", latency: { not: null } },
      _avg: { latency: true },
    }),
  ]);

  return {
    total,
    alive,
    dead,
    slow,
    unchecked,
    avgLatency: Math.round(latencyAgg._avg.latency ?? 0),
  };
}

export async function removeDead(): Promise<number> {
  const { count } = await db.proxy.deleteMany({ where: { status: "dead" } });
  return count;
}

export async function removeByFailCount(maxFails: number): Promise<number> {
  const { count } = await db.proxy.deleteMany({
    where: { failCount: { gt: maxFails } },
  });
  return count;
}
