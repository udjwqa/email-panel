import net from "node:net";
import tls from "node:tls";
import { SmtpProxyConfig, SmtpResponse, SmtpResult } from "./types.js";
import { createSocksConnection } from "./proxy.js";
import { parseSmtpResponse } from "./parser.js";

export class SmtpClient {
  private socket: net.Socket | tls.TLSSocket | null = null;
  private timeout: number;
  private buffer = "";

  constructor(timeout = 30_000) {
    this.timeout = timeout;
  }

  async connect(
    host: string,
    port = 25,
    proxy?: SmtpProxyConfig,
  ): Promise<SmtpResponse> {
    if (proxy) {
      return this.connectViaProxy(proxy, host, port);
    }
    return this.connectDirect(host, port);
  }

  private async connectViaProxy(
    proxy: SmtpProxyConfig,
    host: string,
    port: number,
  ): Promise<SmtpResponse> {
    const socket = await createSocksConnection(proxy, host, port, this.timeout);
    this.socket = socket;
    this.buffer = "";

    socket.setTimeout(this.timeout);

    socket.on("timeout", () => {
      socket.destroy();
    });

    return this.waitForResponse().then((raw) => this.parseResponse(raw));
  }

  private connectDirect(host: string, port: number): Promise<SmtpResponse> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      this.socket = socket;
      this.buffer = "";

      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error(`Connection timeout after ${this.timeout}ms`));
      }, this.timeout);

      socket.setTimeout(this.timeout);

      socket.on("timeout", () => {
        clearTimeout(timer);
        socket.destroy();
        reject(new Error(`Socket timeout after ${this.timeout}ms`));
      });

      socket.on("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`Connection error: ${err.message}`));
      });

      socket.connect(port, host, () => {
        this.waitForResponse()
          .then((raw) => {
            clearTimeout(timer);
            resolve(this.parseResponse(raw));
          })
          .catch((err) => {
            clearTimeout(timer);
            reject(err);
          });
      });
    });
  }

  async sendCommand(command: string): Promise<SmtpResponse> {
    if (!this.socket || this.socket.destroyed) {
      throw new Error("Not connected");
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Command timeout after ${this.timeout}ms`));
      }, this.timeout);

      this.socket!.write(`${command}\r\n`, (err) => {
        if (err) {
          clearTimeout(timer);
          reject(new Error(`Write error: ${err.message}`));
          return;
        }

        this.waitForResponse()
          .then((raw) => {
            clearTimeout(timer);
            resolve(this.parseResponse(raw));
          })
          .catch((e) => {
            clearTimeout(timer);
            reject(e);
          });
      });
    });
  }

  parseResponse(raw: string): SmtpResponse {
    const parsed = parseSmtpResponse(raw);
    return {
      code: parsed.code,
      message: parsed.message,
      isMultiline: parsed.isMultiline,
      status: parsed.status,
    };
  }

  async startTls(host: string): Promise<boolean> {
    if (!this.socket || this.socket.destroyed) {
      return false;
    }

    try {
      const resp = await this.sendCommand("STARTTLS");
      if (resp.code !== 220) {
        this.buffer = "";
        return false;
      }

      return new Promise((resolve) => {
        const tlsSocket = tls.connect(
          {
            socket: this.socket as net.Socket,
            servername: host,
            rejectUnauthorized: false,
          },
          () => {
            this.socket = tlsSocket;
            this.buffer = "";
            resolve(true);
          },
        );

        tlsSocket.on("error", () => {
          this.buffer = "";
          resolve(false);
        });

        setTimeout(() => {
          this.buffer = "";
          resolve(false);
        }, this.timeout);
      });
    } catch {
      this.buffer = "";
      return false;
    }
  }

  async close(): Promise<void> {
    if (!this.socket || this.socket.destroyed) return;

    try {
      await this.sendCommand("QUIT");
    } catch {
      // ignore errors during quit
    }

    this.socket.destroy();
    this.socket = null;
    this.buffer = "";
  }

  async checkServer(
    host: string,
    port = 25,
    proxy?: SmtpProxyConfig,
  ): Promise<SmtpResult> {
    const start = Date.now();
    const result: SmtpResult = {
      status: "error",
      banner: null,
      ehloResponse: null,
      supportsTls: false,
      tlsEstablished: false,
      responseTime: 0,
      error: null,
    };

    try {
      const bannerResp = await this.connect(host, port, proxy);
      if (bannerResp.code !== 220) {
        result.error = `Unexpected banner: ${bannerResp.code} ${bannerResp.message}`;
        result.responseTime = Date.now() - start;
        await this.close();
        return result;
      }

      result.banner = bannerResp.message;
      result.status = "connected";

      const ehloResp = await this.sendCommand("EHLO validator.local");
      if (ehloResp.code !== 250) {
        const heloResp = await this.sendCommand("HELO validator.local");
        if (heloResp.code !== 250) {
          result.error = `HELO rejected: ${heloResp.code} ${heloResp.message}`;
          result.responseTime = Date.now() - start;
          await this.close();
          return result;
        }
        result.ehloResponse = heloResp.message;
      } else {
        result.ehloResponse = ehloResp.message;
      }

      result.status = "ehlo_ok";
      result.supportsTls = (result.ehloResponse ?? "")
        .toUpperCase()
        .includes("STARTTLS");

      if (result.supportsTls) {
        const tlsOk = await this.startTls(host);
        result.tlsEstablished = tlsOk;
        if (tlsOk) {
          result.status = "starttls_ok";
          await this.sendCommand("EHLO validator.local");
        }
      }

      result.responseTime = Date.now() - start;
      await this.close();
      return result;
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      result.status = result.error.includes("timeout") ? "timeout" : "error";
      result.responseTime = Date.now() - start;

      try {
        await this.close();
      } catch {
        this.socket?.destroy();
        this.socket = null;
      }

      return result;
    }
  }

  private waitForResponse(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error("Not connected"));
        return;
      }

      const socket = this.socket;

      const cleanup = () => {
        socket.removeListener("data", onData);
        socket.removeListener("error", onError);
        socket.removeListener("close", onClose);
        clearTimeout(timer);
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Response timeout after ${this.timeout}ms`));
      }, this.timeout);

      const onData = (chunk: Buffer) => {
        this.buffer += chunk.toString("utf-8");

        const lines = this.buffer.split("\r\n");
        const nonEmpty = lines.filter((l) => l.length > 0);
        if (nonEmpty.length === 0) return;

        const lastLine = nonEmpty[nonEmpty.length - 1];
        if (/^\d{3} /.test(lastLine)) {
          cleanup();
          const result = this.buffer;
          this.buffer = "";
          resolve(result);
        }
      };

      const onError = (err: Error) => {
        cleanup();
        reject(new Error(`Socket error: ${err.message}`));
      };

      const onClose = () => {
        cleanup();
        if (this.buffer.length > 0) {
          const result = this.buffer;
          this.buffer = "";
          resolve(result);
        } else {
          reject(new Error("Connection closed unexpectedly"));
        }
      };

      socket.on("data", onData);
      socket.on("error", onError);
      socket.on("close", onClose);
    });
  }
}
