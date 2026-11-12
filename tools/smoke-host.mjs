/* 桌面端尤诺皮肤宿主插件 —— 离线冒烟测试
 * 用假 ctx 挂载 lib/index.js，检查：路由注册、注入行、静态资源、配置读写、余额回退。
 * 不改动真实 profile：DSH_HOME / DSH_PROFILE_DIR 指向临时目录。
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { pathToFileURL } from 'node:url'

const PKG = path.resolve(import.meta.dirname, '..')
const TMP = path.join(process.env.TEMP, 'dsh-iuno-verify', 'state')
fs.rmSync(TMP, { recursive: true, force: true })
fs.mkdirSync(TMP, { recursive: true })
process.env.DSH_HOME = TMP
process.env.DSH_PROFILE_DIR = path.join(TMP, 'profiles', 'desktop')
fs.mkdirSync(process.env.DSH_PROFILE_DIR, { recursive: true })

function makeCtx({ account } = {}) {
  const routes = new Map()
  const listeners = new Map()
  const cleanups = []
  const ctx = {
    webServer: {
      register(route) {
        assert.equal(routes.has(route.path), false, 'duplicate route ' + route.path)
        assert.ok(route.kind === 'exact' || route.kind === 'prefix', 'unexpected route kind ' + route.kind)
        routes.set(route.path, route)
        return () => routes.delete(route.path)
      },
    },
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, [])
      listeners.get(event).push(fn)
      return () => {}
    },
    effect(fn) {
      const dispose = fn()
      if (typeof dispose === 'function') cleanups.push(dispose)
      return () => {}
    },
    get(name) {
      if (name === 'deepseekAccount') return account
      return undefined
    },
    credentials: { resolve: async () => undefined },
    logger: () => ({ warn() {}, info() {}, error() {} }),
  }
  return { ctx, routes, listeners }
}

function fakeRes() {
  const res = new EventEmitter()
  res.headers = null
  res.status = null
  res.body = null
  res.writeHead = (status, headers) => { res.status = status; res.headers = headers || {} }
  res.end = (body) => { res.body = body }
  return res
}

function fakeReq(method, url, body, headers = {}) {
  const req = new EventEmitter()
  req.method = method
  req.url = url
  req.headers = headers
  setImmediate(() => {
    if (body !== undefined) req.emit('data', Buffer.isBuffer(body) ? body : Buffer.from(body))
    req.emit('end')
  })
  return req
}

const results = []
function ok(name, extra = '') { results.push('  ok   ' + name + (extra ? '  ' + extra : '')) }

const mod = await import(pathToFileURL(path.join(PKG, 'lib', 'index.js')).href)
assert.equal(mod.name, 'iuno-moon-widget-desktop')
assert.deepEqual(mod.inject, ['webServer', 'credentials'])

/* ── 1. 未登录 / 无 API key：路由 + 注入行 + 静态资源 ───────────────────── */
{
  const { ctx, routes, listeners } = makeCtx()
  mod.apply(ctx)

  const expected = [
    '/dsh-iuno/wall.jpg', '/dsh-iuno/pet.png', '/dsh-iuno/size.json', '/dsh-iuno/balance.json',
    '/dsh-iuno/theme.css', '/dsh-iuno/pet.css', '/dsh-iuno/desktop.css', '/dsh-iuno/intro.css',
    '/dsh-iuno/intro-moon.css', '/dsh-iuno/theme-settings.css',
    '/dsh-iuno/theme.js', '/dsh-iuno/pet.js', '/dsh-iuno/trail.js', '/dsh-iuno/intro-moon.js',
    '/dsh-iuno/intro.js', '/dsh-iuno/theme-settings.js',
    '/dsh-iuno/intro', '/dsh-iuno/bg',
  ]
  for (const p of expected) assert.ok(routes.has(p), 'missing route ' + p)
  assert.equal(routes.get('/dsh-iuno/intro').kind, 'prefix')
  assert.equal(routes.get('/dsh-iuno/bg').kind, 'prefix')
  ok('注册 ' + routes.size + ' 条路由（含 intro / bg 两条前缀）')

  // 注入行：模拟宿主 collectIndexInjections() 的 emit
  const table = []
  for (const fn of listeners.get('webserver/index-inject') || []) fn(table)
  const kinds = table.map((r) => r.kind)
  assert.deepEqual(kinds, ['html', 'html', 'html', 'html', 'html', 'html', 'script', 'script-src', 'script-src', 'script-src', 'script-src', 'script-src', 'script-src'])
  assert.match(table[0].html, /^<style id="yn-skin-css-theme">/)
  assert.match(table[0].html, /--yn-gold/)
  assert.match(table[2].html, /^<style id="yn-skin-css-desktop">/)
  assert.match(table[3].html, /^<style id="yn-skin-css-intro">/)
  assert.match(table[3].html, /#yn-intro/)
  assert.match(table[4].html, /^<style id="yn-skin-css-intro-moon">/)
  assert.match(table[4].html, /yn-moon-canvas/)
  assert.match(table[5].html, /^<style id="yn-skin-css-settings">/)
  assert.match(table[5].html, /#yn-settings/)
  // 回归保护：皮肤图层一律不得声明 -webkit-app-region。
  // 壁纸层是 position:fixed; inset:0，一旦声明 no-drag，Chromium 会把这整条
  // 原生拖拽条从可拖拽区里减掉 —— 窗口就再也拖不动了（v1.0.0 的 bug）。
  const desktopCss = String(table[2].html).replace(/\/\*[\s\S]*?\*\//g, '')
  assert.doesNotMatch(desktopCss, /-webkit-app-region/)
  assert.doesNotMatch(String(table[4].html), /-webkit-app-region/)
  assert.match(desktopCss, /data-windows-titlebar/)
  assert.equal(table[0].placement, 'head')
  for (const i of [1, 2, 3, 4, 5]) assert.equal(table[i].placement, 'head')
  assert.match(table[6].text, /dsh-iuno\/theme\.css/)
  assert.deepEqual(table.slice(7).map((r) => r.src), [
    '/dsh-iuno/theme.js', '/dsh-iuno/pet.js', '/dsh-iuno/trail.js',
    '/dsh-iuno/intro-moon.js', '/dsh-iuno/intro.js', '/dsh-iuno/theme-settings.js',
  ])
  ok('注入行 ' + table.length + ' 条（6 内联 style + 1 刷新器 + 6 script-src；入场默认关闭、无首帧遮罩行）')

  async function get(p) {
    const res = fakeRes()
    await routes.get(p).handler(fakeReq('GET', p), res)
    return res
  }

  const css = await get('/dsh-iuno/theme.css')
  assert.equal(css.status, 200)
  assert.equal(css.headers['Content-Type'], 'text/css; charset=utf-8')
  assert.equal(css.headers['Cache-Control'], 'no-store')
  assert.match(String(css.body), /--yn-gold/)
  ok('theme.css 路由', String(css.body).length + ' 字节')

  const wall = await get('/dsh-iuno/wall.jpg')
  assert.equal(wall.status, 200)
  assert.equal(wall.headers['Content-Type'], 'image/jpeg')
  assert.equal(wall.body.length, fs.statSync(PKG + '/assets/iuno-wall.jpg').size)
  ok('内置壁纸路由', wall.body.length + ' 字节')

  const pet = await get('/dsh-iuno/pet.png')
  assert.equal(pet.status, 200)
  assert.equal(pet.headers['Content-Type'], 'image/png')
  ok('桌宠贴图路由', pet.body.length + ' 字节')

  const js = await get('/dsh-iuno/pet.js')
  assert.match(String(js.body), /__dshIunoPet/)
  assert.match(String(js.body), /重启 DeepSeek Harness/)
  ok('pet.js 路由（桌面端文案已替换）')

  // 入场影片 / 海报：前缀路由只下发白名单文件名，穿越路径必须 404
  const introRoute = routes.get('/dsh-iuno/intro')
  const badIntro = fakeRes()
  await introRoute.handler(fakeReq('GET', '/dsh-iuno/intro/../package.json'), badIntro)
  assert.equal(badIntro.status, 404)
  const introAssetDir = path.join(PKG, 'assets', 'intro')
  const pvVideo = path.join(introAssetDir, 'pv.mp4')
  const pvPoster = path.join(introAssetDir, 'pv-poster.jpg')
  if (fs.existsSync(pvVideo) && fs.existsSync(pvPoster)) {
    const vres = fakeRes()
    await introRoute.handler(fakeReq('GET', '/dsh-iuno/intro/pv.mp4'), vres)
    assert.equal(vres.status, 200)
    assert.equal(vres.headers['Content-Type'], 'video/mp4')
    assert.equal(vres.headers['Accept-Ranges'], 'bytes')
    const ptotal = fs.statSync(pvVideo).size
    assert.equal(vres.body.length, ptotal)
    const rres = fakeRes()
    await introRoute.handler(fakeReq('GET', '/dsh-iuno/intro/pv.mp4', undefined, { range: 'bytes=0-99' }), rres)
    assert.equal(rres.status, 206)
    assert.equal(rres.headers['Content-Range'], 'bytes 0-99/' + ptotal)
    assert.equal(rres.body.length, 100)
    ok('入场影片路由（200 / Range 206，白名单防穿越）', ptotal + ' 字节')
  } else {
    ok('入场影片路由（素材未就绪，跳过 200 断言）')
  }

  // 动态壁纸：前缀路由只下发白名单文件名
  const bgRoute = routes.get('/dsh-iuno/bg')
  const badBg = fakeRes()
  await bgRoute.handler(fakeReq('GET', '/dsh-iuno/bg/../package.json'), badBg)
  assert.equal(badBg.status, 404)
  const loopPath = path.join(PKG, 'assets', 'bg', 'loop.mp4')
  if (fs.existsSync(loopPath)) {
    const hres = fakeRes()
    await bgRoute.handler(fakeReq('HEAD', '/dsh-iuno/bg/loop.mp4'), hres)
    assert.equal(hres.status, 200)
    assert.equal(hres.headers['Content-Type'], 'video/mp4')
    assert.equal(hres.headers['Content-Length'], String(fs.statSync(loopPath).size))
    ok('动态壁纸路由（HEAD 200 / 白名单防穿越）', fs.statSync(loopPath).size + ' 字节')
  } else {
    ok('动态壁纸路由（素材未就绪，跳过 200 断言）')
  }

  // 入场影片路由已在上面验证；v1.8 的粒子月亮不依赖额外 JSON 资产。
  ok('开场粒子月亮（内置 canvas，无额外路由资产）')

  const size = await get('/dsh-iuno/size.json')
  assert.equal(size.status, 200)
  const sizeJson = JSON.parse(String(size.body))
  assert.equal(sizeJson.profile, 'desktop')
  assert.equal(sizeJson.ambience, 1)
  assert.equal(sizeJson.wallBrightness, 0.86)
  assert.equal(sizeJson.introEnabled, false)
  assert.equal(sizeJson.introMode, 'every')
  assert.equal(sizeJson.introVideo, 'pv')
  assert.ok(Array.isArray(sizeJson.introPresets))
  assert.deepEqual(sizeJson.introPresets.map((p) => p.id), ['pv', 'gacha', 'gacha-short'])
  assert.equal(typeof sizeJson.introVolume, 'number')
  assert.equal(sizeJson.introVolume, 0)
  assert.equal(typeof sizeJson.moonIntroEnabled, 'boolean')
  assert.equal(typeof sizeJson.loopWallpaperEnabled, 'boolean')
  assert.equal(sizeJson.bgMode, 'image')
  assert.equal(typeof sizeJson.veilLight, 'number')
  assert.equal(typeof sizeJson.veilDark, 'number')
  assert.equal(typeof sizeJson.uiAlpha, 'number')
  assert.equal(typeof sizeJson.motion, 'number')
  assert.ok(sizeJson.bgVideos && sizeJson.bgVideos.loop)
  ok('size.json 默认值（入场默认关闭 + 4 预设 + 音量/片尾/背景参数）', JSON.stringify({
    introEnabled: sizeJson.introEnabled, introVideo: sizeJson.introVideo, bgMode: sizeJson.bgMode,
    introVolume: sizeJson.introVolume, moonIntro: sizeJson.moonIntroEnabled,
  }))

  // 写配置：应落在桌面 profile 目录
  const res = fakeRes()
  await routes.get('/dsh-iuno/size.json').handler(
    fakeReq('POST', '/dsh-iuno/size.json', JSON.stringify({ wallBrightness: 0.62 }), { 'content-type': 'application/json' }),
    res,
  )
  assert.equal(res.status, 200)
  assert.equal(JSON.parse(String(res.body)).wallBrightness, 0.62)
  const stateFile = path.join(process.env.DSH_PROFILE_DIR, '.dshy-size.json')
  assert.ok(fs.existsSync(stateFile), 'state file not written to the desktop profile dir')
  assert.equal(JSON.parse(fs.readFileSync(stateFile, 'utf8')).wallBrightness, 0.62)
  ok('写配置落到 profiles/desktop/.dshy-size.json')

  // 显示 / 背景 / 播放时机参数：同一接口白名单透传
  const looks = fakeRes()
  await routes.get('/dsh-iuno/size.json').handler(
    fakeReq('POST', '/dsh-iuno/size.json', JSON.stringify({
      veilLight: 0.05, veilDark: 0.3, uiAlpha: 0.8, wallDim: 0.1, wallBlur: 4,
      motion: 0.5, bgMode: 'image', introMode: 'once',
    }), { 'content-type': 'application/json' }),
    looks,
  )
  assert.equal(looks.status, 200)
  const looksParsed = JSON.parse(String(looks.body))
  assert.equal(looksParsed.veilLight, 0.05)
  assert.equal(looksParsed.veilDark, 0.3)
  assert.equal(looksParsed.uiAlpha, 0.8)
  assert.equal(looksParsed.wallDim, 0.1)
  assert.equal(looksParsed.wallBlur, 4)
  assert.equal(looksParsed.motion, 0.5)
  assert.equal(looksParsed.bgMode, 'image')
  assert.equal(looksParsed.introMode, 'once')
  const looksAgain = JSON.parse(String((await get('/dsh-iuno/size.json')).body))
  assert.equal(looksAgain.veilLight, 0.05)
  assert.equal(looksAgain.bgMode, 'image')
  assert.equal(looksAgain.introMode, 'once')
  ok('显示 / 背景 / 播放时机参数落盘', JSON.stringify({ veilLight: looksAgain.veilLight, bgMode: looksAgain.bgMode, introMode: looksAgain.introMode }))

  // 入场开关 / 影片选择：写回 size.json；开启后注入表多一条首帧遮罩行
  const ires = fakeRes()
  await routes.get('/dsh-iuno/size.json').handler(
    fakeReq('POST', '/dsh-iuno/size.json', JSON.stringify({ introEnabled: true, introVideo: 'pv' }), { 'content-type': 'application/json' }),
    ires,
  )
  assert.equal(ires.status, 200)
  const introParsed = JSON.parse(String(ires.body))
  assert.equal(introParsed.introEnabled, true)
  assert.equal(introParsed.introVideo, 'pv')
  const sizeAgain = JSON.parse(String((await get('/dsh-iuno/size.json')).body))
  assert.equal(sizeAgain.introEnabled, true)
  assert.equal(sizeAgain.introVideo, 'pv')
  const { ctx: enabledCtx, listeners: enabledListeners } = makeCtx()
  mod.apply(enabledCtx)
  const enabledTable = []
  for (const fn of enabledListeners.get('webserver/index-inject') || []) fn(enabledTable)
  const bootRow = enabledTable.find((r) => r.kind === 'script' && /data-yn-intro/.test(String(r.text)))
  assert.ok(bootRow, 'missing intro boot veil row after enabling intro')
  assert.match(String(bootRow.text), /data-yn-intro/)
  ok('入场开关落盘 + 开启后下发首帧遮罩行')

  // 上传壁纸 + 复位
  const up = fakeRes()
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3])
  await routes.get('/dsh-iuno/wall.jpg').handler(
    fakeReq('POST', '/dsh-iuno/wall.jpg', bytes, { 'content-type': 'image/jpeg' }),
    up,
  )
  assert.equal(up.status, 200)
  assert.equal(JSON.parse(String(up.body)).ok, true)
  const custom = path.join(process.env.DSH_PROFILE_DIR, '.dshy-wall-custom.bin')
  assert.deepEqual(fs.readFileSync(custom), bytes)
  const served = await get('/dsh-iuno/wall.jpg')
  assert.deepEqual(served.body, bytes)
  const reset = fakeRes()
  await routes.get('/dsh-iuno/wall.jpg').handler(fakeReq('POST', '/dsh-iuno/wall.jpg?reset=1'), reset)
  assert.equal(JSON.parse(String(reset.body)).wallCustom, false)
  assert.equal(fs.existsSync(custom), false)
  ok('自定义壁纸上传 / 复位往返')

  const bal = await get('/dsh-iuno/balance.json')
  assert.equal(bal.status, 200)
  const balJson = JSON.parse(String(bal.body))
  assert.equal(balJson.ok, false)
  assert.match(balJson.error, /未登录账号/)
  ok('余额回退提示', balJson.error)
}

/* ── 2. 已登录账号：充值 + 赠送两组钱包，合成可用余额 ───────────────────── */
{
  const calls = []
  const account = {
    async getState() { return { status: 'credential-stored', links: {}, attempt: null } },
    async getBalance(client) {
      calls.push(client)
      return {
        status: 'ready',
        // 平台返回的是带长尾数的十进制字符串，必须归一成「分」
        value: [{ currency: 'CNY', balance: '9.957584100000000' }],
        bonusWallets: [{ currency: 'CNY', balance: '5.350802880000000' }],
      }
    },
  }
  const { ctx, routes } = makeCtx({ account })
  mod.apply(ctx)
  const res = fakeRes()
  await routes.get('/dsh-iuno/balance.json').handler(fakeReq('GET', '/dsh-iuno/balance.json'), res)
  const body = JSON.parse(String(res.body))
  assert.equal(body.ok, true)
  assert.equal(body.source, 'account')
  assert.deepEqual(body.balances, [
    { currency: 'CNY', total: 15.31, toppedUp: 9.96, granted: 5.35 },
  ])
  assert.equal(calls.length, 1)
  assert.equal(typeof calls[0].version, 'string')
  assert.equal(typeof calls[0].timezoneOffsetSeconds, 'number')
  ok('账号钱包：充值+赠送 合成可用余额', JSON.stringify(body.balances))
}

/* ── 3. 多币种 + 只有赠送余额 ──────────────────────────────────────────── */
{
  const account = {
    async getState() { return { status: 'credential-stored', links: {}, attempt: null } },
    async getBalance() {
      return {
        status: 'ready',
        value: [{ currency: 'CNY', balance: '0' }, { currency: 'USD', balance: '1.005' }],
        bonusWallets: [{ currency: 'USD', balance: '0.5' }],
      }
    },
  }
  const { ctx, routes } = makeCtx({ account })
  mod.apply(ctx)
  const res = fakeRes()
  await routes.get('/dsh-iuno/balance.json').handler(fakeReq('GET', '/dsh-iuno/balance.json'), res)
  const body = JSON.parse(String(res.body))
  assert.deepEqual(body.balances, [
    { currency: 'CNY', total: 0, toppedUp: 0, granted: 0 },
    { currency: 'USD', total: 1.51, toppedUp: 1.01, granted: 0.5 },
  ])
  ok('多币种钱包合并', JSON.stringify(body.balances))
}

/* ── 4. 缓存与强制刷新：无 force 走宿主 60s 缓存，?force=1 必须重新查 ────── */
{
  let calls = 0
  const account = {
    async getState() { return { status: 'credential-stored', links: {}, attempt: null } },
    async getBalance() {
      calls++
      return { status: 'ready', value: [{ currency: 'CNY', balance: String(10 + calls) }], bonusWallets: [] }
    },
  }
  const { ctx, routes } = makeCtx({ account })
  mod.apply(ctx)
  const get = async (q) => {
    const res = fakeRes()
    await routes.get('/dsh-iuno/balance.json').handler(fakeReq('GET', '/dsh-iuno/balance.json' + (q || '')), res)
    return JSON.parse(String(res.body))
  }
  const a = await get()
  assert.equal(a.balances[0].total, 11)
  assert.equal(calls, 1)
  const b = await get()
  assert.equal(b.balances[0].total, 11)
  assert.equal(calls, 1, '第二次（无 force）应命中缓存')
  const c = await get('?force=1')
  assert.equal(c.balances[0].total, 12, '?force=1 应重新查询')
  assert.equal(calls, 2)
  const d = await get('?force=1')
  assert.equal(d.balances[0].total, 13)
  assert.equal(calls, 3)
  ok('余额缓存：无 force 命中缓存，?force=1 强制刷新', 'calls=' + calls)
}

console.log(results.join('\n'))
console.log('\n全部通过：' + results.length + ' 项')
