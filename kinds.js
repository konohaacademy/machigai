// まちがいさがし — 絵の部品。1つの部品＝描き方（draw）＋はじめの色と形（make）＋ちがいの作り方（muts）。
// ⚠ 描き方は o（部品の記録）だけを見て描く。乱数を使わない（同じ記録から、いつも同じ絵になるように）。
// ⚠ 文字は描かない。フォントは端末ごとに違い、同じ問題でも絵がずれる。
// 座標：地面に立つものは「足もとの まん中」が原点（上がマイナス）。浮かぶものは まん中が原点。
(function (G) {
  'use strict';
  var MU = G.MU;
  var OUT = '#4a3a30';
  var TAU = Math.PI * 2;

  // ── 色 ──
  var PAL = {
    red: '#e8574a', orange: '#f39a3b', yellow: '#f6cf4a', lime: '#b6d94c', green: '#6dbb5f', dgreen: '#3f8f55',
    sky: '#6fb7ea', blue: '#3f74c4', navy: '#2f4a8a', purple: '#9b7bd4', pink: '#f29bb8', rose: '#d8578a',
    brown: '#a8714a', dbrown: '#77502f', cream: '#fff1d6', white: '#ffffff', gray: '#a9b1ba', dgray: '#6b7480', black: '#4a3a30'
  };
  // 目立つ色（大きく色を変えるときの候補）
  var BRIGHT = ['red', 'orange', 'yellow', 'green', 'sky', 'blue', 'purple', 'pink', 'brown', 'white'];

  // ── 描く道具 ──
  function circ(x, y, r) { var p = new Path2D(); p.arc(x, y, r, 0, TAU); return p; }
  function ell(x, y, rx, ry, a) { var p = new Path2D(); p.ellipse(x, y, rx, ry, a || 0, 0, TAU); return p; }
  function rr(x, y, w, h, r) {
    var p = new Path2D(); r = Math.max(0, Math.min(r, w / 2, h / 2));
    p.moveTo(x + r, y); p.arcTo(x + w, y, x + w, y + h, r); p.arcTo(x + w, y + h, x, y + h, r);
    p.arcTo(x, y + h, x, y, r); p.arcTo(x, y, x + w, y, r); p.closePath(); return p;
  }
  function poly(pts) {
    var p = new Path2D(); p.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
    p.closePath(); return p;
  }
  var cache = {};
  function sv(d) { return cache[d] || (cache[d] = new Path2D(d)); }
  /** ぬって ふちどる */
  function F(g, p, fill, edge) {
    var c = g.c;
    if (fill) { c.fillStyle = fill; c.fill(p); }
    if (edge !== false) { c.lineWidth = g.lw * (edge || 1); c.strokeStyle = OUT; c.stroke(p); }
  }
  /** 線だけ */
  function L(g, p, col, w) { var c = g.c; c.lineWidth = w; c.strokeStyle = col || OUT; c.stroke(p); }
  /** ふちの付いた太い線（しっぽ・くき） */
  function OL(g, p, col, w) { L(g, p, OUT, w + g.lw * 2); L(g, p, col, w); }
  /** いくつかの丸を、外がわだけ ふちどる（くも・木・草むら） */
  function blob(g, list, fill, edgeCol) {
    var c = g.c, i, p = new Path2D();
    for (i = 0; i < list.length; i++) { p.moveTo(list[i][0] + list[i][2], list[i][1]); p.arc(list[i][0], list[i][1], list[i][2], 0, TAU); }
    c.lineWidth = g.lw * 2; c.strokeStyle = edgeCol || OUT; c.stroke(p);
    c.fillStyle = fill; c.fill(p);
  }
  function line(x1, y1, x2, y2) { var p = new Path2D(); p.moveTo(x1, y1); p.lineTo(x2, y2); return p; }
  function qline(x1, y1, cx, cy, x2, y2) { var p = new Path2D(); p.moveTo(x1, y1); p.quadraticCurveTo(cx, cy, x2, y2); return p; }
  function clip(g, p, fn) { g.c.save(); g.c.clip(p); fn(); g.c.restore(); }
  function bit(s, i) { return s.charAt(i) === '1'; }
  function flipBit(s, i) { return s.substr(0, i) + (s.charAt(i) === '1' ? '0' : '1') + s.substr(i + 1); }
  function darker(hex, k) { return MU.shift(hex, 0, -(k || 0.14)); }

  // ── ちがいの作り方の道具 ──
  // 返すもの：{ l: ラベル, g: 使える いちばん下の★, f: function(o) 記録を書きかえる }
  function mBit(key, n, label, g) {
    return function (o, R) {
      var i = R.i(n);
      return { l: label, g: g || 3, f: function (x) { x.p[key] = flipBit(x.p[key], i); } };
    };
  }
  function mToggle(key, label, g) {
    return function (o) { return { l: label, g: g || 2, f: function (x) { x.p[key] = x.p[key] ? 0 : 1; } }; };
  }
  function mCount(key, lo, hi, label, g) {
    return function (o, R) {
      var v = o.p[key], nv = v + (R.chance(0.5) ? 1 : -1);
      if (nv < lo) nv = v + 1; if (nv > hi) nv = v - 1;
      if (nv < lo || nv > hi || nv === v) return null;
      return { l: label, g: g || 3, f: function (x) { x.p[key] = nv; } };
    };
  }

  var K = {};

  // ═══════════ 草花・空（こうえん・まど の外） ═══════════
  K.flower = {
    name: 'はな', ground: true,
    cols: { petal: 'はなびらの いろ', center: 'はなの まんなかの いろ' },
    make: function (R) {
      return { c: { petal: PAL[R.pick(['red', 'pink', 'yellow', 'purple', 'white', 'orange', 'sky'])], center: PAL[R.pick(['yellow', 'orange', 'brown'])] },
               p: { n: R.ri(5, 6), leaf: R.pick([-1, 1]), h: R.ri(16, 24) } };
    },
    bb: function (o) { return [-11, -o.p.h - 11, 11, 0]; },
    draw: function (g, o) {
      var h = o.p.h, n = o.p.n, i, a;
      OL(g, qline(0, 0, 2.5, -h / 2, 0, -h), '#58a84e', 2.2);
      if (o.p.leaf) F(g, ell(o.p.leaf * 5, -h * 0.42, 5, 2.4, o.p.leaf * -0.5), '#6dbb5f');
      for (i = 0; i < n; i++) {
        a = i * TAU / n - Math.PI / 2;
        F(g, ell(Math.cos(a) * 5.4, -h + Math.sin(a) * 5.4, 4.4, 3.3, a), o.c.petal);
      }
      F(g, circ(0, -h, 3.3), o.c.center);
    },
    muts: [mCount('n', 4, 7, 'はなびらの かず', 3),
      function (o) { return { l: 'はなの はっぱ', g: 3, f: function (x) { x.p.leaf = x.p.leaf ? 0 : (o.p.leaf || 1); } }; }]
  };

  K.tree = {
    name: 'き', ground: true,
    cols: { crown: 'きの はっぱの いろ' },
    make: function (R, opt) {
      var ap = ''; for (var i = 0; i < 5; i++) ap += R.chance(0.55) ? '1' : '0';
      return { c: { crown: (opt && opt.night) ? '#3d7a5a' : PAL[R.pick(['green', 'green', 'dgreen', 'lime'])], trunk: '#9b6b45' },
               p: { ap: ap, hole: R.chance(0.4) ? 1 : 0 } };
    },
    bb: function () { return [-31, -74, 31, 0]; },
    draw: function (g, o) {
      F(g, rr(-5, -36, 10, 36, 2), o.c.trunk);
      if (o.p.hole) F(g, ell(0, -18, 2.3, 3.2), '#5a3a24');
      blob(g, [[0, -54, 19], [-15, -44, 14], [15, -44, 14], [0, -40, 16], [-8, -60, 11], [9, -59, 11]], o.c.crown);
      var AP = [[-11, -50], [8, -60], [13, -42], [-3, -40], [-16, -38]];
      for (var i = 0; i < 5; i++) if (bit(o.p.ap, i)) {
        F(g, circ(AP[i][0], AP[i][1], 3.2), '#e04b3c');
        g.c.fillStyle = 'rgba(255,255,255,0.6)'; g.c.fill(circ(AP[i][0] - 1, AP[i][1] - 1.1, 0.9));
      }
    },
    muts: [mBit('ap', 5, 'きの りんご', 3), mToggle('hole', 'きの あな', 3)]
  };

  K.bush = {
    name: 'くさむら', ground: true,
    cols: { main: 'くさむらの いろ' },
    make: function (R) {
      var b = ''; for (var i = 0; i < 4; i++) b += R.chance(0.5) ? '1' : '0';
      return { c: { main: PAL[R.pick(['green', 'dgreen'])], berry: PAL[R.pick(['red', 'purple', 'orange'])] }, p: { b: b } };
    },
    bb: function () { return [-21, -22, 21, 0]; },
    draw: function (g, o) {
      blob(g, [[0, -11, 11], [-11, -7, 8], [11, -7, 8], [-5, -4, 7], [6, -4, 7]], o.c.main);
      var B = [[-10, -9], [-2, -15], [6, -10], [12, -5]];
      for (var i = 0; i < 4; i++) if (bit(o.p.b, i)) F(g, circ(B[i][0], B[i][1], 1.9), o.c.berry, 0.7);
    },
    muts: [mBit('b', 4, 'くさむらの みの かず', 4)]
  };

  K.bird = {
    name: 'ことり', asym: true, float: true,
    cols: { body: 'ことりの いろ', wing: 'ことりの はねの いろ' },
    make: function (R) {
      var b = R.pick(['sky', 'yellow', 'red', 'blue', 'orange', 'pink']);
      return { c: { body: PAL[b], wing: PAL[R.pick(['white', 'navy', 'brown', 'green'])] }, p: { open: R.chance(0.3) ? 1 : 0, tail: R.chance(0.5) ? 1 : 0 } };
    },
    bb: function () { return [-18, -11, 17, 9]; },
    draw: function (g, o) {
      F(g, o.p.tail ? poly([-8, -1, -18, -8, -16, 4]) : poly([-8, 0, -15, -3, -14, 3]), o.c.body);
      var c = g.c, p = new Path2D(); p.ellipse(0, 1, 10, 7.5, 0, 0, TAU); p.moveTo(12.5, -4); p.arc(7, -4, 5.5, 0, TAU);
      c.lineWidth = g.lw * 2; c.strokeStyle = OUT; c.stroke(p); c.fillStyle = o.c.body; c.fill(p);
      F(g, ell(-1.5, 2, 5.5, 3.5, -0.3), o.c.wing);
      if (o.p.open) { F(g, poly([11.5, -5.5, 16.5, -6.5, 12, -3.6]), '#f39a3b'); F(g, poly([11.5, -3.2, 16, -1.6, 11.5, -1.6]), '#f39a3b'); }
      else F(g, poly([11.5, -5.5, 16.5, -3.6, 11.5, -1.8]), '#f39a3b');
      F(g, circ(8.4, -5.2, 1.1), OUT, false);
    },
    muts: [mToggle('open', 'ことりの くちばし', 3), mToggle('tail', 'ことりの しっぽ', 3)]
  };

  K.butterfly = {
    name: 'ちょうちょ', float: true,
    cols: { wing: 'ちょうちょの はねの いろ' },
    make: function (R) {
      return { c: { wing: PAL[R.pick(['yellow', 'orange', 'sky', 'pink', 'purple'])], wing2: PAL[R.pick(['white', 'yellow', 'pink', 'orange'])] }, p: { dots: R.chance(0.6) ? 1 : 0 } };
    },
    bb: function () { return [-14, -15, 14, 11]; },
    draw: function (g, o) {
      L(g, qline(-0.5, -6, -3, -12, -5, -13), OUT, 0.8); L(g, qline(0.5, -6, 3, -12, 5, -13), OUT, 0.8);
      F(g, ell(-6, -2.5, 6, 6.8, -0.5), o.c.wing); F(g, ell(6, -2.5, 6, 6.8, 0.5), o.c.wing);
      F(g, ell(-5, 5, 3.8, 4.3, 0.4), o.c.wing2); F(g, ell(5, 5, 3.8, 4.3, -0.4), o.c.wing2);
      if (o.p.dots) { F(g, circ(-6.5, -3.5, 1.7), '#ffffff', 0.6); F(g, circ(6.5, -3.5, 1.7), '#ffffff', 0.6); }
      F(g, ell(0, 1, 1.5, 7), OUT, false);
    },
    muts: [mToggle('dots', 'ちょうちょの もよう', 3)]
  };

  var PUFFS = [
    [[-12, 2, 9], [0, -4, 11], [12, 2, 9], [0, 5, 8]],
    [[-14, 3, 8], [-4, -3, 10], [8, -2, 9], [16, 4, 7], [2, 5, 8]],
    [[-10, 1, 9], [4, -4, 11], [14, 4, 7], [-2, 5, 8]]
  ];
  K.cloud = {
    name: 'くも', float: true,
    cols: {},
    make: function (R) { return { c: { main: '#ffffff' }, p: { v: R.i(3) } }; },
    bb: function () { return [-25, -16, 25, 14]; },
    draw: function (g, o) { blob(g, PUFFS[o.p.v], '#ffffff', '#8fa8bf'); },
    muts: [function (o, R) { var v = (o.p.v + 1 + R.i(2)) % 3; return { l: 'くもの かたち', g: 2, f: function (x) { x.p.v = v; } }; }]
  };

  K.sun = {
    name: 'たいよう', float: true, noMove: true,
    cols: {},
    make: function () { return { c: {}, p: { rays: '1111111111' } }; },
    bb: function () { return [-21, -21, 21, 21]; },
    draw: function (g, o) {
      for (var i = 0; i < 10; i++) if (bit(o.p.rays, i)) {
        var a = i * TAU / 10, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(a + 0.17), sb = Math.sin(a + 0.17), cc = Math.cos(a - 0.17), sc = Math.sin(a - 0.17);
        F(g, poly([ca * 20, sa * 20, cb * 13, sb * 13, cc * 13, sc * 13]), '#f7b733', 0.8);
      }
      F(g, circ(0, 0, 11), '#ffd33d');
    },
    muts: [mBit('rays', 10, 'たいようの ひかり', 4)]
  };

  K.balloon = {
    name: 'ふうせん', float: true,
    cols: { main: 'ふうせんの いろ' },
    make: function (R) { return { c: { main: PAL[R.pick(['red', 'yellow', 'sky', 'pink', 'green', 'orange', 'purple'])] }, p: { sd: R.pick([-1, 1]) } }; },
    bb: function () { return [-12, -13, 12, 44]; },
    draw: function (g, o) {
      var p = new Path2D(); p.moveTo(0, 13); p.quadraticCurveTo(o.p.sd * 7, 24, 0, 32); p.quadraticCurveTo(-o.p.sd * 6, 38, 0, 44);
      L(g, p, OUT, 0.9);
      F(g, ell(0, 0, 10, 12.5), o.c.main);
      F(g, poly([0, 12, -2.2, 15, 2.2, 15]), o.c.main, 0.8);
      g.c.fillStyle = 'rgba(255,255,255,0.55)'; g.c.fill(ell(-4, -5, 2, 3.6, 0.3));
    },
    muts: [function (o) { return { l: 'ふうせんの ひも', g: 3, f: function (x) { x.p.sd = -x.p.sd; } }; }]
  };

  K.ball = {
    name: 'ボール', ground: true,
    cols: { main: 'ボールの いろ', band: 'ボールの もようの いろ' },
    make: function (R) { return { c: { main: PAL[R.pick(['red', 'blue', 'yellow', 'green', 'pink'])], band: PAL[R.pick(['white', 'yellow', 'white'])] }, p: {} }; },
    bb: function () { return [-10, -19, 10, 0]; },
    draw: function (g, o) {
      var b = circ(0, -9, 9);
      F(g, b, o.c.main, false);
      clip(g, b, function () { g.c.fillStyle = o.c.band; g.c.fill(sv('M -10 -12 Q 0 -8 10 -12 L 10 -7 Q 0 -3 -10 -7 Z')); });
      F(g, b, null);
      g.c.fillStyle = 'rgba(255,255,255,0.5)'; g.c.fill(ell(-3.5, -13, 2, 1.4, -0.5));
    },
    muts: []
  };

  K.mushroom = {
    name: 'きのこ', ground: true,
    cols: { cap: 'きのこの いろ' },
    make: function (R) {
      var s = ''; for (var i = 0; i < 5; i++) s += R.chance(0.6) ? '1' : '0';
      return { c: { cap: PAL[R.pick(['red', 'orange', 'brown', 'purple'])] }, p: { sp: s } };
    },
    bb: function () { return [-14, -27, 14, 0]; },
    draw: function (g, o) {
      F(g, rr(-4, -12, 8, 12, 3), '#fff1d6');
      F(g, sv('M -13 -10 Q -12 -26 0 -26 Q 12 -26 13 -10 Z'), o.c.cap);
      var S = [[-6, -18, 2.4], [3, -21.5, 2.2], [8, -14, 2], [-1, -13.5, 1.8], [-10, -13, 1.5]];
      for (var i = 0; i < 5; i++) if (bit(o.p.sp, i)) F(g, circ(S[i][0], S[i][1], S[i][2]), '#ffffff', 0.6);
    },
    muts: [mBit('sp', 5, 'きのこの もよう', 4)]
  };

  K.bench = {
    name: 'ベンチ', ground: true, noMove: true,
    cols: { main: 'ベンチの いろ' },
    make: function (R) { return { c: { main: PAL[R.pick(['brown', 'red', 'green', 'blue', 'orange'])] }, p: { sl: '111' } }; },
    bb: function () { return [-27, -32, 27, 0]; },
    draw: function (g, o) {
      F(g, rr(-22, -13, 3, 13, 1), '#6b4a30'); F(g, rr(19, -13, 3, 13, 1), '#6b4a30');
      F(g, rr(-21, -32, 2.6, 19, 1), '#6b4a30'); F(g, rr(18.4, -32, 2.6, 19, 1), '#6b4a30');
      for (var i = 0; i < 3; i++) if (bit(o.p.sl, i)) F(g, rr(-25, -31 + i * 5.5, 50, 4, 1.5), o.c.main);
      F(g, rr(-26, -15, 52, 4.2, 1.5), o.c.main);
    },
    muts: [mBit('sl', 3, 'ベンチの いた', 3)]
  };

  K.fence = {
    name: 'さく', ground: true, noMove: true, noRemove: true,
    cols: { main: 'さくの いろ' },
    make: function (R) { return { c: { main: PAL[R.pick(['white', 'cream', 'brown'])] }, p: { pk: '111111' } }; },
    bb: function () { return [-35, -32, 35, 0]; },
    draw: function (g, o) {
      F(g, rr(-34, -22, 68, 3.4, 1), o.c.main); F(g, rr(-34, -11, 68, 3.4, 1), o.c.main);
      for (var i = 0; i < 6; i++) if (bit(o.p.pk, i)) {
        var x = -30 + i * 12;
        F(g, poly([x - 3.6, 0, x - 3.6, -26, x, -31, x + 3.6, -26, x + 3.6, 0]), o.c.main);
      }
    },
    muts: [mBit('pk', 6, 'さくの いた', 3)]
  };

  K.duck = {
    name: 'あひる', asym: true, ground: true,
    cols: { body: 'あひるの いろ', beak: 'あひるの くちばしの いろ' },
    make: function (R) { return { c: { body: PAL[R.pick(['white', 'yellow', 'yellow'])], beak: PAL.orange }, p: { wing: R.chance(0.6) ? 1 : 0 } }; },
    bb: function () { return [-14, -22, 17, 1]; },
    draw: function (g, o) {
      var c = g.c, p = new Path2D(); p.ellipse(0, -6, 11, 6.5, 0, 0, TAU); p.moveTo(12, -15); p.arc(7, -15, 5, 0, TAU);
      p.moveTo(-9, -8); p.lineTo(-14, -14); p.lineTo(-7, -11);
      c.lineWidth = g.lw * 2; c.strokeStyle = OUT; c.stroke(p); c.fillStyle = o.c.body; c.fill(p);
      F(g, ell(12.5, -13.8, 3.4, 1.6), o.c.beak);
      F(g, circ(8, -16.4, 1), OUT, false);
      if (o.p.wing) L(g, sv('M -6 -7 Q -1 -2 4 -7'), OUT, g.lw);
    },
    muts: [mToggle('wing', 'あひるの はね', 4)]
  };

  K.kite = {
    name: 'たこあげの たこ', float: true,
    cols: { main: 'たこの いろ', bow: 'たこの しっぽの リボンの いろ' },
    make: function (R) { return { c: { main: PAL[R.pick(['red', 'blue', 'yellow', 'purple'])], sub: PAL[R.pick(['white', 'yellow', 'sky'])], bow: PAL[R.pick(['pink', 'orange', 'green'])] }, p: { n: R.ri(2, 4) } }; },
    bb: function () { return [-11, -15, 13, 48]; },
    draw: function (g, o) {
      var t = new Path2D(); t.moveTo(0, 16); t.bezierCurveTo(8, 24, -6, 34, 5, 46); L(g, t, OUT, 0.9);
      F(g, poly([0, -14, 10, -2, 0, 16, -10, -2]), o.c.main);
      F(g, poly([0, -14, 10, -2, 0, -2]), o.c.sub, false); F(g, poly([0, -2, -10, -2, 0, 16]), o.c.sub, false);
      F(g, poly([0, -14, 10, -2, 0, 16, -10, -2]), null);
      var T = [[3.2, 22], [1.6, 30], [2.6, 38], [4.3, 44]];
      for (var i = 0; i < o.p.n; i++) F(g, poly([T[i][0] - 3.5, T[i][1] - 2, T[i][0] + 3.5, T[i][1] + 2, T[i][0] + 3.5, T[i][1] - 2, T[i][0] - 3.5, T[i][1] + 2]), o.c.bow, 0.6);
    },
    muts: [mCount('n', 1, 4, 'たこの しっぽの リボン', 3)]
  };

  K.rock = {
    name: 'いし', ground: true,
    cols: {},
    make: function (R) { return { c: { main: PAL[R.pick(['gray', 'gray', 'dgray'])] }, p: { v: R.i(2) } }; },
    bb: function () { return [-12, -11, 12, 0]; },
    draw: function (g, o) {
      F(g, o.p.v ? sv('M -12 0 Q -12 -8 -5 -10 Q 3 -12 8 -8 Q 12 -5 12 0 Z') : sv('M -11 0 Q -10 -10 -1 -11 Q 9 -10 11 -4 L 12 0 Z'), o.c.main);
      g.c.fillStyle = 'rgba(255,255,255,0.35)'; g.c.fill(ell(-3, -7, 3, 1.5, -0.3));
    },
    muts: []
  };

  // ═══════════ へや ═══════════
  K.window = {
    name: 'まど', noMove: true, noRemove: true, wall: true,
    cols: { cur: 'カーテンの いろ', frame: 'まどわくの いろ' },
    make: function (R) { return { c: { cur: PAL[R.pick(['pink', 'sky', 'yellow', 'green', 'orange', 'purple'])], frame: PAL[R.pick(['white', 'cream', 'brown'])] }, p: { cross: 1, sun: R.chance(0.5) ? 1 : 0, cld: R.chance(0.6) ? 1 : 0, tie: 1 } }; },
    bb: function () { return [-41, -6, 41, 59]; },
    draw: function (g, o) {
      var sky = rr(-30, 4, 60, 46, 1);
      F(g, sky, '#bfe3f5', false);
      clip(g, sky, function () {
        if (o.p.sun) F(g, circ(17, 15, 6), '#ffd33d', 0.8);
        if (o.p.cld) blob(g, [[-12, 30, 6], [-5, 27, 7], [2, 30, 5.5]], '#ffffff', '#8fa8bf');
      });
      var fr = new Path2D(); fr.addPath(rr(-34, 0, 68, 54, 2)); fr.addPath(rr(-30, 4, 60, 46, 1));
      g.c.fillStyle = o.c.frame; g.c.fill(fr, 'evenodd'); g.c.lineWidth = g.lw; g.c.strokeStyle = OUT; g.c.stroke(fr);
      if (o.p.cross) { F(g, rr(-1.6, 4, 3.2, 46, 0), o.c.frame); F(g, rr(-30, 25.5, 60, 3.2, 0), o.c.frame); }
      F(g, rr(-38, 52, 76, 5, 1.5), o.c.frame);
      L(g, line(-42, -3, 42, -3), '#7a5a40', 2.4);
      F(g, sv('M -40 -4 L -27 -4 Q -26 22 -21 50 L -40 50 Z'), o.c.cur);
      F(g, sv('M 40 -4 L 27 -4 Q 26 22 21 50 L 40 50 Z'), o.c.cur);
      if (o.p.tie) { F(g, rr(-35, 26, 12, 3, 1.2), '#ffffff', 0.7); F(g, rr(23, 26, 12, 3, 1.2), '#ffffff', 0.7); }
    },
    muts: [mToggle('cross', 'まどの わく', 3), mToggle('sun', 'まどの そとの たいよう', 1), mToggle('cld', 'まどの そとの くも', 2), mToggle('tie', 'カーテンの ひも', 4)]
  };

  K.frame = {
    name: 'かべの え', wall: true, tilt: true,
    cols: { frame: 'がくぶちの いろ' },
    make: function (R) { return { c: { frame: PAL[R.pick(['brown', 'yellow', 'red', 'blue', 'dbrown'])] }, p: { pic: R.i(3), ps: R.chance(0.6) ? 1 : 0 } }; },
    bb: function () { return [-21, -24, 21, 17]; },
    draw: function (g, o) {
      L(g, sv('M -10 -16 L 0 -23 L 10 -16'), OUT, 0.8);
      F(g, circ(0, -23, 1.2), OUT, false);
      F(g, rr(-20, -16, 40, 32, 2), o.c.frame);
      var inner = rr(-15, -11, 30, 22, 0.5);
      F(g, inner, '#fff7e0');
      clip(g, inner, function () {
        if (o.p.pic === 0) {
          F(g, poly([-16, 12, -6, -4, 2, 6, 8, -2, 16, 12]), '#7fbf6a', 0.6);
          if (o.p.ps) F(g, circ(9, -6, 2.6), '#f39a3b', 0.6);
        } else if (o.p.pic === 1) {
          F(g, rr(-16, 3, 32, 10, 0), '#6fb7ea', 0.6);
          F(g, poly([-6, 3, 4, 3, 2, 6, -4, 6]), '#a8714a', 0.6); F(g, poly([-1, 2, -1, -8, 5, 2]), '#ffffff', 0.6);
          if (o.p.ps) F(g, circ(-9, -5, 2.6), '#f39a3b', 0.6);
        } else {
          F(g, sv('M 0 8 C -14 -1 -8 -11 0 -4 C 8 -11 14 -1 0 8 Z'), '#f29bb8', 0.6);
          if (o.p.ps) F(g, circ(-10, -6, 1.6), '#f6cf4a', 0.6);
        }
      });
    },
    muts: [function (o, R) { var v = (o.p.pic + 1 + R.i(2)) % 3; return { l: 'えの なかみ', g: 1, f: function (x) { x.p.pic = v; } }; },
      mToggle('ps', 'えの なかの まる', 4)]
  };

  K.clock = {
    name: 'とけい', wall: true,
    cols: { frame: 'とけいの ふちの いろ' },
    make: function (R) { return { c: { frame: PAL[R.pick(['red', 'blue', 'green', 'orange', 'brown', 'purple'])] }, p: { hh: R.i(12), mm: R.i(12) } }; },
    bb: function () { return [-16, -16, 16, 16]; },
    draw: function (g, o) {
      F(g, circ(0, 0, 15), o.c.frame); F(g, circ(0, 0, 11.6), '#fffaf0');
      for (var i = 0; i < 12; i++) {
        var a = i * TAU / 12, r1 = i % 3 ? 9.6 : 8.4;
        L(g, line(Math.cos(a) * r1, Math.sin(a) * r1, Math.cos(a) * 10.6, Math.sin(a) * 10.6), OUT, i % 3 ? 0.6 : 1.1);
      }
      var ha = ((o.p.hh + o.p.mm / 12) / 12) * TAU - Math.PI / 2, ma = (o.p.mm / 12) * TAU - Math.PI / 2;
      L(g, line(0, 0, Math.cos(ha) * 5.8, Math.sin(ha) * 5.8), OUT, 1.7);
      L(g, line(0, 0, Math.cos(ma) * 8.8, Math.sin(ma) * 8.8), OUT, 1.1);
      F(g, circ(0, 0, 1.3), OUT, false);
    },
    muts: [function (o, R) { var d = R.pick([2, 3, 4, -2, -3, -4]); return { l: 'とけいの ながい はり', g: 3, f: function (x) { x.p.mm = (x.p.mm + d + 12) % 12; } }; },
      function (o, R) { var d = R.pick([3, 4, 5, -3, -4, -5]); return { l: 'とけいの みじかい はり', g: 3, f: function (x) { x.p.hh = (x.p.hh + d + 12) % 12; } }; }]
  };

  K.shelf = {
    name: 'たな', wall: true, fixed: true,
    cols: {},
    make: function () { return { c: { main: '#b5824f' }, p: { w: 120 } }; },
    bb: function (o) { return [-o.p.w / 2 - 1, 0, o.p.w / 2 + 1, 14]; },
    draw: function (g, o) {
      var w = o.p.w;
      F(g, poly([-w / 2 + 10, 6, -w / 2 + 10, 14, -w / 2 + 18, 6]), '#8a5f39', 0.8);
      F(g, poly([w / 2 - 10, 6, w / 2 - 10, 14, w / 2 - 18, 6]), '#8a5f39', 0.8);
      F(g, rr(-w / 2, 0, w, 6, 1.5), o.c.main);
    },
    muts: []
  };

  K.book = {
    name: 'ほん', ground: true, tilt: true,
    cols: { main: 'ほんの いろ', bd: 'ほんの せの せんの いろ' },
    make: function (R) { return { c: { main: PAL[R.pick(['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'navy', 'pink'])], bd: PAL[R.pick(['white', 'yellow', 'cream'])] }, p: { w: R.ri(6, 9), h: R.ri(19, 27), bd: R.chance(0.7) ? 1 : 0, dot: R.chance(0.5) ? 1 : 0 } }; },
    bb: function (o) { return [-o.p.w / 2, -o.p.h, o.p.w / 2, 0]; },
    draw: function (g, o) {
      var w = o.p.w, h = o.p.h;
      F(g, rr(-w / 2, -h, w, h, 1), o.c.main);
      if (o.p.bd) { F(g, rr(-w / 2, -h + 3.5, w, 2.2, 0), o.c.bd, 0.6); F(g, rr(-w / 2, -5.5, w, 2.2, 0), o.c.bd, 0.6); }
      if (o.p.dot) F(g, circ(0, -h / 2, 1.5), o.c.bd, 0.6);
    },
    muts: [mToggle('bd', 'ほんの せの せん', 3), mToggle('dot', 'ほんの せの まる', 4)]
  };

  K.bear = {
    name: 'くまの ぬいぐるみ', ground: true,
    cols: { main: 'くまの いろ', bow: 'くまの リボンの いろ' },
    make: function (R) { return { c: { main: R.pick(['#c08a5a', '#d9a86c', '#a8714a', '#f0d2b0']), bow: PAL[R.pick(['red', 'blue', 'pink', 'green'])] }, p: { bow: 1 } }; },
    bb: function () { return [-12, -32, 12, 0]; },
    draw: function (g, o) {
      var m = o.c.main;
      F(g, circ(-6.5, -28, 3), m); F(g, circ(6.5, -28, 3), m);
      F(g, ell(0, -9.5, 8.5, 9.5), m);
      F(g, ell(-8, -10, 2.8, 4.5, 0.5), m); F(g, ell(8, -10, 2.8, 4.5, -0.5), m);
      F(g, circ(-5, -2.2, 3), m); F(g, circ(5, -2.2, 3), m);
      F(g, circ(0, -23, 7.3), m);
      F(g, ell(0, -20.6, 3.3, 2.4), '#fff1d6', 0.7);
      F(g, circ(0, -21.4, 1), OUT, false); F(g, circ(-2.8, -25, 0.9), OUT, false); F(g, circ(2.8, -25, 0.9), OUT, false);
      if (o.p.bow) { F(g, poly([0, -15.5, -5, -18, -5, -13]), o.c.bow, 0.7); F(g, poly([0, -15.5, 5, -18, 5, -13]), o.c.bow, 0.7); }
    },
    muts: [mToggle('bow', 'くまの リボン', 3)]
  };

  K.toycar = {
    name: 'くるまの おもちゃ', ground: true, asym: true,
    cols: { main: 'くるまの いろ', hub: 'くるまの タイヤの まんなかの いろ' },
    make: function (R) { return { c: { main: PAL[R.pick(['red', 'blue', 'yellow', 'green', 'orange'])], hub: PAL[R.pick(['white', 'yellow', 'gray'])] }, p: { lt: R.chance(0.6) ? 1 : 0 } }; },
    bb: function () { return [-16, -16, 16, 0]; },
    draw: function (g, o) {
      F(g, sv('M -15 -4 L -15 -9 Q -14 -11 -10 -11 L -7 -16 L 5 -16 L 9 -11 Q 15 -11 15 -7 L 15 -4 Z'), o.c.main);
      F(g, poly([-6, -11, -4.5, -14.5, -0.6, -14.5, -0.6, -11]), '#d8eef8', 0.7);
      F(g, poly([0.8, -11, 0.8, -14.5, 4.4, -14.5, 6.8, -11]), '#d8eef8', 0.7);
      if (o.p.lt) F(g, rr(12.5, -9.5, 2.5, 2, 0.8), '#ffd33d', 0.6);
      F(g, circ(-8, -3.5, 3.6), '#4a4a55'); F(g, circ(8, -3.5, 3.6), '#4a4a55');
      F(g, circ(-8, -3.5, 1.4), o.c.hub, 0.6); F(g, circ(8, -3.5, 1.4), o.c.hub, 0.6);
    },
    muts: [mToggle('lt', 'くるまの ライト', 4)]
  };

  K.blocks = {
    name: 'つみき', ground: true,
    cols: { b0: 'したの つみきの いろ', b1: 'まんなかの つみきの いろ', b2: 'うえの つみきの いろ' },
    make: function (R) {
      var cs = R.shuffle(['red', 'blue', 'yellow', 'green', 'orange', 'purple']);
      return { c: { b0: PAL[cs[0]], b1: PAL[cs[1]], b2: PAL[cs[2]] }, p: { n: R.ri(2, 3), star: R.chance(0.5) ? 1 : 0 } };
    },
    bb: function (o) { return [-7, -9.5 * o.p.n, 7, 0]; },
    draw: function (g, o) {
      var off = [0, 1.2, -0.8];
      for (var i = 0; i < o.p.n; i++) F(g, rr(-4.6 + off[i], -9.4 * (i + 1), 9.2, 9.2, 1), o.c['b' + i]);
      if (o.p.star) F(g, circ(0, -4.7, 1.8), '#ffffff', 0.6);
    },
    muts: [mToggle('star', 'つみきの まる', 4), mCount('n', 1, 3, 'つみきの かず', 1)]
  };

  K.vase = {
    name: 'かびん', ground: true,
    cols: { main: 'かびんの いろ', fl: 'かびんの はなの いろ' },
    make: function (R) { return { c: { main: PAL[R.pick(['sky', 'blue', 'white', 'yellow', 'pink'])], fl: PAL[R.pick(['red', 'yellow', 'pink', 'purple', 'orange'])] }, p: { n: R.ri(2, 3) } }; },
    bb: function () { return [-11, -35, 11, 0]; },
    draw: function (g, o) {
      var S = [[-7, -31, -2], [0, -34, 0], [7, -30, 2]];
      var use = o.p.n === 1 ? [1] : o.p.n === 2 ? [0, 2] : [0, 1, 2];
      for (var k = 0; k < use.length; k++) {
        var s = S[use[k]];
        OL(g, qline(0, -14, s[2], -22, s[0], s[1]), '#58a84e', 1.4);
        F(g, circ(s[0], s[1], 3.2), o.c.fl, 0.8); F(g, circ(s[0], s[1], 1.2), '#f6cf4a', 0.5);
      }
      F(g, sv('M -5 -16 L 5 -16 L 4 -13 Q 10 -8 8 -2 Q 7 0 4 0 L -4 0 Q -7 0 -8 -2 Q -10 -8 -4 -13 Z'), o.c.main);
    },
    muts: [mCount('n', 1, 3, 'かびんの はなの かず', 3)]
  };

  K.cup = {
    name: 'カップ', ground: true, asym: true,
    cols: { main: 'カップの いろ', dt: 'カップの もようの いろ' },
    make: function (R) { return { c: { main: PAL[R.pick(['white', 'sky', 'pink', 'yellow', 'green'])], dt: PAL[R.pick(['red', 'blue', 'orange', 'purple'])] }, p: { sm: R.ri(1, 3), dt: R.chance(0.6) ? 1 : 0 } }; },
    bb: function () { return [-9, -25, 12, 0]; },
    draw: function (g, o) {
      var p = new Path2D(); p.moveTo(6, -9); p.bezierCurveTo(12, -10, 12, -3, 5, -3.5);
      OL(g, p, o.c.main, 1.8);
      F(g, sv('M -7 -12 L 7 -12 L 6 -1 Q 6 0 5 0 L -5 0 Q -6 0 -6 -1 Z'), o.c.main);
      if (o.p.dt) { F(g, circ(-2.5, -6, 1.3), o.c.dt, 0.5); F(g, circ(2.2, -7.6, 1.3), o.c.dt, 0.5); F(g, circ(1, -3.2, 1.1), o.c.dt, 0.5); }
      var X = [-3.5, 0, 3.5];
      for (var i = 0; i < o.p.sm; i++) {
        var x = X[o.p.sm === 1 ? 1 : o.p.sm === 2 ? i * 2 : i];
        L(g, sv('M ' + x + ' -14 Q ' + (x + 2.2) + ' -17 ' + x + ' -19 Q ' + (x - 2.2) + ' -21 ' + x + ' -24'), '#9aa3ad', 1.1);
      }
    },
    muts: [mCount('sm', 0, 3, 'カップの ゆげ', 3), mToggle('dt', 'カップの もよう', 3)]
  };

  K.apple = {
    name: 'りんご', ground: true,
    cols: { main: 'りんごの いろ' },
    make: function (R) { return { c: { main: R.pick(['#e04b3c', '#e04b3c', '#8cc63f', '#f2c230']) }, p: { lf: R.chance(0.7) ? 1 : 0 } }; },
    bb: function () { return [-8, -18, 8, 0]; },
    draw: function (g, o) {
      L(g, qline(0, -12, 0.5, -15, 2, -17), '#77502f', 1.3);
      F(g, sv('M 0 -11 Q -3 -14 -6 -12 Q -9 -9 -7 -4 Q -5 1 -2 0 Q 0 -1 2 0 Q 5 1 7 -4 Q 9 -9 6 -12 Q 3 -14 0 -11 Z'), o.c.main);
      if (o.p.lf) F(g, ell(4, -15, 3.3, 1.6, -0.5), '#6dbb5f', 0.7);
      g.c.fillStyle = 'rgba(255,255,255,0.5)'; g.c.fill(ell(-3.6, -8, 1.2, 2, 0.3));
    },
    muts: [mToggle('lf', 'りんごの はっぱ', 3)]
  };

  K.cake = {
    name: 'ケーキ', ground: true,
    cols: { main: 'ケーキの クリームの いろ' },
    make: function (R) { return { c: { main: PAL[R.pick(['pink', 'white', 'cream', 'yellow'])] }, p: { cn: R.ri(1, 4), sb: R.chance(0.7) ? 1 : 0 } }; },
    bb: function () { return [-14, -27, 14, 0]; },
    draw: function (g, o) {
      F(g, rr(-13, -12, 26, 12, 2), '#f6dfb8');
      F(g, sv('M -13 -12 L 13 -12 L 13 -8 Q 10 -5 8 -8 Q 5 -5 3 -8 Q 0 -5 -2 -8 Q -5 -5 -8 -8 Q -11 -5 -13 -8 Z'), o.c.main);
      var n = o.p.cn;
      for (var i = 0; i < n; i++) {
        var x = n === 1 ? 6 : -9 + i * (18 / (n - 1));
        if (o.p.sb && Math.abs(x) < 3) x += 4;
        F(g, rr(x - 1, -18.5, 2, 6.5, 0.5), '#6fb7ea', 0.6);
        F(g, ell(x, -21, 1.3, 2.1), '#ffb43b', 0.5);
      }
      if (o.p.sb) { F(g, sv('M -2.5 -12 Q -3 -16.5 0 -16.5 Q 3 -16.5 2.5 -12 Z'), '#e04b3c', 0.7); F(g, ell(0, -16.6, 1.6, 0.8), '#6dbb5f', 0.5); }
    },
    muts: [mCount('cn', 1, 4, 'ケーキの ろうそく', 3), mToggle('sb', 'ケーキの いちご', 1)]
  };

  K.teapot = {
    name: 'ポット', ground: true, asym: true,
    cols: { main: 'ポットの いろ', kn: 'ポットの ふたの つまみの いろ' },
    make: function (R) { return { c: { main: PAL[R.pick(['white', 'sky', 'yellow', 'pink', 'green'])], kn: PAL[R.pick(['red', 'blue', 'orange', 'purple'])] }, p: {} }; },
    bb: function () { return [-16, -23, 18, 0]; },
    draw: function (g, o) {
      var h = new Path2D(); h.moveTo(-8, -13); h.bezierCurveTo(-17, -15, -17, -3, -8, -5); OL(g, h, o.c.main, 1.8);
      F(g, sv('M 8 -9 Q 13 -10 17 -17 L 14 -18 Q 11 -12 7 -13 Z'), o.c.main);
      F(g, ell(0, -9, 10, 8.5), o.c.main);
      F(g, rr(-6, -18.5, 12, 3, 1.2), o.c.main);
      F(g, circ(0, -20.5, 2), o.c.kn, 0.7);
    },
    muts: []
  };

  K.lamp = {
    name: 'スタンド', ground: true,
    cols: { shade: 'スタンドの かさの いろ' },
    make: function (R) { return { c: { shade: PAL[R.pick(['yellow', 'orange', 'pink', 'sky', 'green', 'cream'])] }, p: { ch: R.chance(0.6) ? 1 : 0 } }; },
    bb: function () { return [-13, -64, 13, 0]; },
    draw: function (g, o) {
      F(g, ell(0, -2, 8, 2.6), '#77502f');
      F(g, rr(-1.1, -50, 2.2, 48, 0.8), '#77502f');
      if (o.p.ch) { L(g, line(5, -49, 5, -42), OUT, 0.7); F(g, circ(5, -41, 1.2), '#f6cf4a', 0.6); }
      F(g, poly([-12, -48, 12, -48, 7.5, -63, -7.5, -63]), o.c.shade);
    },
    muts: [mToggle('ch', 'スタンドの ひも', 4)]
  };

  K.plant = {
    name: 'うえきばち', ground: true,
    cols: { pot: 'うえきばちの いろ' },
    make: function (R) { return { c: { pot: PAL[R.pick(['orange', 'brown', 'white', 'blue', 'red'])] }, p: { lv: R.ri(3, 5) } }; },
    bb: function () { return [-15, -36, 15, 0]; },
    draw: function (g, o) {
      var A = { 3: [-0.6, 0, 0.6], 4: [-0.8, -0.27, 0.27, 0.8], 5: [-0.9, -0.45, 0, 0.45, 0.9] }[o.p.lv];
      for (var i = 0; i < A.length; i++) {
        var a = A[i], x = Math.sin(a) * 11, y = -13 - Math.cos(a) * 13;
        F(g, ell(x, y, 3.8, 9, a), '#5fb05a');
        L(g, line(x * 0.25, -14, x * 0.8, y + 3), '#3f8f55', 0.6);
      }
      F(g, poly([-9, -14, 9, -14, 7, 0, -7, 0]), o.c.pot);
      F(g, rr(-10, -16, 20, 4, 1), o.c.pot);
    },
    muts: [mCount('lv', 3, 5, 'うえきの はっぱの かず', 3)]
  };

  K.table = {
    name: 'テーブル', ground: true, fixed: true,
    cols: {},
    make: function (R) { return { c: { main: R.pick(['#c98d58', '#b5824f', '#e0b07a']) }, p: {} }; },
    bb: function () { return [-46, -50, 46, 0]; },
    draw: function (g, o) {
      F(g, rr(-40, -44, 5, 44, 1), darker(o.c.main, 0.1)); F(g, rr(35, -44, 5, 44, 1), darker(o.c.main, 0.1));
      F(g, rr(-46, -50, 92, 7, 2), o.c.main);
    },
    muts: []
  };

  K.rug = {
    name: 'しきもの', fixed: true, flat: true,
    cols: {},
    make: function (R) { return { c: { main: PAL[R.pick(['pink', 'sky', 'yellow', 'green', 'purple'])], s: PAL[R.pick(['white', 'cream'])] }, p: {} }; },
    bb: function () { return [-41, -10, 41, 10]; },
    draw: function (g, o) {
      F(g, ell(0, 0, 40, 9), o.c.main);
      L(g, ell(0, 0, 32, 6.4), o.c.s, 1.8);
      L(g, ell(0, 0, 22, 4), o.c.s, 1.2);
    },
    muts: []
  };

  K.bunting = {
    name: 'はたかざり', wall: true, noMove: true, noRemove: true,
    cols: {},
    make: function (R) {
      var cs = R.shuffle(['red', 'yellow', 'sky', 'green', 'pink', 'orange', 'purple', 'blue']), c = {};
      for (var i = 0; i < 7; i++) c['f' + i] = PAL[cs[i % cs.length]];
      return { c: c, p: { n: 7, sag: R.ri(6, 10), dot: '0000000' } };
    },
    bb: function (o) { return [-61, -2, 61, o.p.sag + 15]; },
    draw: function (g, o) {
      var n = o.p.n, sag = o.p.sag;
      var yAt = function (x) { var t = (x + 60) / 120; return 4 * sag * t * (1 - t); };
      L(g, qline(-60, 0, 0, sag * 2, 60, 0), OUT, 0.9);
      for (var i = 0; i < n; i++) {
        var x0 = -54 + i * 16, x1 = x0 + 12, xm = (x0 + x1) / 2;
        F(g, poly([x0, yAt(x0), x1, yAt(x1), xm, (yAt(x0) + yAt(x1)) / 2 + 13]), o.c['f' + i], 0.8);
        if (bit(o.p.dot, i)) F(g, circ(xm, (yAt(x0) + yAt(x1)) / 2 + 4.5, 1.4), '#ffffff', 0.5);
      }
      F(g, circ(-60, 0, 1.6), OUT, false); F(g, circ(60, 0, 1.6), OUT, false);
    },
    muts: [function (o, R) {
      var i = R.i(o.p.n), key = 'f' + i, cur = o.c[key];
      var nc = PAL[R.pick(BRIGHT.filter(function (n) { return PAL[n] !== cur && n !== 'white'; }))];
      return { l: 'はたかざりの はたの いろ', g: 2, f: function (x) { x.c[key] = nc; } };
    }, mBit('dot', 7, 'はたかざりの まる', 4)]
  };

  K.chair = {
    name: 'いす', ground: true, asym: true, noMove: true,
    cols: { main: 'いすの いろ', cu: 'いすの クッションの いろ' },
    make: function (R) { return { c: { main: R.pick(['#c98d58', '#b5824f', '#e0b07a', '#f39a3b', '#6fb7ea']), cu: PAL[R.pick(['red', 'pink', 'green', 'yellow', 'blue'])] }, p: { sl: R.ri(2, 3) } }; },
    bb: function () { return [-14, -50, 14, 0]; },
    draw: function (g, o) {
      var m = o.c.main, d = darker(m, 0.08);
      F(g, rr(-12, -50, 3.6, 50, 1), d); F(g, rr(8.4, -24, 3.6, 24, 1), d); F(g, rr(-7, -24, 3, 24, 1), d);
      for (var i = 0; i < o.p.sl; i++) F(g, rr(-12, -47 + i * 7, 4.5, 4, 1), m);
      F(g, rr(-13, -26, 26, 5, 1.5), m);
      F(g, sv('M -12 -26 Q -12 -31 0 -31 Q 12 -31 12 -26 Z'), o.c.cu);
    },
    muts: [mCount('sl', 1, 3, 'いすの せもたれの いた', 4)]
  };

  K.cat = {
    name: 'ねこ', ground: true, asym: true,
    cols: { body: 'ねこの いろ', collar: 'ねこの くびわの いろ' },
    make: function (R) {
      var b = R.pick(['#f2a65a', '#9aa3ad', '#ffffff', '#5d5a66', '#e8c49a']);
      return { c: { body: b, st: darker(b, 0.2), collar: PAL[R.pick(['red', 'blue', 'green', 'pink', 'yellow'])] }, p: { tail: R.i(2), st: R.ri(0, 3), wh: 1 } };
    },
    bb: function () { return [-21, -42, 16, 0]; },
    draw: function (g, o) {
      var b = o.c.body;
      OL(g, o.p.tail ? sv('M -8 -6 Q -21 -14 -15 -30') : sv('M -7 -3 Q -21 -1 -18 -12'), b, 3);
      F(g, ell(-1, -11, 9.5, 11), b);
      for (var i = 0; i < o.p.st; i++) L(g, qline(-9 + i * 3.2, -17 + i * 0.6, -6.5 + i * 3.2, -13, -8.5 + i * 3.2, -9), o.c.st, 1.6);
      F(g, ell(-4, -1.2, 3.4, 2), b); F(g, ell(3, -1.2, 3.4, 2), b);
      F(g, poly([-3.5, -32, -1.5, -41, 3, -34]), b); F(g, poly([4, -34, 9.5, -40, 10, -31]), b);
      F(g, poly([-2, -34, -1.2, -38.5, 1, -34.8]), '#f29bb8', false); F(g, poly([5.4, -34, 8.6, -37.5, 8.6, -32.5]), '#f29bb8', false);
      F(g, circ(3, -27, 8), b);
      F(g, rr(-3.5, -20.5, 12, 2.8, 1.4), o.c.collar, 0.8);
      F(g, circ(0.5, -28, 1.1), OUT, false); F(g, circ(6.5, -28, 1.1), OUT, false);
      F(g, poly([3, -25.6, 5, -25.6, 4, -24.4]), '#f29bb8', 0.5);
      if (o.p.wh) { L(g, line(8, -25.5, 14, -26.5), OUT, 0.5); L(g, line(8, -24.3, 14, -23.4), OUT, 0.5); }
    },
    muts: [mToggle('tail', 'ねこの しっぽ', 1), mCount('st', 0, 3, 'ねこの しまもよう', 4), mToggle('wh', 'ねこの ひげ', 5)]
  };

  K.dog = {
    name: 'いぬ', ground: true, asym: true,
    cols: { body: 'いぬの いろ', ear: 'いぬの みみの いろ', collar: 'いぬの くびわの いろ' },
    make: function (R) {
      var b = R.pick(['#ffffff', '#e8c49a', '#c08a5a', '#f0d2b0']);
      return { c: { body: b, ear: R.pick(['#77502f', '#a8714a', '#5d5a66']), collar: PAL[R.pick(['red', 'blue', 'green', 'yellow'])] }, p: { spot: R.chance(0.6) ? 1 : 0, tg: R.chance(0.5) ? 1 : 0, tail: R.i(2) } };
    },
    bb: function () { return [-22, -31, 24, 0]; },
    draw: function (g, o) {
      var b = o.c.body;
      OL(g, o.p.tail ? sv('M -13 -16 Q -19 -20 -19 -29') : sv('M -13 -14 Q -20 -13 -22 -6'), b, 2.8);
      F(g, rr(-11, -10, 4, 10, 1.5), b); F(g, rr(-5, -10, 4, 10, 1.5), b); F(g, rr(4, -10, 4, 10, 1.5), b); F(g, rr(9, -10, 4, 10, 1.5), b);
      F(g, ell(0, -14, 14, 7.5), b);
      if (o.p.spot) F(g, ell(-5, -16, 4.2, 3), o.c.ear, 0.7);
      F(g, ell(8.5, -17.5, 2.2, 4.6), o.c.collar, 0.8);
      F(g, circ(13, -23, 7), b);
      F(g, ell(18, -20.5, 4.2, 3.2), b);
      F(g, circ(21.6, -21.6, 1.4), OUT, false);
      F(g, circ(13.5, -25, 1.1), OUT, false);
      F(g, ell(9.5, -24, 3, 5.8, 0.25), o.c.ear);
      if (o.p.tg) F(g, ell(18, -16.8, 1.6, 2.2), '#f27a8f', 0.6);
    },
    muts: [mToggle('spot', 'いぬの もよう', 3), mToggle('tg', 'いぬの した', 4), mToggle('tail', 'いぬの しっぽ', 3)]
  };

  // ═══════════ うみ ═══════════
  K.fish = {
    name: 'さかな', float: true, asym: true,
    cols: { body: 'さかなの いろ', fin: 'さかなの ひれの いろ' },
    make: function (R) {
      var b = R.pick(['orange', 'yellow', 'sky', 'pink', 'red', 'lime', 'purple']);
      return { c: { body: PAL[b], fin: PAL[R.pick(['orange', 'blue', 'red', 'yellow', 'purple', 'pink'])], st: PAL[R.pick(['white', 'navy', 'yellow'])] }, p: { st: R.ri(0, 3), fin: 1 } };
    },
    bb: function () { return [-19, -11, 13, 10]; },
    draw: function (g, o) {
      F(g, poly([-10, 0, -18.5, -7.5, -17, 0, -18.5, 7.5]), o.c.fin);
      if (o.p.fin) F(g, sv('M -4 -6.5 Q 0 -11 5 -6.5 Z'), o.c.fin);
      var b = ell(0, 0, 12, 7.5);
      F(g, b, o.c.body, false);
      clip(g, b, function () {
        for (var i = 0; i < o.p.st; i++) { g.c.fillStyle = o.c.st; g.c.fill(rr(-6.5 + i * 4.4, -9, 2.3, 18, 0)); }
      });
      F(g, b, null);
      F(g, circ(6.4, -1.8, 2.1), '#ffffff', 0.6); F(g, circ(6.9, -1.8, 1), OUT, false);
      L(g, qline(10.5, 2, 9.5, 3, 8.4, 2.6), OUT, 0.7);
    },
    muts: [mCount('st', 0, 3, 'さかなの しまもよう', 3), mToggle('fin', 'さかなの せびれ', 4)]
  };

  K.seaweed = {
    name: 'かいそう', ground: true, noMove: true,
    cols: { main: 'かいそうの いろ' },
    make: function (R) { return { c: { main: PAL[R.pick(['green', 'dgreen', 'lime'])] }, p: { n: R.ri(2, 3), h: R.ri(36, 56) } }; },
    bb: function (o) { return [-13, -o.p.h - 2, 13, 0]; },
    draw: function (g, o) {
      var h = o.p.h, X = o.p.n === 2 ? [-4, 4] : [-7, 0, 7], H = [0.8, 1, 0.7];
      for (var i = 0; i < X.length; i++) {
        var x = X[i], hh = h * H[i % 3], s = i % 2 ? -1 : 1;
        var p = new Path2D(); p.moveTo(x - 2, 0);
        p.bezierCurveTo(x - 2 + 6 * s, -hh * 0.3, x - 2 - 6 * s, -hh * 0.65, x, -hh);
        p.bezierCurveTo(x + 2 - 6 * s, -hh * 0.65, x + 2 + 6 * s, -hh * 0.3, x + 2, 0); p.closePath();
        F(g, p, o.c.main);
      }
    },
    muts: [mCount('n', 2, 3, 'かいそうの かず', 3)]
  };

  K.coral = {
    name: 'さんご', ground: true,
    cols: { main: 'さんごの いろ' },
    make: function (R) { return { c: { main: PAL[R.pick(['pink', 'orange', 'rose', 'red', 'purple'])] }, p: { br: R.ri(3, 5) } }; },
    bb: function () { return [-17, -30, 17, 0]; },
    draw: function (g, o) {
      var B = { 3: [[-9, -24], [0, -29], [9, -22]], 4: [[-12, -20], [-4, -28], [5, -27], [12, -19]], 5: [[-14, -16], [-8, -26], [0, -29], [8, -25], [14, -17]] }[o.p.br];
      var p = new Path2D();
      for (var i = 0; i < B.length; i++) { p.moveTo(0, 0); p.quadraticCurveTo(B[i][0] * 0.3, B[i][1] * 0.5, B[i][0], B[i][1]); }
      L(g, p, OUT, 5.2 + g.lw * 2); L(g, p, o.c.main, 5.2);
    },
    muts: [mCount('br', 3, 5, 'さんごの えだの かず', 3)]
  };

  K.shell = {
    name: 'かい', ground: true,
    cols: { main: 'かいの いろ' },
    make: function (R) { return { c: { main: PAL[R.pick(['pink', 'cream', 'orange', 'white', 'purple'])] }, p: { r: R.ri(4, 5) } }; },
    bb: function () { return [-10, -14, 10, 0]; },
    draw: function (g, o) {
      F(g, sv('M 0 -1 L -9 -7 Q -8 -14 0 -14 Q 8 -14 9 -7 Z'), o.c.main);
      for (var i = 0; i < o.p.r; i++) { var x = -6 + i * (12 / (o.p.r - 1)); L(g, line(0, -2, x, -12.5), OUT, 0.6); }
      F(g, rr(-3, -2, 6, 2.5, 1), o.c.main, 0.8);
    },
    muts: [mCount('r', 3, 6, 'かいの すじの かず', 5)]
  };

  K.starfish = {
    name: 'ひとで', float: true, tilt: true,
    cols: { main: 'ひとでの いろ' },
    make: function (R) { return { c: { main: PAL[R.pick(['orange', 'red', 'yellow', 'pink', 'purple'])] }, p: { d: R.chance(0.6) ? 1 : 0 } }; },
    bb: function () { return [-11, -11, 11, 10]; },
    draw: function (g, o) {
      var pts = [];
      for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 4.4 : 10.5; pts.push(Math.cos(a) * r, Math.sin(a) * r); }
      var p = poly(pts); g.c.lineJoin = 'round';
      F(g, p, o.c.main);
      if (o.p.d) for (var j = 0; j < 5; j++) { var b = -Math.PI / 2 + j * TAU / 5; g.c.fillStyle = '#ffffff'; g.c.fill(circ(Math.cos(b) * 5.5, Math.sin(b) * 5.5, 0.9)); }
    },
    muts: [mToggle('d', 'ひとでの もよう', 4)]
  };

  K.crab = {
    name: 'かに', ground: true,
    cols: { main: 'かにの いろ' },
    make: function (R) { return { c: { main: PAL[R.pick(['red', 'orange', 'red'])] }, p: { up: R.i(2) } }; },
    bb: function () { return [-19, -23, 19, 0]; },
    draw: function (g, o) {
      var m = o.c.main;
      for (var i = 0; i < 3; i++) { L(g, line(-7, -4 - i * 2, -14 + i, -0.5), OUT, 1.2); L(g, line(7, -4 - i * 2, 14 - i, -0.5), OUT, 1.2); }
      if (o.p.up) {
        L(g, sv('M -8 -9 L -13 -16'), OUT, 1.6); L(g, sv('M 8 -9 L 13 -16'), OUT, 1.6);
        F(g, sv('M -13 -15 Q -18 -18 -15 -22 L -13 -18 L -11 -21 Q -9 -17 -13 -15 Z'), m); F(g, sv('M 13 -15 Q 18 -18 15 -22 L 13 -18 L 11 -21 Q 9 -17 13 -15 Z'), m);
      } else {
        L(g, sv('M -9 -7 L -14 -9'), OUT, 1.6); L(g, sv('M 9 -7 L 14 -9'), OUT, 1.6);
        F(g, sv('M -14 -8 Q -19 -9 -18 -13 L -15 -11 L -15 -14 Q -11 -12 -14 -8 Z'), m); F(g, sv('M 14 -8 Q 19 -9 18 -13 L 15 -11 L 15 -14 Q 11 -12 14 -8 Z'), m);
      }
      L(g, line(-3, -11, -3.5, -15), OUT, 0.9); L(g, line(3, -11, 3.5, -15), OUT, 0.9);
      F(g, ell(0, -7, 10, 6.2), m);
      F(g, circ(-3.5, -16, 1.8), '#ffffff', 0.6); F(g, circ(3.5, -16, 1.8), '#ffffff', 0.6);
      F(g, circ(-3.5, -16, 0.8), OUT, false); F(g, circ(3.5, -16, 0.8), OUT, false);
    },
    muts: [mToggle('up', 'かにの はさみ', 1)]
  };

  K.octopus = {
    name: 'たこ', ground: true,
    cols: { main: 'たこの いろ' },
    make: function (R) { var s = ''; for (var i = 0; i < 3; i++) s += R.chance(0.7) ? '1' : '0'; return { c: { main: PAL[R.pick(['red', 'pink', 'purple', 'orange'])] }, p: { sp: s } }; },
    bb: function () { return [-17, -32, 17, 0]; },
    draw: function (g, o) {
      var m = o.c.main, X = [-12, -6, 0, 6, 12], i;
      var p = new Path2D();
      for (i = 0; i < 5; i++) { p.moveTo(X[i] * 0.5, -14); p.quadraticCurveTo(X[i] * 1.1, -6, X[i] * 1.25 + (i % 2 ? 2.5 : -2.5), -1); }
      L(g, p, OUT, 3.4 + g.lw * 2); L(g, p, m, 3.4);
      F(g, ell(0, -21, 10.5, 11), m);
      var S = [[-5, -25, 1.8], [4, -27, 1.4], [6, -19, 1.2]];
      for (i = 0; i < 3; i++) if (bit(o.p.sp, i)) { g.c.fillStyle = 'rgba(255,255,255,0.6)'; g.c.fill(circ(S[i][0], S[i][1], S[i][2])); }
      F(g, circ(-3.5, -18, 1.8), '#ffffff', 0.6); F(g, circ(3.5, -18, 1.8), '#ffffff', 0.6);
      F(g, circ(-3.3, -18, 0.8), OUT, false); F(g, circ(3.7, -18, 0.8), OUT, false);
    },
    muts: [mBit('sp', 3, 'たこの あたまの もよう', 4)]
  };

  K.bubbles = {
    name: 'あわ', float: true,
    cols: {},
    make: function (R) { return { c: {}, p: { n: R.ri(3, 5) } }; },
    bb: function () { return [-6, -30, 7, 5]; },
    draw: function (g, o) {
      var B = [[0, 0, 3.6], [3, -9, 2.7], [-1, -16, 2.1], [2, -22, 1.6], [-2, -27, 1.3]];
      for (var i = 0; i < o.p.n; i++) {
        var p = circ(B[i][0], B[i][1], B[i][2]);
        g.c.fillStyle = 'rgba(255,255,255,0.35)'; g.c.fill(p); L(g, p, '#ffffff', 0.9);
      }
    },
    muts: [mCount('n', 2, 5, 'あわの かず', 3)]
  };

  K.chest = {
    name: 'たからばこ', ground: true, noMove: true,
    cols: { gem: 'たからばこの ほうせきの いろ' },
    make: function (R) { return { c: { main: '#a8714a', gem: PAL[R.pick(['red', 'sky', 'green', 'purple'])] }, p: { lk: 1 } }; },
    bb: function () { return [-16, -24, 16, 0]; },
    draw: function (g, o) {
      F(g, rr(-15, -14, 30, 14, 1.5), o.c.main);
      F(g, sv('M -15 -14 Q -15 -24 0 -24 Q 15 -24 15 -14 Z'), darker(o.c.main, 0.06));
      F(g, rr(-11, -24, 3, 24, 0), '#f6cf4a', 0.7); F(g, rr(8, -24, 3, 24, 0), '#f6cf4a', 0.7);
      if (o.p.lk) F(g, rr(-2.6, -15.5, 5.2, 5.5, 1), '#f6cf4a', 0.7);
      F(g, circ(0, -20, 2), o.c.gem, 0.6);
    },
    muts: [mToggle('lk', 'たからばこの かぎ', 4)]
  };

  K.jelly = {
    name: 'くらげ', float: true,
    cols: { main: 'くらげの いろ' },
    make: function (R) { return { c: { main: R.pick(['#f6b3d0', '#c9b6f2', '#b6e3f2']) }, p: { t: R.ri(3, 5) } }; },
    bb: function () { return [-12, -11, 12, 23]; },
    draw: function (g, o) {
      var n = o.p.t;
      for (var i = 0; i < n; i++) {
        var x = -7 + i * (14 / (n - 1));
        L(g, sv('M ' + x + ' 2 Q ' + (x + 3) + ' 8 ' + x + ' 14 Q ' + (x - 3) + ' 18 ' + x + ' 22'), '#b48ab0', 1.2);
      }
      F(g, sv('M -11 2 Q -11 -10 0 -10 Q 11 -10 11 2 Q 5.5 5 0 2 Q -5.5 5 -11 2 Z'), o.c.main);
      F(g, circ(-3, -3, 1), OUT, false); F(g, circ(3, -3, 1), OUT, false);
    },
    muts: [mCount('t', 2, 5, 'くらげの あしの かず', 3)]
  };

  // ═══════════ よるの まち ═══════════
  K.building = {
    name: 'ビル', ground: true, noMove: true,
    cols: { main: 'ビルの いろ' },
    make: function (R) {
      var w = R.ri(34, 54), h = R.ri(70, 150);
      var cols = Math.floor((w - 6) / 10), rows = Math.floor((h - 14) / 14), s = '';
      for (var i = 0; i < cols * rows; i++) s += R.chance(0.5) ? '1' : '0';
      return { c: { main: R.pick(['#465a8c', '#5a5486', '#3f6f86', '#6a6f86', '#4e5f78']) }, p: { w: w, h: h, cols: cols, rows: rows, lit: s, an: R.chance(0.4) ? 1 : 0 } };
    },
    bb: function (o) { return [-o.p.w / 2 - 1, -o.p.h - (o.p.an ? 15 : 3), o.p.w / 2 + 1, 0]; },
    draw: function (g, o) {
      var w = o.p.w, h = o.p.h, cols = o.p.cols, rows = o.p.rows;
      if (o.p.an) { L(g, line(w / 4, -h, w / 4, -h - 12), OUT, 1.2); F(g, circ(w / 4, -h - 12.5, 1.6), '#ff6b5a', 0.6); }
      F(g, rr(-w / 2, -h, w, h, 1), o.c.main);
      F(g, rr(-w / 2 - 1, -h - 2.5, w + 2, 3, 0.8), darker(o.c.main, 0.08));
      var gx = (w - cols * 6) / (cols + 1);
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
        var on = bit(o.p.lit, r * cols + c);
        F(g, rr(-w / 2 + gx + c * (6 + gx), -h + 8 + r * 14, 6, 8, 0.6), on ? '#ffd86b' : '#2a3150', 0.6);
      }
    },
    muts: [function (o, R) { var n = o.p.cols * o.p.rows; if (!n) return null; var i = R.i(n); return { l: 'ビルの まどの あかり', g: 3, f: function (x) { x.p.lit = flipBit(x.p.lit, i); } }; },
      mToggle('an', 'ビルの アンテナ', 3)]
  };

  K.house = {
    name: 'いえ', ground: true, noMove: true,
    cols: { roof: 'やねの いろ', door: 'ドアの いろ' },
    make: function (R, opt) { return { c: { wall: opt && opt.night ? R.pick(['#c9c2a8', '#b7b9c9', '#d6c4a8']) : R.pick(['#fff1d6', '#ffe0b3', '#e8f1f7']), roof: PAL[R.pick(['red', 'blue', 'brown', 'green', 'orange'])], door: PAL[R.pick(['brown', 'red', 'blue', 'green'])] }, p: { ch: R.chance(0.6) ? 1 : 0, win: R.i(2) } }; },
    bb: function () { return [-23, -46, 23, 0]; },
    draw: function (g, o) {
      if (o.p.ch) F(g, rr(9, -44, 5.5, 12, 0.6), '#a8714a');
      F(g, rr(-18, -27, 36, 27, 1), o.c.wall);
      F(g, poly([-23, -26, 0, -44, 23, -26]), o.c.roof);
      F(g, rr(-11, -15, 9, 15, 1.5), o.c.door); F(g, circ(-4.4, -7.5, 0.8), '#f6cf4a', 0.4);
      F(g, rr(5, -21, 9, 8, 0.8), o.p.win ? '#ffd86b' : '#3a4366');
      L(g, line(9.5, -21, 9.5, -13), OUT, 0.6);
    },
    muts: [mToggle('ch', 'えんとつ', 1), mToggle('win', 'いえの まどの あかり', 3)]
  };

  K.slamp = {
    name: 'がいとう', ground: true, noMove: true,
    cols: {},
    make: function (R) { return { c: {}, p: { on: R.chance(0.8) ? 1 : 0 } }; },
    bb: function () { return [-19, -76, 19, 0]; },
    draw: function (g, o) {
      if (o.p.on) {
        var gr = g.c.createRadialGradient(0, -60, 1, 0, -60, 17);
        gr.addColorStop(0, 'rgba(255,224,130,0.75)'); gr.addColorStop(1, 'rgba(255,224,130,0)');
        g.c.fillStyle = gr; g.c.fill(circ(0, -60, 17));
      }
      F(g, rr(-1.6, -58, 3.2, 58, 1), '#5d6270');
      F(g, rr(-5, -3, 10, 3, 1), '#5d6270');
      F(g, poly([-6, -58, 6, -58, 4, -66, -4, -66]), '#5d6270');
      F(g, ell(0, -59.5, 3.5, 2), o.p.on ? '#fff3b0' : '#9aa3ad', 0.6);
    },
    muts: [mToggle('on', 'がいとうの あかり', 1)]
  };

  K.moon = {
    name: 'つき', float: true, asym: true, noMove: true,
    cols: {},
    make: function () { return { c: {}, p: { full: 0 } }; },
    bb: function () { return [-17, -17, 17, 17]; },
    draw: function (g, o) {
      if (o.p.full) { F(g, circ(0, 0, 15), '#fff3b0'); return; }
      var p = new Path2D(); p.arc(0, 0, 15, 0, TAU); p.arc(7, -4, 13, 0, TAU, true);
      g.c.fillStyle = '#fff3b0'; g.c.fill(p, 'evenodd'); g.c.lineWidth = g.lw; g.c.strokeStyle = OUT; g.c.stroke(p);
    },
    muts: []
  };

  K.star = {
    name: 'ほし', float: true,
    cols: {},
    make: function (R) { return { c: { main: R.pick(['#ffe27a', '#fff3b0', '#ffd33d']) }, p: {} }; },
    bb: function () { return [-6, -6, 6, 6]; },
    draw: function (g, o) {
      var pts = [];
      for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 2.3 : 5.4; pts.push(Math.cos(a) * r, Math.sin(a) * r); }
      F(g, poly(pts), o.c.main, 0.6);
    },
    muts: []
  };

  K.car = {
    name: 'くるま', ground: true, asym: true,
    cols: { main: 'くるまの いろ' },
    make: function (R) { return { c: { main: PAL[R.pick(['red', 'blue', 'yellow', 'green', 'white', 'orange'])] }, p: { lt: R.chance(0.7) ? 1 : 0 } }; },
    bb: function () { return [-25, -21, 36, 0]; },
    draw: function (g, o) {
      if (o.p.lt) { g.c.fillStyle = 'rgba(255,235,150,0.5)'; g.c.fill(poly([23, -9, 36, -14, 36, -2])); }
      F(g, sv('M -24 -5 L -24 -12 Q -23 -14 -18 -14 L -11 -21 L 8 -21 L 15 -14 Q 23 -14 24 -10 L 24 -5 Z'), o.c.main);
      F(g, poly([-9.5, -14, -6.5, -19, -1, -19, -1, -14]), '#d8eef8', 0.7);
      F(g, poly([1, -14, 1, -19, 7, -19, 11, -14]), '#d8eef8', 0.7);
      F(g, rr(21.5, -11.5, 2.5, 3, 0.8), o.p.lt ? '#fff3b0' : '#b8bec6', 0.6);
      F(g, circ(-13, -4.5, 4.6), '#3a3a44'); F(g, circ(13, -4.5, 4.6), '#3a3a44');
      F(g, circ(-13, -4.5, 1.8), '#c9ced6', 0.6); F(g, circ(13, -4.5, 1.8), '#c9ced6', 0.6);
    },
    muts: [mToggle('lt', 'くるまの ライト', 3)]
  };

  K.owl = {
    name: 'ふくろう', float: true,
    cols: { main: 'ふくろうの いろ' },
    make: function (R) { return { c: { main: R.pick(['#a8714a', '#8a6a52', '#9aa3ad']) }, p: { ey: R.i(2) } }; },
    bb: function () { return [-10, -14, 10, 12]; },
    draw: function (g, o) {
      var m = o.c.main;
      F(g, poly([-7, -9, -8, -15, -3, -11]), m); F(g, poly([7, -9, 8, -15, 3, -11]), m);
      F(g, ell(0, 0, 9, 11.5), m);
      F(g, ell(0, 4, 5.5, 6.5), '#f0d2b0', 0.6);
      F(g, circ(-3.6, -4, 3.4), '#ffffff', 0.6); F(g, circ(3.6, -4, 3.4), '#ffffff', 0.6);
      if (o.p.ey) { L(g, qline(-5.5, -4, -3.6, -2.5, -1.8, -4), OUT, 0.9); L(g, qline(1.8, -4, 3.6, -2.5, 5.5, -4), OUT, 0.9); }
      else { F(g, circ(-3.6, -4, 1.4), OUT, false); F(g, circ(3.6, -4, 1.4), OUT, false); }
      F(g, poly([-1.3, -1.5, 1.3, -1.5, 0, 1]), '#f39a3b', 0.5);
    },
    muts: [mToggle('ey', 'ふくろうの め', 3)]
  };

  // ── 背景 ──
  var BG = {};
  BG.room = function (g, b) {
    var c = g.c;
    c.fillStyle = b.wall; c.fillRect(0, 0, 400, 200);
    c.fillStyle = b.pat;
    if (b.pk === 0) { for (var y = 12; y < 196; y += 22) for (var x = (y / 22) % 2 ? 22 : 11; x < 400; x += 22) c.fill(circ(x, y, 1.6)); }
    else { for (var x2 = 10; x2 < 400; x2 += 26) c.fillRect(x2, 0, 7, 200); }
    c.fillStyle = b.floor; c.fillRect(0, 200, 400, 100);
    c.strokeStyle = 'rgba(74,58,48,0.22)'; c.lineWidth = 1;
    for (var i = 1; i < 5; i++) { c.beginPath(); c.moveTo(0, 200 + i * 20); c.lineTo(400, 200 + i * 20); c.stroke(); }
    c.fillStyle = b.base; c.fillRect(0, 194, 400, 7);
    c.strokeStyle = OUT; c.lineWidth = 1.2; c.beginPath(); c.moveTo(0, 194); c.lineTo(400, 194); c.moveTo(0, 201); c.lineTo(400, 201); c.stroke();
  };
  BG.park = function (g, b) {
    var c = g.c, gr = c.createLinearGradient(0, 0, 0, 180);
    gr.addColorStop(0, '#8fd0f3'); gr.addColorStop(1, '#d8f0fb');
    c.fillStyle = gr; c.fillRect(0, 0, 400, 300);
    c.fillStyle = '#a9d98a'; c.strokeStyle = OUT; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(0, 175); c.quadraticCurveTo(b.h1, 120, 220, 168); c.quadraticCurveTo(320, 130, 400, 160); c.lineTo(400, 300); c.lineTo(0, 300); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#86c66b';
    c.beginPath(); c.moveTo(0, 196); c.quadraticCurveTo(200, 178, 400, 192); c.lineTo(400, 300); c.lineTo(0, 300); c.closePath(); c.fill(); c.stroke();
    if (b.pond) {
      c.fillStyle = '#7cc3e8'; c.beginPath(); c.ellipse(b.px, 238, 58, 16, 0, 0, TAU); c.fill(); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(b.px - 30, 236); c.lineTo(b.px - 14, 236); c.moveTo(b.px + 12, 243); c.lineTo(b.px + 30, 243); c.stroke();
    }
  };
  BG.sea = function (g, b) {
    var c = g.c, gr = c.createLinearGradient(0, 0, 0, 260);
    gr.addColorStop(0, '#5fc3e4'); gr.addColorStop(1, '#2a7fb8');
    c.fillStyle = gr; c.fillRect(0, 0, 400, 300);
    c.fillStyle = 'rgba(255,255,255,0.12)';
    for (var i = 0; i < 4; i++) { var x = 40 + i * 100 + b.ray; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 30, 0); c.lineTo(x - 30, 250); c.lineTo(x - 52, 250); c.closePath(); c.fill(); }
    c.fillStyle = '#f2dca5'; c.strokeStyle = OUT; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(0, 258); c.quadraticCurveTo(100, 244, 200, 256); c.quadraticCurveTo(300, 266, 400, 250); c.lineTo(400, 300); c.lineTo(0, 300); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = 'rgba(168,113,74,0.25)';
    for (var j = 0; j < 14; j++) c.fill(circ(15 + j * 28 + (j % 3) * 4, 275 + (j % 4) * 5, 1.3));
  };
  BG.night = function (g, b) {
    var c = g.c, gr = c.createLinearGradient(0, 0, 0, 260);
    gr.addColorStop(0, '#1d2550'); gr.addColorStop(1, '#4a4f8c');
    c.fillStyle = gr; c.fillRect(0, 0, 400, 300);
    c.fillStyle = '#2c3263';
    c.beginPath(); c.moveTo(0, 262);
    var S = b.sky;
    for (var i = 0; i < S.length; i++) { c.lineTo(i * 40, 262 - S[i]); c.lineTo(i * 40 + 40, 262 - S[i]); }
    c.lineTo(400, 262); c.closePath(); c.fill();
    c.fillStyle = '#5d6270'; c.fillRect(0, 262, 400, 38);
    c.fillStyle = '#7a8090'; c.fillRect(0, 258, 400, 6);
    c.strokeStyle = OUT; c.lineWidth = 1.2; c.beginPath(); c.moveTo(0, 258); c.lineTo(400, 258); c.stroke();
    c.fillStyle = '#e8e2c8'; for (var k = 0; k < 8; k++) c.fillRect(10 + k * 52, 282, 26, 3);
  };

  /** 絵を1枚描く。scale＝ 400×300 を何倍で描くか。 */
  function render(ctx, sc, scale) {
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    BG[sc.bg.k]({ c: ctx, lw: 1.4 }, sc.bg);
    var list = sc.objs.slice().sort(function (a, b) { return (a.z - b.z) || (a.id - b.id); });
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o.hidden) continue;
      ctx.save();
      ctx.translate(o.x, o.y);
      if (o.r) ctx.rotate(o.r * Math.PI / 180);
      ctx.scale(o.f ? -o.s : o.s, o.s);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      K[o.t].draw({ c: ctx, lw: 1.4 / o.s }, o);
      ctx.restore();
    }
    ctx.restore();
  }

  var MK = { K: K, BG: BG, PAL: PAL, BRIGHT: BRIGHT, render: render, flipBit: flipBit, OUT: OUT };
  if (typeof module !== 'undefined' && module.exports) module.exports = MK;
  G.MK = MK;
})(typeof window !== 'undefined' ? window : globalThis);
