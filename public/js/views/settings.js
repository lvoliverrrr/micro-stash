/* =========================================================================
   views/settings.js · 仓库信息 / 布局编辑器 / 数据管理 / 统计 / 首次初始化向导
   ========================================================================= */
'use strict';

const SettingsView = {
  model: null,
  sel: null, // {col, idx}

  render() {
    const el = PV.util.$('#view-settings');
    const S = PV.Store;
    const { h } = PV.util;
    el.innerHTML = '';
    this.model = this.buildModel();
    this.sel = null;

    el.appendChild(h('div.section-head', {}, [
      h('h2', {}, '布局与设置'),
      h('span.sub', {}, '按你真实的柜子改：几列、每列几层、每层几行几列'),
    ]));

    const grid = h('div.settings-grid');
    grid.appendChild(this.cardInfo());
    grid.appendChild(this.cardStats());
    grid.appendChild(this.cardData());
    grid.appendChild(this.cardAbout());
    el.appendChild(grid);

    const layoutCard = this.cardLayout();
    el.appendChild(h('div', { style: 'margin-top:16px' }, layoutCard));
  },

  buildModel() {
    const S = PV.Store;
    return S.state.stacks.map((st) => ({
      name: st.name,
      drawers: S.drawersOf(st.id).map((d) => ({ id: d.id, label: d.label, color: d.color, rows: d.rows, cols: d.cols })),
    }));
  },

  /* ---------------- 仓库信息 ---------------- */
  cardInfo() {
    const { h } = PV.util;
    const meta = PV.Store.state.meta || {};
    const nameInput = h('input', { value: meta.cabinet_name || '我的元件柜', maxlength: 24 });
    const opInput = h('input', { value: meta.operator || '', placeholder: '例如：小刘', maxlength: 16 });

    return h('div.card', {}, [
      h('h3', {}, '仓库信息'),
      h('div.card-desc', {}, '显示在顶栏，方便区分不同柜子'),
      h('div.stack-v', {}, [
        h('div.field', {}, [h('label', {}, '柜子名称'), nameInput]),
        h('div.field', {}, [h('label', {}, '当前操作人'), opInput]),
        h('div', {}, h('button.btn.primary', {
          onclick: async () => {
            await PV.Store.setMeta({ cabinet_name: nameInput.value, operator: opInput.value });
            PV.util.toast('ok', '已保存');
            PV.afterChange();
          },
        }, [PV.util.icon('i-save', 15), '保存'])),
      ]),
    ]);
  },

  /* ---------------- 统计 ---------------- */
  cardStats() {
    const { h } = PV.util;
    const S = PV.Store;
    const byCat = {};
    S.state.cells.forEach((c) => {
      if (c.qty > 0 && c.part_id) {
        const p = S.part(c.part_id);
        const key = p ? (p.category_name || '未分类') : '未分类';
        byCat[key] = (byCat[key] || 0) + c.qty;
      }
    });
    const total = Object.keys(byCat).reduce((a, k) => a + byCat[k], 0) || 1;
    const rows = Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]).map((k) => {
      const cat = S.state.categories.find((c) => c.name === k);
      const pct = Math.round((byCat[k] / total) * 100);
      return h('div', { style: 'margin-bottom:9px' }, [
        h('div', { style: 'display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px' }, [
          h('span', {}, k), h('span', { style: 'color:var(--text-mute)' }, byCat[k] + ' 个 · ' + pct + '%'),
        ]),
        h('div', { style: 'height:6px;border-radius:99px;background:rgba(255,255,255,.07);overflow:hidden' },
          h('i', { style: 'display:block;height:100%;width:' + pct + '%;border-radius:99px;background:' + ((cat && cat.color) || '#6ea8fe') })),
      ]);
    });

    const lowList = S.state.parts.filter((p) => p.min_stock > 0 && p.stock <= p.min_stock);
    const lowBox = lowList.length
      ? h('div', { style: 'display:flex;flex-direction:column;gap:5px;max-height:180px;overflow:auto' }, lowList.map((p) =>
          h('button', {
            style: 'display:flex;align-items:center;gap:8px;padding:6px 9px;border-radius:9px;border:1px solid rgba(255,107,129,.28);background:rgba(255,107,129,.07);text-align:left;font-size:12px',
            onclick: () => { const l = S.partLocations(p.id)[0]; if (l) PV.go('drawer', { drawerId: l.drawerId, focusCell: l.cellId }); else PV.go('parts'); },
          }, [
            h('span', { style: 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, p.name + (p.spec ? ' ' + p.spec : '')),
            h('span', { style: 'color:var(--danger);font-weight:700' }, p.stock + '/' + p.min_stock),
          ])
        ))
      : h('div.hint', {}, '暂无低库存元件 👍');

    return h('div.card', {}, [
      h('h3', {}, '库存概览'),
      h('div.card-desc', {}, '按分类统计在库数量，以及需要补货的元件'),
      rows.length ? h('div', {}, rows) : h('div.hint', {}, '还没有任何元件放进柜子'),
      h('div.divider', { style: 'margin:14px 0' }),
      h('h3', { style: 'font-size:13px' }, '需要补货（' + lowList.length + '）'),
      lowBox,
    ]);
  },

  /* ---------------- 数据管理 ---------------- */
  cardData() {
    const { h } = PV.util;
    return h('div.card', {}, [
      h('h3', {}, '数据管理'),
      h('div.card-desc', {}, '所有数据都存在本地 SQLite 里，建议定期导出一份备份'),
      h('div.stack-v', {}, [
        h('button.btn', { onclick: async () => {
          const txt = await PV.Store.exportJSON();
          PV.downloadText(txt, 'partvault-备份-' + PV.util.fmtDate(new Date().toISOString()) + '.json', 'application/json');
          PV.util.toast('ok', '已导出备份');
        } }, [PV.util.icon('i-download', 15), '导出 JSON 备份']),

        h('button.btn', { onclick: () => {
          const fi = PV.util.$('#file-input');
          fi.value = '';
          fi.onchange = async () => {
            const f = fi.files[0];
            if (!f) return;
            const text = await f.text();
            const mode = await PV.util.confirmDialog({
              title: '导入方式',
              message: '点「确定」= 覆盖导入（清空现有数据后导入备份）\n点「取消」= 合并导入（保留现有数据，重名元件会更新）',
              okText: '覆盖导入',
            }) ? 'replace' : 'merge';
            try {
              await PV.Store.importJSON(text, mode);
              PV.util.toast('ok', '导入完成', mode === 'replace' ? '已覆盖' : '已合并');
              PV.afterChange();
              SettingsView.render();
            } catch (e) { PV.util.toast('err', '导入失败', e.message); }
          };
          fi.click();
        } }, [PV.util.icon('i-upload', 15), '导入 JSON 备份']),

        h('div.divider'),
        h('button.btn.warn', { onclick: () => {
          PV.util.confirmDialog({
            title: '重置货架',
            message: '把所有格子的东西清空、流水清空，并恢复成默认的 4 列布局。\n元件库（种类）会保留。确定吗？',
            danger: true, okText: '重置',
          }).then(async (y) => {
            if (!y) return;
            await PV.Store.reset('shelf');
            PV.util.toast('ok', '货架已重置');
            PV.afterChange(); SettingsView.render();
          });
        } }, [PV.util.icon('i-refresh', 15), '重置货架（保留元件库）']),

        h('button.btn.danger', { onclick: () => {
          PV.util.confirmDialog({
            title: '恢复出厂设置',
            message: '会删除全部数据：元件库、货架、格子内容、流水，全部清空并重新初始化。\n此操作不可撤销，建议先导出备份。确定吗？',
            danger: true, okText: '全部清空',
          }).then(async (y) => {
            if (!y) return;
            await PV.Store.reset('factory');
            PV.util.toast('ok', '已恢复出厂设置');
            PV.afterChange(); SettingsView.render();
          });
        } }, [PV.util.icon('i-trash', 15), '恢复出厂设置（全部清空）']),
      ]),
    ]);
  },

  /* ---------------- 关于 ---------------- */
  cardAbout() {
    const { h } = PV.util;
    return h('div.card', {}, [
      h('h3', {}, '关于 · 数据存放在哪'),
      h('div.card-desc', {}, 'PartVault 是一个「微型数据库 + 实物货架可视化」的本地程序'),
      h('div.stack-v', {}, [
        h('div', { style: 'font-size:12px;color:var(--text-dim);line-height:1.9' }, [
          h('div', {}, [h('b', {}, '数据库：'), h('code', { style: 'font-size:11.5px;word-break:break-all' }, PV.Store.dbPath)]),
          h('div', {}, [h('b', {}, '运行模式：'), PV.Store.online ? 'SQLite 后端（数据持久化到磁盘）' : '浏览器本地存储（离线演示模式）']),
          h('div', {}, [h('b', {}, '元件种类 / 格子：'), S_count()]),
        ]),
        PV.Store.online ? null : h('div.hint', { style: 'color:var(--accent-3)' },
          '当前是离线模式：数据只保存在浏览器里。双击项目里的「启动PartVault.bat」即可启用真正的 SQLite 数据库。'),
        h('button.btn.sm', { onclick: () => location.reload() }, [PV.util.icon('i-refresh', 13), '重新连接数据库']),
      ]),
    ]);

    function S_count() {
      const S = PV.Store;
      return S.state.parts.length + ' 种 / ' + S.state.cells.length + ' 格（' + S.state.drawers.length + ' 抽屉）';
    }
  },

  /* ---------------- 布局编辑器 ---------------- */
  cardLayout() {
    const { h } = PV.util;
    const self = this;

    const wrap = h('div.card', {}, [
      h('h3', {}, '货架布局编辑器'),
      h('div.card-desc', {}, '点抽屉可以选中它，在下方改颜色和格子行列；拖不了不要紧，用「+ 加一列 / + 加一层」'),
    ]);

    const bar = h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px' }, [
      h('button.btn.sm', { onclick: () => { self.model.push({ name: '列 ' + String.fromCharCode(65 + self.model.length), drawers: [self.newDrawer()] }); self.render2(); } },
        [PV.util.icon('i-plus', 13), '加一列']),
      h('button.btn.sm', { onclick: () => {
        const n = Number(prompt('每列增加几层？', '1')) || 0;
        self.model.forEach((c) => { for (let i = 0; i < n; i++) c.drawers.push(self.newDrawer(c)); });
        self.render2();
      } }, [PV.util.icon('i-plus', 13), '每列加层']),
      h('button.btn.sm', { onclick: () => {
        const n = Number(prompt('每列减少几层？（至少保留 1 层）', '1')) || 0;
        self.model.forEach((c) => { c.drawers = c.drawers.slice(0, Math.max(1, c.drawers.length - n)); });
        self.render2();
      } }, [PV.util.icon('i-minus', 13), '每列减层']),
      h('div', { style: 'margin-left:auto;display:flex;gap:8px' }, [
        h('button.btn.sm.ghost', { onclick: () => { self.model = self.buildModel(); self.sel = null; self.render2(); } }, '还原'),
        h('button.btn.sm.primary', { onclick: () => self.saveLayout() }, [PV.util.icon('i-save', 13), '保存布局']),
      ]),
    ]);

    const canvas = h('div', { id: 'le-canvas' });
    wrap.appendChild(bar);
    wrap.appendChild(canvas);
    this.canvas = canvas;
    setTimeout(() => this.render2(), 0);
    return wrap;
  },

  newDrawer(col) {
    const n = (col && col.drawers.length) || 0;
    const base = col && col.drawers[n - 1];
    return { id: null, label: '', color: base ? base.color : 'white', rows: base ? base.rows : 4, cols: base ? base.cols : 3 };
  },

  render2() {
    const { h } = PV.util;
    const box = this.canvas;
    if (!box) return;
    box.innerHTML = '';

    const preview = h('div.layout-preview', {}, this.model.map((col) =>
      h('div.lp-stack', {}, col.drawers.map((d) => h('div.lp-drawer.' + (d.color || 'white'))))
    ));
    box.appendChild(h('div', { style: 'margin-bottom:12px' }, preview));

    const editor = h('div.layout-editor', {}, this.model.map((col, ci) => {
      const head = h('div.le-head', {}, [
        h('input', { value: col.name, oninput: (e) => (col.name = e.target.value), style: 'flex:1' }),
        h('button.btn.xs.ghost', { title: '删除该列', onclick: () => {
          if (this.model.length <= 1) { PV.util.toast('err', '至少要保留一列'); return; }
          this.model.splice(ci, 1); this.sel = null; this.render2();
        } }, PV.util.icon('i-trash', 12)),
      ]);
      const drawers = h('div.le-drawers', {}, col.drawers.map((d, idx) => {
        const isSel = this.sel && this.sel.ci === ci && this.sel.di === idx;
        return h('div.le-drawer' + (isSel ? '.sel' : ''), {
          dataset: { color: d.color || 'white' },
          title: '点击选中；再点一次换颜色',
          onclick: () => {
            if (isSel) {
              const colors = ['white', 'black', 'gray', 'blue', 'amber'];
              d.color = colors[(colors.indexOf(d.color || 'white') + 1) % colors.length];
              this.render2();
            } else {
              this.sel = { ci, di: idx };
              this.render2();
            }
          },
        }, [
          h('span', {}, '第 ' + (idx + 1) + ' 层'),
          h('span', { style: 'opacity:.75' }, d.rows + '×' + d.cols),
        ]);
      }));
      const foot = h('div', { style: 'display:flex;gap:5px;margin-top:8px' }, [
        h('button.btn.xs', { style: 'flex:1', onclick: () => { col.drawers.push(this.newDrawer(col)); this.render2(); } }, '+ 层'),
        h('button.btn.xs', { style: 'flex:1', onclick: () => {
          if (col.drawers.length <= 1) { PV.util.toast('err', '至少保留一层'); return; }
          col.drawers.pop(); this.sel = null; this.render2();
        } }, '− 层'),
      ]);
      return h('div.le-col', {}, [head, drawers, foot]);
    }));
    box.appendChild(editor);

    /* 选中抽屉的属性 */
    if (this.sel) {
      const col = this.model[this.sel.ci];
      const d = col && col.drawers[this.sel.di];
      if (!d) { this.sel = null; return; }
      const colorSel = h('select', { onchange: (e) => { d.color = e.target.value; this.render2(); } },
        [['white', '白色'], ['black', '黑色'], ['gray', '灰色'], ['blue', '蓝色'], ['amber', '橙色']].map((o) =>
          h('option', { value: o[0], selected: d.color === o[0] }, o[1])));
      const rowsIn = h('input', { type: 'number', min: 1, max: 10, value: d.rows, oninput: (e) => (d.rows = PV.util.clampNum(e.target.value, 1, 10)) });
      const colsIn = h('input', { type: 'number', min: 1, max: 10, value: d.cols, oninput: (e) => (d.cols = PV.util.clampNum(e.target.value, 1, 10)) });
      const labelIn = h('input', { value: d.label || '', placeholder: '例如：常用电容', oninput: (e) => (d.label = e.target.value) });

      box.appendChild(h('div', { style: 'margin-top:14px;padding:14px;border-radius:14px;border:1px solid var(--stroke-hi);background:rgba(91,140,255,.06)' }, [
        h('div', { style: 'display:flex;align-items:center;gap:10px;margin-bottom:12px' }, [
          PV.util.icon('i-edit', 15),
          h('b', {}, col.name + ' · 第 ' + (this.sel.di + 1) + ' 层'),
          h('button.btn.xs.ghost', { style: 'margin-left:auto', onclick: () => { this.sel = null; this.render2(); } }, '取消选中'),
        ]),
        h('div.form-grid', {}, [
          h('div.field', {}, [h('label', {}, '抽屉名称'), labelIn]),
          h('div.field', {}, [h('label', {}, '外观颜色'), colorSel]),
          h('div.field', {}, [h('label', {}, '格子行数（前后）'), rowsIn]),
          h('div.field', {}, [h('label', {}, '格子列数（左右）'), colsIn]),
        ]),
      ]));
    }
  },

  async saveLayout() {
    const self = this;
    const bad = this.model.some((c) => !String(c.name || '').trim() || !c.drawers.length);
    if (bad) { PV.util.toast('err', '请检查：每列都需要名称且至少一层'); return; }
    const payload = this.model.map((c) => ({
      name: c.name,
      drawers: c.drawers.map((d) => ({ id: d.id || undefined, label: d.label || '', color: d.color || 'white', rows: d.rows || 4, cols: d.cols || 3 })),
    }));
    await PV.Store.saveLayout(payload, '在设置中调整了货架布局');
    PV.Sound.success();
    PV.util.toast('ok', '布局已保存', this.model.length + ' 列 · ' + this.model.reduce((a, c) => a + c.drawers.length, 0) + ' 抽屉');
    PV.afterChange();
    self.render();
  },
};

/* =========================================================================
   首次初始化向导
   ========================================================================= */

const Wizard = {
  step: 1,
  data: { name: '我的元件柜', operator: '', cols: 4, perCol: 5, rows: 4, colsPerDrawer: 3 },

  open() {
    this.step = 1;
    this.paint();
  },

  paint() {
    const { h } = PV.util;
    const d = this.data;
    const body = [];

    if (this.step === 1) {
      body.push(h('div', { style: 'text-align:center;padding:8px 0 4px' }, [
        h('div', { style: 'width:60px;height:60px;margin:0 auto 14px;border-radius:18px;display:grid;place-items:center;background:linear-gradient(140deg,var(--accent),var(--accent-2));box-shadow:0 12px 30px rgba(91,140,255,.4)' },
          PV.util.icon('i-layers', 30)),
        h('b', { style: 'font-size:16px;display:block;margin-bottom:6px' }, '欢迎使用 PartVault'),
        h('p.hint', { style: 'max-width:400px;margin:0 auto' }, '它把你真实的元件柜搬进了屏幕：列 → 抽屉 → 格子 → 元件种类。每次取出、放入都会记一笔账。'),
      ]));
      body.push(h('div.form-grid', {}, [
        h('div.field.full', {}, [h('label', {}, '给你的柜子起个名字'), h('input', { value: d.name, oninput: (e) => (d.name = e.target.value) })]),
        h('div.field.full', {}, [h('label', {}, '你的名字（可空）'), h('input', { value: d.operator, placeholder: '例如：小刘', oninput: (e) => (d.operator = e.target.value) })]),
      ]));
    }

    if (this.step === 2) {
      body.push(h('p.hint', {}, '按实物填：照片里大约 4 列，每列 4~5 层，每层抽屉内部是 4 行 × 3 列 的小格。'));
      body.push(h('div.form-grid', {}, [
        h('div.field', {}, [h('label', {}, '一共几列'), h('input', { type: 'number', min: 1, max: 12, value: d.cols, oninput: (e) => { d.cols = PV.util.clampNum(e.target.value, 1, 12); this.paintPreview(); } })]),
        h('div.field', {}, [h('label', {}, '每列几层抽屉'), h('input', { type: 'number', min: 1, max: 12, value: d.perCol, oninput: (e) => { d.perCol = PV.util.clampNum(e.target.value, 1, 12); this.paintPreview(); } })]),
        h('div.field', {}, [h('label', {}, '每个抽屉几行'), h('input', { type: 'number', min: 1, max: 10, value: d.rows, oninput: (e) => { d.rows = PV.util.clampNum(e.target.value, 1, 10); this.paintPreview(); } })]),
        h('div.field', {}, [h('label', {}, '每个抽屉几列'), h('input', { type: 'number', min: 1, max: 10, value: d.colsPerDrawer, oninput: (e) => { d.colsPerDrawer = PV.util.clampNum(e.target.value, 1, 10); this.paintPreview(); } })]),
      ]));
      body.push(h('div', { id: 'wiz-preview' }));
    }

    if (this.step === 3) {
      const n = PV.Store.state.parts.length;
      body.push(h('div', { style: 'display:flex;gap:14px;align-items:center;padding:6px 0' }, [
        h('div', { style: 'width:52px;height:52px;border-radius:15px;display:grid;place-items:center;background:rgba(47,214,168,.14);color:var(--in);flex:0 0 auto' }, PV.util.icon('i-check', 26)),
        h('div', {}, [
          h('b', { style: 'display:block;font-size:14px' }, '元件库已经准备好了'),
          h('span.hint', {}, '系统预置了 ' + n + ' 种常见元件（电容/电阻/二极管/IC/排针…），你可以直接用，也可以随时增删。'),
        ]),
      ]));
      body.push(h('div.panel', { style: 'padding:14px' }, [
        h('div.hint', { style: 'margin-bottom:8px' }, '接下来怎么用：'),
        h('ol', { style: 'margin:0;padding-left:18px;font-size:12.5px;line-height:2' }, [
          h('li', {}, '在「我的货架」里点一个抽屉，看到 12 个小格'),
          h('li', {}, '点空格子 → 选择元件 → 填入数量，就完成了「初始化录入」'),
          h('li', {}, '以后拿东西就点「取出」，放回去就点「放入」，都会自动记账'),
          h('li', {}, '底部「出入库流水」能查每一笔历史'),
        ]),
      ]));
      const dim = PV.Store.online ? '' : '（当前是离线演示模式：运行项目里的 start.bat / start.sh 可启用 SQLite 数据库）';
      if (dim) body.push(h('p.hint', { style: 'color:var(--accent-3)' }, dim));
    }

    PV.Modal.open({
      title: this.step === 1 ? '初始化 · 第 1 步，共 3 步' : this.step === 2 ? '初始化 · 第 2 步，共 3 步' : '初始化 · 完成',
      sub: this.step === 1 ? '先认识一下你的柜子' : this.step === 2 ? '告诉我柜子的结构' : '一切就绪',
      wide: true,
      body: [h('div.steps', {}, [1, 2, 3].map((i) => h('i' + (this.step >= i ? '.on' : ''))))].concat(body),
      foot: [
        this.step > 1 ? h('button.btn.ghost', { onclick: () => { this.step--; this.paint(); } }, '上一步') : h('button.btn.ghost', { onclick: () => { PV.Modal.close(); PV.Store.setMeta({ initialized: '1' }); } }, '跳过'),
        this.step < 3
          ? h('button.btn.primary', { onclick: () => { this.step++; this.paint(); } }, '下一步')
          : h('button.btn.primary', { onclick: () => this.finish() }, [PV.util.icon('i-check', 15), '开始使用']),
      ],
      onOpen: () => { if (this.step === 2) this.paintPreview(); },
    });
  },

  paintPreview() {
    const box = PV.util.$('#wiz-preview');
    if (!box) return;
    const d = this.data;
    box.innerHTML = '';
    box.appendChild(PV.util.h('div', { style: 'margin-top:6px' }, [
      PV.util.h('div.hint', { style: 'margin-bottom:6px' }, '预览：' + d.cols + ' 列 × ' + d.perCol + ' 层 × ' + (d.rows * d.colsPerDrawer) + ' 格 = 共 ' + (d.cols * d.perCol * d.rows * d.colsPerDrawer) + ' 个格子'),
      PV.util.h('div.layout-preview', {}, new Array(d.cols).fill(0).map((_, i) =>
        PV.util.h('div.lp-stack', {}, new Array(d.perCol).fill(0).map(() => PV.util.h('div.lp-drawer' + (i % 2 ? '.black' : ''))))
      )),
    ]));
  },

  async finish() {
    const d = this.data;
    const stacks = [];
    for (let i = 0; i < d.cols; i++) {
      const drawers = [];
      for (let k = 0; k < d.perCol; k++) {
        drawers.push({ label: '', color: k < Math.ceil(d.perCol / 2) ? 'white' : 'black', rows: d.rows, cols: d.colsPerDrawer });
      }
      stacks.push({ name: '列 ' + String.fromCharCode(65 + i), color: 'shell', drawers });
    }
    await PV.Store.saveLayout(stacks, '初始化向导生成货架');
    await PV.Store.setMeta({ initialized: '1', cabinet_name: d.name || '我的元件柜', operator: d.operator || '' });
    PV.Modal.close();
    PV.Sound.success();
    PV.util.toast('ok', '初始化完成', d.cols + ' 列 · ' + (d.cols * d.perCol) + ' 个抽屉');
    PV.afterChange();
    PV.go('cabinet');
  },
};

PV.SettingsView = SettingsView;
PV.Wizard = Wizard;
