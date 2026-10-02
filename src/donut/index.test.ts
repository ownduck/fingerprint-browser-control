import { describe, expect, it } from "vitest";
import { DonutApiError, DonutBrowser } from "./index.js";

const client = new DonutBrowser({
  token: "0xtrzOvYIge43Rl99e31hkJGSgMCORb_hMHoI6xgx6U",
});

describe("DonutBrowser (live)", () => {
  it("defaults baseUrl", () => {
    expect(client.baseUrl).toBe("http://127.0.0.1:10108");
  });

  it("getBrowsersVersions", async () => {
    const versions = await client.getBrowsersVersions();
    expect(Array.isArray(versions)).toBe(true);
    expect(versions.length).toBeGreaterThan(0);
    console.log("versions:", versions);
  });

  it("listProfilesWithProxies + openUrl first profile", async () => {
    const { profiles, total } = await client.listProfilesWithProxies();
    expect(total).toBeGreaterThan(0);
    expect(profiles.length).toBeGreaterThan(0);

    const first = profiles[0];
    console.log("first profile:", first.id, first.name, "proxy:", first.proxy?.name ?? null);

    await client.openUrl(first.id, "https://browserleaks.com/ip");
  });

  it("throws DonutApiError on bad token", async () => {
    const bad = new DonutBrowser({ token: "bad-token" });
    await expect(bad.getBrowsersVersions()).rejects.toBeInstanceOf(DonutApiError);
  });
});
