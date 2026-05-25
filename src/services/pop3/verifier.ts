import net from "node:net";
import tls from "node:tls";
import { POP3Config, POP3AuthResult, AuthErrorType } from "./types.js";
import { detectProtectionMechanism } from "../../utils/protection-detector.js";

export class POP3Verifier {
  private timeout: number;

  constructor(timeout = 10_000) {
    this.timeout = timeout;
  }

  async tryAuthenticate(config: POP3Config): Promise<POP3AuthResult> {
    const start = Date.now();
    let socket: net.Socket | tls.TLSSocket | null = null;

    try {
      // Создание соединения
      socket = config.tls
        ? tls.connect({
            host: config.host,
            port: config.port,
            rejectUnauthorized: false,
          })
        : net.connect(config.port, config.host);

      socket.setTimeout(this.timeout);

      // Ждем приветствия
      const greeting = await this.waitForResponse(socket);
      if (!greeting.startsWith("+OK")) {
        throw new Error("Invalid greeting: " + greeting);
      }

      // USER команда
      await this.sendCommand(socket, `USER ${config.user}`);
      const userResp = await this.waitForResponse(socket);
      if (!userResp.startsWith("+OK")) {
        throw new Error("USER command failed: " + userResp);
      }

      // PASS команда
      await this.sendCommand(socket, `PASS ${config.password}`);
      const passResp = await this.waitForResponse(socket);

      if (!passResp.startsWith("+OK")) {
        // Проверка на защитные механизмы перед auth_failed
        const protectionCheck = detectProtectionMechanism(passResp);
        if (protectionCheck.isProtected) {
          socket.end();
          return {
            success: false,
            errorType: "additional_verification_required",
            message: `Protection detected: ${protectionCheck.type}`,
            responseTime: Date.now() - start,
          };
        }

        // Fallback к auth_failed если не защита
        socket.end();
        return {
          success: false,
          errorType: "auth_failed",
          message: "Authentication failed",
          responseTime: Date.now() - start,
        };
      }

      // STAT для проверки
      await this.sendCommand(socket, "STAT");
      await this.waitForResponse(socket);

      // QUIT
      await this.sendCommand(socket, "QUIT");
      socket.end();

      return {
        success: true,
        errorType: null,
        responseTime: Date.now() - start,
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      let errorType: AuthErrorType = "auth_failed";
      let message = err.message;

      if (err.code === "ETIMEDOUT") {
        errorType = "timeout";
        message = "Connection timeout";
      } else if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") {
        errorType = "connection_error";
        message =
          err.code === "ECONNREFUSED"
            ? "Connection refused"
            : "Host not found";
      }

      if (socket) {
        socket.destroy();
      }

      return {
        success: false,
        errorType,
        message,
        responseTime: Date.now() - start,
      };
    }
  }

  private async sendCommand(
    socket: net.Socket | tls.TLSSocket,
    command: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      socket.write(command + "\r\n", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private async waitForResponse(
    socket: net.Socket | tls.TLSSocket,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let buffer = "";
      const timer = setTimeout(() => {
        reject(new Error("Response timeout"));
      }, this.timeout);

      const onData = (chunk: Buffer) => {
        buffer += chunk.toString();
        if (buffer.includes("\r\n")) {
          clearTimeout(timer);
          socket.removeListener("data", onData);
          socket.removeListener("error", onError);
          resolve(buffer.trim());
        }
      };

      const onError = (err: Error) => {
        clearTimeout(timer);
        socket.removeListener("data", onData);
        socket.removeListener("error", onError);
        reject(err);
      };

      socket.on("data", onData);
      socket.on("error", onError);
    });
  }
}
