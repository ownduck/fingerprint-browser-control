import { describe, expect, it } from "vitest";
import { YunLoginApiError, YunLoginBrowser } from "./index.js";

const EXE_PATH = "D:\\Program Files (x86)\\FbBrowser\\YunLogin.exe";

const client = new YunLoginBrowser({ exePath: EXE_PATH });

describe("YunLoginBrowser (live)", () => {
  it("requires absolute exePath and defaults baseUrl", () => {
    expect(() => new YunLoginBrowser({ exePath: "YunLogin.exe" })).toThrow(/absolute/);
    expect(client.baseUrl).toBe("http://localhost:50213");
    expect(client.exePath).toBe(EXE_PATH);
  });

  it("isAvailable false when API unreachable", async () => {
    const c = new YunLoginBrowser({
      exePath: EXE_PATH,
      baseUrl: "http://127.0.0.1:1",
    });
    await expect(c.isAvailable()).resolves.toBe(false);
  });

  it("start throws when exe missing and not running", async () => {
    const c = new YunLoginBrowser({
      exePath: "F:\\definitely-not-exist\\NoSuchYunLoginXYZ.exe",
    });
    await expect(c.isRunning()).resolves.toBe(false);
    await expect(c.start()).rejects.toThrow(/not found/);
  });

  it("isAvailable", async () => {
    await expect(client.isAvailable()).resolves.toBe(true);
  });

  it("isRunning when process exists", async () => {
    await expect(client.isRunning()).resolves.toBe(true);
  });

  it("start is no-op when already running", async () => {
    await expect(client.start()).resolves.toBeUndefined();
  });

  it("listProxys", async () => {
    const proxies = await client.listProxys();
    expect(Array.isArray(proxies)).toBe(true);
    if (proxies.length) {
      expect(proxies[0]).toHaveProperty("id");
      expect(proxies[0]).toHaveProperty("name");
      expect(proxies[0]).toHaveProperty("ip");
    }
  });

  it("listProfiles / getProfile / getProxy / openProfile / getCdp / closeProfile", async () => {
    const { profiles, total } = await client.listProfiles();
    expect(total).toBeGreaterThan(0);
    expect(profiles[0]).toEqual({
      id: expect.any(String),
      name: expect.any(String),
    });

    const first = profiles[0];
    const detail = await client.getProfile(first.id);
    expect(detail).toEqual({ id: first.id, name: expect.any(String) });
    expect("proxy" in detail).toBe(false);

    const proxy = await client.getProxy(first.id);
    console.log("yunlogin proxy:", proxy);
    if (proxy) {
      expect(proxy).toHaveProperty("id");
      expect(proxy).toHaveProperty("name");
      expect(proxy).toHaveProperty("ip");
    }

    await client.openProfile(first.id);
    const cdp = await client.getCdp(first.id);
    console.log("yunlogin cdp:", cdp);
    expect(cdp === null || /^http:\/\/localhost:\d+$/.test(cdp)).toBe(true);

    await client.closeProfile(first.id);
    let closedCdp: string | null = cdp;
    for (let i = 0; i < 30; i++) {
      closedCdp = await client.getCdp(first.id);
      if (closedCdp === null) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(closedCdp).toBeNull();
  }, 90_000);

  it("throws YunLoginApiError on invalid account", async () => {
    await expect(client.openProfile("definitely-not-a-real-account-id")).rejects.toBeInstanceOf(
      YunLoginApiError,
    );
  });

  it("close then start lifecycle", async () => {
    await client.close();
    for (let i = 0; i < 20; i++) {
      if (!(await client.isRunning())) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    await expect(client.isRunning()).resolves.toBe(false);
    await client.start();
    for (let i = 0; i < 60; i++) {
      if (await client.isRunning()) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    await expect(client.isRunning()).resolves.toBe(true);
    for (let i = 0; i < 60; i++) {
      if (await client.isAvailable()) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    await expect(client.isAvailable()).resolves.toBe(true);
  }, 120_000);
});
