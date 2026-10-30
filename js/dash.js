// 通勤ダッシュ — 22歳「はじめての通勤」の3Dミニゲーム
// three.js r149（index.html で読むグローバル THREE）を使う。ビルドなし。外部のモデルファイルは使わない（全部ここで形を作る）。
//
//   const r = await Dash.run(host, { mode: 'subway' | 'bike' | 'walk', finds: [{ id, title }], sfx: name => {} });
//   r = { coins, clocks, hits, late, time, finds: [見つけた id] }
//   finds：道の途中に置く「大阪の変化」（3つまで）。高い所に浮かぶ光る印で、ジャンプで取る。中身は data.js の FINDS
//   sfx の name： 'start' 'coin' 'clock' 'hit' 'jump' 'goal' 'count'
//
// 遅刻のきまり：始業までの持ち時間は「ぶつからずに走ったときの所要時間 + 約10秒ぶん」。
//   ぶつかると約1秒ぶん失い（さらに少し減速）、時計を1個とると約1秒ぶん戻る。
//   → だいたい 9〜10回ぶつかると遅刻。上手さの差は★（ぶつかった回数）で見せる。時計を集めれば取りかえせる（はじめて遊ぶ人でも間に合うくらい）。
//
// 見た目：本編のイラスト（深いあい色の空・朝焼けのオレンジとピンク・エメラルド）に寄せる。
//   ・光は 半球光（空=ラベンダー／地面=暖かい暗色）＋ 暖色の平行光。人や木はトゥーン調（4段の陰）＋ 逆光のふち光。
//   ・人物は輪郭線（裏返した一回り大きい形）つき。主人公は骨入りの1つの形（描画1回）で、パーカーとリュックのうしろ姿。
//   ・ビルは canvas で描いた外壁（ガラス／石／帯窓の3種）を、建物の大きさに合わせて繰り返し貼る（窓が伸びない）。
// 描画を軽くするため：影は使わず丸い板で代用／ほぼ全部を InstancedMesh と頂点カラーでまとめる
// （ドローコールは50前後）／霧で遠くを切る／画素比は最大1.5／画面が隠れたら止める／ポストプロセスなし。
// 終わったら renderer・ジオメトリ・マテリアル・テクスチャを全部 dispose し、canvas を消してから resolve する。
// テスト用に opts.seed（コースの乱数）と opts.autopilot（自動でよける）も受けつける（本番では使わない）。
(function () {
  'use strict';

  const LANES = [-2.2, 0, 2.2];
  const PLAY_T = 29;        // ぶつからなければ何秒でゴールするか
  const SLACK = 39;         // 始業までの持ち時間（実時間の秒）
  const HIT_LOSS = 1.0;     // 1回ぶつかると失う時間（実時間の秒）
  const CLOCK_GAIN = 1.0;   // 時計1個で戻る時間（実時間の秒）
  const SPAN = 192;         // 景色を使い回す長さ
  const ZN = 14;            // 景色の手前のはし（カメラの少しうしろ）
  const GRAV = 26, JUMP_V = 8;

  const MODES = {
    subway: { v0: 15, v1: 24, clock0: 600, dest: '駅', destSub: '地下鉄のりば', lead: '駅', mix: { cone: 3, ped: 4, fence: 2, puddle: 2 } },
    bike:   { v0: 17, v1: 27, clock0: 540, dest: 'オフィス', destSub: 'エントランス', lead: '会社', mix: { cone: 4, ped: 2, fence: 2, puddle: 3 } },
    walk:   { v0: 12, v1: 19, clock0: 300, dest: 'オフィス', destSub: 'エントランス', lead: '会社', mix: { cone: 3, ped: 3, fence: 2, puddle: 2 } },
  };
  // 障害物の大きさ（hw=横の半分, hd=奥行きの半分, clear=この高さより上ならジャンプでこえられる）
  const OB = {
    cone:   { hw: 0.85, hd: 0.3, clear: 99, word: 'ガシャン！' },
    ped:    { hw: 0.32, hd: 0.3, clear: 99, word: 'すみません！' },
    fence:  { hw: 0.95, hd: 0.2, clear: 0.48, word: 'ガタン！' },
    puddle: { hw: 0.85, hd: 0.75, clear: 0.12, word: 'バシャッ！' },
  };
  const SERIF = "'Shippori Mincho B1','Yu Mincho','YuMincho','Hiragino Mincho ProN','Noto Serif JP',serif";

  let running = null;
  function run(host, opts) {
    if (running) return running;
    running = new Promise(resolve => {
      try { start(host, opts || {}, r => { running = null; resolve(r); }); }
      catch (e) {
        console.warn('Dash:', e);
        running = null;
        resolve({ coins: 0, clocks: 0, hits: 0, late: false, time: 0, finds: [], skipped: true });
      }
    });
    return running;
  }
  window.Dash = { run, stats: {} };

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const modp = (a, n) => ((a % n) + n) % n;
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  // ---------------------------------------------------------------- コースをつくる
  function makeCourse(M, D, R, nFind) {
    const items = [];
    const FIND_AT = [0.22, 0.52, 0.8].slice(0, nFind || 0);
    let fi = 0;
    const pick = obj => {
      let sum = 0, k;
      for (k in obj) sum += obj[k];
      let r = R() * sum;
      for (k in obj) { r -= obj[k]; if (r <= 0) return k; }
      return k;
    };
    const coinLine = (lane, s0, n) => { for (let i = 0; i < n; i++) items.push({ t: 'coin', lane, s: s0 + i * 2.6, y: 0.95 }); };
    const coinArc = (lane, s0) => { for (let i = -2; i <= 2; i++) items.push({ t: 'coin', lane, s: s0 + i * 1.9, y: 0.95 + 1.05 * (1 - (i / 2.4) * (i / 2.4)) }); };
    const other = L => (L + 1 + ((R() * 2) | 0)) % 3;
    const solid = () => (R() < M.mix.ped / (M.mix.ped + M.mix.cone) ? 'ped' : 'cone');
    let s = 34, row = 0, free = 1;
    while (s < D - 26) {
      const p = s / D, k = R();
      if (row < 2 || k < 0.4) {
        // 障害物1つ
        const type = row < 1 ? 'cone' : pick(M.mix);
        const L = row < 1 ? 1 : (R() * 3) | 0;
        items.push({ t: type, lane: L, s: type === 'ped' ? s + 2.6 : s });
        if ((type === 'fence' || type === 'puddle') && R() < 0.65) { coinArc(L, s); free = L; }
        else { free = other(L); if (R() < 0.75) coinLine(free, s - 4, 3); }
      } else if (k < 0.74) {
        // 2つのレーンをふさぐ（あいているレーンは前のあいたレーンのとなりまで）
        const F = clamp(free + ((R() * 3) | 0) - 1, 0, 2);
        for (let L = 0; L < 3; L++) if (L !== F) {
          const type = R() < 0.25 + p * 0.2 ? pick({ fence: 2, puddle: 1 }) : solid();
          items.push({ t: type, lane: L, s: type === 'ped' ? s + 2.6 : s });
        }
        coinLine(F, s - 5, 4);
        free = F;
      } else {
        // 低い柵や水たまりの列（ジャンプで抜ける）
        const all = R() < 0.4 + p * 0.3;
        const open = (R() * 3) | 0;
        const type = R() < 0.62 ? 'fence' : 'puddle';
        for (let L = 0; L < 3; L++) if (all || L !== open) items.push({ t: type, lane: L, s });
        const cl = all ? free : open;
        if (all) coinArc(cl, s); else coinLine(cl, s - 3, 3);
        free = cl;
      }
      const gap = 12 + R() * 4 + p * 7;
      if (fi < FIND_AT.length && p >= FIND_AT[fi]) items.push({ t: 'find', fi: fi++, lane: free, s: s + gap * 0.5, y: 2.25 });
      else if (row > 0 && R() < 0.34) items.push({ t: 'clock', lane: (free + 1 + ((R() * 2) | 0)) % 3, s: s + gap * 0.5, y: 1.0 });
      row++;
      s += gap;
    }
    items.sort((a, b) => a.s - b.s);
    return items;
  }

  // ---------------------------------------------------------------- 本体
  function start(host, opts, done) {
    const THREE = window.THREE;
    const mode = MODES[opts.mode] ? opts.mode : 'subway';
    const M = MODES[mode];
    const BIKE = mode === 'bike';
    const sfx = name => { try { if (typeof opts.sfx === 'function') opts.sfx(name); } catch (_) {} };
    const buzz = p => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (_) {} };
    const seed0 = opts.seed != null ? opts.seed : (Math.random() * 1e9) | 0;
    const R = rng(seed0);                       // コースと動き
    const RS = rng((seed0 ^ 0x5bd1e995) >>> 0); // 景色（コースに影響しないよう別の乱数）
    const AUTO = !!opts.autopilot;

    const root = el('div', 'dash-root dash-' + mode);
    host.appendChild(root);

    const res = { coins: 0, clocks: 0, hits: 0, late: false, time: 0, finds: [] };
    const FINDS = Array.isArray(opts.finds) ? opts.finds.slice(0, 3) : [];
    const isPick = t => t === 'coin' || t === 'clock' || t === 'find';
    let finished = false, stopped = false;
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));

    function skip(msg) {
      root.appendChild(el('div', 'dash-fail', msg));
      later(() => { root.remove(); timers.forEach(clearTimeout); done(Object.assign(res, { skipped: true })); }, 1800);
    }
    if (!THREE) { skip('3Dの表示が読み込めなかったので、<br>このミニゲームはスキップします'); return; }

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'default' });
    } catch (e) {
      skip('この端末では3Dが表示できないので、<br>このミニゲームはスキップします');
      return;
    }
    const FOG = 0xeaa68f, FOGC = '#eaa68f';
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(FOG, 1);
    const canvas = renderer.domElement;
    canvas.className = 'dash-canvas';
    root.appendChild(canvas);
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); if (typeof fail === 'function') fail(new Error('WebGL context lost')); });

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(FOG, 30, 172);
    const cam = new THREE.PerspectiveCamera(62, 1, 0.1, 420);

    // 朝の光：空からのラベンダー色＋地面からの暖かい照り返し、うしろ左上から暖色の日ざし
    scene.add(new THREE.HemisphereLight(0xcab4e8, 0x7a4c50, 0.68));
    const sun = new THREE.DirectionalLight(0xffd0a2, 0.74);
    sun.position.set(-6, 9, 5);
    scene.add(sun);

    // ---------- 道具
    const texs = new Set();
    const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    function ctex(w, h, draw, repeat) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      draw(c.getContext('2d'), w, h);
      const t = new THREE.CanvasTexture(c);
      if (repeat === true) { t.wrapT = THREE.RepeatWrapping; t.wrapS = THREE.ClampToEdgeWrapping; }
      else if (repeat === 'both') { t.wrapT = t.wrapS = THREE.RepeatWrapping; }
      t.anisotropy = maxAniso;
      t.userData.draw = draw;
      texs.add(t);
      return t;
    }
    function redraw(t) {
      const c = t.image;
      t.userData.draw(c.getContext('2d'), c.width, c.height);
      t.needsUpdate = true;
    }
    const _o = new THREE.Object3D();
    function tf(g, p, r, s) {
      _o.position.set(p ? p[0] : 0, p ? p[1] : 0, p ? p[2] : 0);
      _o.rotation.set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0);
      _o.scale.set(s ? s[0] : 1, s ? s[1] : 1, s ? s[2] : 1);
      _o.updateMatrix();
      g.applyMatrix4(_o.matrix);
      return g;
    }
    const BOX = (w, h, d, p, r) => tf(new THREE.BoxGeometry(w, h, d), p, r);
    const CYL = (rt, rb, h, seg, p, r, s) => tf(new THREE.CylinderGeometry(rt, rb, h, seg), p, r, s);
    const SPH = (rad, p, s, ws, hs) => tf(new THREE.SphereGeometry(rad, ws || 10, hs || 8), p, null, s);
    const CAP = (rad, len, p, r, s) => tf(new THREE.CapsuleGeometry(rad, len, 3, 10), p, r, s);
    const LATHE = (pts, p, s, seg) => tf(new THREE.LatheGeometry(pts.map(q => new THREE.Vector2(q[0], q[1])), seg || 14), p, null, s);
    // 角の丸い箱（箱の頂点を内側の箱から半径rだけ外へ押し出す）
    function RBOX(w, h, d, r, p, rot, seg) {
      const n = seg || 3;
      const g = new THREE.BoxGeometry(w, h, d, n, n, n);
      const P = g.attributes.position, N = g.attributes.normal;
      const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
      const v = new THREE.Vector3(), q = new THREE.Vector3();
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i);
        q.set(clamp(v.x, -hx, hx), clamp(v.y, -hy, hy), clamp(v.z, -hz, hz));
        v.sub(q);
        if (v.lengthSq() < 1e-10) v.fromBufferAttribute(N, i);
        v.normalize();
        N.setXYZ(i, v.x, v.y, v.z);
        q.addScaledVector(v, r);
        P.setXYZ(i, q.x, q.y, q.z);
      }
      return tf(g, p, rot);
    }
    // ふんわりした葉のかたまり（少しでこぼこさせた球。色は下が濃く上が明るい）
    function BLOB(r, p, s, seed, amp, cols, ws, hs) {
      const g = new THREE.SphereGeometry(1, ws || 11, hs || 8);
      const P = g.attributes.position, N = g.attributes.normal;
      const col = new Float32Array(P.count * 3);
      const c0 = new THREE.Color(cols[0]), c1 = new THREE.Color(cols[1]), c2 = new THREE.Color(cols[2]), c = new THREE.Color();
      for (let i = 0; i < P.count; i++) {
        const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        const k = 1 + amp * (Math.sin(x * 3.1 + seed) * Math.sin(y * 3.7 + seed * 1.7) * Math.sin(z * 2.9 + seed * 2.3) * 1.6 + 0.5 * Math.sin((x + z) * 6 + y * 4 + seed));
        P.setXYZ(i, x * k * r * s[0] + p[0], y * k * r * s[1] + p[1], z * k * r * s[2] + p[2]);
        const nx = x / s[0], ny = y / s[1], nz = z / s[2], nl = Math.hypot(nx, ny, nz);
        N.setXYZ(i, nx / nl, ny / nl, nz / nl);
        const t = (y + 1) / 2;
        c.copy(c0).lerp(c1, clamp(t * 1.3, 0, 1));
        if (ny / nl > 0.35) c.lerp(c2, clamp((ny / nl - 0.35) * 1.3 + (-nx / nl) * 0.25, 0, 0.75));
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return g;
    }
    // 色ちがいの部品を1つのジオメトリにまとめる（頂点カラー）→ ドローコール1回
    // parts: [geometry, 色(16進。null ならジオメトリの color をそのまま), 骨の番号(骨入りのときだけ)]
    function merge(parts, skinned) {
      let nv = 0, ni = 0;
      for (const [g] of parts) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
      const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
      const sIdx = skinned ? new Uint16Array(nv * 4) : null, sW = skinned ? new Float32Array(nv * 4) : null;
      const idx = nv > 65000 ? new Uint32Array(ni) : new Uint16Array(ni);
      const c = new THREE.Color();
      let vo = 0, io = 0;
      for (const [g, hex, bone] of parts) {
        const n = g.attributes.position.count;
        pos.set(g.attributes.position.array, vo * 3);
        nor.set(g.attributes.normal.array, vo * 3);
        if (hex == null && g.attributes.color) col.set(g.attributes.color.array, vo * 3);
        else {
          c.set(hex);
          for (let i = 0; i < n; i++) { col[(vo + i) * 3] = c.r; col[(vo + i) * 3 + 1] = c.g; col[(vo + i) * 3 + 2] = c.b; }
        }
        if (skinned) for (let i = 0; i < n; i++) { sIdx[(vo + i) * 4] = bone; sW[(vo + i) * 4] = 1; }
        if (g.index) { const I = g.index.array; for (let i = 0; i < I.length; i++) idx[io + i] = I[i] + vo; io += I.length; }
        else { for (let i = 0; i < n; i++) idx[io + i] = vo + i; io += n; }
        vo += n;
        g.dispose();
      }
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      out.setAttribute('color', new THREE.BufferAttribute(col, 3));
      if (skinned) {
        out.setAttribute('skinIndex', new THREE.BufferAttribute(sIdx, 4));
        out.setAttribute('skinWeight', new THREE.BufferAttribute(sW, 4));
      }
      out.setIndex(new THREE.BufferAttribute(idx, 1));
      out.computeBoundingSphere();
      return out;
    }

    // ---------- マテリアル
    // トゥーンの陰（4段）。アニメ塗りのように、陰をくっきり分ける
    const grad = new THREE.DataTexture(new Uint8Array([108, 108, 108, 255, 168, 168, 168, 255, 222, 222, 222, 255, 255, 255, 255, 255]), 4, 1);
    grad.minFilter = grad.magFilter = THREE.NearestFilter;
    grad.generateMipmaps = false;
    grad.needsUpdate = true;
    texs.add(grad);
    // 逆光のふち光（朝日に縁どられる感じ）
    function toon(o, rim, rimHex) {
      const m = new THREE.MeshToonMaterial(Object.assign({ gradientMap: grad }, o || {}));
      if (rim) {
        const rc = new THREE.Color(rimHex || 0xffc49a).multiplyScalar(rim);
        m.onBeforeCompile = sh => {
          sh.uniforms.uRim = { value: rc };
          sh.fragmentShader = 'uniform vec3 uRim;\n' + sh.fragmentShader.replace('#include <output_fragment>',
            'float rimF = 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) );\n' +
            'outgoingLight += uRim * pow( rimF, 3.0 ) * ( 0.5 + 0.5 * saturate( normal.y + 0.45 ) );\n#include <output_fragment>');
        };
        m.customProgramCacheKey = () => 'dash-rim';
      }
      return m;
    }
    const vcol = (o, rim, rimHex) => toon(Object.assign({ vertexColors: true }, o || {}), rim, rimHex);
    // 輪郭線（裏返した形を法線の向きに少しふくらませて、濃いあい色でぬる）
    function outlineMat(w, hex) {
      const m = new THREE.MeshBasicMaterial({ color: hex || 0x1e1838, side: THREE.BackSide });
      m.onBeforeCompile = sh => {
        sh.uniforms.uOW = { value: w };
        sh.vertexShader = 'uniform float uOW;\n' + sh.vertexShader.replace('#include <skinning_vertex>',
          '#include <skinning_vertex>\n#ifdef USE_SKINNING\n transformed += normalize( objectNormal ) * uOW;\n#else\n transformed += normalize( normal ) * uOW;\n#endif');
      };
      m.customProgramCacheKey = () => 'dash-outline';
      return m;
    }
    // 1枚の絵に横に並べたコマのうち、aTile 番目を貼る（お店の正面・看板）
    function tileMat(map, n, o) {
      const m = new THREE.MeshBasicMaterial(Object.assign({ map }, o || {}));
      m.onBeforeCompile = sh => {
        sh.uniforms.uN = { value: n };
        sh.vertexShader = 'attribute float aTile;\nuniform float uN;\n' + sh.vertexShader.replace('#include <uv_vertex>',
          '#ifdef USE_UV\n vUv = vec2( ( uv.x + aTile ) / uN, uv.y );\n#endif');
      };
      m.customProgramCacheKey = () => 'dash-tile';
      return m;
    }

    const insts = [];
    function inst(geo, mat, n, olW) {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
      insts.push(m);
      if (olW) {
        // 輪郭線：同じ形・同じ置き場所（instanceMatrix を共有）で、裏返しの1回り大きい形
        const ol = new THREE.InstancedMesh(geo, outlineMat(olW), n);
        ol.instanceMatrix = m.instanceMatrix;
        ol.frustumCulled = false;
        ol.count = 0;
        scene.add(ol);
        insts.push(ol);
        m.userData.ol = ol;
      }
      return m;
    }
    function setI(m, i, x, y, z, rx, ry, rz, sx, sy, sz) {
      _o.position.set(x, y, z);
      _o.rotation.set(rx || 0, ry || 0, rz || 0);
      _o.scale.set(sx == null ? 1 : sx, sy == null ? (sx == null ? 1 : sx) : sy, sz == null ? (sx == null ? 1 : sx) : sz);
      _o.updateMatrix();
      m.setMatrixAt(i, _o.matrix);
    }
    function fin(m, n) {
      m.count = n; m.visible = n > 0; m.instanceMatrix.needsUpdate = true;
      const ol = m.userData.ol;
      if (ol) { ol.count = n; ol.visible = n > 0; }
    }
    const col3 = new THREE.Color();
    function tint(m, i, hex, k) { col3.set(hex); if (k) col3.multiplyScalar(k); m.setColorAt(i, col3); }
    // インスタンスごとの値（ビルの大きさ・お店の絵の番号など）
    function iattr(geo, name, n, size) {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(n * size), size);
      geo.setAttribute(name, a);
      return a;
    }

    // ---------- 空（朝焼けのグラデーション・雲・太陽のにじみ・遠くの街並み）
    const skyTex = ctex(1024, 512, (g, w, h) => {
      const HZ = Math.round(h * 0.872);
      const gr = g.createLinearGradient(0, 0, 0, HZ);
      [[0, '#11153f'], [0.2, '#1f266a'], [0.4, '#40398c'], [0.55, '#7a4893'], [0.66, '#b6588a'], [0.75, '#e0697c'], [0.83, '#f68a6e'], [0.91, '#ffae76'], [0.97, '#ffcd8e'], [1, '#ffdca2']]
        .forEach(([o, c]) => gr.addColorStop(o, c));
      g.fillStyle = gr; g.fillRect(0, 0, w, HZ);
      g.fillStyle = FOGC; g.fillRect(0, HZ, w, h - HZ);
      for (let i = 0; i < 70; i++) {
        g.fillStyle = `rgba(255,255,255,${(0.2 + RS() * 0.5).toFixed(2)})`;
        const r = RS() < 0.12 ? 1.6 : 0.9;
        g.beginPath(); g.arc(RS() * w, RS() * h * 0.32, r, 0, 7); g.fill();
      }
      // 太陽のまわりのにじみ（大きく、やわらかく）
      const sx = w / 2, sy = HZ - 6;
      let rg = g.createRadialGradient(sx, sy, 0, sx, sy, w * 0.48);
      rg.addColorStop(0, 'rgba(255,238,196,.95)'); rg.addColorStop(0.05, 'rgba(255,214,160,.75)');
      rg.addColorStop(0.18, 'rgba(255,172,124,.38)'); rg.addColorStop(0.45, 'rgba(255,128,122,.12)'); rg.addColorStop(1, 'rgba(255,120,120,0)');
      g.fillStyle = rg; g.fillRect(0, 0, w, h);
      // 雲：上は紫の陰、下は朝日に照らされたピンクとオレンジ
      for (let i = 0; i < 30; i++) {
        const y = HZ * (0.38 + RS() * 0.5), x = RS() * w, cw = 60 + RS() * 230, ch = 4 + RS() * 11;
        const lit = clamp((y / HZ - 0.38) / 0.5, 0, 1);
        g.fillStyle = `rgba(${(96 + lit * 60) | 0},${(62 + lit * 30) | 0},${(130 + lit * 10) | 0},${(0.22 + RS() * 0.16).toFixed(2)})`;
        g.beginPath(); g.ellipse(x, y - ch * 0.3, cw, ch * 0.85, 0, 0, 7); g.fill();
        g.fillStyle = `rgba(255,${(120 + lit * 80) | 0},${(118 + lit * 30) | 0},${(0.3 + RS() * 0.25).toFixed(2)})`;
        g.beginPath(); g.ellipse(x + cw * 0.06, y + ch * 0.28, cw * 0.88, ch * 0.5, 0, 0, 7); g.fill();
        g.fillStyle = `rgba(255,228,186,${(0.25 + RS() * 0.25).toFixed(2)})`;
        g.beginPath(); g.ellipse(x + cw * 0.12, y + ch * 0.5, cw * 0.55, ch * 0.18, 0, 0, 7); g.fill();
      }
      // 太陽
      rg = g.createRadialGradient(sx, sy, 0, sx, sy, 26);
      rg.addColorStop(0, 'rgba(255,253,240,1)'); rg.addColorStop(0.45, 'rgba(255,246,214,.95)'); rg.addColorStop(1, 'rgba(255,230,180,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(sx, sy, 26, 0, 7); g.fill();
      // 遠くの山なみ（生駒）
      g.fillStyle = 'rgba(176,108,140,.5)';
      g.beginPath(); g.moveTo(0, HZ);
      for (let x = 0; x <= w; x += 8) g.lineTo(x, HZ - 10 - 9 * Math.sin(x * 0.006 + 1) - 5 * Math.sin(x * 0.021));
      g.lineTo(w, HZ); g.fill();
      // 遠くのビル街（2層・灯りつき）と通天閣
      const layers = [['rgba(158,96,138,.66)', 8, 40, 0.1], ['rgba(112,74,124,.8)', 5, 26, 0.16]];
      for (const [fill, h0, h1, lit] of layers) {
        for (let x = -10; x < w;) {
          const bw = 7 + RS() * 22;
          const dc = Math.abs(x + bw / 2 - w / 2) / (w / 2);
          const bh = (h0 + RS() * (h1 - h0)) * (0.45 + dc * 1.0);
          g.fillStyle = fill;
          g.fillRect(x, HZ - bh, bw, bh + 2);
          g.fillStyle = 'rgba(255,214,150,.6)';
          for (let wy = HZ - bh + 3; wy < HZ - 2; wy += 4) for (let wx = x + 2; wx < x + bw - 2; wx += 3.5) if (RS() < lit) g.fillRect(wx, wy, 1.4, 1.6);
          x += bw + RS() * 4;
        }
        if (lit > 0.12) {
          // 通天閣のシルエット（大通りのすきまから見える位置）
          const tx = w * 0.535, b = HZ;
          g.fillStyle = fill;
          g.beginPath();
          g.moveTo(tx - 13, b); g.lineTo(tx - 4, b - 20); g.lineTo(tx - 3.5, b - 44); g.lineTo(tx + 3.5, b - 44); g.lineTo(tx + 4, b - 20); g.lineTo(tx + 13, b);
          g.lineTo(tx + 8, b); g.lineTo(tx, b - 12); g.lineTo(tx - 8, b); g.fill();
          g.fillRect(tx - 8, b - 52, 16, 8);
          g.fillRect(tx - 3, b - 62, 6, 10);
          g.fillRect(tx - 0.8, b - 76, 1.6, 14);
          g.fillStyle = 'rgba(255,214,150,.75)'; g.fillRect(tx - 6, b - 49, 12, 1.6);
          g.fillStyle = 'rgba(255,90,90,.9)'; g.fillRect(tx - 0.8, b - 77, 1.6, 1.6);
        }
      }
      // 地平線のかすみ（霧の色へ）
      const hz = g.createLinearGradient(0, HZ - 56, 0, HZ);
      hz.addColorStop(0, 'rgba(234,166,143,0)'); hz.addColorStop(1, 'rgba(234,166,143,.9)');
      g.fillStyle = hz; g.fillRect(0, HZ - 56, w, 57);
    });
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(260, 125), new THREE.MeshBasicMaterial({ map: skyTex, fog: false, depthWrite: false }));
    sky.position.set(0, 50.5, -200);
    scene.add(sky);

    // ---------- 地面（石だたみのプロムナード・車道・歩道）
    function shade(hex, k) {
      const c = new THREE.Color(hex);
      c.offsetHSL(0, 0, k);
      return '#' + c.getHexString();
    }
    function tiles(g, x0, w, h, cols, rows, base, jit, grout, rnd) {
      g.save(); g.beginPath(); g.rect(x0, 0, w, h); g.clip();
      g.fillStyle = grout; g.fillRect(x0, 0, w, h);
      const tw = w / cols, th = h / rows;
      for (let r = 0; r < rows; r++) for (let c = -1; c < cols; c++) {
        const off = (r % 2) * tw * 0.5;
        g.fillStyle = shade(base, (rnd() - 0.5) * jit);
        g.fillRect(x0 + c * tw + off + 1.2, r * th + 1.2, tw - 2.4, th - 2.4);
      }
      g.restore();
    }
    const promTex = ctex(256, 256, (g, w, h) => {
      tiles(g, 0, w, h, 7, 9, '#b4a494', 0.06, '#857a70', RS);
      // 石の細かい粒
      for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${RS() < 0.5 ? '255,248,236' : '60,40,40'},${(0.03 + RS() * 0.05).toFixed(3)})`; g.fillRect(RS() * w, RS() * h, 1.5, 1.5); }
      // レーンの境めは、明るい石の細い帯（道路の白線に見えないように）
      for (const u of [0.338, 0.662]) {
        g.fillStyle = 'rgba(244,232,212,.7)'; g.fillRect(u * w - 3, 0, 6, h);
        g.fillStyle = 'rgba(120,100,90,.35)'; g.fillRect(u * w + 3, 0, 1.2, h);
      }
      g.fillStyle = '#7e6f66'; g.fillRect(0, 0, 6, h); g.fillRect(w - 6, 0, 6, h);
    }, true);
    promTex.repeat.set(1, 200 / 6.8);
    const ground = [];
    function strip(x0, x1, tex, len) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 200), new THREE.MeshLambertMaterial({ map: tex }));
      m.rotation.x = -Math.PI / 2;
      m.position.set((x0 + x1) / 2, 0, ZN - 100);
      scene.add(m);
      ground.push({ tex, len });
      return m;
    }
    strip(-3.4, 3.4, promTex, 6.8);
    const roadTex = ctex(256, 256, (g, w, h) => {
      g.fillStyle = '#3a3b58'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(${RS() < 0.5 ? '255,255,255' : '0,0,0'},${(0.03 + RS() * 0.05).toFixed(3)})`; g.fillRect(RS() * w, RS() * h, 2, 2); }
      tiles(g, 0, 30, h, 1, 8, '#b4a89c', 0.06, '#94897e', RS);   // 左はしの歩道
      g.fillStyle = '#e4ddd2'; g.fillRect(30, 0, 4, h);              // 縁石
      g.fillStyle = 'rgba(240,236,228,.75)';
      for (const u of [0.42, 0.69]) for (let y = 0; y < h; y += 128) g.fillRect(u * w - 2, y, 4, 64);
      g.fillRect(0.955 * w, 0, 4, h);
    }, true);
    roadTex.repeat.set(1, 200 / 9);
    strip(-13.6, -4.4, roadTex, 9);
    const walkTex = ctex(128, 128, (g, w, h) => {
      tiles(g, 0, w, h, 4, 4, '#a89c90', 0.05, '#8a8076', RS);
      g.fillStyle = '#dcae4c'; g.fillRect(w * 0.16, 0, w * 0.12, h);           // 点字ブロック
      g.fillStyle = 'rgba(150,100,24,.35)';
      for (let y = 4; y < h; y += 8) for (let x = w * 0.17; x < w * 0.27; x += 6) g.fillRect(x, y, 2.5, 2.5);
    }, true);
    walkTex.repeat.set(1, 200 / 4.2);
    strip(4.4, 8.6, walkTex, 4.2);
    // 縁石（つながった長い箱）
    const curbs = inst(merge([
      [BOX(0.22, 0.12, 200, [-4.45, 0.06, ZN - 100]), 0xe0d8cc], [BOX(0.22, 0.12, 200, [4.45, 0.06, ZN - 100]), 0xe0d8cc],
      [BOX(1.0, 0.06, 200, [-3.9, 0.03, ZN - 100]), 0x6f6359], [BOX(1.0, 0.06, 200, [3.9, 0.03, ZN - 100]), 0x6f6359],
    ]), new THREE.MeshLambertMaterial({ vertexColors: true }), 1);
    setI(curbs, 0, 0, 0, 0); fin(curbs, 1);
    // 朝日の照りかえし（石だたみの中央に、奥ほど強い光の帯）
    const glowTex = ctex(64, 256, (g, w, h) => {
      const id = g.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const u = (x / (w - 1)) * 2 - 1, v = y / (h - 1);   // v=0 が奥
        const a = Math.exp(-u * u * 2.6) * (0.2 + 0.8 * Math.pow(1 - v, 1.4));
        const i = (y * w + x) * 4;
        id.data[i] = 255; id.data[i + 1] = 255; id.data[i + 2] = 255; id.data[i + 3] = a * 255;
      }
      g.putImageData(id, 0, 0);
    });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(9, 190),
      new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffb27e, transparent: true, opacity: 0.62, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(-0.6, 0.02, ZN - 95);
    scene.add(glow);

    // ---------- 丸い影（すべての影をこれ1つで）
    const dotTex = ctex(64, 64, (g, w) => {
      const rg = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.55, 'rgba(255,255,255,.55)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg; g.fillRect(0, 0, w, w);
    });
    const shadows = inst(tf(new THREE.PlaneGeometry(1, 1), null, [-Math.PI / 2, 0, 0]),
      new THREE.MeshBasicMaterial({ map: dotTex, color: 0x2a1f4a, transparent: true, opacity: 0.4, depthWrite: false }), 140);

    // ---------- イチョウ並木（植えこみ・幹・ふんわりした葉をまとめて1つ）
    const TREE_GAP = 9.6;
    const trees = [];
    for (const side of [-1, 1]) for (let b = 0; b < SPAN; b += TREE_GAP) trees.push({ x: side * 3.9, b: b + (side > 0 ? TREE_GAP / 2 : 0), s: 0.9 + RS() * 0.22, ry: RS() * Math.PI * 2, c: [0xffffff, 0xfff0d0, 0xe4f0e2, 0xf7f4d8][(RS() * 4) | 0] });
    const LEAF = [0x2b5444, 0x5e9653, 0xb9cc72], BUSH = [0x24453a, 0x3f7448, 0x8fb062];
    const treeMesh = inst(merge([
      [RBOX(1.02, 0.2, 6.5, 0.06, [0, 0.1, 0], null, 2), 0x7d7068],
      [BLOB(0.42, [0.02, 0.34, -2.35], [1.05, 0.85, 1.6], 7.1, 0.1, BUSH, 9, 6), null],
      [BLOB(0.4, [-0.04, 0.32, -0.75], [1.0, 0.8, 1.5], 8.3, 0.1, BUSH, 9, 6), null],
      [BLOB(0.42, [0.03, 0.34, 0.8], [1.05, 0.85, 1.5], 2.9, 0.1, BUSH, 9, 6), null],
      [BLOB(0.4, [-0.02, 0.32, 2.35], [1.0, 0.8, 1.6], 5.3, 0.1, BUSH, 9, 6), null],
      [CYL(0.08, 0.15, 3.4, 7, [0, 1.7, 0]), 0x584235],
      [CYL(0.035, 0.06, 1.0, 5, [0.22, 3.1, 0], [0, 0, -0.65]), 0x584235],
      [BLOB(1.0, [0, 4.35, 0], [1.12, 1.7, 1.12], 1.3, 0.07, LEAF), null],
      [BLOB(0.74, [0.62, 3.75, 0.2], [1, 1.05, 1], 2.1, 0.08, LEAF), null],
      [BLOB(0.7, [-0.55, 3.95, -0.25], [1, 1.1, 1], 3.7, 0.08, LEAF), null],
      [BLOB(0.6, [0.12, 5.55, 0.08], [1, 1.25, 1], 4.4, 0.07, LEAF), null],
      [BLOB(0.52, [-0.32, 4.85, 0.5], [1, 1.1, 1], 5.9, 0.08, LEAF), null],
    ]), vcol(null, 0.42, 0xffcf8a), trees.length);
    trees.forEach((t, i) => tint(treeMesh, i, t.c));

    // ---------- 街灯（細い柱と、ぼんやり光る灯り）
    const LAMP_GAP = 32;
    const lamps = [];
    for (const side of [-1, 1]) for (let b = 4; b < SPAN; b += LAMP_GAP) lamps.push({ side, b: b + (side > 0 ? LAMP_GAP / 2 : 0) });
    const lampMesh = inst(merge([
      [CYL(0.15, 0.2, 0.5, 8, [0, 0.25, 0]), 0x2f2c3e],
      [CYL(0.055, 0.085, 5.3, 8, [0, 2.9, 0]), 0x3a3549],
      [tf(new THREE.TorusGeometry(0.42, 0.035, 5, 10, Math.PI / 2), [0.42, 5.55, 0], [0, 0, Math.PI / 2]), 0x3a3549],
      [BOX(0.34, 0.06, 0.06, [0.58, 5.97, 0]), 0x3a3549],
      [RBOX(0.36, 0.16, 0.26, 0.05, [0.86, 5.88, 0]), 0x2f2c3e],
    ]), vcol(), lamps.length);
    const lampGlow = inst(tf(new THREE.BoxGeometry(0.3, 0.05, 0.2), [0.86, 5.79, 0]), new THREE.MeshBasicMaterial({ color: 0xfff1cc }), lamps.length);
    const lampHalo = inst(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: dotTex, color: 0xffb877, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }), lamps.length);

    // ---------- ビル（外壁は3種類。窓の灯りはランダム）
    // 外壁の絵1枚が、横 cw・縦 ch（ワールドの長さ）ぶん。建物の大きさに合わせて繰り返す
    function facade(draw, emiDraw, cw, ch) {
      const map = ctex(256, 512, draw, 'both'), emi = ctex(256, 512, emiDraw, 'both');
      const m = new THREE.MeshLambertMaterial({ map, emissive: 0xffffff, emissiveMap: emi, emissiveIntensity: 0.8 });
      m.onBeforeCompile = sh => {
        sh.uniforms.uCell = { value: new THREE.Vector2(cw, ch) };
        sh.vertexShader = 'attribute vec3 aSize;\nattribute vec2 aOff;\nuniform vec2 uCell;\nvarying float vRoof;\nvarying float vHt;\n' +
          sh.vertexShader.replace('#include <uv_vertex>',
            '#ifdef USE_UV\n vec2 fsz = abs( normal.x ) > 0.5 ? aSize.zy : aSize.xy;\n vUv = uv * fsz / uCell + aOff;\n#endif\n' +
            'vRoof = step( 0.5, normal.y );\nvHt = position.y * aSize.y;');
        sh.fragmentShader = 'varying float vRoof;\nvarying float vHt;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n' +
          'diffuseColor.rgb *= mix( 0.66, 1.1, smoothstep( 0.0, 36.0, vHt ) );\n' +   // 下は陰って、上は朝日が当たる
          'totalEmissiveRadiance *= smoothstep( 2.6, 3.6, vHt );\n' +
          'if ( vRoof > 0.5 ) { diffuseColor.rgb = vec3( 0.46, 0.41, 0.5 ); totalEmissiveRadiance = vec3( 0.0 ); }');
      };
      m.customProgramCacheKey = () => 'dash-facade';
      return m;
    }
    function lit(g, cells, rate, draw) {
      g.fillStyle = '#000'; g.fillRect(0, 0, 256, 512);
      for (const cl of cells) {
        const k = RS();
        if (k < rate) g.fillStyle = `rgba(255,${(196 + RS() * 30) | 0},${(130 + RS() * 40) | 0},${(0.75 + RS() * 0.25).toFixed(2)})`;
        else if (k < rate + 0.04) g.fillStyle = 'rgba(190,210,255,.7)';
        else continue;
        draw(cl);
      }
    }
    // ガラスのタワー：空を映すガラスと細い枠（4列×8段）
    const glassCells = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 4; c++) glassCells.push([c * 64 + 3, r * 64 + 4, 58, 46]);
    const glassMat = facade(g => {
      g.fillStyle = '#3c3d62'; g.fillRect(0, 0, 256, 512);
      for (const [x, y, w, h] of glassCells) {
        const gr = g.createLinearGradient(0, y, 0, y + h);
        const k = RS() * 0.12;
        gr.addColorStop(0, `rgb(${(132 + k * 200) | 0},${(140 + k * 100) | 0},${(196 + k * 60) | 0})`);
        gr.addColorStop(1, `rgb(${(214 + k * 100) | 0},${(168 + k * 80) | 0},${(178 + k * 40) | 0})`);
        g.fillStyle = gr; g.fillRect(x, y, w, h);
      }
      g.fillStyle = 'rgba(255,255,255,.13)';
      g.beginPath(); g.moveTo(0, 360); g.lineTo(256, 120); g.lineTo(256, 190); g.lineTo(0, 430); g.fill();
      g.fillStyle = 'rgba(70,60,110,.55)';
      for (let r = 0; r < 8; r++) g.fillRect(0, r * 64 + 52, 256, 12);
    }, g => lit(g, glassCells, 0.18, ([x, y, w, h]) => g.fillRect(x + 2, y + 6, w - 4, h - 8)), 10.4, 27.2);
    // 石の外壁：くぼんだ窓と窓台（4列×6段）
    const stoneCells = [];
    for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) stoneCells.push([c * 64 + 15, r * 85 + 18, 34, 54]);
    const stoneMat = facade(g => {
      g.fillStyle = '#ece1d1'; g.fillRect(0, 0, 256, 512);
      for (let i = 0; i < 2000; i++) { g.fillStyle = `rgba(${RS() < 0.5 ? '255,255,255' : '120,96,80'},${(0.04 + RS() * 0.06).toFixed(3)})`; g.fillRect(RS() * 256, RS() * 512, 2, 2); }
      for (let r = 0; r < 6; r++) { g.fillStyle = 'rgba(150,126,110,.35)'; g.fillRect(0, r * 85 + 82, 256, 3); }
      for (const [x, y, w, h] of stoneCells) {
        g.fillStyle = '#b6a48c'; g.fillRect(x - 3, y - 3, w + 6, h + 6);
        const gr = g.createLinearGradient(0, y, 0, y + h);
        gr.addColorStop(0, '#4f5b88'); gr.addColorStop(0.6, '#7d87b2'); gr.addColorStop(1, '#a99bb6');
        g.fillStyle = gr; g.fillRect(x, y, w, h);
        g.fillStyle = 'rgba(30,30,60,.45)'; g.fillRect(x, y, w, 5); g.fillRect(x, y, 4, h);
        g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x + w * 0.55, y + 6, 4, h - 10);
        g.fillStyle = '#fbf3e6'; g.fillRect(x - 5, y + h + 2, w + 10, 4);
      }
    }, g => lit(g, stoneCells, 0.24, ([x, y, w, h]) => g.fillRect(x + 4, y + 5, w - 4, h - 5)), 11.2, 21.6);
    // 帯窓のビル：横長の窓とベランダの手すり（8段）
    const bandCells = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) bandCells.push([c * 32, r * 64 + 14, 32, 30]);
    const bandMat = facade(g => {
      g.fillStyle = '#f2ece3'; g.fillRect(0, 0, 256, 512);
      for (let r = 0; r < 8; r++) {
        const y = r * 64 + 14;
        const gr = g.createLinearGradient(0, y, 0, y + 30);
        gr.addColorStop(0, '#465081'); gr.addColorStop(1, '#8a92ba');
        g.fillStyle = gr; g.fillRect(0, y, 256, 30);
        g.fillStyle = '#353b62';
        for (let x = 0; x < 256; x += 32) g.fillRect(x, y, 3, 30);
        g.fillStyle = 'rgba(120,108,104,.45)'; g.fillRect(0, y + 30, 256, 4);
        g.fillStyle = '#dcd4c8'; g.fillRect(0, y + 38, 256, 10);
        g.fillStyle = 'rgba(80,70,90,.35)';
        for (let x = 4; x < 256; x += 8) g.fillRect(x, y + 34, 1.5, 4);
      }
    }, g => lit(g, bandCells, 0.2, ([x, y, w, h]) => g.fillRect(x + 4, y + 2, w - 6, h - 4)), 11.2, 26.4);
    const blds = [];
    for (const side of [-1, 1]) {
      let b = 0;
      while (b < SPAN - 6) {
        const len = 9 + RS() * 8, tall = RS() < 0.45;
        const d = 10 + RS() * 8;
        const sty = tall ? (RS() < 0.55 ? 'glass' : 'stone') : (RS() < 0.5 ? 'stone' : 'band');
        blds.push({ side, b: b + len / 2, len, d, h: tall ? 24 + RS() * 22 : 10 + RS() * 8, tall, sty, x0: side < 0 ? 14.8 : 8.8 });
        b += len + 0.5 + RS() * 1.6;
      }
    }
    const BPAL = {
      glass: [0xdfe2f4, 0xd2d4ea, 0xeadfee, 0xe2e8f2],
      stone: [0xf6e9d8, 0xecd6c2, 0xe0d4ca, 0xf3dfcc, 0xdcccbf],
      band: [0xf6f0e8, 0xe8e2ec, 0xf2e4d4],
    };
    const bGeo = tf(new THREE.BoxGeometry(1, 1, 1), [0, 0.5, 0]);
    const bMesh = {};
    for (const [sty, mat] of [['glass', glassMat], ['stone', stoneMat], ['band', bandMat]]) {
      const list = blds.filter(B => B.sty === sty);
      const geo = bGeo.clone();
      const aSize = iattr(geo, 'aSize', Math.max(1, list.length), 3), aOff = iattr(geo, 'aOff', Math.max(1, list.length), 2);
      const m = inst(geo, mat, Math.max(1, list.length));
      list.forEach((B, i) => {
        B.mesh = m; B.i = i;
        aSize.setXYZ(i, B.d, B.h, B.len);
        aOff.setXY(i, RS(), RS());
        tint(m, i, BPAL[sty][(RS() * BPAL[sty].length) | 0]);
      });
      bMesh[sty] = { m, n: list.length };
    }
    // 屋上の設備（手すり・塔屋・給水タンク・室外機・アンテナ）
    const roofs = inst(merge([
      [BOX(1, 0.5, 0.025, [0, 0.25, 0.4875]), 0xd8d0c8], [BOX(1, 0.5, 0.025, [0, 0.25, -0.4875]), 0xd8d0c8],
      [BOX(0.025, 0.5, 1, [0.4875, 0.25, 0]), 0xd8d0c8], [BOX(0.025, 0.5, 1, [-0.4875, 0.25, 0]), 0xd8d0c8],
      [BOX(0.26, 2.4, 0.2, [0.16, 1.2, -0.22]), 0xcfc4bd],
      [CYL(0.07, 0.07, 1.3, 10, [-0.2, 1.75, 0.22]), 0xb9b2c4], [BOX(0.16, 1.1, 0.16, [-0.2, 0.55, 0.22]), 0x7c7488],
      [BOX(0.12, 0.6, 0.08, [0.28, 0.3, 0.2]), 0xa69fae], [BOX(0.12, 0.6, 0.08, [0.12, 0.3, 0.26]), 0xa69fae],
      [CYL(0.006, 0.006, 5.5, 4, [0.3, 2.75, -0.3]), 0x4c4658],
      [CYL(0.004, 0.004, 3.5, 4, [-0.34, 1.75, -0.1]), 0x4c4658],
    ]), new THREE.MeshLambertMaterial({ vertexColors: true }), blds.length);
    // 1階のお店（4種類の正面を1枚の絵にならべる）
    const shopTex = ctex(1024, 128, (g, w, h) => {
      const BAND = ['#1f2a55', '#16a37f', '#b8573f', '#e9dcc4'];
      for (let k = 0; k < 4; k++) {
        const x0 = k * 256;
        const gr = g.createLinearGradient(0, 24, 0, h);
        gr.addColorStop(0, '#ffe7c0'); gr.addColorStop(1, '#ffb877');
        g.fillStyle = gr; g.fillRect(x0, 24, 256, h - 24);
        g.fillStyle = 'rgba(120,80,70,.35)';
        for (let i = 0; i < 6; i++) g.fillRect(x0 + 14 + i * 40, 60 + ((i * 37) % 20), 26, 40);
        g.fillStyle = 'rgba(64,46,56,.8)';
        for (let x = x0; x < x0 + 256; x += 42) g.fillRect(x, 24, 4, h - 24);
        g.fillRect(x0 + 168, 40, 3, h - 40);
        g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(x0 + 10, 34, 8, 44); g.fillRect(x0 + 92, 36, 6, 30);
        g.fillStyle = BAND[k]; g.fillRect(x0, 0, 256, 26);
        g.fillStyle = k === 3 ? 'rgba(40,40,60,.55)' : 'rgba(255,255,255,.75)';
        g.fillRect(x0 + 96, 10, 64, 6);
        g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x0, 24, 256, 3);
      }
    });
    const shopGeo = new THREE.PlaneGeometry(1, 1);
    const shopTile = iattr(shopGeo, 'aTile', blds.length, 1);
    blds.forEach((B, i) => shopTile.setX(i, (RS() * 4) | 0));
    const shops = inst(shopGeo, tileMat(shopTex, 4, { color: 0xf2e2d4 }), blds.length);
    const awn = inst(RBOX(1, 1, 1, 0.12), toon(), blds.length);
    const APAL = [0x16a37f, 0xd9744a, 0x2b3a6b, 0xb5495b, 0xc9a45a, 0x0f7f63];
    blds.forEach((B, i) => tint(awn, i, APAL[(RS() * APAL.length) | 0]));
    // 縦の看板（建物から通りへつき出す。大阪の通りらしさ）
    const SIGN_WORDS = [['珈', '琲'], ['書', '店'], ['歯', '科'], ['喫', '茶'], ['眼', '科'], ['花', '屋']];
    const SIGN_COL = [['#2a2f5e', '#f3d9a4'], ['#f1e7d6', '#1f2a55'], ['#16a37f', '#ffffff'], ['#7a2e3b', '#f6e2bf'], ['#ffffff', '#16835f'], ['#c76a3e', '#fff4e0']];
    const signTex = ctex(384, 256, (g) => {
      for (let k = 0; k < 6; k++) {
        const x0 = k * 64, [bg, fg] = SIGN_COL[k];
        g.fillStyle = bg; g.fillRect(x0, 0, 64, 256);
        g.strokeStyle = fg; g.globalAlpha = 0.55; g.lineWidth = 2; g.strokeRect(x0 + 5, 5, 54, 246); g.globalAlpha = 1;
        g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = `800 40px ${SERIF}`;
        SIGN_WORDS[k].forEach((ch, j) => g.fillText(ch, x0 + 32, 70 + j * 62));
        g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x0, 0, 3, 256);
      }
    });
    const signs = [];
    blds.forEach(B => { if (RS() < (B.tall ? 0.5 : 0.75)) signs.push({ B, off: -B.len / 2 + 1.2 + RS() * (B.len - 2.4), y: 4.6 + RS() * 2.2 }); });
    const signGeo = tf(new THREE.PlaneGeometry(0.8, 2.6), null, [0, 0, 0]);
    const signTile = iattr(signGeo, 'aTile', Math.max(1, signs.length), 1);
    signs.forEach((sg, i) => signTile.setX(i, (RS() * 6) | 0));
    const signMesh = inst(signGeo, tileMat(signTex, 6, { color: 0xe6dcd6, side: THREE.DoubleSide }), Math.max(1, signs.length));
    const bz = new Float32Array(blds.length);

    // ---------- 車（左の車道を向こうから来る）
    const cars = [];
    for (let i = 0; i < 7; i++) cars.push({ x: [-6.0, -8.3, -10.9][i % 3], b: i * 27 + RS() * 12, v: 6 + RS() * 5, c: [0xeceef2, 0x2f3a5c, 0xa8384a, 0xd7d2c6, 0x4a7f9f, 0x26283a, 0xe8c45a][i] });
    const carMesh = inst(merge([
      [RBOX(1.8, 0.62, 4.2, 0.2, [0, 0.56, 0]), 0xffffff],
      [RBOX(1.62, 0.54, 2.3, 0.18, [0, 1.08, -0.15]), 0x2a3152],
      [RBOX(1.64, 0.08, 2.0, 0.04, [0, 1.36, -0.15]), 0xffffff],
      [CYL(0.33, 0.33, 1.86, 12, [0, 0.33, 1.3], [0, 0, Math.PI / 2]), 0x1b1d26],
      [CYL(0.33, 0.33, 1.86, 12, [0, 0.33, -1.3], [0, 0, Math.PI / 2]), 0x1b1d26],
      [RBOX(0.36, 0.13, 0.06, 0.03, [0.58, 0.66, 2.09]), 0xfff4d0], [RBOX(0.36, 0.13, 0.06, 0.03, [-0.58, 0.66, 2.09]), 0xfff4d0],
    ]), vcol(null, 0.3), cars.length);
    cars.forEach((c, i) => tint(carMesh, i, c.c));

    // ---------- 障害物・拾うもの
    const coneMesh = inst(merge([
      [tf(new THREE.ConeGeometry(0.26, 0.92, 14), [-0.72, 0.52, 0]), 0xf2672e],
      [CYL(0.12, 0.15, 0.16, 14, [-0.72, 0.5, 0]), 0xf6f3ee],
      [RBOX(0.52, 0.08, 0.52, 0.03, [-0.72, 0.04, 0]), 0x2a2b33],
      [tf(new THREE.ConeGeometry(0.26, 0.92, 14), [0.72, 0.52, 0]), 0xf2672e],
      [CYL(0.12, 0.15, 0.16, 14, [0.72, 0.5, 0]), 0xf6f3ee],
      [RBOX(0.52, 0.08, 0.52, 0.03, [0.72, 0.04, 0]), 0x2a2b33],
      [BOX(0.36, 0.1, 0.06, [-0.36, 0.72, 0]), 0xf2c14e], [BOX(0.36, 0.1, 0.06, [0, 0.72, 0]), 0x23242c], [BOX(0.36, 0.1, 0.06, [0.36, 0.72, 0]), 0xf2c14e],
    ]), vcol(null, 0.35), 16, 0.018);
    const fenceParts = [
      [BOX(0.08, 0.62, 0.08, [-0.86, 0.31, 0]), 0xd8d4cc], [BOX(0.08, 0.62, 0.08, [0.86, 0.31, 0]), 0xd8d4cc],
      [RBOX(0.12, 0.06, 0.6, 0.02, [-0.86, 0.03, 0]), 0x3a3b44], [RBOX(0.12, 0.06, 0.6, 0.02, [0.86, 0.03, 0]), 0x3a3b44],
    ];
    for (let i = 0; i < 6; i++) {
      fenceParts.push([BOX(0.3, 0.16, 0.05, [-0.75 + i * 0.3, 0.52, 0]), i % 2 ? 0xffffff : 0xf0702f]);
      fenceParts.push([BOX(0.3, 0.1, 0.05, [-0.75 + i * 0.3, 0.26, 0]), i % 2 ? 0xf0702f : 0xffffff]);
    }
    const fenceMesh = inst(merge(fenceParts), vcol(null, 0.35), 16, 0.016);
    // 水たまり：朝焼けの空を映した色
    const pudMesh = inst(merge([
      [tf(new THREE.CircleGeometry(1, 20), [0, 0.012, 0], [-Math.PI / 2, 0, 0], [0.92, 1, 0.78]), 0x4a4670],
      [tf(new THREE.CircleGeometry(1, 20), [0.05, 0.02, 0.02], [-Math.PI / 2, 0, 0], [0.76, 1, 0.62]), 0x6f6797],
      [tf(new THREE.CircleGeometry(1, 16), [0.02, 0.024, -0.05], [-Math.PI / 2, 0, 0], [0.5, 1, 0.34]), 0xc9939b],
      [tf(new THREE.CircleGeometry(1, 10), [-0.22, 0.028, -0.1], [-Math.PI / 2, 0, 0], [0.3, 1, 0.08]), 0xffe2c4],
    ]), new THREE.MeshBasicMaterial({ vertexColors: true }), 16);
    // 通勤する人（正面がこちら向き）。スーツの男性と、トレンチコートの女性
    const SKIN = 0xeec4a0;
    const pedGeo = W => merge([
      [LATHE(W ? [[0.2, 0.6], [0.215, 0.8], [0.192, 1.02], [0.212, 1.3], [0.2, 1.42], [0.12, 1.5], [0.05, 1.53]]
               : [[0.19, 0.8], [0.2, 0.9], [0.188, 1.05], [0.214, 1.32], [0.2, 1.43], [0.12, 1.5], [0.05, 1.53]], null, [1.1, 1, 0.72]), W ? 0xc9ad86 : 0x2b3352],
      [BOX(0.12, 0.25, 0.03, [0, 1.36, 0.147]), W ? 0x3d4a6e : 0xf1efe9],
      [BOX(0.035, 0.2, 0.02, [0, 1.33, 0.164]), W ? 0x3d4a6e : 0x8a2f3c],
      [CAP(0.06, 0.42, [-0.27, 1.12, 0], [0, 0, 0.07]), W ? 0xc0a37c : 0x262d4a], [CAP(0.06, 0.42, [0.27, 1.12, 0], [0, 0, -0.07]), W ? 0xc0a37c : 0x262d4a],
      [SPH(0.05, [-0.3, 0.84, 0.02], null, 7, 5), SKIN], [SPH(0.05, [0.3, 0.84, 0.02], null, 7, 5), SKIN],
      [CYL(0.05, 0.055, 0.1, 8, [0, 1.55, 0]), SKIN],
      [SPH(0.13, [0, 1.68, 0.01], [0.95, 1.08, 1]), SKIN],
      ...(W ? [[SPH(0.142, [0, 1.71, -0.03], [1.04, 1.05, 1]), 0x4a3427], [CAP(0.125, 0.22, [0, 1.52, -0.07], null, [1.08, 1, 0.62]), 0x4a3427]]
            : [[SPH(0.138, [0, 1.73, -0.03], [1.0, 0.92, 1.0]), 0x1e1b24]]),
      W ? [RBOX(0.26, 0.26, 0.11, 0.04, [0.31, 1.0, 0.0], [0, 0, 0.1]), 0x7a4a36] : [RBOX(0.36, 0.26, 0.08, 0.03, [0.35, 0.72, 0.02]), 0x3b2d26],
    ]);
    const pedA = inst(pedGeo(false), vcol(null, 0.5), 10, 0.016);
    const pedB = inst(pedGeo(true), vcol(null, 0.5), 10, 0.016);
    const legs = inst(merge([[CAP(0.075, 0.6, [0, 0, 0]), 0xffffff], [RBOX(0.12, 0.08, 0.25, 0.035, [0, -0.37, 0.05]), 0x3a302c]]), vcol(), 40);
    // コイン（金色の縁＋表の輪）・時計
    const coinMesh = inst(merge([
      [CYL(0.34, 0.34, 0.08, 14, null, [Math.PI / 2, 0, 0]), 0xd29420],
      [CYL(0.285, 0.285, 0.092, 14, null, [Math.PI / 2, 0, 0]), 0xf6c845],
      [tf(new THREE.TorusGeometry(0.21, 0.022, 3, 14), [0, 0, 0.048]), 0xfff0b0],
      [tf(new THREE.TorusGeometry(0.21, 0.022, 3, 14), [0, 0, -0.048]), 0xfff0b0],
    ]), vcol({ emissive: 0x5a3a00 }, 0.9, 0xfff0c0), 90);
    const clockMesh = inst(merge([
      [CYL(0.36, 0.36, 0.13, 20, null, [Math.PI / 2, 0, 0]), 0x2f7cf0],
      [CYL(0.29, 0.29, 0.15, 20, null, [Math.PI / 2, 0, 0]), 0xffffff],
      [BOX(0.05, 0.2, 0.17, [0, 0.09, 0]), 0x1e2440], [BOX(0.16, 0.045, 0.17, [0.07, 0, 0]), 0x1e2440],
      [SPH(0.1, [-0.24, 0.32, 0]), 0x5aa2ff], [SPH(0.1, [0.24, 0.32, 0]), 0x5aa2ff],
      [BOX(0.06, 0.12, 0.06, [-0.2, -0.38, 0]), 0x2f7cf0], [BOX(0.06, 0.12, 0.06, [0.2, -0.38, 0]), 0x2f7cf0],
    ]), vcol({ emissive: 0x10264a }, 0.7, 0xd8ecff), 12);

    // 発見の印（エメラルドの宝石に金の輪。高い所に浮かぶ）
    const findMesh = inst(merge([
      [tf(new THREE.OctahedronGeometry(0.42, 0), null, null, [0.8, 1.15, 0.8]), 0x3fe0b0],
      [tf(new THREE.TorusGeometry(0.62, 0.05, 4, 24), null, [Math.PI / 2, 0, 0]), 0xf2c14e],
      [tf(new THREE.TorusGeometry(0.62, 0.035, 4, 24), null, [0, 0, 0]), 0xffe6a0],
    ]), vcol({ emissive: 0x0f6b54 }, 0.9, 0xd0fff0), 3);

    // ---------- ゴールのアーチ（あい色の看板に明朝の文字）
    const signArch = ctex(512, 128, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#1d2452'); gr.addColorStop(1, '#121738');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(233,194,122,.75)'; g.lineWidth = 2; g.strokeRect(8, 8, w - 16, h - 16);
      g.fillStyle = '#16a37f'; g.fillRect(0, h - 6, w, 6);
      g.textBaseline = 'middle';
      g.font = `800 60px ${SERIF}`;
      const t1 = M.dest, t2 = M.destSub;
      const w1 = g.measureText(t1).width;
      g.font = `700 28px ${SERIF}`;
      const w2 = g.measureText(t2).width;
      const x0 = (w - (w1 + 22 + w2)) / 2;
      g.textAlign = 'left';
      g.fillStyle = '#e9c27a'; g.fillText(t2, x0 + w1 + 22, h / 2 + 2);
      g.font = `800 60px ${SERIF}`;
      g.fillStyle = '#fff'; g.fillText(t1, x0, h / 2);
    });
    const arch = new THREE.Group();
    const archGeo = merge([
      [RBOX(0.62, 4.9, 0.62, 0.06, [-3.75, 2.45, 0]), 0xece2d2], [RBOX(0.62, 4.9, 0.62, 0.06, [3.75, 2.45, 0]), 0xece2d2],
      [RBOX(0.82, 0.32, 0.82, 0.05, [-3.75, 0.16, 0]), 0x8c8076], [RBOX(0.82, 0.32, 0.82, 0.05, [3.75, 0.16, 0]), 0x8c8076],
      [RBOX(8.4, 1.36, 0.52, 0.08, [0, 5.0, 0]), 0x161c42],
      [BOX(8.44, 0.06, 0.56, [0, 5.66, 0]), 0xd9b25a], [BOX(8.44, 0.08, 0.56, [0, 4.33, 0]), 0x16a37f],
      [BOX(0.14, 3.4, 0.66, [-3.42, 2.4, 0]), 0x16a37f], [BOX(0.14, 3.4, 0.66, [3.42, 2.4, 0]), 0x16a37f],
    ]);
    arch.add(new THREE.Mesh(archGeo, vcol(null, 0.35)));
    arch.add(new THREE.Mesh(archGeo, outlineMat(0.03)));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 1.8), new THREE.MeshBasicMaterial({ map: signArch }));
    sign.position.set(0, 5.0, 0.27);
    arch.add(sign);
    const tapeTex = ctex(128, 8, (g, w, h) => { for (let x = 0; x < w; x += 16) { g.fillStyle = (x / 16) % 2 ? '#ffffff' : '#16a37f'; g.fillRect(x, 0, 16, h); } });
    tapeTex.wrapS = THREE.RepeatWrapping; tapeTex.repeat.set(5, 1);
    const tape = new THREE.Mesh(new THREE.BoxGeometry(6.9, 0.12, 0.04), new THREE.MeshBasicMaterial({ map: tapeTex }));
    tape.position.set(0, 1.25, 0);
    arch.add(tape);
    scene.add(arch);
    // フォントが読み込めたら、明朝の文字で描きなおす
    try {
      if (document.fonts && document.fonts.load) {
        document.fonts.load(`800 60px 'Shippori Mincho B1'`).then(() => { if (!stopped) { redraw(signArch); redraw(signTex); } }).catch(() => {});
      }
    } catch (_) {}

    // ---------- 粒（はじける・紙ふぶき・水しぶき）と、拾ったときの光の輪
    const PN = 300;
    const pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3);
    const parts = [];
    for (let i = 0; i < PN; i++) { parts.push({ life: 0, vx: 0, vy: 0, vz: 0, g: 0, drag: 0 }); pPos[i * 3 + 1] = -99; }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
    pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3).setUsage(THREE.DynamicDrawUsage));
    const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.24, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, fog: false }));
    points.frustumCulled = false;
    scene.add(points);
    let pNext = 0;
    function burst(x, y, z, colors, n, spd, up, grav, life, drag) {
      const c = new THREE.Color();
      for (let k = 0; k < n; k++) {
        const i = pNext; pNext = (pNext + 1) % PN;
        const P = parts[i];
        const a = R() * Math.PI * 2, e = R() * 2 - 1, v = spd * (0.4 + R() * 0.6);
        P.vx = Math.cos(a) * Math.sqrt(1 - e * e) * v;
        P.vz = Math.sin(a) * Math.sqrt(1 - e * e) * v;
        P.vy = Math.abs(e) * v * 0.6 + up * (0.5 + R() * 0.7);
        P.g = grav; P.drag = drag || 0; P.life = life * (0.6 + R() * 0.5);
        pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
        c.set(colors[(R() * colors.length) | 0]);
        pCol[i * 3] = c.r; pCol[i * 3 + 1] = c.g; pCol[i * 3 + 2] = c.b;
      }
    }
    function stepParts(dt, scroll) {
      for (let i = 0; i < PN; i++) {
        const P = parts[i];
        if (P.life <= 0) continue;
        P.life -= dt;
        if (P.life <= 0) { pPos[i * 3 + 1] = -99; continue; }
        const k = Math.exp(-P.drag * dt);
        P.vx *= k; P.vz *= k; P.vy = P.vy * k - P.g * dt;
        pPos[i * 3] += P.vx * dt; pPos[i * 3 + 1] += P.vy * dt; pPos[i * 3 + 2] += (P.vz + scroll) * dt;
      }
      pGeo.attributes.position.needsUpdate = true;
      pGeo.attributes.color.needsUpdate = true;
    }
    const RN = 10;
    const rings = [];
    for (let i = 0; i < RN; i++) rings.push({ life: 0 });
    const ringMesh = inst(new THREE.RingGeometry(0.62, 0.72, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), RN);
    let rNext = 0;
    function ring(x, y, z, hex) { const r = rings[rNext]; rNext = (rNext + 1) % RN; r.x = x; r.y = y; r.z = z; r.life = 0.32; r.c = new THREE.Color(hex).multiplyScalar(0.7); }
    const ringCol = new THREE.Color();
    function stepRings(dt, scroll) {
      let n = 0;
      for (const r of rings) {
        if (r.life <= 0) continue;
        r.life -= dt;
        r.z += scroll * dt;
        if (r.life <= 0) continue;
        const k = 1 - r.life / 0.32;
        setI(ringMesh, n, r.x, r.y, r.z, 0, 0, 0, 0.45 + k * 0.9);
        ringCol.copy(r.c).multiplyScalar((1 - k) * (1 - k));
        ringMesh.setColorAt(n, ringCol);
        n++;
      }
      fin(ringMesh, n);
      if (ringMesh.instanceColor) ringMesh.instanceColor.needsUpdate = true;
    }

    // ---------- 主人公（うしろ姿：ベージュのパーカーに黒いリュック、黒髪）
    // 骨（Bone）を組んで、部品を全部1つの形にまとめた「骨入りメッシュ」にする → 描画は本体1回＋輪郭線1回
    const player = new THREE.Group();
    const mkBone = (parent, x, y, z) => { const b = new THREE.Bone(); b.position.set(x, y, z); if (parent) parent.add(b); return b; };
    const body = mkBone(null, 0, 0, 0);
    const upper = mkBone(body, 0, 0.92, 0);
    const armL = mkBone(upper, -0.3, 0.52, 0), foreL = mkBone(armL, 0, -0.32, 0);
    const armR = mkBone(upper, 0.3, 0.52, 0), foreR = mkBone(armR, 0, -0.32, 0);
    const legL = mkBone(body, -0.11, 0.92, 0), kneeL = mkBone(legL, 0, -0.42, 0);
    const legR = mkBone(body, 0.11, 0.92, 0), kneeR = mkBone(legR, 0, -0.42, 0);
    const boneArr = [body, upper, armL, foreL, armR, foreR, legL, kneeL, legR, kneeR];
    player.add(body);
    player.updateMatrixWorld(true);
    const HOOD = 0xd8c29c, HOOD2 = 0xc4ab84, PANTS = 0x2a2c3a, HAIR = 0x221c2a, SKN = 0xf0c8a4, PACK = 0x23242c;
    const pp = [];
    const on = (bone, g, hex) => { g.applyMatrix4(bone.matrixWorld); pp.push([g, hex, boneArr.indexOf(bone)]); };
    // 胴（パーカー）
    on(upper, LATHE([[0.205, -0.03], [0.215, 0.03], [0.205, 0.2], [0.226, 0.4], [0.214, 0.5], [0.15, 0.58], [0.075, 0.63]], null, [1.12, 1, 0.74], 16), HOOD);
    on(upper, CYL(0.219, 0.213, 0.07, 16, [0, -0.01, 0], null, [1.12, 1, 0.74]), HOOD2);
    on(upper, SPH(0.17, [0, 0.585, 0.1], [1.2, 0.62, 0.9]), HOOD2);
    on(upper, CYL(0.055, 0.06, 0.12, 8, [0, 0.66, -0.01]), SKN);
    // 頭と、くしゃっとした黒髪
    on(upper, SPH(0.148, [0, 0.795, -0.015], [0.94, 1.04, 1], 14, 10), SKN);
    on(upper, SPH(0.035, [-0.138, 0.785, 0.0], [0.6, 1, 0.8]), SKN); on(upper, SPH(0.035, [0.138, 0.785, 0.0], [0.6, 1, 0.8]), SKN);
    on(upper, SPH(0.16, [0, 0.835, 0.025], [1.0, 0.96, 1.0], 14, 10), HAIR);
    on(upper, SPH(0.14, [0, 0.755, 0.06], [1.0, 0.72, 0.86]), HAIR);
    for (const [x, y, z, r] of [[0.09, 0.96, 0.04, 0.062], [-0.1, 0.955, 0.0, 0.058], [0.0, 0.975, -0.07, 0.052], [0.14, 0.88, 0.09, 0.05], [-0.15, 0.875, 0.07, 0.05], [0.03, 0.92, 0.15, 0.055]]) on(upper, SPH(r, [x, y, z], null, 8, 6), HAIR);
    // リュック
    on(upper, RBOX(0.4, 0.48, 0.19, 0.075, [0, 0.32, 0.235], null, 4), PACK);
    on(upper, RBOX(0.3, 0.2, 0.06, 0.028, [0, 0.2, 0.345]), 0x30323d);
    on(upper, BOX(0.26, 0.012, 0.01, [0, 0.302, 0.376]), 0x6a6d80);
    on(upper, tf(new THREE.TorusGeometry(0.05, 0.013, 4, 10, Math.PI), [0, 0.555, 0.22]), PACK);
    on(upper, RBOX(0.065, 0.03, 0.32, 0.012, [-0.12, 0.56, 0.06]), 0x1b1c23); on(upper, RBOX(0.065, 0.03, 0.32, 0.012, [0.12, 0.56, 0.06]), 0x1b1c23);
    // 腕
    for (const [arm, fore] of [[armL, foreL], [armR, foreR]]) {
      on(arm, CAP(0.077, 0.2, [0, -0.16, 0]), HOOD);
      on(fore, CAP(0.069, 0.17, [0, -0.12, 0]), HOOD);
      on(fore, CYL(0.07, 0.068, 0.05, 10, [0, -0.235, 0]), HOOD2);
      on(fore, SPH(0.058, [0, -0.3, 0], [0.9, 1.1, 0.8]), SKN);
    }
    // 脚とスニーカー
    for (const [leg, knee] of [[legL, kneeL], [legR, kneeR]]) {
      on(leg, CAP(0.1, 0.24, [0, -0.21, 0]), PANTS);
      on(knee, CAP(0.086, 0.27, [0, -0.2, 0]), PANTS);
      on(knee, RBOX(0.15, 0.1, 0.29, 0.045, [0, -0.43, -0.05]), 0xf3f0e9);
      on(knee, RBOX(0.156, 0.035, 0.3, 0.015, [0, -0.475, -0.05]), 0xc9c2b6);
    }
    const pGeoSk = merge(pp, true);
    const skel = new THREE.Skeleton(boneArr);
    const pMesh = new THREE.SkinnedMesh(pGeoSk, vcol(null, 0.55, 0xffc79c));
    const pLine = new THREE.SkinnedMesh(pGeoSk, outlineMat(0.013));
    for (const m of [pMesh, pLine]) { m.frustumCulled = false; player.add(m); }
    player.updateMatrixWorld(true);
    pMesh.bind(skel);
    pLine.bind(skel, pMesh.bindMatrix);
    let bike = null;
    if (BIKE) {
      // エメラルドの自転車（部品をまとめて1つ）
      const V = (x, y, z) => new THREE.Vector3(x, y, z);
      const tube = (a, b, r, hex) => {
        const g = new THREE.CylinderGeometry(r, r, a.distanceTo(b), 7);
        const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
        const mid = a.clone().lerp(b, 0.5);
        g.applyQuaternion(q); g.translate(mid.x, mid.y, mid.z);
        return [g, hex];
      };
      const Rh = V(0, 0.36, 0.56), Ck = V(0, 0.34, 0.02), S = V(0, 0.92, 0.2), H = V(0, 0.95, -0.46), F = V(0, 0.36, -0.66);
      const G = 0x16a37f;
      const bikeGeo = merge([
        [tf(new THREE.TorusGeometry(0.34, 0.045, 6, 22), [0, 0.36, 0.56], [0, Math.PI / 2, 0]), 0x1d1f28],
        [tf(new THREE.TorusGeometry(0.34, 0.045, 6, 22), [0, 0.36, -0.66], [0, Math.PI / 2, 0]), 0x1d1f28],
        [tf(new THREE.TorusGeometry(0.29, 0.015, 4, 18), [0, 0.36, 0.56], [0, Math.PI / 2, 0]), 0xc9cfd8],
        [tf(new THREE.TorusGeometry(0.29, 0.015, 4, 18), [0, 0.36, -0.66], [0, Math.PI / 2, 0]), 0xc9cfd8],
        tube(Rh, Ck, 0.03, G), tube(Ck, S, 0.035, G), tube(Ck, H, 0.04, G), tube(S, H, 0.035, G), tube(Rh, S, 0.025, G), tube(H, F, 0.03, 0xc9cfd8),
        [RBOX(0.16, 0.06, 0.3, 0.025, [0, 0.98, 0.22]), 0x1d1f28],
        [CYL(0.02, 0.02, 0.62, 6, [0, 1.08, -0.47], [0, 0, Math.PI / 2]), 0x2a2d38],
        tube(H, V(0, 1.08, -0.47), 0.025, 0xc9cfd8),
        [CYL(0.1, 0.1, 0.05, 12, [0, 0.34, 0.02], [0, 0, Math.PI / 2]), 0x2a2d38],
        [RBOX(0.16, 0.05, 0.22, 0.02, [0, 0.92, 0.72]), 0x2a2d38],
        [RBOX(0.3, 0.2, 0.22, 0.04, [0, 1.0, -0.72]), 0x8a6a4a],
      ]);
      bike = new THREE.Group();
      bike.add(new THREE.Mesh(bikeGeo, vcol(null, 0.45)));
      bike.add(new THREE.Mesh(bikeGeo, outlineMat(0.012)));
      player.add(bike);
      body.position.set(0, 0.12, 0.2);
    }
    scene.add(player);

    // ---------- 画面の表示（HUD・説明・カウントダウン）
    const destWord = M.lead;
    const ICON = {
      lr: '<svg viewBox="0 0 48 48"><rect x="15" y="5" width="18" height="38" rx="5" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="1.6"/><path d="M6 24h36M11 19l-5 5 5 5M37 19l5 5-5 5" fill="none" stroke="#e9c27a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      up: '<svg viewBox="0 0 48 48"><rect x="15" y="5" width="18" height="38" rx="5" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="1.6"/><path d="M24 37V12M18 18l6-6 6 6" fill="none" stroke="#3fd0a4" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      find: '<svg viewBox="0 0 48 48"><path d="M24 8l8 14-8 14-8-14z" fill="none" stroke="#3fe0b0" stroke-width="2.2" stroke-linejoin="round"/><ellipse cx="24" cy="22" rx="15" ry="5" fill="none" stroke="#e9c27a" stroke-width="1.8"/><path d="M24 44v-4" stroke="#3fd0a4" stroke-width="2.2" stroke-linecap="round"/></svg>',
      get: '<svg viewBox="0 0 48 48"><circle cx="17" cy="26" r="9.5" fill="none" stroke="#e9c27a" stroke-width="2.2"/><circle cx="17" cy="26" r="5" fill="none" stroke="#e9c27a" stroke-width="1.4" opacity=".7"/><circle cx="32" cy="22" r="9.5" fill="none" stroke="#9fc4ff" stroke-width="2.2"/><path d="M32 16.5V22l4 2.4" fill="none" stroke="#9fc4ff" stroke-width="2" stroke-linecap="round"/></svg>',
    };
    const hud = el('div', 'dash-hud', `
      <div class="dash-chip dash-coins"><i class="dash-ico-coin"></i><b data-coins>0</b></div>
      <div class="dash-chip dash-time"><small data-tlabel>始業まで</small><b data-time>--:--</b><em data-tdelta></em></div>
      <div class="dash-chip dash-clocks"><i class="dash-ico-clock"></i><b data-clocks>0</b></div>
      <div class="dash-prog"><div class="dash-prog-bar"><i data-prog></i>${FINDS.map((f, i) => `<em class="dash-pf" data-pf="${i}" style="left:${[22, 52, 80][i]}%"></em>`).join('')}</div><span class="dash-prog-dest">${M.dest}</span></div>`);
    const lines = el('div', 'dash-lines');
    for (let i = 0; i < 14; i++) {
      const l = el('i');
      const left = i % 2 ? 84 + RS() * 14 : 2 + RS() * 14;
      l.style.cssText = `left:${left.toFixed(1)}%;top:${(RS() * 70).toFixed(1)}%;height:${(14 + RS() * 18).toFixed(1)}%;animation-delay:${(-RS()).toFixed(2)}s;animation-duration:${(0.32 + RS() * 0.22).toFixed(2)}s`;
      lines.appendChild(l);
    }
    const grade = el('div', 'dash-grade');     // 朝日のにじみ・画面のふちを少し暗く
    const flash = el('div', 'dash-flash');
    const pops = el('div', 'dash-pops');
    const howto = el('div', 'dash-howto', `
      <div class="dash-card">
        <div class="dash-kicker">ミニゲーム</div>
        <h2 class="dash-title">通勤ダッシュ</h2>
        <p class="dash-lead">始業 9:00 までに<b>${destWord}</b>へ。${FINDS.length ? `<br><span class="dash-lead-sub">道の途中に、ここ数年で変わった大阪が${FINDS.length}つ。</span>` : ''}</p>
        <div class="dash-rules">
          <div class="dash-rule">${ICON.lr}<div><b>左右にスワイプ</b><span>レーンを変えてよける</span></div></div>
          <div class="dash-rule">${ICON.up}<div><b>上にスワイプ</b><span>ジャンプで低い柵や水たまりを越える</span></div></div>
          <div class="dash-rule">${ICON.get}<div><b>コインと時計を拾う</b><span>時計を取ると、持ち時間が少し戻る</span></div></div>
          ${FINDS.length ? `<div class="dash-rule">${ICON.find}<div><b>光る「発見」はジャンプで</b><span>高い所に浮かぶ印。大阪の変化が分かる</span></div></div>` : ''}
        </div>
        <p class="dash-keys">パソコンは ← → で移動、↑ かスペースでジャンプ</p>
        <button class="dash-btn" type="button" data-dash-start>スタート</button>
      </div>`);
    const count = el('div', 'dash-count');
    const banner = el('div', 'dash-banner');
    const findBar = el('div', 'dash-find');
    [grade, lines, hud, flash, pops, count, banner, findBar, howto].forEach(n => root.appendChild(n));
    const $ = s => root.querySelector(s);
    const hudCoins = $('[data-coins]'), hudClocks = $('[data-clocks]'), hudTime = $('[data-time]'), hudLabel = $('[data-tlabel]'), hudDelta = $('[data-tdelta]'), hudProg = $('[data-prog]');
    const timeChip = $('.dash-time');

    function pop(text, cls, x, y, z) {
      const v = new THREE.Vector3(x, y, z).project(cam);
      if (v.z > 1) return;
      const p = el('span', 'dash-pop ' + (cls || ''), text);
      p.style.left = ((v.x + 1) / 2 * 100).toFixed(1) + '%';
      p.style.top = ((1 - v.y) / 2 * 100).toFixed(1) + '%';
      pops.appendChild(p);
      later(() => p.remove(), 900);
    }
    function delta(text, cls) {
      hudDelta.textContent = text;
      hudDelta.className = cls;
      void hudDelta.offsetWidth;
      hudDelta.classList.add('show');
    }

    // ---------- コース
    // 速さは進んだ割合で上がる（v = v0 + (v1-v0)*p）。ぶつからなければ PLAY_T 秒でつくように長さを決める。
    const D = Math.round(((M.v1 - M.v0) * PLAY_T) / Math.log(M.v1 / M.v0));
    const items = makeCourse(M, D, R, FINDS.length);
    const RATE = M.clock0 / SLACK;   // 実時間1秒 = ゲーム内の何秒か

    // ---------- 状態
    let state = 'howto', st = 0, t = 0, dist = 0, speed = 0, slow = 1;
    let lane = 1, px = 0, py = 0, pz = 0, vy = 0, phase = 0, inv = 0, shake = 0, lo = 0, cdShown = -1;
    let autoCool = 0, fastFall = false, landed = true, lastNow = 0, raf = 0, paused = false;
    let camX = 2.5, camY = 2.3, camZ = 5.0, lookX = 0.3, lookY = 1.3, lookZ = 0, fov = 56;
    const remain = () => SLACK - t - res.hits * HIT_LOSS + res.clocks * CLOCK_GAIN;
    const PH = BIKE ? 0.62 : 0.3;

    function fmt(sec) {
      const s = Math.max(0, Math.round(sec));
      return Math.floor(s / 60) + '分' + String(s % 60).padStart(2, '0') + '秒';
    }
    function arrival() {
      const g = Math.round(9 * 3600 - remain() * RATE);
      const h = Math.floor(g / 3600), m = Math.floor((g % 3600) / 60);
      return h + ':' + String(m).padStart(2, '0');
    }

    // ---------- 操作
    function move(d) {
      if (state !== 'run') return;
      const n = clamp(lane + d, 0, 2);
      if (n === lane) { body.rotation.z = -d * 0.1; return; }
      lane = n;
    }
    function jump() {
      if (state !== 'run' || py > 0.05) return;
      vy = JUMP_V; py = 0.001; landed = false; fastFall = false;
      sfx('jump');
      burst(px, 0.1, 0.2, [0xfff3e0, 0xf6d8b8], 6, 2.2, 0.6, 4, 0.35, 3);
    }
    function drop() { if (state === 'run' && py > 0.2) { fastFall = true; vy = Math.min(vy, -6); } }
    let sx = 0, sy = 0, swiping = false, used = false;
    const onDown = e => { if (state !== 'run') return; swiping = true; used = false; sx = e.clientX; sy = e.clientY; };
    const onMove = e => {
      if (!swiping || used) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 26 && Math.abs(dx) > Math.abs(dy)) { move(dx > 0 ? 1 : -1); used = true; }
      else if (dy < -26 && -dy > Math.abs(dx)) { jump(); used = true; }
      else if (dy > 30 && dy > Math.abs(dx)) { drop(); used = true; }
    };
    const onUp = () => { swiping = false; };
    const onKey = e => {
      if (finished) return;
      const k = e.key;
      if (state === 'howto' && (k === 'Enter' || k === ' ')) { e.preventDefault(); begin(); return; }
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') { e.preventDefault(); move(-1); }
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') { e.preventDefault(); move(1); }
      else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ') { e.preventDefault(); if (!e.repeat) jump(); }
      else if (k === 'ArrowDown' || k === 's' || k === 'S') { e.preventDefault(); drop(); }
    };
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);
    window.addEventListener('keydown', onKey);
    const startBtn = $('[data-dash-start]');
    function begin() {
      if (state !== 'howto') return;
      state = 'count'; st = 0; cdShown = -1;
      howto.classList.add('hide');
      later(() => howto.remove(), 400);
      root.classList.add('playing');
    }
    startBtn.addEventListener('click', begin);

    function onVis() {
      if (document.hidden) { paused = true; if (raf) cancelAnimationFrame(raf); raf = 0; }
      else if (paused && !stopped) { paused = false; lastNow = 0; raf = requestAnimationFrame(loop); }
    }
    document.addEventListener('visibilitychange', onVis);
    function resize() {
      const w = Math.max(1, root.clientWidth), h = Math.max(1, root.clientHeight);
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(root); else window.addEventListener('resize', resize);
    resize();

    // ---------- 当たったとき・拾ったとき
    function hit(it) {
      res.hits++;
      inv = 1.0; slow = 0.6; shake = 0.38;
      it.kt = 0.0001;
      it.side = px >= LANES[it.lane] ? -1 : 1;
      sfx('hit'); buzz([45, 30, 45]);
      root.classList.remove('hit'); void root.offsetWidth; root.classList.add('hit');
      const z = -(it.s - dist);
      if (it.t === 'puddle') burst(px, 0.3, z + 0.3, [0xbfe0ff, 0xe8f4ff, 0xf3c0c0], 26, 4.5, 2.5, 12, 0.6, 1.5);
      else burst(px, 0.9, 0.2, [0xffffff, 0xffd0a0, 0xff8a3d], 14, 4, 1.5, 8, 0.45, 2);
      pop(OB[it.t].word, 'ouch', px, 2.2, -0.5);
      delta('-' + Math.round(HIT_LOSS * RATE) + '秒', 'minus');
    }
    function collect(it) {
      it.done = true;
      const z = -(it.s - dist), x = LANES[it.lane];
      if (it.t === 'coin') {
        res.coins++;
        sfx('coin');
        burst(x, it.y, z, [0xffe27a, 0xffc93c, 0xfff6c8], 12, 3.6, 1.2, 5, 0.45, 2.5);
        ring(x, it.y, Math.max(z, -0.6), 0xffd27a);
        pop('+1', 'coin', x, it.y + 0.5, z);
        hudCoins.textContent = res.coins;
        bump(hudCoins.parentNode);
      } else if (it.t === 'find') {
        const f = FINDS[it.fi];
        if (f && !res.finds.includes(f.id)) res.finds.push(f.id);
        sfx('goal'); buzz([20, 30, 20]);
        burst(x, it.y, z, [0x3fe0b0, 0xf2c14e, 0xffffff], 30, 5, 1.8, 4, 0.7, 2);
        ring(x, it.y, Math.max(z, -0.6), 0x7ff0d0);
        pop('発見！', 'find', x, it.y + 0.6, z);
        const pf = root.querySelector(`[data-pf="${it.fi}"]`);
        if (pf) pf.classList.add('on');
        if (f) {
          findBar.innerHTML = `<small>発見 ${res.finds.length}/${FINDS.length}</small><b>${f.title}</b>`;
          findBar.classList.remove('show'); void findBar.offsetWidth; findBar.classList.add('show');
          const n = res.finds.length;
          later(() => { if (res.finds.length === n) findBar.classList.remove('show'); }, 2400);
        }
      } else {
        res.clocks++;
        sfx('clock'); buzz(15);
        burst(x, it.y, z, [0x7fb8ff, 0xd8ecff, 0x2f7cf0], 18, 4, 1.4, 4, 0.55, 2.5);
        ring(x, it.y, Math.max(z, -0.6), 0x8cc4ff);
        pop('+' + Math.round(CLOCK_GAIN * RATE) + '秒', 'clock', x, it.y + 0.5, z);
        hudClocks.textContent = res.clocks;
        bump(hudClocks.parentNode);
        delta('+' + Math.round(CLOCK_GAIN * RATE) + '秒', 'plus');
      }
    }
    function bump(n) { n.classList.remove('bump'); void n.offsetWidth; n.classList.add('bump'); }

    // ---------- 自動操作（テスト用）
    function autopilot(h) {
      autoCool -= h;
      const danger = [99, 99, 99], jumpy = [99, 99, 99], coinsAt = [0, 0, 0];
      for (let i = lo; i < items.length; i++) {
        const it = items[i], rel = it.s - dist;
        if (rel > 26) break;
        if (rel < -0.5 || it.done || it.kt) continue;
        if (isPick(it.t)) {
          if (rel < 14) coinsAt[it.lane] += it.t === 'find' ? 8 : it.t === 'clock' ? 3 : 1;
          if (it.t === 'find' && it.lane === lane && rel < speed * 0.22 + 1.2 && py <= 0.01) jump();
          continue;
        }
        if (OB[it.t].clear < 1) jumpy[it.lane] = Math.min(jumpy[it.lane], rel);
        else danger[it.lane] = Math.min(danger[it.lane], rel);
      }
      const reach = speed * 0.55 + 3;
      const sc = L => (danger[L] < reach * 1.7 ? -100 + danger[L] : 0) + coinsAt[L] * 0.5 - Math.abs(L - lane) * 0.3;
      if (autoCool <= 0) {
        let best = lane;
        for (let L = 0; L < 3; L++) {
          if (L === lane || (Math.abs(L - lane) === 2 && danger[1] < 5)) continue;
          if (sc(L) > sc(best) + 0.4) best = L;
        }
        if (best !== lane) { move(best > lane ? 1 : -1); autoCool = 0.12; }
      }
      if (jumpy[lane] < speed * 0.2 + 0.9 && py <= 0.01) jump();
    }

    // ---------- 1コマぶんの計算（細かく分けて呼ぶ）
    function step(h) {
      st += h;
      if (state === 'count') {
        const n = 3 - Math.floor(st);
        if (n !== cdShown && n >= 1) { cdShown = n; showCount(String(n), ''); sfx('count'); }
        if (st >= 3) {
          state = 'run'; st = 0;
          showCount('GO!', 'go'); sfx('start'); buzz(20);
          later(() => count.classList.remove('show'), 650);
        }
        return;
      }
      if (state === 'run') {
        t += h;
        if (AUTO) autopilot(h);
        const p = Math.min(1, dist / D);
        slow = Math.min(1, slow + h * 0.6);
        speed = (M.v0 + (M.v1 - M.v0) * p) * slow;
        dist += speed * h;
        inv = Math.max(0, inv - h);
        for (let i = lo; i < items.length; i++) {
          const it = items[i], rel = it.s - dist;
          if (rel > 44) break;
          if (it.t === 'ped' && !it.kt && rel > 0) { it.s -= 1.3 * h; it.walk = (it.walk || 0) + h * 7; }
          if (it.done || rel < -1.6 || rel > 2) continue;
          const ix = LANES[it.lane], dx = Math.abs(ix - px), dz = Math.abs(rel);
          if (isPick(it.t)) {
            if (dz < 0.9 && dx < 0.85 && Math.abs(py + 0.95 - it.y) < 1.0) collect(it);
            continue;
          }
          const O = OB[it.t];
          if (dz < O.hd + PH && dx < O.hw + 0.3) {
            if (py > O.clear) continue;
            it.done = true;
            if (inv <= 0) hit(it);
          }
        }
        if (dist >= D) {
          state = 'goal'; st = 0;
          res.time = Math.round(t * 10) / 10;
          res.late = remain() < 0;
          goal();
        }
      } else if (state === 'goal') {
        speed *= Math.exp(-h * 2.4);
        pz += speed * h;
        if (st > 3.1 && !finished) finish();
      }
      // 左右とジャンプ
      px += (LANES[lane] - px) * (1 - Math.exp(-h * 15));
      if (!landed) {
        vy -= GRAV * (fastFall ? 2.4 : 1) * h;
        py += vy * h;
        if (py <= 0) {
          py = 0; vy = 0; landed = true;
          burst(px, 0.08, 0.1, [0xf3e6d6, 0xe8d6c0], 8, 2.4, 0.4, 3, 0.4, 3);
        }
      }
    }
    function showCount(text, cls) {
      count.innerHTML = `<b class="${cls}">${text}</b>`;
      count.classList.add('show');
    }
    function goal() {
      sfx('goal'); buzz([30, 40, 70]);
      tape.visible = false;
      const conf = [0xff8fa8, 0xffa25a, 0x16a37f, 0xe9c27a, 0xffffff, 0x8cb8ff];
      burst(0, 4.6, -0.5, conf, 60, 7, 2.5, 4, 2.2, 1.4);
      const rain = (n, dz) => burst(px, 5.5, -pz - dz, conf, n, 4.5, 1.5, 3, 2.6, 1.6);
      later(() => rain(50, 3), 700);
      later(() => rain(50, 1.5), 1100);
      later(() => rain(40, 2), 1600);
      later(() => {
        banner.className = 'dash-banner show ' + (res.late ? 'late' : 'ok');
        banner.innerHTML = `<small>${res.late ? '始業に間に合わず' : '始業に間に合った'}</small><b>${res.late ? '遅刻…' : 'セーフ'}</b><span>${arrival()} 着</span>
          <div class="dash-sum"><span><i class="dash-ico-coin"></i>${res.coins}</span><span><i class="dash-ico-clock"></i>${res.clocks}</span>${FINDS.length ? `<span class="f">発見 ${res.finds.length}/${FINDS.length}</span>` : ''}<span class="h">ぶつかった ${res.hits}回</span></div>`;
        findBar.classList.remove('show');
      }, 500);
    }
    function finish() {
      finished = true;
      root.classList.add('out');
      later(() => {
        const r = { coins: res.coins, clocks: res.clocks, hits: res.hits, late: res.late, time: res.time, finds: res.finds.slice() };
        cleanup();
        done(r);
      }, 380);
    }

    // ---------- 見た目の更新（毎フレーム1回）
    function placeScenery(T) {
      for (const g of ground) g.tex.offset.y = modp(dist / g.len, 1);
      let n = 0;
      let nt = 0;
      for (let i = 0; i < trees.length; i++) {
        const tr = trees[i], z = ZN - modp(tr.b - dist, SPAN);
        if (z < -158) continue;
        tint(treeMesh, nt, tr.c);
        setI(treeMesh, nt++, tr.x, 0, z, 0, tr.ry, 0, tr.s, tr.s, tr.s);
        setI(shadows, n++, tr.x, 0.03, z, 0, 0, 0, 2.8 * tr.s, 1, 2.4);
      }
      fin(treeMesh, nt);
      if (treeMesh.instanceColor) treeMesh.instanceColor.needsUpdate = true;
      lamps.forEach((L, i) => {
        const z = ZN - modp(L.b - dist, SPAN), ry = L.side < 0 ? 0 : Math.PI;
        setI(lampMesh, i, L.side * 4.45, 0, z, 0, ry);
        setI(lampGlow, i, L.side * 4.45, 0, z, 0, ry);
        setI(lampHalo, i, L.side * (4.45 - 0.86), 5.7, z + 0.05, 0, 0, 0, 2.2);
      });
      fin(lampMesh, lamps.length); fin(lampGlow, lamps.length); fin(lampHalo, lamps.length);
      blds.forEach((B, i) => {
        const z = bz[i] = ZN - modp(B.b - dist, SPAN);
        const xc = B.side * (B.x0 + B.d / 2), face = B.side * B.x0;
        setI(B.mesh, B.i, xc, 0, z, 0, 0, 0, B.d, B.h, B.len);
        setI(roofs, i, xc, B.h, z, 0, 0, 0, B.d, B.tall ? 1.5 : 1, B.len);
        setI(shops, i, face - B.side * 0.06, 1.45, z, 0, -B.side * Math.PI / 2, 0, B.len * 0.86, 2.5, 1);
        setI(awn, i, face - B.side * 0.55, 2.95, z, 0, 0, B.side * 0.22, 1.1, 0.08, B.len * 0.86);
      });
      for (const k in bMesh) fin(bMesh[k].m, bMesh[k].n);
      fin(roofs, blds.length); fin(shops, blds.length); fin(awn, blds.length);
      signs.forEach((sg, i) => setI(signMesh, i, sg.B.side * (sg.B.x0 - 0.6), sg.y, bz[sg.bi] - sg.off));
      fin(signMesh, signs.length);
      cars.forEach((c, i) => {
        const z = ZN - modp(c.b - dist - c.v * T, SPAN);
        setI(carMesh, i, c.x, 0, z);
      });
      fin(carMesh, cars.length);
      return n;
    }
    signs.forEach(sg => { sg.bi = blds.indexOf(sg.B); });
    function placeItems(nSh, T, dt) {
      while (lo < items.length && items[lo].s - dist < -18) lo++;
      let nc = 0, nf = 0, np = 0, na = 0, nb = 0, nl = 0, nk = 0, nq = 0, nd = 0;
      for (let i = lo; i < items.length; i++) {
        const it = items[i], rel = it.s - dist;
        if (rel > 182) break;
        const z = -rel;
        let x = LANES[it.lane];
        if (it.kt) it.kt += dt;
        if (isPick(it.t)) {
          if (it.done) continue;
          const spin = T * 3.2 + it.s * 0.4, bob = Math.sin(T * 4 + it.s) * 0.08;
          if (it.t === 'find') { if (nd < 3) { setI(findMesh, nd++, x, it.y + bob * 1.5, z, 0, T * 1.6, 0, 1 + Math.sin(T * 6) * 0.06); setI(shadows, nSh++, x, 0.03, z, 0, 0, 0, 1.4, 1, 1.4); } }
          else if (it.t === 'coin') { if (nk < 90 && rel < 125) setI(coinMesh, nk++, x, it.y + bob, z, 0, spin); }
          else if (nq < 12) setI(clockMesh, nq++, x, it.y + bob, z, 0, Math.sin(T * 2.5 + it.s) * 0.6, Math.sin(T * 9) * 0.06, 1.15);
          continue;
        }
        const k = it.kt || 0;
        if (it.t === 'cone' && nc < 16) {
          const ky = Math.max(0, 5.2 * k - 13 * k * k), kz = -Math.min(k, 0.7) * 7, rx = -Math.min(k * 5, 1.45);
          setI(coneMesh, nc++, k ? x + it.side * Math.min(k, 0.6) * 1.5 : x, ky, z + kz, k ? rx : 0, k ? it.side * 0.4 : 0);
          setI(shadows, nSh++, x, 0.03, z + kz, 0, 0, 0, 2.2, 1, 0.9);
        } else if (it.t === 'fence' && nf < 16) {
          setI(fenceMesh, nf++, x, 0, z, k ? -Math.min(k * 6, 1.5) : 0);
          setI(shadows, nSh++, x, 0.03, z + 0.1, 0, 0, 0, 2.1, 1, 0.7);
        } else if (it.t === 'puddle' && np < 16) {
          const s = 1 + (k ? Math.min(k, 0.4) * 0.6 : 0);
          setI(pudMesh, np++, x, 0, z, 0, it.s, 0, s, 1, s);
        } else if (it.t === 'ped' && na + nb < 20 && rel < 135) {
          const w = it.walk || 0, sw = Math.sin(w) * (k ? 0.1 : 0.55);
          const ox = k ? it.side * Math.min(k, 0.35) * 2.2 : 0;
          const ry = k ? it.side * 0.5 : 0;
          if (it.v == null) it.v = R() < 0.5;
          const m = it.v ? pedA : pedB;
          const bob = Math.abs(Math.sin(w)) * 0.03;
          setI(m, m === pedA ? na++ : nb++, x + ox, bob, z, 0, ry);
          for (const sgn of [-1, 1]) {
            const a = sw * sgn;
            tint(legs, nl, it.v ? 0x2b3150 : 0x2e2a30);
            setI(legs, nl++, x + ox + sgn * 0.1, 0.8 + bob - 0.39 * Math.cos(a), z - 0.39 * Math.sin(a), a);
          }
          setI(shadows, nSh++, x + ox, 0.03, z, 0, 0, 0, 1.1, 1, 0.9);
        }
      }
      fin(coneMesh, nc); fin(fenceMesh, nf); fin(pudMesh, np); fin(pedA, na); fin(pedB, nb); fin(legs, nl); fin(coinMesh, nk); fin(clockMesh, nq); fin(findMesh, nd);
      if (legs.instanceColor) legs.instanceColor.needsUpdate = true;
      return nSh;
    }
    function animPlayer(dt) {
      const moving = state === 'run' || (state === 'goal' && speed > 3);
      const sr = clamp(speed / M.v1, 0, 1);
      player.position.set(px, py, -pz);
      const tilt = clamp((LANES[lane] - px) * -0.16, -0.32, 0.32);
      body.rotation.z += (tilt - body.rotation.z) * (1 - Math.exp(-dt * 12));
      player.visible = !(inv > 0 && Math.floor(inv * 14) % 2 === 0) || state !== 'run';
      const air = py > 0.03;
      if (BIKE) {
        if (moving) phase += dt * (7 + 7 * sr);
        const s = Math.sin(phase), c = Math.cos(phase);
        legL.rotation.x = 1.25 + 0.42 * s; kneeL.rotation.x = -1.45 + 0.5 * c;
        legR.rotation.x = 1.25 - 0.42 * s; kneeR.rotation.x = -1.45 - 0.5 * c;
        upper.rotation.x = -0.5 - (moving ? 0.08 * sr : 0);
        armL.rotation.set(1.0, 0, 0.18); armR.rotation.set(1.0, 0, -0.18);
        foreL.rotation.x = 0.35; foreR.rotation.x = 0.35;
        player.rotation.x = air ? -0.12 : 0;
        body.position.y = 0.12 + (moving ? Math.abs(s) * 0.015 : 0);
      } else {
        const rate = mode === 'walk' ? 10 : 11.5;
        if (moving) phase += dt * rate * (0.6 + 0.5 * sr);
        else phase += dt * 1.5;
        const s = Math.sin(phase), c = Math.cos(phase);
        if (!moving) {
          legL.rotation.x = legR.rotation.x = 0; kneeL.rotation.x = kneeR.rotation.x = 0;
          armL.rotation.set(0.08, 0, 0.1); armR.rotation.set(0.08, 0, -0.1);
          foreL.rotation.x = foreR.rotation.x = 0.25;
          body.position.y = Math.sin(phase) * 0.008;
          upper.rotation.set(0, 0, 0);
        } else if (air) {
          legL.rotation.x = 1.1; kneeL.rotation.x = -1.5; legR.rotation.x = -0.35; kneeR.rotation.x = -0.9;
          armL.rotation.set(-0.9, 0, 0.35); armR.rotation.set(1.0, 0, -0.35);
          foreL.rotation.x = foreR.rotation.x = 0.9;
          upper.rotation.set(-0.2, 0, 0);
          body.position.y = 0;
        } else {
          const amp = mode === 'walk' ? 0.75 : 0.9;
          legL.rotation.x = s * amp; kneeL.rotation.x = -(0.2 + 1.25 * Math.max(0, c));
          legR.rotation.x = -s * amp; kneeR.rotation.x = -(0.2 + 1.25 * Math.max(0, -c));
          armL.rotation.set(-s * 0.8, 0, 0.12); armR.rotation.set(s * 0.8, 0, -0.12);
          foreL.rotation.x = foreR.rotation.x = 1.25;
          body.position.y = Math.abs(s) * 0.075;
          upper.rotation.set(-(0.14 + 0.12 * sr), s * 0.12, 0);
        }
      }
      // ゴール後のポーズ
      if (state === 'goal' && st > 1.0) {
        const k = clamp((st - 1.0) * 3, 0, 1);
        if (!res.late) {
          armL.rotation.set(-2.7 * k, 0, 0.45 * k); armR.rotation.set(-2.7 * k, 0, -0.45 * k);
          foreL.rotation.x = foreR.rotation.x = 0.1;
        } else {
          upper.rotation.x = -0.55 * k;
          armL.rotation.set(0.7 * k, 0, 0.05); armR.rotation.set(0.7 * k, 0, -0.05);
          foreL.rotation.x = foreR.rotation.x = 0.2;
        }
      }
    }

    let T = 0, fpsAcc = 0, fpsN = 0, fps = 0, slowSec = 0;
    function loop(now) { try { loopInner(now); } catch (e) { fail(e); } }
    function fail(e) {
      console.warn('Dash:', e);
      if (stopped) return;
      try { cleanup(); } catch (_) { try { root.remove(); } catch (__) {} }
      done(Object.assign(res, { skipped: true }));
    }
    function loopInner(now) {
      if (stopped) return;
      raf = requestAnimationFrame(loop);
      if (!lastNow) lastNow = now;
      const dt = Math.min(0.1, (now - lastNow) / 1000);
      lastNow = now;
      fpsAcc += dt; fpsN++;
      if (fpsAcc > 1) {
        fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0;
        // 重い端末では、2秒続けてカクついたら画面の細かさを下げる（1.5 → 1 → 0.75）
        slowSec = fps < 40 ? slowSec + 1 : 0;
        if (slowSec >= 2) {
          const pr = renderer.getPixelRatio();
          if (pr > 1.01) renderer.setPixelRatio(1);
          else if (pr > .76 && fps < 30) renderer.setPixelRatio(.75);
          slowSec = 0;
        }
      }
      const n = Math.max(1, Math.ceil(dt / (1 / 60)));
      for (let i = 0; i < n; i++) step(dt / n);
      if (stopped) return;
      T += dt;
      shake *= Math.exp(-dt * 7);

      const nSh = placeScenery(T);
      let nSh2 = placeItems(nSh, T, dt);
      setI(shadows, nSh2++, px, 0.035, (BIKE ? -0.05 : 0) - pz, 0, 0, 0, (BIKE ? 1.0 : 0.95) / (1 + py * 0.6), 1, (BIKE ? 1.9 : 0.75) / (1 + py * 0.6));
      fin(shadows, nSh2);
      const ga = D - dist;
      arch.visible = ga < 185;
      arch.position.z = -ga;
      const scroll = state === 'run' ? speed : 0;
      stepParts(dt, scroll);
      stepRings(dt, 0);
      animPlayer(dt);

      // カメラ
      const sr = clamp(speed / M.v1, 0, 1);
      let tx, ty, tz, lx, ly, lz, tf2;
      if (state === 'howto') { tx = 2.5 + Math.sin(T * 0.3) * 0.3; ty = 2.3; tz = 5.0; lx = 0.3; ly = 1.3; lz = 0; tf2 = 56; }
      else if (state === 'goal') { const g = clamp(st - 0.5, 0, 1); tx = px + (px > 0.5 ? -1.8 : 1.8) * g; ty = 3.4 - 0.9 * g; tz = -pz + 6.0 - 0.6 * g; lx = px + (px > 0.5 ? -0.3 : 0.3) * g; ly = 1.2 + 0.35 * g; lz = -pz - 4 + 3 * g; tf2 = 58; }
      else { tx = px * 0.45; ty = BIKE ? 3.7 : 3.4; tz = BIKE ? 6.6 : 5.9; lx = px * 0.55; ly = 1.15; lz = -7; tf2 = 60 + 10 * sr; }
      const ck = 1 - Math.exp(-dt * (state === 'count' ? 2.2 : state === 'goal' ? 3.0 : 5));
      camX += (tx - camX) * ck; camY += (ty - camY) * ck; camZ += (tz - camZ) * ck;
      lookX += (lx - lookX) * ck; lookY += (ly - lookY) * ck; lookZ += (lz - lookZ) * ck;
      fov += (tf2 - fov) * (1 - Math.exp(-dt * 3));
      cam.fov = fov;
      cam.updateProjectionMatrix();
      cam.position.set(camX + (R() - 0.5) * shake, camY + py * 0.25 + (R() - 0.5) * shake, camZ);
      cam.lookAt(lookX, lookY + py * 0.35, lookZ);

      // 表示
      const r = remain();
      if (state === 'run' || state === 'count') {
        const late = r < 0;
        hudLabel.textContent = late ? '遅刻' : '始業まで';
        hudTime.textContent = (late ? '+' : '') + fmt(Math.abs(r) * RATE);
        timeChip.classList.toggle('late', late);
        timeChip.classList.toggle('hurry', !late && r < 6);
        hudProg.style.width = (clamp(dist / D, 0, 1) * 100).toFixed(1) + '%';
      }
      lines.style.opacity = state === 'run' ? clamp((sr - 0.55) * 2.4, 0, 0.9).toFixed(2) : '0';

      renderer.render(scene, cam);
      const info = renderer.info.render;
      const S = window.Dash.stats;
      S.calls = info.calls; S.triangles = info.triangles; S.fps = fps; S.state = state; S.dist = Math.round(dist); S.goal = D;
      S.maxCalls = Math.max(S.maxCalls || 0, info.calls);
      S.maxTris = Math.max(S.maxTris || 0, info.triangles);
    }

    function cleanup() {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      timers.forEach(clearTimeout);
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerup', onUp);
      root.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVis);
      startBtn.removeEventListener('click', begin);
      if (ro) ro.disconnect(); else window.removeEventListener('resize', resize);
      const geos = new Set(), mats = new Set();
      scene.traverse(o => {
        if (o.geometry) geos.add(o.geometry);
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => mats.add(m));
      });
      geos.add(bGeo);
      insts.forEach(m => m.dispose());
      geos.forEach(g => g.dispose());
      mats.forEach(m => {
        ['map', 'emissiveMap', 'alphaMap', 'gradientMap'].forEach(k => { if (m[k]) texs.add(m[k]); });
        m.dispose();
      });
      texs.forEach(tx => tx.dispose());
      skel.dispose();
      try { renderer.renderLists.dispose(); } catch (_) {}
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch (_) {}
      scene.clear();
      root.remove();
      window.Dash.stats.disposed = true;
    }

    window.Dash.stats = { maxCalls: 0, maxTris: 0 };
    raf = requestAnimationFrame(loop);
  }
})();
