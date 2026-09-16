/* =========================================================================
   util.js · 基础工具：DOM、图标、时间、提示、音效、模态、背景动画
   （普通脚本，挂在全局 window.PV 上）
   ========================================================================= */
'use strict';

window.PV = window.PV || {};

/* ------------------------------ DOM ------------------------------ */

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = {
  svg: 1, use: 1, path: 1, circle: 1, rect: 1, g: 1, line: 1, polyline: 1,
  polygon: 1, ellipse: 1, text: 1, defs: 1, lineargradient: 1, stop: 1, symbol: 1, tspan: 1,
};

/**
 * 极简 DOM 构造器
 *   h('div.card', {onclick}, [h('b', 'hi')])
 *   自动识别 SVG 标签并使用正确的命名空间（否则 <svg> 不会渲染）
 */
function h(spec, props, children) {
  const parts = String(spec).split(/(?=[.#])/);
  const tag = parts[0] || 'div';
  const isSvg = !!SVG_TAGS[tag.toLowerCase()];
  const node = isSvg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  const classes = [];
  for (let i = 1; i < parts.length; i++) {
    if (parts[i][0] === '.') classes.push(parts[i].slice(1));
    else if (parts[i][0] === '#') node.id = parts[i].slice(1);
  }
  const setClass = (c) => {
    classes.push(c);
  };

  if (props) {
    if (typeof props === 'string' || typeof props === 'number') {
      node.textContent = String(props);
      props = null;
    } else if (Array.isArray(props)) {
      children = props;
      props = null;
    }
  }
  if (props) {
    Object.keys(props).forEach((k) => {
      const v = props[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class' || k === 'className') setClass(v);
      else if (k === 'style') {
        if (typeof v === 'string') node.style.cssText += ';' + v;
        else Object.assign(node.style, v);
      } else if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (!isSvg && (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected')) {
        if (k === 'value' && node.tagName === 'SELECT') { /* ignore */ }
        if (k === 'checked' || k === 'disabled' || k === 'selected') node[k] = !!v;
        else node.value = v;
      } else if (v === true) node.setAttribute(k, '');
      else node.setAttribute(k, v);
    });
  }
  if (classes.length) {
    if (isSvg) node.setAttribute('class', classes.join(' '));
    else node.className = classes.join(' ');
  }
  appendChildren(node, children);
  return node;
}

function appendChildren(node, children) {
  if (children === null || children === undefined || children === false) return;
  if (Array.isArray(children)) {
    children.forEach((c) => appendChildren(node, c));
    return;
  }
  if (children instanceof Node) node.appendChild(children);
  else node.appendChild(document.createTextNode(String(children)));
}

/** 用 SVG 精灵画图标 */
function icon(name, size, extraClass) {
  const s = size || 17;
  return h('svg', { width: s, height: s, class: extraClass || '', viewBox: '0 0 24 24' }, h('use', { href: '#' + name }));
}

const esc = (s) =>
  String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const debounce = (fn, ms) => {
  let t;
  return function () {
    const a = arguments;
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, a), ms || 220);
  };
};

const clampNum = (v, a, b) => Math.max(a, Math.min(b, Number(v) || 0));

/* ------------------------------ 时间 ------------------------------ */

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function fmtTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}
function fmtDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function fmtDateTime(iso) { return fmtDate(iso) + ' ' + fmtTime(iso); }

function dayLabel(iso) {
  const d = new Date(iso);
  const now = new Date();
  const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const y = new Date(now.getTime() - 86400000);
  if (same(d, now)) return '今天 · ' + fmtDate(iso);
  if (same(d, y)) return '昨天 · ' + fmtDate(iso);
  return fmtDate(iso);
}

function timeAgo(iso) {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return '刚刚';
  if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
  if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
  return Math.floor(s / 86400) + ' 天前';
}

const fmtNum = (n) => Number(n || 0).toLocaleString('zh-CN');

/* ------------------------------ Toast ------------------------------ */

const TOAST_ICON = { in: 'i-in', out: 'i-out', err: 'i-alert', info: 'i-info', ok: 'i-check' };
const TOAST_CLASS = { in: 'in', out: 'out-i', err: 'err', info: 'info', ok: 'in' };

function toast(kind, title, sub, ms) {
  const wrap = $('#toasts');
  if (!wrap) return;
  const node = h('div.toast.' + (TOAST_CLASS[kind] || 'info'), {}, [
    h('div.ti', {}, icon(TOAST_ICON[kind] || 'i-info', 15)),
    h('div.tt', {}, [h('b', {}, title), sub ? h('span', {}, sub) : null]),
  ]);
  wrap.appendChild(node);
  setTimeout(() => {
    node.classList.add('out');
    setTimeout(() => node.remove(), 320);
  }, ms || 2600);
  return node;
}

/** 数量浮动提示（+3 / -1） */
function floatNumber(anchorEl, n) {
  if (!anchorEl || !n) return;
  const r = anchorEl.getBoundingClientRect();
  const node = h('div.floatnum.' + (n > 0 ? 'pos' : 'neg'), {}, (n > 0 ? '+' : '') + n);
  node.style.left = r.left + r.width / 2 + 'px';
  node.style.top = r.top + r.height / 4 + 'px';
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 1050);
}

/* ------------------------------ 音效（WebAudio 合成，无需素材） ------------------------------ */

const Sound = {
  enabled: true,
  ctx: null,
  _ctx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  _beep(freq, dur, type, gain, delay) {
    if (!this.enabled) return;
    const ctx = this._ctx();
    if (!ctx) return;
    const t0 = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain === undefined ? 0.05 : gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (dur || 0.12));
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + (dur || 0.12) + 0.02);
  },
  click() { this._beep(880, 0.06, 'triangle', 0.035); },
  place() { this._beep(520, 0.09, 'sine', 0.05); this._beep(780, 0.12, 'sine', 0.04, 0.06); },
  take() { this._beep(660, 0.08, 'sine', 0.05); this._beep(440, 0.12, 'sine', 0.04, 0.05); },
  open() { this._beep(300, 0.16, 'sine', 0.035); this._beep(450, 0.14, 'sine', 0.03, 0.05); },
  error() { this._beep(200, 0.2, 'sawtooth', 0.04); },
  success() { [523, 659, 784].forEach((f, i) => this._beep(f, 0.14, 'sine', 0.045, i * 0.07)); },
};

/* ------------------------------ 模态 ------------------------------ */

const Modal = {
  stack: [],
  open(opts) {
    const mask = $('#modal-mask');
    const modal = $('#modal');
    $('#modal-title').textContent = opts.title || '';
    const sub = $('#modal-sub');
    sub.textContent = opts.sub || '';
    sub.style.display = opts.sub ? '' : 'none';
    modal.classList.toggle('wide', !!opts.wide);

    const body = $('#modal-body');
    body.innerHTML = '';
    appendChildren(body, opts.body);

    const foot = $('#modal-foot');
    foot.innerHTML = '';
    foot.style.display = opts.foot ? '' : 'none';
    appendChildren(foot, opts.foot);

    mask.classList.add('on');
    this.current = opts;
    if (opts.onOpen) setTimeout(() => opts.onOpen(body, modal), 60);
    return modal;
  },
  close() {
    $('#modal-mask').classList.remove('on');
    const o = this.current;
    this.current = null;
    if (o && o.onClose) o.onClose();
  },
  isOpen() { return $('#modal-mask').classList.contains('on'); },
};

/** 通用确认框 */
function confirmDialog(opts) {
  return new Promise((resolve) => {
    Modal.open({
      title: opts.title || '确认操作',
      sub: opts.sub || '',
      body: [h('p.hint', { style: 'font-size:13px;line-height:1.7' }, opts.message || '')].concat(
        opts.extra ? opts.extra : []
      ),
      foot: [
        h('button.btn.ghost', { onclick: () => { Modal.close(); resolve(false); } }, '取消'),
        h('button.btn.' + (opts.danger ? 'danger' : 'primary'), {
          onclick: () => { Modal.close(); resolve(true); },
        }, opts.okText || '确定'),
      ],
      onClose: () => resolve(false),
    });
  });
}

/** 简单的表单弹窗：fields = [{key,label,type,value,options,placeholder,hint,required,full}] */
function formDialog(opts) {
  return new Promise((resolve) => {
    const state = {};
    let firstInput = null;
    const rows = (opts.fields || []).map((f) => {
      state[f.key] = f.value === undefined || f.value === null ? '' : f.value;
      let input;
      if (f.type === 'select') {
        input = h(
          'select',
          { onchange: (e) => (state[f.key] = e.target.value) },
          (f.options || []).map((o) =>
            h('option', { value: o.value, selected: String(o.value) === String(state[f.key]) }, o.label)
          )
        );
      } else if (f.type === 'textarea') {
        input = h('textarea', { placeholder: f.placeholder || '', oninput: (e) => (state[f.key] = e.target.value) }, state[f.key]);
      } else if (f.type === 'number') {
        input = h('input', { type: 'number', min: f.min, max: f.max, step: f.step || 1, value: state[f.key], placeholder: f.placeholder || '', oninput: (e) => (state[f.key] = e.target.value) });
      } else if (f.type === 'color') {
        input = h('input', { type: 'color', value: state[f.key] || '#6ea8fe', style: 'height:36px;padding:3px', oninput: (e) => (state[f.key] = e.target.value) });
      } else if (f.type === 'static') {
        input = h('div.hint', {}, f.value);
      } else {
        input = h('input', { type: f.type || 'text', value: state[f.key], placeholder: f.placeholder || '', autocomplete: 'off', oninput: (e) => (state[f.key] = e.target.value) });
      }
      if (!firstInput && input.tagName === 'INPUT') firstInput = input;
      const el = h('div.field' + (f.full ? '.full' : ''), {}, [h('label', {}, f.label), input]);
      if (f.hint) el.appendChild(h('div.hint', {}, f.hint));
      return el;
    });

    Modal.open({
      title: opts.title,
      sub: opts.sub,
      wide: opts.wide,
      body: [h('div.form-grid', {}, rows)],
      foot: [
        h('button.btn.ghost', { onclick: () => { Modal.close(); resolve(null); } }, '取消'),
        h('button.btn.primary', {
          onclick: () => {
            if (opts.validate) {
              const err = opts.validate(state);
              if (err) { toast('err', '请检查输入', err); return; }
            }
            Modal.close();
            resolve(state);
          },
        }, opts.okText || '保存'),
      ],
      onOpen: () => { if (firstInput) firstInput.focus(); },
      onClose: () => resolve(null),
    });
  });
}

/* ------------------------------ 侧边详情面板 ------------------------------ */

const Sheet = {
  open(opts) {
    $('#sheet-title').textContent = opts.title || '';
    $('#sheet-sub').textContent = opts.sub || '';
    const body = $('#sheet-body');
    body.innerHTML = '';
    appendChildren(body, opts.body);
    const foot = $('#sheet-foot');
    foot.innerHTML = '';
    appendChildren(foot, opts.foot);
    $('#sheet-mask').classList.add('on');
    $('#sheet').classList.add('on');
    this.current = opts;
  },
  close() {
    $('#sheet-mask').classList.remove('on');
    $('#sheet').classList.remove('on');
    if (this.current && this.current.onClose) this.current.onClose();
    this.current = null;
  },
  isOpen() { return $('#sheet').classList.contains('on'); },
};

/* ------------------------------ 背景动画 ------------------------------ */

const Background = {
  init() {
    const cv = $('#bg-canvas');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    let w = 0, h = 0, dpr = 1;
    let dots = [];
    let t = 0;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = Math.floor(w * dpr);
      cv.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(66, Math.floor((w * h) / 26000));
      dots = new Array(count).fill(0).map(() => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.16,
        vy: (Math.random() - 0.5) * 0.16,
        r: Math.random() * 1.8 + 0.7,
        a: Math.random() * 0.5 + 0.18,
      }));
    };
    resize();
    window.addEventListener('resize', debounce(resize, 180));

    const isLight = () => document.documentElement.getAttribute('data-theme') === 'light';

    const frame = () => {
      t += 0.0035;
      const light = isLight();
      ctx.clearRect(0, 0, w, h);

      // 点阵网格
      const gap = 34;
      const off = (t * 22) % gap;
      ctx.save();
      ctx.strokeStyle = light ? 'rgba(40,70,130,0.055)' : 'rgba(140,175,235,0.055)';
      ctx.lineWidth = 1;
      for (let x = -gap + off; x < w + gap; x += gap) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = -gap + off; y < h + gap; y += gap) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      ctx.restore();

      // 漂浮粒子
      ctx.save();
      dots.forEach((d) => {
        d.x += d.vx;
        d.y += d.vy;
        if (d.x < -10) d.x = w + 10; if (d.x > w + 10) d.x = -10;
        if (d.y < -10) d.y = h + 10; if (d.y > h + 10) d.y = -10;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = light ? 'rgba(60,100,190,' + d.a * 0.55 + ')' : 'rgba(150,200,255,' + d.a + ')';
        ctx.fill();
      });
      ctx.restore();

      if (!reduce) requestAnimationFrame(frame);
    };
    if (reduce) frame();
    else requestAnimationFrame(frame);
  },
};

/* ------------------------------ 主题 & 音效开关 ------------------------------ */

const Prefs = {
  theme: 'dark',
  sound: true,
  load() {
    try {
      const raw = localStorage.getItem('pv.prefs');
      if (raw) {
        const p = JSON.parse(raw);
        this.theme = p.theme === 'light' ? 'light' : 'dark';
        this.sound = p.sound !== false;
      }
    } catch (e) { /* ignore */ }
    this.apply();
  },
  save() {
    try { localStorage.setItem('pv.prefs', JSON.stringify({ theme: this.theme, sound: this.sound })); } catch (e) { /* ignore */ }
  },
  apply() {
    document.documentElement.setAttribute('data-theme', this.theme);
    Sound.enabled = this.sound;
    const tb = $('#btn-theme');
    const sb = $('#btn-sound');
    if (tb) tb.innerHTML = '', tb.appendChild(icon(this.theme === 'dark' ? 'i-moon' : 'i-sun'));
    if (sb) {
      sb.innerHTML = '';
      sb.appendChild(icon(this.sound ? 'i-sound' : 'i-mute'));
      sb.classList.toggle('on', this.sound);
    }
  },
  toggleTheme() {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    this.apply(); this.save();
    Sound.click();
  },
  toggleSound() {
    this.sound = !this.sound;
    this.apply(); this.save();
    if (this.sound) Sound.success();
  },
};

/* ------------------------------ 导出 ------------------------------ */

PV.util = { $, $$, h, icon, esc, debounce, clampNum, fmtTime, fmtDate, fmtDateTime, dayLabel, timeAgo, fmtNum, toast, floatNumber, confirmDialog, formDialog };
PV.Sound = Sound;
PV.Modal = Modal;
PV.Sheet = Sheet;
PV.Background = Background;
PV.Prefs = Prefs;
