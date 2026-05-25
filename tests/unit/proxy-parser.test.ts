import { describe, it, expect } from "vitest";
import { parseProxyList } from "../../src/services/proxy/parser.js";

describe("parseProxyList", () => {
  it("parses ip:port format", () => {
    const result = parseProxyList("1.2.3.4:8080");
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toEqual({
      host: "1.2.3.4",
      port: 8080,
      protocol: "HTTP",
    });
  });

  it("parses ip:port:user:pass format", () => {
    const result = parseProxyList("1.2.3.4:8080:admin:secret");
    expect(result.entries[0]).toEqual({
      host: "1.2.3.4",
      port: 8080,
      protocol: "HTTP",
      username: "admin",
      password: "secret",
    });
  });

  it("parses socks5://ip:port format", () => {
    const result = parseProxyList("socks5://1.2.3.4:1080");
    expect(result.entries[0].protocol).toBe("SOCKS5");
    expect(result.entries[0].port).toBe(1080);
  });

  it("parses http://user:pass@ip:port format", () => {
    const result = parseProxyList("http://admin:pass@1.2.3.4:3128");
    expect(result.entries[0]).toEqual({
      host: "1.2.3.4",
      port: 3128,
      protocol: "HTTP",
      username: "admin",
      password: "pass",
    });
  });

  it("parses socks4://ip:port format", () => {
    const result = parseProxyList("socks4://10.0.0.1:4145");
    expect(result.entries[0].protocol).toBe("SOCKS4");
  });

  it("skips empty lines and comments", () => {
    const result = parseProxyList("# comment\n\n1.2.3.4:8080\n\n");
    expect(result.entries).toHaveLength(1);
    expect(result.totalLines).toBe(2);
  });

  it("skips invalid lines", () => {
    const result = parseProxyList("not-a-proxy\n1.2.3.4:8080");
    expect(result.entries).toHaveLength(1);
  });

  it("deduplicates by host:port", () => {
    const result = parseProxyList("1.2.3.4:8080\n1.2.3.4:8080\n1.2.3.4:8080");
    expect(result.entries).toHaveLength(1);
    expect(result.duplicateCount).toBe(2);
  });

  it("rejects invalid port", () => {
    const result = parseProxyList("1.2.3.4:99999");
    expect(result.entries).toHaveLength(0);
  });

  it("handles mixed formats", () => {
    const input = [
      "1.2.3.4:8080",
      "socks5://5.6.7.8:1080",
      "http://user:pass@9.10.11.12:3128",
      "13.14.15.16:8080:admin:secret",
      "invalid-line",
    ].join("\n");

    const result = parseProxyList(input);
    expect(result.validLines).toBe(4);
    expect(result.totalLines).toBe(5);
  });
});
