// まちがいさがし — 場面を組み立て、ちがいの候補を並べる。
// ⚠ ここは乱数（MU.rng）と四則演算だけで決める。同じ種なら、どの端末でも同じ場面・同じ候補の並びになる
//   （問題の台帳 bank.js は「種」と「候補の何番目を使うか」しか持っていない）。
// どの候補を使うかは、絵をドットで比べて決める（verify.js・tools/build.js）。ここでは決めない。
(function (G) {
  'use strict';
  var MU = G.MU, MK = G.MK, K = MK.K, PAL = MK.PAL;

  var W = 400, H = 300;
  var SCENES = ['room', 'park', 'sea', 'night'];
  var SCENE_NAME = { room: 'へや', park: 'こうえん', sea: 'うみの なか', night: 'よるの まち' };

  // ★ごとの決まり。eff＝ちがいの「目立ち」（変わったドットを色の差で重み付けして、絵ぜんたいに占める割合）。
  // de＝変わったところの色の差の平均（これより小さいと、見えないほど うすい ちがいになる）。
  // gap＝ちがいどうしの すきま（近すぎると、どれを押したのか分からない）。pad＝押してよい はみ出し。
  var LV = {
    1: { n: 3, dens: 0.3, sz: 1.32, eff: [0.0045, 0.2], de: 30, gap: 12, pad: 16, grade: 1, label: 'ねんちょうさんから', mark: '★' },
    2: { n: 4, dens: 0.48, sz: 1.18, eff: [0.0028, 0.045], de: 24, gap: 9, pad: 13, grade: 2, label: 'しょうがくせい', mark: '★★' },
    3: { n: 5, dens: 0.66, sz: 1.07, eff: [0.0016, 0.012], de: 17, gap: 7, pad: 10, grade: 5, label: 'ちょっと むずかしい', mark: '★★★' },
    4: { n: 7, dens: 0.84, sz: 1.0, eff: [0.0008, 0.0055], de: 13, gap: 6, pad: 8, grade: 5, label: 'むずかしい', mark: '★★★★' },
    5: { n: 9, dens: 1.0, sz: 0.94, eff: [0.00035, 0.0026], de: 11, gap: 5, pad: 7, grade: 5, label: 'おとなでも なやむ', mark: '★★★★★' }
  };
  // 同じ種類の ちがいばかりにならないように（n に対する上限）
  var CAP = { rm: 0.4, add: 0.3, col: 0.4, sub: 0.34, mv: 0.25, sc: 0.2, fl: 0.25, rot: 0.15, pt: 0.75 };

  function bbW(o) {
    var b = K[o.t].bb(o), s = o.s;
    var x0 = b[0] * s, x1 = b[2] * s;
    if (o.f) { var t = -x1; x1 = -x0; x0 = t; }
    return [o.x + x0, o.y + b[1] * s, o.x + x1, o.y + b[3] * s];
  }
  function hit(a, b, m) { return a[0] < b[2] + m && b[0] < a[2] + m && a[1] < b[3] + m && b[1] < a[3] + m; }
  function inside(b, m) { return b[0] >= m && b[1] >= m && b[2] <= W - m && b[3] <= H - m; }

  /** 場面を作る道具。物を置きながら、重なりすぎないように場所を覚える。 */
  function Stage(R, lv) {
    this.R = R; this.lv = LV[lv]; this.objs = []; this.id = 0; this.boxes = [];
  }
  Stage.prototype.obj = function (t, x, y, s, extra) {
    var R = this.R, k = K[t], m = k.make(R, extra && extra.opt);
    var o = { id: this.id++, t: t, x: x, y: y, s: s, r: 0, f: 0, z: (extra && extra.z != null) ? extra.z : y, c: m.c, p: m.p };
    if (k.asym && !(extra && extra.noFlip)) o.f = R.chance(0.5) ? 1 : 0;
    if (extra && extra.r) o.r = extra.r;
    return o;
  };
  Stage.prototype.put = function (o) { this.objs.push(o); this.boxes.push(bbW(o)); return o; };
  /** 空いている場所を探して置く。margin＝重なりの許し（マイナスで少し重なってよい） */
  Stage.prototype.tryPut = function (t, xr, yr, s, extra, margin, tries) {
    var R = this.R;
    for (var n = 0; n < (tries || 24); n++) {
      var o = this.obj(t, R.r(xr[0], xr[1]), R.r(yr[0], yr[1]), s, extra);
      var b = bbW(o), ok = inside(b, 2);
      for (var i = 0; ok && i < this.boxes.length; i++) if (hit(b, this.boxes[i], margin == null ? -2 : margin) && !this.objs[i].flatBg) ok = false;
      if (ok) return this.put(o);
      this.id = o.id; // 置かなかった番号は使い直す
    }
    return null;
  };
  Stage.prototype.count = function (a, b) { return Math.round(a + (b - a) * this.lv.dens); };
  /** 袋から取り出すように選ぶ（同じ物が続けて出にくい）。max＝1つの場面に入れてよい数 */
  Stage.prototype.bag = function (list, max) {
    var R = this.R, left = [], got = {};
    return function () {
      for (var n = 0; n < 40; n++) {
        if (!left.length) left = R.shuffle(list.slice());
        var t = left.pop();
        if (!max || !max[t] || (got[t] || 0) < max[t]) { got[t] = (got[t] || 0) + 1; return t; }
      }
      return list[0];
    };
  };

  // ═══════════ 場面 ═══════════
  var BUILD = {};

  BUILD.room = function (st) {
    var R = st.R, L = st.lv, sz = L.sz, i, o;
    var wall = R.pick(['#fbe9d0', '#e3f1e8', '#e6eefa', '#fde4e4', '#f3e8fb', '#fff5cc']);
    var bg = { k: 'room', wall: wall, pat: MU.shift(wall, 0, -0.05), pk: R.i(2), floor: R.pick(['#d9a874', '#c9945e', '#e2b98a']), base: '#f6f0e6' };
    var left = R.chance(0.5); // まどが左
    var wx = left ? R.ri(68, 92) : R.ri(308, 332);
    st.put(st.obj('window', wx, 20, 1.3, { z: 5 }));
    var shx = left ? R.ri(285, 300) : R.ri(100, 115), shW = 172;
    var sh = st.obj('shelf', shx, 140, 1, { z: 30 }); sh.p.w = shW; st.put(sh);
    if (L.dens > 0.4 || R.chance(0.5)) st.put(st.obj('frame', shx + R.ri(-50, 50), 62, 1.3 * Math.min(sz, 1.12), { z: 6, r: 0 }));
    if (L.dens > 0.45) { var bt = st.obj('bunting', left ? R.ri(205, 275) : R.ri(125, 195), 8, 1.0, { z: 4 }); st.put(bt); }
    if (L.dens > 0.55 || R.chance(0.4)) st.put(st.obj('clock', left ? R.ri(168, 200) : R.ri(200, 232), R.ri(42, 70), 1.3 * Math.min(sz, 1.12), { z: 7 }));
    // たなの上
    var nextItem = st.bag(['book', 'book', 'book', 'bear', 'vase', 'blocks', 'toycar', 'book', 'apple', 'cup'], { bear: 1, vase: 1, toycar: 1, blocks: 1, apple: 2, cup: 1 });
    var x = shx - shW / 2 + 6, maxN = st.count(2, 10), n = 0, ss = 1.2 * Math.min(sz, 1.15);
    while (n < maxN) {
      var t = nextItem();
      o = st.obj(t, 0, 140, ss, { z: 31 + n * 0.01, noFlip: false });
      var b = K[t].bb(o), w = (b[2] - b[0]) * ss;
      if (x + w > shx + shW / 2 - 4) break;
      o.x = x - b[0] * ss + (t === 'book' ? 0 : 1.5);
      if (o.f) o.x = x + b[2] * ss + (t === 'book' ? 0 : 1.5);
      if (t === 'book' && R.chance(0.15) && n > 0) o.r = R.pick([-8, 8]);
      st.put(o); x += w + (t === 'book' ? R.r(0, 1.2) : R.r(3, 7)); n++;
    }
    // テーブル
    var tx = R.ri(150, 250), ty = 276, ts = 1.3;
    st.put(st.obj('table', tx, ty, ts, { z: ty }));
    var nextT = st.bag(['cup', 'apple', 'cake', 'teapot', 'vase', 'apple'], { cake: 1, teapot: 1, vase: 1, cup: 1 });
    var tn = st.count(1, 4), slots = [-40, -14, 14, 40], used = R.shuffle(slots.slice()).slice(0, tn).sort(function (a, b) { return a - b; });
    for (i = 0; i < used.length; i++) st.put(st.obj(nextT(), tx + used[i] * ts / 1.3 + R.r(-2, 2), ty - 50 * ts, 1.25 * Math.min(sz, 1.12), { z: ty + 0.5 + i * 0.01 }));
    if (R.chance(0.6)) st.put(st.obj('rug', R.ri(130, 270), 289, 1.2, { z: 201 })).flatBg = true;
    // ゆか
    if (L.dens > 0.6 || R.chance(0.3)) st.tryPut('chair', [tx < 200 ? tx + 75 : 30, tx < 200 ? 370 : tx - 75], [258, 262], 1.25 * Math.min(sz, 1.12), {}, -10);
    var nextF = st.bag(['cat', 'dog', 'ball', 'plant', 'lamp', 'blocks', 'toycar', 'bear'], { cat: 1, dog: 1, lamp: 1, plant: 1, bear: 1 });
    var fn = st.count(2, 7);
    for (i = 0; i < fn; i++) st.tryPut(nextF(), [18, 382], [244, 296], R.r(1.25, 1.4) * Math.min(sz, 1.15), {}, -3);
    st.addKinds = [['apple', [20, 380], [244, 296]], ['ball', [20, 380], [244, 296]], ['blocks', [20, 380], [244, 296]], ['book', [20, 380], [244, 296]]];
    return bg;
  };

  BUILD.park = function (st) {
    var R = st.R, L = st.lv, sz = L.sz, i;
    var bg = { k: 'park', h1: R.ri(60, 150), pond: R.chance(0.55) ? 1 : 0, px: R.ri(120, 280) };
    st.tryPut('sun', [30, 370], [28, 40], 1.0, { z: 1 }, 4);
    var nc = st.count(1, 3);
    for (i = 0; i < nc; i++) st.tryPut('cloud', [30, 370], [26, 80], R.r(0.9, 1.25) * Math.min(sz, 1.15), { z: 2 }, 4);
    var nt = st.count(1, 4);
    for (i = 0; i < nt; i++) st.tryPut('tree', [30, 370], [178, 196], R.r(0.95, 1.15) * Math.min(sz, 1.15), {}, -8);
    if (L.dens > 0.55 && R.chance(0.7)) st.tryPut('fence', [40, 360], [197, 204], 1.0, {}, -10);
    var nb = st.count(0, 3);
    for (i = 0; i < nb; i++) st.tryPut('bush', [20, 380], [198, 214], R.r(0.9, 1.2) * Math.min(sz, 1.15), {}, -5);
    if (bg.pond) { var nd = st.count(1, 2); for (i = 0; i < nd; i++) st.tryPut('duck', [bg.px - 42, bg.px + 42], [240, 246], 0.9 * Math.min(sz, 1.2), {}, 0); }
    if (R.chance(0.6)) st.tryPut('bench', [40, 360], [226, 250], 1.0 * Math.min(sz, 1.15), {}, -3);
    var ns = st.count(1, 4);
    var nextS = st.bag(['bird', 'bird', 'balloon', 'kite', 'butterfly'], { kite: 1, balloon: 2 });
    for (i = 0; i < ns; i++) st.tryPut(nextS(), [25, 375], [44, 150], R.r(1.05, 1.3) * Math.min(sz, 1.2), { z: 150 }, 3);
    var na = st.count(1, 2), nextA = st.bag(['dog', 'cat', 'ball'], { dog: 1, cat: 1 });
    for (i = 0; i < na; i++) st.tryPut(nextA(), [25, 375], [250, 292], R.r(1.15, 1.3) * Math.min(sz, 1.15), {}, -2);
    var nf = st.count(2, 8);
    for (i = 0; i < nf; i++) st.tryPut('flower', [15, 385], [256, 296], R.r(1.05, 1.3) * Math.min(sz, 1.2), {}, -3);
    var nm = st.count(1, 3), nextM = st.bag(['mushroom', 'rock', 'mushroom', 'butterfly'], { rock: 1 });
    for (i = 0; i < nm; i++) st.tryPut(nextM(), [15, 385], [245, 296], R.r(1.05, 1.25) * Math.min(sz, 1.15), {}, -2);
    st.addKinds = [['butterfly', [25, 375], [60, 160]], ['flower', [15, 385], [256, 296]], ['mushroom', [15, 385], [250, 296]], ['bird', [25, 375], [44, 150]], ['cloud', [30, 370], [26, 80]]];
    return bg;
  };

  BUILD.sea = function (st) {
    var R = st.R, L = st.lv, sz = L.sz, i;
    var bg = { k: 'sea', ray: R.ri(-20, 20) };
    var nw = st.count(1, 3);
    for (i = 0; i < nw; i++) st.tryPut('seaweed', [20, 380], [262, 280], R.r(1.2, 1.5) * Math.min(sz, 1.12), {}, -8);
    var nc = st.count(1, 3);
    for (i = 0; i < nc; i++) st.tryPut('coral', [20, 380], [262, 282], R.r(1.2, 1.45) * Math.min(sz, 1.12), {}, -5);
    if (R.chance(0.5)) st.tryPut('chest', [40, 360], [272, 290], 1.35 * Math.min(sz, 1.12), {}, -3);
    if (R.chance(0.6)) st.tryPut('octopus', [30, 370], [270, 288], 1.35 * Math.min(sz, 1.12), {}, -3);
    var ng = st.count(2, 6), nextG = st.bag(['shell', 'starfish', 'crab', 'rock', 'shell', 'starfish'], { crab: 1, rock: 1 });
    for (i = 0; i < ng; i++) st.tryPut(nextG(), [15, 385], [268, 296], R.r(1.2, 1.4) * Math.min(sz, 1.15), {}, -2);
    var nf = st.count(3, 9);
    for (i = 0; i < nf; i++) st.tryPut('fish', [25, 375], [28, 225], R.r(1.15, 1.8) * Math.min(sz, 1.15), { z: 150 }, 2);
    var nj = st.count(0, 2);
    for (i = 0; i < nj; i++) st.tryPut('jelly', [25, 375], [30, 190], R.r(1.2, 1.45) * Math.min(sz, 1.12), { z: 140 }, 2);
    var nb = st.count(1, 3);
    for (i = 0; i < nb; i++) st.tryPut('bubbles', [20, 380], [40, 220], R.r(1.1, 1.4) * Math.min(sz, 1.15), { z: 160 }, 2);
    st.addKinds = [['fish', [25, 375], [28, 225]], ['bubbles', [20, 380], [40, 220]], ['shell', [15, 385], [268, 296]], ['starfish', [15, 385], [268, 296]]];
    return bg;
  };

  BUILD.night = function (st) {
    var R = st.R, L = st.lv, sz = L.sz, i, o;
    var sky = []; for (i = 0; i < 10; i++) sky.push(R.ri(14, 48));
    var bg = { k: 'night', sky: sky };
    st.tryPut('moon', [40, 360], [32, 58], 1.0 * Math.min(sz, 1.2), { z: 1 }, 6);
    // まちなみ（左から順に）
    var x = R.ri(-6, 10), k = 0, bs = [];
    while (x < 392 && k < 9) {
      var t = R.chance(L.dens < 0.5 ? 0.45 : 0.25) ? 'house' : 'building';
      o = st.obj(t, 0, 258, t === 'house' ? 1.15 * Math.min(sz, 1.2) : 1, { z: 100 + k, opt: { night: true } });
      var b = K[t].bb(o), w = (b[2] - b[0]) * o.s;
      o.x = x + w / 2;
      if (o.x + w / 2 > 398) break;
      st.put(o); bs.push(o);
      x += w + R.ri(2, 14); k++;
    }
    var ns = st.count(3, 11);
    for (i = 0; i < ns; i++) st.tryPut('star', [8, 392], [8, 120], R.r(0.8, 1.3) * Math.min(sz, 1.25), { z: 2 }, 3);
    var nl = st.count(1, 2);
    for (i = 0; i < nl; i++) st.tryPut('slamp', [20, 380], [270, 272], 1.15, { z: 200 }, 4);
    if (R.chance(0.8)) st.tryPut('car', [40, 330], [294, 296], 1.35 * Math.min(sz, 1.12), { z: 290 }, 0);
    var tall = bs.filter(function (b) { return b.t === 'building'; });
    if (tall.length && R.chance(0.55)) {
      // ビルの屋上に ねこ（アンテナと重ならないよう左寄り）
      var hb = R.pick(tall), c = st.obj('cat', hb.x - hb.p.w * 0.2, hb.y - hb.p.h - 2.5, 0.7, { z: hb.z + 0.5 });
      c.c.body = '#3a3a48'; c.c.st = '#2a2a36';
      if (inside(bbW(c), 2)) st.put(c);
    }
    if (R.chance(0.45)) st.tryPut('owl', [20, 380], [30, 110], 1.25 * Math.min(sz, 1.15), { z: 3 }, 3);
    st.addKinds = [['star', [8, 392], [8, 120]], ['owl', [20, 380], [30, 110]]];
    return bg;
  };

  /** 種と★と場面から、場面を1つ作る。 */
  function makeScene(seed, lv, scene) {
    var R = MU.rng(seed), st = new Stage(R, lv);
    var bg = BUILD[scene](st);
    return { w: W, h: H, scene: scene, bg: bg, objs: st.objs, add: st.addKinds || [], seed: seed, lv: lv };
  }

  function clone(sc) { return JSON.parse(JSON.stringify(sc)); }
  function byId(sc, id) { for (var i = 0; i < sc.objs.length; i++) if (sc.objs[i].id === id) return sc.objs[i]; return null; }

  /** ちがいの候補を、決まった並びで出す。台帳は「この並びの何番目か」で覚える。 */
  function candidates(sc) {
    var R = MU.rng((sc.seed ^ 0x5bd1e995) >>> 0), out = [], i;
    var occ = sc.objs.map(bbW);
    sc.objs.forEach(function (o) {
      var k = K[o.t];
      if (k.fixed) return;
      var nm = k.name;
      if (!k.noRemove) out.push({ id: o.id, k: 'rm', g: 1, l: nm + 'が きえた', f: function (x) { x.hidden = true; } });
      Object.keys(k.cols).forEach(function (key) {
        var cur = o.c[key];
        var opts = MK.BRIGHT.filter(function (n) { return PAL[n] !== cur; });
        var nc = PAL[R.pick(opts)];
        out.push({ id: o.id, k: 'col', g: 1, l: k.cols[key], f: function (x) { x.c[key] = nc; } });
        var dh = R.pick([-34, -26, 26, 34]), dl = R.pick([-0.1, 0, 0.1]);
        var sc2 = MU.shift(cur, dh, dl);
        if (sc2 !== cur) out.push({ id: o.id, k: 'sub', g: 3, l: k.cols[key], f: function (x) { x.c[key] = sc2; } });
      });
      if (k.asym) out.push({ id: o.id, k: 'fl', g: 2, l: nm + 'の むき', f: function (x) { x.f = x.f ? 0 : 1; } });
      if (!k.noMove) {
        var dx = R.pick([-1, 1]) * R.ri(7, 13), dy = k.float ? R.pick([-1, 1]) * R.ri(5, 10) : 0;
        out.push({ id: o.id, k: 'mv', g: 3, l: nm + 'の ばしょ', f: function (x) { x.x += dx; x.y += dy; } });
      }
      var fac = R.pick([1.25, 0.8]);
      out.push({ id: o.id, k: 'sc', g: 3, l: nm + 'の おおきさ', f: function (x) { x.s *= fac; } });
      if (k.tilt) { var dr = R.pick([-14, 14]); out.push({ id: o.id, k: 'rot', g: 3, l: nm + 'の かたむき', f: function (x) { x.r += dr; } }); }
      for (i = 0; i < k.muts.length; i++) {
        var m = k.muts[i](o, R);
        if (m) out.push({ id: o.id, k: 'pt', g: m.g, l: m.l, f: m.f });
      }
    });
    // ふえた もの
    var nextId = sc.objs.length ? Math.max.apply(null, sc.objs.map(function (o) { return o.id; })) + 1 : 0;
    for (i = 0; i < sc.add.length * 2; i++) {
      var a = sc.add[i % sc.add.length];
      for (var tr = 0; tr < 12; tr++) {
        var lvs = LV[sc.lv];
        var no = { id: nextId, t: a[0], x: R.r(a[1][0], a[1][1]), y: R.r(a[2][0], a[2][1]), s: R.r(1.1, 1.3) * Math.min(lvs.sz, 1.15), r: 0, f: 0, z: 0, c: null, p: null };
        var mm = K[a[0]].make(R, { night: sc.scene === 'night' });
        no.c = mm.c; no.p = mm.p; no.z = K[a[0]].float ? 155 : no.y;
        if (K[a[0]].asym) no.f = R.chance(0.5) ? 1 : 0;
        var b = bbW(no), ok = inside(b, 3);
        for (var j = 0; ok && j < occ.length; j++) if (hit(b, occ[j], 2) && !(j < sc.objs.length && sc.objs[j].flatBg)) ok = false;
        if (ok) {
          (function (obj) { out.push({ id: 'n' + obj.id, k: 'add', g: 1, l: K[obj.t].name + 'が ふえた', f: null, obj: obj }); })(no);
          occ.push(b); nextId++;
          break;
        }
      }
    }
    return R.shuffle(out);
  }

  /** 候補をいくつか当てた場面（右の絵）を作る。 */
  function apply(sc, cands) {
    var b = clone(sc);
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      if (c.k === 'add') { b.objs.push(clone(c.obj)); continue; }
      var o = byId(b, c.id);
      if (o) c.f(o);
    }
    return b;
  }

  /** 台帳の1件から、遊ぶための問題を組み立てる。 */
  function puzzle(e) {
    // e = [種, 場面の番号, [候補の番号...], [[x0,y0,x1,y1]...], ★]
    var sc = makeScene(e[0], e[4], SCENES[e[1]]), cs = candidates(sc);
    var picks = e[2].map(function (i) { return cs[i]; });
    var B = apply(sc, picks);
    return {
      seed: e[0], lv: e[4], scene: SCENES[e[1]], A: sc, B: B,
      diffs: picks.map(function (c, i) { return { l: c.l, k: c.k, box: e[3][i] }; })
    };
  }

  var MG = { W: W, H: H, LV: LV, CAP: CAP, SCENES: SCENES, SCENE_NAME: SCENE_NAME, makeScene: makeScene, candidates: candidates, apply: apply, puzzle: puzzle, bbW: bbW };
  if (typeof module !== 'undefined' && module.exports) module.exports = MG;
  G.MG = MG;
})(typeof window !== 'undefined' ? window : globalThis);
