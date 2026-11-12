/* shoot.mjs --pre：关掉首次启动的「预览版说明」弹窗，等侧栏出现「尤诺主题」，点开主区设置页。 */
(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /* 新 profile 会弹官方引导弹窗，先关掉（点不到就跳过，不影响结论） */
  const deadline0 = Date.now() + 8000;
  while (Date.now() < deadline0) {
    const buttons = Array.from(document.querySelectorAll("button"));
    const cont = buttons.find((b) => {
      const text = (b.textContent || "").trim();
      return text === "继续" || b.getAttribute("aria-label") === "关闭";
    });
    if (cont) {
      cont.click();
      await sleep(700);
      continue;
    }
    await sleep(200);
    if (Date.now() > deadline0 - 4000) break;
  }

  const deadline = Date.now() + 20000;
  let row = null;
  while (Date.now() < deadline) {
    row = document.querySelector('button[aria-label="尤诺主题"]');
    if (row) break;
    await sleep(200);
  }
  if (!row) return { found: false };
  row.click();
  await sleep(1600);
  const host = document.querySelector(".yn-settings-page-host");
  const root = document.querySelector("#yn-settings");
  return {
    found: true,
    host: host !== null,
    pageMode: root !== null && root.classList.contains("yn-settings--page"),
    text: root ? (root.innerText || "").replace(/\s+/g, " ").slice(0, 60) : null,
  };
})()
