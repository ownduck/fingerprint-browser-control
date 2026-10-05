import { assertAbsoluteExe, closeProcess, isProcessRunning, startProcess } from "../process.js";
import type { ProfileInfo, ProfileListResult, ProxyInfo } from "../types.js";

export type { ProfileInfo, ProfileListResult, ProxyInfo } from "../types.js";

export interface YunLoginBrowserOptions {
  /** 绝对路径，指向 YunLogin 可执行文件 */
  exePath: string;
  /** protocol+host+port，默认 http://localhost:50213 */
  baseUrl?: string;
  /** 可选 Bearer token */
  token?: string;
  fetch?: typeof fetch;
}

export class YunLoginApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: string,
  ) {
    super(message);
    this.name = "YunLoginApiError";
  }
}

interface YunLoginResult<T = unknown> {
  code: number;
  msg?: string;
  data?: T;
}

function proxyFromDetail(proxy: Record<string, unknown> | null | undefined): ProxyInfo | null {
  if (!proxy) return null;
  const id = String(proxy.uuid ?? proxy.deviceid ?? "");
  const publicIp = proxy.PublicIP != null ? String(proxy.PublicIP) : "";
  const nameRaw = String(proxy.name ?? "").trim();
  const name = nameRaw || publicIp || id;
  const addr =
    (proxy.socks5 as { Addr?: string } | undefined)?.Addr ||
    (proxy.http as { Addr?: string } | undefined)?.Addr ||
    (proxy.https as { Addr?: string } | undefined)?.Addr ||
    "";
  const hostFromAddr = addr.includes(":") ? addr.split(":")[0] : addr;
  const ip = publicIp || hostFromAddr || null;
  if (!id && !name && !ip) return null;
  return { id: id || name || ip || "", name, ip };
}

export class YunLoginBrowser {
  readonly baseUrl: string;
  readonly exePath: string;
  private readonly token?: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: YunLoginBrowserOptions) {
    assertAbsoluteExe(opts.exePath);
    this.exePath = opts.exePath;
    this.baseUrl = (opts.baseUrl ?? "http://localhost:50213").replace(/\/$/, "");
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

  /** GET /status */
  async isAvailable(): Promise<boolean> {
    try {
      const res = await this.request<YunLoginResult>("GET", "/status");
      return res.code === 0;
    } catch {
      return false;
    }
  }

  /** POST /api/v2/userapi/selfproxy/list */
  async listProxys(): Promise<ProxyInfo[]> {
    const res = await this.request<
      YunLoginResult<{
        list?: Array<{ deviceid?: string; name?: string; proxyaddr?: string }>;
      }>
    >("POST", "/api/v2/userapi/selfproxy/list", { page: 1, pageSize: 20 });
    this.assertOk(res, "listProxys");
    return (res.data?.list ?? []).map((p) => {
      const addr = String(p.proxyaddr ?? "");
      const host = addr.includes(":") ? addr.split(":")[0] : addr || null;
      return {
        id: String(p.deviceid ?? ""),
        name: String(p.name ?? ""),
        ip: host,
      };
    });
  }

  /** POST shopseriallist + shopdetaillist（仅 id/name） */
  async listProfiles(): Promise<ProfileListResult> {
    const serialRes = await this.request<
      YunLoginResult<{ list?: Array<{ shopId: string; serial?: number }> }>
    >("POST", "/api/v2/userapi/user/shopseriallist", {});
    this.assertOk(serialRes, "shopseriallist");
    const list = serialRes.data?.list ?? [];
    if (!list.length) return { profiles: [], total: 0 };

    const ids = list.map((x) => x.shopId);
    const nameMap = await this.fetchNames(ids);

    return {
      total: list.length,
      profiles: list.map((item) => ({
        id: item.shopId,
        name: nameMap.get(item.shopId) ?? String(item.serial ?? item.shopId),
      })),
    };
  }

  /** shopdetaillist 取 name（不含 proxy / CDP） */
  async getProfile(id: string): Promise<ProfileInfo> {
    const nameMap = await this.fetchNames([id]);
    return { id, name: nameMap.get(id) ?? id };
  }

  /** POST shopdetaillist，取该 profile 的 proxy；name 空则用 PublicIP */
  async getProxy(profileId: string): Promise<ProxyInfo | null> {
    const res = await this.request<
      YunLoginResult<{
        browser?: Array<{ browserid?: string; proxy?: Record<string, unknown> }>;
      }>
    >("POST", "/api/v2/userapi/user/shopdetaillist", { browserid: [profileId] });
    this.assertOk(res, "shopdetaillist");
    const b = (res.data?.browser ?? []).find((x) => x.browserid === profileId);
    return proxyFromDetail(b?.proxy) ?? proxyFromDetail(res.data?.browser?.[0]?.proxy);
  }

  /**
   * GET /api/v2/browser/status?account_id= 取 debuggingPort
   * @returns 如 http://localhost:9222；未运行返回 null
   */
  async getCdp(profileId: string): Promise<string | null> {
    const res = await this.request<
      YunLoginResult<{
        status?: string;
        debuggingPort?: string | number;
        ws?: { selenium?: string };
      }>
    >("GET", `/api/v2/browser/status?account_id=${encodeURIComponent(profileId)}`);
    this.assertOk(res, "browser/status");
    const data = res.data ?? {};
    if (data.status && data.status !== "Active") return null;

    let port: number | null = null;
    if (data.debuggingPort != null && data.debuggingPort !== "") {
      const n = Number(data.debuggingPort);
      if (Number.isFinite(n)) port = n;
    }
    if (port == null && data.ws?.selenium) {
      const m = String(data.ws.selenium).match(/:(\d+)\s*$/);
      if (m) port = Number(m[1]);
    }
    if (port == null) return null;
    return `http://localhost:${port}`;
  }

  /** GET /api/v2/browser/start?account_id= （url 忽略） */
  async openProfile(id: string, _url?: string): Promise<void> {
    const res = await this.request<YunLoginResult>(
      "GET",
      `/api/v2/browser/start?account_id=${encodeURIComponent(id)}`,
    );
    this.assertOk(res, "browser/start");
  }

  /** GET /api/v2/browser/stop?account_id= */
  async closeProfile(id: string): Promise<void> {
    const res = await this.request<YunLoginResult>(
      "GET",
      `/api/v2/browser/stop?account_id=${encodeURIComponent(id)}`,
    );
    this.assertOk(res, "browser/stop");
  }

  private async fetchNames(ids: string[]): Promise<Map<string, string>> {
    const res = await this.request<
      YunLoginResult<{ browser?: Array<{ browserid?: string; name?: string }> }>
    >("POST", "/api/v2/userapi/user/shopdetaillist", { browserid: ids });
    this.assertOk(res, "shopdetaillist");
    const map = new Map<string, string>();
    for (const b of res.data?.browser ?? []) {
      if (!b.browserid) continue;
      map.set(b.browserid, String(b.name ?? b.browserid));
    }
    return map;
  }

  private assertOk(res: YunLoginResult, action: string): void {
    if (res.code !== 0) {
      throw new YunLoginApiError(
        `${action} failed: code=${res.code} ${res.msg ?? ""}`.trim(),
        res.code,
        JSON.stringify(res),
      );
    }
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new YunLoginApiError(`${method} ${path} failed: ${res.status}`, res.status, text);
    }
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }
}
