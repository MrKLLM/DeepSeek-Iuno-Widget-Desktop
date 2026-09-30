# DSH 尤诺主题 · 桌面端（DeepSeek Iuno Skin for Desktop）

![preview](assets/preview.png)

把 **DeepSeek Harness 桌面端**（Electron 客户端）的界面铺上指定的尤诺立绘作背景，
UI 保持纤细极简——侧栏一缕玻璃、按钮一格金边、发送一弯月。

本包是 web 版 [`dsh-iuno-widget`](../DeepSeek-Iuno-Widget) 的**桌面端适配版**：
视觉与功能一致（壁纸、金色发丝线、氛围星尘、鼠标流光、右下角桌宠 + 右键小面板、
壁纸亮度滑杆、更换背景、余额小签），但**注入通道换成了桌面端唯一生效的那条**。

> 桌面端专用。web 端请继续用 `dsh-iuno-widget`：两者的 head 注入位置不同
> （web 把注入行插在 `<head>` 之后，桌面端 append 到 `</head>` 之前），
> 皮肤样式在 web 端会被应用自身 CSS 反压。

## 为什么 web 版在桌面端不生效

| | web（`dsh web`） | 桌面端（Electron） |
| --- | --- | --- |
| 页面来源 | 宿主 HTTP 服务渲染 `index.html`（`dsh-host-frontend-static` → `webServer.renderIndex()`） | 自定义协议 `dsh-app://app/`，`index.html` 由 Electron 自己发（`serveWebDocument`） |
| 注入通道 | 结构化注入行 **+** `webServer.tapIndex()` 拼字符串 | 只有**结构化注入行**：宿主 `webServer.collectIndexInjections()` 的行经 IPC 交给前端，前端启动 Cordis 前逐行应用（`global` / `script` / `script-src` / `style` / `html`） |
| `tapIndex` | 生效 | **完全不生效**（不读、不渲染）→ 旧版的 `<link>` / `<script>` 全部丢失 |
| 插件路由 | 直接访问 `http://127.0.0.1:3080/dsh-iuno/*` | Electron 把 `dsh-app://app/dsh-iuno/*` 转发给宿主 HTTP 服务并代挂鉴权 cookie，行为等价 |
| 端口 | 默认 3080 | 固定 19387（`--no-open --port 19387`） |

所以本包**只用结构化注入行**：

- `html` 行 —— `<style id="yn-skin-css-…">` 内联 `theme.css` / `pet.css` / `desktop.css`，进页面即生效、不闪白；
- `script` 行 —— 一小段刷新器：页面起来后再从 `/dsh-iuno/*.css` 拉一次最新文本覆盖内联副本，
  于是「改 CSS → 刷新页面」这个工作流在桌面端依然成立，不必重启应用；
- `script-src` 行 —— `theme.js` / `pet.js` / `trail.js`，前端会 `await` 其加载完成再启动界面。

其余全部沿用 web 版：路由仍是 `webServer.register`，桌面端转发过来的路径与页面同源
（`dsh-app://app/dsh-iuno/…`），因此不会触发 CORS 预检，上传壁纸、写配置与 web 版一致。

## 桌面端额外适配

- **余额小签读登录账号**：桌面端通常用 DeepSeek 账号登录（`deepseek-account`），
  没有 `DEEPSEEK_API_KEY`。`/dsh-iuno/balance.json` 现在优先调
  `ctx.deepseekAccount.getBalance()` 读账号钱包（含赠送余额），未登录时才回退
  本地 API key + 官方 `/user/balance`。
- **配置落在桌面 profile**：写入 `~/.dsh/profiles/desktop/`（各 profile 互不干扰），
  读取顺序为 `profiles/desktop` → `~/.dsh` → `profiles/web`，
  所以首次在桌面端运行会继承 web 版已设的亮度 / 自定义壁纸。
- **窗口拖拽（皮肤里绝不写 `-webkit-app-region`）**：Windows 的拖拽来自
  `titleBarStyle:'hidden'` + `titleBarOverlay` 提供的原生拖拽条（顶部 40px），
  而 Chromium 会把显式声明 `no-drag` 的元素从可拖拽区里**减掉**。壁纸层是
  `position:fixed; inset:0`，一旦声明 `no-drag` 就正好盖掉整条标题栏 —— 窗口再也拖不动
  （v1.0.0 的 bug，v1.1.1 修）。所以 `lib/desktop.css` 里一条 `app-region` 都不写；
  图层不吃事件靠 `pointer-events:none`（壁纸 / 星尘 / 流光），桌宠在右下角、
  不在拖拽条范围内。macOS 侧应用自己会处理 `body>:not(#root){-webkit-app-region:no-drag}`。
- **原生标题栏**：Windows 顶部 40px 由 `titleBarOverlay` 绘制（颜色在创建窗口时定为
  应用自身 chrome 色 `#1b1b1c`），插件无法着色，这一段本来也看不见壁纸；
  星尘因此从标题栏下沿开始画。

## 安装（桌面 profile 由 Electron 应用独占管理）

桌面端 profile 不能用普通 `dsh --profile desktop` 启动，插件也得用**应用自带的 CLI** 装：

- **方式一：在这个桌面应用里让 Agent 装（推荐）**
  > 请把 `link:<本包绝对路径>` 安装到 desktop profile（plugin_manager → install_bundle）。

- **方式二：手工调用应用自带的 CLI**
  ```powershell
  $exe  = "C:\Users\<你>\AppData\Local\Programs\DeepSeek Harness\DeepSeek Harness.exe"
  $cli  = "C:\Users\<你>\AppData\Local\Programs\DeepSeek Harness\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js"
  $env:ELECTRON_RUN_AS_NODE = "1"
  & $exe $cli plugin --profile desktop add link:D:\Programing\kllmtmp\DeepSeek-Iuno-Widget-Desktop
  ```
  （`link:` 后紧跟绝对路径，中间不要空格；不要写成 `link:.\<子目录>`。）

装完 **必须完全退出并重开 DeepSeek Harness**：注入表是宿主启动时收集、由 Electron
一次性交给渲染器的，热加载的插件不会出现在当前窗口里。

## 生效与调试

- **重启应用**后界面即换肤；之后：
  - 改 `lib/pet.js`、`lib/theme.js`、`lib/trail.js` → 刷新页面（`Ctrl+R`）即可（脚本走 `script-src` 行，`no-store`）；
  - 改 `lib/*.css` → 刷新页面即可（注入的是内联副本，页面加载后会被刷新器覆盖成最新文本）。
- **改宿主逻辑（`lib/index.js` 的路由 / 余额 / 读写）、`cordis.patch.yml`、`package.json`、
  新增资源路由** → 需要重启应用：宿主插件是进程内 ESM，重启才会重新加载。
- 壁纸亮度、氛围浓度、自定义壁纸都写进 `~/.dsh/profiles/desktop/.dshy-size.json`
  和 `.dshy-wall-custom.bin`；右键桌宠打开面板即可拖滑杆、换背景、恢复默认。

## 选择器约定（改 CSS 前必读）

DSH 前端不给组件稳定类名，只有「哈希 + 可读名」，而且当前构建里**两种写法并存**：

```css
._2H3hWW_newSession        /* 旧命名：前导下划线 */
.Dc7zOa_composerStack      /* 新命名：无前导下划线 */
```

哈希与可读名之间总有一个下划线，所以皮肤统一用 `[class*="_可读名"]`（两种命名都命中）。
坑在于：**前缀相同的内部变体会被一起命中**——例如
`[class*="_newSession"]` 会同时命中按钮内部的 `newSessionContent`（于是边框和月牙被套两层，
表现为按钮里出现两个半月牙），所以外层规则必须用 `:not()` 排掉内部变体：

| 目标 | 规则写法 |
| --- | --- |
| 新会话按钮 | `[class*="_newSession"]:not([class*="Label"]):not([class*="Content"]):not([class*="Shortcut"])` |
| 发送按钮 | `[class*="_primary"]:not([class*="Button"]):not([class*="Option"]):not([class*="Item"])` |
| 输入卡 | `[class*="_card"]:not([class*="Workspace"]):not([class*="Icon"]):not([class*="Content"])` |
| 图标按钮 | `[class*="_iconButton"]:not([class*="Danger"])` |
| 药丸触发器 | `[class*="_trigger"]:not([class*="Label"]):not([class*="Icon"]):not([class*="Effort"])` |
| 起始页标题文字 | `<span>` 自己没有类名，只能按结构取：`[class*="titleGroup"] > span:first-child` |

`lib/theme.css` 顶部的第 0 节把这份约定写进了文件本身，改之前先看一眼。

## 修订记录

- **v1.1.2**
  - 修「余额小签不更新」：旧代码取到一次就把 `balanceLoaded` 置真、之后再也不请求，
    于是页面加载后余额就**定格**在第一次读到的数字上。现在悬停小签、打开右键面板都会
    重新读（客户端 20s 节流），并带 `?force=1` 让宿主跳过 60s 缓存；失败时不再锁死状态。
    注意：客户端改动刷新页面即生效，宿主侧的 `?force=1` 支持需要重启应用。
- **v1.1.1**
  - **修窗口拖不动**：`lib/desktop.css` 里给壁纸 / 星尘 / 流光 / 桌宠加的
    `-webkit-app-region: no-drag` 会把整条原生拖拽条从可拖拽区里减掉（壁纸层是
    `inset:0`，正好覆盖标题栏），现在一条 `app-region` 都不写；
    `tools/smoke-host.mjs` 加了「皮肤不得声明 app-region」的回归保护。
- **v1.1.0（桌面端修正）**
  - 修「新会话」按钮被套两层：`[class*="_newSession"]` 误命中内部 `newSessionContent`、
    `newSessionShortcut`，现在只剩按钮本身（`lib/theme.css`）。
  - 余额小签按分显示并标注赠送：平台返回的是 `9.957584100000000` 这种长尾数字符串，
    宿主按分归一并把「充值 / 赠送」两组钱包合成可用余额，前端显示 `¥15.31 · 赠送 ¥5.35`
    （`lib/index.js` + `lib/pet.js`）。
  - 起始页标题的月光扫字重新生效：原 `_headlineText` 在当前构建已不存在，
    改为结构选择器。
  - 危险态图标按钮不再被金色 hover 覆盖；模型药丸的 `triggerEffort`（推理档位）不再跟着药丸一起被高亮。
  - `lib/theme.css` 新增第 0 节「选择器约定」，把上面这张表沉淀进文件。
  - 新增 `tools/audit-selectors.mjs`：直接读应用 `app.asar` 里的构建产物收集真实类名，
    对每条规则求值，报出 DEAD（类名换了，样式静默失效）与 RISK（命中同模块内部变体，会套两层）。
    本次两个界面错误就是它找出来的。

## 自检（可选）

两个不依赖 Electron 界面的检查脚本（Node 即可跑）：

```powershell
# 1) 宿主插件冒烟测试：路由 / 注入行 / 静态资源 / 配置读写 / 余额回退
#    用假 ctx 挂载 lib/index.js，写入临时 DSH_HOME，不碰真实 profile
node tools\smoke-host.mjs

# 2) 真实启动桌面 profile（与 Electron 完全相同的引导路径）做端到端验证：
#    打印宿主交给渲染器的注入表，再带鉴权 cookie 抓取 index 与 /dsh-iuno/*
#    DSH_HOME 请指向一个临时目录（脚本会读 <DSH_HOME>\profiles\desktop）
$env:DSH_APP_DIR   = "C:\Users\<你>\AppData\Local\Programs\DeepSeek Harness"
$env:DSH_HOME      = "$env:TEMP\dsh-iuno-verify\home\.dsh"
$env:DSH_PROFILE_DIR = "$env:DSH_HOME\profiles\desktop"
$env:ELECTRON_RUN_AS_NODE = "1"
& "$env:DSH_APP_DIR\DeepSeek Harness.exe" tools\verify-boot.mjs
```

期望结果：注入表里出现 3 条 `<style id="yn-skin-css-…">` 的 `html` 行、
1 条刷新器 `script` 行、3 条 `/dsh-iuno/*.js` 的 `script-src` 行，
并且 10 条 `/dsh-iuno/*` 路由全部 200。

## 目录结构

```text
DeepSeek-Iuno-Widget-Desktop/
├── package.json
├── cordis.patch.yml          # bundle 挂载声明（insert dsh-iuno-widget-desktop）
├── README.md
├── lib/
│   ├── index.js              # 宿主插件：结构化注入行 + /dsh-iuno/* 路由 + 账号余额
│   ├── theme.css             # 整站皮肤（与 web 版一致）
│   ├── pet.css               # 桌宠与右键面板样式（与 web 版一致）
│   ├── desktop.css           # 桌面端适配层（拖拽 / 原生标题栏）
│   ├── theme.js              # 壁纸 + 氛围层
│   ├── pet.js                # 桌宠行为（浮动 / 歪头 / 台词 / 右键面板）
│   └── trail.js              # 鼠标流光（canvas 月光丝带）
├── assets/
│   ├── iuno-wall.jpg         # 界面壁纸（2560×1440）
│   ├── iuno-pet.png          # 桌宠贴纸（透明底）
│   ├── Iuno-Q.png            # Q 版素材源图
│   └── preview.png           # README 预览图
└── tools/
    ├── make_pet_sprite.py    # 由源图生成桌宠贴纸
    ├── smoke-host.mjs        # 宿主插件冒烟测试（假 ctx，不动真实 profile）
    ├── verify-boot.mjs       # 真实启动桌面 profile 的端到端验证
    └── audit-selectors.mjs   # 选择器体检：拿真实类名撞规则，找 DEAD / 套两层
```

## 卸载

```powershell
# Agent：plugin_manager → remove_bundle，target = dsh-iuno-widget-desktop
# 或应用自带 CLI：
& $exe $cli plugin --profile desktop remove dsh-iuno-widget-desktop
```

然后重启应用。

## 常见问题

- **界面没变化**：先确认装的是 desktop profile（`~/.dsh/profiles/desktop/package.json` 的
  `dsh.profile.bundles` 里出现 `dsh-iuno-widget-desktop`），再**完全重启应用**。
- **装完启动异常**：把 `bundles` 里的 `dsh-iuno-widget-desktop` 删掉（或改回上一次的 `package.json`）再启动。
- **余额小签显示「未登录账号…」**：桌面端用账号登录即可；用 API key 时需在模型设置里配 `DEEPSEEK_API_KEY`。
- **顶部有一条深色横条**：Windows 原生标题栏（`titleBarOverlay`），皮肤改不了，属正常现象。
- **想微调金色**：`--yn-gold`、`--yn-hair` 在 `lib/theme.css` 顶部，改一个值整站跟着变（改完刷新页面）。

## 许可证

MIT License，详见 [LICENSE](LICENSE)。

`assets/iuno-wall.jpg`、`assets/iuno-pet.png`、`assets/Iuno-Q.png` 为角色素材，
版权归原作者及游戏发行方所有，仅供个人学习与本地使用，请勿商用。
