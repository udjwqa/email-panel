import axios, { AxiosInstance, AxiosResponse } from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import type { Agent as HttpAgent } from "http";
import type { Agent as HttpsAgent } from "https";
import { ProxyEntry } from "../proxy/types.js";
import {
  HttpClientConfig,
  HttpRequestOptions,
  HttpResponse,
  HttpResult,
  RetryConfig,
  RetryMetadata,
} from "./types.js";
import type { SessionStore } from "./session-store.js";
import { isRateLimited, getRetryDelay, sleep } from "./retry-utils.js";

const DEFAULT_TIMEOUT = 15_000;
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

export class HttpClient {
  private instance: AxiosInstance;
  private config: Required<Omit<HttpClientConfig, "sessionStore" | "retryConfig">>;
  private sessionStore?: SessionStore;
  private retryConfig: Required<RetryConfig>;

  constructor(config: HttpClientConfig = {}) {
    this.config = {
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
      maxRedirects: config.maxRedirects ?? DEFAULT_MAX_REDIRECTS,
      defaultHeaders: config.defaultHeaders ?? {},
      userAgent: config.userAgent ?? DEFAULT_USER_AGENT,
    };

    this.sessionStore = config.sessionStore;

    this.retryConfig = {
      enabled: config.retryConfig?.enabled ?? false,
      maxRetries: config.retryConfig?.maxRetries ?? 5,
      baseDelay: config.retryConfig?.baseDelay ?? 1000,
      jitterFactor: config.retryConfig?.jitterFactor ?? 0.25,
    };

    this.instance = axios.create({
      timeout: this.config.timeout,
      maxRedirects: this.config.maxRedirects,
      validateStatus: () => true, // Accept all status codes
      headers: {
        "User-Agent": this.config.userAgent,
        ...this.config.defaultHeaders,
      },
    });
  }

  /**
   * Perform GET request
   */
  async get<T = any>(
    url: string,
    options: HttpRequestOptions = {},
  ): Promise<HttpResponse<T>> {
    return this.request<T>({ ...options, method: "GET", url });
  }

  /**
   * Perform POST request
   */
  async post<T = any>(
    url: string,
    data?: any,
    options: HttpRequestOptions = {},
  ): Promise<HttpResponse<T>> {
    return this.request<T>({ ...options, method: "POST", url, data });
  }

  /**
   * Perform PUT request
   */
  async put<T = any>(
    url: string,
    data?: any,
    options: HttpRequestOptions = {},
  ): Promise<HttpResponse<T>> {
    return this.request<T>({ ...options, method: "PUT", url, data });
  }

  /**
   * Perform DELETE request
   */
  async delete<T = any>(
    url: string,
    options: HttpRequestOptions = {},
  ): Promise<HttpResponse<T>> {
    return this.request<T>({ ...options, method: "DELETE", url });
  }

  /**
   * Perform generic HTTP request with optional retry logic
   */
  async request<T = any>(
    options: HttpRequestOptions,
  ): Promise<HttpResponse<T>> {
    // If retries disabled, use original single-request logic
    if (!this.retryConfig.enabled) {
      return this.executeRequest<T>(options);
    }

    // Retry-aware request with exponential backoff
    return this.requestWithRetry<T>(options);
  }

  /**
   * Execute single request (original logic)
   */
  private async executeRequest<T>(
    options: HttpRequestOptions,
  ): Promise<HttpResponse<T>> {
    const start = Date.now();
    const config = await this.buildAxiosConfig(options);

    const response: AxiosResponse<T> = await this.instance.request(config);
    const responseTime = Date.now() - start;

    // Update session with Set-Cookie headers if session store is enabled
    if (this.sessionStore && options.url) {
      const domain = this.extractDomain(options.url);
      await this.sessionStore.updateFromResponse(domain, response.headers);
    }

    return {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers as Record<string, string>,
      data: response.data,
      responseTime,
    };
  }

  /**
   * Execute request with retry logic
   */
  private async requestWithRetry<T>(
    options: HttpRequestOptions,
  ): Promise<HttpResponse<T>> {
    let lastResponse: HttpResponse<T> | null = null;
    const retryMetadata: RetryMetadata = {
      attempts: 0,
      rateLimited: false,
      totalRetryDelay: 0,
      delays: [],
    };

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      // Execute request
      lastResponse = await this.executeRequest<T>(options);

      // Success on first attempt (no retries needed)
      if (attempt === 0 && !isRateLimited(lastResponse)) {
        return lastResponse;
      }

      // Check if rate limited
      const rateLimited = isRateLimited(lastResponse);
      if (rateLimited) {
        retryMetadata.rateLimited = true;
      }

      // If not rate limited or max retries reached, return response
      if (!rateLimited || attempt === this.retryConfig.maxRetries) {
        return {
          ...lastResponse,
          retryMetadata: attempt > 0 ? retryMetadata : undefined,
        };
      }

      // Calculate retry delay
      const delay = getRetryDelay(
        lastResponse,
        attempt,
        this.retryConfig.baseDelay,
        this.retryConfig.jitterFactor,
      );

      retryMetadata.attempts++;
      retryMetadata.totalRetryDelay += delay;
      retryMetadata.delays.push(delay);

      // Wait before retry
      await sleep(delay);
    }

    // Should never reach here, but TypeScript needs this
    return {
      ...lastResponse!,
      retryMetadata,
    };
  }

  /**
   * Perform request with error handling
   */
  async requestSafe<T = any>(
    options: HttpRequestOptions,
  ): Promise<HttpResult<T>> {
    const start = Date.now();

    try {
      const response = await this.request<T>(options);
      return {
        success: true,
        response,
        responseTime: response.responseTime,
      };
    } catch (err) {
      const responseTime = Date.now() - start;
      const error =
        err instanceof Error ? err.message : "Unknown error occurred";

      return {
        success: false,
        error,
        responseTime,
      };
    }
  }

  /**
   * Build Axios request config with proxy and session support
   */
  private async buildAxiosConfig(options: HttpRequestOptions) {
    const config = { ...options };

    // Add cookies from session store if available
    if (this.sessionStore && options.url) {
      const domain = this.extractDomain(options.url);
      const cookieHeaders = await this.sessionStore.getHeaders(domain);

      config.headers = {
        ...cookieHeaders,
        ...config.headers,
      };
    }

    // Set up proxy agent if proxy is provided
    if (options.proxy) {
      const agent = this.createProxyAgent(options.proxy);
      config.httpAgent = agent;
      config.httpsAgent = agent;
    }

    // Override timeout if specified
    if (options.timeout) {
      config.timeout = options.timeout;
    }

    return config;
  }

  /**
   * Create HTTP/HTTPS/SOCKS proxy agent based on protocol
   */
  private createProxyAgent(
    proxy: ProxyEntry,
  ): HttpAgent | HttpsAgent | SocksProxyAgent {
    const auth =
      proxy.username && proxy.password
        ? `${proxy.username}:${proxy.password}@`
        : "";

    if (proxy.protocol === "SOCKS4" || proxy.protocol === "SOCKS5") {
      const socksType = proxy.protocol === "SOCKS4" ? 4 : 5;
      return new SocksProxyAgent(
        `socks${socksType}://${auth}${proxy.host}:${proxy.port}`,
      );
    }

    // HTTP/HTTPS proxy
    return new HttpsProxyAgent(`http://${auth}${proxy.host}:${proxy.port}`);
  }

  /**
   * Get current timeout setting
   */
  getTimeout(): number {
    return this.config.timeout;
  }

  /**
   * Update default timeout
   */
  setTimeout(timeout: number): void {
    this.config.timeout = timeout;
    this.instance.defaults.timeout = timeout;
  }

  /**
   * Get session store instance
   */
  getSessionStore(): SessionStore | undefined {
    return this.sessionStore;
  }

  /**
   * Set session store instance
   */
  setSessionStore(sessionStore: SessionStore): void {
    this.sessionStore = sessionStore;
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      return url;
    }
  }
}
