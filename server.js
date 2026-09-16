#!/usr/bin/env node
/* =========================================================================
 *  PartVault · 电子元件收纳管理系统
 *  零依赖后端：node:http + node:sqlite（Node 22.5+ 内置 SQLite）
 *
 *  设计目标：把「实物货架」原样映射成一张微型数据库
 *     列(stack) → 抽屉(drawer) → 格(cell) → 元件种类(part)
 *  所有「取出 / 放入 / 换种类 / 挪位」都写成一条 moves 流水，可回溯。
 * ========================================================================= */
'use strict';

/* ---- 抑制 node:sqlite 的实验性警告，保持控制台干净 ---- */
const _emit = process.emit;
process.emit = function (name, data, ...rest) {
  if (name === 'warning' && data && String(data.name || '').indexOf('ExperimentalWarning') !== -1) return false;
  return _emit.call(process, name, data, ...rest);
};

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/* ---- 版本自检：node:sqlite 从 Node 22.5 起内置 ----
 * 注意版本细节（容易踩坑）：
 *   v22.5.0  引入 node:sqlite，但**必须**加 --experimental-sqlite
 *   v22.13.0 / v23.4.0  起不再需要该 flag
 * 所以 22.5~22.12 的用户会直接报「找不到模块」。这里自动补上 flag 重启自己，
 * 让「双击 start.bat / 跑 start.sh / 直接 node server.js」三条路径都能直接跑通。 */
let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  const v = process.versions.node;
  const p = String(v).split('.');
  const maj = Number(p[0]);
  const min = Number(p[1]);
  const supportsFlag = !Number.isNaN(maj) && (maj > 22 || (maj === 22 && min >= 5));
  const triedFlag = process.execArgv.includes('--experimental-sqlite');

  /* 22.5~22.12：模块在，只是被 flag 挡着 → 加上 flag 重新拉起自己 */
  if (supportsFlag && !triedFlag) {
    const { spawnSync } = require('node:child_process');
    console.log('  检测到 Node v' + v + '：node:sqlite 需要 --experimental-sqlite，正在自动重启…');
    const r = spawnSync(
      process.execPath,
      ['--experimental-sqlite'].concat(process.execArgv, [__filename], process.argv.slice(2)),
      { stdio: 'inherit', env: process.env }
    );
    process.exit(r.status === null || r.status === undefined ? 1 : r.status);
  }

  const line = '  ' + '='.repeat(58);
  console.error('');
  console.error(line);
  console.error('    PartVault · 启动失败');
  console.error(line);
  console.error('    当前 Node.js : v' + v);
  console.error('    需要的版本   : 22.5 或更高（推荐 22.13+ / 20.x 之外的 LTS）');
  console.error('');
  if (!supportsFlag) {
    console.error('    原因：本项目用 Node 内置的 node:sqlite 存数据，');
    console.error('          这个模块从 Node 22.5 才开始提供。');
    console.error('');
    console.error('    怎么修：到 https://nodejs.org/ 下载 LTS 版，');
    console.error('            覆盖安装即可，不用先卸载旧版。');
  } else {
    console.error('    原因：版本够新，但加载 node:sqlite 仍然失败。');
    console.error('          多半是装了多个 Node，或安装不完整。');
    console.error('          详细信息：' + e.message);
  }
  console.error('');
  console.error('    查当前版本：node -v');
  console.error(line);
  console.error('');
  process.exit(1);
}

/* ============================== 配置 ============================== */

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');

const argv = process.argv.slice(2);
function argOf(flag) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}
let PORT = Number(argOf('--port') || process.env.PORT || 7788);

/* ============================== 工具 ============================== */

const nowISO = () => new Date().toISOString();
const num = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const str = (v, d = '') => (v === undefined || v === null ? d : String(v));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

/* ============================== 数据库位置探测 ==============================
 * 坑：SQLite 需要文件级锁，而 WSL 的 \\wsl.localhost\... 走 9p 协议，
 *     在 Windows 侧完全拿不到锁 —— 会直接报 "database is locked"。
 *     所以启动时先探测候选目录，挑第一个「能锁」的落盘位置。
 * ========================================================================= */

function probeDir(dir) {
  const probe = path.join(dir, '.pv_probe_' + process.pid + '.db');
  try {
    ensureDir(dir);
    fs.writeFileSync(path.join(dir, '.pv_write_test'), 'ok');
    fs.rmSync(path.join(dir, '.pv_write_test'), { force: true });
  } catch (e) {
    return { ok: false, why: '目录不可写' };
  }
  let d;
  try {
    d = new DatabaseSync(probe);
    d.exec('CREATE TABLE IF NOT EXISTS p(a INTEGER)');
    d.exec('BEGIN');
    d.prepare('INSERT INTO p(a) VALUES(?)').run(1);
    d.exec('COMMIT');
    if (d.prepare('SELECT COUNT(*) AS n FROM p').get().n !== 1) throw new Error('读写校验失败');
    d.close();
    return { ok: true };
  } catch (e) {
    try { d && d.close(); } catch (_) {}
    return { ok: false, why: e.message };
  } finally {
    ['', '-journal', '-wal', '-shm'].forEach((s) => {
      try { fs.rmSync(probe + s, { force: true }); } catch (_) {}
    });
  }
}

const DATA_CANDIDATES = [
  process.env.PV_DATA_DIR,
  path.join(ROOT, 'data'),
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'PartVault') : null,
  path.join(os.homedir(), '.partvault'),
  path.join(os.tmpdir(), 'partvault-data'),
].filter(Boolean);

let DATA_DIR = DATA_CANDIDATES[0];
const PROBE_LOG = [];
for (const cand of DATA_CANDIDATES) {
  const r = probeDir(cand);
  PROBE_LOG.push({ dir: cand, ok: r.ok, why: r.why || '' });
  if (r.ok) {
    DATA_DIR = cand;
    break;
  }
}
const DB_PATH = path.join(DATA_DIR, 'vault.db');

/* ============================== 数据库 ============================== */

const db = new DatabaseSync(DB_PATH);
// 注意：数据库可能位于 WSL / 网络盘（9p、SMB）上，WAL 在部分网络文件系统会报
// “database is locked”，因此这里退回默认的 DELETE 日志模式，并放宽锁等待。
try {
  db.exec('PRAGMA busy_timeout = 8000;');
} catch (_) {}
try {
  db.exec('PRAGMA journal_mode = DELETE;');
} catch (_) {}
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS categories (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT NOT NULL UNIQUE,
  icon  TEXT DEFAULT 'box',
  color TEXT DEFAULT '#6ea8fe',
  sort  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS parts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT UNIQUE,
  name        TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  spec        TEXT DEFAULT '',
  package     TEXT DEFAULT '',
  unit        TEXT DEFAULT '个',
  color       TEXT DEFAULT '#6ea8fe',
  min_stock   INTEGER DEFAULT 0,
  note        TEXT DEFAULT '',
  created_at  TEXT,
  updated_at  TEXT
);

CREATE TABLE IF NOT EXISTS stacks (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  name     TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  color    TEXT DEFAULT 'shell',
  note     TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS drawers (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  stack_id INTEGER NOT NULL REFERENCES stacks(id) ON DELETE CASCADE,
  slot     INTEGER NOT NULL,          -- 层号，从下往上 1..n
  label    TEXT DEFAULT '',
  color    TEXT DEFAULT 'white',
  rows     INTEGER DEFAULT 4,
  cols     INTEGER DEFAULT 3,
  note     TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS cells (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  drawer_id INTEGER NOT NULL REFERENCES drawers(id) ON DELETE CASCADE,
  r         INTEGER NOT NULL,
  c         INTEGER NOT NULL,
  label     TEXT DEFAULT '',
  part_id   INTEGER REFERENCES parts(id) ON DELETE SET NULL,
  qty       INTEGER DEFAULT 0,
  note      TEXT DEFAULT '',
  UNIQUE (drawer_id, r, c)
);

CREATE TABLE IF NOT EXISTS moves (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         TEXT NOT NULL,
  kind       TEXT NOT NULL,           -- IN / OUT / SET / ASSIGN / CLEAR / MOVE / LAYOUT / PART
  part_id    INTEGER,
  part_name  TEXT DEFAULT '',
  cell_id    INTEGER,
  from_cell  INTEGER,
  drawer_id  INTEGER,
  qty        INTEGER DEFAULT 0,
  before_qty INTEGER DEFAULT 0,
  after_qty  INTEGER DEFAULT 0,
  note       TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_cells_drawer ON cells(drawer_id);
CREATE INDEX IF NOT EXISTS idx_cells_part   ON cells(part_id);
CREATE INDEX IF NOT EXISTS idx_drawers_stack ON drawers(stack_id);
CREATE INDEX IF NOT EXISTS idx_moves_ts     ON moves(ts DESC);
CREATE INDEX IF NOT EXISTS idx_moves_part   ON moves(part_id);
`);

/* ---------- meta 读写 ---------- */
function getMeta(key, dflt = null) {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? row.value : dflt;
}
function setMeta(key, value) {
  db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(
    String(key),
    String(value)
  );
}

/* ============================== 种子数据 ============================== */

const SEED_CATEGORIES = [
  ['电容', 'cap', '#5ec8f7'],
  ['电阻', 'resistor', '#f7a45e'],
  ['电感磁珠', 'coil', '#c08cf7'],
  ['二极管', 'diode', '#f76e8a'],
  ['三极管/MOS', 'transistor', '#ffcf5e'],
  ['集成电路', 'chip', '#6ea8fe'],
  ['晶振/时钟', 'clock', '#7ee0c0'],
  ['连接器/排针', 'plug', '#9aa4b2'],
  ['开关/按键', 'switch', '#f78fd0'],
  ['电源/电池', 'power', '#8fd76e'],
  ['传感器', 'sensor', '#63d3c8'],
  ['结构件/其他', 'misc', '#a8b3c2'],
];

// 常见元件库（可直接用，也可自行增删）
const SEED_PARTS = [
  // [名称, 分类, 规格, 封装, 单位, 阈值]
  ['电解电容', '电容', '1000μF 16V', '直插 D8×12', '个', 10],
  ['电解电容', '电容', '470μF 25V', '直插 D8×12', '个', 10],
  ['电解电容', '电容', '220μF 50V', '直插 D8×12', '个', 10],
  ['电解电容', '电容', '100μF 25V', '直插 D6.3×11', '个', 10],
  ['电解电容', '电容', '47μF 50V', '直插 D6.3×11', '个', 10],
  ['电解电容', '电容', '10μF 50V', '直插 D5×11', '个', 10],
  ['瓷片电容', '电容', '104 (100nF)', '直插', '个', 50],
  ['瓷片电容', '电容', '103 (10nF)', '直插', '个', 50],
  ['独石电容', '电容', '105 (1μF)', '直插', '个', 30],
  ['CBB 电容', '电容', '630V 104', '直插', '个', 10],
  ['钽电容', '电容', '10μF 16V', '贴片 3216', '个', 20],
  ['金属膜电阻', '电阻', '1/4W 1kΩ', '直插', '个', 50],
  ['金属膜电阻', '电阻', '1/4W 10kΩ', '直插', '个', 50],
  ['金属膜电阻', '电阻', '1/4W 100Ω', '直插', '个', 50],
  ['金属膜电阻', '电阻', '1/4W 4.7kΩ', '直插', '个', 50],
  ['金属膜电阻', '电阻', '1/4W 220Ω', '直插', '个', 50],
  ['金属膜电阻', '电阻', '1/4W 1MΩ', '直插', '个', 30],
  ['贴片电阻', '电阻', '0805 各类阻值', '贴片 0805', '个', 100],
  ['电位器', '电阻', '10kΩ 单联', '直插 3296', '个', 5],
  ['光敏电阻', '电阻', 'GL5528', '直插', '个', 5],
  ['工字电感', '电感磁珠', '10μH', '直插', '个', 10],
  ['工字电感', '电感磁珠', '100μH', '直插', '个', 10],
  ['色环电感', '电感磁珠', '1mH', '直插', '个', 10],
  ['磁珠', '电感磁珠', '120Ω @100MHz', '贴片 0603', '个', 50],
  ['整流二极管', '二极管', '1N4007', 'DO-41', '个', 50],
  ['开关二极管', '二极管', '1N4148', 'DO-35', '个', 50],
  ['肖特基二极管', '二极管', 'SS34', 'SMA', '个', 20],
  ['稳压二极管', '二极管', '1N4733 5.1V', 'DO-41', '个', 20],
  ['发光二极管', '二极管', '5mm 红', '直插', '个', 30],
  ['发光二极管', '二极管', '5mm 绿', '直插', '个', 30],
  ['发光二极管', '二极管', '5mm 蓝', '直插', '个', 30],
  ['桥式整流', '二极管', 'MB10S / KBP307', 'DIP-4', '个', 10],
  ['三极管', '三极管/MOS', 'S8050 (NPN)', 'TO-92', '个', 30],
  ['三极管', '三极管/MOS', 'S8550 (PNP)', 'TO-92', '个', 30],
  ['MOS 管', '三极管/MOS', 'IRF540N', 'TO-220', '个', 10],
  ['MOS 管', '三极管/MOS', 'AO3400', 'SOT-23', '个', 30],
  ['三端稳压', '集成电路', 'L7805 5V', 'TO-220', '个', 10],
  ['三端稳压', '集成电路', 'AMS1117-3.3', 'SOT-223', '个', 20],
  ['运放', '集成电路', 'LM358', 'DIP-8', '个', 10],
  ['比较器', '集成电路', 'LM393', 'DIP-8', '个', 10],
  ['555 定时器', '集成电路', 'NE555', 'DIP-8', '个', 10],
  ['单片机', '集成电路', 'STM32F103C8T6', 'LQFP-48', '个', 3],
  ['单片机', '集成电路', 'ATmega328P', 'DIP-28', '个', 3],
  ['单片机', '集成电路', 'ESP32-WROOM-32', '模组', '个', 3],
  ['单片机', '集成电路', 'ESP8266 ESP-12F', '模组', '个', 3],
  ['驱动芯片', '集成电路', 'ULN2003', 'DIP-16', '个', 10],
  ['移位寄存器', '集成电路', '74HC595', 'DIP-16', '个', 10],
  ['晶振', '晶振/时钟', '8MHz', 'HC-49S', '个', 10],
  ['晶振', '晶振/时钟', '16MHz', 'HC-49S', '个', 10],
  ['晶振', '晶振/时钟', '32.768kHz', '圆柱 2×6', '个', 10],
  ['陶瓷谐振器', '晶振/时钟', '16MHz', '直插 3 脚', '个', 10],
  ['排针', '连接器/排针', '1×40P 2.54mm', '直插', '排', 10],
  ['排母', '连接器/排针', '1×40P 2.54mm', '直插', '排', 10],
  ['排针', '连接器/排针', '1×40P 2.54mm 弯针', '直插', '排', 5],
  ['杜邦线', '连接器/排针', '20cm 母母', '成品', '条', 40],
  ['USB 母座', '连接器/排针', 'Type-A / Micro-USB', '直插', '个', 10],
  ['DC 电源座', '连接器/排针', 'DC-005 5.5×2.1', '直插', '个', 10],
  ['IC 座', '连接器/排针', 'DIP-8 / DIP-16', '直插', '个', 10],
  ['轻触开关', '开关/按键', '6×6×5 直插', '直插', '个', 30],
  ['拨动开关', '开关/按键', 'SS-12D00 3 脚', '直插', '个', 20],
  ['自锁开关', '开关/按键', '8.5×8.5 双联', '直插', '个', 10],
  ['船型开关', '开关/按键', 'KCD1 2 脚', '面板', '个', 5],
  ['保险丝', '电源/电池', '玻璃管 5×20 2A', '直插', '个', 10],
  ['保险丝座', '电源/电池', '5×20 面板式', '面板', '个', 5],
  ['电池', '电源/电池', '18650 锂电池', '成品', '节', 2],
  ['电池盒', '电源/电池', '18650 单节', '成品', '个', 2],
  ['纽扣电池', '电源/电池', 'CR2032 / 带座', '成品', '个', 5],
  ['光耦', '集成电路', 'PC817 / EL817', 'DIP-4', '个', 10],
  ['继电器', '结构件/其他', 'SRD-05VDC-SL-C', '直插', '个', 5],
  ['热缩管', '结构件/其他', 'Φ2/3/4mm 混装', '成品', '段', 100],
  ['螺丝包', '结构件/其他', 'M3 混装', '成品', '包', 2],
  ['排线', '连接器/排针', '彩排 40P', '成品', '条', 5],
  ['温湿度传感器', '传感器', 'DHT11 / DHT22', '模组', '个', 3],
  ['超声波模块', '传感器', 'HC-SR04', '模组', '个', 3],
  ['红外接收头', '传感器', 'VS1838B', '直插', '个', 10],
  ['霍尔传感器', '传感器', 'A3144', 'TO-92', '个', 10],
  ['热敏电阻', '传感器', 'NTC 10K B3950', '直插', '个', 10],
  ['电池管理模块', '电源/电池', 'TP4056 带保护', '模组', '个', 5],
  ['升压模块', '电源/电池', 'MT3608 可调', '模组', '个', 5],
  ['降压模块', '电源/电池', 'LM2596 可调', '模组', '个', 5],
];

function seedIfEmpty() {
  const c = db.prepare('SELECT COUNT(*) AS n FROM categories').get().n;
  if (c === 0) {
    const ins = db.prepare('INSERT INTO categories(name,icon,color,sort) VALUES(?,?,?,?)');
    SEED_CATEGORIES.forEach((row, i) => ins.run(row[0], row[1], row[2], i));
  }
  const p = db.prepare('SELECT COUNT(*) AS n FROM parts').get().n;
  if (p === 0) {
    const ins = db.prepare(`INSERT INTO parts(code,name,category_id,spec,package,unit,color,min_stock,note,created_at,updated_at)
                            VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
    const catMap = {};
    db.prepare('SELECT id,name,color FROM categories').all().forEach((r) => (catMap[r.name] = r));
    const ts = nowISO();
    SEED_PARTS.forEach((row, i) => {
      const cat = catMap[row[1]];
      ins.run(
        'PV-' + String(i + 1).padStart(4, '0'),
        row[0],
        cat ? cat.id : null,
        row[2],
        row[3],
        row[4],
        cat ? cat.color : '#6ea8fe',
        row[5],
        '',
        ts,
        ts
      );
    });
  }
  const s = db.prepare('SELECT COUNT(*) AS n FROM stacks').get().n;
  if (s === 0) {
    // 按实照片还原：4 列抽屉组，白/黑混搭
    const layout = [
      { name: '列 A', color: 'shell', drawers: ['white', 'white', 'black', 'black', 'black'] },
      { name: '列 B', color: 'shell', drawers: ['white', 'white', 'black', 'black', 'black'] },
      { name: '列 C', color: 'shell', drawers: ['white', 'white', 'white', 'black'] },
      { name: '列 D', color: 'shell', drawers: ['white', 'white', 'white', 'white'] },
    ];
    applyLayout(layout, '首次初始化：按实照片生成货架');
  }
  if (!getMeta('schema_version')) setMeta('schema_version', '1');
}

/* ============================== 业务逻辑 ============================== */

function applyLayout(stacks, note = '') {
  db.exec('BEGIN');
  try {
    const keepStackIds = [];
    stacks.forEach((st, si) => {
      let stackId = st.id ? num(st.id) : 0;
      const exists = stackId ? db.prepare('SELECT id FROM stacks WHERE id=?').get(stackId) : null;
      if (exists) {
        db.prepare('UPDATE stacks SET name=?, position=?, color=?, note=? WHERE id=?').run(
          str(st.name, '列 ' + (si + 1)),
          si,
          str(st.color, 'shell'),
          str(st.note, ''),
          stackId
        );
      } else {
        const r = db
          .prepare('INSERT INTO stacks(name,position,color,note) VALUES(?,?,?,?)')
          .run(str(st.name, '列 ' + (si + 1)), si, str(st.color, 'shell'), str(st.note, ''));
        stackId = Number(r.lastInsertRowid);
      }
      keepStackIds.push(stackId);

      const keepDrawerIds = [];
      (st.drawers || []).forEach((dr, di) => {
        const rows = clamp(num(dr.rows, 4), 1, 10);
        const cols = clamp(num(dr.cols, 3), 1, 10);
        let drawerId = dr.id ? num(dr.id) : 0;
        const dex = drawerId ? db.prepare('SELECT id FROM drawers WHERE id=?').get(drawerId) : null;
        if (dex) {
          db.prepare('UPDATE drawers SET stack_id=?, slot=?, label=?, color=?, rows=?, cols=?, note=? WHERE id=?').run(
            stackId,
            di + 1,
            str(dr.label, ''),
            str(dr.color, 'white'),
            rows,
            cols,
            str(dr.note, ''),
            drawerId
          );
        } else {
          const r = db
            .prepare('INSERT INTO drawers(stack_id,slot,label,color,rows,cols,note) VALUES(?,?,?,?,?,?,?)')
            .run(stackId, di + 1, str(dr.label, ''), str(dr.color, 'white'), rows, cols, str(dr.note, ''));
          drawerId = Number(r.lastInsertRowid);
        }
        keepDrawerIds.push(drawerId);
        syncCells(drawerId, rows, cols);
      });
      // 删除该列中已不存在的抽屉
      const olds = db.prepare('SELECT id FROM drawers WHERE stack_id=?').all(stackId);
      olds.forEach((o) => {
        if (keepDrawerIds.indexOf(o.id) === -1) db.prepare('DELETE FROM drawers WHERE id=?').run(o.id);
      });
    });
    db.prepare('SELECT id FROM stacks').all().forEach((row) => {
      if (keepStackIds.indexOf(row.id) === -1) db.prepare('DELETE FROM stacks WHERE id=?').run(row.id);
    });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  addMove({ kind: 'LAYOUT', qty: 0, note: note || '调整货架布局' });
}

function syncCells(drawerId, rows, cols) {
  const have = db.prepare('SELECT r,c FROM cells WHERE drawer_id=?').all(drawerId);
  const has = new Set(have.map((h) => h.r + ',' + h.c));
  const ins = db.prepare('INSERT INTO cells(drawer_id,r,c,label,part_id,qty,note) VALUES(?,?,?,?,NULL,0,?)');
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      if (!has.has(r + ',' + c)) ins.run(drawerId, r, c, '', '');
    }
  }
  db.prepare('DELETE FROM cells WHERE drawer_id=? AND (r>? OR c>?)').run(drawerId, rows, cols);
}

function addMove(m) {
  db.prepare(
    `INSERT INTO moves(ts,kind,part_id,part_name,cell_id,from_cell,drawer_id,qty,before_qty,after_qty,note)
     VALUES(?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    m.ts || nowISO(),
    m.kind,
    m.part_id == null ? null : num(m.part_id),
    str(m.part_name, ''),
    m.cell_id == null ? null : num(m.cell_id),
    m.from_cell == null ? null : num(m.from_cell),
    m.drawer_id == null ? null : num(m.drawer_id),
    num(m.qty),
    num(m.before_qty),
    num(m.after_qty),
    str(m.note, '')
  );
}

function partLabel(p) {
  if (!p) return '';
  return p.spec ? p.name + ' ' + p.spec : p.name;
}

function cellOp(body) {
  const op = str(body.op).toUpperCase();
  const cellId = num(body.cell_id ?? body.cellId);
  const cell = db.prepare('SELECT * FROM cells WHERE id=?').get(cellId);
  if (!cell) throw httpError(404, '格子不存在');

  const note = str(body.note, '');
  const ts = body.ts || nowISO();
  const before = num(cell.qty);
  let partId = cell.part_id;
  let after = before;
  let qty = num(body.qty);
  let kind = op;

  const curPart = partId ? db.prepare('SELECT * FROM parts WHERE id=?').get(partId) : null;

  switch (op) {
    case 'IN': {
      if (!partId) throw httpError(400, '这个格子还没有指定元件，请先「放入新种类」');
      if (qty <= 0) throw httpError(400, '数量必须大于 0');
      after = before + qty;
      break;
    }
    case 'OUT': {
      if (!partId) throw httpError(400, '空格子无法取出');
      if (qty <= 0) throw httpError(400, '数量必须大于 0');
      after = Math.max(0, before - qty);
      qty = before - after;
      break;
    }
    case 'SET': {
      if (!partId) throw httpError(400, '请先指定元件种类');
      after = Math.max(0, qty);
      qty = after - before;
      break;
    }
    case 'ASSIGN': {
      const pid = num(body.part_id ?? body.partId);
      const p = db.prepare('SELECT * FROM parts WHERE id=?').get(pid);
      if (!p) throw httpError(400, '元件种类不存在');
      partId = pid;
      after = Math.max(0, qty || before);
      qty = after;
      break;
    }
    case 'CLEAR': {
      partId = null;
      after = 0;
      qty = -before;
      break;
    }
    case 'MOVE': {
      const targetId = num(body.target_cell_id ?? body.targetCellId);
      const target = db.prepare('SELECT * FROM cells WHERE id=?').get(targetId);
      if (!target) throw httpError(400, '目标格子不存在');
      if (targetId === cellId) throw httpError(400, '目标格子与当前格子相同');
      const tPart = target.part_id ? db.prepare('SELECT * FROM parts WHERE id=?').get(target.part_id) : null;
      if (target.part_id && target.part_id !== partId) {
        throw httpError(400, '目标格子已有其他元件（' + partLabel(tPart) + '），请先清空');
      }
      db.prepare('UPDATE cells SET part_id=?, qty=?, note=COALESCE(NULLIF(?,\'\'), note) WHERE id=?').run(
        partId,
        before + num(target.qty),
        str(body.note, ''),
        targetId
      );
      db.prepare('UPDATE cells SET part_id=NULL, qty=0 WHERE id=?').run(cellId);
      addMove({
        ts,
        kind: 'MOVE',
        part_id: partId,
        part_name: partLabel(curPart),
        cell_id: targetId,
        from_cell: cellId,
        drawer_id: cell.drawer_id,
        qty: before,
        before_qty: num(target.qty),
        after_qty: before + num(target.qty),
        note,
      });
      return { ok: true };
    }
    default:
      throw httpError(400, '未知操作：' + op);
  }

  db.prepare('UPDATE cells SET part_id=?, qty=?, note=COALESCE(NULLIF(?,\'\'), note) WHERE id=?').run(
    partId,
    after,
    note,
    cellId
  );

  const newPart = partId ? db.prepare('SELECT * FROM parts WHERE id=?').get(partId) : null;
  addMove({
    ts,
    kind,
    part_id: partId,
    part_name: partLabel(newPart) || partLabel(curPart),
    cell_id: cellId,
    drawer_id: cell.drawer_id,
    qty,
    before_qty: before,
    after_qty: after,
    note,
  });
  return { ok: true, cell_id: cellId, part_id: partId, before, after };
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

/* ============================== 查询组装 ============================== */

function bootstrap() {
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort,id').all();
  const parts = db
    .prepare(
      `SELECT p.*, c.name AS category_name, c.icon AS category_icon,
              COALESCE(s.total,0) AS stock,
              COALESCE(s.cells,0)  AS cell_count
       FROM parts p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN (SELECT part_id, SUM(qty) AS total, COUNT(*) AS cells
                  FROM cells WHERE part_id IS NOT NULL AND qty > 0 GROUP BY part_id) s
         ON s.part_id = p.id
       ORDER BY p.name, p.spec`
    )
    .all();
  const stacks = db.prepare('SELECT * FROM stacks ORDER BY position,id').all();
  const drawers = db.prepare('SELECT * FROM drawers ORDER BY stack_id,slot').all();
  const cells = db
    .prepare(
      `SELECT ce.*, p.name AS part_name, p.spec AS part_spec, p.unit AS part_unit,
              p.color AS part_color, c.name AS category_name, c.icon AS category_icon
       FROM cells ce
       LEFT JOIN parts p ON p.id = ce.part_id
       LEFT JOIN categories c ON c.id = p.category_id`
    )
    .all();
  const moves = db.prepare('SELECT * FROM moves ORDER BY id DESC LIMIT 300').all();
  return {
    ok: true,
    server: { port: PORT, db: DB_PATH, version: getMeta('schema_version', '1') },
    meta: {
      initialized: getMeta('initialized', '0') === '1',
      cabinet_name: getMeta('cabinet_name', '我的元件柜'),
      operator: getMeta('operator', ''),
      theme: getMeta('theme', 'dark'),
      sound: getMeta('sound', '1'),
    },
    categories,
    parts,
    stacks,
    drawers,
    cells,
    moves,
    stats: stats(),
  };
}

function stats() {
  const s = db
    .prepare(
      `SELECT COUNT(*) AS kinds,
              COALESCE(SUM(qty),0) AS pieces
       FROM cells WHERE part_id IS NOT NULL AND qty > 0`
    )
    .get();
  const totalCells = db.prepare('SELECT COUNT(*) AS n FROM cells').get().n;
  const usedCells = db.prepare('SELECT COUNT(*) AS n FROM cells WHERE qty > 0').get().n;
  const drawersTotal = db.prepare('SELECT COUNT(*) AS n FROM drawers').get().n;
  const low = db
    .prepare(
      `SELECT p.id, p.name, p.spec, p.min_stock, COALESCE(SUM(c.qty),0) AS stock
       FROM parts p LEFT JOIN cells c ON c.part_id = p.id
       WHERE p.min_stock > 0
       GROUP BY p.id HAVING stock <= p.min_stock
       ORDER BY (p.min_stock - stock) DESC`
    )
    .all();
  const byCat = db
    .prepare(
      `SELECT COALESCE(cat.name,'未分类') AS name, COALESCE(cat.color,'#8892a4') AS color,
              COUNT(*) AS cells, COALESCE(SUM(c.qty),0) AS qty
       FROM cells c
       LEFT JOIN parts p ON p.id = c.part_id
       LEFT JOIN categories cat ON cat.id = p.category_id
       WHERE c.part_id IS NOT NULL AND c.qty > 0
       GROUP BY cat.id ORDER BY qty DESC`
    )
    .all();
  const lastMoves = db.prepare('SELECT * FROM moves ORDER BY id DESC LIMIT 8').all();
  return {
    kinds: s.kinds,
    pieces: s.pieces,
    total_cells: totalCells,
    used_cells: usedCells,
    drawers: drawersTotal,
    low_stock: low,
    by_category: byCat,
    recent: lastMoves,
  };
}

function exportAll() {
  return {
    app: 'PartVault',
    version: getMeta('schema_version', '1'),
    exported_at: nowISO(),
    meta: {
      cabinet_name: getMeta('cabinet_name', '我的元件柜'),
      operator: getMeta('operator', ''),
    },
    categories: db.prepare('SELECT * FROM categories ORDER BY sort,id').all(),
    parts: db.prepare('SELECT * FROM parts ORDER BY id').all(),
    stacks: db.prepare('SELECT * FROM stacks ORDER BY position,id').all(),
    drawers: db.prepare('SELECT * FROM drawers ORDER BY id').all(),
    cells: db.prepare('SELECT * FROM cells ORDER BY id').all(),
    moves: db.prepare('SELECT * FROM moves ORDER BY id').all(),
  };
}

function importAll(payload, mode) {
  if (!payload || typeof payload !== 'object') throw httpError(400, '导入数据格式不正确');
  db.exec('BEGIN');
  try {
    if (mode === 'replace') {
      db.exec('DELETE FROM moves; DELETE FROM cells; DELETE FROM drawers; DELETE FROM stacks; DELETE FROM parts; DELETE FROM categories;');
      db.exec("DELETE FROM sqlite_sequence WHERE name IN ('categories','parts','stacks','drawers','cells','moves')");
    }
    const idMap = { categories: {}, parts: {}, stacks: {}, drawers: {} };
    (payload.categories || []).forEach((c) => {
      const found = db.prepare('SELECT id FROM categories WHERE name=?').get(c.name);
      if (found) idMap.categories[c.id] = found.id;
      else {
        const r = db
          .prepare('INSERT INTO categories(name,icon,color,sort) VALUES(?,?,?,?)')
          .run(str(c.name), str(c.icon, 'box'), str(c.color, '#6ea8fe'), num(c.sort));
        idMap.categories[c.id] = Number(r.lastInsertRowid);
      }
    });
    (payload.parts || []).forEach((p) => {
      const catId = p.category_id == null ? null : (idMap.categories[p.category_id] ?? p.category_id);
      const found = db.prepare('SELECT id FROM parts WHERE (code IS NOT NULL AND code=?) OR (name=? AND spec=?)').get(
        str(p.code, ''),
        str(p.name),
        str(p.spec, '')
      );
      if (found) {
        db.prepare('UPDATE parts SET name=?,category_id=?,spec=?,package=?,unit=?,color=?,min_stock=?,note=?,updated_at=? WHERE id=?').run(
          str(p.name), catId, str(p.spec, ''), str(p.package, ''), str(p.unit, '个'), str(p.color, '#6ea8fe'),
          num(p.min_stock), str(p.note, ''), nowISO(), found.id
        );
        idMap.parts[p.id] = found.id;
      } else {
        const r = db
          .prepare(`INSERT INTO parts(code,name,category_id,spec,package,unit,color,min_stock,note,created_at,updated_at)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
          .run(str(p.code, '') || null, str(p.name), catId, str(p.spec, ''), str(p.package, ''), str(p.unit, '个'),
               str(p.color, '#6ea8fe'), num(p.min_stock), str(p.note, ''), str(p.created_at, nowISO()), nowISO());
        idMap.parts[p.id] = Number(r.lastInsertRowid);
      }
    });
    (payload.stacks || []).forEach((s, i) => {
      const r = db
        .prepare('INSERT INTO stacks(name,position,color,note) VALUES(?,?,?,?)')
        .run(str(s.name, '列 ' + (i + 1)), i, str(s.color, 'shell'), str(s.note, ''));
      idMap.stacks[s.id] = Number(r.lastInsertRowid);
    });
    (payload.drawers || []).forEach((d) => {
      const sid = idMap.stacks[d.stack_id] ?? d.stack_id;
      const r = db
        .prepare('INSERT INTO drawers(stack_id,slot,label,color,rows,cols,note) VALUES(?,?,?,?,?,?,?)')
        .run(sid, num(d.slot, 1), str(d.label, ''), str(d.color, 'white'), clamp(num(d.rows, 4), 1, 10), clamp(num(d.cols, 3), 1, 10), str(d.note, ''));
      idMap.drawers[d.id] = Number(r.lastInsertRowid);
    });
    (payload.cells || []).forEach((c) => {
      const did = idMap.drawers[c.drawer_id] ?? c.drawer_id;
      if (!did) return;
      const pid = c.part_id == null ? null : (idMap.parts[c.part_id] ?? c.part_id);
      db.prepare('INSERT INTO cells(drawer_id,r,c,label,part_id,qty,note) VALUES(?,?,?,?,?,?,?)').run(
        did, num(c.r, 1), num(c.c, 1), str(c.label, ''), pid, num(c.qty), str(c.note, '')
      );
    });
    if (payload.moves && mode === 'replace') {
      const ins = db.prepare(`INSERT INTO moves(ts,kind,part_id,part_name,cell_id,from_cell,drawer_id,qty,before_qty,after_qty,note)
                              VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
      payload.moves.forEach((m) => {
        ins.run(str(m.ts, nowISO()), str(m.kind, 'IN'), m.part_id == null ? null : (idMap.parts[m.part_id] ?? m.part_id),
                str(m.part_name, ''), m.cell_id, m.from_cell, m.drawer_id, num(m.qty), num(m.before_qty), num(m.after_qty), str(m.note, ''));
      });
    }
    if (payload.meta) {
      if (payload.meta.cabinet_name) setMeta('cabinet_name', payload.meta.cabinet_name);
      if (payload.meta.operator != null) setMeta('operator', payload.meta.operator);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  addMove({ kind: 'IMPORT', qty: 0, note: '导入数据（' + mode + '）' });
  return { ok: true };
}

/* ============================== HTTP ============================== */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj, (k, v) => (typeof v === 'bigint' ? Number(v) : v));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 32 * 1024 * 1024) {
        reject(httpError(413, '请求体过大'));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(httpError(400, 'JSON 解析失败'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found: ' + rel);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const pathname = parsed.pathname;

  if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  try {
    const q = Object.fromEntries(parsed.searchParams.entries());
    const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readBody(req);
    const seg = pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
    const route = seg.join('/');
    const id = seg.length > 1 ? num(seg[1]) : 0;
    const M = req.method;

    /* ---------- 基础 ---------- */
    if (route === 'health') return sendJSON(res, 200, { ok: true, ts: nowISO(), db: DB_PATH });
    if (route === 'bootstrap') return sendJSON(res, 200, bootstrap());
    if (route === 'stats') return sendJSON(res, 200, { ok: true, stats: stats() });
    if (route === 'export') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="partvault-backup.json"',
      });
      return res.end(JSON.stringify(exportAll(), (k, v) => (typeof v === 'bigint' ? Number(v) : v), 2));
    }
    if (route === 'import' && M === 'POST')
      return sendJSON(res, 200, importAll(body.data || body, body.mode === 'merge' ? 'merge' : 'replace'));

    /* ---------- meta ---------- */
    if (route === 'meta' && M === 'POST') {
      Object.entries(body || {}).forEach(([k, v]) => setMeta(k, v));
      return sendJSON(res, 200, { ok: true });
    }

    /* ---------- categories ---------- */
    if (route === 'categories') {
      if (M === 'GET') return sendJSON(res, 200, { ok: true, categories: db.prepare('SELECT * FROM categories ORDER BY sort,id').all() });
      if (M === 'POST') {
        const r = db
          .prepare('INSERT INTO categories(name,icon,color,sort) VALUES(?,?,?,?)')
          .run(str(body.name, '新分类'), str(body.icon, 'box'), str(body.color, '#6ea8fe'), num(body.sort, 99));
        return sendJSON(res, 200, { ok: true, id: Number(r.lastInsertRowid) });
      }
    }
    if (seg[0] === 'categories' && id) {
      if (M === 'PUT') {
        db.prepare('UPDATE categories SET name=COALESCE(NULLIF(?,\'\'),name), icon=COALESCE(NULLIF(?,\'\'),icon), color=COALESCE(NULLIF(?,\'\'),color) WHERE id=?').run(
          str(body.name, ''), str(body.icon, ''), str(body.color, ''), id);
        return sendJSON(res, 200, { ok: true });
      }
      if (M === 'DELETE') {
        db.prepare('DELETE FROM categories WHERE id=?').run(id);
        return sendJSON(res, 200, { ok: true });
      }
    }

    /* ---------- parts ---------- */
    if (route === 'parts') {
      if (M === 'GET') return sendJSON(res, 200, { ok: true, parts: bootstrap().parts });
      if (M === 'POST') {
        const ts = nowISO();
        const max = db.prepare("SELECT COALESCE(MAX(CAST(SUBSTR(code,4) AS INTEGER)),0) AS m FROM parts WHERE code LIKE 'PV-%'").get().m;
        const code = str(body.code, '') || 'PV-' + String(num(max) + 1).padStart(4, '0');
        const r = db
          .prepare(`INSERT INTO parts(code,name,category_id,spec,package,unit,color,min_stock,note,created_at,updated_at)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
          .run(code, str(body.name, '新元件'), body.category_id ? num(body.category_id) : null, str(body.spec, ''),
               str(body.package, ''), str(body.unit, '个'), str(body.color, '#6ea8fe'), num(body.min_stock), str(body.note, ''), ts, ts);
        addMove({ kind: 'PART', part_id: Number(r.lastInsertRowid), part_name: partLabel(body), qty: 0, note: '新增元件种类' });
        return sendJSON(res, 200, { ok: true, id: Number(r.lastInsertRowid), code });
      }
    }
    if (seg[0] === 'parts' && id) {
      if (M === 'PUT') {
        const p = db.prepare('SELECT * FROM parts WHERE id=?').get(id);
        if (!p) throw httpError(404, '元件不存在');
        db.prepare(`UPDATE parts SET code=?,name=?,category_id=?,spec=?,package=?,unit=?,color=?,min_stock=?,note=?,updated_at=? WHERE id=?`).run(
          str(body.code, p.code) || null, str(body.name, p.name), body.category_id === undefined ? p.category_id : (body.category_id ? num(body.category_id) : null),
          str(body.spec, p.spec), str(body.package, p.package), str(body.unit, p.unit), str(body.color, p.color),
          body.min_stock === undefined ? p.min_stock : num(body.min_stock), str(body.note, p.note), nowISO(), id);
        return sendJSON(res, 200, { ok: true });
      }
      if (M === 'DELETE') {
        const p = db.prepare('SELECT * FROM parts WHERE id=?').get(id);
        db.prepare('UPDATE cells SET part_id=NULL, qty=0 WHERE part_id=?').run(id);
        db.prepare('DELETE FROM parts WHERE id=?').run(id);
        addMove({ kind: 'PART', part_id: null, part_name: partLabel(p), qty: 0, note: '删除元件种类（原有格子已清空）' });
        return sendJSON(res, 200, { ok: true });
      }
    }

    /* ---------- layout ---------- */
    if (route === 'layout') {
      if (M === 'GET') return sendJSON(res, 200, { ok: true, stacks: db.prepare('SELECT * FROM stacks ORDER BY position,id').all(), drawers: db.prepare('SELECT * FROM drawers ORDER BY stack_id,slot').all(), cells: db.prepare('SELECT * FROM cells').all() });
      if (M === 'PUT' || M === 'POST') {
        applyLayout(body.stacks || [], str(body.note, '调整货架布局'));
        return sendJSON(res, 200, bootstrap());
      }
    }
    if (seg[0] === 'drawers' && id && M === 'GET') {
      const drawer = db.prepare('SELECT * FROM drawers WHERE id=?').get(id);
      if (!drawer) throw httpError(404, '抽屉不存在');
      const cells = db
        .prepare(`SELECT ce.*, p.name AS part_name, p.spec AS part_spec, p.unit AS part_unit, p.color AS part_color,
                         c.name AS category_name, c.icon AS category_icon
                  FROM cells ce LEFT JOIN parts p ON p.id=ce.part_id LEFT JOIN categories c ON c.id=p.category_id
                  WHERE ce.drawer_id=? ORDER BY ce.r, ce.c`).all(id);
      return sendJSON(res, 200, { ok: true, drawer, cells });
    }
    if (seg[0] === 'drawers' && id && M === 'PUT') {
      db.prepare(`UPDATE drawers SET label=COALESCE(NULLIF(?,''),label), color=COALESCE(NULLIF(?,''),color),
                  rows=?, cols=?, note=COALESCE(NULLIF(?,''),note) WHERE id=?`).run(
        str(body.label, ''), str(body.color, ''), clamp(num(body.rows, 4), 1, 10), clamp(num(body.cols, 3), 1, 10), str(body.note, ''), id);
      const d = db.prepare('SELECT * FROM drawers WHERE id=?').get(id);
      syncCells(id, d.rows, d.cols);
      return sendJSON(res, 200, { ok: true });
    }

    /* ---------- cells ---------- */
    if (route === 'cells/op' && M === 'POST') return sendJSON(res, 200, Object.assign({ ok: true }, cellOp(body)));
    if (route === 'cells/batch' && M === 'POST') {
      const results = [];
      (body.ops || []).forEach((o) => results.push(cellOp(o)));
      return sendJSON(res, 200, { ok: true, results });
    }
    if (seg[0] === 'cells' && id && M === 'POST') return sendJSON(res, 200, Object.assign({ ok: true }, cellOp(Object.assign({ cell_id: id }, body))));

    /* ---------- moves ---------- */
    if (route === 'moves' && M === 'GET') {
      const limit = clamp(num(q.limit, 200), 1, 2000);
      const where = [];
      const params = [];
      if (q.kind) { where.push('kind=?'); params.push(q.kind); }
      if (q.part_id) { where.push('part_id=?'); params.push(num(q.part_id)); }
      if (q.q) { where.push('(part_name LIKE ? OR note LIKE ?)'); params.push('%' + q.q + '%', '%' + q.q + '%'); }
      const sql = 'SELECT * FROM moves ' + (where.length ? 'WHERE ' + where.join(' AND ') + ' ' : '') + 'ORDER BY id DESC LIMIT ?';
      return sendJSON(res, 200, { ok: true, moves: db.prepare(sql).all(...params, limit) });
    }
    if (route === 'moves' && M === 'DELETE') {
      db.exec('DELETE FROM moves');
      return sendJSON(res, 200, { ok: true });
    }

    /* ---------- 搜索 ---------- */
    if (route === 'search') {
      const kw = '%' + str(q.q, '') + '%';
      const parts = db
        .prepare(`SELECT p.*, COALESCE(SUM(c.qty),0) AS stock FROM parts p LEFT JOIN cells c ON c.part_id=p.id
                  WHERE p.name LIKE ? OR p.spec LIKE ? OR p.code LIKE ? OR p.package LIKE ?
                  GROUP BY p.id ORDER BY stock DESC LIMIT 40`).all(kw, kw, kw, kw);
      const cells = db
        .prepare(`SELECT ce.id, ce.qty, ce.drawer_id, ce.r, ce.c, p.name AS part_name, p.spec AS part_spec, p.unit,
                         s.name AS stack_name, d.slot, d.label AS drawer_label
                  FROM cells ce JOIN parts p ON p.id=ce.part_id
                  JOIN drawers d ON d.id=ce.drawer_id JOIN stacks s ON s.id=d.stack_id
                  WHERE ce.qty>0 AND (p.name LIKE ? OR p.spec LIKE ? OR ce.note LIKE ?)
                  ORDER BY s.position, d.slot LIMIT 60`).all(kw, kw, kw);
      return sendJSON(res, 200, { ok: true, parts, cells });
    }

    /* ---------- 危险操作 ---------- */
    if (route === 'reset' && M === 'POST') {
      db.exec('BEGIN');
      db.exec('DELETE FROM moves; DELETE FROM cells; DELETE FROM drawers; DELETE FROM stacks;');
      db.exec("DELETE FROM sqlite_sequence WHERE name IN ('stacks','drawers','cells','moves')");
      db.exec('COMMIT');
      // 只重建货架骨架，不动元件库
      applyLayout([
        { name: '列 A', color: 'shell', drawers: ['white', 'white', 'black', 'black', 'black'] },
        { name: '列 B', color: 'shell', drawers: ['white', 'white', 'black', 'black', 'black'] },
        { name: '列 C', color: 'shell', drawers: ['white', 'white', 'white', 'black'] },
        { name: '列 D', color: 'shell', drawers: ['white', 'white', 'white', 'white'] },
      ], '重置货架（元件库保留）');
      return sendJSON(res, 200, bootstrap());
    }
    if (route === 'factory-reset' && M === 'POST') {
      db.exec('BEGIN');
      db.exec('DELETE FROM moves; DELETE FROM cells; DELETE FROM drawers; DELETE FROM stacks; DELETE FROM parts; DELETE FROM categories;');
      db.exec("DELETE FROM sqlite_sequence WHERE name IN ('categories','parts','stacks','drawers','cells','moves')");
      setMeta('initialized', '0');
      db.exec('COMMIT');
      seedIfEmpty();
      return sendJSON(res, 200, bootstrap());
    }

    throw httpError(404, '接口不存在：' + M + ' ' + pathname);
  } catch (err) {
    sendJSON(res, err.status || 500, { ok: false, error: err.message || String(err) });
  }
});

/* ============================== 启动 ============================== */

seedIfEmpty();

function listen(port, attempt = 0) {
  server
    .once('error', (e) => {
      if (e.code === 'EADDRINUSE' && attempt < 12) {
        console.log('  端口 ' + port + ' 被占用，尝试 ' + (port + 1) + ' …');
        listen(port + 1, attempt + 1);
      } else {
        console.error('启动失败：', e.message);
        process.exit(1);
      }
    })
    .listen(port, '127.0.0.1', () => {
      PORT = port;
      const link = 'http://127.0.0.1:' + port + '/';
      console.log('');
      console.log('  ┌─────────────────────────────────────────────────────────┐');
      console.log('  │   PartVault · 电子元件收纳管理系统                      │');
      console.log('  └─────────────────────────────────────────────────────────┘');
      console.log('   访问地址 : ' + link);
      console.log('   数据库   : ' + DB_PATH);
      const fallback = PROBE_LOG.filter((x) => !x.ok);
      if (fallback.length) {
        console.log('   位置说明 : 以下目录无法存放数据库（文件系统不支持锁）：');
        fallback.forEach((x) => console.log('              - ' + x.dir + '  （' + x.why + '）'));
      }
      console.log('   停止服务 : Ctrl + C');
      console.log('');
      if (argv.includes('--open')) {
        const { exec } = require('node:child_process');
        const cmd =
          process.platform === 'win32' ? 'start "" "' + link + '"'
          : process.platform === 'darwin' ? 'open "' + link + '"'
          : 'xdg-open "' + link + '"';
        exec(cmd, () => {});
      }
    });
}

listen(PORT);
