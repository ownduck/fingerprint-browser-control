export interface ProxyInfo {
  id: string;
  name: string;
  /** 代理 IP/主机，没有则为 null */
  ip: string | null;
}

export interface ProfileInfo {
  id: string;
  name: string;
}

export interface ProfileListResult {
  profiles: ProfileInfo[];
  total: number;
}
