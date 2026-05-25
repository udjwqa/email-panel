import { ParsedSmtpResponse, SmtpResponseStatus } from "./types.js";

function classifyCode(code: number): SmtpResponseStatus {
  const firstDigit = Math.floor(code / 100);
  if (firstDigit === 2 || firstDigit === 3) return "success";
  if (firstDigit === 4) return "temporary_failure";
  return "error";
}

export function parseSmtpResponse(raw: string): ParsedSmtpResponse {
  const rawLines = raw.split("\r\n").filter((l) => l.length > 0);

  if (rawLines.length === 0) {
    return {
      code: 0,
      message: "",
      status: "error",
      isMultiline: false,
      lines: [],
    };
  }

  const code = parseInt(rawLines[0].slice(0, 3), 10) || 0;
  const isMultiline = rawLines.length > 1 || rawLines[0][3] === "-";

  const lines = rawLines.map((l) => l.slice(4));
  const message = lines.join("\n");

  return {
    code,
    message,
    status: classifyCode(code),
    isMultiline,
    lines,
  };
}
