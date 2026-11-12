/* ============================================================================
 * 尤诺主题 · 设置大面板（theme-settings.js）
 * ----------------------------------------------------------------------------
 * 纯原生 DOM（不碰 React、不依赖任何外部库），配套 DSH 桌面端主题插件。
 *
 * 职责：
 *   · 构建「尤诺主题 · 设置」大面板：启动动画 / 背景 / 显示 / 关于 四个 tab；
 *   · 所有可编辑字段读写 GET/POST /dsh-iuno/size.json；
 *   · 滑块先本地实时应用（window.__ynApplyLook），300ms 防抖后再写服务端；
 *   · 暴露 window.__ynOpenSettings(tab) / window.__ynCloseSettings() 给桌宠面板；
 *   · 自绑 Alt+Y 开关（输入框内不触发）；ESC / 点遮罩关闭。
 *
 * 布局与配色在 theme-settings.css；面板 z-index 2147483100
 * （星尘 2147483000 之上、入场层 2147483300 之下）。
 * 打开时给 <html> 加 data-yn-settings，主题 CSS 可据此弱化星尘 / 壁纸动效。
 *
 * 契约（与宿主 lib/index.js、lib/theme.js 对齐，字段名不要改）：
 *   GET  /dsh-iuno/size.json →
 *        { introEnabled, introMode, introVideo, introPresets[],
 *          wallBrightness, wallDim, wallBlur,
 *          veilLight, veilDark, uiAlpha, ambience, wallCustom }
 *   POST /dsh-iuno/size.json ← 只传要改的字段（JSON）
 *   window.__ynApplyLook(partial)  立即应用外观（可选：veil/ui/bg 等）
 *   window.__ynPlayIntro(true)     重播入场动画
 *   window.__ynReloadWall()        换/恢复背景后重拉壁纸
 *   window.__ynSetWallBrightness() / window.__ynSetAmbience()  老版本兜底
 * ==========================================================================*/
;(function () {
  'use strict'
  if (window.__ynSettingsPanel) return
  window.__ynSettingsPanel = true

  var BASE = '/dsh-iuno'
  var VERSION = 'v1.23.0'
  var TAB_IDS = ['intro', 'bg', 'display', 'about']
  var DEFAULT_TAB = 'intro'
  var WALL_MAX_BYTES = 20 * 1024 * 1024
  var SAVE_DEBOUNCE_MS = 300
  var CLOSE_ANIM_MS = 150
  var FLASH_MS = 2400

  /* 服务端没给 introPresets 时（请求失败 / 旧宿主）的兜底清单 */
  var FALLBACK_PRESETS = [
    { id: 'pv', label: 'PV', available: true, url: BASE + '/intro/pv.mp4', poster: null },
    { id: 'gacha', label: '抽卡', available: false, url: null, poster: null },
    { id: 'gacha-short', label: '抽卡·短', available: false, url: null, poster: null },
  ]

  /* 可编辑滑块：范围 / 步进 / 显示格式（scale=100 表示按百分比显示） */
  var FIELDS = {
    wallBrightness: { label: '壁纸亮度', min: 0.4, max: 1, step: 0.01, scale: 100, suffix: '%' },
    wallDim: { label: '背景压暗', min: 0, max: 0.5, step: 0.01, scale: 100, suffix: '%' },
    wallBlur: { label: '背景模糊', min: 0, max: 16, step: 1, scale: 1, suffix: 'px' },
    veilLight: { label: '浅色纸面', min: 0, max: 0.4, step: 0.01, scale: 100, suffix: '%' },
    veilDark: { label: '深色轻纱', min: 0, max: 0.5, step: 0.01, scale: 100, suffix: '%' },
    uiAlpha: { label: '界面透明度', min: 0.6, max: 1.2, step: 0.01, scale: 100, suffix: '%' },
    ambience: { label: '星尘浓度', min: 0, max: 1, step: 0.01, scale: 100, suffix: '%' },
    introVolume: { label: '片头音量', min: 0, max: 1, step: 0.01, scale: 100, suffix: '%' },
  }

  var conf = normalize(null)
  var loaded = false
  var loadFailed = false
  var loadSeq = 0
  var built = false
  var isOpen = false
  var tab = DEFAULT_TAB
  var el = {}
  var pending = Object.create(null)
  var saveTimer = 0
  var closeTimer = 0
  var statusTimer = 0
  var inflight = 0
  var lastFocus = null
  var pageHost = null            // 侧栏入口把面板挂进主区页面时的容器
  var status = { mode: 'idle', text: '' }

  /* ══════════════════════════════════════════════════════════════════════════
     工具
     ══════════════════════════════════════════════════════════════════════════ */
  function isObj(v) { return !!v && typeof v === 'object' }

  function num(v, lo, hi, dflt) {
    // 注意：Number(null) === 0、Number('') === 0 —— 缺失字段必须先挡掉，
    // 否则默认值会被压到区间最小值（smoke 时踩过）。
    if (v === null || v === undefined || v === '') return dflt
    var n = Number(v)
    if (!isFinite(n)) return dflt
    return Math.max(lo, Math.min(hi, n))
  }

  function pick(v, pool, dflt) {
    return pool.indexOf(v) === -1 ? dflt : v
  }

  function roundTo(v, step) {
    var s = String(step)
    var dot = s.indexOf('.')
    var dec = dot === -1 ? 0 : s.length - dot - 1
    var p = Math.pow(10, dec)
    return Math.round(v * p) / p
  }

  function clonePreset(p) {
    return { id: p.id, label: p.label, available: p.available, url: p.url, poster: p.poster }
  }

  function presetList(raw) {
    var out = []
    if (Array.isArray(raw)) {
      for (var i = 0; i < raw.length; i++) {
        var p = raw[i]
        if (!p || typeof p.id !== 'string' || !p.id) continue
        out.push({
          id: p.id,
          label: typeof p.label === 'string' && p.label ? p.label : p.id,
          available: p.available === true,
          url: typeof p.url === 'string' ? p.url : null,
          poster: typeof p.poster === 'string' ? p.poster : null,
        })
      }
    }
    if (out.length) return out
    return FALLBACK_PRESETS.map(clonePreset)
  }

  function firstAvailablePreset(presets) {
    for (var i = 0; i < presets.length; i++) {
      if (presets[i].available) return presets[i].id
    }
    return presets.length ? presets[0].id : 'pv'
  }

  /** 把服务端返回（或缺失）的配置归一成完整、可渲染的字段集。 */
  function normalize(raw) {
    var d = isObj(raw) ? raw : null
    var presets = presetList(d && d.introPresets)
    var ids = presets.map(function (p) { return p.id })
    var video = d ? pick(d.introVideo, ids, '') : ''
    if (!video) video = firstAvailablePreset(presets)
    return {
      introEnabled: !!(d && d.introEnabled === true),
      introMode: pick(d && d.introMode, ['every', 'once'], 'every'),
      introVideo: video,
      introPresets: presets,
      introVolume: num(d && d.introVolume, 0, 1, 0),
      moonIntroEnabled: !(d && d.moonIntroEnabled === false),
      loopWallpaperEnabled: !(d && d.loopWallpaperEnabled === false),
      wallBrightness: num(d && d.wallBrightness, 0.4, 1, 0.86),
      wallDim: num(d && d.wallDim, 0, 0.5, 0),
      wallBlur: num(d && d.wallBlur, 0, 16, 0),
      veilLight: num(d && d.veilLight, 0, 0.4, 0.18),
      veilDark: num(d && d.veilDark, 0, 0.5, 0.28),
      uiAlpha: num(d && d.uiAlpha, 0.6, 1.2, 1),
      ambience: num(d && d.ambience, 0, 1, 1),
      wallCustom: !!(d && d.wallCustom === true),
    }
  }

  function mk(tag, cls, text) {
    var n = document.createElement(tag)
    if (cls) n.className = cls
    if (text !== undefined && text !== null) n.textContent = String(text)
    return n
  }

  function button(cls, text, action) {
    var b = mk('button', cls, text)
    b.type = 'button'
    if (action) b.setAttribute('data-action', action)
    return b
  }

  function group(title) {
    var g = mk('div', 'yn-settings-group')
    if (title) g.appendChild(mk('p', 'yn-settings-group-title', title))
    return g
  }

  function textBox(label, desc) {
    var box = mk('div', 'yn-settings-row-text')
    box.appendChild(mk('span', 'yn-settings-label', label))
    if (desc) box.appendChild(mk('span', 'yn-settings-desc', desc))
    return box
  }

  function row(left, right) {
    var r = mk('div', 'yn-settings-row')
    r.appendChild(left)
    if (right) r.appendChild(right)
    return r
  }

  function hint(text) { return mk('p', 'yn-settings-hint', text) }

  function badge(text) { return mk('span', 'yn-settings-badge', text) }

  function aboutItem(strongText, restText) {
    var li = document.createElement('li')
    var b = document.createElement('b')
    b.textContent = strongText
    li.appendChild(b)
    if (restText) li.appendChild(document.createTextNode(restText))
    return li
  }

  /* ══════════════════════════════════════════════════════════════════════════
     与主题运行时 / 服务端通信
     ══════════════════════════════════════════════════════════════════════════ */
  /** 立即应用外观；__ynApplyLook 不存在时退回旧的两个单字段钩子。 */
  function callLook(partial) {
    if (!partial || !Object.keys(partial).length) return false
    if (typeof window.__ynApplyLook === 'function') {
      try { window.__ynApplyLook(partial); return true } catch (e) {}
    }
    try {
      if (typeof partial.wallBrightness === 'number' && typeof window.__ynSetWallBrightness === 'function') {
        window.__ynSetWallBrightness(partial.wallBrightness)
      }
      if (typeof partial.ambience === 'number' && typeof window.__ynSetAmbience === 'function') {
        window.__ynSetAmbience(partial.ambience)
      }
    } catch (e2) {}
    return false
  }

  function reloadWall() {
    try {
      if (typeof window.__ynReloadWall === 'function') window.__ynReloadWall()
    } catch (e) {}
  }

  function loadConfig() {
    var seq = ++loadSeq
    var req
    try {
      req = fetch(BASE + '/size.json', { cache: 'no-store' })
    } catch (e) {
      return Promise.resolve(failLoad(seq))
    }
    return req.then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status)
      return r.json()
    }).then(function (d) {
      if (seq !== loadSeq) return conf
      if (!isObj(d)) throw new Error('bad payload')
      conf = normalize(d)
      loaded = true
      loadFailed = false
      if (built) {
        renderPresets()
        syncAll()
        paintStatus()
      }
      return conf
    }).catch(function () {
      if (seq !== loadSeq) return conf
      return failLoad(seq)
    })
  }

  function failLoad(seq) {
    if (seq !== undefined && seq !== loadSeq) return conf
    loadFailed = true
    if (!loaded) conf = normalize(null)
    if (built) {
      renderPresets()
      syncAll()
      paintStatus()
    }
    return conf
  }

  function postPatch(patch) {
    if (!patch || !Object.keys(patch).length) return
    inflight++
    setStatus('saving', '保存中…')
    try {
      fetch(BASE + '/size.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status)
        return r.json().catch(function () { return { ok: true } })
      }).then(function (d) {
        if (d && d.ok === false) throw new Error('rejected')
        settleSave(true)
      }).catch(function () {
        settleSave(false)
      })
    } catch (e) {
      settleSave(false)
    }
  }

  function settleSave(ok) {
    if (inflight > 0) inflight--
    if (inflight > 0) return
    if (ok) flashStatus('ok', '已保存', FLASH_MS)
    else flashStatus('failed', '保存失败，改动可能不会写入配置', 3600)
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(flushSave, SAVE_DEBOUNCE_MS)
  }

  function flushSave() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0 }
    var keys = Object.keys(pending)
    if (!keys.length) return
    var patch = pending
    pending = Object.create(null)
    postPatch(patch)
  }

  function clearPendingSaves() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0 }
    pending = Object.create(null)
  }

  /* ══════════════════════════════════════════════════════════════════════════
     底部状态行
     ══════════════════════════════════════════════════════════════════════════ */
  function setStatus(mode, text) {
    status.mode = mode || 'idle'
    status.text = text || ''
    if (statusTimer) { clearTimeout(statusTimer); statusTimer = 0 }
    paintStatus()
  }

  function flashStatus(mode, text, ms) {
    setStatus(mode, text)
    statusTimer = setTimeout(function () {
      statusTimer = 0
      if (status.mode === mode && status.text === text) setStatus('idle', '')
    }, ms || FLASH_MS)
  }

  function paintStatus() {
    if (!el.status) return
    var text = ''
    var kind = ''
    if (status.mode === 'loading' || status.mode === 'saving') {
      text = status.text || (status.mode === 'loading' ? '读取配置…' : '保存中…')
    } else if (status.mode === 'failed') {
      text = status.text || '保存失败，改动可能不会写入配置'
      kind = 'warn'
    } else if (status.mode === 'ok') {
      text = status.text || '已保存'
      kind = 'ok'
    } else if (loadFailed) {
      text = '配置读取失败，改动可能不会保存'
      kind = 'warn'
    } else {
      text = '设置即时生效 · 自动保存'
    }
    el.status.textContent = text
    el.status.className = 'yn-settings-status' + (kind ? ' yn-settings-status--' + kind : '')
  }

  /* ══════════════════════════════════════════════════════════════════════════
     构建面板
     ══════════════════════════════════════════════════════════════════════════ */
  var SKELETON = [
    '<div class="yn-settings-scrim" data-action="close" aria-hidden="true"></div>',
    '<section class="yn-settings-card" role="dialog" aria-modal="true" aria-labelledby="yn-settings-title" tabindex="-1">',
    '  <header class="yn-settings-head">',
    '    <div class="yn-settings-heading">',
    '      <h2 class="yn-settings-title" id="yn-settings-title"><span class="yn-settings-moon" aria-hidden="true"></span>尤诺主题 · 设置</h2>',
    '      <p class="yn-settings-sub">月光与玻璃的细部调整 · 改动即时生效</p>',
    '    </div>',
    '    <button type="button" class="yn-settings-close" data-action="close" aria-label="关闭设置" title="关闭（ESC）">×</button>',
    '  </header>',
    '  <div class="yn-settings-main">',
    '    <nav class="yn-settings-rail" role="tablist" aria-label="设置分类">',
    '      <button type="button" class="yn-settings-tab" role="tab" data-action="tab" data-tab="intro" id="yn-settings-tab-intro" aria-controls="yn-settings-page-intro" aria-selected="true" tabindex="0">启动动画</button>',
    '      <button type="button" class="yn-settings-tab" role="tab" data-action="tab" data-tab="bg" id="yn-settings-tab-bg" aria-controls="yn-settings-page-bg" aria-selected="false" tabindex="-1">背景</button>',
    '      <button type="button" class="yn-settings-tab" role="tab" data-action="tab" data-tab="display" id="yn-settings-tab-display" aria-controls="yn-settings-page-display" aria-selected="false" tabindex="-1">显示</button>',
    '      <button type="button" class="yn-settings-tab" role="tab" data-action="tab" data-tab="about" id="yn-settings-tab-about" aria-controls="yn-settings-page-about" aria-selected="false" tabindex="-1">关于</button>',
    '    </nav>',
    '    <div class="yn-settings-pages">',
    '      <section class="yn-settings-page" role="tabpanel" data-page="intro" id="yn-settings-page-intro" aria-labelledby="yn-settings-tab-intro"></section>',
    '      <section class="yn-settings-page" role="tabpanel" data-page="bg" id="yn-settings-page-bg" aria-labelledby="yn-settings-tab-bg" hidden></section>',
    '      <section class="yn-settings-page" role="tabpanel" data-page="display" id="yn-settings-page-display" aria-labelledby="yn-settings-tab-display" hidden></section>',
    '      <section class="yn-settings-page" role="tabpanel" data-page="about" id="yn-settings-page-about" aria-labelledby="yn-settings-tab-about" hidden></section>',
    '    </div>',
    '  </div>',
    '  <footer class="yn-settings-foot">',
    '    <span class="yn-settings-status" role="status" aria-live="polite">设置即时生效 · 自动保存</span>',
    '    <span class="yn-settings-foot-tip">Alt+Y 打开 / ESC 关闭</span>',
    '  </footer>',
    '</section>',
  ].join('\n')

  function buildSwitch(action, label) {
    var b = button('yn-settings-switch', null, action)
    b.setAttribute('role', 'switch')
    b.setAttribute('aria-checked', 'false')
    b.setAttribute('aria-label', label)
    b.appendChild(mk('i'))
    return b
  }

  function buildSeg(field) {
    var options = {
      introMode: [
        { value: 'every', label: '每次启动' },
        { value: 'once', label: '仅首次' },
      ],
    }[field] || []
    var box = mk('div', 'yn-settings-seg')
    box.setAttribute('data-seg', field)
    for (var i = 0; i < options.length; i++) {
      var b = button('yn-settings-seg-btn', options[i].label, 'seg')
      b.setAttribute('data-seg', field)
      b.setAttribute('data-value', options[i].value)
      b.setAttribute('aria-pressed', 'false')
      // 动态影片选项要能被 syncBg() 找到并置灰（素材未就绪时）
      if (field === 'bgMode' && options[i].value === 'video') b.setAttribute('data-role', 'bg-video')
      box.appendChild(b)
    }
    return box
  }

  function buildField(key) {
    var meta = FIELDS[key]
    var wrap = mk('div', 'yn-settings-field')
    var head = mk('div', 'yn-settings-field-head')
    head.appendChild(mk('span', 'yn-settings-field-label', meta.label))
    var val = mk('span', 'yn-settings-field-val')
    val.setAttribute('data-val', key)
    head.appendChild(val)
    var input = document.createElement('input')
    input.type = 'range'
    input.className = 'yn-settings-range'
    input.min = String(meta.min)
    input.max = String(meta.max)
    input.step = String(meta.step)
    input.setAttribute('data-field', key)
    input.setAttribute('aria-label', meta.label)
    wrap.appendChild(head)
    wrap.appendChild(input)
    return wrap
  }

  function buildIntroPage() {
    var page = el.pageIntro

    var g1 = group('入场')
    var sw = buildSwitch('toggle-intro', '启用入场动画')
    el.introSwitch = sw
    g1.appendChild(row(textBox('启动时播放', '应用每次启动先播一段片头；默认关闭。'), sw))
    g1.appendChild(row(textBox('播放时机', '仅首次：只在第一次启动应用时播放。'), buildSeg('introMode')))
    g1.appendChild(hint('默认关闭 · 开启后下次启动生效 · 刷新页面（F5）不重播'))
    page.appendChild(g1)

    var ge = group('开场 · 粒子')
    var msw = buildSwitch('toggle-moon', '开场粒子动画')
    el.moonSwitch = msw
    ge.appendChild(row(textBox('欢迎字 → 粒子 → 影片', '欢迎字在粒子聚好后出现；PV 上下粒子聚成月亮，抽卡四角粒子拟合首帧，随后淡入影片。'), msw))
    ge.appendChild(hint('三种影片共用；关掉后直接播正片。'))
    page.appendChild(ge)

    var gl = group('抽卡壁纸')
    var lsw = buildSwitch('toggle-loop-wallpaper', '抽卡片尾循环壁纸')
    el.loopSwitch = lsw
    gl.appendChild(row(textBox('循环最后动作', '抽卡长/短版播完后，用你给的尾部循环视频作为背景壁纸；约 1.7MB / 1600×1000 / 30fps。'), lsw))
    gl.appendChild(hint('PV 不使用循环壁纸；关闭后回到静态默认壁纸。'))
    page.appendChild(gl)

    var gv = group('声音')
    gv.appendChild(buildField('introVolume'))
    gv.appendChild(hint('片头视频自带声音；0% 静音。电子壳拦自动播放时会先静音起播，点一下画面再恢复。'))
    page.appendChild(gv)

    var g2 = group('影片')
    var chips = mk('div', 'yn-settings-chips')
    el.presetBox = chips
    g2.appendChild(chips)
    el.presetHint = hint('')
    g2.appendChild(el.presetHint)
    var actions = mk('div', 'yn-settings-actions')
    var replay = button('yn-settings-btn yn-settings-btn--solid', '重播入场动画', 'replay')
    actions.appendChild(replay)
    el.replayBtn = replay
    g2.appendChild(actions)
    g2.appendChild(hint('重播不受开关限制；片头播完后与壁纸无缝交接，点击任意处或按 ESC 可跳过。'))
    page.appendChild(g2)
  }

  function buildBgPage() {
    var page = el.pageBg

    var g0 = group('背景模式')
    g0.appendChild(row(
      textBox('静态壁纸', '背景固定为静态立绘：不播放动态 loop、不做微动效（按用户要求）。'),
      badge('静态')
    ))
    page.appendChild(g0)

    var g2 = group('画面')
    g2.appendChild(buildField('wallBrightness'))
    g2.appendChild(buildField('wallDim'))
    g2.appendChild(buildField('wallBlur'))
    g2.appendChild(hint('压暗与模糊只作用于背景层，不影响界面文字。'))
    page.appendChild(g2)

    var g3 = group('壁纸')
    var actions = mk('div', 'yn-settings-actions')
    actions.appendChild(button('yn-settings-btn', '更换背景…', 'choose-wall'))
    actions.appendChild(button('yn-settings-btn', '全屏预览背景', 'preview-bg'))
    actions.appendChild(button('yn-settings-btn yn-settings-btn--ghost', '恢复默认背景', 'reset-wall'))
    g3.appendChild(actions)
    el.wallHint = hint('当前：默认立绘 · 建议 16:9 图片，上限 20MB')
    g3.appendChild(el.wallHint)
    var file = document.createElement('input')
    file.type = 'file'
    file.className = 'yn-settings-file'
    file.accept = 'image/*'
    file.setAttribute('data-role', 'wall-file')
    g3.appendChild(file)
    el.wallFile = file
    page.appendChild(g3)
  }

  function buildDisplayPage() {
    var page = el.pageDisplay

    var g1 = group('纸面与轻纱')
    g1.appendChild(buildField('veilLight'))
    g1.appendChild(buildField('veilDark'))
    g1.appendChild(hint('「浅色纸面」= 浅色内容区的月白纸面强度：越高文字越稳、壁纸越淡；越低壁纸越清晰（文字会发虚）。「深色轻纱」= 深色模式的暗纱。'))
    page.appendChild(g1)

    var g2 = group('界面')
    g2.appendChild(buildField('uiAlpha'))
    g2.appendChild(hint('100% 为默认；调高界面更实，调低更通透（最低 60%）。'))
    page.appendChild(g2)

    var g3 = group('氛围')
    g3.appendChild(buildField('ambience'))
    g3.appendChild(hint('星尘与鼠标流光的浓度；0% 即完全关闭氛围层。'))
    page.appendChild(g3)
  }

  function buildAboutPage() {
    var page = el.pageAbout

    var g1 = group('关于')
    g1.appendChild(row(mk('span', 'yn-settings-label', '尤诺桌面主题'), badge(VERSION)))
    var ul = mk('ul', 'yn-settings-about-list')
    ul.appendChild(aboutItem('侧栏入口', '：左侧导航「尤诺主题」一行，点开即本设置页。'))
    ul.appendChild(aboutItem('Alt+Y', ' 或右键桌宠 →「主题设置…」，打开 / 关闭浮层设置。'))
    ul.appendChild(aboutItem('开场', '：PV 粒子聚月 / 抽卡四角粒子拟合首帧，欢迎字随后出现，再淡入影片。'))
    ul.appendChild(aboutItem('收尾', '：影片自然播完后画面淡出、默认壁纸淡入，再回到界面。'))
    ul.appendChild(aboutItem('声音', '：片头保留原视频音轨，音量可在「启动动画」tab 调；0% 静音。'))
    ul.appendChild(aboutItem('即时生效', '：背景与显示类设置自动保存，无需重启。'))
    ul.appendChild(aboutItem('下次启动', '：启动动画开关只影响应用启动时的自动播放，F5 刷新不重播。'))
    ul.appendChild(aboutItem('配置', '保存在当前 profile 的 .dshy-size.json；背景可单独恢复默认。'))
    g1.appendChild(ul)
    page.appendChild(g1)

    var g2 = group('重置')
    var actions = mk('div', 'yn-settings-actions')
    actions.appendChild(button('yn-settings-btn yn-settings-btn--ghost', '恢复全部默认', 'restore'))
    g2.appendChild(actions)
    g2.appendChild(hint('恢复启动动画、背景与显示的默认值；不会删除你更换的自定义壁纸。'))
    page.appendChild(g2)
  }

  function ensureBuilt() {
    if (built || !document.body) return
    built = true

    var root = document.createElement('div')
    root.id = 'yn-settings'
    root.className = 'yn-settings'
    root.setAttribute('hidden', '')
    root.innerHTML = SKELETON
    document.body.appendChild(root)

    el.root = root
    el.scrim = root.querySelector('.yn-settings-scrim')
    el.card = root.querySelector('.yn-settings-card')
    el.pagesWrap = root.querySelector('.yn-settings-pages')
    el.rail = root.querySelector('.yn-settings-rail')
    el.status = root.querySelector('.yn-settings-status')
    el.tabs = root.querySelectorAll('.yn-settings-tab')
    el.pageIntro = root.querySelector('[data-page="intro"]')
    el.pageBg = root.querySelector('[data-page="bg"]')
    el.pageDisplay = root.querySelector('[data-page="display"]')
    el.pageAbout = root.querySelector('[data-page="about"]')

    buildIntroPage()
    buildBgPage()
    buildDisplayPage()
    buildAboutPage()

    el.rangeEls = {}
    el.valEls = {}
    var ranges = root.querySelectorAll('.yn-settings-range')
    for (var i = 0; i < ranges.length; i++) {
      el.rangeEls[ranges[i].getAttribute('data-field')] = ranges[i]
    }
    var vals = root.querySelectorAll('.yn-settings-field-val')
    for (var j = 0; j < vals.length; j++) {
      el.valEls[vals[j].getAttribute('data-val')] = vals[j]
    }

    root.addEventListener('click', onPanelClick)
    root.addEventListener('input', onPanelInput)
    root.addEventListener('change', onPanelChange)
    root.addEventListener('keydown', onPanelKeydown)
    root.addEventListener('mousedown', stopBubble)
    root.addEventListener('pointerdown', stopBubble)

    renderPresets()
    syncAll()
    paintStatus()
  }

  function stopBubble(e) { e.stopPropagation() }

  /* ══════════════════════════════════════════════════════════════════════════
     同步 UI ← conf
     ══════════════════════════════════════════════════════════════════════════ */
  function syncAll() {
    if (!built) return
    syncIntro()
    syncBg()
    syncDisplay()
  }

  function pressSeg(field, value) {
    if (!el.root) return
    var btns = el.root.querySelectorAll('[data-seg="' + field + '"] .yn-settings-seg-btn')
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed', btns[i].getAttribute('data-value') === value ? 'true' : 'false')
    }
  }

  function syncIntro() {
    if (!el.introSwitch) return
    el.introSwitch.setAttribute('aria-checked', conf.introEnabled ? 'true' : 'false')
    pressSeg('introMode', conf.introMode)
    if (el.moonSwitch) {
      el.moonSwitch.setAttribute('aria-checked', conf.moonIntroEnabled ? 'true' : 'false')
    }
    if (el.loopSwitch) {
      el.loopSwitch.setAttribute('aria-checked', conf.loopWallpaperEnabled ? 'true' : 'false')
    }
    paintField('introVolume')
    if (!el.presetBox) return
    var chips = el.presetBox.querySelectorAll('.yn-settings-chip')
    for (var i = 0; i < chips.length; i++) {
      var on = chips[i].getAttribute('data-value') === conf.introVideo
      chips[i].setAttribute('aria-pressed', on ? 'true' : 'false')
    }
  }

  function syncBg() {
    if (!el.root) return
    paintField('wallBrightness')
    paintField('wallDim')
    paintField('wallBlur')
    if (el.wallHint) {
      el.wallHint.textContent = conf.wallCustom
        ? '当前：自定义背景（固定静态）· 建议 16:9 图片，上限 20MB'
        : '当前：默认立绘（固定静态）· 建议 16:9 图片，上限 20MB'
    }
  }

  function syncDisplay() {
    if (!built) return
    paintField('veilLight')
    paintField('veilDark')
    paintField('uiAlpha')
    paintField('ambience')
  }

  function formatField(key, value) {
    var meta = FIELDS[key]
    return String(Math.round(value * meta.scale)) + meta.suffix
  }

  function paintField(key) {
    var meta = FIELDS[key]
    if (!meta) return
    var input = el.rangeEls && el.rangeEls[key]
    if (input) {
      var value = num(conf[key], meta.min, meta.max, conf[key])
      input.value = String(value)
      var ratio = (value - meta.min) / (meta.max - meta.min)
      ratio = Math.max(0, Math.min(1, ratio))
      input.style.setProperty('--ys-fill', (ratio * 100).toFixed(1) + '%')
    }
    var val = el.valEls && el.valEls[key]
    if (val) val.textContent = formatField(key, conf[key])
  }

  function renderPresets() {
    var box = el.presetBox
    if (!box) return
    while (box.firstChild) box.removeChild(box.firstChild)
    var list = conf.introPresets || []
    var missing = []
    for (var i = 0; i < list.length; i++) {
      var p = list[i]
      var b = button('yn-settings-chip', p.label, 'video')
      b.setAttribute('data-value', p.id)
      b.setAttribute('aria-pressed', 'false')
      if (!p.available) {
        b.disabled = true
        b.title = '素材处理中'
        missing.push('「' + p.label + '」')
      }
      box.appendChild(b)
    }
    if (el.presetHint) {
      if (missing.length) {
        el.presetHint.removeAttribute('hidden')
        el.presetHint.textContent = missing.join('') + '素材处理中，暂时置灰。'
      } else {
        el.presetHint.setAttribute('hidden', '')
        el.presetHint.textContent = ''
      }
    }
    syncIntro()
  }

  /* ══════════════════════════════════════════════════════════════════════════
     交互：点击 / 滑块 / 文件
     ══════════════════════════════════════════════════════════════════════════ */
  function findActionNode(target) {
    var node = target
    while (node && node !== el.root) {
      if (node.getAttribute && node.getAttribute('data-action')) return node
      node = node.parentNode
    }
    return null
  }

  function onPanelClick(e) {
    e.stopPropagation()
    var node = findActionNode(e.target)
    if (!node) return
    var action = node.getAttribute('data-action')
    if (action === 'close') { closeSettings(); return }
    if (action === 'tab') { setTab(node.getAttribute('data-tab')); return }
    if (action === 'toggle-intro') { toggleIntro(); return }
    if (action === 'toggle-moon') { toggleMoon(); return }
    if (action === 'toggle-loop-wallpaper') { toggleLoopWallpaper(); return }
    if (action === 'seg') { chooseSeg(node); return }
    if (action === 'video') { chooseVideo(node.getAttribute('data-value')); return }
    if (action === 'replay') { replayIntro(); return }
    if (action === 'choose-wall') { chooseWall(); return }
    if (action === 'preview-bg') { openBgPreview(); return }
    if (action === 'reset-wall') { resetWall(); return }
    if (action === 'restore') { restoreDefaults(); return }
  }

  function onPanelInput(e) {
    e.stopPropagation()
    var target = e.target
    if (!target || !target.getAttribute) return
    var key = target.getAttribute('data-field')
    var meta = FIELDS[key]
    if (!meta) return
    var value = roundTo(num(target.value, meta.min, meta.max, conf[key]), meta.step)
    if (conf[key] === value) {
      paintField(key)
      return
    }
    conf[key] = value
    paintField(key)
    var partial = {}
    partial[key] = value
    callLook(partial)
    pending[key] = value
    scheduleSave()
  }

  function onPanelChange(e) {
    e.stopPropagation()
    var target = e.target
    if (!target || !target.getAttribute) return
    if (target.getAttribute('data-role') !== 'wall-file') return
    var file = target.files && target.files[0]
    target.value = ''
    if (file) uploadWall(file)
  }

  function onPanelKeydown(e) {
    e.stopPropagation()
    var target = e.target
    if (!target || !target.getAttribute) return
    if (target.getAttribute('data-action') !== 'tab') return
    var key = e.key
    if (key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'ArrowLeft' && key !== 'ArrowRight') return
    var idx = TAB_IDS.indexOf(tab)
    var dir = (key === 'ArrowDown' || key === 'ArrowRight') ? 1 : -1
    e.preventDefault()
    setTab(TAB_IDS[(idx + dir + TAB_IDS.length) % TAB_IDS.length])
    focusTab()
  }

  function toggleIntro() {
    conf.introEnabled = !conf.introEnabled
    syncIntro()
    postPatch({ introEnabled: conf.introEnabled })
  }

  function toggleMoon() {
    conf.moonIntroEnabled = !conf.moonIntroEnabled
    syncIntro()
    postPatch({ moonIntroEnabled: conf.moonIntroEnabled })
  }

  function toggleLoopWallpaper() {
    conf.loopWallpaperEnabled = !conf.loopWallpaperEnabled
    syncIntro()
    postPatch({ loopWallpaperEnabled: conf.loopWallpaperEnabled })
    if (window.__ynRefreshBgLoop) { try { window.__ynRefreshBgLoop() } catch (e) {} }
  }

  function chooseSeg(btn) {
    if (!btn || btn.disabled) return
    var field = btn.getAttribute('data-seg')
    var value = btn.getAttribute('data-value')
    if (field === 'introMode') {
      if (conf.introMode === value) return
      conf.introMode = value
      syncIntro()
      postPatch({ introMode: value })
    }
  }

  function chooseVideo(id) {
    if (!id) return
    var found = null
    for (var i = 0; i < conf.introPresets.length; i++) {
      if (conf.introPresets[i].id === id) { found = conf.introPresets[i]; break }
    }
    if (!found || !found.available) return
    if (conf.introVideo === id) return
    conf.introVideo = id
    syncIntro()
    postPatch({ introVideo: id })
  }

  function replayIntro() {
    closeSettings()
    setTimeout(function () {
      if (typeof window.__ynPlayIntro === 'function') {
        try { window.__ynPlayIntro(true) } catch (e) {}
      }
    }, CLOSE_ANIM_MS + 40)
  }

  /** 背景预览的媒体层：优先循环壁纸，否则静态壁纸。 */
  function createBgMedia() {
    var media = mk('div', 'yn-bg-preview-media')
    var loop = document.querySelector('.yn-skin-bgloop.is-on')
    if (loop && loop.src) {
      var v = document.createElement('video')
      v.src = loop.src
      v.muted = true
      v.loop = true
      v.autoplay = true
      v.playsInline = true
      v.className = 'yn-bg-preview-video'
      media.appendChild(v)
    } else {
      media.style.backgroundImage = 'url("/dsh-iuno/wall.jpg")'
    }
    return media
  }

  /** 全屏背景预览：盖住所有 UI，只显示当前壁纸/循环壁纸，点击返回。 */
  function openBgPreview() {
    if (document.getElementById('yn-bg-preview')) return
    var layer = document.createElement('div')
    layer.id = 'yn-bg-preview'
    layer.setAttribute('role', 'dialog')
    layer.setAttribute('aria-label', '背景预览')
    var tip = mk('div', 'yn-bg-preview-tip', '背景预览 · 点击任意处返回')
    layer.appendChild(createBgMedia())
    layer.appendChild(tip)
    document.body.appendChild(layer)
    function close() {
      document.removeEventListener('keydown', onKey, true)
      layer.removeEventListener('click', close)
      if (layer.parentNode) layer.parentNode.removeChild(layer)
    }
    function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Esc') close()
    }
    layer.addEventListener('click', close)
    document.addEventListener('keydown', onKey, true)
  }

  /** 拖动参数条时：隐藏设置面板与界面，只保留背景和当前参数条；松开恢复。 */
  var sliderPreview = null
  function startSliderPreview(input) {
    if (sliderPreview) return
    // 背景页：只留壁纸 + 参数条；显示页：只隐藏设置面板，保留界面以看纸面/轻纱效果。
    var kind = tab === 'bg' ? 'bg' : (tab === 'display' ? 'ui' : '')
    if (!kind) return
    var field = input.closest ? input.closest('.yn-settings-field') : null
    if (!field) return
    var rect = field.getBoundingClientRect()
    if (rect.width < 40) return
    var layer = document.createElement('div')
    layer.id = 'yn-slider-preview'
    layer.setAttribute('data-kind', kind)
    if (kind === 'bg') layer.appendChild(createBgMedia())
    var clone = field.cloneNode(true)
    clone.classList.add('yn-slider-preview-field')
    clone.style.left = rect.left + 'px'
    clone.style.top = rect.top + 'px'
    clone.style.width = rect.width + 'px'
    var cloneInput = clone.querySelector('input[type="range"]')
    if (!cloneInput) return
    cloneInput.tabIndex = -1
    cloneInput.style.pointerEvents = 'none'
    var cloneVal = clone.querySelector('.yn-settings-field-val')
    var origVal = field.querySelector('.yn-settings-field-val')
    function sync() {
      cloneInput.value = input.value
      if (cloneVal && origVal) cloneVal.textContent = origVal.textContent
    }
    function onInput() {
      sync()
      // 原面板的 input 处理在同一事件里后执行；下一帧再同步一次数值/滑块位置
      if (window.requestAnimationFrame) requestAnimationFrame(sync)
    }
    sync()
    layer.appendChild(clone)
    document.body.appendChild(layer)
    document.documentElement.setAttribute('data-yn-slider-preview', kind)
    sliderPreview = layer
    function end() {
      if (!sliderPreview) return
      input.removeEventListener('input', onInput)
      window.removeEventListener('pointerup', end, true)
      window.removeEventListener('pointercancel', end, true)
      window.removeEventListener('blur', end)
      document.documentElement.removeAttribute('data-yn-slider-preview')
      if (layer.parentNode) layer.parentNode.removeChild(layer)
      sliderPreview = null
    }
    input.addEventListener('input', onInput)
    window.addEventListener('pointerup', end, true)
    window.addEventListener('pointercancel', end, true)
    window.addEventListener('blur', end)
  }

  function chooseWall() {
    if (!el.wallFile) return
    try { el.wallFile.click() } catch (e) {}
  }

  function uploadWall(file) {
    if (!file) return
    if (file.size > WALL_MAX_BYTES) {
      flashStatus('failed', '图片超过 20MB，未上传', 3200)
      return
    }
    setStatus('saving', '上传背景中…')
    try {
      fetch(BASE + '/wall.jpg', {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'image/jpeg' },
        body: file,
      }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status)
        return r.json().catch(function () { return { ok: true } })
      }).then(function (d) {
        if (d && d.ok === false) throw new Error('rejected')
        conf.wallCustom = true
        syncBg()
        reloadWall()
        flashStatus('ok', '已更换背景', FLASH_MS)
      }).catch(function () {
        flashStatus('failed', '背景更换失败，请换一张图片试试', 3600)
      })
    } catch (e) {
      flashStatus('failed', '背景更换失败，请换一张图片试试', 3600)
    }
  }

  function resetWall() {
    setStatus('saving', '正在恢复默认背景…')
    try {
      fetch(BASE + '/wall.jpg?reset=1', { method: 'POST' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status)
        return r.json().catch(function () { return { ok: true } })
      }).then(function (d) {
        if (d && d.ok === false) throw new Error('rejected')
        conf.wallCustom = false
        syncBg()
        reloadWall()
        flashStatus('ok', '已恢复默认背景', FLASH_MS)
      }).catch(function () {
        flashStatus('failed', '恢复默认背景失败', 3200)
      })
    } catch (e) {
      flashStatus('failed', '恢复默认背景失败', 3200)
    }
  }

  function applyAllLook() {
    callLook({
      veilLight: conf.veilLight,
      veilDark: conf.veilDark,
      uiAlpha: conf.uiAlpha,
      wallDim: conf.wallDim,
      wallBlur: conf.wallBlur,
      wallBrightness: conf.wallBrightness,
      ambience: conf.ambience,
    })
  }

  function restoreDefaults() {
    clearPendingSaves()
    var patch = {
      introEnabled: false,
      introMode: 'every',
      introVideo: 'pv',
      introVolume: 0,
      moonIntroEnabled: true,
      loopWallpaperEnabled: true,
      bgMode: 'image',
      wallBrightness: 0.86,
      wallDim: 0,
      wallBlur: 0,
      veilLight: 0.18,
      veilDark: 0.28,
      uiAlpha: 1,
      ambience: 1,
    }
    setStatus('saving', '正在恢复默认…')
    try {
      fetch(BASE + '/size.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status)
        return r.json().catch(function () { return { ok: true } })
      }).then(function (d) {
        if (d && d.ok === false) throw new Error('rejected')
        return loadConfig()
      }).then(function () {
        applyAllLook()
        flashStatus('ok', '已恢复全部默认', FLASH_MS)
      }).catch(function () {
        flashStatus('failed', '恢复默认失败，请稍后再试', 3600)
      })
    } catch (e) {
      flashStatus('failed', '恢复默认失败，请稍后再试', 3600)
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     打开 / 关闭 / tab
     ══════════════════════════════════════════════════════════════════════════ */
  function setTab(id) {
    if (TAB_IDS.indexOf(id) === -1 || !el.root) return
    tab = id
    for (var i = 0; i < el.tabs.length; i++) {
      var t = el.tabs[i]
      var on = t.getAttribute('data-tab') === id
      t.setAttribute('aria-selected', on ? 'true' : 'false')
      t.setAttribute('tabindex', on ? '0' : '-1')
    }
    var pages = el.root.querySelectorAll('.yn-settings-page')
    for (var j = 0; j < pages.length; j++) {
      var p = pages[j]
      if (p.getAttribute('data-page') === id) p.removeAttribute('hidden')
      else p.setAttribute('hidden', '')
    }
    if (el.pagesWrap) el.pagesWrap.scrollTop = 0
  }

  function focusTab() {
    if (!el.root) return
    var b = el.root.querySelector('.yn-settings-tab[data-tab="' + tab + '"]')
    if (!b) return
    try { b.focus({ preventScroll: true }) } catch (e) { try { b.focus() } catch (e2) {} }
  }

  function focusables() {
    if (!el.card) return []
    var list = el.card.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    )
    var out = []
    for (var i = 0; i < list.length; i++) {
      var n = list[i]
      if (n === el.card) continue
      if (n.offsetParent === null) continue
      out.push(n)
    }
    return out
  }

  function trapTab(e) {
    var list = focusables()
    if (!list.length) return
    var first = list[0]
    var last = list[list.length - 1]
    var active = document.activeElement
    if (!el.card.contains(active)) {
      e.preventDefault()
      try { first.focus() } catch (err) {}
      return
    }
    if (!e.shiftKey && active === last) {
      e.preventDefault()
      try { first.focus() } catch (err) {}
    } else if (e.shiftKey && (active === first || active === el.card)) {
      e.preventDefault()
      try { last.focus() } catch (err) {}
    }
  }

  function openSettings(tabId) {
    if (pageHost) return            // 设置页已挂在主区，忽略浮层打开
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', function () { openSettings(tabId) }, { once: true })
      return
    }
    ensureBuilt()
    if (!el.root) return
    if (isOpen) {
      if (typeof tabId === 'string' && TAB_IDS.indexOf(tabId) !== -1) setTab(tabId)
      return
    }
    isOpen = true
    lastFocus = document.activeElement
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = 0 }
    el.root.removeAttribute('hidden')
    el.root.removeAttribute('data-closing')
    void el.root.offsetWidth // 强制 reflow：入场动画每次都从第一帧开始
    el.root.setAttribute('data-open', '1')
    setTab(typeof tabId === 'string' && TAB_IDS.indexOf(tabId) !== -1 ? tabId : tab)
    try { document.documentElement.setAttribute('data-yn-settings', '') } catch (e) {}
    setStatus('loading', '读取配置…')
    try { el.card.focus({ preventScroll: true }) } catch (e2) { try { el.card.focus() } catch (e3) {} }
    loadConfig().then(function () {
      if (isOpen && status.mode === 'loading') setStatus('idle', '')
    })
  }

  function closeSettings() {
    if (pageHost) return            // 页面模式由侧栏入口自己卸载
    if (!isOpen || !el.root) return
    flushSave()
    isOpen = false
    try { document.documentElement.removeAttribute('data-yn-settings') } catch (e) {}
    el.root.removeAttribute('data-open')
    el.root.setAttribute('data-closing', '1')
    if (closeTimer) clearTimeout(closeTimer)
    closeTimer = setTimeout(function () {
      closeTimer = 0
      if (isOpen || !el.root) return
      el.root.setAttribute('hidden', '')
      el.root.removeAttribute('data-closing')
    }, CLOSE_ANIM_MS)
    if (lastFocus && typeof lastFocus.focus === 'function') {
      try { lastFocus.focus({ preventScroll: true }) } catch (e2) { try { lastFocus.focus() } catch (e3) {} }
    }
    lastFocus = null
  }

  function toggleSettings(tabId) {
    if (isOpen) closeSettings()
    else openSettings(tabId)
  }

  /* ══════════════════════════════════════════════════════════════════════════
     全局快捷键
     ══════════════════════════════════════════════════════════════════════════ */
  function isTypingTarget(node) {
    if (!node) return false
    if (node.nodeType === 3) node = node.parentNode
    if (!node || node.nodeType !== 1) return false
    var tag = (node.tagName || '').toLowerCase()
    if (tag === 'textarea' || tag === 'select') return true
    if (node.isContentEditable) return true
    if (tag === 'input') {
      var type = (node.type || 'text').toLowerCase()
      return [
        'text', 'search', 'email', 'url', 'tel', 'password',
        'number', 'date', 'datetime-local', 'month', 'time', 'week',
      ].indexOf(type) !== -1
    }
    return false
  }

  function onDocKeydown(e) {
    if (e.defaultPrevented) return
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.repeat) {
      var isY = e.key === 'y' || e.key === 'Y' || e.code === 'KeyY'
      if (isY && !isTypingTarget(e.target)) {
        if (pageHost) return
        e.preventDefault()
        e.stopPropagation()
        toggleSettings()
        return
      }
    }
    if (pageHost) return
    if (!isOpen) return
    if (e.key === 'Escape' || e.key === 'Esc' || e.code === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      closeSettings()
      return
    }
    if (e.key === 'Tab') trapTab(e)
  }

  document.addEventListener('keydown', onDocKeydown, true)

  /* ══════════════════════════════════════════════════════════════════════════
     对外钩子（桌宠面板 / 其它脚本调用）
     ══════════════════════════════════════════════════════════════════════════ */
  /* ══════════════════════════════════════════════════════════════════════════
     页面模式：侧栏「尤诺主题」入口把同一套面板挂到主区容器里
     ══════════════════════════════════════════════════════════════════════════ */
  function mountSettingsPage(host, tabId) {
    if (!host || !document.body) return function () {}
    if (isOpen) closeSettingsNow()
    ensureBuilt()
    if (!el.root) return function () {}
    pageHost = host
    try { document.documentElement.setAttribute('data-yn-settings', '') } catch (e) {}
    el.root.classList.add('yn-settings--page')
    el.root.removeAttribute('hidden')
    el.root.removeAttribute('data-closing')
    el.root.removeAttribute('data-open')
    if (el.root.parentNode !== host) host.appendChild(el.root)
    setTab(typeof tabId === 'string' && TAB_IDS.indexOf(tabId) !== -1 ? tabId : tab)
    loadConfig().then(function () {
      if (pageHost === host && status.mode === 'loading') setStatus('idle', '')
    })
    return function cleanup() {
      if (pageHost !== host) return
      pageHost = null
      flushSave()
      try { document.documentElement.removeAttribute('data-yn-settings') } catch (e) {}
      el.root.classList.remove('yn-settings--page')
      el.root.removeAttribute('data-open')
      el.root.setAttribute('hidden', '')
      if (document.body && el.root.parentNode !== document.body) document.body.appendChild(el.root)
    }
  }
  window.__ynMountSettingsPage = mountSettingsPage

  /* 页面模式接管时，若浮层正开着就立即收起（不走 150ms 关闭动画，避免根节点来回搬家） */
  function closeSettingsNow() {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = 0 }
    isOpen = false
    try { document.documentElement.removeAttribute('data-yn-settings') } catch (e) {}
    if (el.root) {
      el.root.removeAttribute('data-open')
      el.root.removeAttribute('data-closing')
      el.root.setAttribute('hidden', '')
    }
    lastFocus = null
  }

  /* 拖动任意设置滑杆：进入「只剩参数条 + 背景」预览，松开恢复设置台。 */
  document.addEventListener('pointerdown', function (e) {
    var t = e.target
    if (!t || !t.matches || !t.matches('input[type="range"][data-field]')) return
    if (!isOpen && !pageHost) return
    startSliderPreview(t)
  }, true)

  window.__ynOpenSettings = function (tabId) {
    openSettings(typeof tabId === 'string' ? tabId : undefined)
  }
  window.__ynCloseSettings = closeSettings
  window.__ynToggleSettings = function (tabId) {
    toggleSettings(typeof tabId === 'string' ? tabId : undefined)
  }
  window.__ynSettingsVersion = VERSION
  // 调试用：返回当前面板状态快照（不影响逻辑）
  window.__ynSettingsState = function () {
    return {
      open: isOpen,
      tab: tab,
      loaded: loaded,
      loadFailed: loadFailed,
      conf: JSON.parse(JSON.stringify(conf)),
    }
  }
})()
