/* =========================================================================
   components.js · 元器件手绘风插图（纯 SVG，无外部素材）
   按「分类」决定外形：电容是圆柱/圆片、电阻是色环柱、IC 是黑方块…
   同一个分类再用 part.id 做种子做细微变化，让整面柜子看起来是真实杂乱的。
   ========================================================================= */
'use strict';

const CompArt = {
  /* 返回 SVG 字符串 */
  svg(icon, color, seed, size) {
    const s = size || 52;
    const c = color || '#6ea8fe';
    const rnd = CompArt._rand(seed || 1);
    const dark = CompArt._shade(c, -0.55);
    const light = CompArt._shade(c, 0.35);

    let body = '';
    switch (icon) {
      case 'cap': {
        if (rnd > 0.62) {
          // 瓷片电容：圆片
          body =
            '<ellipse cx="32" cy="26" rx="15" ry="13" fill="' + light + '" stroke="' + dark + '" stroke-width="1.2"/>' +
            '<ellipse cx="32" cy="26" rx="15" ry="13" fill="url(#gGlass)" opacity=".5"/>' +
            '<ellipse cx="32" cy="26" rx="6" ry="5" fill="' + dark + '" opacity=".55"/>' +
            '<path d="M26 37v9M38 37v9" stroke="#b9c2d0" stroke-width="2.4" stroke-linecap="round"/>';
        } else {
          // 电解电容：立式圆柱 + 负极亮条 + 顶部防爆纹
          body =
            '<rect x="21" y="9" width="22" height="27" rx="4.5" fill="' + dark + '"/>' +
            '<rect x="21" y="9" width="7" height="27" rx="3.5" fill="' + light + '" opacity=".85"/>' +
            '<ellipse cx="32" cy="9.5" rx="11" ry="3.6" fill="' + CompArt._shade(c, 0.55) + '"/>' +
            '<path d="M28 10.5h8M29.5 8.6l1.6 2.2 1.6-2.2" stroke="' + CompArt._shade(c, -0.75) + '" stroke-width="1" fill="none"/>' +
            '<path d="M27 36v10M37 36v10" stroke="#b9c2d0" stroke-width="2.4" stroke-linecap="round"/>';
        }
        break;
      }
      case 'resistor': {
        const bands = ['#e8563f', '#f2c14e', '#5ec8f7', '#7ad07a', '#c08cf7'];
        const b1 = bands[Math.floor(rnd * 5)], b2 = bands[Math.floor(rnd * 5)], b3 = bands[Math.floor(rnd * 5)];
        body =
          '<path d="M8 26h12M44 26h12" stroke="#b9c2d0" stroke-width="2.4" stroke-linecap="round"/>' +
          '<rect x="18" y="17" width="28" height="18" rx="8" fill="#dcc7a1" stroke="#b79c72" stroke-width="1"/>' +
          '<rect x="18" y="17" width="28" height="6" rx="3" fill="#ffffff" opacity=".35"/>' +
          '<rect x="23" y="17" width="3.4" height="18" fill="' + b1 + '"/>' +
          '<rect x="29" y="17" width="3.4" height="18" fill="' + b2 + '"/>' +
          '<rect x="35" y="17" width="3.4" height="18" fill="' + b3 + '"/>' +
          '<rect x="41" y="17" width="2.6" height="18" fill="#c8a97c"/>';
        break;
      }
      case 'coil': {
        if (rnd > 0.5) {
          // 环形电感
          body =
            '<circle cx="32" cy="26" r="15" fill="#3b4250" stroke="#232a36" stroke-width="1.4"/>' +
            '<circle cx="32" cy="26" r="6.5" fill="#20262f"/>' +
            '<path d="M18 20a16 16 0 0 1 28 0" stroke="' + c + '" stroke-width="3" fill="none" stroke-linecap="round"/>' +
            '<path d="M24 40v6M40 40v6" stroke="#b9c2d0" stroke-width="2.4" stroke-linecap="round"/>';
        } else {
          // 工字电感
          body =
            '<rect x="24" y="12" width="16" height="5" rx="2" fill="#4a5162"/>' +
            '<rect x="24" y="35" width="16" height="5" rx="2" fill="#4a5162"/>' +
            '<rect x="28" y="15" width="8" height="22" fill="#313844"/>' +
            '<path d="M24 19h16M24 24h16M24 29h16M24 34h16" stroke="' + c + '" stroke-width="3.4" stroke-linecap="round" opacity=".9"/>' +
            '<path d="M27 40v7M37 40v7" stroke="#b9c2d0" stroke-width="2.4" stroke-linecap="round"/>';
        }
        break;
      }
      case 'diode': {
        body =
          '<path d="M8 26h12M44 26h12" stroke="#b9c2d0" stroke-width="2.4" stroke-linecap="round"/>' +
          '<rect x="20" y="18" width="24" height="16" rx="4" fill="#252a34"/>' +
          '<rect x="20" y="18" width="24" height="6" rx="3" fill="#ffffff" opacity=".14"/>' +
          '<rect x="39" y="18" width="5" height="16" fill="#d8dde6"/>' +
          '<path d="M20 22v8" stroke="#4a5162" stroke-width="1"/>';
        break;
      }
      case 'transistor': {
        body =
          '<path d="M20 34a12 12 0 0 1 24 0z" fill="#252a34"/>' +
          '<path d="M20 34a12 12 0 0 1 24 0" fill="none" stroke="#0f131a" stroke-width="1"/>' +
          '<rect x="20" y="16" width="24" height="7" rx="3" fill="#ffffff" opacity=".12"/>' +
          '<path d="M25 34v10M32 34v11M39 34v10" stroke="#b9c2d0" stroke-width="2.4" stroke-linecap="round"/>';
        break;
      }
      case 'chip': {
        const pins = 5;
        let p = '';
        for (let i = 0; i < pins; i++) {
          const x = 18 + i * ((28 / (pins - 1)) || 6);
          p += '<rect x="' + x + '" y="9" width="3" height="5" rx="1" fill="#c8ccd4"/>';
          p += '<rect x="' + x + '" y="38" width="3" height="5" rx="1" fill="#c8ccd4"/>';
        }
        body =
          p +
          '<rect x="14" y="13" width="36" height="26" rx="4" fill="#22262f"/>' +
          '<rect x="14" y="13" width="36" height="9" rx="4" fill="#ffffff" opacity=".09"/>' +
          '<circle cx="21" cy="20" r="2.4" fill="#3f4757"/>' +
          '<path d="M28 26h10M28 30h16" stroke="#4c5566" stroke-width="1.4" stroke-linecap="round"/>';
        break;
      }
      case 'clock': {
        body =
          '<rect x="18" y="12" width="28" height="26" rx="12" fill="#c3cad6" stroke="#98a1b0" stroke-width="1.2"/>' +
          '<rect x="18" y="12" width="12" height="26" rx="6" fill="#ffffff" opacity=".5"/>' +
          '<circle cx="32" cy="25" r="4" fill="#aeb7c5" opacity=".7"/>' +
          '<path d="M25 38v9M39 38v9" stroke="#b9c2d0" stroke-width="2.4" stroke-linecap="round"/>';
        break;
      }
      case 'plug': {
        let p = '';
        for (let i = 0; i < 6; i++) {
          const x = 11 + i * 7.2;
          p += '<rect x="' + x + '" y="14" width="4" height="13" rx="1" fill="#e0b24a"/>';
          p += '<rect x="' + x + '" y="36" width="4" height="6" rx="1" fill="#e0b24a" opacity=".85"/>';
        }
        body = p + '<rect x="8" y="25" width="48" height="11" rx="2.5" fill="#1d222b"/>';
        break;
      }
      case 'switch': {
        body =
          '<rect x="14" y="18" width="36" height="22" rx="4" fill="#2a3040" stroke="#171c25" stroke-width="1"/>' +
          '<circle cx="32" cy="27" r="8.5" fill="#c9d1de"/>' +
          '<circle cx="32" cy="27" r="8.5" fill="url(#gGlass)" opacity=".35"/>' +
          '<circle cx="32" cy="27" r="3" fill="#98a2b3"/>' +
          '<rect x="18" y="40" width="4" height="5" rx="1" fill="#b9c2d0"/>' +
          '<rect x="42" y="40" width="4" height="5" rx="1" fill="#b9c2d0"/>';
        break;
      }
      case 'power': {
        if (rnd > 0.5) {
          // 18650
          body =
            '<rect x="14" y="16" width="36" height="22" rx="6" fill="' + c + '"/>' +
            '<rect x="14" y="16" width="36" height="8" rx="4" fill="#ffffff" opacity=".25"/>' +
            '<rect x="48" y="21" width="6" height="12" rx="3" fill="#c9d1de"/>' +
            '<rect x="18" y="22" width="24" height="10" rx="3" fill="#ffffff" opacity=".16"/>';
        } else {
          body =
            '<rect x="10" y="16" width="44" height="24" rx="5" fill="#2f6b4f"/>' +
            '<rect x="14" y="20" width="16" height="16" rx="3" fill="#c9d1de"/>' +
            '<circle cx="44" cy="28" r="5" fill="#e0b24a"/>' +
            '<path d="M34 22v12M38 24v8" stroke="#dfe7f5" stroke-width="1.4" opacity=".5"/>';
        }
        break;
      }
      case 'sensor': {
        body =
          '<rect x="10" y="14" width="44" height="26" rx="4" fill="#1f6b5e"/>' +
          '<rect x="16" y="19" width="14" height="16" rx="2.5" fill="#c9d1de"/>' +
          '<circle cx="44" cy="24" r="3.4" fill="' + c + '"/>' +
          '<circle cx="44" cy="32" r="3.4" fill="#e0b24a"/>' +
          '<path d="M14 40v5M26 40v5M38 40v5M50 40v5" stroke="#b9c2d0" stroke-width="2" stroke-linecap="round"/>';
        break;
      }
      default: {
        body =
          '<rect x="15" y="15" width="34" height="24" rx="5" fill="' + dark + '"/>' +
          '<rect x="15" y="15" width="34" height="9" rx="5" fill="' + light + '" opacity=".5"/>' +
          '<circle cx="32" cy="28" r="4.5" fill="#ffffff" opacity=".22"/>';
      }
    }

    return (
      '<svg class="comp-svg" viewBox="0 0 64 52" width="' + s + '" height="' + Math.round(s * 0.81) + '" xmlns="http://www.w3.org/2000/svg">' +
      '<defs>' +
      '<linearGradient id="gGlass" x1="0" y1="0" x2="0.4" y2="1">' +
      '<stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>' +
      '</linearGradient>' +
      '</defs>' + body + '</svg>'
    );
  },

  node(icon, color, seed, size) {
    const wrap = document.createElement('div');
    wrap.innerHTML = this.svg(icon, color, seed, size);
    return wrap.firstChild;
  },

  /* 取一个元件的画法 */
  of(part) {
    if (!part) return { icon: 'misc', color: '#8892a4', seed: 1 };
    return {
      icon: part.category_icon || 'misc',
      color: part.color || '#6ea8fe',
      seed: part.id || 1,
    };
  },

  /* 根据名称猜分类图标（离线/手输时也能画得像） */
  guessIcon(name) {
    const n = String(name || '');
    if (/电容/.test(n)) return 'cap';
    if (/电阻|电位器/.test(n)) return 'resistor';
    if (/电感|磁珠/.test(n)) return 'coil';
    if (/二极管|LED|发光|整流/.test(n)) return 'diode';
    if (/三极管|MOS|场效应/.test(n)) return 'transistor';
    if (/晶振|时钟|谐振/.test(n)) return 'clock';
    if (/排针|排母|座|杜邦|端子|接插/.test(n)) return 'plug';
    if (/开关|按键/.test(n)) return 'switch';
    if (/电池|电源|保险|模块|升压|降压/.test(n)) return 'power';
    if (/传感器|光敏|热敏|霍尔|温湿度|超声/.test(n)) return 'sensor';
    if (/IC|芯片|单片机|运放|比较器|555|稳压|驱动|寄存器|光耦/.test(n)) return 'chip';
    return 'misc';
  },

  _rand(seed) {
    let x = Math.sin(seed * 9301 + 49297) * 233280;
    return Math.abs(x - Math.floor(x));
  },

  _shade(hex, amt) {
    let h = String(hex || '#6ea8fe').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (amt >= 0) {
      r = Math.round(r + (255 - r) * amt);
      g = Math.round(g + (255 - g) * amt);
      b = Math.round(b + (255 - b) * amt);
    } else {
      r = Math.round(r * (1 + amt));
      g = Math.round(g * (1 + amt));
      b = Math.round(b * (1 + amt));
    }
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  },
};

PV.CompArt = CompArt;
