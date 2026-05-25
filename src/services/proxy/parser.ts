import { ProxyEntry, ProxyProtocol } from "./types.js";

const PROTOCOL_MAP: Record<string, ProxyProtocol> = {
  http: "HTTP",
  https: "HTTP",
  socks4: "SOCKS4",
  socks5: "SOCKS5",
};

function parseLine(raw: string): ProxyEntry | null {
  const line = raw.trim();
  if (!line || line.startsWith("#")) return null;

  // protocol://user:pass@host:port
  const urlMatch = line.match(
    /^(https?|socks[45]):\/\/(?:([^:]+):([^@]+)@)?([^:]+):(\d+)$/i,
  );
  if (urlMatch) {
    return {
      protocol: PROTOCOL_MAP[urlMatch[1].toLowerCase()] ?? "HTTP",
      username: urlMatch[2] || undefined,
      password: urlMatch[3] || undefined,
      host: urlMatch[4],
      port: Number(urlMatch[5]),
    };
  }

  const parts = line.split(":");
  if (parts.length === 2) {
    // host:port
    const port = Number(parts[1]);
    if (isNaN(port) || port < 1 || port > 65535) return null;
    return { host: parts[0], port, protocol: "HTTP" };
  }

  if (parts.length === 4) {
    // host:port:user:pass
    const port = Number(parts[1]);
    if (isNaN(port) || port < 1 || port > 65535) return null;
    return {
      host: parts[0],
      port,
      protocol: "HTTP",
      username: parts[2],
      password: parts[3],
    };
  }

  return null;
}

export interface ProxyParseResult {
  entries: ProxyEntry[];
  totalLines: number;
  validLines: number;
  duplicateCount: number;
}

export function parseProxyList(content: string): ProxyParseResult {
  const lines = content.split(/\r?\n/);
  const seen = new Set<string>();
  const entries: ProxyEntry[] = [];
  let totalLines = 0;
  let duplicateCount = 0;

  for (const raw of lines) {
    if (!raw.trim()) continue;
    totalLines++;

    const entry = parseLine(raw);
    if (!entry) continue;

    const key = `${entry.host}:${entry.port}`;
    if (seen.has(key)) {
      duplicateCount++;
      continue;
    }

    seen.add(key);
    entries.push(entry);
  }

  return {
    entries,
    totalLines,
    validLines: entries.length,
    duplicateCount,
  };
}
