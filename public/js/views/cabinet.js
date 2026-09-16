/* =========================================================================
   views/cabinet.js · 货架总览（CSS 3D 还原实物柜子）
   ========================================================================= */
'use strict';

const CabinetView = {
  filter: '',
  colorMode: 'physical', // physical | fill | category
  onlyLow: false,
  tiltX: 7,
  tiltY: -9,
  _bound: false,

  render() {
    const el = PV.util.$('#view-cabinet');
    this.el = el;
    if (!PV.Store.state) return;
    const { h } = PV.util;
    const S = PV.Store;

    el.innerHTML = '';

    /* ---------- 工具条 ---------- */
    const toolbar = h('div.cabinet-toolbar', {}, [
      h('div.seg', {}, [
        h('button' + (this.colorMode === 'physical' ? '.on' : ''), { onclick: () => this.setMode('physical') }, '实物配色'),
        h('button' + (this.colorMode === 'fill' ? '.on' : ''), { onclick: () => this.setMode('fill') }, '占用热力'),
        h('button' + (this.colorMode === 'category' ? '.on' : ''), { onclick: () => this.setMode('category') }, '分类着色'),
      ]),
      h('button.btn.sm' + (this.onlyLow ? '.warn' : ''), { onclick: () => { this.onlyLow = !this.onlyLow; this.render(); } }, [
        PV.util.icon('i-alert', 14), '只看低库存',
      ]),
      h('div.grow'),
      h('div.legend', {}, [
        h('span', {}, [h('i', { style: 'background:linear-gradient(135deg,#5b8cff,#37e0c8)' }), '已占用']),
        h('span', {}, [h('i', { style: 'background:rgba(140,165,205,.22)' }), '空抽屉']),
        h('span', {}, [h('i', { style: 'background:#ff6b81' }), '含低库存元件']),
      ]),
      h('button.btn.sm.ghost', { onclick: () => this.resetTilt(), title: '重置视角' }, [PV.util.icon('i-refresh', 14)]),
    ]);
    el.appendChild(toolbar);

    /* ---------- 场景 ---------- */
    const cabinet = h('div.cabinet', { id: 'cabinet' });
    cabinet.style.setProperty('--tilt-x', this.tiltX + 'deg');
    cabinet.style.setProperty('--tilt-y', this.tiltY + 'deg');

    cabinet.appendChild(h('div.shelf.back'));

    const body = h('div.cabinet-body');
    const stacks = S.state.stacks.slice().sort((a, b) => a.position - b.position);
    stacks.forEach((st) => body.appendChild(this.renderStack(st)));
    cabinet.appendChild(body);

    cabinet.appendChild(h('div.shelf'));

    const wrap = h('div.cabinet-wrap', {}, cabinet);
    el.appendChild(wrap);

    if (!this._bound) {
      this._bound = true;
      this.bindDrag(wrap);
    }
    this.wrap = wrap;
  },

  renderStack(st) {
    const { h } = PV.util;
    const S = PV.Store;
    const node = h('div.stack');
    const drawers = S.drawersOf(st.id);
    drawers.forEach((d) => node.appendChild(this.renderDrawer(d)));
    node.appendChild(h('div.stack-label', {}, st.name + ' · ' + drawers.length + ' 层'));
    return node;
  },

  renderDrawer(d) {
    const { h } = PV.util;
    const S = PV.Store;
    const sum = S.drawerSummary(d.id);
    const fill = sum.total ? sum.used / sum.total : 0;
    const isEmpty = sum.used === 0;

    const low = sum.lowCount > 0;

    const node = h('div.drawer3d.' + (d.color || 'white'), {
      title: (S.stack(d.stack_id) || {}).name + ' · 第 ' + d.slot + ' 层\n' +
        (isEmpty ? '（空）' : sum.pieces + ' 个元件 · ' + sum.used + '/' + sum.total + ' 格\n' + sum.kinds.join('、')),
    });
    node.dataset.drawer = d.id;

    node.appendChild(h('div.face'));
    node.appendChild(h('div.handle'));

    /* 抽屉正面的三块信息：层号 / 数量 / 内容摘要（类名 d- 前缀，避免与抽屉盘的 .slot 冲突） */
    const meta = h('div.meta');
    meta.style.cssText = 'position:absolute;left:0;right:0;top:0;bottom:0;pointer-events:none;overflow:hidden;border-radius:inherit;';

    const slotEl = h('span.d-label', {}, d.label || '第 ' + d.slot + ' 层');
    const cntEl = h('span.d-count', {}, isEmpty ? '0' : String(sum.pieces));
    const nameEl = h('div.d-names' + (isEmpty ? '.empty' : ''), {}, isEmpty ? '空抽屉' : sum.top);

    meta.appendChild(slotEl);
    meta.appendChild(cntEl);
    meta.appendChild(nameEl);
    node.appendChild(meta);

    node.appendChild(h('div.fillbar', {}, h('i', { style: 'width:' + Math.round(fill * 100) + '%' })));

    if (low) node.appendChild(h('div.badge-low'));

    // 着色模式
    if (this.colorMode !== 'physical') {
      const face = node.querySelector('.face');
      const col = this.modeColor(d, fill);
      if (col) face.style.background = col;
    }

    // 过滤
    if (this.filter) {
      const hay = (sum.kinds.join(' ') + ' ' + (d.label || '') + ' ' + (PV.Store.stack(d.stack_id) || {}).name + ' ' + d.slot).toLowerCase();
      const hit = hay.indexOf(this.filter.toLowerCase()) !== -1;
      if (!hit) node.classList.add('dim');
      else node.classList.add('hit');
    }
    if (this.onlyLow && (!low || isEmpty)) node.classList.add('dim');

    node.addEventListener('click', () => {
      PV.Sound.open();
      node.classList.add('pulled');
      setTimeout(() => {
        node.classList.remove('pulled');
        PV.go('drawer', { drawerId: d.id });
      }, 330);
    });

    return node;
  },

  modeColor(d, fill) {
    if (this.colorMode === 'fill') {
      if (fill <= 0) return 'linear-gradient(178deg,#3a4150,#20252e)';
      const hue = 210 - fill * 150;
      return 'linear-gradient(178deg,hsl(' + hue + ' 70% 62%),hsl(' + hue + ' 65% 44%))';
    }
    if (this.colorMode === 'category') {
      const S = PV.Store;
      const counts = {};
      S.cellsOf(d.id).forEach((c) => {
        if (c.qty > 0 && c.part_id) {
          const p = S.part(c.part_id);
          if (p) counts[p.category_name || '未分类'] = (counts[p.category_name || '未分类'] || 0) + c.qty;
        }
      });
      const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
      if (!top) return 'linear-gradient(178deg,#3a4150,#20252e)';
      const cat = S.state.categories.find((c) => c.name === top);
      const col = (cat && cat.color) || '#6ea8fe';
      return 'linear-gradient(178deg,' + CompArt._shade(col, 0.28) + ',' + CompArt._shade(col, -0.28) + ')';
    }
    return null;
  },

  setMode(m) {
    this.colorMode = m;
    PV.Sound.click();
    this.render();
  },

  setFilter(text) {
    this.filter = text || '';
    this.render();
  },

  resetTilt() {
    this.tiltX = 7; this.tiltY = -9;
    const c = PV.util.$('#cabinet');
    if (c) { c.style.setProperty('--tilt-x', '7deg'); c.style.setProperty('--tilt-y', '-9deg'); }
    PV.Sound.click();
  },

  /** 鼠标/触摸拖拽旋转柜体（创意交互） */
  bindDrag(wrap) {
    const self = this;
    if (!this._winBound) {
      this._winBound = true;
      window.addEventListener('mousemove', (e) => {
        if (self._drag === null) return;
        const c = PV.util.$('#cabinet');
        if (!c) return;
        self.tiltY = Math.max(-34, Math.min(34, self._drag.bx + (e.clientX - self._drag.sx) * 0.16));
        self.tiltX = Math.max(-14, Math.min(28, self._drag.by - (e.clientY - self._drag.sy) * 0.1));
        c.style.transition = 'none';
        c.style.setProperty('--tilt-x', self.tiltX + 'deg');
        c.style.setProperty('--tilt-y', self.tiltY + 'deg');
      });
      window.addEventListener('mouseup', () => {
        if (self._drag === null) return;
        self._drag = null;
        const c = PV.util.$('#cabinet');
        if (c) c.style.transition = '';
        if (self.wrap) self.wrap.style.cursor = 'grab';
      });
    }
    wrap.style.cursor = 'grab';
    wrap.addEventListener('mousedown', (e) => {
      if (e.target.closest('.drawer3d')) return; // 点抽屉不旋转
      self._drag = { sx: e.clientX, sy: e.clientY, bx: self.tiltY, by: self.tiltX };
      wrap.style.cursor = 'grabbing';
      e.preventDefault();
    });
  },

  _drag: null,
};

PV.CabinetView = CabinetView;
