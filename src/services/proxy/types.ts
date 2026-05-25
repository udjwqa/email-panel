export type ProxyProtocol = "HTTP" | "SOCKS4" | "SOCKS5";
export type ProxyStatus = "unchecked" | "alive" | "dead" | "slow";

export interface ProxyEntry {
  host: string;
  port: number;
  protocol: ProxyProtocol;
  username?: string;
  password?: string;
}

export interface ProxyCheckResult {
  status: ProxyStatus;
  latency: number | null;
}

export interface ProxyStats {
  total: number;
  alive: number;
  dead: number;
  slow: number;
  unchecked: number;
  avgLatency: number;
}
