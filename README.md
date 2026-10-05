# @woosau/fingerprint-browser-control

多指纹浏览器控制库。Donut / YunLogin 共用统一返回值。

- `ProfileInfo`：`id` / `name`
- `ProxyInfo`：`id` / `name` / `ip`
- `getCdp(profileId)`：返回 `http://localhost:9222` 这类完整地址，未运行则为 `null`

## Install

```bash
npm i @woosau/fingerprint-browser-control
```

## Usage

```ts
import { DonutBrowser, YunLoginBrowser } from "@woosau/fingerprint-browser-control";

const donut = new DonutBrowser({
  exePath: "F:\\data\\local\\Donut-Portable\\Donut.exe", // 必填绝对路径
  token: "YOUR_LOCAL_API_TOKEN",
  // baseUrl 默认 http://127.0.0.1:10108
});

const yun = new YunLoginBrowser({
  exePath: "D:\\Program Files (x86)\\FbBrowser\\YunLogin.exe", // 必填绝对路径
  // token 可选；baseUrl 默认 http://localhost:50213
});

for (const client of [donut, yun]) {
  if (!(await client.isRunning())) await client.start();
  console.log(await client.isAvailable());

  const proxies = await client.listProxys();
  const { profiles } = await client.listProfiles();
  const profile = await client.getProfile(profiles[0].id);
  const proxy = await client.getProxy(profile.id); // { id, name, ip } | null

  await client.openProfile(profile.id); // url 可选，Donut 默认 https://browserleaks.com/ip
  const cdp = await client.getCdp(profile.id); // http://localhost:9222 | null
  console.log(cdp, proxy);

  await client.closeProfile(profile.id);
  // await client.close(); // 关闭客户端进程本身
}
```

## Publish

```bat
publish.bat
```
