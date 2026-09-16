/* =========================================================================
   views/moves.js · 出入库流水（每一次取出/放入都留痕，可回溯）
   ========================================================================= */
'use strict';

const MovesView = {
  kind: '',
  kw: '',

  KIND_META: {
    IN: { cls: 'in', sign: '+', text: '放入' },
    OUT: { cls: 'out', sign: '−', text: '取出' },
    SET: { cls: 'set', sign: '=', text: '盘点' },
    ASSIGN: { cls: 'assign', sign: '+', text: '指定' },
    CLEAR: { cls: 'clear', sign: '×', text: '清空' },
    MOVE: { cls: 'move', sign: '→', text: '挪位' },
    LAYOUT: { cls: 'layout', sign: '⌗', text: '布局' },
    PART: { cls: 'part', sign: '◇', text: '元件' },
    IMPORT: { cls: 'import', sign: '⇩', text: '导入' },
  },

  render() {
    const el = PV.util.$('#view-moves');
    const S = PV.Store;
    const { h } = PV.util;
    el.innerHTML = '';

    el.appendChild(h('div.section-head', {}, [
      h('h2', {}, '出入库流水'),
      h('span.sub', {}, '完整记录每一次操作，谁在什么时候把什么放进了哪个格子'),
      h('div.grow', {}, [
        h('button.btn.sm', { onclick: () => this.exportCSV() }, [PV.util.icon('i-download', 14), '导出 CSV']),
        h('button.btn.sm.danger', { onclick: () => this.clearLog() }, [PV.util.icon('i-trash', 14), '清空流水']),
      ]),
    ]));

    const kinds = ['', 'IN', 'OUT', 'SET', 'ASSIGN', 'MOVE', 'CLEAR', 'LAYOUT'];
    const seg = h('div.seg', {}, kinds.map((k) =>
      h('button' + (this.kind === k ? '.on' : ''), { onclick: () => { this.kind = k; this.render(); } },
        k === '' ? '全部' : this.KIND_META[k].text)
    ));

    const search = h('input', {
      placeholder: '搜索元件名 / 备注…', value: this.kw,
      style: 'height:34px;padding:0 12px;border-radius:10px;border:1px solid var(--stroke);background:rgba(255,255,255,.045);outline:none;width:230px',
      oninput: (e) => { this.kw = e.target.value; this.paint(); },
    });

    el.appendChild(h('div.toolbar', {}, [seg, search]));

    const list = h('div', { id: 'moves-list' });
    el.appendChild(list);
    this.listEl = list;
    this.paint();
  },

  filtered() {
    const S = PV.Store;
    return S.state.moves.filter((m) => {
      if (this.kind && m.kind !== this.kind) return false;
      if (this.kw) {
        const hay = ((m.part_name || '') + ' ' + (m.note || '') + ' ' + m.kind).toLowerCase();
        if (hay.indexOf(this.kw.toLowerCase()) === -1) return false;
      }
      return true;
    });
  },

  paint() {
    const { h } = PV.util;
    const list = this.listEl;
    if (!list) return;
    list.innerHTML = '';

    const items = this.filtered();
    if (!items.length) {
      list.appendChild(h('div.empty', {}, [
        PV.util.icon('i-history', 42),
        h('p', {}, '还没有流水记录'),
        h('p', { style: 'font-size:12px' }, '去货架上点一个抽屉，放入或取出几个元件试试'),
      ]));
      return;
    }

    const wrap = h('div.move-list');
    let lastDay = '';
    items.forEach((m) => {
      const day = PV.util.fmtDate(m.ts);
      if (day !== lastDay) {
        lastDay = day;
        wrap.appendChild(h('div.move-day', {}, PV.util.dayLabel(m.ts)));
      }
      wrap.appendChild(this.row(m));
    });
    list.appendChild(wrap);
  },

  row(m) {
    const { h } = PV.util;
    const meta = this.KIND_META[m.kind] || { cls: 'set', sign: '·', text: m.kind };
    const where = m.cell_id ? PV.Store.cellWhere(m.cell_id) : '';
    const fromWhere = m.from_cell ? PV.Store.cellWhere(m.from_cell) : '';
    const unit = '';

    let desc;
    switch (m.kind) {
      case 'IN':
        desc = [h('b', {}, m.part_name || '元件'), ' 放入 ', h('span', {}, where)]; break;
      case 'OUT':
        desc = [h('b', {}, m.part_name || '元件'), ' 取自 ', h('span', {}, where)]; break;
      case 'SET':
        desc = [h('b', {}, m.part_name || '元件'), ' 盘点为 ', h('span', {}, m.after_qty + ' 个 @ ' + where)]; break;
      case 'ASSIGN':
        desc = [h('b', {}, m.part_name || '元件'), ' 放入 ', h('span', {}, where + '（新种类）')]; break;
      case 'CLEAR':
        desc = ['清空 ', h('b', {}, m.part_name || '格子'), h('span', {}, ' @ ' + where)]; break;
      case 'MOVE':
        desc = [h('b', {}, m.part_name || '元件'), ' 挪位 ', h('span', {}, fromWhere + ' → ' + where)]; break;
      case 'LAYOUT':
        desc = [h('b', {}, '调整了货架布局'), h('span', {}, ' ' + (m.note || ''))]; break;
      case 'PART':
        desc = [h('b', {}, '元件库变更'), h('span', {}, ' ' + (m.part_name || '') + ' ' + (m.note || ''))]; break;
      case 'IMPORT':
        desc = [h('b', {}, '导入数据'), h('span', {}, ' ' + (m.note || ''))]; break;
      default:
        desc = [h('b', {}, m.part_name || m.kind), h('span', {}, ' ' + where)];
    }
    if (m.note && ['LAYOUT', 'PART', 'IMPORT'].indexOf(m.kind) === -1) {
      desc.push(h('span', { style: 'opacity:.75' }, '　· ' + m.note));
    }

    const deltaCls = m.qty > 0 ? 'pos' : m.qty < 0 ? 'neg' : 'zero';
    const deltaTxt = m.kind === 'SET'
      ? (m.before_qty + ' → ' + m.after_qty)
      : (m.qty === 0 ? '—' : (m.qty > 0 ? '+' : '') + m.qty);

    return h('div.move-row', {}, [
      h('span.time', {}, PV.util.fmtTime(m.ts)),
      h('span.mk.' + meta.cls, {}, meta.sign),
      h('span.desc', {}, desc),
      h('span.delta.' + deltaCls, {}, deltaTxt),
    ]);
  },

  exportCSV() {
    const rows = [['时间', '类型', '元件', '位置', '数量变化', '变化前', '变化后', '备注']];
    this.filtered().forEach((m) => {
      rows.push([PV.util.fmtDateTime(m.ts), (this.KIND_META[m.kind] || {}).text || m.kind, m.part_name || '',
        m.cell_id ? PV.Store.cellWhere(m.cell_id) : '', String(m.qty), String(m.before_qty), String(m.after_qty), m.note || '']);
    });
    const csv = '\ufeff' + rows.map((r) => r.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\r\n');
    PV.downloadText(csv, 'partvault-出入库流水.csv', 'text/csv;charset=utf-8');
    PV.util.toast('ok', '已导出流水', (rows.length - 1) + ' 条');
  },

  clearLog() {
    PV.util.confirmDialog({
      title: '清空流水',
      message: '流水只是历史记录，清空不会影响当前库存数量。确定要清空吗？',
      danger: true,
      okText: '清空',
    }).then(async (yes) => {
      if (!yes) return;
      if (PV.Store.online) {
        await fetch(PV.API_BASE + 'moves', { method: 'DELETE' });
        PV.Store.state = await (await fetch(PV.API_BASE + 'bootstrap')).json();
        PV.Store.reindex();
      } else {
        PV.Offline.state.moves = [];
        PV.Offline.save();
        PV.Store.state.moves = [];
      }
      PV.util.toast('ok', '流水已清空');
      this.render();
    });
  },
};

PV.MovesView = MovesView;
