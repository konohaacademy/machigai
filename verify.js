// まちがいさがし — 左右の絵を1ドットずつ比べる。
// 問題を作るとき（tools/build.js）：候補を1つずつ当てて、どこが・どれくらい目立って変わるかを測り、★に合うものだけ使う。
// 遊ぶとき（app.js）：台帳の問題を描いて、決めた場所の外で1ドットでも違えば その問題は出さない。
// ⚠ Gemini で起きた「答えではない所まで変わっている」は、ここで必ず止まる。
(function (G) {
  'use strict';
  var MU = G.MU, MK = G.MK;
  var S = 1.5, W = 600, H = 450; // 400×300 を 1.5 倍で比べる
  var cv = null, cx = null;
  function ctx() {
    if (!cx) {
      cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      cx = cv.getContext('2d', { willReadFrequently: true });
    }
    return cx;
  }
  /** 絵を描いて、ドットの並び（RGBA）を返す */
  function snap(sc) {
    var c = ctx();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, W, H);
    MK.render(c, sc, S);
    return c.getImageData(0, 0, W, H).data;
  }
  var labCache = new Map();
  function labOf(u) {
    var v = labCache.get(u);
    if (!v) { v = MU.lab(u & 255, (u >>> 8) & 255, (u >>> 16) & 255); labCache.set(u, v); if (labCache.size > 200000) labCache.clear(); }
    return v;
  }
  /**
   * 2枚を比べる。n＝目に見えて変わったドット（色の差3以上）、raw＝少しでも違うドット、
   * eff＝目立ち（色の差を40で頭打ちにした重みの合計 ÷ 全ドット）、de＝変わったところの色の差の平均、
   * box＝変わったところを囲む四角（400×300 の座標）。
   */
  function cmp(a, b) {
    var A = new Uint32Array(a.buffer, a.byteOffset, a.length / 4), B = new Uint32Array(b.buffer, b.byteOffset, b.length / 4);
    var n = 0, raw = 0, eff = 0, sum = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (var i = 0; i < A.length; i++) {
      if (A[i] === B[i]) continue;
      raw++;
      var p = labOf(A[i]), q = labOf(B[i]);
      var d = Math.sqrt((p[0] - q[0]) * (p[0] - q[0]) + (p[1] - q[1]) * (p[1] - q[1]) + (p[2] - q[2]) * (p[2] - q[2]));
      if (d < 3) continue;
      n++; sum += d; eff += d > 40 ? 1 : d / 40;
      var x = i % W, y = (i / W) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return { n: n, raw: raw, eff: eff / (W * H), de: n ? sum / n : 0, box: n ? [x0 / S, y0 / S, (x1 + 1) / S, (y1 + 1) / S] : null };
  }
  /** 決めた四角（pad だけ広げる）の外で、少しでも違うドットの数。0 でなければ その問題は使えない。 */
  function outside(a, b, boxes, pad) {
    var A = new Uint32Array(a.buffer, a.byteOffset, a.length / 4), B = new Uint32Array(b.buffer, b.byteOffset, b.length / 4);
    var bx = boxes.map(function (r) { return [(r[0] - pad) * S, (r[1] - pad) * S, (r[2] + pad) * S, (r[3] + pad) * S]; });
    var out = 0;
    for (var i = 0; i < A.length; i++) {
      if (A[i] === B[i]) continue;
      var x = i % W + 0.5, y = ((i / W) | 0) + 0.5, ok = false;
      for (var j = 0; j < bx.length; j++) if (x >= bx[j][0] && x <= bx[j][2] && y >= bx[j][1] && y <= bx[j][3]) { ok = true; break; }
      if (!ok) out++;
    }
    return out;
  }
  /** 四角の中で、目に見えて変わったドットの数 */
  function inBox(a, b, r) {
    var A = new Uint32Array(a.buffer, a.byteOffset, a.length / 4), B = new Uint32Array(b.buffer, b.byteOffset, b.length / 4);
    var n = 0, X0 = Math.max(0, Math.floor(r[0] * S)), Y0 = Math.max(0, Math.floor(r[1] * S)), X1 = Math.min(W, Math.ceil(r[2] * S)), Y1 = Math.min(H, Math.ceil(r[3] * S));
    for (var y = Y0; y < Y1; y++) for (var x = X0; x < X1; x++) {
      var i = y * W + x;
      if (A[i] === B[i]) continue;
      var p = labOf(A[i]), q = labOf(B[i]);
      if ((p[0] - q[0]) * (p[0] - q[0]) + (p[1] - q[1]) * (p[1] - q[1]) + (p[2] - q[2]) * (p[2] - q[2]) >= 9) n++;
    }
    return n;
  }

  /**
   * 遊ぶ前の点検。台帳の問題をこの端末で描いて、①決めた場所の外が1ドットも違わない ②どのちがいも目に見える、を確かめる。
   */
  function check(pz) {
    var a = snap(pz.A), b = snap(pz.B), boxes = pz.diffs.map(function (d) { return d.box; });
    var out = outside(a, b, boxes, 1.5);
    if (out > 0) return { ok: false, why: '決めた場所の外で ' + out + ' ドット違う' };
    for (var i = 0; i < boxes.length; i++) if (inBox(a, b, boxes[i]) < 6) return { ok: false, why: (i + 1) + 'つめの ちがいが見えない' };
    return { ok: true };
  }

  var MV = { S: S, W: W, H: H, snap: snap, cmp: cmp, outside: outside, inBox: inBox, check: check };
  if (typeof module !== 'undefined' && module.exports) module.exports = MV;
  G.MV = MV;
})(typeof window !== 'undefined' ? window : globalThis);
