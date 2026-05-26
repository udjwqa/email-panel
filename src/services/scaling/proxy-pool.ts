import { db } from "../db.js";

export interface PoolProxy {
  id: number;
  host: string;
  port: number;
  protocol: string;
  username: string | null;
  password: string | null;
}

export class ProxyPoolManager {
  private proxies: PoolProxy[] = [];
  private currentIndex = 0;
  private failCounts = new Map<number, number>();

  async loadFromDB(): Promise<number> {
    this.proxies = await db.proxy.findMany({
      where: { status: "alive" },
      orderBy: { latency: "asc" },
      select: { id: true, host: true, port: true, protocol: true, username: true, password: true },
    });
    return this.proxies.length;
  }

  getNext(): PoolProxy | null {
    if (this.proxies.length === 0) return null;
    const proxy = this.proxies[this.currentIndex % this.proxies.length];
    this.currentIndex++;
    return proxy;
  }

  markFailed(proxyId: number): void {
    const count = (this.failCounts.get(proxyId) ?? 0) + 1;
    this.failCounts.set(proxyId, count);
    if (count >= 10) {
      this.proxies = this.proxies.filter((p) => p.id !== proxyId);
      this.failCounts.delete(proxyId);
    }
  }

  markSuccess(proxyId: number): void {
    this.failCounts.delete(proxyId);
  }

  getStats() {
    return {
      total: this.proxies.length,
      failTracked: this.failCounts.size,
      currentIndex: this.currentIndex,
    };
  }

  getAll(): PoolProxy[] {
    return [...this.proxies];
  }

  addManual(proxy: PoolProxy): void {
    this.proxies.push(proxy);
  }
}
