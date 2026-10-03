# @woosau/fingerprint-browser-control

多指纹浏览器控制库。各浏览器按目录拆分（含各自 `openapi.json`），根入口统一导出主类。

## Install

```bash
npm i @woosau/fingerprint-browser-control
```

## Usage

```ts
import { DonutBrowser } from "@woosau/fingerprint-browser-control";
// 以后例如：
// import { CloakBrowser } from "@woosau/fingerprint-browser-control";

const client = new DonutBrowser({
  // baseUrl 可选，默认 http://127.0.0.1:10108
  baseUrl: "http://127.0.0.1:10108",
  token: "YOUR_LOCAL_API_TOKEN",
  // exeName 可选；指定后只匹配/启动该文件。
  // 未指定时 Windows 优先级: Donut.exe → donutbrowser.exe；其它平台: Donut
});

if (!(await client.isRunning())) {
  await client.start("F:\\data\\local\\Donut-Portable");
}

await client.getBrowsersVersions();
const { profiles } = await client.listProfilesWithProxies();
const profile = await client.getProfile(profiles[0].id);
// profile.remote_debugging_port：运行中时为 CDP 端口，否则 null
await client.openUrl(profile.id, "https://browserleaks.com/ip");
await client.closeProfile(profile.id); // POST /v1/profiles/{id}/kill
// await client.close(); // 关闭 Donut 进程本身
```

## Publish

```bat
publish.bat
```
