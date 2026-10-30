// 結果のシェア画像（1080×1350 の PNG）を作って共有する
// 使い方：
//   Share.prepare(data)            … 結果画面を出したときに呼んでおく（先に画像を作っておく。iPhone で共有画面を確実に出すため）
//   Share.share(data)              … シェアボタンで呼ぶ。スマホは共有画面、PCや共有できないときは画像を保存
//                                    → Promise<'shared' | 'canceled' | 'downloaded'>
//   Share.makeImage(data)          … Promise<Blob>（PNG）
// data = { typeName: 'チャレンジャー', typeLine: '一文', typeIcon: 0〜3, support: 266, quiz: '4 / 6', url: '' }
window.Share = (() => {
  const W = 1080, H = 1350;
  const NAVY = '#141a3c', GOLD = '#f2c14e', CREAM = '#f3ead8';
  const DELA = '"Shippori Mincho B1", "Hiragino Mincho ProN", "Yu Mincho", serif';
  const ZEN = '"Zen Kaku Gothic New", "Hiragino Sans", "Yu Gothic", sans-serif';
  const TITLE = '大阪で生きてみた';
  const SUB = 'もし今年15歳だったら？';
  const TAG = '#大阪で生きてみた';
  const FILE_NAME = 'osaka-ikitemita.png';

  // 絵の場所は、このファイル（js/share.js）から見た ../img/types.jpg
  const BASE = (() => {
    try { return new URL('../', document.currentScript.src).href; } catch (_) { return ''; }
  })();

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const typeLabel = name => (/タイプ$/.test(name) ? name : name + 'タイプ');

  function shareText(d) {
    return '大阪で生きてみた、私は' + typeLabel(d.typeName || '') + 'でした。 ' + TAG;
  }

  // ---------- 読みこみ ----------
  let imgPromise = null;
  function loadTypes() {
    if (!imgPromise) {
      imgPromise = new Promise(res => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => { imgPromise = null; res(null); };
        img.src = BASE + 'img/types.jpg';
      });
    }
    return imgPromise;
  }

  async function ensureFonts(text) {
    if (!document.fonts) return;
    const jobs = [`800 100px ${DELA}`, `700 40px ${ZEN}`, `900 40px ${ZEN}`]
      .map(f => document.fonts.load(f, text).catch(() => {}));
    // 文字に必要な分だけ読みこんでから描く（通信が遅くても4秒で先へ進む）
    await Promise.race([Promise.all(jobs).then(() => document.fonts.ready), wait(4000)]);
  }

  // ---------- 描く道具 ----------
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // 大きさを指定幅に収まるまで小さくする
  function fitFont(c, text, weight, size, family, maxW) {
    for (; size > 20; size -= 2) {
      c.font = `${weight} ${size}px ${family}`;
      if (c.measureText(text).width <= maxW) break;
    }
    return size;
  }

  // 日本語の折り返し（句読点や閉じかっこを行頭に来させない）
  function wrap(c, text, maxW, maxLines) {
    const NG = '、。，．・ー」』）！？!?)…ぁぃぅぇぉっゃゅょァィゥェォッャュョ';
    const lines = [];
    let line = '';
    for (const ch of text) {
      if (c.measureText(line + ch).width > maxW && line) {
        if (NG.includes(ch)) { const last = line.slice(-1); line = line.slice(0, -1); lines.push(line); line = last + ch; }
        else { lines.push(line); line = ch; }
      } else line += ch;
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      lines.length = maxLines;
      let l = lines[maxLines - 1];
      while (l && c.measureText(l + '…').width > maxW) l = l.slice(0, -1);
      lines[maxLines - 1] = l + '…';
    }
    return lines;
  }

  // 大きさのちがう文字をつないで、まん中そろえで1行に描く
  function drawRun(c, parts, cx, y) {
    let total = 0;
    parts.forEach(p => { c.font = p.font; p.w = c.measureText(p.text).width; total += p.w + (p.gap || 0); });
    let x = cx - total / 2;
    c.textAlign = 'left';
    parts.forEach(p => { c.font = p.font; c.fillStyle = p.color; c.fillText(p.text, x, y); x += p.w + (p.gap || 0); });
    c.textAlign = 'center';
  }

  // ---------- 1枚描く ----------
  function draw(c, d, img) {
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';

    // 背景：紺＋まん中に青い光、下に夕焼けのぬくもり
    c.fillStyle = NAVY; c.fillRect(0, 0, W, H);
    let g = c.createRadialGradient(540, 520, 40, 540, 520, 640);
    g.addColorStop(0, 'rgba(80, 98, 196, .42)'); g.addColorStop(1, 'rgba(80, 98, 196, 0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    g = c.createRadialGradient(540, H + 120, 40, 540, H + 120, 760);
    g.addColorStop(0, 'rgba(242, 128, 70, .30)'); g.addColorStop(1, 'rgba(242, 128, 70, 0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);

    // 小さな星（毎回同じ位置）
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) {
      const x = 60 + rnd() * (W - 120), y = 60 + rnd() * 760, r = .8 + rnd() * 1.8;
      c.fillStyle = `rgba(255, 244, 214, ${.15 + rnd() * .45})`;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }

    // 金の細いわく
    c.strokeStyle = 'rgba(242, 193, 78, .5)'; c.lineWidth = 2;
    roundRect(c, 36, 36, W - 72, H - 72, 30); c.stroke();
    c.strokeStyle = 'rgba(242, 193, 78, .18)'; c.lineWidth = 1;
    roundRect(c, 48, 48, W - 96, H - 96, 22); c.stroke();

    // サブコピー（両わきに短い線）
    c.font = `700 34px ${ZEN}`;
    c.fillStyle = 'rgba(255, 255, 255, .78)';
    c.fillText(SUB, 540, 128);
    const sw = c.measureText(SUB).width / 2;
    c.strokeStyle = 'rgba(242, 193, 78, .7)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(540 - sw - 70, 116); c.lineTo(540 - sw - 22, 116); c.moveTo(540 + sw + 22, 116); c.lineTo(540 + sw + 70, 116); c.stroke();

    // ロゴ
    c.save();
    c.shadowColor = 'rgba(0, 0, 0, .45)'; c.shadowOffsetY = 6; c.shadowBlur = 14;
    fitFont(c, TITLE, 800, 96, DELA, 900);
    c.fillStyle = GOLD;
    c.fillText(TITLE, 540, 236);
    c.restore();

    // タイプの絵（丸く切りぬき）
    const cx = 540, cy = 520, R = 196;
    c.strokeStyle = 'rgba(242, 193, 78, .35)'; c.lineWidth = 2;
    c.beginPath(); c.arc(cx, cy, R + 24, 0, Math.PI * 2); c.stroke();
    c.save();
    c.shadowColor = 'rgba(0, 0, 0, .5)'; c.shadowBlur = 40; c.shadowOffsetY = 12;
    c.fillStyle = CREAM;
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
    c.restore();
    if (img) {
      const i = Math.max(0, Math.min(3, (d.typeIcon | 0)));
      const q = img.naturalWidth / 2;
      c.save();
      c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.clip();
      c.drawImage(img, (i % 2) * q, Math.floor(i / 2) * q, q, q, cx - R, cy - R, R * 2, R * 2);
      c.restore();
    }
    c.strokeStyle = GOLD; c.lineWidth = 9;
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();

    // タイプ名
    c.font = `700 32px ${ZEN}`;
    c.fillStyle = GOLD;
    c.fillText('わたしの人生タイプ', 540, 800);
    const name = d.typeName || '';
    c.save();
    c.shadowColor = 'rgba(0, 0, 0, .35)'; c.shadowOffsetY = 4; c.shadowBlur = 10;
    fitFont(c, name, 800, 104, DELA, 900);
    c.fillStyle = '#fff';
    c.fillText(name, 540, 906);
    c.restore();

    // 一文
    c.font = `700 36px ${ZEN}`;
    c.fillStyle = 'rgba(255, 255, 255, .88)';
    const line = d.typeLine || '';
    let lines = wrap(c, line, 860, 2);
    if (lines.length === 2 && !/…$/.test(lines[1])) {
      const total = c.measureText(line).width;
      // まん中あたりに「、」があれば、そこで切る（言葉の途中で切らない）
      let best = null;
      for (let k = 0; k < line.length; k++) {
        if (!'、，,'.includes(line[k])) continue;
        const a = line.slice(0, k + 1), b = line.slice(k + 1), wa = c.measureText(a).width;
        if (!b || wa > 860 || c.measureText(b).width > 860 || wa < total * .3 || wa > total * .7) continue;
        if (!best || Math.abs(wa - total / 2) < Math.abs(best.wa - total / 2)) best = { a, b, wa };
      }
      if (best) lines = [best.a, best.b];
      else { // 無ければ、2行目が短く残らないよう長さをそろえる
        for (let w = total / 2 + 20; w < 860; w += 20) {
          const t = wrap(c, line, w, 3);
          if (t.length === 2) { lines = t; break; }
        }
      }
    }
    lines.forEach((l, k) => c.fillText(l, 540, 974 + k * 52));

    // 数字のカード
    const cardY = 1074, cardH = 150, cardW = 440, gap = 30, x0 = (W - cardW * 2 - gap) / 2;
    [x0, x0 + cardW + gap].forEach(x => {
      c.fillStyle = 'rgba(255, 255, 255, .06)';
      roundRect(c, x, cardY, cardW, cardH, 24); c.fill();
      c.strokeStyle = 'rgba(242, 193, 78, .38)'; c.lineWidth = 2;
      roundRect(c, x, cardY, cardW, cardH, 24); c.stroke();
    });
    c.font = `700 27px ${ZEN}`;
    c.fillStyle = 'rgba(255, 255, 255, .72)';
    c.fillText('受けられる支援の目安', x0 + cardW / 2, cardY + 46);
    c.fillText('大阪ツウ度', x0 + cardW + gap + cardW / 2, cardY + 46);

    const money = Number(d.support);
    const moneyText = isFinite(money) ? Math.round(money).toLocaleString('ja-JP') : String(d.support || '');
    drawRun(c, [
      { text: '約', font: `900 34px ${ZEN}`, color: '#fff', gap: 8 },
      { text: moneyText, font: `800 74px ${DELA}`, color: GOLD, gap: 8 },
      { text: '万円', font: `900 34px ${ZEN}`, color: '#fff' },
    ], x0 + cardW / 2, cardY + 126);

    const m = String(d.quiz || '').match(/(\d+)\s*\/\s*(\d+)/);
    drawRun(c, m ? [
      { text: m[1], font: `800 74px ${DELA}`, color: GOLD, gap: 12 },
      { text: '/ ' + m[2], font: `900 40px ${ZEN}`, color: '#fff' },
    ] : [{ text: String(d.quiz || ''), font: `800 60px ${DELA}`, color: GOLD }], x0 + cardW + gap + cardW / 2, cardY + 126);

    // ハッシュタグ
    c.font = `700 30px ${ZEN}`;
    c.fillStyle = 'rgba(242, 193, 78, .8)';
    c.fillText(TAG, 540, 1288);
  }

  function toBlob(canvas) {
    return new Promise((res, rej) => {
      try { canvas.toBlob(b => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'); }
      catch (e) { rej(e); }
    });
  }

  async function build(d) {
    const text = TITLE + SUB + TAG + (d.typeName || '') + (d.typeLine || '') + '約万円受けられる支援の目安大阪ツウ度わたしの人生タイプ0123456789,/…';
    const [img] = await Promise.all([loadTypes(), ensureFonts(text)]);
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const c = canvas.getContext('2d');
    draw(c, d, img);
    try { return await toBlob(canvas); }
    catch (_) { // file:// で絵を使うと書き出せないので、絵なしで描きなおす
      c.clearRect(0, 0, W, H);
      draw(c, d, null);
      return toBlob(canvas);
    }
  }

  // 同じ data なら作った画像を使いまわす
  let cacheKey = '', cache = null;
  function makeImage(d) {
    d = d || {};
    const key = JSON.stringify([d.typeName, d.typeLine, d.typeIcon, d.support, d.quiz]);
    if (key !== cacheKey || !cache) {
      cacheKey = key;
      cache = build(d).catch(e => { cache = null; throw e; });
    }
    return cache;
  }
  function prepare(d) { makeImage(d).catch(() => {}); }

  function download(blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = FILE_NAME; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function share(d) {
    d = d || {};
    const blob = await makeImage(d);
    const text = shareText(d);
    const mobile = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || /iPhone|iPad|Android/i.test(navigator.userAgent);
    if (mobile && navigator.share && window.File) {
      const file = new File([blob], FILE_NAME, { type: 'image/png' });
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text: d.url ? text + '\n' + d.url : text });
          return 'shared';
        } catch (e) {
          if (e && e.name === 'AbortError') return 'canceled';
          // それ以外（操作から時間がたった等）は保存にまわす
        }
      }
    }
    download(blob);
    return 'downloaded';
  }

  return { makeImage, prepare, share, shareText };
})();
