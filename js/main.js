// 大阪で生きてみた — ゲームの進行
(() => {
  const D = window.GAME_DATA, S = window.Sound;
  const app = document.getElementById('app');
  const params = new URLSearchParams(location.search);
  const giinKey = params.get('giin') || 'izumi';   // 公開用：泉さん版だけ
  const GIIN = giinKey && Object.prototype.hasOwnProperty.call(D.GIIN, giinKey) ? D.GIIN[giinKey] : D.GIIN.izumi;   // 公開用：どのURLでも泉さん版

  const METER = { money: 'お金', yutori: 'ゆとり', yume: '夢' };
  const BY = { '国府': ['fu', '決めたのは：国と大阪府'], '府': ['fu', '決めたのは：大阪府'], '市': ['shi', '決めたのは：大阪市'], '府市': ['fushi', '決めたのは：大阪府と大阪市'], 'いま': ['ima', '大阪のいま'] };

  let st = null;          // 1回のプレイの状態
  let shown = null;       // ゲージの表示中の値（アニメーション用）
  let stageIdx = 0, stepIdx = 0;
  let cur = null;         // いまの画面

  function newState() {
    return { town: null, m: { money: 50, yutori: 50, yume: 50 }, saved: 0, savedItems: [], quiz: 0, quizN: 0, seen: [], choices: {}, pairStars: 0, budgetType: '', budgetSmile: null, dashStars: 0 };
  }

  // ---------- 図鑑（この端末の中だけに保存）----------
  function zukan() { try { return JSON.parse(localStorage.getItem('ikite-zukan') || '[]'); } catch (_) { return []; } }
  function addZukan(id) {
    const z = zukan();
    if (z.includes(id)) return false;
    z.push(id);
    try { localStorage.setItem('ikite-zukan', JSON.stringify(z)); } catch (_) {}
    return true;
  }

  // ---------- 画面 ----------
  function show(html, cls = '') {
    const el = document.createElement('section');
    el.className = 'screen ' + cls;
    el.innerHTML = html;
    if (cur) { const old = cur; old.classList.add('leaving'); setTimeout(() => old.remove(), 320); }
    if (S.stopVoice && !/vn-screen|vote-screen|end-screen/.test(cls)) S.stopVoice();
    const tw = app.querySelector('.toast-wrap');
    if (tw) tw.innerHTML = '';   // 前の画面の浮き文字は消す（次の画面の文字に重ならないように）
    el.style.pointerEvents = 'none';
    setTimeout(() => { el.style.pointerEvents = ''; }, 350);
    app.appendChild(el);
    cur = el;
    const h = el.querySelector('.hud');
    if (h) el.style.setProperty('--hud-h', h.offsetHeight + 'px');
    requestAnimationFrame(syncMeters);
    return el;
  }
  const on = (el, sel, fn) => el.querySelectorAll(sel).forEach(b => b.addEventListener('click', fn));

  function toast(text) {
    let w = app.querySelector('.toast-wrap');
    if (!w) { w = document.createElement('div'); w.className = 'toast-wrap'; app.appendChild(w); }
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = text;
    w.appendChild(t);
    setTimeout(() => t.remove(), 1900);
  }

  // 音のボタン（どの画面でも右上）
  const sndBtn = document.createElement('button');
  sndBtn.className = 'icon-btn';
  sndBtn.setAttribute('aria-label', '音のオン・オフ');
  const paintSnd = () => { sndBtn.textContent = S.on ? '🔊' : '🔇'; };
  paintSnd();
  sndBtn.addEventListener('click', () => { S.toggle(); paintSnd(); });
  app.appendChild(sndBtn);

  // ---------- 上のバー ----------
  function hud() {
    const stage = D.STAGES[stageIdx];
    const total = D.STAGES.length;
    const meters = Object.keys(METER).map(k => `
      <div class="meter ${k}"><div class="meter-label"><span>${METER[k]}</span><span data-num="${k}">${Math.round(shown[k])}</span></div>
      <div class="meter-bar"><i data-bar="${k}" style="width:${shown[k]}%"></i></div></div>`).join('');
    return `<header class="hud">
      <div class="hud-top"><span class="age-chip">${stage.age}<small>歳</small></span><span class="hud-title">${stage.title}</span><span class="hud-step">${stageIdx + 1} / ${total}</span></div>
      <div class="meters">${meters}</div>
      <div class="saved-pill"><span>大阪の制度で受けられる支援</span><b data-saved>${st.saved}万円</b></div>
    </header>`;
  }
  function syncMeters() {
    if (!st || !cur) return;
    Object.keys(METER).forEach(k => {
      const bar = cur.querySelector(`[data-bar="${k}"]`);
      if (bar) bar.style.width = st.m[k] + '%';
      const num = cur.querySelector(`[data-num="${k}"]`);
      if (num) countUp(num, shown[k], st.m[k]);
      shown[k] = st.m[k];
    });
  }
  function countUp(el, from, to, suffix = '') {
    if (from === to) { el.textContent = to + suffix; return; }
    const t0 = performance.now();
    (function step(t) {
      const k = Math.min(1, (t - t0) / 700);
      el.textContent = Math.round(from + (to - from) * k) + suffix;
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }
  function applyEff(eff) {
    Object.entries(eff || {}).forEach(([k, v], i) => {
      st.m[k] = Math.max(0, Math.min(100, st.m[k] + v));
      const here = cur;
      setTimeout(() => {
        if (cur !== here) return;
        const m = cur.querySelector(`.meter.${k}`);
        if (!m) { toast(`${METER[k]} ${v > 0 ? '+' : ''}${v}`); return; }
        const b = document.createElement('span');
        b.className = 'meter-pop ' + (v > 0 ? 'up' : 'down');
        b.textContent = (v > 0 ? '+' : '') + v;
        m.appendChild(b);
        setTimeout(() => b.remove(), 1600);
      }, i * 150);
    });
    syncMeters();
  }
  function addSaved(amount, label) {
    st.saved += amount;
    st.savedItems.push([label, amount]);
    const b = cur && cur.querySelector('[data-saved]');
    if (b) { countUp(b, st.saved - amount, st.saved, '万円'); b.parentElement.classList.remove('bump'); void b.offsetWidth; b.parentElement.classList.add('bump'); }
    S.sfx('coin');
  }

  // ---------- 手ざわり（スマホのふるえ）----------
  const buzz = ms => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (_) {} };

  // ---------- 読みこみ ----------
  const CRITICAL = ['img/title.jpg', 'img/s1.jpg', 'img/icons.jpg', 'img/choice_0.jpg', 'img/choice_1.jpg'];
  const LATER = ['s2', 's3', 's4', 's5', 's6_after', 's6_before', 'vote', 'ending', 'merge', 'types', 'face_0', 'face_1']
    .map(n => `img/${n}.jpg`).concat([...Array(10)].map((_, i) => `img/choice_${i}.jpg`), [0, 1, 2, 3].map(i => `img/icon2_${i}.jpg`),
      [0, 1, 2].map(i => `img/icon3_${i}.jpg`), ['jo', 'umekita'].flatMap(n => [`img/ba_${n}_before.jpg`, `img/ba_${n}_after.jpg`]));
  function preload(list) {
    return list.map(src => new Promise(res => { const im = new Image(); im.onload = im.onerror = res; im.src = src; }));
  }
  function loader(then) {
    const el = show(`
      <div class="loader">
        <div class="loader-logo">大阪で<span>生きてみた</span></div>
        <div class="loader-bar"><i data-bar></i></div>
        <div class="loader-txt">大阪の15年を準備中…</div>
      </div>`, 'loader-screen');
    const bar = el.querySelector('[data-bar]');
    const jobs = preload(CRITICAL);
    let n = 0;
    jobs.forEach(j => j.then(() => { n++; bar.style.width = (n / jobs.length * 100) + '%'; }));
    const t0 = Date.now();
    Promise.race([Promise.all(jobs), new Promise(r => setTimeout(r, 6000))]).then(() => {
      setTimeout(() => { then(); preload(LATER); }, Math.max(0, 500 - (Date.now() - t0)));
    });
  }

  // ---------- タイトル ----------
  function title() {
    st = null;
    const el = show(`
      <div class="title-bg"></div>
      <div class="title-glow">${[...Array(14)].map((_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${6 + (i % 5)}s;--w:${i * .7}s"></i>`).join('')}</div>
      <div class="title-top">
        <div class="title-kicker">もし今年15歳だったら？</div>
        <h1 class="title-logo"><span class="l1">大阪で</span><br><span class="l2">生きてみた</span></h1>
        <div class="title-sub">15年・6つの分かれ道。<br>あなたの選択と、大阪の制度の物語。</div>
        ${GIIN ? `<div class="title-giin">${GIIN.photo ? `<i style="background-image:url(${GIIN.photo})"></i>` : ''}<span><small>${GIIN.role}</small><b>${GIIN.name}</b> 版</span></div>` : ''}
      </div>
      <div class="title-bottom">
        <button class="btn btn-shine" data-start>はじめる</button>
        <div class="title-links"><button data-zukan>制度図鑑</button><button data-about>このゲームについて</button></div>
        <div class="title-credit">制作：大阪維新の会${GIIN ? '　｜　' + GIIN.name + ' 版' : ''}</div>
      </div>`, 'title-screen');
    on(el, '[data-start]', () => { S.sfx('start'); buzz(15); S.music('main'); town(); });
    on(el, '[data-zukan]', () => { S.sfx('tap'); zukanScreen(title); });
    on(el, '[data-about]', () => { S.sfx('tap'); about(title); });
    const firstTouch = () => { if (!st) S.music('title'); };
    el.addEventListener('pointerdown', firstTouch, { once: true });
  }

  function town() {
    st = newState();
    shown = { ...st.m };
    const el = show(`
      <div class="pad grow" style="padding-top:60px">
        <div class="quiz-kicker">はじめに</div>
        <h2 class="q-title" style="font-size:24px;margin:14px 0 6px">どこで暮らす？</h2>
        <p class="note" style="margin:0 0 16px">大阪の制度には、府全体のものと、市や町ごとのものがあります。</p>
        <div class="tiles n2">
          <button class="tile fade-in delay1" data-town="osaka">
            <div class="tile-pic" style="background-image:url(img/s6_after.jpg)"></div>
            <div class="tile-txt"><b>大阪市</b><span>梅田・難波・天王寺</span></div>
          </button>
          <button class="tile fade-in delay2" data-town="other">
            <div class="tile-pic" style="background-image:url(img/choice_1.jpg)"></div>
            <div class="tile-txt"><b>府内のほかのまち</b><span>枚方・堺・豊中 など</span></div>
          </button>
        </div>
        <p class="note mt">※ ここでの選択は、どこにも保存・送信されません。</p>
      </div>`);
    on(el, '[data-town]', e => { S.sfx('choose'); buzz(10); st.town = e.currentTarget.dataset.town; howto(); });
  }

  function howto() {
    const el = show(`
      <div class="pad grow" style="padding-top:60px">
        <div class="quiz-kicker">遊び方</div>
        <h2 class="q-title" style="font-size:22px;margin:14px 0 18px">あなたは今年15歳。<br>30歳までの15年を生きる。</h2>
        <div class="howto">
          <div class="howto-item fade-in delay1"><div class="howto-ic" style="background-image:url(img/icon3_0.jpg)"></div><div><b>6つの分かれ道</b><span>選んだ道で「お金・ゆとり・夢」の3つのゲージが変わります。正解はありません。</span></div></div>
          <div class="howto-item fade-in delay2"><div class="howto-ic" style="background-image:url(img/icon3_1.jpg)"></div><div><b>予想クイズ</b><span>大阪の本当の制度を予想。知らなくて大丈夫です。</span></div></div>
          <div class="howto-item fade-in delay3"><div class="howto-ic" style="background-image:url(img/icon3_2.jpg)"></div><div><b>ミニゲーム${window.Dash && window.THREE ? 3 : 2}つ</b><span>${window.Dash && window.THREE ? '府市あわせ・大阪のお財布・3Dの通勤ダッシュ。' : '府市あわせと大阪のお財布。'}</span></div></div>
        </div>
        <p class="howto-note">上の「大阪の制度で受けられる支援」は、あなたの道で使える大阪府・大阪市の支援の目安。国の制度の分は数えないので、道によっては0円のこともあります。</p>
        <button class="btn mt" data-go>15歳の冬へ</button>
      </div>`);
    S.voice('howto');
    on(el, '[data-go]', () => { S.sfx('choose'); buzz(10); ageUp(0); });
  }

  // ---------- 年齢が上がる演出 ----------
  const SEASON = ['冬', '秋', '春', '夏', '秋', '休日'];
  function ageUp(i) {
    const stage = D.STAGES[i];
    const from = i > 0 ? D.STAGES[i - 1].age : stage.age;
    const later = stage.age - 15;
    const el = show(`
      <div class="ageup" style="background-image:url(${stage.img})">
        <div class="ageup-in">
          <div class="ageup-stage">STAGE ${i + 1} / ${D.STAGES.length}</div>
          <div class="ageup-age"><b data-age>${from}</b><span>歳</span></div>
          <div class="ageup-year">${later ? later + '年後' : 'いま'}・${SEASON[i]}</div>
          <div class="ageup-title">${stage.title}</div>
          <div class="ageup-dots">${D.STAGES.map((_, k) => `<i class="${k < i ? 'done' : k === i ? 'now' : ''}"></i>`).join('')}</div>
        </div>
      </div>`);
    S.sfx('stage');
    if (from !== stage.age) setTimeout(() => countUp(el.querySelector('[data-age]'), from, stage.age), 250);
    let done = false;
    const go = () => { if (done) return; done = true; runStage(i); };
    el.addEventListener('click', go);
    setTimeout(go, 1900);
  }

  function runStage(i) { stageIdx = i; stepIdx = -1; next(); }

  function next() {
    const steps = D.STAGES[stageIdx].steps;
    do { stepIdx++; } while (stepIdx < steps.length && skip(steps[stepIdx]));
    if (stepIdx >= steps.length) {
      S.sfx('clear');
      if (stageIdx + 1 < D.STAGES.length) ageUp(stageIdx + 1); else result();
      return;
    }
    const step = steps[stepIdx];
    ({ story, choice, quiz, card, doubt, giin, pair, budget, slider, dash })[step.type](step);
  }
  function skip(step) {
    if (step.if && !step.if(st)) return true;
    if (step.type === 'giin' && !(GIIN && GIIN.lines && ready(GIIN.lines[step.at]))) return true;
    if (step.type === 'dash' && !(window.Dash && window.THREE)) return true;   // 3Dが読めないときは飛ばす
    return false;
  }
  const firstStory = () => D.STAGES[stageIdx].steps.findIndex(s => s.type === 'story') === stepIdx;

  // ---------- ミニゲーム：3D 通勤ダッシュ（js/dash.js）----------
  function dash() {
    const mode = ['subway', 'bike', 'walk'][st.choices.s3] || 'subway';
    const el = show(`<div class="dash-host" data-host></div>`, 'dash-screen');
    S.music('dash');
    S.voice('dash');
    const SFX = { start: 'start', coin: 'coin', clock: 'match', hit: 'wrong', jump: 'flip', goal: 'clear', count: 'tap' };
    const finds = (D.FIND_ROUTE[mode] || []).map(id => ({ id, title: D.FINDS[id].title }));
    window.Dash.run(el.querySelector('[data-host]'), { mode, finds, sfx: n => { S.sfx(SFX[n] || 'tap'); if (n === 'hit') buzz(40); } })
      .then(r => dashResult(r))
      .catch(() => next());
  }
  function dashResult(r) {
    S.music('main');
    const eff = {};
    if (r.skipped) { S.music('main'); next(); return; }
    const money = Math.min(15, Math.round(r.coins / 6)), yutori = Math.min(15, r.clocks * 2) - Math.min(15, r.hits * 3);
    if (money) eff.money = money;
    if (yutori) eff.yutori = yutori;
    st.dashStars = r.late ? 1 : r.hits <= 1 ? 3 : 2;
    const el = show(`${hud()}
      <div class="pad grow">
        <div class="game-head"><span class="tag">ミニゲーム　通勤ダッシュ</span></div>
        <div class="dash-res ${r.late ? 'late' : 'ok'}">${r.late ? '遅刻……！' : '間に合った！'}</div>
        <div class="stars">${starStr(st.dashStars)}</div>
        <div class="res-box mt">
          <div class="res-row"><span>🪙 コイン</span><b>${r.coins}</b></div>
          <div class="res-row"><span>⏰ 時計</span><b>${r.clocks}</b></div>
          <div class="res-row"><span>💥 ぶつかった</span><b>${r.hits}回</b></div>
        </div>
        <p class="result-line">${r.late ? '初日から遅刻。先輩は笑って許してくれたけど、明日からは早起きしよう。' : 'ギリギリセーフ。大阪の朝は、今日もにぎやか。'}</p>
        ${findsHtml(r)}
        <button class="btn" data-next>次へ</button>
      </div>`);
    S.sfx(r.late ? 'wrong' : 'clear');
    setTimeout(() => applyEff(eff), 400);
    on(el, '[data-next]', () => { S.sfx('tap'); next(); });
  }

  // 通勤の道で見つけた「大阪の変化」。見のがしたものは、たたんで見られるように
  function findsHtml(r) {
    const mode = ['subway', 'bike', 'walk'][st.choices.s3] || 'subway';
    const ids = D.FIND_ROUTE[mode] || [];
    if (!ids.length) return '';
    const got = new Set(Array.isArray(r.finds) ? r.finds : []);
    const one = (id, ok) => {
      const f = D.FINDS[id];
      return `<div class="find-item ${ok ? 'ok' : ''}">
        <b>${ok ? '<span class="find-mark">発見</span>' : ''}${f.title}</b>
        <p>${f.fact}</p>
        <div class="seido-who ${f.ishin ? 'ishin' : ''}"><em>だれが進めた？${f.ishin ? '<span class="ishin-tag">大阪維新の会</span>' : ''}</em>${f.who}</div>
        <a class="find-src" href="${f.src.url}" target="_blank" rel="noopener noreferrer">出典：${f.src.label}</a>
      </div>`;
    };
    const hit = ids.filter(id => got.has(id)), miss = ids.filter(id => !got.has(id));
    return `<div class="finds mt">
      <h4>通勤の道で見つけた、大阪の変化 <span>${hit.length} / ${ids.length}</span></h4>
      ${hit.length ? hit.map(id => one(id, true)).join('') : '<p class="note" style="margin:0">今日は走るのに必死で、まわりを見るよゆうがなかった。</p>'}
      ${miss.length ? `<details class="find-miss"><summary>見のがした変化を見る（${miss.length}つ）</summary>${miss.map(id => one(id, false)).join('')}</details>` : ''}
    </div>`;
  }

  // ---------- 各ステップ ----------
  // 物語：絵を画面いっぱいに。文字は1行ずつタップで送る
  function story(step) {
    const stage = D.STAGES[stageIdx];
    const lines = step.lines || [step.text];
    const el = show(`${hud()}
      <div class="vn" style="background-image:url(${step.img || stage.img})${step.pos ? `;background-position:${step.pos}` : ''}">
        <div class="vn-box">
          ${firstStory() ? `<div class="vn-title">${stage.title}</div>` : ''}
          <div class="vn-lines">${lines.map((t, k) => `<p class="vn-line" style="animation-delay:${0.25 + k * 0.7}s">${t}</p>`).join('')}</div>
          <div class="vn-hint">タップで進む ▼</div>
        </div>
      </div>`, 'vn-screen');
    const vn = el.querySelector('.vn');
    if (firstStory()) S.voice(stage.id);
    const t0 = Date.now(), all = 250 + lines.length * 700;
    let busy = false;
    vn.addEventListener('click', () => {
      if (busy) return;
      busy = true; setTimeout(() => { busy = false; }, 250);
      S.sfx('tap');
      if (Date.now() - t0 < all && !vn.classList.contains('shown')) { vn.classList.add('shown'); return; }
      next();
    });
  }

  function effChips(eff) {
    return Object.entries(eff).map(([k, v]) => `<span class="eff ${v > 0 ? 'up' : 'down'}">${METER[k]}${v > 0 ? '▲' : '▼'}</span>`).join('');
  }

  // 選択肢：絵のタイル
  function choice(step) {
    const n = step.options.length;
    const el = show(`${hud()}
      <div class="pad grow">
        <h3 class="q-title center" style="font-size:22px;margin:4px 0 16px">${step.q}</h3>
        <div class="tiles n${n}">${step.options.map((o, i) => `
          <button class="tile fade-in delay${i + 1}" data-i="${i}">
            <div class="tile-pic" style="background-image:url(img/choice_${o.pic}.jpg)"></div>
            <div class="tile-txt"><b>${o.label}</b><span>${o.sub}</span><div class="effs">${effChips(o.eff)}</div></div>
          </button>`).join('')}
        </div>
      </div>`, 'choice-screen');
    on(el, '[data-i]', e => {
      const i = +e.currentTarget.dataset.i, o = step.options[i];
      st.choices[step.key] = i;
      S.sfx('choose'); buzz(10);
      const box = el.querySelector('.pad');
      box.innerHTML = `<div class="picked fade-in" style="background-image:url(img/choice_${o.pic}.jpg)"><span>${o.label}</span></div>
        <p class="result-line fade-in delay1">${o.res}</p><button class="btn fade-in delay2" data-next>次へ</button>`;
      applyEff(o.eff);
      on(box, '[data-next]', () => { S.sfx('tap'); next(); });
    });
  }

  // 予想クイズ：答えると、その場で制度カードが出る
  function quiz(step) {
    st.quizN++;
    const n = st.quizN;
    const c = D.CARDS[step.card];
    // 選択肢の並びを毎回シャッフル（order[表示の位置] = もとの番号）
    const order = step.options.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const el = show(`${hud()}
      <div class="pad grow">
        <div class="quiz-top">
          <div class="seido-icon" style="background-position:${iconPos(c.icon)}"></div>
          <div><div class="quiz-kicker">予想クイズ Q${n}</div><h3 class="q-title" style="margin:8px 0 0">${step.q}</h3></div>
        </div>
        ${step.note ? `<p class="quiz-note">${step.note}</p>` : ''}
        <div class="quiz-opts">${order.map((k, i) => `<button class="quiz-opt" data-i="${k}"><span class="mark">${'ABC'[i]}</span><b>${step.options[k]}</b></button>`).join('')}</div>
        <div data-after></div>
      </div>`);
    let answered = false;
    on(el, '[data-i]', e => {
      if (answered) return;
      answered = true;
      const i = +e.currentTarget.dataset.i, ok = i === step.answer;
      if (ok) st.quiz++;
      S.sfx(ok ? 'correct' : 'wrong'); buzz(ok ? 15 : [30, 40, 30]);
      el.querySelectorAll('.quiz-opt').forEach(b => {
        const j = +b.dataset.i;
        if (j === step.answer) { b.classList.add('correct'); b.querySelector('.mark').textContent = '○'; }
        else if (j === i) { b.classList.add('wrong'); b.querySelector('.mark').textContent = '×'; }
        else b.classList.add('dim');
      });
      el.insertAdjacentHTML('beforeend', `<div class="stamp ${ok ? 'ok' : 'ng'}">${ok ? '正解' : 'ざんねん'}</div>`);
      setTimeout(() => {
        const after = el.querySelector('[data-after]');
        after.innerHTML = `<p class="center note" style="margin:14px 0 10px">大阪ツウ度 ${st.quiz} / ${st.quizN}</p>${cardBlock(step.card)}`;
        on(after, '[data-next]', () => { S.sfx('tap'); next(); });
        after.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 900);
    });
  }

  // 大阪の制度で受けられる支援（国の制度の分は数えない）
  function savedFor(id) {
    if (id === 'shiritsu') return st.choices.s1 === 0 ? [52, '私立高校の授業料（3年・府の上乗せ分）'] : null;
    if (id === 'daigaku') return st.choices.s2 === 0 ? [214, '大学の授業料（4年）'] : null;
    if (id === 'jukudai') return st.town === 'osaka' ? [60, '塾・習いごと代（小5〜中3の5年・最大）'] : null;
    return null;
  }
  const MONEY_CARDS = ['shiritsu', 'daigaku', 'jukudai'];
  function missNote(id) {
    if (id === 'shiritsu' && st.choices.s1 !== 0) return '公立高校の授業料は、国の制度で無料です。';
    if (id === 'daigaku' && st.choices.s2 !== 0) return '働きながら、あとから大学へ進むときにも使える制度です（条件あり）。';
    if (id === 'jukudai') return 'あなたの子どもが小学5年生になる、約10年後からの支援です。';
    return '';
  }
  // ほかの道で出会える制度（お金ではなく、制度の名前で）
  function missed() {
    const all = ['shiritsu', 'daigaku', 'taiki', 'hoikuryo', 'jukudai', 'kitakyu'];
    return all.filter(id => !st.seen.includes(id)).map(id => D.CARDS[id].title);
  }

  const iconPos = i => `${(i % 4) * 100 / 3}% ${Math.floor(i / 4) * 50}%`;

  // 制度カード：大きな数字と条件。ねらい・くわしくは下に
  function cardHtml(c, opts = {}) {
    const [cls, label] = BY[c.by];
    return `<article class="seido">
      <div class="seido-band ${cls}"><span>${opts.kicker || c.kicker || 'これ、本当にある制度'}</span><span>${label}</span></div>
      ${opts.isNew ? '<span class="seido-new">図鑑に追加</span>' : ''}
      <div class="seido-hero">
        <div class="seido-icon big" style="background-position:${iconPos(c.icon)}"></div>
        <div class="seido-big">${c.big}</div>
        <div class="seido-bigsub">${c.bigSub}</div>
        <div class="seido-cond">${c.cond}</div>
      </div>
      <div class="seido-body">
        ${opts.note ? `<p class="seido-note">${opts.note}</p>` : ''}
        <div class="seido-who ${c.ishin ? 'ishin' : ''}"><em>だれが進めた？${c.ishin ? '<span class="ishin-tag">大阪維新の会</span>' : ''}</em>${c.who}</div>
        <p class="seido-why"><em>目的</em>${c.why}</p>
        <details class="seido-more"><summary>詳しく</summary>
          <p class="seido-fact">${c.fact}</p>
          <p class="seido-detail">${c.detail}</p>
          <a class="seido-src" href="${c.src.url}" target="_blank" rel="noopener">出典：${c.src.label} ↗</a>
        </details>
      </div>
    </article>`;
  }

  // カードを出す（図鑑への追加・受けられる支援もここで）
  function cardBlock(id, withNext = true) {
    const c = D.CARDS[id];
    if (!st.seen.includes(id)) st.seen.push(id);
    const isNew = addZukan(id);
    let note = missNote(id);
    if (c.osakaCityOnly && st.town !== 'osaka') note = '※ 大阪市の制度です。あなたのまちの制度は、あなたのまちの議会と市町村長が決めています。';
    const sv = savedFor(id);
    S.sfx('card');
    if (sv) setTimeout(() => addSaved(sv[0], sv[1]), 900);
    return `${cardHtml(c, { isNew, note })}
      ${sv ? `<div class="saved-burst">大阪の制度で +${sv[0]}万円</div>` : MONEY_CARDS.includes(id) ? '<div class="saved-burst zero">あなたの道では +0万円</div>' : ''}
      ${withNext ? '<button class="btn mt" data-next>次へ</button>' : ''}`;
  }

  function card(step) {
    const el = show(`${hud()}<div class="pad grow">${cardBlock(step.id)}</div>`);
    on(el, '[data-next]', () => { S.sfx('tap'); next(); });
  }

  // よくある疑問：顔つきの吹き出し2つ
  function doubt(step) {
    const el = show(`${hud()}
      <div class="pad grow">
        <div class="quiz-kicker">よくある疑問</div>
        <h3 class="doubt-q">${step.q}</h3>
        <div class="chat left fade-in"><div class="face" style="background-image:url(img/face_0.jpg)"></div><div class="bubble"><em>こんな声もあります</em>${step.voices}</div></div>
        <div class="chat right fade-in delay2"><div class="bubble"><em>大阪維新の会の考え方</em>${step.ishin}</div><div class="face" style="background-image:url(img/face_1.jpg)"></div></div>
        ${step.stance ? `<div class="stance fade-in delay2">
          <p class="stance-ask">${step.stance.ask}</p>
          <div class="stance-btns"><button data-s="yes">なるほど</button><button data-s="no">まだ気になる</button></div>
          <p class="stance-res" data-res hidden></p>
        </div>` : ''}
        <button class="btn mt" data-next>次へ</button>
      </div>`);
    on(el, '[data-s]', e => {
      const k = e.currentTarget.dataset.s, res = el.querySelector('[data-res]');
      el.querySelectorAll('[data-s]').forEach(b => b.classList.toggle('on', b === e.currentTarget));
      res.textContent = step.stance[k]; res.hidden = false;
      res.classList.remove('pop'); void res.offsetWidth; res.classList.add('pop');
      S.sfx('choose');
    });
    on(el, '[data-next]', () => { S.sfx('tap'); next(); });
  }

  // ---------- 議員・党のひとこと ----------
  const ready = t => !!t && !/^（ここに/.test(typeof t === 'string' ? t : t.text || '');   // 仮の文は出さない
  function giinBubble(text, g, sub) {
    const pic = g && g.photo
      ? `<div class="giin-photo" style="background-image:url(${g.photo})"></div>`
      : g && g.initial ? `<div class="giin-photo initial">${g.initial}</div>`
      : `<div class="giin-photo party" style="background-position:${iconPos(4)}"></div>`;
    return `<div class="giin fade-in">${pic}
      <div class="giin-bubble"><div class="giin-name">${g ? g.name + '（' + g.role + '）' : D.PARTY.name}</div>${text}${sub || (g && g.from) ? `<div class="giin-src">${[sub, g && g.from].filter(Boolean).join('　｜　')}</div>` : ''}</div>
    </div>`;
  }
  function giin(step) {
    const line = GIIN.lines[step.at];
    const L = typeof line === 'string' ? { text: line } : line;
    const el = show(`${hud()}
      <div class="hero" style="background-image:url(${D.STAGES[stageIdx].img})"></div>
      <div class="pad grow">
        <div class="quiz-kicker">${L.kicker || 'ひと言'}</div>
        <div class="mt">${giinBubble(L.text, GIIN, L.sub)}</div>
        <button class="btn mt" data-next>次へ</button>
      </div>`);
    on(el, '[data-next]', () => { S.sfx('tap'); next(); });
  }

  // ---------- ミニゲーム：府市あわせ（左の府と右の市で、同じ役目のものをタップでつなぐ）----------
  function pair() {
    const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const pic = p => `background-position:${(p.icon % 2) * 100}% ${Math.floor(p.icon / 2) * 100}%`;
    const item = (p, side) => `<button class="fs-item ${side}" data-side="${side}" data-p="${p.id}">
        <span class="fs-pic" style="${pic(p)}"></span><span class="fs-nm">${p[side]}</span><span class="fs-no"></span></button>`;
    const el = show(`${hud()}
      <div class="pad grow">
        <div class="game-head"><span class="tag">ミニゲーム①　府市あわせ</span><span data-moves>0 / ${D.PAIRS.length}</span></div>
        <p class="game-rule">大阪では、府と市が<b>同じ役目の施設</b>を別々に持っていました。<br>左の府と右の市で、同じ役目のものを<b>順にタップしてつなごう</b>。</p>
        <div class="fs-board">
          <div class="fs-col"><div class="fs-head fu">大阪府</div>${shuffle(D.PAIRS).map(p => item(p, 'fu')).join('')}</div>
          <div class="fs-col"><div class="fs-head shi">大阪市</div>${shuffle(D.PAIRS).map(p => item(p, 'shi')).join('')}</div>
        </div>
        <div class="merge-log" data-log></div>
        <div data-after></div>
      </div>`);
    let pick = null, matched = 0, miss = 0, lock = false;
    const t0 = Date.now();
    el.querySelectorAll('.fs-item').forEach(b => b.addEventListener('click', () => {
      if (lock || b.classList.contains('done')) return;
      if (!pick || pick.dataset.side === b.dataset.side) {
        if (pick) pick.classList.remove('sel');
        pick = b; b.classList.add('sel'); S.sfx('flip');
        return;
      }
      const a = pick; pick = null;
      a.classList.remove('sel');
      if (a.dataset.p === b.dataset.p) {
        matched++;
        [a, b].forEach(x => { x.classList.add('done'); x.querySelector('.fs-no').textContent = matched; });
        S.sfx('merge'); buzz(15);
        const p = D.PAIRS.find(x => x.id === a.dataset.p);
        el.querySelector('[data-moves]').textContent = `${matched} / ${D.PAIRS.length}`;
        el.querySelector('[data-log]').insertAdjacentHTML('beforeend',
          `<div class="merge-item"><span class="fs-no">${matched}</span>${p.merged}<i>${p.year}に一つに</i></div>`);
        if (matched === D.PAIRS.length) finish();
      } else {
        miss++; lock = true;
        [a, b].forEach(x => x.classList.add('ng'));
        S.sfx('wrong');
        setTimeout(() => { [a, b].forEach(x => x.classList.remove('ng')); lock = false; }, 600);
      }
    }));
    function finish() {
      const sec = Math.round((Date.now() - t0) / 1000);
      st.pairStars = miss === 0 ? 3 : miss <= 2 ? 2 : 1;
      setTimeout(() => {
        S.sfx('clear');
        const after = el.querySelector('[data-after]');
        after.innerHTML = `<div class="verdict fade-in center">
            <div class="stars">${starStr(st.pairStars)}</div>
            <b>${sec}秒・まちがい${miss}回でクリア！</b><br>この4組は、大阪で本当に一つになりました。
          </div>${cardBlock('fushiawase')}`;
        on(after, '[data-next]', () => { S.sfx('tap'); next(); });
        after.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 500);
    }
  }
  const starStr = n => '★'.repeat(n) + `<span class="off">${'★'.repeat(3 - n)}</span>`;

  // ---------- ミニゲーム：大阪のお財布（正解なし。どの道にもよい面と課題がある）----------
  const optIcon = ic => typeof ic === 'string'
    ? `<span class="oi" style="background:var(--paper) url(${ic}) center / cover"></span>`
    : `<span class="oi" style="background-position:${iconPos(ic)}"></span>`;
  function budget() {
    // 2年間版（js/budget.js）があればそちらで遊ぶ
    if (window.Budget) {
      const el = show(`${hud()}<div class="budget-host" data-host></div>`, 'budget-screen');
      window.Budget.run(el.querySelector('[data-host]'), { sfx: n => S.sfx(n), buzz })
        .then(r => budgetEnd(r))
        .catch(() => next());
      return;
    }
    const B = D.BUDGET;
    const sel = { r: new Set(), w: new Set() };
    const el = show(`${hud()}
      <div class="pad grow">
        <div class="game-head"><span class="tag">ミニゲーム②　大阪のお財布</span></div>
        <p class="game-rule">あなたが大阪のお財布をあずかったら？<br><b>①お金を作って、②使い道を決めよう。</b>全部はかなえられません。正解はありません。</p>
        <div class="wallet">
          <div class="coin"><i class="coin-ic"></i>残りコイン<b data-w="coin">0</b></div>
          <div>みんなの満足<b data-w="manzoku">0</b></div>
          <div>未来の安心<b data-w="mirai">0</b></div>
        </div>
        <div class="sec-title">① お金を作る（はじめは ${B.start} コイン）</div>
        <div class="opt-grid">${B.reforms.map(r => `
          <button class="opt" data-r="${r.id}">${optIcon(r.ic)}<b>${r.label}</b><span>${r.sub}</span><span class="cost plus">+${r.coin}コイン</span></button>`).join('')}</div>
        <div class="sec-title">② 使い道を決める</div>
        <div class="opt-grid">${B.wishes.map(w => `
          <button class="opt" data-wi="${w.id}">${optIcon(w.ic)}<b>${w.label}</b><span>${w.manzoku ? '満足+' + w.manzoku : '未来+' + w.mirai}</span><span class="cost minus">−${w.cost}コイン</span></button>`).join('')}</div>
        <p class="budget-note">※ ゲーム用にお金を「コイン」に単純化しています。実際の予算の大きさや比率とはちがいます。</p>
        <button class="btn green" data-done disabled>これで決める</button>
      </div>`);
    const R = id => B.reforms.find(x => x.id === id), W = id => B.wishes.find(x => x.id === id);
    function calc() {
      let coin = B.start, manzoku = 0, mirai = 3;
      sel.r.forEach(id => { const r = R(id); coin += r.coin; manzoku += r.manzoku || 0; mirai += r.mirai || 0; });
      let spent = 0;
      sel.w.forEach(id => { const w = W(id); spent += w.cost; manzoku += w.manzoku || 0; mirai += w.mirai || 0; });
      return { coin, spent, left: coin - spent, manzoku, mirai };
    }
    let last = calc();
    function paint() {
      const v = calc();
      ['manzoku', 'mirai'].forEach(k => { el.querySelector(`[data-w="${k}"]`).textContent = v[k]; });
      const cb = el.querySelector('[data-w="coin"]');
      cb.textContent = v.left;
      if (v.left !== last.left) { cb.classList.remove('bump'); void cb.offsetWidth; cb.classList.add('bump'); }
      el.querySelectorAll('[data-r]').forEach(b => b.classList.toggle('on', sel.r.has(b.dataset.r)));
      el.querySelectorAll('[data-wi]').forEach(b => {
        const w = W(b.dataset.wi);
        b.classList.toggle('on', sel.w.has(w.id)); b.classList.toggle('spend', sel.w.has(w.id));
        b.classList.toggle('locked', !sel.w.has(w.id) && w.cost > v.left);
      });
      el.querySelector('[data-done]').disabled = sel.w.size === 0;
      last = v;
    }
    paint();
    on(el, '[data-r]', e => {
      const id = e.currentTarget.dataset.r, r = R(id);
      if (sel.r.has(id)) {
        if (calc().left - r.coin < 0) { toast('先に使い道を減らしてね'); S.sfx('wrong'); return; }
        sel.r.delete(id); S.sfx('tap');
      } else {
        sel.r.add(id); S.sfx('coin'); buzz(8);
        if (r.manzoku) toast('みんなの満足 ' + r.manzoku);
        if (r.mirai) toast('未来の安心 ' + r.mirai);
      }
      paint();
    });
    on(el, '[data-wi]', e => {
      const id = e.currentTarget.dataset.wi, w = W(id);
      if (sel.w.has(id)) { sel.w.delete(id); S.sfx('tap'); }
      else {
        if (w.cost > calc().left) { toast('コインが足りません'); S.sfx('wrong'); return; }
        sel.w.add(id); S.sfx('choose'); buzz(8);
      }
      paint();
    });
    on(el, '[data-done]', () => { S.sfx('choose'); budgetResult(calc(), sel); });
  }

  // 2年間版のあと：大阪維新の会が進めてきた道（一つの例）と、借りていた積立金を戻した話
  function budgetEnd(r) {
    st.budgetType = r && r.typeName || '';
    st.budgetSmile = r && typeof r.smile === 'number' && !r.skipped ? r.smile : null;
    const smile = st.budgetSmile;
    const el = show(`${hud()}
      <div class="pad grow">
        <div class="wake fade-in">
          <p class="wake-big">……はっ。</p>
          <p>気づけば、降りる駅のひとつ前。<br>想像の2年間${smile == null ? '' : `、笑顔にできたのは<b>${smile}人</b>`}。${smile === 4 ? 'うまくいった。でも、本物はもっと人も、お願いも多い。' : '全員のお願いは、かなえられなかった。'}</p>
          <p>本物の大阪は、足りないお金をどうやって生み出してきたんやろ？</p>
        </div>
        <div class="verdict"><h4>大阪維新の会が進めてきた道（一つの例）</h4>
          <ol class="road">
            <li>議員の数や給料を減らす（身を切る改革）</li>
            <li>府と市の仕事をまとめ、地下鉄などを民営化</li>
            <li>高校・大学の授業料の無償化など、教育や子育てへ</li>
          </ol>
          <p class="note" style="margin:10px 0 0">※ これは一つの例です。同じ大阪でも、ほかの党はちがう道を示しています。</p>
        </div>
        ${cardBlock('zaisei')}
      </div>`);
    on(el, '[data-next]', () => { S.sfx('tap'); next(); });
  }

  function budgetResult(v, sel) {
    const B = D.BUDGET;
    // いちばんお金を回した分野で「予算タイプ」を決める
    const by = {};
    sel.w.forEach(id => { const w = B.wishes.find(x => x.id === id); by[w.kind] = (by[w.kind] || 0) + w.cost; });
    const kinds = Object.entries(by).sort((a, b) => b[1] - a[1]);
    const kind = kinds.length > 1 && kinds[0][1] === kinds[1][1] ? 'bal' : (kinds[0] || ['bal'])[0];
    const [tname, tline] = B.types[kind];
    st.budgetType = tname;
    const how = [];
    if (['teisu', 'tougou', 'minei', 'minaoshi'].some(x => sel.r.has(x))) how.push(B.how.kaikaku);
    if (sel.r.has('zouzei')) how.push(B.how.zouzei);
    if (sel.r.has('shakkin')) how.push(B.how.shakkin);
    const el = show(`${hud()}
      <div class="pad grow">
        <div class="game-head"><span class="tag">ミニゲーム②　結果</span></div>
        <div class="btype fade-in"><small>あなたの予算は</small><b>${tname}</b><span>${tline}</span></div>
        <div class="verdict">${how.join('<br>') || 'はじめのお金だけで、やりくりしました。'}
          <div class="res-row mt"><span>みんなの満足</span><b>${v.manzoku}</b></div>
          <div class="res-row"><span>未来の安心</span><b>${v.mirai}</b></div>
        </div>
        <div class="verdict"><h4>大阪維新の会が進めてきた道（一つの例）</h4>
          <ol class="road">
            <li>議員の数や給料を減らす（身を切る改革）</li>
            <li>府と市の仕事をまとめ、地下鉄などを民営化</li>
            <li>高校・大学の授業料の無償化など、教育や子育てへ</li>
          </ol>
          <p class="note" style="margin:10px 0 0">※ ゲーム用に単純化しています。どの道にも、よい面と課題があります。</p>
        </div>
        ${cardBlock('zaisei')}
      </div>`);
    S.sfx('clear');
    on(el, '[data-next]', () => { S.sfx('tap'); next(); });
  }

  // ---------- 見比べ（3か所を切りかえて、むかしといまを比べる）----------
  function slider() {
    const el = show(`${hud()}
      <div class="pad grow">
        <div class="game-head"><span class="tag">見比べ</span><span>民間の力で、街が変わった</span></div>
        <div class="ba-tabs">${D.BA.map((b, i) => `<button class="ba-tab ${i ? '' : 'on'}" data-b="${i}">${b.tab || b.name}</button>`).join('')}</div>
        <div class="ba" data-ba>
          <img class="after" alt="いまの様子">
          <img class="before" alt="むかしの様子">
          <span class="lbl l">むかし</span><span class="lbl r">いま</span>
          <div class="handle"></div>
        </div>
        <p class="ba-hint" data-hint>👆 まん中の線を、左右に動かしてみよう</p>
        <div class="ba-info" data-info></div>
        <p class="note">※ イメージイラストです。</p>
        <button class="btn mt" data-next disabled>次へ</button>
      </div>`);
    const ba = el.querySelector('[data-ba]'), before = ba.querySelector('.before'), after = ba.querySelector('.after'), handle = ba.querySelector('.handle');
    const seen = new Set();
    let dragging = false, moved = 0, lastX = null;
    const setPos = p => { before.style.clipPath = `inset(0 ${100 - p}% 0 0)`; handle.style.left = p + '%'; };
    const showB = i => {
      const b = D.BA[i];
      before.src = b.before; after.src = b.after; setPos(50); moved = 0;
      el.querySelectorAll('.ba-tab').forEach((t, k) => t.classList.toggle('on', k === i));
      el.querySelector('[data-info]').innerHTML = `<b>${b.name}</b><p>${b.text}</p>
        <div class="seido-who ${b.ishin ? 'ishin' : ''}"><em>だれが進めた？${b.ishin ? '<span class="ishin-tag">大阪維新の会</span>' : ''}</em>${b.who}</div>`;
    };
    const set = x => {
      const r = ba.getBoundingClientRect();
      setPos(Math.max(0, Math.min(100, (x - r.left) / r.width * 100)));
      if (lastX !== null) moved += Math.abs(x - lastX);
      lastX = x;
      if (moved > 60) {
        seen.add(el.querySelector('.ba-tab.on').dataset.b);
        el.querySelector('[data-next]').disabled = false;
        el.querySelector('[data-hint]').textContent = seen.size < D.BA.length ? 'ほかの場所も、上のボタンで見てみよう' : '15年で、街はこんなに変わった。';
      }
    };
    showB(0);
    on(el, '.ba-tab', e => { S.sfx('tap'); showB(+e.currentTarget.dataset.b); });
    ba.addEventListener('pointerdown', e => { dragging = true; ba.setPointerCapture(e.pointerId); S.sfx('tap'); set(e.clientX); });
    ba.addEventListener('pointermove', e => { if (dragging) set(e.clientX); });
    ba.addEventListener('pointerup', () => { dragging = false; lastX = null; });
    ba.addEventListener('pointercancel', () => { dragging = false; lastX = null; });
    on(el, '[data-next]', () => { S.sfx('tap'); next(); });
  }

  // ---------- 結果 ----------
  function resultData() {
    const m = st.m;
    const keys = ['yume', 'yutori', 'money'];
    const vals = keys.map(k => m[k]);
    const top = keys[vals.indexOf(Math.max(...vals))];
    const typeKey = Math.max(...vals) - Math.min(...vals) < 12 ? 'bal' : top;
    const rank = st.quiz === st.quizN ? '大阪マスター' : st.quiz >= 4 ? '大阪ツウ' : st.quiz >= 2 ? 'なにわビギナー' : 'これからの人';
    return { keys, T: D.TYPES[typeKey], rank };
  }
  function result() {
    S.music('ending');
    const { keys, T, rank } = resultData();
    const tpos = `${(T.icon % 2) * 100}% ${Math.floor(T.icon / 2) * 100}%`;
    // 「決めたこと」は、その人が選挙で選べる議会のものだけ数える（大阪市以外の人に大阪市の制度は数えない）
    const count = { '府': 0, '市': 0, '府市': 0, '国府': 0 };
    st.seen.forEach(id => { const b = D.CARDS[id].by; if (b in count) count[b]++; });
    const fu = count['府'] + count['国府'], shi = st.town === 'osaka' ? count['市'] : 0, fushi = count['府市'];
    const total = fu + shi + fushi;
    const ishinN = st.seen.filter(id => D.CARDS[id].ishin).length;
    const miss = missed();
    const el = show(`
      <div class="result-head"><small>15年後のあなた</small></div>
      <div class="type-pic" style="background-position:${tpos}"></div>
      <div class="pad grow" style="padding-top:0">
        <div class="type-name">${T.name}</div>
        <p class="type-line">${T.line}</p>
        <div class="res-box">
          <h4>3つのゲージ</h4>
          ${keys.map(k => `<div class="res-row"><span>${METER[k]}</span><b>${st.m[k]}</b></div>`).join('')}
        </div>
        <div class="res-box">
          <h4>大阪の制度で受けられる支援（目安）</h4>
          <div class="big-money">${st.saved ? '約' + st.saved : '0'}<small>万円</small></div>
          ${st.savedItems.map(([l, a]) => `<div class="res-row"><span>${l}</span><b>${a}万円</b></div>`).join('') || '<p class="note center" style="margin:0">今回の道では、大阪の制度のお金の支援は0円でした。<br>公立高校の授業料のように、国の制度で無料になる分は数えていません。</p>'}
          <p class="note" style="margin:8px 0 0">※ 国の制度の分は含みません。金額は目安・最大額で、条件によって変わります。</p>
          ${miss.length ? `<p class="note" style="margin:12px 0 4px;font-weight:700">ほかの道で出会える制度</p><p class="note" style="margin:0">${miss.join('・')}</p>` : ''}
        </div>
        <div class="res-box">
          <h4>スコア</h4>
          <div class="res-row"><span>大阪ツウ度</span><b>${st.quiz} / ${st.quizN}　${rank}</b></div>
          <div class="res-row"><span>府市あわせ</span><b class="stars" style="font-size:18px">${starStr(st.pairStars)}</b></div>
          ${st.dashStars ? `<div class="res-row"><span>通勤ダッシュ</span><b class="stars" style="font-size:18px">${starStr(st.dashStars)}</b></div>` : ''}
          ${st.budgetType ? `<div class="res-row"><span>大阪のお財布</span><b>${typeof st.budgetSmile === 'number' ? `笑顔の府民 ${st.budgetSmile}/4人` : st.budgetType}</b></div>` : ''}
        </div>
        <div class="res-box">
          <h4>あなたの15年に出てきた制度は、どこで決まった？</h4>
          <div class="decided">
            <div class="fu"><b>${fu}</b>大阪府</div>
            ${st.town === 'osaka' ? `<div class="shi"><b>${shi}</b>大阪市</div>` : ''}
            <div class="fushi"><b>${fushi}</b>府と市で</div>
          </div>
          ${st.town === 'osaka' ? '' : '<p class="note" style="margin:8px 0 0">大阪市の制度は、大阪市の議会が決めたものなので数えていません。あなたの住む市町村の制度は、その市町村の議会が決めています。</p>'}
        </div>
        <div class="res-box ishin-box">
          <h4>あなたの15年に出会った制度 ${st.seen.length}個のうち</h4>
          <div class="ishin-count"><b>${ishinN}</b><span>個</span></div>
          <p>は、大阪維新の会の知事・市長のもとで進められたものでした。</p>
        </div>
        <p class="callout">制度は、選挙で選ばれた人たちが<br>議会で話し合って決めています。</p>
        <button class="btn" data-share>結果を画像で保存・シェア</button>
        <button class="btn green" data-next>この先へ</button>
      </div>`, 'result-screen');
    S.sfx('result');
    st.shareData = { typeName: T.name, typeLine: T.line, typeIcon: T.icon, support: st.saved, quiz: `${st.quiz} / ${st.quizN}`, url: location.href.split('?')[0] + (GIIN ? '?giin=' + encodeURIComponent(giinKey) : '') };
    if (window.Share && window.Share.prepare) window.Share.prepare(st.shareData);
    on(el, '[data-next]', () => { S.sfx('tap'); vote(); });
    on(el, '[data-share]', () => { S.sfx('tap'); shareResult(); });
    if (!window.Share) el.querySelector('[data-share]').remove();
  }
  let sharing = false;
  function shareResult() {
    if (sharing) return;
    sharing = true;
    window.Share.share(st.shareData)
      .finally(() => { sharing = false; })
      .then(r => { if (r === 'downloaded') toast('画像を保存しました'); })
      .catch(() => toast('画像を作れませんでした'));
  }

  // 選挙の話（党の紹介とは分けて、先に出す）
  function vote() {
    const el = show(`
      <div class="vote-hero"></div>
      <div class="pad grow">
        <h2 class="vote-big">暮らしのルールは、<br>だれかが決めている。</h2>
        <p class="vote-text">今日の15年で出会った制度は、どれも選挙で選ばれた人たちが、議会で話し合って決めたものです。<br>大阪府のことは知事と府議会。まちのことは市町村長と、まちの議会。だれを選ぶかで、暮らしのルールが変わります。<br><br>次の選挙のとき、あなたは何を見て選びますか？<br><b>まずは、行ってみるところから。</b></p>
        <div class="link-list">
          <a href="https://www.soumu.go.jp/senkyo/senkyo_s/naruhodo/" target="_blank" rel="noopener">投票のしかた（総務省「なるほど！選挙」）</a>
        </div>
        <button class="btn" data-next>次へ</button>
      </div>`, 'vote-screen');
    S.voice('vote');
    on(el, '[data-next]', () => { S.sfx('tap'); ideas(true); });
  }

  // 大阪維新の会の考え方・メッセージ・リンク（さいごの画面）
  const END_KEY = 'ikite-end';
  function saveEnd() {
    let t0 = Date.now();
    try { const old = JSON.parse(sessionStorage.getItem(END_KEY) || 'null'); if (old && old.t) t0 = old.t; } catch (_) {}
    try { sessionStorage.setItem(END_KEY, JSON.stringify({ t: t0, town: st.town, seen: st.seen, saved: st.saved, savedItems: st.savedItems, quiz: st.quiz, quizN: st.quizN, m: st.m, choices: st.choices })); } catch (_) {}
  }
  function loadEnd() {
    try {
      const d = JSON.parse(sessionStorage.getItem(END_KEY) || 'null');
      if (!d || Date.now() - d.t > 60 * 60 * 1000) return null;   // 1時間以内だけ
      // 書きかえられていても画面が壊れないよう、知っている値だけを使う
      const num = (v, max) => Math.max(0, Math.min(max, Math.round(+v) || 0));
      const m = d.m || {};
      return {
        town: d.town === 'other' ? 'other' : 'osaka',
        seen: Array.isArray(d.seen) ? d.seen.filter(id => typeof id === 'string' && D.CARDS.hasOwnProperty(id)) : [],
        saved: num(d.saved, 1000), quiz: num(d.quiz, 10), quizN: num(d.quizN, 10),
        m: { money: num(m.money, 100), yutori: num(m.yutori, 100), yume: num(m.yume, 100) },
        choices: Object.fromEntries(Object.entries(d.choices || {}).filter(([k]) => /^s[1-6]$/.test(k)).map(([k, v]) => [k, num(v, 2)])),
      };
    } catch (_) { return null; }
  }
  function ideas(first) {
    if (st) saveEnd();
    const msg = GIIN && ready(GIIN.message) ? GIIN.message : D.PARTY.message;
    const g = GIIN && ready(GIIN.message) ? GIIN : null;
    // 議員版：議員のホームページ（1つ目のリンク）はメッセージのすぐ下に大きく。のこりは下の一覧へ
    const [gHome, ...gRest] = GIIN ? (GIIN.links || []) : [];
    const homeBtn = gHome ? `<a class="giin-home" href="${gHome.url}" target="_blank" rel="noopener">
        ${GIIN.photo ? `<i style="background-image:url(${GIIN.photo})"></i>` : ''}<span><small>${GIIN.role}</small><b>${GIIN.name}のホームページを見る</b></span><em aria-hidden="true">↗</em></a>` : '';
    const links = [
      `<a href="${D.PARTY.url}" target="_blank" rel="noopener">大阪維新の会のサイト</a>`,
      ...gRest.map(l => `<a href="${l.url}" target="_blank" rel="noopener">${l.label}</a>`),
    ].join('');
    const el = show(`
      <div class="pad grow">
        <h2 class="end-title">大阪維新の会が<br>大事にしている3つのこと</h2>
        <p class="end-lead">このゲームを作った、大阪維新の会の考え方です。</p>
        ${D.IDEAS.map((x, i) => {
          const ex = (x.ex || []).filter(id => st && st.seen.includes(id)).map(id => `<span class="idea-ex">${D.CARDS[id].title}</span>`).join('');
          return `<div class="idea delay${i + 1}"><span class="idea-ic" style="background-position:${iconPos(x.ic)}"></span><div><b>${x.t}</b><p>${x.d}</p>${ex ? `<div class="idea-exs"><small>このゲームで出会った例</small>${ex}</div>` : ''}</div></div>`;
        }).join('')}
        <div class="mt">${giinBubble(msg, g)}</div>
        ${homeBtn}
        <div class="link-list light">${links}</div>
        <button class="btn" data-again>別の人生も生きてみる</button>
        <div class="btn-row">
          <button class="btn ghost light small" data-zukan>制度図鑑</button>
          <button class="btn ghost light small" data-about>このゲームについて</button>
        </div>
        <button class="btn ghost light small" style="margin-top:12px" data-title>タイトルへ</button>
      </div>`, 'end-screen');
    if (first) { S.sfx('fanfare'); setTimeout(() => { if (cur === el) S.voice('end'); }, 1400); }
    on(el, '[data-again]', () => { S.sfx('start'); S.music('main'); try { sessionStorage.removeItem(END_KEY); } catch (_) {} town(); });
    on(el, '[data-zukan]', () => { S.sfx('tap'); zukanScreen(() => ideas(false)); });
    on(el, '[data-about]', () => { S.sfx('tap'); about(() => ideas(false)); });
    on(el, '[data-title]', () => { S.sfx('tap'); S.music('title'); try { sessionStorage.removeItem(END_KEY); } catch (_) {} title(); });
  }

  // ---------- 図鑑・このゲームについて ----------
  function zukanScreen(back) {
    const got = zukan();
    const ids = Object.keys(D.CARDS);
    const el = show(`
      <div class="sheet-head"><h3>制度図鑑</h3><button data-back>戻る</button></div>
      <div class="pad">
        <p class="zukan-count">${got.length} / ${ids.length} 枚</p>
        <div class="zukan-grid">${ids.map(id => {
          const c = D.CARDS[id], has = got.includes(id);
          const pos = `${(c.icon % 4) * 100 / 3}% ${Math.floor(c.icon / 4) * 50}%`;
          return `<button class="zcard ${has ? '' : 'lock'}" data-id="${has ? id : ''}"><div class="seido-icon" style="background-position:${pos}"></div>${has ? c.title : '？？？'}</button>`;
        }).join('')}</div>
        <p class="note mt">選ぶ道を変えると、まだ見ていない制度に出会えます。図鑑はこの端末の中だけに保存されます。</p>
      </div>`);
    on(el, '[data-back]', () => { S.sfx('tap'); back(); });
    on(el, '[data-id]', e => {
      const id = e.currentTarget.dataset.id;
      if (!id) return;
      S.sfx('card');
      const d = show(`
        <div class="sheet-head"><h3>制度図鑑</h3><button data-back>戻る</button></div>
        <div class="pad">${cardHtml(D.CARDS[id], { kicker: '制度図鑑' })}</div>`);
      on(d, '[data-back]', () => { S.sfx('tap'); zukanScreen(back); });
    });
  }

  function about(back) {
    const el = show(`
      <div class="sheet-head"><h3>このゲームについて</h3><button data-back>戻る</button></div>
      <div class="pad">
        <p class="note">${D.SOURCES_NOTE}</p>
        <p class="note">制作：大阪維新の会${GIIN ? '（' + GIIN.name + ' 版）' : ''}</p>
        ${GIIN && GIIN.from ? `<p class="note">${GIIN.name}の写真・言葉・実績：${GIIN.from.replace(/より$/, '')}${(GIIN.links || [])[0] ? `（<a href="${GIIN.links[0].url}" target="_blank" rel="noopener">${GIIN.links[0].url}</a>）` : ''}</p>` : ''}
        <h4 class="sec-title">出典</h4>
        ${Object.values(D.CARDS).map(c => `<div class="src-item"><b>${c.title}</b><br><a href="${c.src.url}" target="_blank" rel="noopener">${c.src.label}</a></div>`).join('')}
        <h4 class="sec-title">素材</h4>
        <p class="note">効果音：効果音ラボ<br>3D：three.js（MIT License）<br>イラスト・BGM・ナレーション：生成AIを使って制作</p>
      </div>`);
    on(el, '[data-back]', () => { S.sfx('tap'); back(); });
  }

  // テスト用：?stage=3 でそのステージから
  const dev = params.has('dev');
  const startAt = dev ? parseInt(params.get('stage'), 10) : NaN;
  if (startAt >= 1 && startAt <= D.STAGES.length) {
    st = newState(); st.town = params.get('town') || 'osaka'; shown = { ...st.m };
    ageUp(startAt - 1);
  } else if (dev && params.get('screen') === 'result') {
    st = newState(); st.town = 'osaka'; shown = { ...st.m };
    st.choices = { s1: 0, s2: 0, s5: 0 }; st.saved = 266; st.savedItems = [['私立高校の授業料（3年・府の上乗せ分）', 52], ['大学の授業料（4年）', 214]];
    st.quiz = 5; st.quizN = 6; st.pairStars = 3; st.budgetType = '教育投資型'; st.dashStars = 2; st.seen = Object.keys(D.CARDS); st.m = { money: 40, yutori: 55, yume: 85 };
    stageIdx = D.STAGES.length - 1; result();
  } else if (loadEnd()) {
    // リンク先から戻ってきた：最後の画面から再開
    st = Object.assign(newState(), loadEnd()); shown = { ...st.m };
    loader(() => { S.music('ending'); ideas(false); });
  } else {
    loader(title);
  }
})();
