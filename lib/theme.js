/* ============================================================================
 * 尤诺主题 · 背景 / 显示参数
 * ----------------------------------------------------------------------------
 * v1.4.0：按用户要求背景固定为「静态壁纸」（不再有 loop/微动效）。
 * 职责：
 *   1. 铺壁纸层（.yn-skin-wall）——显示参数由 CSS 变量驱动：
 *        --yn-wall-brightness（亮度）/ --yn-wall-dim（压暗）/ --yn-wall-blur（模糊）
 *        --yn-veil-light / --yn-veil-dark（浅/深色场景轻纱）
 *        --yn-ui-alpha（侧栏/输入卡等玻璃面板不透明度系数）
 *   2. 对外钩子（设置面板/桌宠面板实时改）：
 *        window.__ynApplyLook(partial)   改任意显示参数并立即生效
 *        window.__ynSetWallBrightness(v) / __ynSetAmbience(v) / __ynReloadWall()
 *
 * 只挂 body 上的独立图层，不碰 React 管理的 DOM。
 * ==========================================================================*/
;(function () {
  'use strict'
  if (window.__dshIunoSkin) return
  window.__dshIunoSkin = true

  var BASE = '/dsh-iuno'
  var PREVIEW = window.__YN_PREVIEW || null
  var WALL_URL = (PREVIEW && PREVIEW.wall) || BASE + '/wall.jpg'
  var root = document.documentElement

  var cfg = {
    wallBrightness: 0.86,
    ambience: 1,
    wallDim: 0,
    wallBlur: 0,
    veilLight: 0.08,
    veilDark: 0.42,
    uiAlpha: 1,
  }

  var wallEl = null
  var VIDEO_MODE_KEYS = ['motion', 'bgMode']
  var NUMERIC_FIELDS = ['wallBrightness', 'ambience', 'wallDim', 'wallBlur', 'veilLight', 'veilDark', 'uiAlpha']

  /* ── 图层 ──────────────────────────────────────────────────────────────── */
  function buildWall() {
    if (document.querySelector('.yn-skin-wall')) return
    var wall = document.createElement('div')
    wall.className = 'yn-skin-wall'
    wall.setAttribute('aria-hidden', 'true')
    wall.style.backgroundImage = 'url("' + WALL_URL + '")'
    document.body.appendChild(wall)
    wallEl = wall
  }

  function buildVeil() {
    if (document.querySelector('.yn-skin-veil')) return
    var veil = document.createElement('div')
    veil.className = 'yn-skin-veil'
    veil.setAttribute('aria-hidden', 'true')
    var stars = document.createElement('div')
    stars.className = 'yn-skin-stars'
    veil.appendChild(stars)
    document.body.appendChild(veil)
  }

  /* ── 变量应用 ──────────────────────────────────────────────────────────── */
  function applyVars() {
    root.style.setProperty('--yn-wall-brightness', String(cfg.wallBrightness))
    root.style.setProperty('--yn-wall-dim', String(cfg.wallDim))
    root.style.setProperty('--yn-wall-blur', cfg.wallBlur + 'px')
    root.style.setProperty('--yn-veil-light', String(cfg.veilLight))
    root.style.setProperty('--yn-veil-dark', String(cfg.veilDark))
    root.style.setProperty('--yn-ui-alpha', String(cfg.uiAlpha))
  }

  function applyAmbience(v) {
    var n = Number(v)
    if (!isFinite(n)) n = 1
    n = Math.max(0, Math.min(1, n))
    cfg.ambience = n
    root.style.setProperty('--yn-ambience', String(n))
    var veil = document.querySelector('.yn-skin-veil')
    if (veil) veil.toggleAttribute('hidden', n <= 0.01)
  }

  function applyWallBrightness(v) {
    var n = Number(v)
    if (!isFinite(n)) n = 0.86
    cfg.wallBrightness = Math.max(0.4, Math.min(1, n))
    applyVars()
  }

  /** 设置面板的实时钩子：接受任意显示参数子集（motion/bgMode 等旧字段忽略）。 */
  function applyLook(patch) {
    if (!patch || typeof patch !== 'object') return
    for (var i = 0; i < NUMERIC_FIELDS.length; i++) {
      var k = NUMERIC_FIELDS[i]
      if (typeof patch[k] === 'number' && isFinite(patch[k])) cfg[k] = patch[k]
    }
    applyVars()
    applyAmbience(cfg.ambience)
  }
  window.__ynApplyLook = applyLook

  /* ── 对外钩子（兼容旧接口）─────────────────────────────────────────────── */
  function reloadWall() {
    var bust = WALL_URL + (WALL_URL.indexOf('?') === -1 ? '?' : '&') + 't=' + Date.now()
    if (wallEl) wallEl.style.backgroundImage = 'url("' + bust + '")'
    fetchSize().then(function (parsed) {
      mergeConfig(parsed)
      applyVars()
      applyAmbience(cfg.ambience)
    }).catch(function () {})
  }
  window.__ynReloadWall = reloadWall
  window.__ynSetWallBrightness = applyWallBrightness
  window.__ynSetAmbience = applyAmbience

  window.addEventListener('yn:ambience', function (e) {
    applyAmbience(e && e.detail !== undefined ? e.detail : 1)
  })
  window.addEventListener('yn:wallBrightness', function (e) {
    applyWallBrightness(e && e.detail !== undefined ? e.detail : 0.86)
  })

  /* ── 配置 ──────────────────────────────────────────────────────────────── */
  function mergeConfig(parsed) {
    if (!parsed || typeof parsed !== 'object') return
    for (var i = 0; i < NUMERIC_FIELDS.length; i++) {
      var k = NUMERIC_FIELDS[i]
      if (typeof parsed[k] === 'number' && isFinite(parsed[k])) cfg[k] = parsed[k]
    }
    // 旧配置里的 bgMode/motion 一律忽略（静态壁纸）
  }

  function fetchSize() {
    return fetch(BASE + '/size.json', { cache: 'no-store' }).then(function (r) { return r.json() })
  }

  function start() {
    buildWall()
    buildVeil()
    applyVars()
    applyAmbience(cfg.ambience)
    if (PREVIEW) return
    refreshBgLoop()
    fetchSize()
      .then(function (parsed) {
        mergeConfig(parsed)
        applyVars()
        applyAmbience(cfg.ambience)
      })
      .catch(function () {})
  }

  /* ── 抽卡片尾循环壁纸 ───────────────────────────────────────────────────
   * 仅当入场影片是抽卡长/短版、入场开启、且循环素材可用时启用；
   * 视频层压在静态壁纸之上（同 z-index -1，后挂载），UI 仍在其上。
   * 1600×1000 / 30fps / 1.7MB，解码约 6.4MB/帧，窗口隐藏时自动暂停。
   */
  var bgLoopEl = null
  var bgLoopWanted = false

  function stopBgLoop() {
    if (!bgLoopEl) return
    try { bgLoopEl.pause() } catch (e) {}
    if (bgLoopEl.parentNode) bgLoopEl.parentNode.removeChild(bgLoopEl)
    try { bgLoopEl.removeAttribute('src'); bgLoopEl.load() } catch (e) {}
    bgLoopEl = null
    bgLoopWanted = false
    document.documentElement.removeAttribute('data-yn-bgloop')
  }

  function ensureBgLoop(info) {
    if (!info || !info.url) { stopBgLoop(); return }
    if (bgLoopEl) {
      bgLoopWanted = true
      if (sessionStorage.getItem('yn-bgloop-on') === '1') playBgLoop()
      return
    }
    var v = document.createElement('video')
    v.className = 'yn-skin-bgloop'
    v.setAttribute('aria-hidden', 'true')
    v.muted = true
    v.defaultMuted = true
    v.loop = true
    v.autoplay = false
    v.playsInline = true
    v.preload = 'metadata'
    if (info.poster) v.poster = info.poster
    v.src = info.url
    document.body.appendChild(v)
    bgLoopEl = v
    bgLoopWanted = true
    v.addEventListener('loadeddata', function () {
      if (bgLoopWanted && sessionStorage.getItem('yn-bgloop-on') === '1') playBgLoop()
    })
    document.documentElement.setAttribute('data-yn-bgloop', 'on')
  }

  function playBgLoop() {
    if (!bgLoopEl || !bgLoopWanted) return
    if (document.visibilityState === 'hidden') return
    try {
      bgLoopEl.classList.add('is-on')
      var p = bgLoopEl.play()
      if (p && p.catch) p.catch(function () {})
    } catch (e) {}
  }

  function refreshBgLoop() {
    return fetchSize().then(function (size) {
      var id = size && size.introVideo
      var want = !!(size && size.introEnabled && size.loopWallpaperEnabled !== false &&
        (id === 'gacha' || id === 'gacha-short') &&
        size.bgVideos && size.bgVideos.loop && size.bgVideos.loop.available)
      if (want) ensureBgLoop(size.bgVideos.loop)
      else stopBgLoop()
    }).catch(function () { stopBgLoop() })
  }

  window.__ynRefreshBgLoop = refreshBgLoop
  window.__ynBeginBgLoop = function () {
    try { sessionStorage.setItem('yn-bgloop-on', '1') } catch (e) {}
    if (!bgLoopEl) { refreshBgLoop(); return }
    bgLoopWanted = true
    try { bgLoopEl.currentTime = 0 } catch (e) {}
    playBgLoop()
  }

  document.addEventListener('visibilitychange', function () {
    if (!bgLoopEl) return
    if (document.visibilityState === 'hidden') {
      try { bgLoopEl.pause() } catch (e) {}
    } else {
      playBgLoop()
    }
  })

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
})()
