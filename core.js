// まちがいさがし — 乱数と色の道具。
// ⚠ 問題を作る側（gen.js）は、ここの関数と四則演算だけで決める。Math.sin などはブラウザで値が少し違うことがあり、
//   同じ番号の問題がスマホとPCで別の絵になる。sin・cos を使うのは絵を描くとき（kinds.js）だけ。
(function (G) {
  'use strict';

  /** 種から決まる乱数（mulberry32）。同じ種なら、どの端末でも同じ並び。 */
  function rng(seed) {
    var a = seed >>> 0;
    var f = function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.i = function (n) { return Math.floor(f() * n); };              // 0..n-1
    f.r = function (a, b) { return a + f() * (b - a); };             // a..b
    f.ri = function (a, b) { return a + f.i(b - a + 1); };           // a..b（整数）
    f.pick = function (arr) { return arr[f.i(arr.length)]; };
    f.chance = function (p) { return f() < p; };
    f.shuffle = function (arr) {
      for (var i = arr.length - 1; i > 0; i--) { var j = f.i(i + 1); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
      return arr;
    };
    return f;
  }

  /** 文字列から種を作る（FNV-1a）。 */
  function hash(s) {
    var h = 2166136261;
    s = String(s);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // ── 色（#rrggbb ⇔ HSL）。生成で使うので四則演算だけ ──
  function hex2rgb(h) {
    h = h.replace('#', '');
    return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  }
  function rgb2hex(r, g, b) {
    var t = function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); };
    return '#' + t(r) + t(g) + t(b);
  }
  function hex2hsl(h) {
    var c = hex2rgb(h), r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, s = 0, hu = 0, d = mx - mn;
    if (d > 0) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) hu = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) hu = (b - r) / d + 2;
      else hu = (r - g) / d + 4;
      hu *= 60;
    }
    return [hu, s, l];
  }
  function hsl2hex(h, s, l) {
    h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
    var f = function (p, q, t) {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q, k = h / 360;
    return rgb2hex(f(p, q, k + 1 / 3) * 255, f(p, q, k) * 255, f(p, q, k - 1 / 3) * 255);
  }
  /** 少しだけ色を変える（色合いを dh 度・明るさを dl）。むずかしい段の「よく見ると色がちがう」。 */
  function shift(hex, dh, dl) {
    var c = hex2hsl(hex);
    return hsl2hex(c[0] + dh, c[1], c[2] + dl);
  }

  // ── 人の目で見た色の差（CIE76 の ΔE）。確かめる側で使う ──
  function lin(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function lab(r, g, b) {
    var R = lin(r), Gg = lin(g), B = lin(b);
    var x = (R * 0.4124 + Gg * 0.3576 + B * 0.1805) / 0.95047;
    var y = (R * 0.2126 + Gg * 0.7152 + B * 0.0722);
    var z = (R * 0.0193 + Gg * 0.1192 + B * 0.9505) / 1.08883;
    var f = function (t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; };
    var fx = f(x), fy = f(y), fz = f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  function deHex(a, b) {
    var p = hex2rgb(a), q = hex2rgb(b), A = lab(p[0], p[1], p[2]), B = lab(q[0], q[1], q[2]);
    return Math.sqrt((A[0] - B[0]) * (A[0] - B[0]) + (A[1] - B[1]) * (A[1] - B[1]) + (A[2] - B[2]) * (A[2] - B[2]));
  }

  var MU = { rng: rng, hash: hash, hex2rgb: hex2rgb, rgb2hex: rgb2hex, hex2hsl: hex2hsl, hsl2hex: hsl2hex, shift: shift, lab: lab, deHex: deHex };
  if (typeof module !== 'undefined' && module.exports) module.exports = MU;
  G.MU = MU;
})(typeof window !== 'undefined' ? window : globalThis);
