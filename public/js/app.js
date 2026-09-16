/* =========================================================================
   app.js · 应用装配：路由、导航、全局搜索、命令面板、快捷键、状态同步
   ========================================================================= */
'use strict';

const App = {
  view: 'cabinet',
  params: {},
  pendingFocus: null,

  async boot() {
    PV.Prefs.load();
    PV.Background.init();
    PV.util.$('#status-msg').textContent = '正在连接数据库…';

    await PV.Store.init();

    PV.util.$('#status-db').textContent = PV.Store.dbPath;

    if (!PV.Store.online) {
      PV.util.$('#status-msg').textContent = '离线演示模式 · 数据仅存于浏览器';
      PV.util.toast('info', '未连接数据库，已进入离线模式',
        '双击项目里的 start.bat（Windows）或运行 start.sh 即可启用 SQLite 数据库', 5200);
    } else {
      PV.util.$('#status-msg').textContent = '已连接 SQLite 数据库';
    }

    this.bindChrome();
    this.updateStats();

    const fromHash = this._fromHash();
    if (fromHash) this.go(fromHash.view, fromHash.params);
    else this.go('cabinet');

    window.addEventListener('hashchange', () => {
      if (this._silentHash) { this._silentHash = false; return; }
      const r = this._fromHash();
      if (r) this.go(r.view, r.params);
    });

    // 首次使用 → 打开初始化向导（后端返回布尔值，离线模式返回 false）
    const iv = PV.Store.state.meta && PV.Store.state.meta.initialized;
    const initialized = iv === true || iv === 1 || iv === '1';
    if (!initialized) {
      setTimeout(() => PV.Wizard.open(), 420);
    }

    // 防止拖拽图片等默认行为干扰
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => e.preventDefault());
  },

  /* ------------------------------ 路由 ------------------------------ */

  go(view, params) {
    this.view = view;
    this.params = params || {};
    if (params && params.focusCell) this.pendingFocus = params.focusCell;

    PV.util.$$('.nav-item').forEach((b) => b.classList.toggle('on', b.dataset.nav === view || (view === 'drawer' && b.dataset.nav === 'cabinet')));
    PV.util.$$('.view').forEach((v) => v.classList.toggle('on', v.id === 'view-' + view));

    const titles = { cabinet: '我的货架', drawer: '抽屉详情', parts: '元件库', moves: '出入库流水', settings: '布局与设置' };
    PV.util.$('#status-msg').textContent = titles[view] || '';

    this._setHash();
    this.renderView();
    if (view === 'cabinet') PV.util.$('#view-cabinet').scrollTop = 0;
  },

  /** 地址栏 hash 同步，方便收藏 / 分享定位（#drawer/12） */
  _setHash() {
    const want = this.view + (this.params && this.params.drawerId ? '/' + this.params.drawerId : '');
    if (location.hash.slice(1) === want) return;
    this._silentHash = true;
    try { location.hash = want; } catch (e) { /* ignore */ }
  },

  _fromHash() {
    const raw = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (!raw) return null;
    const seg = raw.split('/');
    const view = seg[0];
    if (['cabinet', 'drawer', 'parts', 'moves', 'settings'].indexOf(view) === -1) return null;
    return { view, params: seg[1] ? { drawerId: Number(seg[1]) } : {} };
  },

  renderView() {
    switch (this.view) {
      case 'cabinet': PV.CabinetView.render(); break;
      case 'drawer': PV.DrawerView.render(this.params.drawerId); break;
      case 'parts': PV.PartsView.render(); break;
      case 'moves': PV.MovesView.render(); break;
      case 'settings': PV.SettingsView.render(); break;
    }
    if (this.view === 'drawer' && this.pendingFocus) {
      const id = this.pendingFocus;
      this.pendingFocus = null;
      setTimeout(() => {
        const node = PV.util.$('.slot[data-cell="' + id + '"]');
        if (node) {
          node.scrollIntoView({ block: 'center', behavior: 'smooth' });
          node.classList.add('active');
          PV.ping(node);
        }
      }, 240);
    }
  },

  /** 数据变化后：刷新统计 + 重绘当前视图 */
  afterChange() {
    this.updateStats();
    this.renderView();
  },

  async refresh() {
    await PV.Store.init();
    this.updateStats();
    this.renderView();
    PV.util.$('#status-db').textContent = PV.Store.dbPath;
  },

  updateStats() {
    const S = PV.Store;
    if (!S.state) return;
    const st = S.state.stats;
    let cells = 0, used = 0, pieces = 0, kinds = 0;
    S.state.cells.forEach((c) => {
      cells++;
      if (c.qty > 0 && c.part_id) { used++; pieces += c.qty; }
    });
    kinds = S.state.parts.filter((p) => p.stock > 0).length;
    const low = S.state.parts.filter((p) => p.min_stock > 0 && p.stock <= p.min_stock).length;

    const set = (id, v) => { const n = PV.util.$(id); if (n) n.textContent = v; };
    set('#top-pieces', PV.util.fmtNum(pieces));
    set('#top-cells', used + '/' + cells);
    set('#top-low', low);
    set('#ss-kinds', S.state.parts.length);
    set('#ss-pieces', PV.util.fmtNum(pieces));
    set('#ss-cells', used + ' / ' + cells);
    const bar = PV.util.$('#ss-bar');
    if (bar) bar.style.width = Math.round((cells ? used / cells : 0) * 100) + '%';
    set('#nav-parts-count', S.state.parts.length);
    set('#cabinet-name', (S.state.meta && S.state.meta.cabinet_name) || '我的元件柜');

    const lowChip = PV.util.$('#chip-low');
    if (lowChip) lowChip.classList.toggle('warn', low > 0);
  },

  /* ------------------------------ 顶栏 / 侧栏事件 ------------------------------ */

  bindChrome() {
    PV.util.$$('.nav-item').forEach((b) => b.addEventListener('click', () => { PV.Sound.click(); this.go(b.dataset.nav); }));
    PV.util.$('#btn-theme').addEventListener('click', () => PV.Prefs.toggleTheme());
    PV.util.$('#btn-sound').addEventListener('click', () => PV.Prefs.toggleSound());
    PV.util.$('#chip-low').addEventListener('click', () => { PV.PartsView.onlyLow = true; this.go('parts'); });
    PV.util.$('#sheet-close').addEventListener('click', () => PV.Sheet.close());
    PV.util.$('#sheet-mask').addEventListener('click', () => PV.Sheet.close());
    PV.util.$('#modal-close').addEventListener('click', () => PV.Modal.close());
    PV.util.$('#modal-mask').addEventListener('click', (e) => { if (e.target.id === 'modal-mask') PV.Modal.close(); });

    // 移动端侧栏
    const menuBtn = PV.util.$('#btn-menu');
    const syncMenu = () => { menuBtn.style.display = window.innerWidth <= 860 ? '' : 'none'; };
    syncMenu();
    window.addEventListener('resize', PV.util.debounce(syncMenu, 150));
    menuBtn.addEventListener('click', () => PV.util.$('#sidebar').classList.toggle('open'));

    this.bindSearch();
    this.bindCommandPalette();
    this.bindKeys();
  },

  /* ------------------------------ 全局搜索 ------------------------------ */

  bindSearch() {
    const input = PV.util.$('#global-search');
    const box = input.parentElement;
    let panel = null;

    const close = () => { if (panel) { panel.remove(); panel = null; } };

    const run = () => {
      const q = input.value.trim();
      close();
      if (!q) { PV.CabinetView.setFilter(''); return; }

      const S = PV.Store;
      const kw = q.toLowerCase();
      const parts = S.state.parts.filter((p) =>
        (p.name + ' ' + p.spec + ' ' + p.package + ' ' + p.code).toLowerCase().indexOf(kw) !== -1
      ).slice(0, 7);
      const drawers = [];
      S.state.stacks.forEach((st) => S.drawersOf(st.id).forEach((d) => {
        const sum = S.drawerSummary(d.id);
        const hay = ((sum.kinds || []).join(' ') + ' ' + (d.label || '') + ' ' + st.name + ' 第' + d.slot).toLowerCase();
        if (hay.indexOf(kw) !== -1) drawers.push({ d, st, sum });
      }));

      panel = PV.util.h('div', {
        style: 'position:absolute;top:44px;left:0;right:0;z-index:70;max-height:60vh;overflow:auto;' +
          'border:1px solid var(--stroke-hi);border-radius:14px;padding:8px;' +
          'background:linear-gradient(180deg,rgba(18,24,37,.99),rgba(12,16,25,.99));box-shadow:0 26px 60px rgba(0,0,0,.6)',
      });
      if (document.documentElement.getAttribute('data-theme') === 'light') panel.style.background = '#fff';

      if (!parts.length && !drawers.length) {
        panel.appendChild(PV.util.h('div', { style: 'padding:18px;text-align:center;color:var(--text-mute);font-size:12.5px' }, '没有找到「' + q + '」，试试别的关键词'));
      }

      if (parts.length) {
        panel.appendChild(PV.util.h('div.cmdk-group', {}, '元件'));
        parts.forEach((p) => {
          const loc = S.partLocations(p.id)[0];
          panel.appendChild(PV.util.h('div.cmdk-item', {
            onclick: () => {
              close(); input.value = '';
              if (loc) PV.go('drawer', { drawerId: loc.drawerId, focusCell: loc.cellId });
              else { PV.PartsView.kw = p.name; PV.go('parts'); }
            },
          }, [
            PV.util.h('span.ic', {}, PV.CompArt.node(p.category_icon || PV.CompArt.guessIcon(p.name), p.color, p.id, 20)),
            PV.util.h('span', {}, p.name + (p.spec ? ' ' + p.spec : '')),
            PV.util.h('span.k', {}, p.stock + ' ' + (p.unit || '个') + (loc ? ' · ' + loc.short : ' · 未存放')),
          ]));
        });
      }

      if (drawers.length) {
        panel.appendChild(PV.util.h('div.cmdk-group', {}, '抽屉'));
        drawers.slice(0, 6).forEach((it) => {
          panel.appendChild(PV.util.h('div.cmdk-item', {
            onclick: () => { close(); input.value = ''; PV.go('drawer', { drawerId: it.d.id }); },
          }, [
            PV.util.h('span.ic', {}, PV.util.icon('i-cabinet', 16)),
            PV.util.h('span', {}, it.st.name + ' · 第 ' + it.d.slot + ' 层' + (it.d.label ? '（' + it.d.label + '）' : '')),
            PV.util.h('span.k', {}, it.sum.used + '/' + it.sum.total + ' 格 · ' + it.sum.pieces + ' 个'),
          ]));
        });
      }

      box.appendChild(panel);
    };

    input.addEventListener('input', PV.util.debounce(run, 180));
    input.addEventListener('focus', () => { if (input.value.trim()) run(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { run(); if (panel) { const first = panel.querySelector('.cmdk-item'); if (first) first.click(); } }
      if (e.key === 'Escape') { input.value = ''; close(); PV.CabinetView.setFilter(''); input.blur(); }
    });
    document.addEventListener('click', (e) => { if (!box.contains(e.target)) close(); });
  },

  /* ------------------------------ 命令面板 ------------------------------ */

  bindCommandPalette() {
    const wrap = PV.util.$('#cmdk');
    const input = PV.util.$('#cmdk-input');
    const list = PV.util.$('#cmdk-list');
    let items = [], cursor = 0;

    const commands = () => [
      { group: '前往', label: '我的货架', ic: 'i-cabinet', run: () => App.go('cabinet') },
      { group: '前往', label: '元件库', ic: 'i-chip', run: () => App.go('parts') },
      { group: '前往', label: '出入库流水', ic: 'i-history', run: () => App.go('moves') },
      { group: '前往', label: '布局与设置', ic: 'i-settings', run: () => App.go('settings') },
      { group: '操作', label: '新增元件种类', ic: 'i-plus', run: () => PV.PartsView.editPart(null) },
      { group: '操作', label: '打开初始化向导', ic: 'i-sparkle', run: () => PV.Wizard.open() },
      { group: '操作', label: '导出 JSON 备份', ic: 'i-download', run: async () => {
          const txt = await PV.Store.exportJSON();
          PV.downloadText(txt, 'partvault-备份-' + PV.util.fmtDate(new Date().toISOString()) + '.json', 'application/json');
          PV.util.toast('ok', '已导出备份');
        } },
      { group: '操作', label: '导出元件清单 CSV', ic: 'i-download', run: () => PV.PartsView.exportCSV() },
      { group: '操作', label: '切换明暗主题', ic: 'i-moon', run: () => PV.Prefs.toggleTheme() },
      { group: '操作', label: '开关音效', ic: 'i-sound', run: () => PV.Prefs.toggleSound() },
      { group: '操作', label: '重新连接数据库', ic: 'i-refresh', run: () => App.refresh() },
    ];

    const paint = () => {
      const q = input.value.trim().toLowerCase();
      list.innerHTML = '';
      items = [];

      // 命令
      const cmds = commands().filter((c) => !q || c.label.toLowerCase().indexOf(q) !== -1);
      if (cmds.length) {
        list.appendChild(PV.util.h('div.cmdk-group', {}, '命令'));
        cmds.forEach((c) => {
          items.push(c);
          list.appendChild(PV.util.h('div.cmdk-item', { onclick: () => { close(); c.run(); } }, [
            PV.util.h('span.ic', {}, PV.util.icon(c.ic, 15)),
            PV.util.h('span', {}, c.label),
            PV.util.h('span.k', {}, c.group),
          ]));
        });
      }

      // 元件
      if (q) {
        const parts = PV.Store.state.parts.filter((p) =>
          (p.name + ' ' + p.spec + ' ' + p.package).toLowerCase().indexOf(q) !== -1
        ).slice(0, 8);
        if (parts.length) {
          list.appendChild(PV.util.h('div.cmdk-group', {}, '元件（回车定位）'));
          parts.forEach((p) => {
            const loc = PV.Store.partLocations(p.id)[0];
            const item = { label: p.name, run: () => { if (loc) App.go('drawer', { drawerId: loc.drawerId, focusCell: loc.cellId }); else { PV.PartsView.kw = p.name; App.go('parts'); } } };
            items.push(item);
            list.appendChild(PV.util.h('div.cmdk-item', { onclick: () => { close(); item.run(); } }, [
              PV.util.h('span.ic', {}, PV.CompArt.node(p.category_icon || PV.CompArt.guessIcon(p.name), p.color, p.id, 20)),
              PV.util.h('span', {}, p.name + (p.spec ? ' ' + p.spec : '')),
              PV.util.h('span.k', {}, p.stock + ' 个'),
            ]));
          });
        }
      }

      cursor = 0;
      highlight();
    };

    const highlight = () => {
      PV.util.$$('.cmdk-item', list).forEach((n, i) => n.classList.toggle('on', i === cursor));
    };

    const open = () => {
      wrap.classList.add('on');
      input.value = '';
      paint();
      setTimeout(() => input.focus(), 40);
    };
    const close = () => { wrap.classList.remove('on'); input.blur(); };

    input.addEventListener('input', paint);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { cursor = Math.min(cursor + 1, items.length - 1); highlight(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { cursor = Math.max(cursor - 1, 0); highlight(); e.preventDefault(); }
      else if (e.key === 'Enter') { if (items[cursor]) { const it = items[cursor]; close(); it.run(); } }
      else if (e.key === 'Escape') close();
    });
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });

    PV.openCommandPalette = open;
  },

  /* ------------------------------ 快捷键 ------------------------------ */

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select';

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        PV.openCommandPalette();
        return;
      }
      if (e.key === 'Escape') {
        if (PV.util.$('#cmdk').classList.contains('on')) return;
        if (PV.Modal.isOpen()) { PV.Modal.close(); return; }
        if (PV.Sheet.isOpen()) { PV.Sheet.close(); return; }
      }
      if (typing) return;
      if (e.key === '/') { e.preventDefault(); PV.util.$('#global-search').focus(); }
      if (e.key === '1') App.go('cabinet');
      if (e.key === '2') App.go('parts');
      if (e.key === '3') App.go('moves');
      if (e.key === '4') App.go('settings');
    });
  },
};

PV.App = App;
PV.go = (v, p) => App.go(v, p);
PV.afterChange = () => App.afterChange();

window.addEventListener('DOMContentLoaded', () => App.boot());
