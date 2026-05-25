import { PrismaClient } from "@prisma/client";

export interface ProxyConfig {
  host: string;
  port: number;
  protocol: string;
  username: string | null;
  password: string | null;
}

export class ProxyRotator {
  private prisma: PrismaClient;
  private currentIndex = 0;
  private proxies: ProxyConfig[] = [];

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? new PrismaClient();
  }

  async loadActiveProxies(): Promise<void> {
    const dbProxies = await this.prisma.proxy.findMany({
      where: { status: "active" },
      select: {
        host: true,
        port: true,
        protocol: true,
        username: true,
        password: true,
      },
    });

    this.proxies = dbProxies;
  }

  getNext(): ProxyConfig | null {
    if (this.proxies.length === 0) return null;

    const proxy = this.proxies[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
    return proxy;
  }

  getRandom(): ProxyConfig | null {
    if (this.proxies.length === 0) return null;

    const index = Math.floor(Math.random() * this.proxies.length);
    return this.proxies[index];
  }

  getCount(): number {
    return this.proxies.length;
  }
}
