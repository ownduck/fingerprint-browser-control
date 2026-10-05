import { assertAbsoluteExe, closeProcess, isProcessRunning, startProcess } from "../process.js";
import type { ProfileInfo, ProfileListResult, ProxyInfo } from "../types.js";

export type { ProfileInfo, ProfileListResult, ProxyInfo } from "../types.js";

const DEFAULT_URL = "https://browserleaks.com/ip";

export interface DonutBrowserOptions {
  /** 绝对路径，指向 Donut 可执行文件 */
  exePath: string;
  /** protocol+host+port，默认 http://127.0.0.1:10108 */
  baseUrl?: string;
  token: string;
  fetch?: typeof fetch;
}

export class DonutApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: string,
  ) {
    super(message);
    this.name = "DonutApiError";
  }
}

interface RawProxy {
  id: string;
  name: string;
  proxy_settings?: { host?: string; port?: number; [key: string]: unknown };
}

interface RawProfile {
  id: string;
  name: string;
  proxy_id?: string | null;
  remote_debugging_port?: number | null;
}

function toProxyInfo(p: RawProxy): ProxyInfo {
  return {
    id: p.id,
    name: p.name,
    ip: p.proxy_settings?.host ? String(p.proxy_settings.host) : null,
  };
}

export class DonutBrowser {
  readonly baseUrl: string;
  readonly exePath: string;
  private readonly token: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: DonutBrowserOptions) {
    assertAbsoluteExe(opts.exePath);
    this.exePath = opts.exePath;
    this.baseUrl = (opts.baseUrl ?? "http://127.0.0.1:10108").replace(/\/$/, "");
    this.token = opts.token;
    this.fetchFn = opts.fetch ?? fetch;
  }

  isRunning(): Promise<boolean> {
    return isProcessRunning(this.exePath);
  }

  start(): Promise<void> {
    return startProcess(this.exePath);
  }

  close(): Promise<void> {
    return closeProcess(this.exePath);
  }

  /** Local API 是否可用 */
  async isAvailable(): Promise<boolean> {
    try {
      await this.request("GET", "/v1/browsers/wayfern/versions");
      return true;
    } catch {
      return false;
    }
  }

  /** GET /v1/proxies */
  async listProxys(): Promise<ProxyInfo[]> {
    const proxies = await this.request<RawProxy[]>("GET", "/v1/proxies");
    return proxies.map(toProxyInfo);
  }

  /** GET /v1/profiles（不含 proxy / CDP） */
  async listProfiles(): Promise<ProfileListResult> {
    const profilesRes = await this.request<{ profiles: RawProfile[]; total: number }>(
      "GET",
      "/v1/profiles",
    );
    return {
      total: profilesRes.total,
      profiles: profilesRes.profiles.map((p) => ({ id: p.id, name: p.name })),
    };
  }

  /** GET /v1/profiles/{id}（不含 proxy / CDP） */
  async getProfile(id: string): Promise<ProfileInfo> {
    const res = await this.request<{ profile: RawProfile }>(
      "GET",
      `/v1/profiles/${encodeURIComponent(id)}`,
    );
    return { id: res.profile.id, name: res.profile.name };
  }

  /**
   * 先 GET /v1/profiles/{id} 取 proxy_id，再 GET /v1/proxies/{proxy_id}
   * 无代理时返回 null
   */
  async getProxy(profileId: string): Promise<ProxyInfo | null> {
    const res = await this.request<{ profile: RawProfile }>(
      "GET",
      `/v1/profiles/${encodeURIComponent(profileId)}`,
    );
    const proxyId = res.profile.proxy_id;
    if (!proxyId) return null;
    const proxy = await this.request<RawProxy>(
      "GET",
      `/v1/proxies/${encodeURIComponent(proxyId)}`,
    );
    return toProxyInfo(proxy);
  }

  /**
   * GET /v1/profiles/{id} 取 remote_debugging_port
   * @returns 如 http://localhost:9222；未运行返回 null
   */
  async getCdp(profileId: string): Promise<string | null> {
    const res = await this.request<{ profile: RawProfile }>(
      "GET",
      `/v1/profiles/${encodeURIComponent(profileId)}`,
    );
    const port = res.profile.remote_debugging_port;
    if (port == null) return null;
    return `http://localhost:${port}`;
  }

  /** POST /v1/profiles/{id}/open-url */
  openProfile(id: string, url: string = DEFAULT_URL): Promise<void> {
    return this.request("POST", `/v1/profiles/${encodeURIComponent(id)}/open-url`, { url });
  }

  /** POST /v1/profiles/{id}/kill */
  closeProfile(id: string): Promise<void> {
    return this.request("POST", `/v1/profiles/${encodeURIComponent(id)}/kill`);
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new DonutApiError(`${method} ${path} failed: ${res.status}`, res.status, text);
    }
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }
}
