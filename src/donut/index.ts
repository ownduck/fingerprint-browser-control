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
  [key: string]: unknown;
}

export type ProfileWithProxy = ApiProfile & { proxy: ApiProxy | null };

export interface DonutBrowserOptions {
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

export class DonutBrowser {
  readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: DonutBrowserOptions) {
    this.baseUrl = (opts.baseUrl ?? "http://127.0.0.1:10108").replace(/\/$/, "");
    this.token = opts.token;
    this.fetchFn = opts.fetch ?? fetch;
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
