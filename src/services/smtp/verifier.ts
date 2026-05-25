import { SmtpClient } from "./client.js";
import { resolveMX } from "./resolver.js";
import {
  MxHost,
  SmtpProxyConfig,
  SmtpResponse,
  VerifyResult,
  VerifyStatus,
} from "./types.js";

export interface VerifyOptions {
  timeout?: number;
  senderDomain?: string;
  mxCache?: Map<string, MxHost[]>;
  proxy?: SmtpProxyConfig;
}

function rcptCodeToStatus(code: number): VerifyStatus | "next_mx" {
  if (code === 250 || code === 251) return "deliverable";

  if (code === 550 || code === 551 || code === 552 || code === 553)
    return "undeliverable";

  if (code === 450 || code === 451 || code === 452) return "risky";

  if (code === 421) return "next_mx";

  return "unknown";
}

export async function verifyMailbox(
  email: string,
  options?: VerifyOptions,
): Promise<VerifyResult> {
  const start = Date.now();
  const timeout = options?.timeout ?? 30_000;
  const senderDomain = options?.senderDomain ?? "validator.local";

  const result: VerifyResult = {
    email,
    status: "error",
    mxHost: null,
    smtpCode: null,
    smtpMessage: null,
    responseTime: 0,
    error: null,
  };

  const domain = email.split("@")[1];
  if (!domain) {
    result.error = "Invalid email: no domain";
    result.responseTime = Date.now() - start;
    return result;
  }

  let mxHosts: MxHost[];
  try {
    mxHosts = await resolveMX(domain, options?.mxCache);
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    result.responseTime = Date.now() - start;
    return result;
  }

  if (mxHosts.length === 0) {
    result.error = `No MX records for ${domain}`;
    result.responseTime = Date.now() - start;
    return result;
  }

  for (const mx of mxHosts) {
    const client = new SmtpClient(timeout);

    try {
      const tryResult = await tryMxHost(
        client,
        mx,
        email,
        senderDomain,
        options?.proxy,
      );
      result.mxHost = mx.host;
      result.smtpCode = tryResult.code;
      result.smtpMessage = tryResult.message;

      const status = rcptCodeToStatus(tryResult.code);

      if (status === "next_mx") {
        await safeClose(client);
        continue;
      }

      result.status = status;
      result.responseTime = Date.now() - start;
      await safeClose(client);
      return result;
    } catch (err) {
      await safeClose(client);
      const msg = err instanceof Error ? err.message : String(err);

      if (msg.includes("timeout")) {
        result.status = "timeout";
        result.mxHost = mx.host;
        result.error = msg;
        result.responseTime = Date.now() - start;
        return result;
      }

      result.error = msg;
      result.mxHost = mx.host;
      continue;
    }
  }

  result.responseTime = Date.now() - start;
  return result;
}

async function tryMxHost(
  client: SmtpClient,
  mx: MxHost,
  email: string,
  senderDomain: string,
  proxy?: SmtpProxyConfig,
): Promise<{ code: number; message: string }> {
  const banner = await client.connect(mx.host, mx.port, proxy);
  if (banner.code !== 220) {
    throw new Error(`Banner rejected: ${banner.code} ${banner.message}`);
  }

  let ehlo = await client.sendCommand(`EHLO ${senderDomain}`);
  if (ehlo.code !== 250) {
    ehlo = await client.sendCommand(`HELO ${senderDomain}`);
    if (ehlo.code !== 250) {
      throw new Error(`HELO rejected: ${ehlo.code} ${ehlo.message}`);
    }
  }

  if (ehlo.message.toUpperCase().includes("STARTTLS")) {
    const tlsOk = await client.startTls(mx.host);
    if (tlsOk) {
      await client.sendCommand(`EHLO ${senderDomain}`);
    }
  }

  const mailFrom = await client.sendCommand(
    `MAIL FROM:<noreply@${senderDomain}>`,
  );
  if (mailFrom.code !== 250) {
    throw new Error(
      `MAIL FROM rejected: ${mailFrom.code} ${mailFrom.message}`,
    );
  }

  const rcpt = await client.sendCommand(`RCPT TO:<${email}>`);

  try {
    await client.sendCommand("RSET");
  } catch {
    // ignore RSET errors
  }

  return { code: rcpt.code, message: rcpt.message };
}

async function safeClose(client: SmtpClient): Promise<void> {
  try {
    await client.close();
  } catch {
    // ignore close errors
  }
}
