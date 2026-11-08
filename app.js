// まちがいさがし — 画面。問題は台帳（bank.js）の1件を gen.js が組み立て、verify.js が この端末で描いて確かめてから出す。
// 記録は この端末の中だけ（localStorage）。名前ごとに ★ごとの いちばん速い記録と、きょうの もんだいの記録を持つ。
(function () {
  'use strict';
  var MG = window.MG, MK = window.MK, MV = window.MV, MU = window.MU, MB = window.MB;
  var KEY = 'machigai.v1';
  var app = document.getElementById('app'), layer = document.getElementById('layer');

  // ── 記録 ──
  function load() {
    try { var s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.v === 1) return s; } catch (e) { /* 見られない端末 */ }
    return { v: 1, players: [], cur: '', mode: 'side', sound: true, prog: {}, daily: {} };
  }
  var S = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* しまえない端末でも遊べる */ } }
  function who() { return S.cur || 'ゲスト'; }
  function prog(name, lv) {
    var p = S.prog[name] || (S.prog[name] = {});
    return p[lv] || (p[lv] = { next: 0, clear: 0, best: {} });
  }

  // ── 小道具 ──
  function h(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function fmt(sec) { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2); }
  function bank(lv) { return (MB && MB.levels && MB.levels[lv]) || []; }
  function dailyIdx(lv) { var n = bank(lv).length; return n ? MU.hash('day:' + today() + ':' + lv) % n : 0; }
  function dpr() { return Math.min(3, window.devicePixelRatio || 1); }

  // ── 音（ファイルを使わず その場で鳴らす） ──
  var AC = null;
  function ac() {
    if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } }
    if (AC && AC.state === 'suspended') AC.resume();
    return AC;
  }
  function tone(f, at, dur, type, vol) {
    var c = ac(); if (!c || !S.sound) return;
    var o = c.createOscillator(), g = c.createGain(), t = c.currentTime + at;
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.18, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  var SND = {
    found: function () { tone(988, 0, 0.18, 'triangle', 0.22); tone(1319, 0.09, 0.3, 'triangle', 0.22); },
    miss: function () { tone(196, 0, 0.18, 'square', 0.06); },
    hint: function () { tone(660, 0, 0.12, 'sine', 0.12); tone(660, 0.16, 0.12, 'sine', 0.12); },
    clear: function () { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, i * 0.11, 0.35, 'triangle', 0.2); }); tone(1568, 0.6, 0.6, 'sine', 0.15); },
    flip: function () { tone(440, 0, 0.06, 'sine', 0.05); }
  };

  // ═══════════ タイトル ═══════════
  function home() {
    stopPlay();
    if (!MB || !MB.levels) { app.innerHTML = '<div class="boot">もんだいが よみこめませんでした。ページを よみなおしてね。</div>'; return; }
    var name = who(), d = S.daily[today()] || {};
    var out = '<div class="home">';
    out += '<div class="logo"><div class="mg"><canvas id="lg0"></canvas><canvas id="lg1"></canvas></div><h1>まちがい さがし</h1></div>';
    out += '<div class="who"><span class="lab">あそぶ ひと</span>';
    S.players.forEach(function (p, i) { out += '<button class="chip' + (p === S.cur ? ' on' : '') + '" data-p="' + i + '">' + h(p) + '</button>'; });
    out += '<button class="chip add" data-act="addp">＋ なまえを ふやす</button></div>';
    out += '<div class="levels">';
    for (var lv = 1; lv <= 5; lv++) {
      var L = MG.LV[lv], n = bank(lv).length, pr = prog(name, lv), best = pr.best[S.mode];
      out += '<button class="lv l' + lv + '" data-lv="' + lv + '"><span class="st">' + L.mark + '</span><span class="tx"><div class="t1">' + h(L.label) + '</div>' +
        '<div class="t2">ちがいは ' + L.n + 'こ ・ ' + ((pr.next % Math.max(1, n)) + 1) + ' / ' + n + ' もんめ' + (best ? ' ・ いちばん はやい ' + fmt(best) : '') + '</div></span><span class="go">›</span></button>';
    }
    out += '</div>';
    out += '<div class="sec">きょうの もんだい <small>' + today().replace(/^\d+-0?(\d+)-0?(\d+)$/, '$1がつ $2にち') + ' ・ みんな おなじ もんだい</small></div><div class="daily">';
    for (lv = 1; lv <= 5; lv++) {
      var mine = d[lv] && d[lv][name];
      out += '<button class="dl' + (mine ? ' done' : '') + '" data-day="' + lv + '">' + '★' + lv + '<b>' + (mine ? '✓ ' + fmt(mine) : 'まだ') + '</b></button>';
    }
    out += '</div>';
    if (S.players.length > 1 && Object.keys(d).length) {
      out += '<div class="fam"><table><tr><th></th>' + [1, 2, 3, 4, 5].map(function (l) { return '<th>★' + l + '</th>'; }).join('') + '</tr>';
      S.players.forEach(function (p) {
        out += '<tr><td>' + h(p) + '</td>' + [1, 2, 3, 4, 5].map(function (l) {
          var t = d[l] && d[l][p], times = d[l] ? Object.keys(d[l]).map(function (k) { return d[l][k]; }) : [];
          var top = t && t === Math.min.apply(null, times) && times.length > 1;
          return '<td>' + (t ? (top ? '👑' : '') + fmt(t) : '・') + '</td>';
        }).join('') + '</tr>';
      });
      out += '</table></div>';
    }
    out += '<div class="sec">みかた</div><div class="opts">';
    out += '<span class="seg"><button data-mode="side" class="' + (S.mode === 'side' ? 'on' : '') + '">ならべて みる</button><button data-mode="flip" class="' + (S.mode === 'flip' ? 'on' : '') + '">きりかえて みる</button></span>';
    out += '<span class="seg"><button data-snd="1" class="' + (S.sound ? 'on' : '') + '">🔊 おと</button><button data-snd="0" class="' + (!S.sound ? 'on' : '') + '">🔇 なし</button></span>';
    out += '</div><div class="note">「きりかえて みる」は、1まいの えを ボタンで いれかえて さがします。いれかわる ときに いちど まっしろに なるので、ならべるより ずっと むずかしく なります（おとな むけ）。<br>きろくは この たんまつの なかだけに のこります。</div>';
    out += '</div>';
    app.innerHTML = out;
    drawLogo();
  }
  function drawLogo() {
    var lst = bank(1);
    if (!lst.length) return;
    var pz = MG.puzzle(lst[MU.hash('logo') % lst.length]);
    ['lg0', 'lg1'].forEach(function (id, i) {
      var c = document.getElementById(id); if (!c) return;
      c.width = Math.round(54 * dpr()); c.height = Math.round(40 * dpr());
      MK.render(c.getContext('2d'), i ? pz.B : pz.A, c.width / 400);
    });
  }

  app.addEventListener('click', function (e) {
    var t = e.target.closest('button'); if (!t) return;
    ac();
    if (t.dataset.lv) return startLevel(+t.dataset.lv);
    if (t.dataset.day) return startPuzzle(+t.dataset.day, dailyIdx(+t.dataset.day), true);
    if (t.dataset.mode) { S.mode = t.dataset.mode; save(); return home(); }
    if (t.dataset.snd) { S.sound = t.dataset.snd === '1'; save(); return home(); }
    if (t.dataset.act === 'addp') return askName();
    if (t.dataset.p != null) {
      var p = S.players[+t.dataset.p];
      if (S.cur === p) return editName(+t.dataset.p);
      S.cur = p; save(); return home();
    }
    if (P && t.dataset.tool) tool(t.dataset.tool);
  });

  // ── 名前 ──
  function modal(html) {
    layer.innerHTML = '<div class="modal"><div class="box">' + html + '</div></div>';
    return layer.querySelector('.box');
  }
  function closeModal() { layer.innerHTML = ''; }
  function askName() {
    var b = modal('<h2>なまえ</h2><div class="meta">あそぶ ひとの なまえ（ニックネームで いいよ）</div><input id="nm" maxlength="10" autocomplete="off"><div class="row"><button data-x="no">やめる</button><button class="main" data-x="ok">きめる</button></div>');
    var inp = b.querySelector('#nm'); setTimeout(function () { inp.focus(); }, 50);
    var done = function () {
      var v = inp.value.replace(/\s+/g, ' ').trim().slice(0, 10);
      if (!v) return;
      if (S.players.indexOf(v) < 0) S.players.push(v);
      S.cur = v; save(); closeModal(); home();
    };
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') done(); });
    b.addEventListener('click', function (e) { var x = e.target.closest('button'); if (!x) return; if (x.dataset.x === 'ok') done(); else closeModal(); });
  }
  function editName(i) {
    var p = S.players[i];
    var b = modal('<h2>' + h(p) + '</h2><div class="meta">この なまえを けすと、きろくも きえます</div><div class="row"><button data-x="no">もどる</button><button data-x="del">けす</button></div>');
    b.addEventListener('click', function (e) {
      var x = e.target.closest('button'); if (!x) return;
      if (x.dataset.x === 'del' && confirm(p + ' の なまえと きろくを けしますか？')) {
        S.players.splice(i, 1); delete S.prog[p]; S.cur = S.players[0] || ''; save();
      }
      closeModal(); home();
    });
  }

  // ═══════════ あそぶ ═══════════
  var P = null;
  function startLevel(lv) {
    var n = bank(lv).length; if (!n) return;
    startPuzzle(lv, prog(who(), lv).next % n, false);
  }
  function startPuzzle(lv, idx, daily) {
    var lst = bank(lv), pz = null;
    for (var k = 0; k < 6 && !pz; k++) {
      var e = lst[(idx + k) % lst.length], cand = MG.puzzle(e), chk = MV.check(cand);
      if (chk.ok) { pz = cand; idx = (idx + k) % lst.length; }
      else if (window.console) console.warn('この端末では出せない問題を とばしました', lv, (idx + k) % lst.length, chk.why);
    }
    if (!pz) { alert('もんだいを よみこめませんでした'); return home(); }
    stopPlay();
    P = { lv: lv, idx: idx, daily: daily, pz: pz, L: MG.LV[lv], found: [], gave: false, t0: Date.now(), pen: 0, hints: 0, miss: 0, side: 0, hint: null, done: false, misses: [], lockUntil: 0, auto: null, mode: S.mode };
    var flip = P.mode === 'flip';
    var out = '<div class="play"><div class="bar"><button class="back" data-tool="back">‹ もどる</button><div class="mid"><span class="lvm">' + (daily ? 'きょうの ' : '') + '★' + lv + ' <small style="color:var(--sub)">' + (idx + 1) + 'ばん</small></span><span class="dots">';
    for (var i = 0; i < pz.diffs.length; i++) out += '<i></i>';
    out += '</span></div><span class="time" id="tm">0:00</span></div><div class="stage" id="stage">';
    out += '<div class="pic" id="pa"><canvas></canvas>' + (flip ? '<span class="tag" id="tg">A</span>' : '') + '</div>';
    if (!flip) out += '<div class="pic" id="pb"><canvas></canvas></div>';
    out += '</div><div class="tools">';
    if (flip) out += '<button class="big" data-tool="flip">🔄 きりかえる</button><button data-tool="auto">⏱ じどう</button>';
    out += '<button data-tool="hint">💡 ヒント</button><button data-tool="give">🏳 こたえ</button></div></div>';
    app.innerHTML = out;
    ['pa', 'pb'].forEach(function (id) { var el = document.getElementById(id); if (el) el.addEventListener('pointerdown', onTap); });
    layout();
    P.timer = setInterval(tick, 250);
  }
  function stopPlay() {
    if (!P) return;
    clearInterval(P.timer); if (P.auto) clearInterval(P.auto); if (P.hintT) clearTimeout(P.hintT);
    P = null; closeModal();
    var cf = document.getElementById('confetti'); if (cf) cf.remove();
  }
  function elapsed() { return (Date.now() - P.t0) / 1000; }
  function tick() {
    if (!P || P.done) return;
    var el = document.getElementById('tm'); if (el) el.textContent = fmt(elapsed() + P.pen);
  }
  document.addEventListener('visibilitychange', function () {
    if (!P || P.done) return;
    if (document.hidden) P.pauseAt = Date.now();
    else if (P.pauseAt) { P.t0 += Date.now() - P.pauseAt; P.pauseAt = 0; }
  });
  window.addEventListener('resize', function () { if (P) layout(); });

  function layout() {
    var stage = document.getElementById('stage'); if (!stage) return;
    var bar = app.querySelector('.bar'), tools = app.querySelector('.tools');
    var aw = window.innerWidth - 16, ah = window.innerHeight - bar.offsetHeight - tools.offsetHeight - 12;
    var w, vert = false;
    if (P.mode === 'flip') w = Math.min(aw, ah * 4 / 3);
    else {
      var wh = Math.min((aw - 10) / 2, ah * 4 / 3), wv = Math.min(aw, (ah - 8) / 2 * 4 / 3);
      vert = wv > wh; w = vert ? wv : wh;
    }
    w = Math.floor(Math.max(120, w));
    stage.classList.toggle('v', vert);
    ['pa', 'pb'].forEach(function (id) {
      var el = document.getElementById(id); if (!el) return;
      el.style.width = w + 'px'; el.style.height = Math.round(w * 0.75) + 'px';
      var c = el.querySelector('canvas'); c.width = Math.round(w * dpr()); c.height = Math.round(w * 0.75 * dpr());
    });
    draw();
  }
  function draw() {
    if (!P) return;
    var flip = P.mode === 'flip';
    ['pa', 'pb'].forEach(function (id, i) {
      var el = document.getElementById(id); if (!el) return;
      var c = el.querySelector('canvas'), x = c.getContext('2d'), k = c.width / 400;
      var sc = flip ? (P.side ? P.pz.B : P.pz.A) : (i ? P.pz.B : P.pz.A);
      MK.render(x, sc, k);
      x.save(); x.setTransform(k, 0, 0, k, 0, 0);
      P.pz.diffs.forEach(function (d, j) {
        var got = P.found.indexOf(j) >= 0;
        if (!got && !P.gave) return;
        ring(x, d.box, got ? '#e8574a' : '#3f74c4', !got);
      });
      if (P.hint) {
        x.beginPath(); x.arc(P.hint.x, P.hint.y, P.hint.r, 0, Math.PI * 2);
        x.fillStyle = 'rgba(63,116,196,0.16)'; x.fill();
        x.setLineDash([6, 5]); x.lineWidth = 2.4; x.strokeStyle = '#3f74c4'; x.stroke(); x.setLineDash([]);
      }
      x.restore();
    });
    var dots = app.querySelectorAll('.dots i');
    for (var j = 0; j < dots.length; j++) dots[j].classList.toggle('on', j < P.found.length);
    var tg = document.getElementById('tg'); if (tg) tg.textContent = P.side ? 'B' : 'A';
  }
  function ring(x, b, col, dashed) {
    var cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, rx = Math.max(9, (b[2] - b[0]) / 2 + 5), ry = Math.max(9, (b[3] - b[1]) / 2 + 5);
    x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    x.lineWidth = 4.2; x.strokeStyle = 'rgba(255,255,255,0.9)'; x.stroke();
    if (dashed) x.setLineDash([5, 4]);
    x.lineWidth = 2.6; x.strokeStyle = col; x.stroke(); x.setLineDash([]);
  }

  function onTap(e) {
    if (!P || P.done) return;
    ac();
    var el = e.currentTarget, rc = el.getBoundingClientRect();
    var x = (e.clientX - rc.left) / rc.width * 400, y = (e.clientY - rc.top) / rc.height * 300;
    var now = Date.now();
    if (now < P.lockUntil) { toast('ゆっくり さがしてね', true); return; }
    var tol = P.L.pad + 12 * 400 / rc.width, best = -1, bd = 1e9;
    P.pz.diffs.forEach(function (d, j) {
      if (P.found.indexOf(j) >= 0) return;
      var b = d.box, dx = Math.max(b[0] - x, 0, x - b[2]), dy = Math.max(b[1] - y, 0, y - b[3]), dd = Math.sqrt(dx * dx + dy * dy);
      if (dd <= tol && dd < bd) { bd = dd; best = j; }
    });
    if (best >= 0) {
      P.found.push(best);
      if (P.hint) { P.hint = null; }
      SND.found(); toast('◎ ' + P.pz.diffs[best].l);
      draw();
      if (P.found.length === P.pz.diffs.length) setTimeout(function () { finish(false); }, 450);
      return;
    }
    P.miss++;
    SND.miss();
    var penal = P.lv >= 3 ? 5 : 0;
    P.pen += penal;
    var fx = document.createElement('div');
    fx.className = 'fx miss'; fx.innerHTML = '✕' + (penal ? '<span class="pen">+' + penal + '</span>' : '');
    fx.style.left = (e.clientX - rc.left) + 'px'; fx.style.top = (e.clientY - rc.top) + 'px';
    el.appendChild(fx); setTimeout(function () { fx.remove(); }, 750);
    P.misses.push(now); P.misses = P.misses.filter(function (t) { return now - t < 2500; });
    if (P.misses.length >= 3) { P.lockUntil = now + 1500; P.misses = []; toast('ゆっくり さがしてね', true); }
    tick();
  }

  function tool(k) {
    if (k === 'back') { if (!P.done && P.found.length && !confirm('とちゅうで やめますか？')) return; return home(); }
    if (!P || P.done) return;
    if (k === 'hint') {
      var left = [];
      P.pz.diffs.forEach(function (d, j) { if (P.found.indexOf(j) < 0) left.push(j); });
      if (!left.length) return;
      var d = P.pz.diffs[left[Math.floor(Math.random() * left.length)]], b = d.box;
      var r = Math.max(34, Math.sqrt((b[2] - b[0]) * (b[2] - b[0]) + (b[3] - b[1]) * (b[3] - b[1])) * 0.9);
      var a = Math.random() * Math.PI * 2, off = r * 0.4 * Math.random();
      P.hint = { x: (b[0] + b[2]) / 2 + Math.cos(a) * off, y: (b[1] + b[3]) / 2 + Math.sin(a) * off, r: r };
      P.hints++;
      if (P.lv >= 3) { P.pen += 10; toast('💡 この あたり（+10びょう）', true); } else toast('💡 この あたりを みてね', true);
      SND.hint(); draw(); tick();
      if (P.hintT) clearTimeout(P.hintT);
      P.hintT = setTimeout(function () { if (P) { P.hint = null; draw(); } }, 3500);
      return;
    }
    if (k === 'give') {
      if (!confirm('こたえを みますか？（きろくには のこりません）')) return;
      P.gave = true; draw(); finish(true); return;
    }
    if (k === 'flip') return doFlip();
    if (k === 'auto') {
      var btn = app.querySelector('[data-tool="auto"]');
      if (P.auto) { clearInterval(P.auto); P.auto = null; btn.classList.remove('on'); }
      else { P.auto = setInterval(doFlip, 1700); btn.classList.add('on'); doFlip(); }
    }
  }
  function doFlip() {
    if (!P || P.flipping) return;
    var el = document.getElementById('pa'); if (!el) return;
    P.flipping = true; el.classList.add('blank'); SND.flip();
    setTimeout(function () {
      if (!P) return;
      P.side = P.side ? 0 : 1; draw(); el.classList.remove('blank'); P.flipping = false;
    }, 280);
  }
  document.addEventListener('keydown', function (e) { if (P && P.mode === 'flip' && (e.key === ' ' || e.key === 'Enter') && !layer.innerHTML) { e.preventDefault(); doFlip(); } });

  function finish(gave) {
    if (!P || P.done) return;
    P.done = true; clearInterval(P.timer);
    if (P.auto) { clearInterval(P.auto); P.auto = null; }
    P.hint = null; P.side = 1; draw();
    var t = Math.round(elapsed() + P.pen), name = who(), pr = prog(name, P.lv), isBest = false;
    if (!P.daily) pr.next = P.idx + 1;
    if (!gave) {
      pr.clear++;
      if (!pr.best[P.mode] || t < pr.best[P.mode]) { pr.best[P.mode] = t; isBest = true; }
      if (P.daily && P.mode === 'side') {
        var d = S.daily[today()] || (S.daily[today()] = {}), dl = d[P.lv] || (d[P.lv] = {});
        if (!dl[name] || t < dl[name]) dl[name] = t;
      }
      // 古い日の記録は30日で捨てる
      Object.keys(S.daily).sort().slice(0, -30).forEach(function (k) { delete S.daily[k]; });
    }
    save();
    var list = P.pz.diffs.map(function (d, j) { return '<li' + (P.found.indexOf(j) < 0 ? ' class="gave"' : '') + '>' + h(d.l) + (P.found.indexOf(j) < 0 ? '（こたえ）' : '') + '</li>'; }).join('');
    var html;
    if (gave) html = '<h2>こたえ</h2><div class="meta">あおい まるが みつけられなかった ところ</div>';
    else {
      SND.clear(); confetti();
      html = '<h2>ぜんぶ みつけた！</h2><div class="big">' + fmt(t) + '</div>' + (isBest ? '<div class="best">🎉 いちばん はやい きろく！</div>' : (pr.best[P.mode] ? '<div class="meta">いちばん はやい きろく ' + fmt(pr.best[P.mode]) + '</div>' : '')) +
        '<div class="meta">まちがえた かず ' + P.miss + ' ・ ヒント ' + P.hints + (P.pen ? '（たした じかん ' + P.pen + 'びょう）' : '') + '</div>';
    }
    html += '<ol>' + list + '</ol><div class="row"><button data-x="see">えを みる</button><button data-x="home">もどる</button>' + (P.daily ? '' : '<button class="main" data-x="next">つぎの もんだい</button>') + '</div>';
    var lv = P.lv;
    setTimeout(function () {
      if (!P) return;
      var b = modal(html);
      b.addEventListener('click', function (e) {
        var x = e.target.closest('button'); if (!x) return;
        if (x.dataset.x === 'next') startLevel(lv);
        else if (x.dataset.x === 'home') home();
        else { closeModal(); showAfter(); }
      });
    }, gave ? 200 : 700);
  }
  /** 終わったあと、答えの まるが付いた絵を ながめる */
  function showAfter() {
    var tools = app.querySelector('.tools');
    if (tools) tools.innerHTML = (P.mode === 'flip' ? '<button class="big" data-tool2="flip">🔄 きりかえる</button>' : '') + '<button data-tool2="home">もどる</button><button class="big" data-tool2="next">つぎの もんだい</button>';
    tools.onclick = function (e) {
      var x = e.target.closest('button'); if (!x) return;
      if (x.dataset.tool2 === 'flip') { P.side = P.side ? 0 : 1; draw(); }
      else if (x.dataset.tool2 === 'home') home();
      else startLevel(P.lv);
    };
    layout();
  }

  function toast(s, slow) {
    var old = document.querySelector('.toast'); if (old) old.remove();
    var t = document.createElement('div'); t.className = 'toast' + (slow ? ' slow' : ''); t.textContent = s;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 1700);
  }

  function confetti() {
    var c = document.createElement('canvas'); c.id = 'confetti'; document.body.appendChild(c);
    var k = dpr(); c.width = innerWidth * k; c.height = innerHeight * k;
    var x = c.getContext('2d'), cols = ['#e8574a', '#f6cf4a', '#6dbb5f', '#6fb7ea', '#f29bb8', '#9b7bd4', '#f39a3b'], ps = [];
    for (var i = 0; i < 140; i++) ps.push({ x: Math.random() * c.width, y: -Math.random() * c.height * 0.5, vx: (Math.random() - 0.5) * 3 * k, vy: (2 + Math.random() * 3) * k, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, w: (5 + Math.random() * 5) * k, c: cols[i % cols.length] });
    var t0 = Date.now();
    (function step() {
      if (!document.getElementById('confetti')) return;
      var dt = Date.now() - t0;
      x.clearRect(0, 0, c.width, c.height);
      ps.forEach(function (p) { p.x += p.vx; p.y += p.vy; p.r += p.vr; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.w / 2, -p.w / 4, p.w, p.w / 2); x.restore(); });
      if (dt < 2600) requestAnimationFrame(step); else c.remove();
    })();
  }

  window.MGAPP = { state: function () { return P; } }; // 確かめる用（画面の外からは読むだけ）
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () { /* なくても遊べる */ });
  home();
})();
