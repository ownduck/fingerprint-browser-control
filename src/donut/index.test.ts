import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DonutApiError, DonutBrowser } from "./index.js";

const BIN_PATH = "F:\\data\\local\\Donut-Portable";

const client = new DonutBrowser({
  token: "0xtrzOvYIge43Rl99e31hkJGSgMCORb_hMHoI6xgx6U",
});

describe("DonutBrowser (live)", () => {
  it("defaults baseUrl and exeNames priority list", () => {
    expect(client.baseUrl).toBe("http://127.0.0.1:10108");
    expect(client.exeNames).toEqual(["Donut.exe", "donutbrowser.exe"]);
  });

  it("exeName option makes list a single value", () => {
    const c = new DonutBrowser({ token: "t", exeName: "Custom.exe" });
    expect(c.exeNames).toEqual(["Custom.exe"]);
  });

  it("isRunning / start via portable bin path", async () => {
    if (!(await client.isRunning())) {
      await client.start(BIN_PATH);
    }
    await expect(client.isRunning()).resolves.toBe(true);
    // already running → no-op
    await expect(client.start(BIN_PATH)).resolves.toBeUndefined();
  });

  it("start throws when not running and exe missing", async () => {
    const c = new DonutBrowser({ token: "t", exeName: "DefinitelyNotDonutXYZ.exe" });
    await expect(c.isRunning()).resolves.toBe(false);
    await expect(c.start("C:\\nonexistent-donut-dir")).rejects.toThrow(/not found/);
  });

  it("start launches first matching exe in binPath", async () => {
    const dir = mkdtempSync(join(tmpdir(), "donut-start-"));
    const exeName = "FakeDonutLaunch.cmd";
    writeFileSync(join(dir, exeName), "@echo off\r\nexit /b 0\r\n");
    const c = new DonutBrowser({ token: "t", exeName });
    await expect(c.isRunning()).resolves.toBe(false);
    await expect(c.start(dir)).resolves.toBeUndefined();
  });

  it("getBrowsersVersions", async () => {
    const versions = await client.getBrowsersVersions();
    expect(Array.isArray(versions)).toBe(true);
    expect(versions.length).toBeGreaterThan(0);
    console.log("versions:", versions);
  });

  it("listProfilesWithProxies + getProfile + openUrl + closeProfile", async () => {
    const { profiles, total } = await client.listProfilesWithProxies();
    expect(total).toBeGreaterThan(0);
    expect(profiles.length).toBeGreaterThan(0);

    const first = profiles[0];
    console.log("first profile:", first.id, first.name, "proxy:", first.proxy?.name ?? null);

    const detail = await client.getProfile(first.id);
    expect(detail.id).toBe(first.id);
    expect("remote_debugging_port" in detail).toBe(true);
    console.log("remote_debugging_port:", detail.remote_debugging_port ?? null);

    await client.openUrl(first.id, "https://browserleaks.com/ip");
    await client.closeProfile(first.id);
    const after = await client.getProfile(first.id);
    expect(after.remote_debugging_port ?? null).toBeNull();
  }, 30_000);

  it("close is no-op for unknown exeName", async () => {
    const c = new DonutBrowser({ token: "t", exeName: "DefinitelyNotDonutXYZ.exe" });
    await expect(c.close()).resolves.toBeUndefined();
  });

  it("throws DonutApiError on bad token", async () => {
    const bad = new DonutBrowser({ token: "bad-token" });
    await expect(bad.getBrowsersVersions()).rejects.toBeInstanceOf(DonutApiError);
  });
});
