/* ============================================================================
 * 尤诺主题 · 入场动画播放器（v1.0）
 * ----------------------------------------------------------------------------
 * 流程：宿主注入表（可选的首帧遮罩）→ 本脚本读 /dsh-iuno/size.json
 *       → 默认关闭：立刻撤遮罩，什么都不做
 *       → 开启：建全屏 #yn-intro（深空底 + 海报 + 影片），盖住加载页与应用首帧
 *       → 播完 / 点击 / ESC 跳过：先把「壁纸 + 场景轻纱」克隆层淡入，
 *         再把整层淡出 —— 克隆层与真实背景同源同参数，揭幕不跳色、不跳构图
 *       → 暴露 window.__ynPlayIntro(true) 给桌宠面板「重播」。
 *
 * 行为约定：
 *   · 默认关闭（size.json introEnabled=false）；
 *   · 开启后「应用每次启动」播一次；页面刷新（navigation type=reload）不重播；
 *   · 手动重播不受开关限制；
 *   · prefers-reduced-motion: reduce 时直接跳过影片，只做极短淡出。
 *
 * 边界：Windows 顶部 40px 原生标题栏（titleBarOverlay）盖不住；
 *       图层一律不写 -webkit-app-region（会吃掉窗口拖拽区，v1.0.0 的坑）。
 * ==========================================================================*/
;(function () {
  'use strict'
  if (window.__ynIntroPlayer) return
  window.__ynIntroPlayer = true

  var BASE = '/dsh-iuno'
  var WALL_URL = BASE + '/wall.jpg'
  var html = document.documentElement
  var reduce = false
  try { reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) } catch (e) {}

  var state = 'idle'            // idle | playing | handoff | done
  var preset = null
  var pageCfg = null            // 最近一次读到的 size.json（含 bgMode）
  var overlay = null
  var refs = {}
  var raf = 0
  var timers = []
  var videoReady = false
  var autoStarted = false
  var fxRaf = 0
  var INTRO_SEEN_KEY = 'yn-intro-seen-v1'

  function addTimer(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t }
  function clearTimers() { for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]); timers = [] }
  function setPhase(v) {
    try { if (v) html.setAttribute('data-yn-intro', v); else html.removeAttribute('data-yn-intro') } catch (e) {}
  }
  function clearBoot() { setPhase(null) }

  function fetchSize() {
    return fetch(BASE + '/size.json', { cache: 'no-store' }).then(function (r) { return r.json() })
  }

  function navType() {
    try {
      var list = window.performance && performance.getEntriesByType ? performance.getEntriesByType('navigation') : []
      return (list && list[0] && list[0].type) || 'navigate'
    } catch (e) { return 'navigate' }
  }

  function shouldAuto(size) {
    if (!size || size.introEnabled !== true) return false
    if (navType() === 'reload') return false // 刷新页面不重播（要重播走面板按钮）
    if (size.introMode === 'once') {
      try { if (localStorage.getItem(INTRO_SEEN_KEY) === '1') return false } catch (e) {}
    }
    return true
  }

  function markSeen() {
    try {
      if (pageCfg && pageCfg.introMode === 'once') localStorage.setItem(INTRO_SEEN_KEY, '1')
    } catch (e) {}
  }

  function pickPreset(size) {
    var list = (size && size.introPresets) || []
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === size.introVideo && list[i].available && list[i].url) return list[i]
    }
    for (var j = 0; j < list.length; j++) {
      if (list[j] && list[j].available && list[j].url) return list[j]
    }
    return null
  }

  /** 与 .frame 的真实底色保持一致：优先读 .frame 计算值，其次读设置面板写入的 CSS 变量。 */
  function currentTint() {
    try {
      var frame = document.querySelector('[class*="_frame"]')
      if (frame) {
        var bg = getComputedStyle(frame).backgroundColor
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg
      }
    } catch (e) {}
    var light = 0.08
    var dark = 0.42
    try {
      var cs = getComputedStyle(document.documentElement)
      var l = parseFloat(cs.getPropertyValue('--yn-veil-light'))
      var d = parseFloat(cs.getPropertyValue('--yn-veil-dark'))
      if (isFinite(l)) light = l
      if (isFinite(d)) dark = d
    } catch (e) {}
    return document.body && document.body.hasAttribute('data-ds-dark-theme')
      ? 'rgba(6, 10, 23, ' + dark + ')'
      : 'rgba(247, 250, 255, ' + light + ')'
  }

  function build(p) {
    if (!document.body) return false
    if (overlay) cleanup()

    var root = document.createElement('div')
    root.id = 'yn-intro'
    root.setAttribute('role', 'presentation')

    var wall = document.createElement('div')
    wall.className = 'yn-intro-wall'
    wall.style.backgroundImage = 'url("' + WALL_URL + '")'

    var tint = document.createElement('div')
    tint.className = 'yn-intro-tint'
    tint.style.backgroundColor = currentTint()

    var video = document.createElement('video')
    video.className = 'yn-intro-video'
    // v1.6：恢复视频自带声音；音量由设置面板控制（0 = 静音）
    var vol = pageCfg && typeof pageCfg.introVolume === 'number' ? pageCfg.introVolume : 0
    video.volume = Math.max(0, Math.min(1, vol))
    video.muted = video.volume <= 0.001
    video.defaultMuted = video.muted
    video.playsInline = true
    if (video.muted) video.setAttribute('muted', '')
    video.setAttribute('playsinline', '')
    video.setAttribute('preload', 'auto')
    if (p.url) video.src = p.url

    var poster = document.createElement('div')
    poster.className = 'yn-intro-poster'
    if (p.poster) poster.style.backgroundImage = 'url("' + p.poster + '")'

    var vignette = document.createElement('div')
    vignette.className = 'yn-intro-vignette'

    // 揭幕粒子层：片尾把最后一帧采样成粒子散开（sh 版同款「溶解」手法）
    var fx = document.createElement('canvas')
    fx.className = 'yn-intro-fx'
    fx.setAttribute('aria-hidden', 'true')

    var skip = document.createElement('button')
    skip.type = 'button'
    skip.className = 'yn-intro-skip'
    skip.textContent = '跳过'

    var bar = document.createElement('div')
    bar.className = 'yn-intro-bar'
    var fill = document.createElement('i')

    bar.appendChild(fill)
    root.appendChild(wall)
    root.appendChild(tint)
    root.appendChild(video)
    root.appendChild(poster)
    root.appendChild(vignette)
    root.appendChild(fx)
    root.appendChild(skip)
    root.appendChild(bar)
    document.body.appendChild(root)

    overlay = root
    refs = {
      wall: wall,
      tint: tint,
      video: video,
      poster: poster,
      skip: skip,
      barFill: fill,
      fx: fx,
    }

    // 首帧：先让深空底 + 海报替代原生加载页；缩略图不可用也不影响。
    setPhase('play')

    skip.addEventListener('click', function (e) {
      e.stopPropagation()
      skipIntro()
    })
    root.addEventListener('click', function (e) {
      if (e.target && e.target.closest && e.target.closest('.yn-intro-skip')) return
      skipIntro()
    }, true)

    return true
  }

  function skipIntro() {
    if (state === 'prelude') {
      if (wantsLoopWallpaper()) { try { window.__ynBeginBgLoop() } catch (e) {} }
      if (window.__ynMoon) { try { window.__ynMoon.skip() } catch (e) {} }
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay)
      overlay = null
      refs = {}
      state = 'done'
      clearBoot()
      return
    }
    if (state === 'handoff' && window.__ynMoon && window.__ynMoon.active && window.__ynMoon.active()) {
      try { window.__ynMoon.skip() } catch (e) {}
      if (overlay) overlay.classList.add('is-out')
      addTimer(cleanup, 500)
      return
    }
    endPlayback(true)
  }

  function bindVideo() {
    var video = refs.video
    if (!video) return
    video.addEventListener('ended', function () { endPlayback(false) })
    video.addEventListener('error', function () { failOpen('video error') })
    video.addEventListener('timeupdate', function () {
      if (state !== 'playing' || !preset) return
      var start = preset.start || 0
      var end = (preset.end && preset.end > start) ? preset.end : video.duration
      if (end && video.currentTime >= end - 0.04) endPlayback(false)
    })
  }

  function startVideo() {
    var video = refs.video
    if (!video || !preset) return

    function begin() {
      if (videoReady || state !== 'playing') return
      videoReady = true
      if (preset.start && preset.start > 0) {
        try { video.currentTime = preset.start } catch (e) {}
      }
      var pr = null
      try { pr = video.play() } catch (e) {}
      if (pr && pr.catch) {
        pr.catch(function () {
          // 万一电子壳拦了「有声自动播放」：先降级静音把画面播起来，
          // 用户第一次点击后再尝试恢复声音（音量设置不变）。
          try {
            video.muted = true
            video.play().catch(function () {})
          } catch (e) {}
          var once = function () {
            document.removeEventListener('pointerdown', once, true)
            if (state !== 'playing') return
            try {
              video.muted = !(video.volume > 0.001)
              video.play().catch(function () {})
            } catch (e) {}
          }
          document.addEventListener('pointerdown', once, true)
        })
      }
      if (overlay) overlay.classList.add('is-video-ready')
      if (refs.skip) addTimer(function () { if (state === 'playing' && refs.skip) refs.skip.classList.add('is-on') }, 900)
      tick()
    }

    if (video.readyState >= 2) begin()
    else {
      video.addEventListener('loadeddata', begin)
      video.addEventListener('canplay', begin)
      addTimer(function () { if (!videoReady) failOpen('video timeout') }, 15000)
    }
  }

  function tick() {
    cancelAnimationFrame(raf)
    function loop() {
      raf = requestAnimationFrame(loop)
      if (state !== 'playing' || !refs.video || !preset) return
      var v = refs.video
      var start = preset.start || 0
      var end = (preset.end && preset.end > start) ? preset.end : (isFinite(v.duration) ? v.duration : 0)
      if (!end) return
      var p = Math.max(0, Math.min(1, (v.currentTime - start) / Math.max(0.01, end - start)))
      if (refs.barFill) refs.barFill.style.width = (p * 100).toFixed(2) + '%'
      if (p >= 0.999) endPlayback(false)
    }
    raf = requestAnimationFrame(loop)
  }

  /** 揭幕前等一等：确认应用壳已经挂载（原生加载页消失 + #root 有内容），
   *  最多等 capMs；等不到也照常淡出（不留黑屏）。 */
  function whenShellReady(cb, capMs) {
    var root = document.getElementById('root')
    var done = false
    var obs = null
    var timer = 0
    function check() {
      if (done) return
      if (root && root.firstElementChild && !root.querySelector('[data-dsh-boot]')) {
        done = true
        if (obs) obs.disconnect()
        clearTimeout(timer)
        requestAnimationFrame(function () { requestAnimationFrame(function () { cb() }) })
      }
    }
    if (root && typeof MutationObserver === 'function') {
      obs = new MutationObserver(check)
      obs.observe(root, { childList: true, subtree: true })
    }
    timer = setTimeout(function () {
      if (done) return
      done = true
      if (obs) obs.disconnect()
      cb()
    }, capMs || 8000)
    check()
  }

  /** 揭幕粒子：把当前视频帧采样成数千个彩色光点向外散开，
   *  和壁纸/界面淡入同时进行 —— 就是 sh 版那种「消散后聚合成背景」的效果。 */
  function startDissolve() {
    if (reduce) return
    var v = refs.video
    var cv = refs.fx
    if (!v || !cv) return
    try {
      var w = window.innerWidth
      var h = window.innerHeight
      var dpr = Math.min(2, window.devicePixelRatio || 1)
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
      cv.style.width = w + 'px'
      cv.style.height = h + 'px'
      var ctx = cv.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      var vw = v.videoWidth || 1920
      var vh = v.videoHeight || 886
      var scale = Math.max(w / vw, h / vh)
      var dw = vw * scale
      var dh = vh * scale
      ctx.drawImage(v, (w - dw) / 2, (h - dh) / 2, dw, dh)
      var img = ctx.getImageData(0, 0, cv.width, cv.height)
      var data = img.data
      var step = Math.round(18 * dpr)
      var pts = []
      for (var gy = 0; gy < cv.height; gy += step) {
        for (var gx = 0; gx < cv.width; gx += step) {
          var idx = (gy * cv.width + gx) * 4
          if (data[idx + 3] < 20) continue
          var x = gx / dpr
          var y = gy / dpr
          var dx = x - w / 2
          var dy = y - h / 2
          var dist = Math.sqrt(dx * dx + dy * dy) || 1
          var speed = 26 + dist * 0.34
          pts.push({
            x: x, y: y,
            r: data[idx], g: data[idx + 1], b: data[idx + 2],
            vx: (dx / dist) * speed + (Math.random() - 0.5) * 16,
            vy: (dy / dist) * speed + (Math.random() - 0.5) * 16 - 8,
          })
        }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      var t0 = performance.now()
      function frame(now) {
        var t = Math.min(1, (now - t0) / 1350)
        var ease = 1 - (1 - t) * (1 - t)
        ctx.clearRect(0, 0, cv.width, cv.height)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        for (var i = 0; i < pts.length; i++) {
          var p = pts[i]
          var alpha = (1 - t) * 0.92
          if (alpha <= 0.01) continue
          ctx.fillStyle = 'rgba(' + p.r + ',' + p.g + ',' + p.b + ',' + alpha.toFixed(3) + ')'
          var size = 2.6 * (1 - 0.45 * t)
          ctx.fillRect(p.x + p.vx * ease * 0.9, p.y + p.vy * ease * 0.9 + 34 * ease * ease, size, size)
        }
        if (t < 1) {
          fxRaf = requestAnimationFrame(frame)
        } else {
          try { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height) } catch (e) {}
        }
      }
      fxRaf = requestAnimationFrame(frame)
    } catch (e) {}
  }

  function stopDissolve() {
    cancelAnimationFrame(fxRaf)
    fxRaf = 0
    try {
      var cv = refs.fx
      if (cv && cv.getContext) {
        var ctx = cv.getContext('2d')
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, cv.width, cv.height)
      }
    } catch (e) {}
  }

  function wantsLoopWallpaper() {
    if (!preset) return false
    if (preset.id !== 'gacha' && preset.id !== 'gacha-short') return false
    if (pageCfg && pageCfg.loopWallpaperEnabled === false) return false
    return !!(window.__ynBeginBgLoop)
  }

  function endPlayback(skipped) {
    if (state !== 'playing') return
    state = 'handoff'
    cancelAnimationFrame(raf)
    raf = 0
    clearTimers()
    if (refs.video) { try { refs.video.pause() } catch (e) {} }
    if (refs.skip) refs.skip.classList.remove('is-on')
    if (!overlay) { cleanup(); return }

    if (skipped || reduce) {
      // 跳过：等壳挂载后快速淡出；抽卡则把背后的循环壁纸同步到第 0 帧一起露出
      whenShellReady(function () {
        if (!overlay) { cleanup(); return }
        if (wantsLoopWallpaper()) { try { window.__ynBeginBgLoop() } catch (e) {} }
        overlay.classList.add('is-out')
        addTimer(cleanup, wantsLoopWallpaper() ? 650 : 420)
      }, 2500)
      return
    }

    // 自然播完：抽卡长/短版 → 背后循环壁纸回到第 0 帧，整层淡出直接接上；
    // PV（或循环不可用）→ 默认壁纸克隆层淡入。
    whenShellReady(function () {
      if (!overlay) { cleanup(); return }
      if (wantsLoopWallpaper()) {
        try { window.__ynBeginBgLoop() } catch (e) {}
        overlay.classList.add('is-out')
        addTimer(cleanup, 1000)
        return
      }
      overlay.classList.add('is-handoff')
      addTimer(function () { if (overlay) overlay.classList.add('is-out') }, 1500)
      addTimer(cleanup, 2300)
    }, 9000)
  }

  function failOpen(reason) {
    try { if (window.console && console.warn) console.warn('[yn-intro]', reason) } catch (e) {}
    if (overlay) {
      overlay.classList.add('is-out')
      addTimer(cleanup, 320)
    } else {
      cleanup()
    }
  }

  function cleanup() {
    state = 'done'
    if (window.__ynMoon && typeof window.__ynMoon.skip === 'function') {
      try { window.__ynMoon.skip() } catch (e) {}
    }
    stopDissolve()
    clearTimers()
    cancelAnimationFrame(raf)
    raf = 0
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay)
    overlay = null
    refs = {}
    videoReady = false
    clearBoot()
  }

  function play(p) {
    if (!p || !p.url || !document.body) return false
    if (state === 'playing' || state === 'handoff' || state === 'prelude') return false
    if (reduce) { clearBoot(); return true }
    preset = p
    markSeen()
    if (!build(p)) { clearBoot(); return false }
    bindVideo()

    // 开场：欢迎字整体淡入/淡出 → 首帧线稿横向扫描（只描中间约 1/3）→ 淡入影片。
    var cfg = pageCfg || {}
    if (cfg.moonIntroEnabled !== false && p.artUrl && window.__ynMoon) {
      var started = false
      try {
        state = 'prelude'
        overlay.classList.add('is-moon-intro')
        started = window.__ynMoon.play(overlay, {
          artUrl: p.artUrl,
          poster: p.poster,
          mode: p.id === 'pv' ? 'moon' : 'fit',
        }, function () {
          if (state !== 'prelude') return
          if (overlay) overlay.classList.remove('is-moon-intro')
          state = 'playing'
          startVideo()
        })
      } catch (e) { started = false }
      if (started) return true
      state = 'idle'
      if (overlay) overlay.classList.remove('is-moon-intro')
    }

    state = 'playing'
    startVideo()
    return true
  }

  window.__ynPlayIntro = function (force) {
    if (force !== true) return false
    if (state === 'playing' || state === 'handoff' || state === 'prelude') return false
    fetchSize().then(function (size) {
      pageCfg = size
      var p = pickPreset(size)
      if (p) play(p)
    }).catch(function () {})
    return true
  }

  window.__ynIntroState = function () {
    return {
      state: state,
      videoReady: videoReady,
      preset: preset && preset.id,
      volume: refs.video ? refs.video.volume : (pageCfg && pageCfg.introVolume),
      muted: refs.video ? refs.video.muted : null,
      moon: !!(window.__ynMoon && window.__ynMoon.active && window.__ynMoon.active()),
    }
  }

  function auto() {
    if (autoStarted) return
    autoStarted = true
    fetchSize().then(function (size) {
      pageCfg = size
      if (!shouldAuto(size)) { clearBoot(); return }
      var p = pickPreset(size)
      if (!p) { clearBoot(); return }
      if (reduce) { clearBoot(); return }
      if (!play(p)) clearBoot()
    }).catch(function () { clearBoot() })
  }

  // ESC 跳过（捕获阶段，避免被 DSH 自己的快捷键消费）
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.key === 'Esc') {
      if (state === 'playing' || state === 'prelude') skipIntro()
    }
  }, true)

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto, { once: true })
  else auto()
})()
