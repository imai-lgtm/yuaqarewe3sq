// 効果音とBGM
// 効果音：効果音ラボ（https://soundeffect-lab.info/ 商用無料・クレジット不要）の音を sfx/ に置いたもの
// BGM：bgm/title.mp3（タイトル）・bgm/main.mp3（ゲーム中）・bgm/dash.mp3（通勤ダッシュ）・bgm/ending.mp3（結果〜エンディング）。ファイルが無ければ鳴らさない
//
// 鳴らし方：Web Audio API（AudioContext＋GainNode）。iPhone の Safari は <audio> の volume が効かないため、
// 音量とフェードはすべて GainNode で行う。file:// で開いて fetch できないときだけ、<audio> 方式に切りかえる。
// 外から使う形：Sound.sfx(name) / Sound.music(name) / Sound.toggle() / Sound.on
window.Sound = (() => {
  const FILES = {
    tap: 'cursor7', choose: 'decision26', start: 'sceneswitch1', correct: 'correct2', wrong: 'cancel6',
    card: 'item-get1', flip: 'pa1', match: 'kira1', merge: 'shine1', coin: 'kira2', stage: 'decision22',
    clear: 'shine6', result: 'jajean1', fanfare: 'trumpet1',
  };
  const VOL = { tap: .5, flip: .5, coin: .6, wrong: .6, merge: .7 };
  const BGM_VOL = .35;
  const FADE_IN = 1.2, FADE_OUT = .6;
  const VOICE_VOL = 1.0, DUCK = .12;   // 声の大きさ・声が鳴っている間の BGM の大きさ

  let on = true;
  try { on = localStorage.getItem('ikite-sound') !== 'off'; } catch (_) {}
  let bgmName = '';   // いま鳴らしたい曲（'' なら無し）
  let voiceNow = null, elVoice = null, vGen = 0;   // 鳴っている声

  // ---------------- 方式のえらび ----------------
  const AC = window.AudioContext || window.webkitAudioContext;
  let mode = (AC && window.fetch && location.protocol !== 'file:') ? 'wa' : 'el';
  let ctx = null;
  if (mode === 'wa') { try { ctx = new AC(); } catch (_) { mode = 'el'; } }

  // ================= Web Audio 方式 =================
  let unlocked = false;          // 一度でもユーザー操作があったか
  const sfxBuf = {}, sfxLoading = {};
  const bgmCache = new Map();    // 曲名 → Promise<AudioBuffer|null>（メモリ節約のため最新2曲だけ持つ）
  const bgmMissing = new Set();  // 404 などで鳴らせない曲
  let cur = null;                // 鳴っている BGM { name, src, gain, t0, dur }
  let paused = null;             // 音を切ったときの位置 { name, pos }

  function decode(ab) {
    // 古い Safari はコールバック形式しか無いので両対応
    return new Promise((res, rej) => {
      const p = ctx.decodeAudioData(ab, res, rej);
      if (p && p.then) p.then(res, rej);
    });
  }

  // 読みこみ：見つからない・こわれている → null。fetch 自体ができない（file:// など）→ <audio> 方式へ
  function load(url) {
    return fetch(url).then(
      r => (r.ok ? r.arrayBuffer().then(decode).catch(() => null) : null),
      () => { if (location.protocol === 'file:') toElementMode(); return null; }
    );
  }

  function loadSfx(name) {
    if (name in sfxLoading) return sfxLoading[name];
    return (sfxLoading[name] = load('sfx/' + FILES[name] + '.mp3').then(b => { if (!b) delete sfxLoading[name]; return (sfxBuf[name] = b); }));
  }
  function preloadSfx() { if (mode === 'wa') Object.keys(FILES).forEach(loadSfx); }

  function waSfx(name) {
    if (document.hidden) return;
    const b = sfxBuf[name];
    if (!b) { loadSfx(name); return; }            // 読みこみ前：読みこみを始めて今回は鳴らさない
    if (!unlocked && ctx.state !== 'running') return; // 操作前に鳴らすと、あとでまとめて鳴ってしまう
    try {
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = b;
      g.gain.value = VOL[name] || .8;
      src.connect(g); g.connect(ctx.destination);
      src.onended = () => { try { src.disconnect(); g.disconnect(); } catch (_) {} };
      src.start(0);
    } catch (_) {}
  }

  function getBgm(name) {
    let p = bgmCache.get(name);
    if (!p) {
      p = load('bgm/' + name + '.mp3').then(b => {
        if (!b) { bgmMissing.add(name); bgmCache.delete(name); }
        return b;
      });
    }
    bgmCache.delete(name); bgmCache.set(name, p);           // 新しい順にならべなおす
    while (bgmCache.size > 2) bgmCache.delete(bgmCache.keys().next().value);
    return p;
  }

  // gain をいまの値から to まで sec 秒でなめらかに変える
  function rampTo(param, to, sec) {
    const t = ctx.currentTime;
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
    else { const v = param.value; param.cancelScheduledValues(t); param.setValueAtTime(v, t); }
    param.linearRampToValueAtTime(to, t + sec);
  }

  // ループのつなぎ目（秒）。曲の終わりの無音・フェードアウトの手前で、次の頭と LOOP_XF 秒重ねてつなぐ。
  // 表に無い曲は、音が鳴っている最後の所を自動で探す。
  const LOOP_END = { title: 72.5, main: 93, dash: 64.5, ending: 87.5 };
  const LOOP_XF = 1.5;
  function loopEndOf(name, buf) {
    if (LOOP_END[name] && LOOP_END[name] < buf.duration) return LOOP_END[name];
    const d = buf.getChannelData(0);
    let i = d.length - 1;
    while (i > 0 && Math.abs(d[i]) < .01) i--;
    return Math.max(LOOP_XF * 2, i / buf.sampleRate);
  }

  function curPos() { return cur ? Math.min(cur.end, cur.segOff + Math.max(0, ctx.currentTime - cur.segT)) : 0; }

  function stopCur(sec) {
    if (!cur) return;
    const c = cur;
    cur = null;
    clearTimeout(c.timer);
    try { rampTo(c.gain.gain, 0, sec); } catch (_) {}
    c.srcs.forEach(s => { try { s.stop(ctx.currentTime + sec + .05); } catch (_) {} });
    setTimeout(() => { try { c.gain.disconnect(); } catch (_) {} }, (sec + .3) * 1000);
  }

  // 1回分（off 秒から つなぎ目まで）を at 秒に鳴らし、終わりぎわに次の回を重ねて予約する
  function playSeg(c, at, off, xfIn) {
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = c.buf;
    src.connect(g); g.connect(c.gain);
    const end = at + (c.end - off);
    if (xfIn) { g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(1, at + LOOP_XF); }
    else g.gain.setValueAtTime(1, at);
    g.gain.setValueAtTime(1, end - LOOP_XF);
    g.gain.linearRampToValueAtTime(0, end);
    src.start(at, off);
    src.stop(end + .05);
    src.onended = () => { c.srcs = c.srcs.filter(s => s !== src); try { src.disconnect(); g.disconnect(); } catch (_) {} };
    c.srcs.push(src);
    c.segT = at; c.segOff = off;
    const nextAt = end - LOOP_XF;
    c.timer = setTimeout(() => { if (cur === c) playSeg(c, nextAt, 0, true); }, Math.max(0, (nextAt - ctx.currentTime - 5) * 1000));
  }

  function startCur(name, buf, offset, sec) {
    try {
      const gain = ctx.createGain();
      const t = ctx.currentTime;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(voiceNow ? DUCK : BGM_VOL, t + sec);
      gain.connect(ctx.destination);
      const c = { name, buf, gain, srcs: [], end: loopEndOf(name, buf), timer: 0, segT: t, segOff: 0 };
      cur = c;
      const off = Math.min((offset || 0) % c.end, c.end - LOOP_XF * 2);
      playSeg(c, t, Math.max(0, off), false);
    } catch (_) { cur = null; }
  }

  // bgmName の曲を（まだなら）鳴らしはじめる。前の曲とはクロスフェード
  function waPlayWanted(sec, offset) {
    const name = bgmName;
    if (!name || !on || bgmMissing.has(name) || (cur && cur.name === name)) return;
    getBgm(name).then(buf => {
      if (!buf || mode !== 'wa' || !on || bgmName !== name || (cur && cur.name === name)) return;
      if (cur) stopCur(FADE_OUT);
      startCur(name, buf, offset, sec);
    });
  }

  function waMusic() {
    paused = null;
    if (cur && cur.name !== bgmName) stopCur(FADE_OUT);
    waPlayWanted(FADE_IN, 0);
  }

  function waToggle() {
    if (!on) {
      if (cur) { paused = { name: cur.name, pos: curPos() }; stopCur(.3); }
    } else {
      if (ctx.state !== 'running' && !document.hidden) ctx.resume().catch(() => {});
      const off = paused && paused.name === bgmName ? paused.pos : 0;
      paused = null;
      waPlayWanted(.6, off);
    }
  }

  // 最初のユーザー操作で AudioContext を動かす（iPhone は操作の中でしか音を出せない）
  function unlock() {
    if (mode !== 'wa' || document.hidden) return;
    if (ctx.state !== 'running') {
      ctx.resume().catch(() => {});
      try { // 古い iOS 向け：無音を1回鳴らして解除
        const s = ctx.createBufferSource();
        s.buffer = ctx.createBuffer(1, 1, 22050);
        s.connect(ctx.destination); s.start(0);
      } catch (_) {}
    }
    if (!unlocked) { unlocked = true; preloadSfx(); }
  }

  // ================= <audio> 方式（file:// 用の予備） =================
  const pool = {};
  let elBgm = null, elName = '';

  function elSfx(name) {
    try {
      const list = pool[name] || (pool[name] = []);
      let a = list.find(x => x.paused || x.ended);
      if (!a) { a = new Audio('sfx/' + FILES[name] + '.mp3'); a.preload = 'auto'; list.push(a); }
      a.volume = VOL[name] || .8;
      a.currentTime = 0;
      a.play().catch(() => {});
    } catch (_) {}
  }

  function elFade(a, to, ms, done) {
    const from = a.volume, t0 = performance.now(), id = (a._fadeId = (a._fadeId || 0) + 1);
    (function step(t) {
      if (a._fadeId !== id) return;
      const k = Math.min(1, Math.max(0, (t - t0) / ms));
      try { a.volume = from + (to - from) * k; } catch (_) {}
      if (k < 1) requestAnimationFrame(step); else if (done) done();
    })(t0);
  }

  function elMusic() {
    const name = bgmName;
    if (name === elName) return;
    elName = name;
    if (elBgm) { const old = elBgm; elFade(old, 0, 600, () => old.pause()); elBgm = null; }
    if (!name) return;
    const a = new Audio('bgm/' + name + '.mp3');
    a.loop = true; a.volume = 0;
    a.addEventListener('error', () => { if (elBgm === a) elBgm = null; });
    elBgm = a;
    if (on && !document.hidden) a.play().then(() => elFade(a, BGM_VOL, 1200)).catch(() => {});
  }

  function elResume() {
    if (elBgm && on && !document.hidden) elBgm.play().then(() => elFade(elBgm, BGM_VOL, 600)).catch(() => {});
  }

  function toElementMode() {
    if (mode !== 'wa') return;
    mode = 'el';
    if (cur) { clearTimeout(cur.timer); cur.srcs.forEach(s => { try { s.stop(); } catch (_) {} }); cur = null; }
    try { ctx.close(); } catch (_) {}
    elMusic();
  }

  // ================= 外から使う関数 =================
  function sfx(name) {
    if (!on || !FILES[name]) return;
    if (mode === 'wa') waSfx(name); else elSfx(name);
  }

  function music(name) {
    name = name || '';
    if (name === bgmName) return;
    bgmName = name;
    if (mode === 'wa') waMusic(); else elMusic();
  }

  // ナレーション・セリフ（voice/<name>.mp3）。鳴っている間は BGM を小さくし、終わったら戻す。前の声は止める
  const voiceCache = {};
  function voice(name) {
    stopVoice();
    if (!on || !name) return;
    const gen = vGen;
    if (mode === 'wa') {
      const p = voiceCache[name] || (voiceCache[name] = load('voice/' + name + '.mp3').then(b => { if (!b) delete voiceCache[name]; return b; }));
      p.then(buf => {
        if (gen !== vGen || !buf || !on || mode !== 'wa' || (!unlocked && ctx.state !== 'running')) return;
        stopVoice();
        try {
          if (ctx.state !== 'running') ctx.resume().catch(() => {});
          const src = ctx.createBufferSource(), g = ctx.createGain();
          src.buffer = buf; g.gain.value = VOICE_VOL;
          src.connect(g); g.connect(ctx.destination);
          if (cur) rampTo(cur.gain.gain, DUCK, .3);
          src.onended = () => {
            if (voiceNow && voiceNow.src === src) { voiceNow = null; if (cur) rampTo(cur.gain.gain, BGM_VOL, .8); }
            try { src.disconnect(); g.disconnect(); } catch (_) {}
          };
          src.start(0);
          voiceNow = { src };
        } catch (_) {}
      });
    } else {
      try {
        const a = new Audio('voice/' + name + '.mp3');
        a.volume = VOICE_VOL;
        if (elBgm) elFade(elBgm, DUCK, 300);
        a.onended = () => { if (elVoice === a) { elVoice = null; if (elBgm) elFade(elBgm, BGM_VOL, 800); } };
        elVoice = a;
        a.play().catch(() => {});
      } catch (_) {}
    }
  }
  function stopVoice() {
    vGen++;
    if (voiceNow) { const v = voiceNow; voiceNow = null; try { v.src.stop(); } catch (_) {} if (cur) rampTo(cur.gain.gain, BGM_VOL, .5); }
    if (elVoice) { try { elVoice.pause(); } catch (_) {} elVoice = null; if (elBgm) elFade(elBgm, BGM_VOL, 500); }
  }

  function toggle() {
    on = !on;
    if (!on) stopVoice();
    try { localStorage.setItem('ikite-sound', on ? 'on' : 'off'); } catch (_) {}
    if (mode === 'wa') waToggle();
    else if (elBgm) { if (on) elResume(); else elBgm.pause(); }
    return on;
  }

  // ================= 画面の出入り・操作の見張り =================
  ['pointerdown', 'touchend', 'keydown', 'click'].forEach(ev => window.addEventListener(ev, unlock, true));

  document.addEventListener('visibilitychange', () => {
    if (mode === 'wa') {
      if (document.hidden) { ctx.suspend().catch(() => {}); return; }
      if (!unlocked) return;
      ctx.resume().catch(() => {});   // iPhone で戻せなかったときは、次のタップで unlock() が戻す
      if (cur) { // 戻ったら BGM をそっと上げる
        const g = cur.gain.gain, t = ctx.currentTime;
        g.cancelScheduledValues(0); g.setValueAtTime(0, t); g.linearRampToValueAtTime(voiceNow ? DUCK : BGM_VOL, t + .8);
      }
    } else if (elBgm) {
      if (document.hidden) elBgm.pause(); else elResume();
    }
  });

  // 効果音は、ページの読みこみが終わったら先に読んでおく（デコードは止まった状態の AudioContext でもできる）
  if (document.readyState === 'complete') setTimeout(preloadSfx, 300);
  else window.addEventListener('load', () => setTimeout(preloadSfx, 300));

  return { sfx, music, voice, stopVoice, toggle, get on() { return on; } };
})();
