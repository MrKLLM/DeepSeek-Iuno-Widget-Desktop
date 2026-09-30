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
        routes.set(route.path, route)
        if (route.kind !== 'exact') throw new Error('expected exact route')
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
    '/dsh-iuno/theme.css', '/dsh-iuno/pet.css', '/dsh-iuno/desktop.css',
    '/dsh-iuno/theme.js', '/dsh-iuno/pet.js', '/dsh-iuno/trail.js',
  ]
  for (const p of expected) assert.ok(routes.has(p), 'missing route ' + p)
  ok('注册 ' + routes.size + ' 条精确路由')

  // 注入行：模拟宿主 collectIndexInjections() 的 emit
  const table = []
  for (const fn of listeners.get('webserver/index-inject') || []) fn(table)
  const kinds = table.map((r) => r.kind)
  assert.deepEqual(kinds, ['html', 'html', 'html', 'script', 'script-src', 'script-src', 'script-src'])
  assert.match(table[0].html, /^<style id="yn-skin-css-theme">/)
  assert.match(table[0].html, /--yn-gold/)
  assert.match(table[2].html, /^<style id="yn-skin-css-desktop">/)
  // 回归保护：皮肤图层一律不得声明 -webkit-app-region。
  // 壁纸层是 position:fixed; inset:0，一旦声明 no-drag，Chromium 会把这整条
  // 原生拖拽条从可拖拽区里减掉 —— 窗口就再也拖不动了（v1.0.0 的 bug）。
  const desktopCss = String(table[2].html).replace(/\/\*[\s\S]*?\*\//g, '')
  assert.doesNotMatch(desktopCss, /-webkit-app-region/)
  assert.match(desktopCss, /data-windows-titlebar/)
  assert.equal(table[0].placement, 'head')
  for (const i of [1, 2]) assert.equal(table[i].placement, 'head')
  assert.match(table[3].text, /dsh-iuno\/theme\.css/)
  assert.deepEqual(table.slice(4).map((r) => r.src), [
    '/dsh-iuno/theme.js', '/dsh-iuno/pet.js', '/dsh-iuno/trail.js',
  ])
  ok('注入行 ' + table.length + ' 条（3 内联 style + 1 刷新器 + 3 script-src）')

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

  const size = await get('/dsh-iuno/size.json')
  assert.equal(size.status, 200)
  const sizeJson = JSON.parse(String(size.body))
  assert.equal(sizeJson.profile, 'desktop')
  assert.equal(sizeJson.ambience, 1)
  assert.equal(sizeJson.wallBrightness, 0.86)
  ok('size.json 默认值', JSON.stringify(sizeJson))

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
