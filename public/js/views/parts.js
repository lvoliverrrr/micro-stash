/* =========================================================================
   views/parts.js · 元件库（种类、参数、库存、分布位置）
   ========================================================================= */
'use strict';

const PartsView = {
  kw: '',
  cat: '',
  sort: 'name',
  onlyLow: false,

  render() {
    const el = PV.util.$('#view-parts');
    const S = PV.Store;
    const { h } = PV.util;
    el.innerHTML = '';

    const cats = S.state.categories.slice().sort((a, b) => a.sort - b.sort);

    /* ---------- 工具条 ---------- */
    const search = h('input', {
      placeholder: '搜索名称 / 规格 / 封装 / 编号…',
      value: this.kw,
      style: 'height:34px;padding:0 12px;border-radius:10px;border:1px solid var(--stroke);background:rgba(255,255,255,.045);outline:none;width:250px',
      oninput: (e) => { this.kw = e.target.value; this.paint(); },
    });

    const sortSel = h('select', {
      style: 'height:34px;padding:0 10px;border-radius:10px;border:1px solid var(--stroke);background:rgba(255,255,255,.045);outline:none',
      onchange: (e) => { this.sort = e.target.value; this.paint(); },
    }, [
      h('option', { value: 'name', selected: this.sort === 'name' }, '按名称'),
      h('option', { value: 'stock', selected: this.sort === 'stock' }, '按库存多→少'),
      h('option', { value: 'stockAsc', selected: this.sort === 'stockAsc' }, '按库存少→多'),
      h('option', { value: 'cells', selected: this.sort === 'cells' }, '按占用格子'),
      h('option', { value: 'cat', selected: this.sort === 'cat' }, '按分类'),
    ]);

    const catRow = h('div.cat-chips');
    const paintCats = () => {
      catRow.innerHTML = '';
      catRow.appendChild(h('button.cat-chip' + (this.cat === '' ? '.on' : ''), { onclick: () => { this.cat = ''; paintCats(); this.paint(); } }, '全部 ' + S.state.parts.length));
      cats.forEach((c) => {
        const n = S.state.parts.filter((p) => p.category_id === c.id).length;
        catRow.appendChild(h('button.cat-chip' + (this.cat === c.name ? '.on' : ''), {
          onclick: () => { this.cat = c.name; paintCats(); this.paint(); },
        }, [h('i', { style: 'background:' + c.color }), c.name + ' ' + n]));
      });
    };
    paintCats();

    el.appendChild(h('div.section-head', {}, [
      h('h2', {}, '元件库'),
      h('span.sub', {}, '这里是你的「种类主数据」——每种元件在哪个格子里放了多少，系统会自动汇总'),
      h('div.grow', {}, [
        h('button.btn.sm' + (this.onlyLow ? '.warn' : ''), { onclick: () => { this.onlyLow = !this.onlyLow; this.render(); } }, [PV.util.icon('i-alert', 14), '只看低库存']),
        h('button.btn.sm', { onclick: () => this.manageCategories() }, [PV.util.icon('i-grid', 14), '分类管理']),
        h('button.btn.sm', { onclick: () => this.exportCSV() }, [PV.util.icon('i-download', 14), '导出 CSV']),
        h('button.btn.sm.primary', { onclick: () => this.editPart(null) }, [PV.util.icon('i-plus', 14), '新增元件']),
      ]),
    ]));

    el.appendChild(h('div.toolbar', {}, [search, sortSel, catRow]));
    const list = h('div', { id: 'parts-list' });
    el.appendChild(list);
    this.listEl = list;
    this.paint();
  },

  paint() {
    const S = PV.Store;
    const { h } = PV.util;
    const list = this.listEl;
    if (!list) return;
    list.innerHTML = '';

    let items = S.state.parts.filter((p) => {
      if (this.cat && p.category_name !== this.cat) return false;
      if (this.onlyLow && !(p.min_stock > 0 && p.stock <= p.min_stock)) return false;
      if (this.kw) {
        const hay = (p.name + ' ' + p.spec + ' ' + p.package + ' ' + p.code + ' ' + p.note).toLowerCase();
        if (hay.indexOf(this.kw.toLowerCase()) === -1) return false;
      }
      return true;
    });

    if (this.sort === 'stock') items.sort((a, b) => b.stock - a.stock);
    else if (this.sort === 'stockAsc') items.sort((a, b) => a.stock - b.stock);
    else if (this.sort === 'cells') items.sort((a, b) => (b.cell_count || 0) - (a.cell_count || 0));
    else if (this.sort === 'cat') items.sort((a, b) => String(a.category_name).localeCompare(String(b.category_name), 'zh') || a.name.localeCompare(b.name, 'zh'));
    else items.sort((a, b) => a.name.localeCompare(b.name, 'zh') || String(a.spec).localeCompare(String(b.spec), 'zh'));

    if (!items.length) {
      list.appendChild(h('div.empty', {}, [
        PV.util.icon('i-search', 42),
        h('p', {}, '没有匹配的元件'),
        h('p', { style: 'font-size:12px' }, '换个关键词，或点右上角「新增元件」'),
      ]));
      return;
    }

    const grid = h('div.part-grid');
    items.forEach((p) => grid.appendChild(this.card(p)));
    list.appendChild(grid);
  },

  card(p) {
    const { h } = PV.util;
    const S = PV.Store;
    const low = p.min_stock > 0 && p.stock <= p.min_stock;
    const locs = S.partLocations(p.id);

    const card = h('div.part-card' + (low ? '.low' : ''), { style: '--tint:' + (p.color || '#6ea8fe') });

    card.appendChild(h('div.pc-head', {}, [
      h('div.pc-icon', {}, CompArt.node(p.category_icon || CompArt.guessIcon(p.name), p.color, p.id, 34)),
      h('div.pc-title', {}, [
        h('b', {}, p.name),
        h('span', {}, (p.spec || '—') + (p.package ? ' · ' + p.package : '')),
      ]),
      h('div.pc-stock' + (low ? '.low' : ''), {}, [
        h('b', {}, String(p.stock)),
        h('span', {}, p.unit || '个'),
      ]),
    ]));

    card.appendChild(h('div.pc-tags', {}, [
      h('span.tag', {}, p.category_name || '未分类'),
      h('span.tag', {}, (p.cell_count || 0) + ' 个格子'),
      p.min_stock > 0 ? h('span.tag' + (low ? '.warn' : ''), {}, low ? '低于阈值 ' + p.min_stock : '阈值 ' + p.min_stock) : null,
      p.code ? h('span.tag', {}, p.code) : null,
    ]));

    if (locs.length) {
      card.appendChild(h('div.loc-chips', {}, locs.slice(0, 4).map((l) =>
        h('button.loc-chip', { onclick: () => PV.go('drawer', { drawerId: l.drawerId, focusCell: l.cellId }) }, l.short + ' · ' + l.qty)
      ).concat(locs.length > 4 ? [h('span.loc-chip', { style: 'background:transparent;border-color:var(--stroke);color:var(--text-mute)' }, '+' + (locs.length - 4))] : [])));
    } else {
      card.appendChild(h('div.hint', {}, '还没有放进任何格子'));
    }

    card.appendChild(h('div.pc-actions', {}, [
      h('button.btn.xs', { onclick: () => this.putToCell(p) }, [PV.util.icon('i-in', 12), '放入格子']),
      h('button.btn.xs', { onclick: () => this.editPart(p) }, [PV.util.icon('i-edit', 12), '编辑']),
      h('button.btn.xs.ghost', { onclick: () => this.removePart(p) }, [PV.util.icon('i-trash', 12)]),
    ]));

    return card;
  },

  /* ---------- 放入格子：选一个已有空格子或新建 ---------- */
  putToCell(p) {
    const { h } = PV.util;
    const S = PV.Store;
    const empties = [];
    S.state.stacks.forEach((st) => {
      S.drawersOf(st.id).forEach((d) => {
        S.cellsOf(d.id).forEach((c) => {
          if (!c.qty || c.part_id === p.id) empties.push({ cell: c, drawer: d, stack: st });
        });
      });
    });
    if (!empties.length) { PV.util.toast('err', '没有可用格子', '请先在设置里增加抽屉或格子'); return; }

    const table = h('div', { style: 'max-height:50vh;overflow:auto;display:flex;flex-direction:column;gap:5px' });
    empties.slice(0, 400).forEach((it) => {
      table.appendChild(h('button', {
        style: 'display:flex;align-items:center;gap:10px;padding:8px 11px;border-radius:10px;border:1px solid var(--stroke);background:rgba(255,255,255,.03);text-align:left',
        onclick: async () => {
          PV.Modal.close();
          await PV.Store.op(it.cell.id, { op: 'ASSIGN', part_id: p.id, qty: Number(qtyInput.value) || 1 });
          PV.Sound.place();
          PV.util.toast('in', '已放入', p.name + ' → ' + it.stack.name + ' 第 ' + it.drawer.slot + ' 层 R' + it.cell.r + 'C' + it.cell.c);
          PV.afterChange();
          PV.go('drawer', { drawerId: it.drawer.id, focusCell: it.cell.id });
        },
      }, [
        h('span', { style: 'font-size:12px;min-width:150px' }, it.stack.name + ' · 第 ' + it.drawer.slot + ' 层' + (it.drawer.label ? '（' + it.drawer.label + '）' : '')),
        h('span.tag', {}, 'R' + it.cell.r + 'C' + it.cell.c),
        h('span.hint', { style: 'margin-left:auto' }, it.cell.qty ? '同类已有 ' + it.cell.qty : '空'),
      ]));
    });

    const qtyInput = h('input', { type: 'number', value: 10, min: 1, style: 'height:36px;padding:0 11px;border-radius:10px;border:1px solid var(--stroke);background:rgba(255,255,255,.045)' });

    PV.Modal.open({
      title: '把「' + p.name + (p.spec ? ' ' + p.spec : '') + '」放进格子',
      sub: '共 ' + empties.length + ' 个可用格子（空格或同类）',
      wide: true,
      body: [h('div.field', {}, [h('label', {}, '放入数量'), qtyInput]), table],
      foot: [h('button.btn.ghost', { onclick: () => PV.Modal.close() }, '取消')],
    });
  },

  /* ---------- 新增 / 编辑元件 ---------- */
  editPart(p) {
    const S = PV.Store;
    const cats = S.state.categories.map((c) => ({ value: c.id, label: c.name }));
    PV.util.formDialog({
      title: p ? '编辑元件' : '新增元件',
      sub: p ? (p.code || '') : '先建「种类」，再把它放进某个格子',
      wide: true,
      fields: [
        { key: 'name', label: '元件名称 *', value: p ? p.name : '', placeholder: '例如：电解电容', full: false },
        { key: 'spec', label: '规格 / 参数', value: p ? p.spec : '', placeholder: '例如：1000μF 16V' },
        { key: 'category_id', label: '分类', type: 'select', value: p ? p.category_id : (cats[0] ? cats[0].value : ''), options: cats },
        { key: 'package', label: '封装 / 尺寸', value: p ? p.package : '', placeholder: '例如：直插 D8×12' },
        { key: 'unit', label: '计量单位', value: p ? p.unit : '个', placeholder: '个 / 条 / 包' },
        { key: 'min_stock', label: '安全库存阈值', type: 'number', value: p ? p.min_stock : 10, min: 0, hint: '低于或等于这个数量会标红提醒' },
        { key: 'color', label: '标签颜色', type: 'color', value: p ? p.color : '#6ea8fe' },
        { key: 'code', label: '内部编号', value: p ? p.code : '', placeholder: '留空自动生成 PV-xxxx' },
        { key: 'note', label: '备注', type: 'textarea', value: p ? p.note : '', full: true, placeholder: '品牌、替代型号、采购来源…' },
      ],
      okText: p ? '保存修改' : '创建',
      validate: (v) => (String(v.name || '').trim() ? null : '请填写元件名称'),
    }).then(async (v) => {
      if (!v) return;
      try {
        await PV.Store.savePart({
          name: String(v.name).trim(), spec: v.spec, category_id: v.category_id || null,
          package: v.package, unit: v.unit || '个', min_stock: Number(v.min_stock) || 0,
          color: v.color, code: v.code, note: v.note,
        }, p ? p.id : null);
        PV.Sound.success();
        PV.util.toast('ok', p ? '元件已更新' : '元件已创建', String(v.name));
        PV.afterChange();
        this.render();
      } catch (e) {
        PV.Sound.error();
        PV.util.toast('err', '保存失败', e.message);
      }
    });
  },

  removePart(p) {
    PV.util.confirmDialog({
      title: '删除元件种类',
      message: '确定要删除「' + p.name + (p.spec ? ' ' + p.spec : '') + '」吗？\n\n它分布在各抽屉格子里的记录会一并清空（数量归零），此操作不影响其它元件。',
      danger: true,
      okText: '删除',
    }).then(async (yes) => {
      if (!yes) return;
      try {
        await PV.Store.removePart(p.id);
        PV.Sound.success();
        PV.util.toast('ok', '已删除', p.name);
        PV.afterChange();
        this.render();
      } catch (e) {
        PV.util.toast('err', '删除失败', e.message);
      }
    });
  },

  /* ---------- 分类管理 ---------- */
  manageCategories() {
    const { h } = PV.util;
    const S = PV.Store;
    const wrap = h('div', { style: 'display:flex;flex-direction:column;gap:7px;max-height:50vh;overflow:auto' });

    const draw = () => {
      wrap.innerHTML = '';
      S.state.categories.forEach((c) => {
        const n = S.state.parts.filter((p) => p.category_id === c.id).length;
        wrap.appendChild(h('div', { style: 'display:flex;align-items:center;gap:10px;padding:8px 11px;border-radius:11px;border:1px solid var(--stroke)' }, [
          h('i', { style: 'width:12px;height:12px;border-radius:4px;background:' + c.color }),
          h('span', { style: 'flex:1;font-size:13px' }, c.name),
          h('span.tag', {}, n + ' 种'),
          h('button.btn.xs.ghost', { onclick: () => editCat(c) }, PV.util.icon('i-edit', 12)),
          h('button.btn.xs.ghost', {
            onclick: async () => {
              if (n > 0) { PV.util.toast('err', '该分类下还有元件', '请先移动或删除它们'); return; }
              await PV.Store.removeCategory(c.id);
              PV.util.toast('ok', '已删除分类');
              PV.afterChange(); draw(); this.render();
            },
          }, PV.util.icon('i-trash', 12)),
        ]));
      });
    };

    const editCat = (c) => {
      PV.util.formDialog({
        title: c ? '编辑分类' : '新增分类',
        fields: [
          { key: 'name', label: '分类名称', value: c ? c.name : '' },
          { key: 'color', label: '标签颜色', type: 'color', value: c ? c.color : '#6ea8fe' },
        ],
        okText: '保存',
      }).then(async (v) => {
        if (!v) return;
        const icon = c ? c.icon : CompArt.guessIcon(v.name);
        await PV.Store.saveCategory({ name: v.name, color: v.color, icon }, c ? c.id : null);
        PV.util.toast('ok', '已保存分类');
        PV.afterChange(); draw(); this.render();
      });
    };

    draw();
    PV.Modal.open({
      title: '分类管理',
      sub: '分类决定元件在柜子上的着色，也方便筛选',
      wide: true,
      body: [wrap],
      foot: [
        h('button.btn.sm', { onclick: () => editCat(null) }, [PV.util.icon('i-plus', 13), '新增分类']),
        h('button.btn.ghost', { onclick: () => PV.Modal.close() }, '关闭'),
      ],
    });
  },

  /* ---------- 导出 CSV ---------- */
  exportCSV() {
    const S = PV.Store;
    const rows = [['编号', '名称', '规格', '封装', '分类', '单位', '库存', '占用格子', '安全阈值', '存放位置', '备注']];
    S.state.parts.forEach((p) => {
      const locs = S.partLocations(p.id).map((l) => l.label + ' R' + l.r + 'C' + l.c + '(' + l.qty + ')').join(' / ');
      rows.push([p.code || '', p.name, p.spec || '', p.package || '', p.category_name || '', p.unit || '个',
        String(p.stock), String(p.cell_count || 0), String(p.min_stock || 0), locs, p.note || '']);
    });
    const csv = '\ufeff' + rows.map((r) => r.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\r\n');
    downloadText(csv, 'partvault-元件清单.csv', 'text/csv;charset=utf-8');
    PV.util.toast('ok', '已导出 CSV', rows.length - 1 + ' 条元件记录');
  },
};

/** 通用下载 */
function downloadText(text, filename, mime) {
  const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

PV.PartsView = PartsView;
PV.downloadText = downloadText;
