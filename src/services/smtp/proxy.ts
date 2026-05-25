import { SocksClient, type SocksClientOptions } from "socks";
import net from "node:net";
import { SmtpProxyConfig } from "./types.js";

export async function createSocksConnection(
  proxy: SmtpProxyConfig,
  targetHost: string,
  targetPort: number,
  timeout = 30_000,
): Promise<net.Socket> {
  const options: SocksClientOptions = {
    proxy: {
      host: proxy.host,
      port: proxy.port,
      type: proxy.type,
      ...(proxy.username && proxy.password
        ? { userId: proxy.username, password: proxy.password }
        : {}),
    },
    destination: {
      host: targetHost,
      port: targetPort,
    },
    command: "connect",
    timeout,
  };

  const info = await SocksClient.createConnection(options);
  return info.socket;
}
