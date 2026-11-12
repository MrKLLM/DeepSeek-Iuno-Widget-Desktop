/* 真实启动桌面端 profile（与 Electron 完全相同的引导路径）做端到端验证：
 *   loadProfileDirectory → runProfile（profile: desktop）
 * 然后打印宿主实际交给 Electron 的注入表，并用带鉴权 cookie 的请求抓取
 * 渲染后的 index.html 与 /dsh-iuno/* 路由。
 * 运行：ELECTRON_RUN_AS_NODE=1 "<app exe>" verify-boot.mjs
 */
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const APP = process.env.DSH_APP_DIR || 'C:/Users/KLLM/AppData/Local/Programs/DeepSeek Harness'
const runtimeDir = APP + '/resources/app.asar/dsh'
const installAnchor = join(runtimeDir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
const profileDir = join(process.env.DSH_HOME, 'profiles', 'desktop')

const mod = (p) => import(pathToFileURL(runtimeDir + '/node_modules/@deepseek-ai/' + p).href)
const appBoot = await mod('dsh-app-boot/lib/index.js')
const profileBoot = await mod('dsh/lib/profile-boot.js')

const profile = appBoot.loadProfileDirectory('dsh', profileDir, installAnchor)
appBoot.reportSkippedBundles('dsh', profile)
console.log('layers: ' + profile.layers.map((l) => l.packageName).join(', '))
console.log('profile patches: ' + profile.patches.length)

const application = profileBoot.runProfile({
  environment: appBoot.loadLayeredEnv('dsh'),
  profile: 'desktop',
  resolvedProfile: { profile, installAnchor },
  patchFiles: [],
  args: ['--no-open', '--port', '19388'],
})

const { ctx } = await application
const origin = 'http://127.0.0.1:' + String(ctx.webServer.port)
const url = ctx.connection.authenticatedUrl(origin)
console.log('HOST_URL ' + url.replace(/([?&]token=)[^&]*/u, '$1<redacted>'))

/* 1) 宿主收集的注入表 —— Electron 就是把这批行经 IPC 交给前端渲染器的
 *   注意：0.2.2 的 collectIndexInjections(peer) 需要 Peer 参数，裸调可能抛错；
 *   这里只做诊断输出，拿不到就打印错误继续。 */
let rows = []
try {
  rows = ctx.webServer.collectIndexInjections()
} catch (e) {
  console.log('INJECTIONS_ERROR ' + String((e && e.message) || e))
}
console.log('INJECTIONS ' + JSON.stringify(rows.map((r) => ({
  kind: r.kind,
  placement: r.placement,
  ref: r.src || r.name || (r.html ? String(r.html).slice(0, 40) : (r.text ? String(r.text).slice(0, 40) : undefined)),
  bytes: r.html ? r.html.length : (r.text ? r.text.length : undefined),
}))))
console.log('INJECTIONS has intro css: ' + rows.some((r) => String(r.html || '').includes('yn-skin-css-intro')))
console.log('INJECTIONS has intro js: ' + rows.some((r) => r.src === '/dsh-iuno/intro.js'))
console.log('INJECTIONS has intro boot veil: ' + rows.some((r) => r.kind === 'script' && String(r.text || '').includes('data-yn-intro')))

/* 2) 带鉴权换 cookie，再抓 served index + 插件路由 */
const auth = await fetch(url, { redirect: 'manual' })
const cookie = (auth.headers.get('set-cookie') || '').split(';')[0]
console.log('AUTH status=' + auth.status + ' cookie=' + (cookie ? cookie.split('=')[0] + '=...' : 'none'))
await auth.body?.cancel()

const index = await fetch(origin + '/', { headers: { cookie } })
const html = await index.text()
console.log('INDEX status=' + index.status + ' bytes=' + html.length)
console.log('INDEX has style row: ' + html.includes('<style id="yn-skin-css-theme">'))
console.log('INDEX has pet css row: ' + html.includes('<style id="yn-skin-css-pet">'))
console.log('INDEX has desktop css row: ' + html.includes('<style id="yn-skin-css-desktop">'))
console.log('INDEX has intro css row: ' + html.includes('<style id="yn-skin-css-intro">'))
console.log('INDEX has refresh script: ' + html.includes('yn-skin-css-theme'))
console.log('INDEX has theme.js: ' + html.includes('src="/dsh-iuno/theme.js"'))
console.log('INDEX has pet.js: ' + html.includes('src="/dsh-iuno/pet.js"'))
console.log('INDEX has trail.js: ' + html.includes('src="/dsh-iuno/trail.js"'))
console.log('INDEX has intro.js: ' + html.includes('src="/dsh-iuno/intro.js"'))
console.log('INDEX has boot ready: ' + html.includes('__DSH_BOOT_READY__'))

for (const p of ['/dsh-iuno/theme.css', '/dsh-iuno/pet.css', '/dsh-iuno/desktop.css', '/dsh-iuno/intro.css', '/dsh-iuno/theme.js', '/dsh-iuno/pet.js', '/dsh-iuno/trail.js', '/dsh-iuno/intro.js', '/dsh-iuno/pet.png', '/dsh-iuno/wall.jpg', '/dsh-iuno/size.json', '/dsh-iuno/balance.json']) {
  const r = await fetch(origin + p, { headers: { cookie } })
  const body = await r.arrayBuffer()
  console.log('ROUTE ' + p + ' -> ' + r.status + ' ' + (r.headers.get('content-type') || '') + ' ' + body.byteLength + 'B')
}
// 入场素材用 HEAD，避免诊断脚本把 7MB 视频整个拉下来
for (const p of ['/dsh-iuno/intro/pv.mp4', '/dsh-iuno/intro/pv-poster.jpg']) {
  const r = await fetch(origin + p, { method: 'HEAD', headers: { cookie } })
  console.log('HEAD ' + p + ' -> ' + r.status + ' ' + (r.headers.get('content-type') || '') + ' ' + (r.headers.get('content-length') || '') + 'B ranges=' + (r.headers.get('accept-ranges') || ''))
}

const shutdown = await application.catch(() => undefined)
await shutdown?.shutdown?.shutdown(0)
console.log('DONE')
process.exit(0)
