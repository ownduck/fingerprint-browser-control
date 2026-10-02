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
});

await client.getBrowsersVersions();
const { profiles } = await client.listProfilesWithProxies();
await client.openUrl(profiles[0].id, "https://browserleaks.com/ip");
```

## Publish

```bat
publish.bat
```
