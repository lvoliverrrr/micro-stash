/* =========================================================================
   store.js · 数据层
   优先走 SQLite 后端 REST API；若后端不在（例如直接双击 index.html），
   自动降级为「浏览器本地存储」离线模式，保证界面始终可用。
   ========================================================================= */
'use strict';

const API_BASE = 'api/';

async function api(path, opts) {
  const res = await fetch(API_BASE + path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts));
  const txt = await res.text();
  let json;
  try { json = txt ? JSON.parse(txt) : {}; } catch (e) { throw new Error('返回内容无法解析'); }
  if (!res.ok || json.ok === false) throw new Error(json.error || '请求失败 ' + res.status);
  return json;
}

/* ============================ 离线本地引擎 ============================ */

const Offline = {
  KEY: 'pv.offline.v1',
  state: null,

  blank() {
    const ts = new Date().toISOString();
    const cats = [
      ['电容', 'cap', '#5ec8f7'], ['电阻', 'resistor', '#f7a45e'], ['电感磁珠', 'coil', '#c08cf7'],
      ['二极管', 'diode', '#f76e8a'], ['三极管/MOS', 'transistor', '#ffcf5e'], ['集成电路', 'chip', '#6ea8fe'],
      ['晶振/时钟', 'clock', '#7ee0c0'], ['连接器/排针', 'plug', '#9aa4b2'], ['开关/按键', 'switch', '#f78fd0'],
      ['电源/电池', 'power', '#8fd76e'], ['传感器', 'sensor', '#63d3c8'], ['结构件/其他', 'misc', '#a8b3c2'],
    ].map((c, i) => ({ id: i + 1, name: c[0], icon: c[1], color: c[2], sort: i }));

    const parts = [
      ['电解电容', '电容', '1000μF 16V', '直插 D8×12', 10], ['电解电容', '电容', '470μF 25V', '直插 D8×12', 10],
      ['电解电容', '电容', '220μF 50V', '直插 D8×12', 10], ['瓷片电容', '电容', '104 (100nF)', '直插', 50],
      ['金属膜电阻', '电阻', '1/4W 1kΩ', '直插', 50], ['金属膜电阻', '电阻', '1/4W 10kΩ', '直插', 50],
      ['整流二极管', '二极管', '1N4007', 'DO-41', 50], ['开关二极管', '二极管', '1N4148', 'DO-35', 50],
      ['发光二极管', '二极管', '5mm 红', '直插', 30], ['三极管', '三极管/MOS', 'S8050 (NPN)', 'TO-92', 30],
      ['三端稳压', '集成电路', 'L7805 5V', 'TO-220', 10], ['单片机', '集成电路', 'STM32F103C8T6', 'LQFP-48', 3],
      ['晶振', '晶振/时钟', '8MHz', 'HC-49S', 10], ['排针', '连接器/排针', '1×40P 2.54mm', '直插', 10],
      ['轻触开关', '开关/按键', '6×6×5 直插', '直插', 30], ['保险丝', '电源/电池', '玻璃管 5×20 2A', '直插', 10],
    ].map((p, i) => ({
      id: i + 1, code: 'PV-' + String(i + 1).padStart(4, '0'), name: p[0],
      category_id: (cats.find((c) => c.name === p[1]) || {}).id || null,
      category_name: p[1], category_icon: (cats.find((c) => c.name === p[1]) || {}).icon || 'box',
      spec: p[2], package: p[3], unit: '个',
      color: (cats.find((c) => c.name === p[1]) || {}).color || '#6ea8fe',
      min_stock: p[4], note: '', created_at: ts, updated_at: ts, stock: 0, cell_count: 0,
    }));

    const layout = [
      { name: '列 A', colors: ['white', 'white', 'black', 'black', 'black'] },
      { name: '列 B', colors: ['white', 'white', 'black', 'black', 'black'] },
      { name: '列 C', colors: ['white', 'white', 'white', 'black'] },
      { name: '列 D', colors: ['white', 'white', 'white', 'white'] },
    ];
    const stacks = [], drawers = [], cells = [];
    let did = 0, cid = 0;
    layout.forEach((st, si) => {
      stacks.push({ id: si + 1, name: st.name, position: si, color: 'shell', note: '' });
      st.colors.forEach((color, di) => {
        did++;
        drawers.push({ id: did, stack_id: si + 1, slot: di + 1, label: '', color, rows: 4, cols: 3, note: '' });
        for (let r = 1; r <= 4; r++) for (let c = 1; c <= 3; c++) cells.push({ id: ++cid, drawer_id: did, r, c, label: '', part_id: null, qty: 0, note: '' });
      });
    });

    return { categories: cats, parts, stacks, drawers, cells, moves: [], meta: { cabinet_name: '我的元件柜', operator: '', initialized: false } };
  },

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) { this.state = JSON.parse(raw); }
    } catch (e) { this.state = null; }
    if (!this.state) { this.state = this.blank(); this.save(); }
    return this.state;
  },
  save() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.state)); } catch (e) { /* 容量不足时忽略 */ }
  },

  _part(id) { return this.state.parts.find((p) => p.id === id) || null; },
  _label(p) { return p ? (p.spec ? p.name + ' ' + p.spec : p.name) : ''; },

  addMove(m) {
    const id = (this.state.moves[0] ? this.state.moves[0].id : 0) + 1;
    this.state.moves.unshift(Object.assign({ id, ts: new Date().toISOString(), qty: 0, before_qty: 0, after_qty: 0, note: '' }, m));
    if (this.state.moves.length > 3000) this.state.moves.length = 3000;
  },

  cellOp(body) {
    const cell = this.state.cells.find((c) => c.id === Number(body.cell_id));
    if (!cell) throw new Error('格子不存在');
    const op = String(body.op || '').toUpperCase();
    const qty = Number(body.qty) || 0;
    const before = cell.qty;
    let after = before, partId = cell.part_id, kind = op;

    if (op === 'IN') { if (!partId) throw new Error('请先指定元件种类'); after = before + qty; }
    else if (op === 'OUT') { if (!partId) throw new Error('空格子无法取出'); after = Math.max(0, before - qty); }
    else if (op === 'SET') { if (!partId) throw new Error('请先指定元件种类'); after = Math.max(0, qty); }
    else if (op === 'ASSIGN') { partId = Number(body.part_id); after = Math.max(0, qty); }
    else if (op === 'CLEAR') { partId = null; after = 0; }
    else if (op === 'MOVE') {
      const t = this.state.cells.find((c) => c.id === Number(body.target_cell_id));
      if (!t) throw new Error('目标格子不存在');
      t.part_id = partId; t.qty = Number(t.qty) + before;
      this.addMove({ kind: 'MOVE', part_id: partId, part_name: this._label(this._part(partId)), cell_id: t.id, from_cell: cell.id, qty: before, before_qty: t.qty - before, after_qty: t.qty });
      cell.part_id = null; cell.qty = 0;
      this.save();
      return { ok: true };
    } else throw new Error('未知操作');

    const delta = after - before;
    cell.part_id = partId;
    cell.qty = after;
    if (body.note) cell.note = body.note;
    this.addMove({ kind, part_id: partId, part_name: this._label(this._part(partId)), cell_id: cell.id, drawer_id: cell.drawer_id, qty: delta, before_qty: before, after_qty: after, note: body.note || '' });
    this.save();
    return { ok: true };
  },

  recompute() {
    this.state.parts.forEach((p) => {
      const mine = this.state.cells.filter((c) => c.part_id === p.id && c.qty > 0);
      p.stock = mine.reduce((a, c) => a + c.qty, 0);
      p.cell_count = mine.length;
      const cat = this.state.categories.find((c) => c.id === p.category_id);
      p.category_name = cat ? cat.name : '';
      p.category_icon = cat ? cat.icon : 'box';
      if (cat && !p.color) p.color = cat.color;
    });
    return this.state;
  },
};

/* ============================ Store ============================ */

const Store = {
  online: false,
  state: null,
  dbPath: '—',
  lastSync: null,

  idx: { cells: {}, parts: {}, drawers: {}, stacks: {}, categories: {}, cellsByDrawer: {}, drawersByStack: {}, cellsByPart: {} },

  async init() {
    try {
      const j = await api('bootstrap');
      this.state = j;
      this.online = true;
      this.dbPath = (j.server && j.server.db) || '(服务端 SQLite)';
      this.message = '';
    } catch (e) {
      this.online = false;
      Offline.load();
      this.state = Offline.recompute();
      this.dbPath = '浏览器本地存储 · 离线模式';
      this.message = e.message;
    }
    this.state.meta = this.state.meta || {};
    this.lastSync = new Date();
    this.reindex();
    return this.state;
  },

  reindex() {
    const s = this.state;
    const it = this.idx;
    it.cells = {}; it.parts = {}; it.drawers = {}; it.stacks = {}; it.categories = {};
    it.cellsByDrawer = {}; it.drawersByStack = {}; it.cellsByPart = {};

    s.categories.forEach((c) => (it.categories[c.id] = c));
    s.parts.forEach((p) => (it.parts[p.id] = p));
    s.stacks.sort((a, b) => a.position - b.position);
    s.stacks.forEach((st) => (it.stacks[st.id] = st));
    s.drawers.forEach((d) => {
      it.drawers[d.id] = d;
      (it.drawersByStack[d.stack_id] = it.drawersByStack[d.stack_id] || []).push(d);
    });
    Object.keys(it.drawersByStack).forEach((k) => it.drawersByStack[k].sort((a, b) => a.slot - b.slot));
    s.cells.forEach((c) => {
      it.cells[c.id] = c;
      (it.cellsByDrawer[c.drawer_id] = it.cellsByDrawer[c.drawer_id] || []).push(c);
      if (c.part_id) (it.cellsByPart[c.part_id] = it.cellsByPart[c.part_id] || []).push(c);
    });
    Object.keys(it.cellsByDrawer).forEach((k) => it.cellsByDrawer[k].sort((a, b) => a.r - b.r || a.c - b.c));
  },

  /* ---------- 读取辅助 ---------- */

  cellsOf(drawerId) { return this.idx.cellsByDrawer[drawerId] || []; },
  drawersOf(stackId) { return this.idx.drawersByStack[stackId] || []; },
  part(id) { return this.idx.parts[id] || null; },
  drawer(id) { return this.idx.drawers[id] || null; },
  stack(id) { return this.idx.stacks[id] || null; },
  cell(id) { return this.idx.cells[id] || null; },

  drawerSummary(drawerId) {
    const cells = this.cellsOf(drawerId);
    let used = 0, pieces = 0, lowCount = 0;
    const kinds = [];
    cells.forEach((c) => {
      if (c.qty > 0 && c.part_id) {
        used++; pieces += c.qty;
        const p = this.part(c.part_id);
        kinds.push(p ? (p.spec ? p.name + ' ' + p.spec : p.name) : '未知');
        if (p && p.min_stock > 0 && p.stock <= p.min_stock) lowCount++;
      }
    });
    return { total: cells.length, used, pieces, kinds, lowCount, top: kinds.slice(0, 2).join(' · ') };
  },

  partLocations(partId) {
    return (this.idx.cellsByPart[partId] || [])
      .filter((c) => c.qty > 0)
      .map((c) => {
        const d = this.drawer(c.drawer_id) || {};
        const st = this.stack(d.stack_id) || {};
        return {
          cellId: c.id, qty: c.qty, r: c.r, c: c.c,
          drawerId: c.drawer_id, stackId: d.stack_id,
          label: (st.name || '列') + ' · 第 ' + (d.slot || '?') + ' 层' + (d.label ? '（' + d.label + '）' : ''),
          short: (st.name || '').replace('列 ', '') + '-' + (d.slot || '?'),
        };
      });
  },

  cellWhere(cellId) {
    const c = this.cell(cellId);
    if (!c) return '—';
    const d = this.drawer(c.drawer_id) || {};
    const st = this.stack(d.stack_id) || {};
    return (st.name || '列') + ' · 第 ' + (d.slot || '?') + ' 层 · R' + c.r + 'C' + c.c;
  },

  findCellsByPart(partId) { return this.idx.cellsByPart[partId] || []; },

  /* ---------- 写入 ---------- */

  async op(cellId, payload) {
    const body = Object.assign({ cell_id: cellId }, payload);
    if (this.online) {
      await api('cells/op', { method: 'POST', body: JSON.stringify(body) });
      // 局部同步，避免整表重拉
      const r = await api('bootstrap');
      this.state = r;
      this.reindex();
    } else {
      Offline.cellOp(body);
      Offline.recompute();
      this.state = Offline.state;
      this.reindex();
    }
    this.lastSync = new Date();
  },

  async batch(ops) {
    if (!ops.length) return;
    if (this.online) {
      await api('cells/batch', { method: 'POST', body: JSON.stringify({ ops }) });
      this.state = await api('bootstrap');
    } else {
      ops.forEach((o) => Offline.cellOp(o));
      Offline.recompute();
      this.state = Offline.state;
    }
    this.reindex();
  },

  async savePart(data, id) {
    if (this.online) {
      if (id) await api('parts/' + id, { method: 'PUT', body: JSON.stringify(data) });
      else await api('parts', { method: 'POST', body: JSON.stringify(data) });
      this.state = await api('bootstrap');
      this.reindex();
      return;
    }
    const st = Offline.state;
    if (id) {
      const p = st.parts.find((x) => x.id === id);
      Object.assign(p, data, { category_id: Number(data.category_id) || null, min_stock: Number(data.min_stock) || 0 });
    } else {
      const nid = st.parts.reduce((a, p) => Math.max(a, p.id), 0) + 1;
      st.parts.push(Object.assign({ id: nid, code: 'PV-' + String(nid).padStart(4, '0'), unit: '个', color: '#6ea8fe', note: '' }, data, { category_id: Number(data.category_id) || null }));
    }
    Offline.recompute(); Offline.save(); this.state = st; this.reindex();
  },

  async removePart(id) {
    if (this.online) {
      await api('parts/' + id, { method: 'DELETE' });
      this.state = await api('bootstrap');
      this.reindex();
      return;
    }
    const st = Offline.state;
    st.parts = st.parts.filter((p) => p.id !== id);
    st.cells.forEach((c) => { if (c.part_id === id) { c.part_id = null; c.qty = 0; } });
    Offline.recompute(); Offline.save(); this.state = st; this.reindex();
  },

  async saveCategory(data, id) {
    if (this.online) {
      if (id) await api('categories/' + id, { method: 'PUT', body: JSON.stringify(data) });
      else await api('categories', { method: 'POST', body: JSON.stringify(data) });
      this.state = await api('bootstrap');
      this.reindex();
      return;
    }
    const st = Offline.state;
    if (id) Object.assign(st.categories.find((c) => c.id === id), data);
    else st.categories.push(Object.assign({ id: st.categories.reduce((a, c) => Math.max(a, c.id), 0) + 1, sort: 99 }, data));
    Offline.recompute(); Offline.save(); this.state = st; this.reindex();
  },

  async removeCategory(id) {
    if (this.online) {
      await api('categories/' + id, { method: 'DELETE' });
      this.state = await api('bootstrap');
      this.reindex();
      return;
    }
    const st = Offline.state;
    st.categories = st.categories.filter((c) => c.id !== id);
    st.parts.forEach((p) => { if (p.category_id === id) p.category_id = null; });
    Offline.recompute(); Offline.save(); this.state = st; this.reindex();
  },

  async saveLayout(stacks, note) {
    if (this.online) {
      await api('layout', { method: 'PUT', body: JSON.stringify({ stacks, note: note || '调整货架布局' }) });
      this.state = await api('bootstrap');
    } else {
      // 离线模式：整体重建骨架，保留已存内容（按 列序/层序/格子坐标 对齐）
      const st = Offline.state;
      const oldCells = {};
      st.drawers.forEach((d) => {
        st.cells.filter((c) => c.drawer_id === d.id).forEach((c) => {
          oldCells[d.stack_id + '/' + d.slot + '/' + c.r + '/' + c.c] = { part_id: c.part_id, qty: c.qty, label: c.label, note: c.note };
        });
      });
      const stacks2 = [], drawers2 = [], cells2 = [];
      let did = 0, cid = 0;
      stacks.forEach((s, si) => {
        stacks2.push({ id: si + 1, name: s.name, position: si, color: 'shell', note: '' });
        (s.drawers || []).forEach((dr, di) => {
          did++;
          drawers2.push({ id: did, stack_id: si + 1, slot: di + 1, label: dr.label || '', color: dr.color || 'white', rows: dr.rows || 4, cols: dr.cols || 3, note: '' });
          for (let r = 1; r <= (dr.rows || 4); r++) {
            for (let c = 1; c <= (dr.cols || 3); c++) {
              const old = oldCells[(si + 1) + '/' + (di + 1) + '/' + r + '/' + c] || {};
              cells2.push({ id: ++cid, drawer_id: did, r, c, label: old.label || '', part_id: old.part_id || null, qty: old.qty || 0, note: old.note || '' });
            }
          }
        });
      });
      st.stacks = stacks2; st.drawers = drawers2; st.cells = cells2;
      Offline.recompute(); Offline.save(); this.state = st;
    }
    this.reindex();
  },

  async setMeta(patch) {
    if (this.online) {
      await api('meta', { method: 'POST', body: JSON.stringify(patch) });
    }
    Object.assign(this.state.meta, patch);
    if (!this.online) { Offline.state.meta = this.state.meta; Offline.save(); }
  },

  async reset(kind) {
    if (this.online) {
      this.state = await api(kind === 'factory' ? 'factory-reset' : 'reset', { method: 'POST', body: '{}' });
    } else {
      const fresh = Offline.blank();
      if (kind === 'factory') { Offline.state = fresh; }
      else { Offline.state.cells.forEach((c) => { c.part_id = null; c.qty = 0; }); Offline.state.moves = []; }
      Offline.recompute(); Offline.save();
      this.state = Offline.recompute();
    }
    this.reindex();
  },

  async exportJSON() {
    if (this.online) {
      const res = await fetch(API_BASE + 'export');
      return await res.text();
    }
    Offline.recompute();
    return JSON.stringify(Object.assign({ app: 'PartVault', exported_at: new Date().toISOString() }, Offline.state), null, 2);
  },

  async importJSON(text, mode) {
    const data = JSON.parse(text);
    if (this.online) {
      await api('import', { method: 'POST', body: JSON.stringify({ data, mode }) });
      this.state = await api('bootstrap');
    } else {
      const st = Offline.blank();
      const mapC = {}, mapP = {}, mapS = {}, mapD = {};
      (data.categories || []).forEach((c, i) => { mapC[c.id] = i + 1; st.categories[i] = Object.assign({}, c, { id: i + 1 }); });
      st.categories.length = (data.categories || []).length;
      st.parts = (data.parts || []).map((p, i) => { mapP[p.id] = i + 1; return Object.assign({}, p, { id: i + 1, category_id: mapC[p.category_id] || null }); });
      st.stacks = (data.stacks || []).map((s, i) => { mapS[s.id] = i + 1; return Object.assign({}, s, { id: i + 1, position: i }); });
      st.drawers = (data.drawers || []).map((d, i) => { mapD[d.id] = i + 1; return Object.assign({}, d, { id: i + 1, stack_id: mapS[d.stack_id] || 1 }); });
      st.cells = (data.cells || []).map((c, i) => Object.assign({}, c, { id: i + 1, drawer_id: mapD[c.drawer_id] || 1, part_id: mapP[c.part_id] || null }));
      st.moves = (data.moves || []).slice(0, 3000);
      Offline.state = st;
      Offline.recompute(); Offline.save();
      this.state = Offline.recompute();
    }
    this.reindex();
  },
};

PV.Store = Store;
PV.Offline = Offline;
PV.API_BASE = API_BASE;
