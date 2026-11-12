/* 客户端 bundle 单元冒烟：不启动 DSH，只按模块系统契约执行 lib/client.js，
 * 检查 __ModuleLoader__ 注册、factory 返回值、两个槽位注册的 options，
 * 以及月牙图标 / 设置页容器的结构、__ynMountSettingsPage 的挂载与清理。
 * 运行：node verify/client-slot-smoke.mjs
 * 这是 verify/ 下的临时验证文件，不随插件发布。
 */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE = fs.readFileSync(path.join(ROOT, "lib", "client.js"), "utf8");
const PACKAGE = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

const results = [];
function ok(name, extra = "") {
  results.push("  ok   " + name + (extra ? "  " + extra : ""));
}
function fail(name, error) {
  results.push("  FAIL " + name + "  " + String((error && error.stack) || error));
}

/* ── 1. package.json 契约 ─────────────────────────────────────────────────── */
try {
  assert.equal(PACKAGE.exports["./client"], "./lib/client.js", "exports['./client']");
  assert.equal(PACKAGE.exports["."], "./lib/index.js", "exports['.'] 保留宿主入口");
  assert.equal(PACKAGE.dsh.client.platform, "web", "dsh.client.platform");
  assert.deepEqual(PACKAGE.dsh.client.inject, [
    "@deepseek-ai/dsh-client-ui-layout",
    "@deepseek-ai/dsh-client-ui-sidebar",
  ]);
  assert.ok(fs.existsSync(path.join(ROOT, "lib", "client.js")), "client.js 存在");
  ok("package.json: exports['./client'] + dsh.client(platform/inject) 正确");
} catch (e) {
  fail("package.json 契约", e);
}

/* ── 2. 假 React / 假 window / 假 ctx，执行 bundle ────────────────────────── */
const fakeState = {
  effects: [],
  refs: [],
  states: [],
  render(type, props, ...children) {
    return { type, props: props || {}, children };
  },
};
const fakeReact = {
  createElement: fakeState.render,
  useRef(initial) {
    const ref = { current: initial === undefined ? null : initial };
    fakeState.refs.push(ref);
    return ref;
  },
  useState(initial) {
    const entry = { value: initial, setCalls: [] };
    fakeState.states.push(entry);
    return [
      entry.value,
      (next) => {
        entry.value = next;
        entry.setCalls.push(next);
      },
    ];
  },
  useEffect(fn) {
    fakeState.effects.push(fn);
    return undefined;
  },
};

const registrations = [];
const hookSlot = { mount: undefined, cleanupCalls: 0 };
const fakeWindow = {
  __ModuleLoader__: {
    load(registration) {
      registrations.push(registration);
    },
  },
  __ynMountSettingsPage: undefined,
  timers: [],
  setTimeout(fn) {
    fakeWindow.timers.push(fn);
    return fakeWindow.timers.length;
  },
  clearTimeout(id) {
    if (typeof id === "number") fakeWindow.timers[id - 1] = null;
  },
};

let bundleExports = null;
try {
  // 用当前 realm 的 Function 包一层，等价于模块系统执行 classic script。
  const run = new Function("window", "console", SOURCE);
  run(fakeWindow, { warn() {}, log() {}, error() {} });
  assert.equal(registrations.length, 1, "script 只注册一个 bundle");
  const registration = registrations[0];
  assert.equal(registration.id, "dsh-iuno-widget-desktop", "registration.id 必须是包名");
  assert.equal(typeof registration.factory, "function", "factory 是函数");
  bundleExports = registration.factory((spec) => {
    assert.equal(spec, "react", "只允许 require('react')");
    return fakeReact;
  });
  assert.equal(bundleExports.name, "dsh-iuno-widget-desktop");
  assert.deepEqual(bundleExports.inject, ["slots"]);
  assert.equal(typeof bundleExports.apply, "function");
  ok("bundle: __ModuleLoader__.load -> factory -> {name,inject:['slots'],apply}");
} catch (e) {
  fail("bundle 执行", e);
}

/* ── 3. apply 注册 main / sidebar.panellist ───────────────────────────────── */
const injected = [];
const registrationsSeen = [];
const effectLabels = [];
try {
  const ctx = {
    effect(fn, label) {
      effectLabels.push(label);
      const disposer = fn();
      assert.equal(typeof disposer, "function", "effect 回调返回 disposer");
      return () => {};
    },
    slots: {
      inject(name, build) {
        injected.push(name);
        const disposer = build();
        assert.equal(typeof disposer, "function", "slots.inject 回调返回 disposer");
        return disposer;
      },
      register(options, component) {
        registrationsSeen.push({ options, component });
        return () => {};
      },
    },
  };
  bundleExports.apply(ctx);
  assert.deepEqual(injected, ["main", "sidebar.panellist"], "按序注入两个槽");
  assert.equal(effectLabels.length, 2, "两次 ctx.effect 托管");

  const mainReg = registrationsSeen.find((r) => r.options.name === "main");
  assert.ok(mainReg, "注册 main 槽");
  assert.equal(mainReg.options.key, "iuno-theme", "main key = iuno-theme");
  assert.equal(typeof mainReg.component, "function", "main 组件是函数组件");

  const panelReg = registrationsSeen.find((r) => r.options.name === "sidebar.panellist");
  assert.ok(panelReg, "注册 sidebar.panellist 槽");
  assert.equal(panelReg.options.id, "iuno-theme", "panellist id = iuno-theme（与 main key 一致）");
  assert.equal(panelReg.options.order, 30, "order = 30");
  assert.equal(typeof panelReg.options.label, "function", "label 是函数");
  assert.equal(panelReg.options.label(), "尤诺主题", "label() = 尤诺主题");
  ok("apply: main(key=iuno-theme) + sidebar.panellist(id=iuno-theme, order=30, label=尤诺主题)");
} catch (e) {
  fail("apply 槽位注册", e);
}

/* ── 4. 月牙图标结构 ──────────────────────────────────────────────────────── */
try {
  const glyphReg = registrationsSeen.find((r) => r.options.name === "sidebar.panellist");
  const glyph = glyphReg.component({ size: 16, active: true });
  assert.equal(glyph.type, "svg", "图标根是 svg");
  assert.equal(glyph.props.className, "yn-moon-glyph", "图标 class 供皮肤 CSS 命中");
  assert.equal(glyph.props.width, 16, "size 透传");
  assert.equal(glyph.props["aria-hidden"], "true");
  assert.equal(glyph.children.length, 1, "一个 path");
  const pathNode = glyph.children[0];
  assert.equal(pathNode.type, "path");
  assert.equal(pathNode.props.stroke, "currentColor", "描边 currentColor，随深浅色");
  assert.ok(pathNode.props.d === "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z", "月牙路径");
  assert.ok(pathNode.props.strokeWidth <= 1.2, "细线（<=1.2px）");
  ok("MoonGlyph: svg.yn-moon-glyph + 1.1px currentColor 月牙");
} catch (e) {
  fail("月牙图标", e);
}

/* ── 5. 设置页容器 + 钩子挂载 / 清理 ─────────────────────────────────────── */
try {
  const mainReg = registrationsSeen.find((r) => r.options.name === "main");
  const pageState = { mountCalls: [], cleanup: null };
  fakeWindow.__ynMountSettingsPage = (host) => {
    pageState.mountCalls.push(host);
    pageState.cleanup = () => {
      hookSlot.cleanupCalls += 1;
    };
    return pageState.cleanup;
  };
  fakeState.refs.length = 0;
  fakeState.effects.length = 0;
  const tree = mainReg.component({});
  assert.equal(tree.type, "div");
  assert.equal(tree.props.className, "yn-settings-page-host", "外层 class yn-settings-page-host");
  assert.equal(typeof tree.props.ref, "object", "带 ref");
  assert.ok(tree.props.style.flex === "1 1 auto" && tree.props.style.minHeight === 0, "flex 容器撑满主区");
  assert.equal(fakeState.effects.length, 1, "一个 useEffect");
  const ref = fakeState.refs[0];
  ref.current = { nodeType: 1 };
  const cleanup = fakeState.effects[0]();
  assert.equal(pageState.mountCalls.length, 1, "调用了 __ynMountSettingsPage(host)");
  assert.equal(pageState.mountCalls[0], ref.current, "传入容器元素");
  cleanup();
  assert.equal(hookSlot.cleanupCalls, 1, "卸载时调用钩子的 cleanup");
  ok("SettingsPage: host 容器结构 + mount/cleanup 生命周期正确");

  /* 5b. 钩子不存在：重试后显示「设置面板未加载」，不抛错 */
  const mainReg2 = mainReg;
  fakeWindow.__ynMountSettingsPage = undefined;
  fakeWindow.timers.length = 0;
  fakeState.refs.length = 0;
  fakeState.effects.length = 0;
  fakeState.states.length = 0;
  mainReg2.component({});
  const ref2 = fakeState.refs[0];
  ref2.current = { nodeType: 1 };
  const missingCleanup = fakeState.effects[0]();
  // 手动跑重试定时器，直到失败兜底（RETRY_MAX = 25）
  for (let i = 0; i < 40; i += 1) {
    const timer = fakeWindow.timers.find((fn) => typeof fn === "function");
    if (timer === undefined) break;
    const at = fakeWindow.timers.indexOf(timer);
    fakeWindow.timers[at] = null;
    timer();
  }
  assert.equal(fakeWindow.timers.filter((fn) => typeof fn === "function").length, 0, "重试结束");
  assert.equal(fakeState.states.length, 1, "一个 missing state");
  assert.ok(fakeState.states[0].setCalls.includes(true), "最终把 missing 置为 true（显示兜底文案）");
  assert.equal(typeof missingCleanup, "function", "仍返回 cleanup，卸载不抛错");
  missingCleanup();
  ok("SettingsPage: 钩子缺失 -> 重试后兜底「设置面板未加载」且不抛错");
} catch (e) {
  fail("设置页容器 / 钩子", e);
}

/* ── 输出 ────────────────────────────────────────────────────────────────── */
console.log("client-slot-smoke:");
for (const line of results) console.log(line);
if (results.some((line) => line.includes("FAIL"))) process.exit(1);
console.log("ALL PASS");
