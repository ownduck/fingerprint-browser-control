import { existsSync } from "node:fs";
import { join } from "node:path";
import { platform } from "node:os";
import { execa } from "execa";
import si from "systeminformation";

export interface ApiProxy {
  id: string;
  name: string;
  proxy_settings: Record<string, unknown>;
}

export interface ApiProfile {
  id: string;
  name: string;
  browser: string;
  version: string;
  proxy_id?: string | null;
  /** CDP 端口；未运行时为 null */
  remote_debugging_port?: number | null;
  [key: string]: unknown;
}

export type ProfileWithProxy = ApiProfile & { proxy: ApiProxy | null };

export interface DonutBrowserOptions {
  /** protocol+host+port，默认 http://127.0.0.1:10108 */
  baseUrl?: string;
  token: string;
  /**
   * 指定后 exe 查找列表仅为该值；
   * 未指定时 Windows: Donut.exe → donutbrowser.exe，其它: Donut
   */
  exeName?: string;
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

function defaultExeNames(): string[] {
  return platform() === "win32" ? ["Donut.exe", "donutbrowser.exe"] : ["Donut"];
}

function normalizeProcName(name: string): string {
  return name.toLowerCase().replace(/\.exe$/i, "");
}

export class DonutBrowser {
  readonly baseUrl: string;
  /** 按优先级排列的 exe 名称列表 */
  readonly exeNames: string[];
  private readonly token: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: DonutBrowserOptions) {
    this.baseUrl = (opts.baseUrl ?? "http://127.0.0.1:10108").replace(/\/$/, "");
    this.token = opts.token;
    this.exeNames = opts.exeName ? [opts.exeName] : defaultExeNames();
    this.fetchFn = opts.fetch ?? fetch;
  }

  /** 按进程名（优先级列表）判断 Donut 是否已启动 */
  async isRunning(): Promise<boolean> {
    return (await this.findDonutPids()).length > 0;
  }

  /**
   * 启动 Donut。
   * @param binPath 含 exe 的目录；按 exeNames 优先级找第一个存在的文件启动
   * 已在跑则直接返回。
   */
  async start(binPath: string): Promise<void> {
    if (await this.isRunning()) return;

    const exePath = this.exeNames.map((name) => join(binPath, name)).find(existsSync);
    if (!exePath) {
      throw new Error(
        `Donut executable not found in ${binPath} (tried: ${this.exeNames.join(", ")})`,
      );
    }

    const subprocess = execa(exePath, [], {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
    subprocess.nodeChildProcess.unref();
  }

  /** 关闭 Donut 进程（按 exeNames 匹配到的全部 PID） */
  async close(): Promise<void> {
    for (const pid of await this.findDonutPids()) {
      try {
        process.kill(pid);
      } catch {
        // 进程可能已退出
      }
    }
  }

  /** POST /v1/profiles/{id}/kill */
  closeProfile(id: string): Promise<void> {
    return this.request("POST", `/v1/profiles/${encodeURIComponent(id)}/kill`);
  }

  private async findDonutPids(): Promise<number[]> {
    const targets = new Set(this.exeNames.map(normalizeProcName));
    const { list } = await si.processes();
    return list
      .filter((p) => targets.has(normalizeProcName(p.name || "")))
      .map((p) => p.pid);
  }

  /** GET /v1/browsers/wayfern/versions */
  getBrowsersVersions(): Promise<string[]> {
    return this.request("GET", "/v1/browsers/wayfern/versions");
  }

  /** GET /v1/profiles + 一次 GET /v1/proxies，按 proxy_id 映射 */
  async listProfilesWithProxies(): Promise<{
    profiles: ProfileWithProxy[];
    total: number;
  }> {
    const [profilesRes, proxies] = await Promise.all([
      this.request<{ profiles: ApiProfile[]; total: number }>("GET", "/v1/profiles"),
      this.request<ApiProxy[]>("GET", "/v1/proxies"),
    ]);
    const byId = new Map(proxies.map((p) => [p.id, p]));
    return {
      total: profilesRes.total,
      profiles: profilesRes.profiles.map((p) => ({
        ...p,
        proxy: (p.proxy_id && byId.get(p.proxy_id)) || null,
      })),
    };
  }

  /** GET /v1/profiles/{id} */
  async getProfile(id: string): Promise<ApiProfile> {
    const res = await this.request<{ profile: ApiProfile }>(
      "GET",
      `/v1/profiles/${encodeURIComponent(id)}`,
    );
    return res.profile;
  }

  /** POST /v1/profiles/{id}/open-url */
  openUrl(profileId: string, url: string): Promise<void> {
    return this.request("POST", `/v1/profiles/${encodeURIComponent(profileId)}/open-url`, {
      url,
    });
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
