/* =========================================================================
   views/drawer.js · 抽屉详情（俯视格盘 + 格子操作面板）
   ========================================================================= */
'use strict';

const DrawerView = {
  drawerId: null,
  activeCell: null,

  render(drawerId) {
    const el = PV.util.$('#view-drawer');
    const S = PV.Store;
    if (drawerId) this.drawerId = drawerId;
    const d = S.drawer(this.drawerId);
    if (!d) { el.innerHTML = ''; el.appendChild(PV.util.h('div.empty', {}, '抽屉不存在')); return; }

    const { h } = PV.util;
    const st = S.stack(d.stack_id) || {};
    const sum = S.drawerSummary(d.id);
    el.innerHTML = '';

    /* ---------- 头部 ---------- */
    const siblings = S.drawersOf(d.stack_id);
    const myIdx = siblings.findIndex((x) => x.id === d.id);
    const prev = siblings[myIdx - 1];
    const next = siblings[myIdx + 1];

    el.appendChild(h('div.drawer-view-head', {}, [
      h('button.btn.sm.ghost', { onclick: () => PV.go('cabinet') }, [PV.util.icon('i-back', 15), '回到货架']),
      h('div.title', {}, [
        h('b', {}, (st.name || '列') + ' · 第 ' + d.slot + ' 层' + (d.label ? '　' + d.label : '')),
        h('span', {}, d.rows + ' × ' + d.cols + ' 格　·　已用 ' + sum.used + '/' + sum.total + '　·　在库 ' + sum.pieces + ' 个'),
      ]),
      h('div.grow', { style: 'margin-left:auto;display:flex;gap:8px;flex-wrap:wrap' }, [
        prev ? h('button.btn.sm', { onclick: () => PV.go('drawer', { drawerId: prev.id }) }, '上一屉') : null,
        next ? h('button.btn.sm', { onclick: () => PV.go('drawer', { drawerId: next.id }) }, '下一屉') : null,
        h('button.btn.sm', { onclick: () => this.editDrawer(d) }, [PV.util.icon('i-edit', 14), '编辑抽屉']),
        h('button.btn.sm', { onclick: () => this.quickFill(d) }, [PV.util.icon('i-sparkle', 14), '批量放入']),
      ]),
    ]));

    /* ---------- 格盘 ---------- */
    const grid = h('div.tray-grid', { style: 'grid-template-columns:repeat(' + d.cols + ',1fr)' });
    const cells = S.cellsOf(d.id);
    cells.forEach((c) => grid.appendChild(this.renderSlot(c, d)));

    const tray = h('div.tray', {}, grid);
    if (d.color === 'black') tray.style.background = 'linear-gradient(170deg,#2b323f 0%,#1b212b 100%)';
    else if (d.color === 'gray') tray.style.background = 'linear-gradient(170deg,#b9c1cd 0%,#98a2b0 100%)';
    else if (d.color === 'blue') tray.style.background = 'linear-gradient(170deg,#93b7ff 0%,#6b93ef 100%)';
    else if (d.color === 'amber') tray.style.background = 'linear-gradient(170deg,#ffd9a8 0%,#f2b968 100%)';

    el.appendChild(tray);

    el.appendChild(h('p.hint', { style: 'text-align:center;margin-top:18px' },
      '提示：点击格子进行操作；把格子拖到另一个格子上可以直接「挪位」。空格子点一下就能放入新元件。'));
  },

  renderSlot(c, d) {
    const { h } = PV.util;
    const S = PV.Store;
    const p = c.part_id ? S.part(c.part_id) : null;
    const filled = !!(p && c.qty > 0);
    const low = p && p.min_stock > 0 && p.stock <= p.min_stock;

    const slot = h('div.slot' + (filled ? '.filled' : ''), { draggable: filled ? 'true' : 'false' });
    slot.dataset.cell = c.id;

    slot.appendChild(h('span.idx', {}, 'R' + c.r + 'C' + c.c));
    if (filled) slot.appendChild(h('span.qty' + (low ? '.low' : ''), {}, String(c.qty)));

    if (filled) {
      slot.appendChild(h('div.comp', {}, CompArt.node(p.category_icon || CompArt.guessIcon(p.name), p.color, p.id, 48)));
      slot.appendChild(h('div.cname', {}, p.name));
      slot.appendChild(h('div.cspec', {}, p.spec || p.package || '—'));
    } else {
      slot.appendChild(h('div.comp', {}, h('div.plus', {}, '+')));
      slot.appendChild(h('div.emptytxt', {}, '空'));
    }
    slot.appendChild(h('div.pulse-ring'));

    slot.addEventListener('click', () => {
      PV.Sound.click();
      this.activeCell = c.id;
      PV.util.$$('.slot.active', PV.util.$('#view-drawer')).forEach((n) => n.classList.remove('active'));
      slot.classList.add('active');
      openCellSheet(c.id);
    });

    /* --- 拖拽挪位 --- */
    slot.addEventListener('dragstart', (e) => {
      if (!filled) return e.preventDefault();
      e.dataTransfer.setData('text/plain', String(c.id));
      e.dataTransfer.effectAllowed = 'move';
      slot.classList.add('dragging');
    });
    slot.addEventListener('dragend', () => slot.classList.remove('dragging'));
    slot.addEventListener('dragover', (e) => {
      const src = Number(e.dataTransfer.getData('text/plain') || 0);
      if (!src || src === c.id) return;
      e.preventDefault();
      slot.classList.add('drag-over');
    });
    slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
    slot.addEventListener('drop', async (e) => {
      e.preventDefault();
      slot.classList.remove('drag-over');
      const src = Number(e.dataTransfer.getData('text/plain') || 0);
      if (!src || src === c.id) return;
      try {
        await PV.Store.op(src, { op: 'MOVE', target_cell_id: c.id });
        PV.Sound.place();
        PV.util.toast('info', '已挪位', PV.Store.cellWhere(src) + ' → ' + PV.Store.cellWhere(c.id));
        PV.afterChange();
        this.render();
        ping(slot);
      } catch (err) {
        PV.Sound.error();
        PV.util.toast('err', '挪位失败', err.message);
      }
    });

    return slot;
  },

  /* ---------- 抽屉属性编辑 ---------- */
  editDrawer(d) {
    const { h } = PV.util;
    const S = PV.Store;
    const colorOpts = [
      { value: 'white', label: '白色（照片款）' },
      { value: 'black', label: '黑色' },
      { value: 'gray', label: '灰色' },
      { value: 'blue', label: '蓝色' },
      { value: 'amber', label: '橙色' },
    ];
    PV.util.formDialog({
      title: '编辑抽屉',
      sub: (S.stack(d.stack_id) || {}).name + ' · 第 ' + d.slot + ' 层',
      fields: [
        { key: 'label', label: '抽屉名称（可空）', value: d.label, placeholder: '例如：常用电容' },
        { key: 'color', label: '抽屉颜色', type: 'select', value: d.color, options: colorOpts },
        { key: 'rows', label: '行数（1-10）', type: 'number', value: d.rows, min: 1, max: 10 },
        { key: 'cols', label: '列数（1-10）', type: 'number', value: d.cols, min: 1, max: 10 },
      ],
      hint: '缩小格数不会删除已有元件的数量记录，只会移除超出的格子。',
      okText: '保存',
      validate: (v) => (Number(v.rows) < 1 || Number(v.cols) < 1 ? '行列数至少为 1' : null),
    }).then(async (v) => {
      if (!v) return;
      try {
        if (PV.Store.online) {
          await fetch(PV.API_BASE + 'drawers/' + d.id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: v.label, color: v.color, rows: Number(v.rows), cols: Number(v.cols), note: d.note }),
          }).then(async (r) => {
            const j = await r.json();
            if (!j.ok) throw new Error(j.error);
          });
          PV.Store.state = await (await fetch(PV.API_BASE + 'bootstrap')).json();
          PV.Store.reindex();
        } else {
          d.label = v.label; d.color = v.color;
          const oldRows = d.rows, oldCols = d.cols;
          d.rows = Number(v.rows); d.cols = Number(v.cols);
          if (d.rows !== oldRows || d.cols !== oldCols) {
            const st = PV.Offline.state;
            st.cells = st.cells.filter((c) => !(c.drawer_id === d.id && (c.r > d.rows || c.c > d.cols)));
            for (let r = 1; r <= d.rows; r++)
              for (let cc = 1; cc <= d.cols; cc++)
                if (!st.cells.some((c) => c.drawer_id === d.id && c.r === r && c.c === cc))
                  st.cells.push({ id: st.cells.reduce((a, c) => Math.max(a, c.id), 0) + 1, drawer_id: d.id, r, c: cc, label: '', part_id: null, qty: 0, note: '' });
            PV.Offline.save();
          }
          PV.Store.reindex();
        }
        PV.util.toast('ok', '抽屉已更新');
        PV.afterChange();
        this.render();
      } catch (e) {
        PV.util.toast('err', '保存失败', e.message);
      }
    });
  },

  /* ---------- 批量放入：把一个元件一次塞进多个空格 ---------- */
  quickFill(d) {
    const { h } = PV.util;
    const S = PV.Store;
    const empties = S.cellsOf(d.id).filter((c) => !c.qty);
    openPartPicker({
      title: '批量放入',
      sub: '选一个元件，再点要放入的空格（可多选）',
      onPick: (p) => {
        const chosen = new Set();
        const grid = h('div', { style: 'display:grid;grid-template-columns:repeat(' + d.cols + ',1fr);gap:8px;max-width:520px' });
        empties.forEach((c) => {
          const b = h('button.slot' + (chosen.has(c.id) ? '.active' : ''), { style: 'min-height:70px' }, [
            h('span.idx', {}, 'R' + c.r + 'C' + c.c),
          ]);
          b.onclick = () => {
            if (chosen.has(c.id)) chosen.delete(c.id); else chosen.add(c.id);
            b.classList.toggle('active');
            PV.Sound.click();
          };
          grid.appendChild(b);
        });
        const qtyInput = h('input', { type: 'number', value: 10, min: 1, style: 'height:36px;padding:0 11px;border-radius:10px;border:1px solid var(--stroke);background:rgba(255,255,255,.045);width:110px' });
        PV.Modal.open({
          title: '批量放入 · ' + (p.name + (p.spec ? ' ' + p.spec : '')),
          sub: empties.length + ' 个空格可选',
          body: [h('div.field', {}, h('label', {}, '每个格子放入数量')), qtyInput, grid],
          foot: [
            h('button.btn.ghost', { onclick: () => PV.Modal.close() }, '取消'),
            h('button.btn.primary', {
              onclick: async () => {
                if (!chosen.size) return PV.util.toast('err', '请至少选一个格子');
                const ops = Array.from(chosen).map((cid) => ({ cell_id: cid, op: 'ASSIGN', part_id: p.id, qty: Number(qtyInput.value) || 1 }));
                PV.Modal.close();
                await PV.Store.batch(ops);
                PV.Sound.success();
                PV.util.toast('in', '批量放入完成', chosen.size + ' 个格子 × ' + (Number(qtyInput.value) || 1) + ' ' + (p.unit || '个'));
                PV.afterChange();
                this.render();
              },
            }, '放入'),
          ],
        });
        if (!empties.length) PV.util.toast('info', '这个抽屉没有空格了');
      },
    });
  },
};

/* ------------------------------ 格子悬浮详情 ------------------------------ */

function ping(node) {
  if (!node) return;
  node.classList.remove('ping');
  void node.offsetWidth;
  node.classList.add('ping');
}

/** 打开格子操作面板 */
function openCellSheet(cellId) {
  const { h } = PV.util;
  const S = PV.Store;
  const c = S.cell(cellId);
  if (!c) return;
  const d = S.drawer(c.drawer_id) || {};
  const p = c.part_id ? S.part(c.part_id) : null;
  const where = (S.stack(d.stack_id) || {}).name + ' · 第 ' + d.slot + ' 层 · R' + c.r + 'C' + c.c;

  /* 数量：默认 1（本次要放/取几个），空格子默认 10 */
  const qtyState = { v: c.qty > 0 ? 1 : 10 };

  const body = [];

  /* 元件信息卡 */
  if (p) {
    const low = p.min_stock > 0 && p.stock <= p.min_stock;
    body.push(h('div.panel', { style: 'padding:14px;display:flex;gap:12px;align-items:center' }, [
      h('div.pc-icon', { style: 'width:56px;height:56px;border-radius:14px;display:grid;place-items:center;background:rgba(255,255,255,.05);border:1px solid var(--stroke)' },
        CompArt.node(p.category_icon || CompArt.guessIcon(p.name), p.color, p.id, 44)),
      h('div', { style: 'flex:1;min-width:0' }, [
        h('div', { style: 'font-weight:640;font-size:14px' }, p.name),
        h('div.hint', {}, (p.spec || '—') + (p.package ? ' · ' + p.package : '')),
        h('div', { style: 'display:flex;gap:6px;margin-top:6px;flex-wrap:wrap' }, [
          h('span.tag', {}, p.category_name || '未分类'),
          h('span.tag', {}, '编号 ' + (p.code || '—')),
          low ? h('span.tag.warn', {}, '低于阈值 ' + p.min_stock) : null,
        ]),
      ]),
    ]));
    const other = S.partLocations(p.id).filter((l) => l.cellId !== cellId);
    body.push(h('div', {}, [
      h('div.hint', { style: 'margin-bottom:7px' }, '该元件全柜共 ' + p.stock + ' ' + (p.unit || '个') + '，分布在 ' + (other.length + 1) + ' 个格子：'),
      h('div.loc-chips', {}, [h('span.loc-chip', { style: 'background:rgba(55,224,200,.16);border-color:rgba(55,224,200,.4);color:#9ff0da' }, '当前位置 ' + c.qty)].concat(
        other.map((l) => h('button.loc-chip', {
          onclick: () => { PV.Sheet.close(); PV.go('drawer', { drawerId: l.drawerId, focusCell: l.cellId }); },
        }, l.short + ' R' + l.r + 'C' + l.c + ' · ' + l.qty))
      )),
    ]));
  } else {
    body.push(h('div.panel', { style: 'padding:16px;text-align:center;color:var(--text-mute)' }, '这个格子是空的，先选一个元件放进去吧'));
  }

  body.push(h('div.divider'));

  /* 数量调节 */
  const qtyInput = h('input', { type: 'text', value: String(qtyState.v), inputmode: 'numeric' });
  const decBtn = h('button', { title: '减 1' }, '−');
  const incBtn = h('button', { title: '加 1' }, '+');
  const setV = (v) => { qtyState.v = Math.max(0, Math.floor(Number(v) || 0)); qtyInput.value = qtyState.v; };
  decBtn.onclick = () => { setV(qtyState.v - 1); PV.Sound.click(); };
  incBtn.onclick = () => { setV(qtyState.v + 1); PV.Sound.click(); };
  qtyInput.oninput = () => { qtyState.v = Math.max(0, Math.floor(Number(qtyInput.value) || 0)); };

  body.push(h('div.field', {}, [
    h('label', {}, '本次数量（' + (p ? p.unit || '个' : '个') + '）'),
    h('div.qty-adjust', {}, [decBtn, qtyInput, incBtn]),
    h('div.hint', {}, p
      ? '格子现有 ' + c.qty + ' ' + (p.unit || '个') + '　·　放入 = 加这么多，取出 = 减这么多，设为 = 直接改成这么多'
      : '空格子请用下方「放入新种类」指定元件'),
  ]));

  body.push(h('div.op-grid', {}, [
    h('button.btn.ok', { onclick: () => doOp('IN'), disabled: !p }, [PV.util.icon('i-in', 16), '放入']),
    h('button.btn.warn', { onclick: () => doOp('OUT'), disabled: !p }, [PV.util.icon('i-out', 16), '取出']),
    h('button.btn', { onclick: () => doOp('SET'), disabled: !p }, [PV.util.icon('i-save', 16), '设为']),
  ]));

  if (p) {
    const quick = [1, 5, 10, 50].filter((n) => n !== qtyState.v);
    body.push(h('div', { style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap' }, [
      h('span.hint', {}, '快捷：'),
      quick.map((n) => h('button.btn.xs', { onclick: () => { setV(n); PV.Sound.click(); } }, String(n))),
      h('button.btn.xs.danger', { onclick: () => { setV(c.qty); doOp('OUT'); } }, '全部取出'),
    ]));
  }

  body.push(h('div.divider'));

  /* 更多操作 */
  body.push(h('div', { style: 'display:flex;flex-direction:column;gap:8px' }, [
    h('button.btn', { style: 'justify-content:flex-start', onclick: () => { PV.Sheet.close(); choosePartFor(cellId); } },
      [PV.util.icon('i-chip', 15), p ? '更换元件种类…' : '放入新种类…']),
    h('button.btn', { style: 'justify-content:flex-start', onclick: () => { PV.Sheet.close(); chooseTargetCell(cellId); } },
      [PV.util.icon('i-move', 15), '挪到其他格子…']),
    p ? h('button.btn.danger', { style: 'justify-content:flex-start', onclick: () => doOp('CLEAR', true) },
      [PV.util.icon('i-erase', 15), '清空这个格子']) : null,
  ]));

  /* 备注 */
  const note = h('textarea', { placeholder: '给这个格子加个备注，例如「已老化筛选」「批次 2026-08」' }, c.note || '');
  body.push(h('div.field', {}, [h('label', {}, '备注'), note]));

  PV.Sheet.open({
    title: 'R' + c.r + 'C' + c.c + (p ? ' · ' + p.name : ' · 空格子'),
    sub: where,
    body,
    foot: [
      h('button.btn.ghost', { onclick: () => PV.Sheet.close() }, '关闭'),
      h('button.btn.primary', { onclick: saveNote }, [PV.util.icon('i-save', 15), '保存备注']),
    ],
  });

  function saveNote() {
    const txt = note.value || '';
    const target = PV.Store.cell(cellId);
    if (target) target.note = txt;
    if (PV.Store.online) {
      fetch(PV.API_BASE + 'cells/' + cellId, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: target && target.part_id ? 'SET' : 'CLEAR', qty: target ? target.qty : 0, note: txt }),
      }).then(() => PV.Store.init().then(() => PV.afterChange())).catch(() => {});
      PV.util.toast('ok', '备注已保存');
    } else {
      PV.Offline.save();
      PV.util.toast('ok', '备注已保存（本地）');
    }
    PV.Sheet.close();
  }

  async function doOp(op) {
    const cell = PV.Store.cell(cellId);
    if (op === 'IN' && !cell.part_id) { PV.util.toast('err', '空格子请先「放入新种类」'); PV.Sound.error(); return; }
    if (op === 'OUT' && !cell.part_id) { PV.util.toast('err', '空格子没有东西可取'); PV.Sound.error(); return; }
    const before = cell.qty;
    const n = Math.max(0, Math.floor(Number(qtyState.v) || 0));
    let qty = op === 'SET' ? n : Math.max(1, n);
    if (op === 'OUT') qty = Math.min(qty, before);   // 取不出比现有更多的量

    try {
      await PV.Store.op(cellId, { op, qty });
      const after = PV.Store.cell(cellId).qty;
      const anchor = PV.util.$('.slot[data-cell="' + cellId + '"]');
      PV.util.floatNumber(anchor, after - before);
      if (after > before) PV.Sound.place(); else if (after < before) PV.Sound.take();
      ping(anchor);
      const pp = PV.Store.cell(cellId).part_id ? PV.Store.part(PV.Store.cell(cellId).part_id) : null;
      const label = op === 'IN' ? '放入 ' : op === 'OUT' ? '取出 ' : '设定为 ';
      PV.util.toast(op === 'IN' ? 'in' : op === 'OUT' ? 'out' : 'info',
        label + (op === 'SET' ? after : Math.abs(after - before)) + ' ' + (pp ? pp.unit || '个' : '个'),
        PV.Store.cellWhere(cellId) + '　现有 ' + after);
      PV.afterChange();
      PV.Sheet.close();
      DrawerView.render();
      if (after !== before) setTimeout(() => retriggerPing(cellId), 60);
    } catch (e) {
      PV.Sound.error();
      PV.util.toast('err', '操作失败', e.message);
    }
  }
}

function retriggerPing(cellId) {
  const n = PV.util.$('.slot[data-cell="' + cellId + '"]');
  if (n) ping(n);
}

/* ------------------------------ 选元件 / 选格子 ------------------------------ */

function openPartPicker(opts) {
  const { h } = PV.util;
  const S = PV.Store;
  if (!S.state.parts.length) {
    PV.util.toast('err', '元件库是空的', '请先到「元件库」新增元件');
    return;
  }
  let cat = '';
  let kw = '';
  const list = h('div', { style: 'max-height:46vh;overflow:auto;display:flex;flex-direction:column;gap:6px' });

  const draw = () => {
    list.innerHTML = '';
    const items = S.state.parts.filter((p) => {
      if (cat && p.category_name !== cat) return false;
      if (kw) {
        const hay = (p.name + ' ' + p.spec + ' ' + p.package + ' ' + p.code).toLowerCase();
        if (hay.indexOf(kw.toLowerCase()) === -1) return false;
      }
      return true;
    }).sort((a, b) => b.stock - a.stock);

    if (!items.length) { list.appendChild(h('div.empty', {}, '没有匹配的元件')); return; }
    items.forEach((p) => {
      const row = h('button', {
        style: 'display:flex;align-items:center;gap:11px;padding:9px 11px;border-radius:11px;border:1px solid var(--stroke);background:rgba(255,255,255,.03);text-align:left;transition:all .16s',
        onclick: () => { PV.Modal.close(); opts.onPick(p); },
        onmouseenter: (e) => (e.currentTarget.style.borderColor = 'var(--stroke-hi)'),
        onmouseleave: (e) => (e.currentTarget.style.borderColor = 'var(--stroke)'),
      }, [
        h('div', { style: 'width:40px;height:34px;display:grid;place-items:center;flex:0 0 auto' }, CompArt.node(p.category_icon || CompArt.guessIcon(p.name), p.color, p.id, 36)),
        h('div', { style: 'flex:1;min-width:0' }, [
          h('div', { style: 'font-weight:600;font-size:13px' }, p.name),
          h('div.hint', {}, (p.spec || '—') + ' · ' + (p.package || '—')),
        ]),
        h('div', { style: 'text-align:right;flex:0 0 auto' }, [
          h('div', { style: 'font-weight:700;font-variant-numeric:tabular-nums' }, String(p.stock)),
          h('div.hint', {}, p.unit || '个'),
        ]),
      ]);
      list.appendChild(row);
    });
  };

  const search = h('input', { placeholder: '搜索元件…', oninput: (e) => { kw = e.target.value; draw(); }, style: 'height:36px;padding:0 11px;border-radius:10px;border:1px solid var(--stroke);background:rgba(255,255,255,.045);outline:none' });
  const catRow = h('div.cat-chips');
  const cats = [''].concat(Array.from(new Set(S.state.parts.map((p) => p.category_name).filter(Boolean))));
  cats.forEach((cc) => {
    catRow.appendChild(h('button.cat-chip' + (cat === cc ? '.on' : ''), {
      onclick: (e) => {
        cat = cc;
        PV.util.$$('button', catRow).forEach((b) => b.classList.remove('on'));
        e.currentTarget.classList.add('on');
        draw();
      },
    }, cc || '全部'));
  });

  draw();
  PV.Modal.open({
    title: opts.title || '选择元件',
    sub: opts.sub || '从元件库中选一个',
    wide: true,
    body: [search, catRow, list],
    foot: [h('button.btn.ghost', { onclick: () => PV.Modal.close() }, '取消')],
    onOpen: () => search.focus(),
  });
}

/** 选择元件并把它放进指定格子 */
function choosePartFor(cellId) {
  openPartPicker({
    title: '选择元件种类',
    sub: '选择后该格子会记录这个元件',
    onPick: (p) => {
      const S = PV.Store;
      const cur = S.cell(cellId);
      const defQty = cur.part_id === p.id ? cur.qty : 10;
      const qtyInput = PV.util.h('input', { type: 'number', value: defQty, min: 0, style: 'height:36px;padding:0 11px;border-radius:10px;border:1px solid var(--stroke);background:rgba(255,255,255,.045)' });
      PV.Modal.open({
        title: '放入 · ' + p.name + (p.spec ? ' ' + p.spec : ''),
        sub: PV.Store.cellWhere(cellId),
        body: [
          PV.util.h('div', { style: 'display:flex;gap:12px;align-items:center;padding:6px 0 2px' }, [
            CompArt.node(p.category_icon || CompArt.guessIcon(p.name), p.color, p.id, 54),
            PV.util.h('div', {}, [
              PV.util.h('div', { style: 'font-weight:600' }, p.spec || p.name),
              PV.util.h('div.hint', {}, '全柜现有 ' + p.stock + ' ' + (p.unit || '个') + ' · 阈值 ' + (p.min_stock || '—')),
            ]),
          ]),
          PV.util.h('div.field', {}, [PV.util.h('label', {}, '放入数量'), qtyInput]),
        ],
        foot: [
          PV.util.h('button.btn.ghost', { onclick: () => PV.Modal.close() }, '取消'),
          PV.util.h('button.btn.primary', {
            onclick: async () => {
              const q = Math.max(0, Number(qtyInput.value) || 0);
              PV.Modal.close();
              try {
                await PV.Store.op(cellId, { op: 'ASSIGN', part_id: p.id, qty: q });
                PV.Sound.place();
                PV.util.toast('in', '已放入 ' + q + ' ' + (p.unit || '个'), p.name + ' → ' + PV.Store.cellWhere(cellId));
                PV.afterChange();
                DrawerView.render();
                setTimeout(() => retriggerPing(cellId), 60);
              } catch (e) { PV.Sound.error(); PV.util.toast('err', '放入失败', e.message); }
            },
          }, '确认放入'),
        ],
      });
    },
  });
}

/** 选择目标格子并把当前格子内容挪过去 */
function chooseTargetCell(srcCellId) {
  const { h } = PV.util;
  const S = PV.Store;
  const src = S.cell(srcCellId);
  const srcPart = src.part_id ? S.part(src.part_id) : null;
  if (!srcPart) { PV.util.toast('err', '空格子不需要挪动'); return; }

  const list = h('div', { style: 'max-height:52vh;overflow:auto;display:flex;flex-direction:column;gap:12px' });
  S.state.stacks.forEach((st) => {
    const block = h('div', {}, [
      h('div.hint', { style: 'margin-bottom:6px' }, st.name),
      h('div', { style: 'display:flex;flex-direction:column-reverse;gap:5px' }, S.drawersOf(st.id).map((d) => {
        const row = h('div', { style: 'display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:9px;border:1px solid var(--stroke)' }, [
          h('span', { style: 'min-width:62px;font-size:11.5px;color:var(--text-mute)' }, '第 ' + d.slot + ' 层'),
          h('div', { style: 'display:flex;gap:4px;flex-wrap:wrap;flex:1' }, S.cellsOf(d.id).map((c) => {
            const occupied = c.qty > 0 && c.part_id !== srcPart.id;
            const isSrc = c.id === srcCellId;
            return h('button', {
              disabled: occupied || isSrc,
              title: isSrc ? '当前格子' : occupied ? '已有其它元件' : '可放入',
              style: 'width:38px;height:26px;border-radius:6px;font-size:10px;border:1px solid var(--stroke);' +
                (isSrc ? 'background:rgba(91,140,255,.3);color:#cfe0ff;' : occupied ? 'background:rgba(255,107,129,.14);color:#ffbcc6;cursor:not-allowed;' : 'background:rgba(47,214,168,.12);color:#9ff0da;'),
              onclick: async () => {
                PV.Modal.close();
                try {
                  await PV.Store.op(srcCellId, { op: 'MOVE', target_cell_id: c.id });
                  PV.Sound.place();
                  PV.util.toast('info', '已挪位', '→ ' + PV.Store.cellWhere(c.id));
                  PV.afterChange();
                  PV.go('drawer', { drawerId: c.drawer_id, focusCell: c.id });
                } catch (e) { PV.Sound.error(); PV.util.toast('err', '挪位失败', e.message); }
              },
            }, 'R' + c.r + 'C' + c.c);
          })),
        ]);
        return row;
      })),
    ]);
    list.appendChild(block);
  });

  PV.Modal.open({
    title: '挪到其他格子',
    sub: '当前：' + PV.Store.cellWhere(srcCellId) + ' · ' + src.qty + ' ' + (srcPart.unit || '个'),
    wide: true,
    body: [h('div.hint', {}, '绿色 = 可放入（空或同类元件），红色 = 已被其它元件占用。'), list],
    foot: [h('button.btn.ghost', { onclick: () => PV.Modal.close() }, '取消')],
  });
}

PV.DrawerView = DrawerView;
PV.openCellSheet = openCellSheet;
PV.choosePartFor = choosePartFor;
PV.chooseTargetCell = chooseTargetCell;
PV.openPartPicker = openPartPicker;
PV.ping = ping;
