/**
 * dsh-iuno-widget-desktop — browser half（侧栏「尤诺主题」一行 + 主区主题设置页）
 *
 * 手写 classic script：模块系统把 lib/client.js 原样下发，所以本文件直接处于
 * `window.__ModuleLoader__.load({ id, factory })` 形态，不需要打包。只 require
 * `react`（shell 的平台种子模块），不引其它依赖。
 *
 * 它做两件事（DSH 0.2.2 的槽位契约，参考 dsh-context 的真实实现）：
 *   1. `main`（keyed 槽）注册 key=`iuno-theme` 的主区页面；
 *   2. `sidebar.panellist`（list 槽）注册 id=`iuno-theme` 的侧栏行，
 *      label=尤诺主题、glyph=月牙 SVG；点击后 layout 把 activePanelId 设为
 *      `iuno-theme`，MainPanel 按 key 渲染第 1 步注册的页面。
 *
 * 页面不重写设置 UI：现有面板（lib/theme-settings.js，由宿主插件以注入行加载）
 * 暴露 `window.__ynMountSettingsPage(hostEl[, tabId]) -> cleanup`，这里只负责
 * 渲染 `.yn-settings-page-host` 容器并在 effect 里把面板搬进来、卸载时归还。
 * 钩子不存在 / 挂载失败时显示「设置面板未加载」，绝不抛错白屏。
 *
 * 样式由主题 CSS（lib/theme-settings.css 的 page 模式）负责；图标用
 * `currentColor` + `.yn-moon-glyph` 类，便于皮肤 CSS 覆盖成金色/月白。
 */
window.__ModuleLoader__.load({
  id: "dsh-iuno-widget-desktop",
  factory: function (require) {
    "use strict";

    var React = require("react");

    /* ── 常量 ──────────────────────────────────────────────────────────────── */
    var PLUGIN_ID = "dsh-iuno-widget-desktop";
    /** main 槽的 key 与 sidebar.panellist 槽的 id，必须一致（layout 按 id 找 key）。 */
    var PANEL_ID = "iuno-theme";
    /** 侧栏排序：官方「上下文洞察/更多」之后（dsh-context 用 20）。 */
    var PANEL_ORDER = 30;
    var PANEL_LABEL = "尤诺主题";
    /** 页面模式由主题设置面板提供：把 #yn-settings 挂进本容器。 */
    var MOUNT_HOOK = "__ynMountSettingsPage";
    var HOST_CLASS = "yn-settings-page-host";
    var MISSING_TEXT = "设置面板未加载";
    /** 钩子晚到（脚本尚未执行完）时的重试节奏：约 5 秒。 */
    var RETRY_MS = 200;
    var RETRY_MAX = 25;

    /* ── 小工具：任何失败都只告警，不影响其它插件 / 不白屏 ─────────────────── */
    function warn(message, error) {
      try {
        if (error === undefined) console.warn("[" + PLUGIN_ID + "] " + message);
        else console.warn("[" + PLUGIN_ID + "] " + message, error);
      } catch (e) {
        /* console 不可用时静默 */
      }
    }

    function safe(fn, fallback) {
      try {
        return fn();
      } catch (e) {
        warn("call failed", e);
        return fallback;
      }
    }

    /* ── 侧栏图标：尤诺月牙（1.1px 细线，颜色跟随 currentColor）────────────
     * 父级 panelGlyph 已有颜色与尺寸约束，这里只画路径；皮肤 CSS 可用
     * `.yn-moon-glyph` / `.yn-moon-glyph path` 覆盖成金发丝色。 */
    function MoonGlyph(props) {
      var size = props && typeof props.size === "number" ? props.size : 18;
      return React.createElement(
        "svg",
        {
          className: "yn-moon-glyph",
          width: size,
          height: size,
          viewBox: "0 0 24 24",
          fill: "none",
          xmlns: "http://www.w3.org/2000/svg",
          "aria-hidden": "true",
          focusable: "false",
        },
        React.createElement("path", {
          d: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z",
          stroke: "currentColor",
          strokeWidth: 1.1,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          vectorEffect: "non-scaling-stroke",
        })
      );
    }

    /* ── 主区页面：容器 + 把现有设置面板挂进去（不重写 UI）─────────────────── */
    function SettingsPage() {
      var hostRef = React.useRef(null);
      var missingState = React.useState(false);
      var missing = missingState[0];
      var setMissing = missingState[1];

      React.useEffect(function () {
        var host = hostRef.current;
        if (!host) return undefined;

        var disposed = false;
        var cleanup = null;
        var timer = null;
        var tries = 0;

        function unmountPanel() {
          if (typeof cleanup !== "function") {
            cleanup = null;
            return;
          }
          var fn = cleanup;
          cleanup = null;
          try {
            fn();
          } catch (e) {
            warn("settings page cleanup failed", e);
          }
        }

        function mountPanel() {
          if (disposed || cleanup !== null) return true;
          var mount = window[MOUNT_HOOK];
          if (typeof mount !== "function") return false;
          try {
            cleanup = mount(host);
            setMissing(false);
          } catch (e) {
            warn("settings page mount failed", e);
            cleanup = null;
            setMissing(true);
          }
          return true;
        }

        function retry() {
          timer = null;
          if (disposed) return;
          if (mountPanel()) return;
          tries += 1;
          if (tries >= RETRY_MAX) {
            setMissing(true);
            return;
          }
          timer = window.setTimeout(retry, RETRY_MS);
        }

        retry();

        return function () {
          disposed = true;
          if (timer !== null) {
            window.clearTimeout(timer);
            timer = null;
          }
          unmountPanel();
        };
      }, []);

      return React.createElement(
        "div",
        {
          ref: hostRef,
          className: HOST_CLASS,
          "data-yn-settings-page": "",
          style: {
            flex: "1 1 auto",
            minHeight: 0,
            position: "relative",
            display: "flex",
            flexDirection: "column",
          },
        },
        missing
          ? React.createElement(
              "div",
              {
                className: "yn-settings-page-missing",
                style: {
                  padding: "28px 30px",
                  color: "var(--dsw-alias-label-secondary, #8a8a8a)",
                  fontSize: "13px",
                  letterSpacing: "0.04em",
                },
              },
              MISSING_TEXT
            )
          : null
      );
    }

    /* ── 插件面 ────────────────────────────────────────────────────────────── */
    var name = PLUGIN_ID;
    var inject = ["slots"];

    /** 在槽位可用后注册；返回 disposer，交给 ctx.effect 管生命周期。 */
    function injectSlot(ctx, slotName, build, label) {
      return ctx.effect(function () {
        return ctx.slots.inject(slotName, build);
      }, PLUGIN_ID + ": " + label);
    }

    function apply(ctx) {
      try {
        if (!ctx || !ctx.slots || typeof ctx.slots.inject !== "function") {
          warn("ctx.slots is unavailable; theme panel not registered");
          return;
        }

        // 1) 主区页面：main 是 keyed 槽，key 必须与侧栏行 id 一致。
        safe(function () {
          injectSlot(
            ctx,
            "main",
            function () {
              return ctx.slots.register(
                { name: "main", key: PANEL_ID },
                SettingsPage
              );
            },
            "main slot (theme settings page)"
          );
        }, null);

        // 2) 侧栏行：sidebar.panellist 是 list 槽，按 order 升序渲染。
        safe(function () {
          injectSlot(
            ctx,
            "sidebar.panellist",
            function () {
              return ctx.slots.register(
                {
                  name: "sidebar.panellist",
                  id: PANEL_ID,
                  order: PANEL_ORDER,
                  label: function () {
                    return PANEL_LABEL;
                  },
                },
                MoonGlyph
              );
            },
            "sidebar panellist entry"
          );
        }, null);
      } catch (e) {
        // 客户端 bundle 出问题不能拖垮整个启动：只告警，界面保持原样。
        warn("apply failed; sidebar theme entry disabled", e);
      }
    }

    var exported = { name: name, inject: inject, apply: apply };
    return exported;
  },
});
