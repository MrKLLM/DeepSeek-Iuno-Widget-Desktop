# 客户端插件端到端验证（侧栏「尤诺主题」+ 主区设置页）

`lib/client.js` 是 `dsh-iuno-widget-desktop` 的 browser half，本次用**临时 DSH_HOME +
最小 desktop profile + Electron 同款引导**（DSH 0.2.2）实测通过，没有改真实 `~/.dsh`。

## 结果（2026-11-08 21:25）

| 项 | 结果 |
| --- | --- |
| 宿主启动（`boot-host.mjs`） | `READY`，除官方 telemetry 配置缺失 warning 外无报错；`client-modules` 无错误 |
| 客户端 bundle 进 boot 图 | `dsh-iuno-widget-desktop/client.js` 出现在 index 的 application preload 组合串里，`__DSH_BOOT__` 有该 entry |
| `window.__ModuleLoader__.mode` | `live`（bundle 已被模块系统接受并物化） |
| 侧栏行 | `button[aria-label="尤诺主题"]`，位于「插件 / 自动化任务」之后、「更多」之前；glyph = `.yn-moon-glyph` 1.1px `currentColor` 月牙 |
| 点击行为 | 无异常；`layout.selectPanel('iuno-theme')` 成功，主区出现 `.yn-settings-page-host`（1618×1046，`data-global-panel`） |
| 设置页 | `#yn-settings` 被搬进 host（`.yn-settings--page`，未 hidden），内容为现有「尤诺主题 · 设置」四个 tab（启动动画/背景/显示/关于） |
| 兜底 | `window.__ynMountSettingsPage` 存在（宿主插件注入行）→ 未出现「设置面板未加载」 |
| 卸载清理 | 切回会话（点「新建会话」）后 host 移除、`#yn-settings` 归还 `BODY`、page class 移除并 hidden |
| 截图 | `shots/theme-panel.png`（浅色，侧栏行高亮 + 主区设置页） |

页面内取值结果见 `eval-result.json`；截图见 `shots/theme-panel.png`。

## 复跑步骤

1. 建临时 home 与最小 profile（**不要把 link 写进真实 `~/.dsh`**）：

```
verify/host-test/dsh-home/profiles/desktop/package.json:
{
  "name": "dsh-profile-desktop",
  "private": true,
  "dsh": { "profile": { "bundles": [
    "@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-iuno-widget-desktop" ] } },
  "dependencies": { "dsh-iuno-widget-desktop": "link:D:/Programing/kllmtmp/DeepSeek-Iuno-Widget-Desktop" }
}
```

然后在 `profiles/desktop/node_modules/` 下建目录 junction：

```
cmd /c mklink /J "<profile>\node_modules\dsh-iuno-widget-desktop" "D:\Programing\kllmtmp\DeepSeek-Iuno-Widget-Desktop"
```

2. 起宿主（端口自选）：

```
$env:ELECTRON_RUN_AS_NODE='1'
$env:DSH_HOME='<verify>\host-test\dsh-home'
$env:DSH_PROFILE_DIR='<verify>\host-test\dsh-home\profiles\desktop'
$env:VERIFY_HOST_PORT='19462'
& 'C:\Users\KLLM\AppData\Local\Programs\DeepSeek Harness\DeepSeek Harness.exe' `
  'D:\Programing\kllmtmp\DeepSeek-Iuno-Intro\verify\boot-host.mjs'
```

输出里拿 `AUTH_URL`（含 token），保持进程不退出。

3. 页面内验证 + 截图（工具在 `DeepSeek-Iuno-Intro/verify/tools/`）：

```
node eval-page.mjs --url "<AUTH_URL>" --wait 9000 --eval "<verify>\host-test\eval-client-panel.js" --port 19471
node shoot.mjs --url "<AUTH_URL>" --out "<verify>\host-test\shots\theme-panel.png" --wait 2500 `
  --pre "<verify>\host-test\pre-open-theme-panel.js" --port 19472 --width 1680 --height 1100
```

4. 收尾：结束宿主进程 → `cmd /c rmdir <junction>`（**只摘链接**，不要 `rm -rf`）→ 删
   `dsh-home/`；清掉 `%TEMP%\dsh-cdp-*`（两个 CDP 工具会各留一个临时 Chrome user-data 目录）。

## 未覆盖 / 注意

- 本次最小 profile 只挂了 3 个 bundle，没有加载真实 desktop profile 的其它第三方插件；
  Lead 总装后应在**真实临时 profile**（复制 `~/.dsh/profiles/desktop` 再换 link）里再跑一次端到端。
- 深浅色：截图只有浅色（临时 profile 默认主题）；图标走 `currentColor` + 主题 CSS，
  颜色适配由 Lead 的 CSS 负责，未单独验证深色。
- `package.json` 的 `exports` 额外保留了 `"."` 与 `"./package.json"`：只声明 `"./client"`
  会让 Node 侧 `import('dsh-iuno-widget-desktop')` 因 exports 封装而失败（宿主入口解析），
  与 dsh-context / dsh-accountdisplayname-edit 两个真实插件的写法一致。
