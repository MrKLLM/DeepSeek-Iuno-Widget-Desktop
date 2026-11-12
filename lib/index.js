import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/* ============================================================================
 * dsh-iuno-widget-desktop 路 v1.0.0
 * DeepSeek Harness 妗岄潰绔紙Electron锛夊挨璇烘暣绔欑毊鑲?鈥斺€?瀹夸富鎻掍欢
 * ----------------------------------------------------------------------------
 * 涓?web 鐗堬紙dsh-iuno-widget锛夌殑鍞竴缁撴瀯宸埆鏄€孋SS / JS 鎬庝箞杩涢〉闈€嶏細
 *
 *   web 绔細椤甸潰鐢卞涓?HTTP 鏈嶅姟娓叉煋锛宒sh-host-frontend-static 璋? *           webServer.renderIndex()锛岀粨鏋勫寲娉ㄥ叆琛屼笌 tapIndex 閮戒細琚啓杩? *           index.html 鏂囨湰锛屾墍浠ユ棫鐗堢敤 tapIndex 鎷?<link>/<script>銆? *
 *   妗岄潰绔細娓叉煋鍣ㄤ粠鑷畾涔夊崗璁?dsh-app://app/ 鍙栭潤鎬?dist锛圗lectron 鐨? *           serveWebDocument锛夛紝index.html 鐢?Electron 鑷繁鍙戝嚭锛屽涓诲彧鎶? *           webServer.collectIndexInjections() 鐨勬敞鍏ヨ〃锛圛ndexInjection[]锛? *           缁?IPC 浜ょ粰鍓嶇锛涘墠绔湪鍚姩 Cordis 涔嬪墠閫愯搴旂敤锛? *             global / script / script-src / style / html
 *           鈥斺€?tapIndex 鍦ㄦ闈㈢銆愬畬鍏ㄤ笉鐢熸晥銆戯紙涓嶈銆佷笉娓叉煋锛夈€? *
 * 鎵€浠ユ湰鎻掍欢鍙蛋缁撴瀯鍖栨敞鍏ヨ锛坵ebserver/index-inject锛夛細
 *   路 html 琛?  鈥斺€?<style id=鈥? 鍐呰仈涓変唤 CSS锛岃繘椤甸潰鍗崇敓鏁堬紝涓嶉棯鐧斤紱
 *   路 script 琛?鈥斺€?涓€灏忔鍒锋柊鍣細椤甸潰璧锋潵鍚庡啀浠?/dsh-iuno/*.css 鎷変竴娆℃渶鏂? *                  鏂囨湰瑕嗙洊鍐呰仈鍓湰锛屼簬鏄€屾敼 CSS 鈫?鍒锋柊椤甸潰銆嶅湪妗岄潰绔緷鐒? *                  鎴愮珛锛堟棤闇€閲嶅惎搴旂敤锛夛紱
 *   路 script-src 琛?鈥斺€?theme.js / pet.js / trail.js锛屽墠绔細 await 鍏跺姞杞姐€? *
 * 璺敱渚濇棫璧?webServer.register锛欵lectron 浼氭妸 dsh-app://app/<path> 杞彂鍒? * 瀹夸富 HTTP 鏈嶅姟骞朵唬鎸傞壌鏉?cookie锛屽洜姝?/dsh-iuno/* 鐨勯潤鎬佽祫婧愩€佸绾镐笂浼犮€? * 閰嶇疆璇诲啓涓?web 鐗堝畬鍏ㄤ竴鑷淬€傜浉瀵硅矾寰勶紙/dsh-iuno/鈥︼級鍦ㄦ闈㈢鏄? * dsh-app://app/dsh-iuno/鈥︼紝涓庨〉闈㈠悓婧愶紝涓嶄細瑙﹀彂棰勬銆? *
 * 娉ㄥ叆琛岀殑娓叉煋椤哄簭锛歸eb 鎶?head 琛屾彃鍦?<head> 涔嬪悗锛堜細杈撶粰搴旂敤鑷韩 CSS锛夛紝
 * 妗岄潰绔妸 head 琛?append 鍒?</head> 涔嬪墠锛堟櫄浜庡簲鐢?CSS锛岀毊鑲よ耽锛夆€斺€? * 鍥犳鏈寘鏄闈㈢涓撶敤锛寃eb 绔缁х画鐢?dsh-iuno-widget銆? * ==========================================================================*/

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LIB_DIR = path.join(PACKAGE_ROOT, 'lib')
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
/** 妗岄潰绔?profile 鐩綍锛圖SH_PROFILE_DIR 鐢卞簲鐢ㄦ敞鍏ワ紱缂哄け鏃舵寜绾﹀畾鎺ㄥ锛夈€?*/
const PROFILE_DIR = process.env.DSH_PROFILE_DIR || path.join(DSH_HOME, 'profiles', 'desktop')

const ROUTE_BASE = '/dsh-iuno'

/* 鈹€鈹€ 闈欐€佽祫婧愯〃锛氳矾鐢变笌娉ㄥ叆琛屽叡鐢ㄥ悓涓€浠芥竻鍗曪紝閬垮厤涓ゅ璧板亸 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ */
const TEXT_ASSETS = {
  'theme.css': 'text/css; charset=utf-8',
  'pet.css': 'text/css; charset=utf-8',
  'desktop.css': 'text/css; charset=utf-8',
  'intro.css': 'text/css; charset=utf-8',
  'intro-moon.css': 'text/css; charset=utf-8',
  'theme-settings.css': 'text/css; charset=utf-8',
  'theme.js': 'application/javascript; charset=utf-8',
  'pet.js': 'application/javascript; charset=utf-8',
  'trail.js': 'application/javascript; charset=utf-8',
  'intro-moon.js': 'application/javascript; charset=utf-8',
  'intro.js': 'application/javascript; charset=utf-8',
  'theme-settings.js': 'application/javascript; charset=utf-8',
}
/** CSS 鍏堝唴鑱旓紙涓嶉棯鐧斤級锛屽啀浜ょ粰鍒锋柊鍣ㄤ繚鎸佸彲鐑敼銆?*/
const STYLE_ASSETS = [
  { id: 'yn-skin-css-theme', file: 'theme.css' },
  { id: 'yn-skin-css-pet', file: 'pet.css' },
  { id: 'yn-skin-css-desktop', file: 'desktop.css' },
  { id: 'yn-skin-css-intro', file: 'intro.css' },
  { id: 'yn-skin-css-intro-moon', file: 'intro-moon.css' },
  { id: 'yn-skin-css-settings', file: 'theme-settings.css' },
]
const SCRIPT_ASSETS = ['theme.js', 'pet.js', 'trail.js', 'intro-moon.js', 'intro.js', 'theme-settings.js']

const ASSET_CANDIDATES = {
  wall: [path.join(PACKAGE_ROOT, 'assets', 'iuno-wall.jpg'), path.join(PACKAGE_ROOT, 'assets', 'iuno-wall.png')],
  pet: [path.join(PACKAGE_ROOT, 'assets', 'iuno-pet.png')],
}

/* 鈹€鈹€ 鍏ュ満鍔ㄧ敾 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
 * 棰勮褰辩墖鏀?assets/intro/锛涘涓诲彧鎸夌櫧鍚嶅崟涓嬪彂鏂囦欢锛屾挱鏀鹃厤缃繘 size.json銆? * 琛屼负锛氶粯璁ゅ叧闂紱寮€鍚悗銆屽簲鐢ㄦ瘡娆″惎鍔ㄣ€嶆挱涓€娆★紝椤甸潰鍒锋柊锛團5锛変笉閲嶆挱锛? *       鎵嬪姩銆岄噸鎾€嶄笉鍙楀紑鍏抽檺鍒讹紙瑙?lib/intro.js锛夈€? * 鍔犳柊鐗囷細鎶?<id>.mp4 涓?<id>-poster.jpg 鏀捐繘 assets/intro/锛屽啀鍦ㄤ笅闈㈠姞涓€鏉￠璁俱€? */
const INTRO_DIR = path.join(PACKAGE_ROOT, 'assets', 'intro')
const INTRO_PRESETS = {
  pv: { label: 'PV', file: 'pv.mp4', poster: 'pv-poster.jpg', art: 'first-pv.json', start: 0, end: null },
  gacha: { label: '抽卡', file: 'gacha.mp4', poster: 'gacha-poster.jpg', art: 'first-gacha.json', start: 0, end: null },
  'gacha-short': { label: '抽卡·短', file: 'gacha-short.mp4', poster: 'gacha-short-poster.jpg', art: 'first-gacha-short.json', start: 0, end: null },
}
const INTRO_VIDEO_IDS = Object.keys(INTRO_PRESETS)
const INTRO_VIDEO_DEFAULT = 'pv'
const INTRO_EXTRA_ASSETS = {
  'fonts/Cinzel.ttf': 'font/ttf',
  'art/first-pv.json': 'application/json; charset=utf-8',
  'art/first-gacha.json': 'application/json; charset=utf-8',
  'art/first-gacha-short.json': 'application/json; charset=utf-8',
}
const INTRO_VOLUME_DEFAULT = 0

function introAvailable(id) {
  try { return !!INTRO_PRESETS[id] && fs.existsSync(path.join(INTRO_DIR, INTRO_PRESETS[id].file)) } catch (e) { return false }
}

/** 缁欏墠绔紙size.json / 闈㈡澘锛夌殑棰勮娓呭崟锛氫笉鍙敤鐨勫奖鐗?available=false銆?*/
function introPresetList() {
  return INTRO_VIDEO_IDS.map((id) => {
    const p = INTRO_PRESETS[id]
    const available = introAvailable(id)
    return {
      id,
      label: p.label,
      available,
      url: available ? ROUTE_BASE + '/intro/' + p.file : null,
      poster: available ? ROUTE_BASE + '/intro/' + p.poster : null,
      artUrl: p.art ? ROUTE_BASE + '/intro/art/' + p.art : null,
      start: p.start,
      end: p.end,
    }
  })
}

/* 鈹€鈹€ 鍔ㄦ€佸绾革紙鑳屾櫙寰幆瑙嗛锛夆攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
 * 鐢辩珛缁樼敓鎴愮殑鏋佹參銆佹棤缂濆惊鐜棰戯紱鍚姩鍔ㄧ敾鎾畬鍚庤儗鏅洿鎺ュ欢缁垚鍔ㄦ€佸绾搞€? * 绱犳潗鏀?assets/bg/锛涙病鏈?loop.mp4 鏃惰嚜鍔ㄩ€€鍥炪€屽井鍔ㄦ晥銆嶆ā寮忋€? */
const BG_DIR = path.join(PACKAGE_ROOT, 'assets', 'bg')
const BG_VIDEOS = {
  loop: { file: 'loop.mp4', poster: 'loop-poster.jpg' },
}
const BG_MODE_DEFAULT_FALLBACK = 'image'

function bgVideoAvailable(id) {
  try { return !!BG_VIDEOS[id] && fs.existsSync(path.join(BG_DIR, BG_VIDEOS[id].file)) } catch (e) { return false }
}
/** v1.4.0 璧疯儗鏅浐瀹氫负闈欐€佸绾革紙鐢ㄦ埛瑕佹眰涓嶈鍔ㄦ€?loop / 寰姩鏁堬級銆?*/
function defaultBgMode() {
  return 'image'
}
function normalizeBgMode(v) {
  return 'image'
}
function bgVideoList() {
  const out = {}
  for (const id of Object.keys(BG_VIDEOS)) {
    const p = BG_VIDEOS[id]
    const available = bgVideoAvailable(id)
    out[id] = {
      available,
      url: available ? ROUTE_BASE + '/bg/' + p.file : null,
      poster: available ? ROUTE_BASE + '/bg/' + p.poster : null,
    }
  }
  return out
}

/* 鈹€鈹€ 鏄剧ず鍙傛暟榛樿鍊硷紙鑳屾櫙娓呴€忓害 / 鐣岄潰閫忔槑搴?/ 寰姩鏁堬級鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ */
const DEFAULT_INTRO_MODE = 'every'
const DEFAULT_WALL_DIM = 0
const DEFAULT_WALL_BLUR = 0
const DEFAULT_VEIL_LIGHT = 0.18
const DEFAULT_VEIL_DARK = 0.28
const DEFAULT_UI_ALPHA = 1
const DEFAULT_MOTION = 1

function clampNum(v, min, max, def, step) {
  const n = Number(v)
  if (!isFinite(n)) return def
  const s = step || 100
  return Math.round(Math.max(min, Math.min(max, n)) * s) / s
}


/* 鈹€鈹€ 鐘舵€佹枃浠?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
 * 鍐欏叆锛氭闈㈢ profile 鐩綍浼樺厛锛堝悇 profile 浜掍笉骞叉壈锛夛紝澶辫触鍐嶉€€鍒?DSH_HOME銆? * 璇诲彇锛氭闈?profile 鈫?DSH_HOME 鈫?web profile锛屽彇绗竴涓瓨鍦ㄧ殑锛? *       浜庢槸棣栨鍦ㄦ闈㈢杩愯鏃惰兘缁ф壙 web 鐗堝凡鏈夌殑浜害 / 鑷畾涔夊绾搞€?     */
const STATE_DIRS = [...new Set([PROFILE_DIR, DSH_HOME, path.join(DSH_HOME, 'profiles', 'web')])]
const SIZE_FILE_CANDIDATES = STATE_DIRS.map((d) => path.join(d, '.dshy-size.json'))
const WALL_CUSTOM_CANDIDATES = STATE_DIRS.map((d) => path.join(d, '.dshy-wall-custom.bin'))

const DEFAULT_WALL_BRIGHTNESS = 0.86
const WALL_BRIGHTNESS_MIN = 0.4
const WALL_BRIGHTNESS_MAX = 1.0
// 鑷畾涔夊绾镐笂浼犱笂闄?~20MB
const WALL_UPLOAD_MAX = 20 * 1024 * 1024

function clampBrightness(v) {
  const n = Number(v)
  if (!isFinite(n)) return DEFAULT_WALL_BRIGHTNESS
  return Math.round(Math.max(WALL_BRIGHTNESS_MIN, Math.min(WALL_BRIGHTNESS_MAX, n)) * 100) / 100
}

/** 閲戦鎸夈€屽垎銆嶅綊涓€锛堝钩鍙拌繑鍥炵殑瀛楃涓插熬鏁板緢闀匡紝鐩存帴閫忓嚭浼氬彉鎴?9.957584100000000锛夈€? *  鍔?1e-9 鏄崐鍒嗗悜涓婂彇鏁寸殑娴偣琛ヤ竵锛?.005 鍦?IEEE754 閲屾槸 1.00499999鈥︼紝
 *  鐩存帴 *100 浼氭帀鎴?1.00銆?*/
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

/** 闈欐€佹枃浠跺搷搴旓紙瑙嗛/娴锋姤鐢級锛氭暣鏂囦欢璇诲叆鍐呭瓨锛堟湰鍦板嚑 MB 绾э級锛屾敮鎸?Range銆? *  涔嬫墍浠ヤ笉鐢ㄦ祦锛氭枃浠跺皬銆佽姹傚皯锛屾暣璇绘洿绠€鍗曪紝涔熸柟渚跨绾垮啋鐑熸祴璇曠敤鍋?res銆?*/
function sendStaticFile(req, res, filePath, contentType) {
  let buf
  try { buf = fs.readFileSync(filePath) } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('not found')
    return
  }
  const total = buf.length
  const base = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  }
  const range = req.headers && req.headers.range
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/u.exec(String(range).trim())
    if (!m) {
      res.writeHead(416, { ...base, 'Content-Range': 'bytes */' + total })
      res.end('')
      return
    }
    let start = m[1] === '' ? null : Number(m[1])
    let end = m[2] === '' ? null : Number(m[2])
    if (start === null) {
      const suffix = Math.min(total, end || 0)
      start = total - suffix
      end = total - 1
    } else if (end === null || end >= total) {
      end = total - 1
    }
    if (!isFinite(start) || !isFinite(end) || start < 0 || start > end || start >= total) {
      res.writeHead(416, { ...base, 'Content-Range': 'bytes */' + total })
      res.end('')
      return
    }
    const slice = buf.subarray(start, end + 1)
    res.writeHead(206, {
      ...base,
      'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
      'Content-Length': String(slice.length),
    })
    res.end(req.method === 'HEAD' ? '' : slice)
    return
  }
  res.writeHead(200, { ...base, 'Content-Length': String(total) })
  res.end(req.method === 'HEAD' ? '' : buf)
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

/* 鈹€鈹€ 娉ㄥ叆琛?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ */
/** 閫愯璇诲彇 CSS 鏂囨湰锛岀敓鎴愬甫 id 鐨勫唴鑱?<style> 娉ㄥ叆琛屻€?*/
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
 * 鐑敼鍒锋柊鍣細妗岄潰绔敞鍏ュ彂鐢熷湪瀹夸富鍚姩閭ｄ竴鍒伙紙Electron 鍙敹涓€娆℃敞鍏ヨ〃锛夛紝
 * 鍐呰仈鍓湰鍥犳浼氶攣姝诲埌搴旂敤閲嶅惎銆傝繖娈靛皬鑴氭湰鍦ㄩ〉闈㈡瘡娆″姞杞藉悗鍐嶄粠璺敱鎷変竴閬? * 鏈€鏂?CSS 鏂囨湰瑕嗙洊鍐呰仈鍓湰锛屼簬鏄敼 lib/*.css 鍙渶鍒锋柊椤甸潰锛團5 / Ctrl+R锛夈€? */
function cssRefreshRow() {
  const map = {}
  for (const asset of STYLE_ASSETS) map[asset.id] = ROUTE_BASE + '/' + asset.file
  const text = '(function(){try{var map=' + JSON.stringify(map) + ';' +
    'for(var id in map){(function(id,url){var el=document.getElementById(id);if(!el)return;' +
    "fetch(url,{cache:'no-store'}).then(function(r){return r.ok?r.text():null})" +
    '.then(function(t){if(t)el.textContent=t}).catch(function(){})})(id,map[id])}}catch(e){}})()'
  return { kind: 'script', placement: 'head', text }
}

/**
 * 棣栧抚閬僵锛氬叆鍦哄姩鐢诲紑鍚椂锛屾敞鍏ヨ〃涓€搴旂敤灏辨妸鏁撮〉鍘嬫垚娣辩┖鑹诧紝
 * 鐩栦綇 DSH 鍘熺敓鍔犺浇椤电殑浜簳锛岄伩鍏嶃€岀櫧搴曞姞杞介〉 鈫?娣辫壊鐗囧ご銆嶉偅涓€涓嬬櫧闂€? * 20s 鍚庢棤璁?intro.js 鏈夋病鏈夋垚鍔熸帴绠￠兘鑷姩鎽樻帀鐘舵€佷綅锛岀粷涓嶇暀榛戝睆銆? * 娉ㄦ剰锛欶5 鍒锋柊涓嶆挱鍏ュ満锛堢敤鎴风害瀹氾級锛屾墍浠?reload 鏃跺共鑴嗕笉鎵撻伄缃╋紝閬垮厤闂竴涓嬮粦銆? */
function introBootRow() {
  const text = '(function(){try{' +
    'var nav=performance.getEntriesByType?performance.getEntriesByType("navigation"):[];' +
    'if(nav&&nav[0]&&nav[0].type==="reload")return;' +
    'var d=document.documentElement;d.setAttribute("data-yn-intro","boot");' +
    'setTimeout(function(){if(d.getAttribute("data-yn-intro")==="boot")d.removeAttribute("data-yn-intro")},20000)' +
    '}catch(e){}})()'
  return { kind: 'script', placement: 'head', text }
}

function injectionRows(introEnabled) {
  const rows = styleRows()
  if (introEnabled) rows.push(introBootRow())
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
          ambience: clampNum(parsed.ambience, 0, 1, 1),
          wallBrightness: clampBrightness(parsed.wallBrightness),
          wallType: typeof parsed.wallType === 'string' && parsed.wallType ? parsed.wallType : 'image/jpeg',
          wallCustom: !!readCustomWallPath(),
          introEnabled: parsed.introEnabled === true,
          introMode: parsed.introMode === 'once' ? 'once' : DEFAULT_INTRO_MODE,
          introVideo: INTRO_VIDEO_IDS.includes(parsed.introVideo) ? parsed.introVideo : INTRO_VIDEO_DEFAULT,
          introVolume: clampNum(parsed.introVolume, 0, 1, INTRO_VOLUME_DEFAULT),
          moonIntroEnabled: parsed.moonIntroEnabled !== false,
          loopWallpaperEnabled: parsed.loopWallpaperEnabled !== false,
          bgMode: normalizeBgMode(parsed.bgMode),
          wallDim: clampNum(parsed.wallDim, 0, 0.6, DEFAULT_WALL_DIM),
          wallBlur: clampNum(parsed.wallBlur, 0, 16, DEFAULT_WALL_BLUR),
          veilLight: clampNum(parsed.veilLight, 0, 0.4, DEFAULT_VEIL_LIGHT),
          veilDark: clampNum(parsed.veilDark, 0, 0.5, DEFAULT_VEIL_DARK),
          uiAlpha: clampNum(parsed.uiAlpha, 0.6, 1.2, DEFAULT_UI_ALPHA),
          motion: clampNum(parsed.motion, 0, 1, DEFAULT_MOTION),
          profile: 'desktop',
        }
      } catch (e) {}
    }
    return {
      ambience: 1,
      wallBrightness: DEFAULT_WALL_BRIGHTNESS,
      wallType: 'image/jpeg',
      wallCustom: false,
      introEnabled: false,
      introMode: DEFAULT_INTRO_MODE,
      introVideo: INTRO_VIDEO_DEFAULT,
      introVolume: INTRO_VOLUME_DEFAULT,
      moonIntroEnabled: true,
      loopWallpaperEnabled: true,
      bgMode: defaultBgMode(),
      wallDim: DEFAULT_WALL_DIM,
      wallBlur: DEFAULT_WALL_BLUR,
      veilLight: DEFAULT_VEIL_LIGHT,
      veilDark: DEFAULT_VEIL_DARK,
      uiAlpha: DEFAULT_UI_ALPHA,
      motion: DEFAULT_MOTION,
      profile: 'desktop',
    }
  }

  // 合并写入：只更新传入的字段，其余保留
  function writeSize(patch) {
    patch = patch && typeof patch === 'object' ? patch : {}
    const cur = readSize()
    const next = {
      ambience: typeof patch.ambience === 'number' ? clampNum(patch.ambience, 0, 1, cur.ambience) : cur.ambience,
      wallBrightness: typeof patch.wallBrightness === 'number' ? clampBrightness(patch.wallBrightness) : cur.wallBrightness,
      wallType: typeof patch.wallType === 'string' && patch.wallType ? patch.wallType : cur.wallType,
      introEnabled: typeof patch.introEnabled === 'boolean' ? patch.introEnabled : cur.introEnabled,
      introMode: patch.introMode === 'once' || patch.introMode === 'every' ? patch.introMode : cur.introMode,
      introVideo: INTRO_VIDEO_IDS.includes(patch.introVideo) ? patch.introVideo : cur.introVideo,
      introVolume: typeof patch.introVolume === 'number' ? clampNum(patch.introVolume, 0, 1, cur.introVolume) : cur.introVolume,
      moonIntroEnabled: typeof patch.moonIntroEnabled === 'boolean' ? patch.moonIntroEnabled : cur.moonIntroEnabled,
      loopWallpaperEnabled: typeof patch.loopWallpaperEnabled === 'boolean' ? patch.loopWallpaperEnabled : cur.loopWallpaperEnabled,
      bgMode: typeof patch.bgMode === 'string' ? normalizeBgMode(patch.bgMode) : cur.bgMode,
      wallDim: typeof patch.wallDim === 'number' ? clampNum(patch.wallDim, 0, 0.6, cur.wallDim) : cur.wallDim,
      wallBlur: typeof patch.wallBlur === 'number' ? clampNum(patch.wallBlur, 0, 16, cur.wallBlur) : cur.wallBlur,
      veilLight: typeof patch.veilLight === 'number' ? clampNum(patch.veilLight, 0, 0.4, cur.veilLight) : cur.veilLight,
      veilDark: typeof patch.veilDark === 'number' ? clampNum(patch.veilDark, 0, 0.5, cur.veilDark) : cur.veilDark,
      uiAlpha: typeof patch.uiAlpha === 'number' ? clampNum(patch.uiAlpha, 0.6, 1.2, cur.uiAlpha) : cur.uiAlpha,
      motion: typeof patch.motion === 'number' ? clampNum(patch.motion, 0, 1, cur.motion) : cur.motion,
      updatedAt: new Date().toISOString(),
    }
    const body = JSON.stringify(next, null, 0)
    for (const p of SIZE_FILE_CANDIDATES) {
      try { fs.writeFileSync(p, body, 'utf8'); return { ok: true, ...next } } catch (e) {}
    }
  return { ok: false, error: '无法写入自定义壁纸文件' }
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

  // 鈹€鈹€ 璺敱锛?dsh-iuno/* 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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
        // POST = 涓婁紶鑷畾涔夊绾革紱?reset=1 = 鎭㈠榛樿
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
        // GET: custom wallpaper if present, else built-in
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

  /* 鍏ュ満褰辩墖 / 娴锋姤锛氬彧涓嬪彂 INTRO_PRESETS 鐧藉悕鍗曢噷鐨勬枃浠跺悕锛岄槻鐩綍绌胯秺銆?     prefix 璺緞涓嶅甫灏炬枩鏉?鈥斺€?瀹夸富鍖归厤瑙勫垯鏄?pathname===prefix 鎴?startsWith(prefix + '/')銆?*/
  disposers.push(ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE_BASE + '/intro',
    handler: (req, res) => {
      try {
        const pathname = new URL(req.url, 'http://x').pathname
        const name = decodeURIComponent(pathname.slice((ROUTE_BASE + '/intro/').length))
        let type = null
        for (const id of INTRO_VIDEO_IDS) {
          const p = INTRO_PRESETS[id]
          if (name === p.file) { type = 'video/mp4'; break }
          if (name === p.poster) { type = 'image/jpeg'; break }
        }
        if (!type && INTRO_EXTRA_ASSETS[name]) type = INTRO_EXTRA_ASSETS[name]
        if (!type) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('intro asset not found')
          return
        }
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405, { Allow: 'GET, HEAD' })
          res.end('')
          return
        }
        sendStaticFile(req, res, path.join(INTRO_DIR, name), type)
      } catch (e) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('intro asset error')
      }
    },
  }))

  /* 鍔ㄦ€佸绾革紙鑳屾櫙寰幆瑙嗛锛夛細鍚屾牱鍙笅鍙戠櫧鍚嶅崟鏂囦欢鍚嶃€?*/
  disposers.push(ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE_BASE + '/bg',
    handler: (req, res) => {
      try {
        const pathname = new URL(req.url, 'http://x').pathname
        const name = decodeURIComponent(pathname.slice((ROUTE_BASE + '/bg/').length))
        let type = null
        for (const id of Object.keys(BG_VIDEOS)) {
          const p = BG_VIDEOS[id]
          if (name === p.file) { type = 'video/mp4'; break }
          if (name === p.poster) { type = 'image/jpeg'; break }
        }
        if (!type) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('bg asset not found')
          return
        }
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405, { Allow: 'GET, HEAD' })
          res.end('')
          return
        }
        sendStaticFile(req, res, path.join(BG_DIR, name), type)
      } catch (e) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('bg asset error')
      }
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
          const result = writeSize(body)
          json(res, result.ok ? 200 : 500, result)
          return
        }
        json(res, 200, {
          ...readSize(),
          introPresets: introPresetList(),
          bgVideos: bgVideoList(),
        })
      } catch (e) {
        json(res, 200, {
          ambience: 1,
          wallBrightness: DEFAULT_WALL_BRIGHTNESS,
          wallCustom: false,
          introEnabled: false,
          introMode: DEFAULT_INTRO_MODE,
          introVideo: INTRO_VIDEO_DEFAULT,
          introVolume: INTRO_VOLUME_DEFAULT,
          moonIntroEnabled: true,
          loopWallpaperEnabled: true,
          introPresets: introPresetList(),
          bgMode: defaultBgMode(),
          bgVideos: bgVideoList(),
          wallDim: DEFAULT_WALL_DIM,
          wallBlur: DEFAULT_WALL_BLUR,
          veilLight: DEFAULT_VEIL_LIGHT,
          veilDark: DEFAULT_VEIL_DARK,
          uiAlpha: DEFAULT_UI_ALPHA,
          motion: DEFAULT_MOTION,
          profile: 'desktop',
        })
      }
    },
  }))

  // 鈹€鈹€ 浣欓锛氫紭鍏堣鐧诲綍璐﹀彿閽卞寘锛屽惁鍒欑敤 DEEPSEEK_API_KEY 璋?/user/balance 鈹€鈹€
  // cache balance for 60s; ?force=1 bypasses
  let balanceCache = { at: 0, body: null }

  /** 鐧诲綍璐﹀彿锛坉eepseek-account锛夐挶鍖呬綑棰濓紱鏈櫥褰曟垨鏈嶅姟缂哄け鏃惰繑鍥?null 浜ょ粰鍥為€€銆?*/
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
      /* Platform 鐨?get_user_summary 杩斿洖涓ょ粍浜掍笉閲嶅彔鐨勯挶鍖咃細
       *   normal_wallets 鈫?details.value        锛堝厖鍊间綑棰濓級
       *   bonus_wallets  鈫?details.bonusWallets 锛堣禒閫佷綑棰濓級
       * 鍙敤浣欓 = 涓よ€呬箣鍜岋紱鍒嗕袱涓瓧娈电粰鍓嶇锛屼究浜庢樉绀恒€屄?5.31 路 璧犻€?楼5.35銆嶃€?       * 閲戦鏄崄杩涘埗瀛楃涓蹭笖甯︿竴闀夸覆灏炬暟锛堝 "9.957584100000000"锛夛紝
       * 杩欓噷鎸夊垎锛? 浣嶅皬鏁帮級褰掍竴锛岄伩鍏嶅墠绔嚭鐜?9.957584100000000銆?*/
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

  /** 鍥為€€锛氭湰鍦?DEEPSEEK_API_KEY 璋冨畼鏂?/user/balance銆?*/
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
      return { ok: false, error: '账号余额查询失败：' + String((e && e.message) || e) }
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

  // 鈹€鈹€ 娉ㄥ叆锛氱粨鏋勫寲娉ㄥ叆琛岋紙妗岄潰绔敮涓€鐢熸晥鐨勯€氶亾锛夆攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  // introEnabled controls whether the boot veil row is injected; intro.js is always injected for replay.
  ctx.effect(() => ctx.on('webserver/index-inject', (table) => {
    for (const row of injectionRows(readSize().introEnabled)) table.push(row)
  }))

  ctx.effect(() => () => {
    for (const d of disposers) { try { d() } catch (e) {} }
  })
}

export { name, inject, apply }
