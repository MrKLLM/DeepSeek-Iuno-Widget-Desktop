/* 在临时 DSH 主机页面里验证客户端插件：侧栏「尤诺主题」一行 + 主区设置页。
 * 由 verify/tools/eval-page.mjs 通过 CDP 执行，返回一个 JSON 对象。 */
(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const result = {
    title: document.title,
    moduleLoaderMode: window.__ModuleLoader__ ? window.__ModuleLoader__.mode : null,
    mountHookType: typeof window.__ynMountSettingsPage,
    boot: null,
    rowFound: false,
    rowLabel: null,
    rowHtml: null,
    glyphClass: null,
    glyphPath: null,
    clickError: null,
    hostFound: false,
    hostRect: null,
    settingsRootFound: false,
    settingsPageMode: false,
    settingsHidden: false,
    settingsParentClass: null,
    settingsText: null,
    missingText: false,
    activePanelAttr: null,
    cleanup: null,
    bodyHasModuleError: null,
  };

  try {
    if (window.__DSH_BOOT__) {
      const bootText = JSON.stringify(window.__DSH_BOOT__);
      result.boot = {
        hasEntry: bootText.indexOf("dsh-iuno-widget-desktop") !== -1,
        entriesSample: (window.__DSH_BOOT__.entries || window.__DSH_BOOT__.modules || []).slice
          ? (window.__DSH_BOOT__.entries || window.__DSH_BOOT__.modules || []).slice(0, 3)
          : null,
      };
    }

    const deadline = Date.now() + 20000;
    let row = null;
    while (Date.now() < deadline) {
      row = document.querySelector('button[aria-label="尤诺主题"]');
      if (row) break;
      await sleep(200);
    }
    result.rowFound = row !== null;
    if (row) {
      result.rowLabel = row.getAttribute("aria-label");
      const svg = row.querySelector("svg");
      if (svg) {
        result.glyphClass = svg.getAttribute("class");
        const path = svg.querySelector("path");
        result.glyphPath = path ? {
          stroke: path.getAttribute("stroke"),
          width: path.getAttribute("stroke-width"),
          d: path.getAttribute("d"),
        } : null;
      }
      result.rowHtml = row.outerHTML.slice(0, 500);

      try {
        row.click();
      } catch (error) {
        result.clickError = String((error && error.message) || error);
      }
      await sleep(1200);

      const host = document.querySelector(".yn-settings-page-host");
      result.hostFound = host !== null;
      if (host) {
        const rect = host.getBoundingClientRect();
        result.hostRect = { width: Math.round(rect.width), height: Math.round(rect.height) };
        result.activePanelAttr = host.closest("[data-global-panel]") !== null;
      }
      const root = document.querySelector("#yn-settings");
      result.settingsRootFound = root !== null;
      if (root) {
        result.settingsPageMode = root.classList.contains("yn-settings--page");
        result.settingsHidden = root.hasAttribute("hidden");
        result.settingsParentClass = root.parentElement ? root.parentElement.className : null;
        result.settingsText = (root.innerText || "").replace(/\s+/g, " ").slice(0, 160);
      }
      result.missingText = document.body.innerText.indexOf("设置面板未加载") !== -1;

      /* 切回会话：点「新建会话」应卸载主区页面并归还 #yn-settings（cleanup 生效） */
      const newSession = document.querySelector('button[aria-label="新建会话"]');
      if (newSession) {
        newSession.click();
        await sleep(900);
        const rootAfter = document.querySelector("#yn-settings");
        result.cleanup = {
          hostGone: document.querySelector(".yn-settings-page-host") === null,
          rootStillThere: rootAfter !== null,
          pageClassAfter: rootAfter ? rootAfter.classList.contains("yn-settings--page") : null,
          hiddenAfter: rootAfter ? rootAfter.hasAttribute("hidden") : null,
          parentClassAfter: rootAfter && rootAfter.parentElement ? rootAfter.parentElement.tagName : null,
        };
      }
    }

    const bodyText = document.body.innerText || "";
    result.bodyHasModuleError =
      bodyText.indexOf("client-modules") !== -1 ||
      bodyText.indexOf("Failed to load") !== -1 ||
      bodyText.indexOf("无法加载") !== -1;
  } catch (error) {
    result.evalError = String((error && error.stack) || error);
  }
  return result;
})()
