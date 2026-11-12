/* ============================================================================
 * 尤诺主题 · 开场（1A + 2B）
 * ----------------------------------------------------------------------------
 * 0) 黑屏：「欢迎回来，空白」+ WELCOME BACK · BLANK 最开头同时淡入/淡出。
 * 1) 首帧线稿：按首帧亮部内容自动取「中间部分」（宽就阔、窄就收），
 *    横向扫描线从区域左到右描出轮廓（不是写死 1/3）。
 * 2) 原粒子：PV 上下粒子旋一圈聚成月亮；抽卡四角逆时针漩涡拟合首帧。
 *    粒子轨迹改为连续水纹拖尾，不做区块式采样块。
 * 3) 线稿与粒子淡出，影片淡入。
 * ==========================================================================*/
;(function () {
  'use strict'
  if (window.__ynMoon) return

  var TEXT_IN = 0.12
  var TEXT_OUT = 1.15
  var P_START = 1.75
  var P_END = 6.1
  var VIDEO_AT = 6.25
  var FADE_AT = 6.3
  var END_AT = 7.45

  var canvas = null
  var ctx = null
  var welcome = null
  var raf = 0
  var startedAt = 0
  var lastNow = 0
  var W = 0
  var H = 0
  var RENDER = 0.75
  var stopped = false
  var callbackDone = false
  var cbRef = null
  var welcomeShown = false
  var welcomeHidden = false

  var mode = 'moon' // moon | fit
  var art = null
  var poster = null
  var region = { l: 0, r: 0, t: 0, b: 0, cx: 0, cy: 0 }
  var lineStrokes = []
  var particles = []
  var scanX = 0

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v }
  function ease(t) { t = clamp01(t); return t * t * (3 - 2 * t) }
  function easeInOut(t) { t = clamp01(t); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2 }
  function rnd(a, b) { return a + Math.random() * (b - a) }

  function makeWelcome() {
    welcome = document.createElement('div')
    welcome.className = 'yn-moon-welcome'
    var main = document.createElement('div')
    main.className = 'yn-moon-main'
    main.textContent = '欢迎回来，空白'
    var sub = document.createElement('span')
    sub.className = 'yn-moon-sub'
    sub.textContent = 'WELCOME BACK · BLANK'
    welcome.appendChild(main)
    welcome.appendChild(sub)
  }

  function loadJSON(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status)
      return r.json()
    })
  }
  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      if (!url) { resolve(null); return }
      var im = new Image()
      im.onload = function () { resolve(im) }
      im.onerror = reject
      im.src = url
    })
  }

  /* 首帧内容自适应：取亮部 bbox，再取中间一段 */
  function buildRegion(img) {
    var cx = W / 2
    var cy = H / 2
    var halfW = W * 0.20
    var halfH = H * 0.16
    if (img) {
      var sw = 200
      var sh = Math.max(1, Math.round(sw * img.naturalHeight / img.naturalWidth))
      var sc = document.createElement('canvas')
      sc.width = sw; sc.height = sh
      var sx = sc.getContext('2d')
      sx.drawImage(img, 0, 0, sw, sh)
      var data
      try { data = sx.getImageData(0, 0, sw, sh).data } catch (e) { data = null }
      if (data) {
        var minX = sw, maxX = 0, minY = sh, maxY = 0, found = 0
        for (var y = 0; y < sh; y++) {
          for (var x = 0; x < sw; x++) {
            var i = (y * sw + x) * 4
            var lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
            if (lum < 52) continue
            found++
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
        }
        if (found > 60) {
          var bw = (maxX - minX) / sw
          var bh = (maxY - minY) / sh
          cx = ((minX + maxX) / 2 / sw) * W
          cy = ((minY + maxY) / 2 / sh) * H
          halfW = Math.max(W * 0.105, bw * W * 0.40)
          halfH = Math.max(H * 0.10, bh * H * 0.34)
        }
      }
    }
    region = {
      cx: cx,
      cy: cy,
      l: Math.max(0, cx - halfW),
      r: Math.min(W, cx + halfW),
      t: Math.max(0, cy - halfH),
      b: Math.min(H, cy + halfH),
    }
  }

  function buildLineStrokes() {
    lineStrokes = []
    if (!art) return
    var sw = (art.size && art.size[0]) || 1600
    var sh = (art.size && art.size[1]) || 900
    var s = Math.max(W / sw, H / sh)
    var dw = sw * s
    var dh = sh * s
    var ox = (W - dw) / 2
    var oy = (H - dh) / 2
    var list = art.strokes || []
    for (var i = 0; i < list.length; i++) {
      var src = list[i]
      var pts = src.points
      if (!pts || pts.length < 2) continue
      var mapped = []
      for (var j = 0; j < pts.length; j++) {
        mapped.push([ox + pts[j][0] * dw, oy + pts[j][1] * dh])
      }
      // 只保留落在这个「中间区域」附近的笔画
      var inRegion = false
      for (var k = 0; k < mapped.length; k++) {
        if (mapped[k][0] >= region.l - W * 0.03 && mapped[k][0] <= region.r + W * 0.03 &&
            mapped[k][1] >= region.t - H * 0.03 && mapped[k][1] <= region.b + H * 0.03) {
          inRegion = true
          break
        }
      }
      if (!inRegion) continue
      lineStrokes.push({ pts: mapped, width: src.width || 1.2 })
    }
  }

  var PALETTE = [
    [240, 243, 250], [228, 232, 246], [255, 238, 205], [236, 206, 152],
    [168, 216, 255], [120, 176, 240], [78, 128, 205], [46, 74, 132],
  ]
  function paletteIndex(r, g, b) {
    var best = 0, bd = 1e9
    for (var i = 0; i < PALETTE.length; i++) {
      var dr = r - PALETTE[i][0], dg = g - PALETTE[i][1], db = b - PALETTE[i][2]
      var d = dr * dr + dg * dg + db * db
      if (d < bd) { bd = d; best = i }
    }
    return best
  }

  function buildParticles() {
    particles = []
    var cx = W * 0.47
    var cy = H * 0.44
    if (mode === 'moon') {
      var moonR = Math.min(W, H) * 0.27
      var top = 2500
      var bottom = 2500
      for (var i = 0; i < top + bottom; i++) {
        var fromTop = i < top
        var tr = moonR * Math.sqrt(Math.random())
        var ta = Math.random() * Math.PI * 2
        var tx = cx + Math.cos(ta) * tr
        var ty = cy + Math.sin(ta) * tr
        var sx = W * (0.06 + Math.random() * 0.88)
        var sy = fromTop ? -40 - Math.random() * H * 0.35 : H + 40 + Math.random() * H * 0.35
        var sa = Math.atan2(sy - cy, sx - cx)
        var taa = Math.atan2(ty - cy, tx - cx)
        var delta = taa - sa
        while (delta > Math.PI) delta -= Math.PI * 2
        while (delta < -Math.PI) delta += Math.PI * 2
        var dir = fromTop ? 1 : -1
        var gold = Math.random() < 0.14
        var color = gold ? [238, 213, 166] : (Math.random() < 0.22 ? [150, 202, 255] : [228, 238, 255])
        particles.push({
          sx: sx, sy: sy, tx: tx, ty: ty,
          sa: sa, d: delta + dir * Math.PI * 2,
          sr: Math.hypot(sx - cx, sy - cy),
          tr: Math.hypot(tx - cx, ty - cy),
          cx: cx, cy: cy,
          size: rnd(0.55, 1.25),
          alpha: rnd(0.46, 0.95),
          delay: Math.random() * 0.35,
          cat: paletteIndex(color[0], color[1], color[2]),
          tw: rnd(0, 6.28),
          twinkle: rnd(0.7, 2.1),
        })
      }
      return
    }
    // fit：从首帧亮部采样颗粒，四角漩涡向目标
    if (!poster) return
    var sw = 260
    var sh = Math.max(1, Math.round(sw * poster.naturalHeight / poster.naturalWidth))
    var sc = document.createElement('canvas')
    sc.width = sw; sc.height = sh
    var sx2 = sc.getContext('2d')
    sx2.drawImage(poster, 0, 0, sw, sh)
    var data2 = null
    try { data2 = sx2.getImageData(0, 0, sw, sh).data } catch (e) { data2 = null }
    var mapS = Math.max(W / poster.naturalWidth, H / poster.naturalHeight)
    var dw = poster.naturalWidth * mapS
    var dh = poster.naturalHeight * mapS
    var ox = (W - dw) / 2
    var oy = (H - dh) / 2
    var need = 9000
    var tries = 0
    while (particles.length < need && tries < need * 12) {
      tries++
      var px = Math.floor(Math.random() * sw)
      var py = Math.floor(Math.random() * sh)
      var idx = (py * sw + px) * 4
      var r = 228, g = 236, b = 255
      if (data2) {
        r = data2[idx]; g = data2[idx + 1]; b = data2[idx + 2]
        var lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
        if (lum < 68) continue
      }
      var tx2 = ox + (px / sw) * dw
      var ty2 = oy + (py / sh) * dh
      var corner = (tx2 < W / 2 ? 0 : 1) + (ty2 < H / 2 ? 0 : 2)
      var sx0 = corner === 0 || corner === 2 ? -80 : W + 80
      var sy0 = corner === 0 || corner === 1 ? -80 : H + 80
      sx0 += rnd(-80, 80); sy0 += rnd(-80, 80)
      var sa2 = Math.atan2(sy0 - H / 2, sx0 - W / 2)
      var ta2 = Math.atan2(ty2 - H / 2, tx2 - W / 2)
      var d2 = ta2 - sa2
      while (d2 > Math.PI) d2 -= Math.PI * 2
      while (d2 < -Math.PI) d2 += Math.PI * 2
      particles.push({
        sx: sx0, sy: sy0, tx: tx2, ty: ty2,
        sa: sa2, d: d2 - Math.PI * 2,
        sr: Math.hypot(sx0 - W / 2, sy0 - H / 2),
        tr: Math.hypot(tx2 - W / 2, ty2 - H / 2),
        cx: W / 2, cy: H / 2,
        size: rnd(0.52, 1.15),
        alpha: rnd(0.44, 0.92),
        delay: Math.random() * 0.3,
        cat: paletteIndex(r, g, b),
        tw: rnd(0, 6.28),
        twinkle: rnd(0.7, 2.1),
      })
    }
  }

  function addDot(groups, cat, alpha, x, y, r) {
    if (alpha <= 0.012 || r <= 0.12) return
    var a = Math.round(alpha * 8) / 8
    var key = cat + '|' + a
    var g = groups[key]
    if (!g) g = groups[key] = { cat: cat, alpha: a, pts: [] }
    g.pts.push(x, y, r)
  }
  function flushDots(groups) {
    for (var key in groups) {
      var g = groups[key]
      var c = PALETTE[g.cat] || PALETTE[0]
      ctx.globalAlpha = g.alpha
      ctx.fillStyle = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'
      ctx.beginPath()
      var pts = g.pts
      for (var i = 0; i < pts.length; i += 3) {
        var r = pts[i + 2]
        ctx.rect(pts[i] - r, pts[i + 1] - r, r * 2, r * 2)
      }
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  function drawParticles(t) {
    var p0 = clamp01((t - P_START) / (P_END - P_START))
    var p = ease(p0)
    if (p <= 0) return
    var fade = 1
    if (t > P_END - 0.35) fade = clamp01((VIDEO_AT - t) / 0.35)
    var groups = {}
    for (var i = 0; i < particles.length; i++) {
      var q = particles[i]
      var local = clamp01((p - q.delay) / (1 - q.delay))
      if (local <= 0) continue
      var e = easeInOut(local)
      for (var k = 0; k < 4; k++) {
        var ek = e - k * 0.007
        if (ek <= 0) continue
        var angle = q.sa + q.d * ek
        var rad = q.sr + (q.tr - q.sr) * ek
        var x = q.cx + Math.cos(angle) * rad
        var y = q.cy + Math.sin(angle) * rad
        var tw = 0.65 + 0.35 * Math.sin(t * 2.6 + q.tw + k * 0.7)
        var a = q.alpha * tw * (0.30 + 0.70 * e) * fade
        if (k > 0) a *= 0.26 / k
        var size = q.size * (1.15 - 0.35 * e) * (k === 0 ? 1 : 0.76)
        addDot(groups, q.cat, a, x, y, size)
        if (k === 0) addDot(groups, q.cat, a * 0.12, x, y, size * 3.0)
      }
    }
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    if (mode === 'moon') {
      var glow = ctx.createRadialGradient(W * 0.47, H * 0.44, 8, W * 0.47, H * 0.44, Math.min(W, H) * 0.38)
      glow.addColorStop(0, 'rgba(190, 218, 255, ' + (0.16 * p * fade) + ')')
      glow.addColorStop(0.6, 'rgba(130, 175, 240, ' + (0.07 * p * fade) + ')')
      glow.addColorStop(1, 'rgba(10, 20, 40, 0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(W * 0.47, H * 0.44, Math.min(W, H) * 0.38, 0, 6.2832)
      ctx.fill()
    }
    flushDots(groups)
    ctx.restore()
  }

  function drawLineArt(alpha) {
    if (!lineStrokes.length) return
    ctx.save()
    ctx.beginPath()
    ctx.rect(region.l, region.t, region.r - region.l, region.b - region.t)
    ctx.clip()
    ctx.beginPath()
    ctx.rect(region.l, 0, Math.min(W, scanX) - region.l, H)
    ctx.clip()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.shadowColor = 'rgba(238, 214, 160, 0.42)'
    ctx.shadowBlur = 4
    for (var i = 0; i < lineStrokes.length; i++) {
      var s = lineStrokes[i]
      ctx.beginPath()
      ctx.moveTo(s.pts[0][0], s.pts[0][1])
      for (var j = 1; j < s.pts.length; j++) ctx.lineTo(s.pts[j][0], s.pts[j][1])
      ctx.strokeStyle = 'rgba(242, 226, 182, ' + alpha.toFixed(3) + ')'
      ctx.lineWidth = Math.max(0.85, s.width * 0.9)
      ctx.stroke()
    }
    ctx.restore()
  }

  function drawScanLine() {
    var y = region.cy
    var x0 = region.l
    var x1 = scanX
    if (x1 <= x0) return
    var g = ctx.createLinearGradient(x0, y, x1, y)
    g.addColorStop(0, 'rgba(236, 216, 170, 0)')
    g.addColorStop(0.7, 'rgba(236, 216, 170, 0.32)')
    g.addColorStop(1, 'rgba(255, 244, 214, 0.8)')
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = g
    ctx.lineWidth = 1.25
    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.lineTo(x1, y)
    ctx.stroke()
    var head = ctx.createRadialGradient(x1, y, 1, x1, y, 38)
    head.addColorStop(0, 'rgba(255, 248, 224, 0.9)')
    head.addColorStop(0.4, 'rgba(238, 214, 160, 0.4)')
    head.addColorStop(1, 'rgba(120, 170, 240, 0)')
    ctx.fillStyle = head
    ctx.beginPath()
    ctx.arc(x1, y, 38, 0, 6.2832)
    ctx.fill()
    ctx.restore()
  }

  function draw(now) {
    if (!ctx) return
    var t = (now - startedAt) / 1000
    lastNow = now
    ctx.setTransform(RENDER, 0, 0, RENDER, 0, 0)
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#020409'
    ctx.fillRect(0, 0, W, H)

    if (!welcomeShown && t >= TEXT_IN) {
      welcomeShown = true
      welcome.classList.add('is-in')
    }
    if (!welcomeHidden && t >= TEXT_OUT) {
      welcomeHidden = true
      welcome.classList.remove('is-in')
    }
    if (welcome && t >= TEXT_OUT + 0.9 && welcome.parentNode) {
      welcome.parentNode.removeChild(welcome)
      welcome = null
    }

    // 原粒子阶段：PV 聚月 / 抽卡四角拟合，轨迹为连续水纹拖尾
    if (t >= P_START) drawParticles(t)

    if (!callbackDone && t >= VIDEO_AT) {
      callbackDone = true
      if (typeof cbRef === 'function') {
        var cb = cbRef
        cbRef = null
        cb({ done: true })
      }
    }
    if (t >= FADE_AT) {
      var fade = 1 - clamp01((t - FADE_AT) / (END_AT - FADE_AT))
      if (canvas) canvas.style.opacity = fade
      if (welcome) welcome.style.opacity = fade
    }
    if (t >= END_AT) {
      finish()
      return
    }
    raf = requestAnimationFrame(tick)
  }

  function tick(now) {
    if (stopped) return
    try { draw(now) } catch (err) {
      window.__ynMoonErr = String(err && err.stack ? err.stack : err)
      finish()
    }
  }

  function finish() {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    cleanupDom()
  }

  function cleanupDom() {
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas)
    if (welcome && welcome.parentNode) welcome.parentNode.removeChild(welcome)
    canvas = null
    ctx = null
    welcome = null
    particles = []
    lineStrokes = []
  }

  function play(container, opts, cb) {
    if (!container || !window.requestAnimationFrame) return false
    if (!opts || !opts.artUrl) return false
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
    cbRef = typeof cb === 'function' ? cb : null
    callbackDone = false
    stopped = false
    welcomeShown = false
    welcomeHidden = false
    mode = opts.mode === 'fit' ? 'fit' : 'moon'
    W = window.innerWidth
    H = window.innerHeight
    RENDER = Math.min(0.78, Math.max(0.58, (window.devicePixelRatio || 1) * 0.55))
    canvas = document.createElement('canvas')
    canvas.className = 'yn-moon-canvas'
    canvas.width = Math.round(W * RENDER)
    canvas.height = Math.round(H * RENDER)
    canvas.style.width = W + 'px'
    canvas.style.height = H + 'px'
    ctx = canvas.getContext('2d')
    makeWelcome()
    container.appendChild(canvas)
    container.appendChild(welcome)
    Promise.all([loadJSON(opts.artUrl), loadImage(opts.poster)]).then(function (res) {
      if (stopped) return
      art = res[0]
      poster = res[1]
      buildParticles()
      startedAt = performance.now()
      raf = requestAnimationFrame(tick)
    }).catch(function () {
      cleanupDom()
      stopped = true
      if (typeof cbRef === 'function') {
        var cb2 = cbRef
        cbRef = null
        cb2({ failed: true })
      }
    })
    return true
  }

  function skip() {
    cleanupDom()
    stopped = true
    if (!callbackDone && typeof cbRef === 'function') {
      var cb = cbRef
      cbRef = null
      cb({ skipped: true })
    }
  }

  window.__ynMoon = {
    play: play,
    skip: skip,
    active: function () { return !!canvas && !stopped },
    debug: function () { return { mode: mode, region: region, strokes: lineStrokes.length, particles: particles.length } },
  }
})()
