import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/* ============================================================================
 * dsh-iuno-widget-desktop · v1.0.0
 * DeepSeek Harness 桌面端（Electron）尤诺整站皮肤 —— 宿主插件
 * ----------------------------------------------------------------------------
 * 与 web 版（dsh-iuno-widget）的唯一结构差别是「CSS / JS 怎么进页面」：
 *
 *   web 端：页面由宿主 HTTP 服务渲染，dsh-host-frontend-static 调
 *           webServer.renderIndex()，结构化注入行与 tapIndex 都会被写进
 *           index.html 文本，所以旧版用 tapIndex 拼 <link>/<script>。
 *
 *   桌面端：渲染器从自定义协议 dsh-app://app/ 取静态 dist（Electron 的
 *           serveWebDocument），index.html 由 Electron 自己发出，宿主只把
 *           webServer.collectIndexInjections() 的注入表（IndexInjection[]）
 *           经 IPC 交给前端；前端在启动 Cordis 之前逐行应用：
 *             global / script / script-src / style / html
 *           —— tapIndex 在桌面端【完全不生效】（不读、不渲染）。
 *
 * 所以本插件只走结构化注入行（webserver/index-inject）：
 *   · html 行   —— <style id=…> 内联三份 CSS，进页面即生效，不闪白；
 *   · script 行 —— 一小段刷新器：页面起来后再从 /dsh-iuno/*.css 拉一次最新
 *                  文本覆盖内联副本，于是「改 CSS → 刷新页面」在桌面端依然
 *                  成立（无需重启应用）；
 *   · script-src 行 —— theme.js / pet.js / trail.js，前端会 await 其加载。
 *
 * 路由依旧走 webServer.register：Electron 会把 dsh-app://app/<path> 转发到
 * 宿主 HTTP 服务并代挂鉴权 cookie，因此 /dsh-iuno/* 的静态资源、壁纸上传、
 * 配置读写与 web 版完全一致。相对路径（/dsh-iuno/…）在桌面端是
 * dsh-app://app/dsh-iuno/…，与页面同源，不会触发预检。
 *
 * 注入行的渲染顺序：web 把 head 行插在 <head> 之后（会输给应用自身 CSS），
 * 桌面端把 head 行 append 到 </head> 之前（晚于应用 CSS，皮肤赢）——
 * 因此本包是桌面端专用，web 端请继续用 dsh-iuno-widget。
 * ==========================================================================*/

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LIB_DIR = path.join(PACKAGE_ROOT, 'lib')
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
/** 桌面端 profile 目录（DSH_PROFILE_DIR 由应用注入；缺失时按约定推导）。 */
const PROFILE_DIR = process.env.DSH_PROFILE_DIR || path.join(DSH_HOME, 'profiles', 'desktop')

const ROUTE_BASE = '/dsh-iuno'

/* ── 静态资源表：路由与注入行共用同一份清单，避免两处走偏 ──────────────── */
const TEXT_ASSETS = {
  'theme.css': 'text/css; charset=utf-8',
  'pet.css': 'text/css; charset=utf-8',
  'desktop.css': 'text/css; charset=utf-8',
  'theme.js': 'application/javascript; charset=utf-8',
  'pet.js': 'application/javascript; charset=utf-8',
  'trail.js': 'application/javascript; charset=utf-8',
}
/** CSS 先内联（不闪白），再交给刷新器保持可热改。 */
const STYLE_ASSETS = [
  { id: 'yn-skin-css-theme', file: 'theme.css' },
  { id: 'yn-skin-css-pet', file: 'pet.css' },
  { id: 'yn-skin-css-desktop', file: 'desktop.css' },
]
const SCRIPT_ASSETS = ['theme.js', 'pet.js', 'trail.js']

const ASSET_CANDIDATES = {
  wall: [path.join(PACKAGE_ROOT, 'assets', 'iuno-wall.jpg'), path.join(PACKAGE_ROOT, 'assets', 'iuno-wall.png')],
  pet: [path.join(PACKAGE_ROOT, 'assets', 'iuno-pet.png')],
}

/* ── 状态文件 ──────────────────────────────────────────────────────────────
 * 写入：桌面端 profile 目录优先（各 profile 互不干扰），失败再退到 DSH_HOME。
 * 读取：桌面 profile → DSH_HOME → web profile，取第一个存在的；
 *       于是首次在桌面端运行时能继承 web 版已有的亮度 / 自定义壁纸。      */
const STATE_DIRS = [...new Set([PROFILE_DIR, DSH_HOME, path.join(DSH_HOME, 'profiles', 'web')])]
const SIZE_FILE_CANDIDATES = STATE_DIRS.map((d) => path.join(d, '.dshy-size.json'))
const WALL_CUSTOM_CANDIDATES = STATE_DIRS.map((d) => path.join(d, '.dshy-wall-custom.bin'))

const DEFAULT_WALL_BRIGHTNESS = 0.86
const WALL_BRIGHTNESS_MIN = 0.4
const WALL_BRIGHTNESS_MAX = 1.0
// 自定义壁纸上传上限 ~20MB
const WALL_UPLOAD_MAX = 20 * 1024 * 1024

function clampBrightness(v) {
  const n = Number(v)
  if (!isFinite(n)) return DEFAULT_WALL_BRIGHTNESS
  return Math.round(Math.max(WALL_BRIGHTNESS_MIN, Math.min(WALL_BRIGHTNESS_MAX, n)) * 100) / 100
}

/** 金额按「分」归一（平台返回的字符串尾数很长，直接透出会变成 9.957584100000000）。
 *  加 1e-9 是半分向上取整的浮点补丁：1.005 在 IEEE754 里是 1.00499999…，
 *  直接 *100 会掉成 1.00。 */
function round2(v) {
  const n = Number(v)
  if (!isFinite(n)) return 0
  return Math.round(n * 100 + 1e-9) / 100
}

function readTextFile(p, fallback) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { return fallback }
}

function readBytes(p) {
  try { return fs.readFileSync(p) } catch (e) { return null }
}

function readCustomWallPath() {
  for (const p of WALL_CUSTOM_CANDIDATES) {
    try { if (fs.existsSync(p)) return p } catch (e) {}
  }
  return null
}

function writeCustomWall(bytes) {
  for (const p of WALL_CUSTOM_CANDIDATES) {
    try {
      fs.writeFileSync(p, bytes)
      return { ok: true, path: p }
    } catch (e) {}
  }
  return { ok: false, error: '无法写入自定义壁纸文件' }
}

function deleteCustomWall() {
  let any = false
  for (const p of WALL_CUSTOM_CANDIDATES) {
    try { if (fs.existsSync(p)) { fs.unlinkSync(p); any = true } } catch (e) {}
  }
  return any
}

/* ── 注入行 ────────────────────────────────────────────────────────────── */
/** 逐行读取 CSS 文本，生成带 id 的内联 <style> 注入行。 */
function styleRows() {
  const rows = []
  for (const asset of STYLE_ASSETS) {
    const css = readTextFile(path.join(LIB_DIR, asset.file), '')
    if (!css) continue
    rows.push({
      kind: 'html',
      placement: 'head',
      html: '<style id="' + asset.id + '">' + css + '</style>',
    })
  }
  return rows
}

/**
 * 热改刷新器：桌面端注入发生在宿主启动那一刻（Electron 只收一次注入表），
 * 内联副本因此会锁死到应用重启。这段小脚本在页面每次加载后再从路由拉一遍
 * 最新 CSS 文本覆盖内联副本，于是改 lib/*.css 只需刷新页面（F5 / Ctrl+R）。
 */
function cssRefreshRow() {
  const map = {}
  for (const asset of STYLE_ASSETS) map[asset.id] = ROUTE_BASE + '/' + asset.file
  const text = '(function(){try{var map=' + JSON.stringify(map) + ';' +
    'for(var id in map){(function(id,url){var el=document.getElementById(id);if(!el)return;' +
    "fetch(url,{cache:'no-store'}).then(function(r){return r.ok?r.text():null})" +
    '.then(function(t){if(t)el.textContent=t}).catch(function(){})})(id,map[id])}}catch(e){}})()'
  return { kind: 'script', placement: 'head', text }
}

function injectionRows() {
  const rows = styleRows()
  if (rows.length) rows.push(cssRefreshRow())
  for (const file of SCRIPT_ASSETS) rows.push({ kind: 'script-src', placement: 'body', src: ROUTE_BASE + '/' + file })
  return rows
}

const name = 'iuno-moon-widget-desktop'
const inject = ['webServer', 'credentials']

function apply(ctx) {
  let wallBytes = null
  const disposers = []

  function loadWall() {
    if (wallBytes) return wallBytes
    for (const p of ASSET_CANDIDATES.wall) {
      const b = readBytes(p)
      if (b && b.length) { wallBytes = b; return b }
    }
    throw new Error('iuno wallpaper not found')
  }

  let petBytes = null
  function loadPet() {
    if (petBytes) return petBytes
    for (const p of ASSET_CANDIDATES.pet) {
      const b = readBytes(p)
      if (b && b.length) { petBytes = b; return b }
    }
    return null
  }

  function readSize() {
    for (const p of SIZE_FILE_CANDIDATES) {
      try {
        const parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
        return {
          ambience: typeof parsed.ambience === 'number' ? Math.max(0, Math.min(1, parsed.ambience)) : 1,
          wallBrightness: clampBrightness(parsed.wallBrightness),
          wallType: typeof parsed.wallType === 'string' && parsed.wallType ? parsed.wallType : 'image/jpeg',
          wallCustom: !!readCustomWallPath(),
          profile: 'desktop',
        }
      } catch (e) {}
    }
    return { ambience: 1, wallBrightness: DEFAULT_WALL_BRIGHTNESS, wallType: 'image/jpeg', wallCustom: false, profile: 'desktop' }
  }

  // 合并写入：只更新传入的字段，其余保留
  function writeSize(patch) {
    const cur = readSize()
    const next = {
      ambience: typeof patch.ambience === 'number' ? Math.max(0, Math.min(1, patch.ambience)) : cur.ambience,
      wallBrightness: typeof patch.wallBrightness === 'number' ? clampBrightness(patch.wallBrightness) : cur.wallBrightness,
      wallType: typeof patch.wallType === 'string' && patch.wallType ? patch.wallType : cur.wallType,
      updatedAt: new Date().toISOString(),
    }
    const body = JSON.stringify(next, null, 0)
    for (const p of SIZE_FILE_CANDIDATES) {
      try { fs.writeFileSync(p, body, 'utf8'); return { ok: true, ...next } } catch (e) {}
    }
    return { ok: false, error: '无法持久化界面配置' }
  }

  function json(res, status, body) {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    })
    res.end(JSON.stringify(body))
  }

  function readBody(req, limit) {
    return new Promise((resolve, reject) => {
      const chunks = []
      let size = 0
      req.on('data', (c) => {
        size += c.length
        if (size > limit) { reject(new Error('body too large')); return }
        chunks.push(c)
      })
      req.on('end', () => resolve(Buffer.concat(chunks)))
      req.on('error', reject)
    })
  }

  // ── 路由：/dsh-iuno/* ─────────────────────────────────────────────────────
  function sendWall(res, bytes, contentType) {
    res.writeHead(200, {
      'Content-Type': contentType || 'image/jpeg',
      'Cache-Control': 'no-store',
      'Content-Length': String(bytes.length),
    })
    res.end(bytes)
  }

  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_BASE + '/wall.jpg',
    handler: async (req, res) => {
      try {
        // POST = 上传自定义壁纸；?reset=1 = 恢复默认
        if (req.method === 'POST' || req.method === 'PUT') {
          const url = new URL(req.url, 'http://x')
          if (url.searchParams.get('reset') === '1') {
            deleteCustomWall()
            writeSize({ wallType: 'image/jpeg' })
            json(res, 200, { ok: true, wallCustom: false })
            return
          }
          const bytes = await readBody(req, WALL_UPLOAD_MAX)
          let ct = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
          if (!ct || !/^image\//.test(ct)) ct = 'image/jpeg'
          const r = writeCustomWall(bytes)
          if (r.ok) writeSize({ wallType: ct })
          json(res, r.ok ? 200 : 500, r)
          return
        }
        // GET = 有自定义就给自定义，否则给内置
        const customPath = readCustomWallPath()
        if (customPath) {
          const bytes = readBytes(customPath)
          if (bytes && bytes.length) {
            const s = readSize()
            sendWall(res, bytes, s.wallType || 'image/jpeg')
            return
          }
        }
        sendWall(res, loadWall(), 'image/jpeg')
      } catch (e) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('iuno wallpaper unavailable: ' + String(e.message || e))
      }
    },
  }))

  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_BASE + '/pet.png',
    handler: (req, res) => {
      const bytes = loadPet()
      if (!bytes) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('iuno pet sprite unavailable')
        return
      }
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store',
        'Content-Length': String(bytes.length),
      })
      res.end(bytes)
    },
  }))

  for (const file of Object.keys(TEXT_ASSETS)) {
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: ROUTE_BASE + '/' + file,
      handler: (req, res) => {
        res.writeHead(200, { 'Content-Type': TEXT_ASSETS[file], 'Cache-Control': 'no-store' })
        res.end(readTextFile(path.join(LIB_DIR, file), ''))
      },
    }))
  }

  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_BASE + '/size.json',
    handler: async (req, res) => {
      try {
        if (req.method === 'PUT' || req.method === 'POST') {
          let body
          try { body = JSON.parse((await readBody(req, 4096)).toString('utf8')) } catch (e) {
            json(res, 400, { ok: false, error: 'invalid json' })
            return
          }
          const result = writeSize({
            ambience: body && typeof body.ambience === 'number' ? body.ambience : undefined,
            wallBrightness: body && typeof body.wallBrightness === 'number' ? body.wallBrightness : undefined,
          })
          json(res, result.ok ? 200 : 500, result)
          return
        }
        json(res, 200, readSize())
      } catch (e) {
        json(res, 200, { ambience: 1, wallBrightness: DEFAULT_WALL_BRIGHTNESS, wallCustom: false, profile: 'desktop' })
      }
    },
  }))

  // ── 余额：优先读登录账号钱包，否则用 DEEPSEEK_API_KEY 调 /user/balance ──
  //  默认缓存 60s；带 ?force=1 时跳过缓存（小签刷新走这条路）
  let balanceCache = { at: 0, body: null }

  /** 登录账号（deepseek-account）钱包余额；未登录或服务缺失时返回 null 交给回退。 */
  async function readAccountBalance() {
    try {
      const account = ctx.get && ctx.get('deepseekAccount')
      if (!account) return null
      const state = await account.getState()
      if (!state || state.status !== 'credential-stored') return null
      const details = await account.getBalance({
        version: process.env.DSH_CLIENT_VERSION || '0.0.0',
        locale: 'zh-CN',
        timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
      })
      if (!details || details.status !== 'ready') return { ok: false, error: '账号钱包暂时读不到，稍后再试' }
      /* Platform 的 get_user_summary 返回两组互不重叠的钱包：
       *   normal_wallets → details.value        （充值余额）
       *   bonus_wallets  → details.bonusWallets （赠送余额）
       * 可用余额 = 两者之和；分两个字段给前端，便于显示「¥15.31 · 赠送 ¥5.35」。
       * 金额是十进制字符串且带一长串尾数（如 "9.957584100000000"），
       * 这里按分（2 位小数）归一，避免前端出现 9.957584100000000。 */
      const wallets = new Map()
      const collect = (list, key) => {
        for (const w of list || []) {
          const cur = wallets.get(w.currency) || { currency: w.currency, normal: 0, bonus: 0 }
          const n = Number(w.balance)
          cur[key] += isFinite(n) ? n : 0
          wallets.set(w.currency, cur)
        }
      }
      collect(details.value, 'normal')
      collect(details.bonusWallets, 'bonus')
      return {
        ok: true,
        source: 'account',
        balances: [...wallets.values()].map((c) => ({
          currency: c.currency,
          total: round2(c.normal + c.bonus),
          toppedUp: round2(c.normal),
          granted: round2(c.bonus),
        })),
      }
    } catch (e) {
      return { ok: false, error: '账号余额查询失败：' + String((e && e.message) || e) }
    }
  }

  /** 回退：本地 DEEPSEEK_API_KEY 调官方 /user/balance。 */
  async function readApiKeyBalance() {
    try {
      const creds = ctx.credentials || (ctx.get && ctx.get('credentials'))
      const hit = creds && (await creds.resolve('DEEPSEEK_API_KEY'))
      if (!hit || !hit.value) {
        return { ok: false, error: '未登录账号，也未找到 DEEPSEEK_API_KEY' }
      }
      const base = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '')
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), 8000)
      try {
        const resp = await fetch(base + '/user/balance', {
          headers: { authorization: 'Bearer ' + hit.value, accept: 'application/json' },
          signal: ac.signal,
        })
        if (!resp.ok) throw new Error('HTTP ' + resp.status)
        const data = await resp.json()
        const infos = Array.isArray(data && data.balance_infos) ? data.balance_infos : []
        return {
          ok: true,
          source: 'api-key',
          balances: infos.map((b) => ({
            currency: b.currency,
            total: b.total_balance,
            granted: b.granted_balance,
            toppedUp: b.topped_up_balance,
          })),
        }
      } finally {
        clearTimeout(timer)
      }
    } catch (e) {
      return { ok: false, error: '余额查询失败：' + String((e && e.message) || e) }
    }
  }

  async function fetchBalance(force) {
    if (!force && balanceCache.body && Date.now() - balanceCache.at < 60e3) return balanceCache.body
    const account = await readAccountBalance()
    const body = account !== null ? account : await readApiKeyBalance()
    balanceCache = { at: Date.now(), body }
    return body
  }

  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_BASE + '/balance.json',
    handler: async (req, res) => {
      let force = false
      try { force = new URL(req.url, 'http://x').searchParams.get('force') === '1' } catch (e) {}
      json(res, 200, await fetchBalance(force))
    },
  }))

  // ── 注入：结构化注入行（桌面端唯一生效的通道）─────────────────────────────
  ctx.effect(() => ctx.on('webserver/index-inject', (table) => {
    for (const row of injectionRows()) table.push(row)
  }))

  ctx.effect(() => () => {
    for (const d of disposers) { try { d() } catch (e) {} }
  })
}

export { name, inject, apply }
