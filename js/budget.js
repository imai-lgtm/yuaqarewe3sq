// 大阪のお財布 — 2年間の予算やりくり（ミニゲーム）
//
// 呼び出し方：
//   const r = await window.Budget.run(host, { sfx: name => {}, buzz: ms => {}, seed: 数（任意・テスト用） });
//   host … 空の div（position: relative）。中身はこのファイルが作り、終わったら全部片づける。
//   sfx の name … 'tap' 'choose' 'coin' 'wrong' 'clear' 'card'
//   r = { typeName, typeLine, smile（笑顔の府民の人数）, hearts, manzoku, mirai, debt, years: [各年の記録] }
//
// 遊び方：25歳の主人公が「もし自分が知事やったら？」と想像する2年間。毎年、府民4人からお願いが1つずつ届く。
//   お金はいつも足りない（全部かなえると10コイン前後、使えるのは6〜10コイン）。かなえるとその人のハート+1、見送ると−1。
//   お金をつくる手（改革・税金・借金）は1年に1つだけ。目標は「2年後、ハート3つ以上の府民を何人残せるか」。
// 決まり：政策の正解は作らない（どの手でも4人を笑顔にできる）。どの道にもよい面と課題がある書き方にする。
// 党・政治家の名前は出さない。お金はゲーム用に「コイン」に単純化している。
(function () {
  'use strict';

  // 画像の場所（このファイルの位置から決める。game/index.html からでも dev/ のテストからでも同じ）
  const IMG = (() => {
    try { const s = document.currentScript && document.currentScript.src; if (s) return new URL('../img/', s).href; } catch (e) { /* なにもしない */ }
    return 'img/';
  })();

  // ---------- 分野 ----------
  const KINDS = {
    kyoiku:   { label: '教育',       color: '#3d6fd9', glow: '学校に灯りがともった' },
    kosodate: { label: '子育て',     color: '#e8577d', glow: '保育園がにぎやかに' },
    anshin:   { label: '医療・福祉', color: '#16a37f', glow: '病院と介護の施設が明るく' },
    sonae:    { label: 'そなえ',     color: '#b48a16', glow: '堤防と川ぞいが整った' },
    machi:    { label: 'まちづくり', color: '#f07b2f', glow: '公園と駅前に人が集まる' },
  };
  // 街の絵の中の場所（%）。rx は横幅に対する半径（縦は 1.5 倍して円に近づける）
  const ZONES = {
    kyoiku:   [{ x: 17, y: 62, r: 21 }],
    kosodate: [{ x: 83, y: 80, r: 15 }],
    anshin:   [{ x: 17, y: 28, r: 17 }],
    sonae:    [{ x: 85, y: 46, r: 17 }],
    machi:    [{ x: 52, y: 62, r: 17 }, { x: 50, y: 29, r: 14 }],
  };

  // ---------- 府民 ----------
  const PEOPLE = [
    { id: 'mio', name: 'ミオ', who: '高校2年生・17歳', col: 0, wants: ['kyoiku', 'machi'],
      idle: '今年は、うちらにはあんまり関係なかったかな。', want: '学校のことも、もうちょっと見てほしいな。',
      endGood: 'この2年で、大阪がちょっと好きになったかも。', endBad: 'うちらの将来のこと、もっと考えてほしかったな。' },
    { id: 'kenta', name: 'ケンタ', who: '会社員・2児の父・34歳', col: 1, wants: ['kosodate'],
      idle: '可もなく不可もなく、かな。', want: '子育ての支えも、忘れんといてほしい。',
      endGood: '子育てしながらでも、ここで暮らしていけそうや。', endBad: 'この2年、子育ては楽にならへんかったな。' },
    { id: 'yukie', name: 'ユキエ', who: '商店街の店主・52歳', col: 2, wants: ['machi'],
      idle: 'お店のまわりは、いつもどおりやね。', want: '商店街にも、もうちょっと目を向けてほしいわ。',
      endGood: '商店街も、まだまだこれからやで。', endBad: 'お店を続けるのは、正直しんどかったわ。' },
    { id: 'shigeru', name: 'シゲル', who: '年金暮らし・74歳', col: 3, wants: ['anshin', 'sonae'],
      idle: 'まあ、ぼちぼちやな。', want: '年寄りの暮らしのことも、頼みますよ。',
      endGood: '年をとっても、安心して暮らせるまちやな。', endBad: '年寄りには、ちょっと暮らしにくくなったかな。' },
  ];
  const MIXED = '良いことも、困ったことも、両方あったな。';

  // ---------- お金をつくる ----------
  // ic: ['i', n] = img/icons.jpg（4×3）／['j', n] = img/icon2_n.jpg／['c', n] = budget/cards.jpg／['e', n] = budget/events.jpg
  // coin：毎年入るお金（every）または今年だけ（shakkin）。delay：効果が出るまでの年数
  // react：選んだ年に、その人のハートが動く（数字はハートの増減）
  const FUNDS = [
    { id: 'teisu', ic: ['i', 4], label: '議員の数・給料を減らす', coin: 1, delay: 0,
      good: '「まず自分たちから」の姿勢を示せる', bad: '浮くお金は小さい。議会に届く声が減るという心配も',
      react: { yukie: [1, 'まず自分らから、いうのは筋が通ってるね。'], shigeru: [-1, '地元の声を聞いてくれる人が減らんか、ちょっと心配や。'] } },
    { id: 'tougou', ic: ['i', 2], label: '府と市の仕事をまとめる', coin: 2, delay: 1,
      good: '重なっている仕事を整理できる', bad: '準備に1年かかる。効果の大きさには議論がある',
      react: { kenta: [1, '窓口や手続きが分かりやすくなるなら助かる。'], shigeru: [-1, '慣れた窓口が変わるのは、ちょっと不安やな。'] } },
    { id: 'minei', ic: ['i', 3], label: '地下鉄などの経営を民間に', coin: 2, delay: 1,
      good: '民間のやり方で、効率よく経営できる', bad: '準備に1年かかる。利用の少ないサービスをどう守るかが課題',
      react: { mio: [1, '駅がきれいで便利になったらうれしい！'], shigeru: [-1, '利用の少ないバスが減らんか、気になるな。'] } },
    { id: 'minaoshi', ic: ['i', 9], label: '施設やイベントを見直す', coin: 2, delay: 0,
      good: '使う人の少ないものを整理できる', bad: 'よく使っていた人には、さびしい変化',
      react: { yukie: [1, 'ムダが減るのは、ええことやと思うよ。'], shigeru: [-2, 'よう通ってた施設がなくなるのは、さびしいなあ。'] } },
    { id: 'zouzei', ic: ['j', 0], label: '税金を上げる', coin: 2, delay: 0,
      good: 'すぐに、確実な財源になる', bad: 'みんなの負担が毎年続く',
      react: { yukie: [-2, '売り上げに響くわ……。お客さんの財布もきびしいのに。'], kenta: [-1, '家計がまた、きつくなるなあ。'], shigeru: [1, 'サービスが続くなら、ある程度は仕方ないやろ。'] } },
    { id: 'shakkin', ic: ['j', 1], label: '借金をする', coin: 4, delay: 0, loan: true,
      good: '今年だけ、大きく使える', bad: '利子もついて6コインに。翌年から毎年2ずつ返す',
      react: { yukie: [1, '大きな工事で、まちが元気になるならええね。'], mio: [-1, 'それって、大人になったうちらが返すってこと？'] } },
  ];

  // ---------- 府民のお願い（1人3つ。毎年1つずつ、順番はくじ）----------
  // id：使い道。ask：お願い。yes / no：かなえた・見送ったときのひとこと
  const REQS = {
    mio: [
      { id: 'koukou', ask: '行きたい私立があるけど、学費が心配で……。', yes: '学校選びの幅が広がった！ ありがとう。', no: 'やっぱり、学費で進路を決めるしかないんかな。' },
      { id: 'ict', ask: '授業、もっと分かりやすくしてほしいな。', yes: 'タブレットの授業、分かりやすい！', no: '授業は前のまま。まあ、しゃあないか。' },
      { id: 'kouen', ask: '放課後に、友だちとのんびりできる場所がほしい。', yes: '新しい公園、もうお気に入りの場所。', no: '放課後の居場所、やっぱりないなあ。' },
    ],
    kenta: [
      { id: 'hoiku', ask: '保育所に申しこんだけど、空きがないんです。', yes: '保育所に入れた！ これで働き続けられる。', no: '夫婦で交代で、仕事を休む毎日です……。' },
      { id: 'iryo', ask: '子どもがよく熱を出して、通院代がかさむんです。', yes: '夜中の熱でも、お金を気にせず病院に行ける。', no: '病院に行くか、毎回まよってしまう。' },
      { id: 'taishin', ask: '子どもの学校、古いけど地震は大丈夫やろか。', yes: '校舎が丈夫になって、ひと安心や。', no: '古い校舎、やっぱり心配や。' },
    ],
    yukie: [
      { id: 'shoten', ask: '商店街のお客さん、減る一方なんよ。', yes: 'お客さんが戻ってきた！ ありがたいわ。', no: 'またシャッターが一枚、下りてしもた。' },
      { id: 'hoshu', ask: '店の前の水道管、古くて心配なんよ。', yes: '工事してくれて、ひと安心やわ。', no: '水道管、いつ破れるかヒヤヒヤしてる。' },
      { id: 'kouen', ask: '商店街の近くに、人が集まる広場があったらねえ。', yes: '広場ができて、人通りが増えたわ。', no: '人が集まる場所、なかなかできへんね。' },
    ],
    shigeru: [
      { id: 'kaigo', ask: '一人暮らしやから、もしものときが心配でな。', yes: '見守りの人が来てくれて、心強いわ。', no: '一人の夜は、やっぱり心細いな。' },
      { id: 'kyukyu', ask: 'この前、救急車がなかなか来んでな……。', yes: '救急がすぐ来てくれるようになった。安心や。', no: '救急の体制、変わらんままやなあ。' },
      { id: 'teibou', ask: '川の近くに住んでるから、大雨がこわいんや。', yes: '堤防が整って、大雨の夜も眠れるわ。', no: '雨の音がするたびに、川を見に行ってしまう。' },
    ],
  };
  const HEART0 = 3, HEART_MAX = 5, SMILE = 3;

  // ---------- 使い道 ----------
  // every：毎年続く制度（続けるあいだ毎年お金がかかる）。mz：くらしの満足 / mr：未来の安心
  const SPENDS = [
    { id: 'koukou', kind: 'kyoiku', ic: ['i', 0], label: '高校の授業料を支援', sub: '家の収入で進路が狭まらないように', cost: 2, every: true, mz: 1, mr: 1,
      react: { mio: [2, '学校選びの幅が広がる！ ありがたい。'], kenta: [1, 'うちの子が大きくなっても、続いてたらええな。'] },
      stop: { mio: [-2, '支援がなくなるなんて……進路を考え直さなあかん。'] } },
    { id: 'ict', kind: 'kyoiku', ic: ['c', 6], label: '学校にICTと先生を', sub: '授業の質を上げる。成果が見えるのは先', cost: 3, mz: 0, mr: 2,
      react: { mio: [1, '授業が分かりやすくなった気がする。'], kenta: [1, '子どもの学ぶ環境がよくなるのはうれしい。'] } },
    { id: 'hoiku', kind: 'kosodate', ic: ['i', 6], label: '保育所を増やす', sub: '待たずに預けられるように', cost: 3, mz: 2, mr: 1,
      react: { kenta: [2, '待たずに預けられる！ 共働きでも何とかなる。'], yukie: [1, '若い家族が増えたら、商店街もにぎわうね。'] } },
    { id: 'iryo', kind: 'kosodate', ic: ['i', 7], label: '子どもの医療費を支援', sub: '通院の負担を軽く', cost: 2, every: true, mz: 2, mr: 0,
      react: { kenta: [2, '夜中の熱でも、お金を気にせず病院に行ける。'] },
      stop: { kenta: [-2, '医療費の支援、なくなるん？ 困ったなあ。'] } },
    { id: 'kaigo', kind: 'anshin', ic: ['c', 1], label: '介護と見守りを手厚く', sub: '一人暮らしでも安心して暮らせるように', cost: 2, every: true, mz: 2, mr: 0,
      react: { shigeru: [2, '一人暮らしでも、見守ってもらえると安心や。'], kenta: [1, '離れて住む親のことを思うと、ありがたい。'] },
      stop: { shigeru: [-2, '見守りがなくなると、心細いなあ。'] } },
    { id: 'kyukyu', kind: 'anshin', ic: ['c', 0], label: '救急と病院の体制を強く', sub: 'いざというとき、すぐ診てもらえる', cost: 3, mz: 1, mr: 1,
      react: { shigeru: [1, '救急車がすぐ来てくれるのは心強いな。'], kenta: [1, '子どもの急な病気でも、安心できる。'] } },
    { id: 'teibou', kind: 'sonae', ic: ['c', 2], label: '堤防と川を整える', sub: '大雨への備え。ふだんは効果が見えにくい', cost: 3, mz: 0, mr: 3,
      react: { shigeru: [1, '川の近くに住んでるから、心強いわ。'], yukie: [0, '目には見えにくいけど、大事なんやろな。'] } },
    { id: 'hoshu', kind: 'sonae', ic: ['c', 4], label: '橋と水道管の補修', sub: '古くなった設備を早めに直す', cost: 2, mz: 0, mr: 2,
      react: { yukie: [0, '工事中はちょっと不便やけど、しゃあないね。'] } },
    { id: 'taishin', kind: 'sonae', ic: ['e', 6], label: '学校や建物の耐震化', sub: '大きな地震への備え', cost: 2, mz: 0, mr: 2,
      react: { kenta: [1, '子どもの学校が丈夫になるのは安心や。'] } },
    { id: 'hensai', kind: 'sonae', ic: ['c', 7], label: '借金を早めに返す', sub: '借金の残りが2減る。今の暮らしは変わらない', cost: 2, mz: 0, mr: 2, payback: 2,
      react: { mio: [1, '将来の負担が減るのは、ありがたいかも。'], yukie: [-1, '今年は、なんにも変わらへんなあ。'] } },
    { id: 'kouen', kind: 'machi', ic: ['i', 10], label: '公園と緑を増やす', sub: '暮らしの心地よさ。手入れの費用もいる', cost: 2, mz: 2, mr: 0,
      react: { mio: [1, '公園でのんびりできる場所が増えた！'], shigeru: [1, '散歩が楽しみになったわ。'] } },
    { id: 'shoten', kind: 'machi', ic: ['c', 3], label: '駅前と商店街を元気に', sub: 'にぎわいで、翌年の税金が1コイン増える', cost: 3, mz: 1, mr: 0, bonus: 1,
      react: { yukie: [2, 'お客さんが戻ってきた！ ありがたいわ。'], mio: [1, '駅前に寄り道できる店が増えた。'] } },
    { id: 'kurashi', kind: 'anshin', ic: ['c', 5], label: '物価高の暮らし支援', sub: '今の家計を助ける、1回きりの支え', cost: 2, mz: 2, mr: 0, only: 'bukka',
      react: { kenta: [2, 'ちょっとでも家計が助かるのはありがたい。'], yukie: [1, 'お客さんの財布がゆるむと、うちも助かる。'] } },
  ];

  // ---------- 出来事 ----------
  // need：対応になる使い道（どれか1つ）。miss：対応しなかったときの翌年の影響。good：よい出来事
  const EVENTS = [
    { id: 'bukka', ic: 0, title: '物価が上がった', text: '食べ物や電気代が値上がりし、家計が苦しい家庭が増えています。工事の費用も上がりました。',
      fx: '今年は、1回きりの使い道がどれも1コイン高い', costUp: 1, need: ['kurashi'], needText: '「物価高の暮らし支援」',
      risk: '翌年、くらしの満足が下がるかも',
      miss: { mz: -2, text: '家計の苦しさが続き、くらしの満足が下がりました（満足 −2）', react: { kenta: [-2, '去年から、家計がずっときつい……。'], yukie: [-1, 'お客さんが財布のひもを締めてるわ。'] } },
      ok: '去年の暮らし支援で、家計の苦しさが少しやわらぎました。' },
    { id: 'ooame', ic: 1, title: '大雨で川があふれそうに', text: '記録的な大雨。今回は大きな被害は出ませんでしたが、川の近くに住む人は不安を感じています。',
      need: ['teibou'], needText: '「堤防と川を整える」', risk: '翌年の大雨で、復旧にお金がかかるかも',
      miss: { coin: -3, mr: -1, text: '翌年も大雨が。浸水の被害が出て、復旧に3コインかかりました（未来 −1）', react: { shigeru: [-2, '家の前まで水が来た。こわかったわ。'] } },
      ok: '翌年の大雨でも、整えた堤防のおかげで被害は出ませんでした。' },
    { id: 'shoshi', ic: 2, title: '子どもの数が減ってきた', text: '生まれる子どもが年々少なくなっています。このままだと、働く世代も減っていきます。',
      need: ['hoiku', 'iryo'], needText: '子育ての使い道（保育所・医療費）', risk: '子育て世代が府の外へ移り、府に入る税金が毎年減るかも',
      miss: { income: -1, mr: -1, text: '子育て世代が府の外へ。府に入る税金が毎年1コイン減ることに（未来 −1）', react: { kenta: [-1, '友だちの家族、子育てしやすい県に引っ越していったわ。'] } },
      ok: '子育ての支えが評判になり、若い家族が少し増えました。' },
    { id: 'korei', ic: 3, title: '高齢の人が増えた', text: '一人で暮らすお年寄りが増えています。介護や医療の担い手も足りなくなってきました。',
      need: ['kaigo', 'kyukyu'], needText: '医療・福祉の使い道（介護・救急）', risk: '困りごとが大きくなり、後でお金がかかるかも',
      miss: { coin: -2, text: '困りごとが大きくなってから対応することになり、2コインかかりました', react: { shigeru: [-2, '近所の一人暮らしの人が、倒れてしもてな……。'] } },
      ok: '早めの見守りで、大きな困りごとになる前に支えられました。' },
    { id: 'rouka', ic: 4, title: '古い橋や水道管が傷んできた', text: '何十年も前に作った橋や水道管が古くなり、あちこちで点検の結果が気になり始めました。',
      need: ['hoshu'], needText: '「橋と水道管の補修」', risk: '傷みが進み、直すお金が増えるかも',
      miss: { coin: -3, text: '傷みが進み、水道管が破れる事故が。直すのに3コインかかりました', react: { yukie: [-1, '断水で、お店を半日閉めたんよ。'] } },
      ok: '早めの補修で、大きな事故を防げました。' },
    { id: 'jishin', ic: 6, title: '大きな地震への注意が高まった', text: '専門家が、大きな地震への備えを呼びかけています。古い建物も少なくありません。',
      need: ['taishin'], needText: '「学校や建物の耐震化」', risk: '不安が残り、未来の安心が下がるかも',
      miss: { mr: -2, text: '備えが進まず、未来の安心が下がりました（未来 −2）', react: { kenta: [-1, '子どもの学校、地震で大丈夫なんかな。'] } },
      ok: '耐震化が進み、地震への不安が少し小さくなりました。' },
    { id: 'kankou', ic: 5, title: '観光客が増えた', text: '国内外からの観光客が大きく増え、まちに活気が出ています。お店のにぎわいで、府に入る税金も今年だけ +2コイン。',
      good: true, coin: 2, need: ['shoten'], needText: '「駅前と商店街を元気に」で、にぎわいを生かせます', risk: '受け入れが追いつかない、という声が出るかも',
      miss: { react: { yukie: [-1, '人は来るのに、受け入れの準備が追いつかへんわ。'], shigeru: [-1, '道も電車も混んで、ちょっと住みにくなったな。'] }, text: '観光客は増え続けましたが、混雑を気にする声も出ています。' },
      ok: '整えた駅前に、観光客も地元の人も集まっています。' },
    { id: 'keiki', ic: 7, title: '景気がよくなった', text: 'お店や会社の売り上げが伸びて、府に入る税金が増えました（今年だけ +2コイン）。今に使うか、来年のためにとっておくか。',
      good: true, coin: 2, need: [], needText: '' },
  ];

  const TYPES = {
    kyoiku:   ['教育投資型', '学びにお金を回しました。若い人のチャンスは広がりますが、成果が見えるまでには時間がかかります。'],
    kosodate: ['子育て応援型', '子育て世代を手厚く支えました。若い家族は助かる一方、ほかの世代からは「こちらも」という声も出ます。'],
    anshin:   ['安心くらし型', '医療や介護など、今の暮らしの安心を大事にしました。高齢化が進むほど、続ける費用は大きくなります。'],
    sonae:    ['未来そなえ型', '災害や借金など、将来への備えを大事にしました。安心は増えますが、今の暮らしの変化は感じにくい道です。'],
    machi:    ['まちづくり型', '公園やにぎわいなど、まちの心地よさを大事にしました。目に見える変化の一方、ほかの分野は後回しになりがちです。'],
    bal:      ['バランス型', 'いろいろな分野に少しずつ回しました。不満は出にくい一方、大きく変わった実感は出にくい道です。'],
  };
  const HOW = {
    kaikaku: '改革でお金をつくりました。効果が出るまで時間がかかり、反対する人への説明も必要です。',
    zouzei: '税金でお金をつくりました。確実な財源になる一方、みんなの負担は毎年続きます。',
    shakkin: '借金でお金をつくりました。今できることが増える一方、返すのは未来の大阪です。',
    none: 'はじめのお金だけで、やりくりしました。できることは限られますが、負担も増やしませんでした。',
  };

  const INCOME = 8, YEARS = 2, PICKS = 1;
  const FD = Object.fromEntries(FUNDS.map(f => [f.id, f]));
  const SD = Object.fromEntries(SPENDS.map(s => [s.id, s]));

  // ---------- 小さな道具 ----------
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sgn = n => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);
  function icon(ic, cls) {
    const [t, n] = ic;
    let st;
    if (t === 'i') st = `background-image:url(${IMG}icons.jpg);background-size:400% 300%;background-position:${(n % 4) / 3 * 100}% ${Math.floor(n / 4) / 2 * 100}%`;
    else if (t === 'j') st = `background-image:url(${IMG}icon2_${n}.jpg);background-size:cover;background-position:center`;
    else st = `background-image:url(${IMG}budget/${t === 'c' ? 'cards' : 'events'}.jpg);background-size:400% 200%;background-position:${(n % 4) / 3 * 100}% ${Math.floor(n / 4) * 100}%`;
    return `<span class="${cls || 'bgt-ic'}" style="${st}" aria-hidden="true"></span>`;
  }
  const face = (p, mood) => `<span class="bgt-face" style="background-image:url(${IMG}budget/faces.jpg);background-position:${p.col / 3 * 100}% ${mood < 0 ? 100 : 0}%" aria-hidden="true"></span>`;
  const coinHtml = n => `<span class="bgt-coin" aria-hidden="true"></span>${n}`;
  const mini = (p, mood) => `<span class="bgt-mini" style="background-image:url(${IMG}budget/faces.jpg);background-position:${p.col / 3 * 100}% ${mood < 0 ? 100 : 0}%" aria-hidden="true"></span>`;
  const heartsHtml = h => `<span class="bgt-hearts" aria-label="ハート${h}">${Array.from({ length: HEART_MAX }, (_, i) => `<i class="${i < h ? 'on' : ''}"></i>`).join('')}</span>`;
  const PD = Object.fromEntries(PEOPLE.map(p => [p.id, p]));
  // react（{人: [増減, ひとこと]}）を小さい顔の札にする
  const reactChips = react => Object.keys(react || {}).filter(id => react[id][0]).map(id => {
    const v = react[id][0];
    return `<i class="bgt-rc ${v > 0 ? 'up' : 'down'}">${mini(PD[id], v)}${PD[id].name}<b><i class="h">♥</i>${v > 0 ? '+' : '−'}${Math.abs(v)}</b></i>`;
  }).join('');

  let running = null;
  function run(host, opts) {
    if (running) return running;
    running = new Promise(resolve => {
      try { start(host, opts || {}, r => { running = null; resolve(r); }); }
      catch (e) {
        console.error(e); running = null;
        resolve({ typeName: TYPES.bal[0], typeLine: TYPES.bal[1], smile: 0, manzoku: 0, mirai: 0, debt: 0, years: [], skipped: true });
      }
    });
    return running;
  }

  function start(host, opts, done) {
    const sfx = n => { try { if (opts.sfx) opts.sfx(n); } catch (e) { /* なにもしない */ } };
    const buzz = ms => { try { if (opts.buzz) opts.buzz(ms); } catch (e) { /* なにもしない */ } };
    const rand = rng(opts.seed != null ? +opts.seed : (Date.now() ^ Math.floor(Math.random() * 1e9)));
    const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    let dead = false;
    const timers = new Set();
    const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!dead) fn(); }, ms); timers.add(id); return id; };
    const wait = ms => new Promise(r => later(r, reduce ? Math.min(ms, 60) : ms));
    const anims = new Set();

    // ---------- 状態 ----------
    const S = {
      year: 0, manzoku: 10, mirai: 10, wallet: 0,
      carry: 0, incomeMod: 0, bonus: 0,
      loans: [{ left: 4, per: 2, from: 1 }],   // 前からある借金（2年で返し終わる）
      active: {},            // 改革・増税：効果が出はじめる年
      cont: new Set(),       // 続けている制度
      invest: { kyoiku: 0, kosodate: 0, anshin: 0, sonae: 0, machi: 0 },
      shown: { kyoiku: 0, kosodate: 0, anshin: 0, sonae: 0, machi: 0, all: 0 },
      events: pickEvents(),
      pending: null,         // 去年の出来事の結果
      people: Object.fromEntries(PEOPLE.map(p => [p.id, 0])),
      sad: Object.fromEntries(PEOPLE.map(p => [p.id, 0])),
      hearts: Object.fromEntries(PEOPLE.map(p => [p.id, HEART0])),
      reqs: pickReqs(),      // 年ごとの {人: お願い}
      years: [],
    };
    let Y = null;  // 今年の記録

    function pickEvents() {
      const pool = EVENTS.slice();
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      const out = []; let good = 0;
      for (const e of pool) {
        if (e.good && good >= 1) continue;
        if (e.good) good++;
        out.push(e);
        if (out.length === YEARS) break;
      }
      // よい出来事は最初の年にしない（まずは困りごとから）
      if (out[0].good) [out[0], out[1]] = [out[1], out[0]];
      return out;
    }
    function pickReqs() {
      const per = {};
      PEOPLE.forEach(p => {
        const a = REQS[p.id].slice();
        for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
        per[p.id] = a;
      });
      return Array.from({ length: YEARS }, (_, y) => Object.fromEntries(PEOPLE.map(p => [p.id, per[p.id][y]])));
    }
    const debt = () => S.loans.reduce((a, l) => a + l.left, 0);
    const smileCount = () => PEOPLE.filter(p => S.hearts[p.id] >= SMILE).length;
    const heartSum = () => PEOPLE.reduce((a, p) => a + S.hearts[p.id], 0);

    // ---------- 土台 ----------
    const root = document.createElement('div');
    root.className = 'bgt';
    root.innerHTML = `
      <div class="bgt-bar" hidden>
        <div class="bgt-years" data-years></div>
        <div class="bgt-wallet" data-wallet-box><span class="bgt-coin big" aria-hidden="true"></span><b data-wallet>0</b></div>
        <div class="bgt-gauges">
          <div><small>未来の安心</small><b data-g="mirai">10</b></div>
          <div><small>借金の残り</small><b data-g="debt">4</b></div>
        </div>
        <div class="bgt-people" data-people></div>
      </div>
      <div class="bgt-main" data-main></div>
      <div class="bgt-fx" data-fx aria-hidden="true"></div>
      <div class="bgt-toasts" data-toasts aria-live="polite"></div>`;
    host.appendChild(root);
    const $ = s => root.querySelector(s);
    const main = $('[data-main]'), bar = $('.bgt-bar'), fx = $('[data-fx]');

    function scrollTop() {
      let p = root;
      while (p && p !== document.body) { if (p.scrollTop) p.scrollTop = 0; p = p.parentElement; }
      if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
    }
    function screen(html, cls) {
      main.innerHTML = `<section class="bgt-scr ${cls || ''}">${html}</section>`;
      scrollTop();
      return main.firstElementChild;
    }
    function toast(t) {
      const w = $('[data-toasts]'), d = document.createElement('div');
      d.className = 'bgt-toast'; d.textContent = t; w.appendChild(d);
      later(() => d.remove(), 1900);
    }
    function animNum(el, from, to, ms) {
      if (!el) return;
      if (reduce || from === to) { el.textContent = to; return; }
      const t0 = performance.now();
      const step = now => {
        if (dead) return;
        const k = Math.min(1, (now - t0) / ms), v = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
        el.textContent = v;
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    function bump(el, cls) {
      if (!el) return;
      el.classList.remove('bump', 'up', 'down'); void el.offsetWidth; el.classList.add('bump'); if (cls) el.classList.add(cls);
    }
    let shownWallet = 0;
    function setWallet(v, dir) {
      const el = $('[data-wallet]');
      animNum(el, shownWallet, v, 420); shownWallet = v;
      bump($('[data-wallet-box]'), dir);
    }
    const gshown = { mirai: 10, debt: 4 };
    function setGauge(k, v) {
      const el = root.querySelector(`[data-g="${k}"]`);
      if (!el || gshown[k] === v) return;
      const dir = v > gshown[k] ? 'up' : 'down';
      animNum(el, gshown[k], v, 700); gshown[k] = v;
      bump(el.parentElement, k === 'debt' ? (dir === 'up' ? 'down' : 'up') : dir);
    }
    // 上のバーの府民4人とハート。changed：{人: 増減} を渡すと、その人がはねる
    function paintPeople(changed) {
      const box = $('[data-people]');
      box.innerHTML = PEOPLE.map(p => {
        const h = S.hearts[p.id], d = changed && changed[p.id];
        return `<span class="bgt-pp ${h >= SMILE ? 'ok' : 'ng'} ${d ? 'bump ' + (d > 0 ? 'up' : 'down') : ''}">${mini(p, h >= SMILE ? 1 : -1)}${heartsHtml(h)}</span>`;
      }).join('');
    }
    function paintBar() {
      bar.hidden = false;
      if (!$('[data-people]').firstChild) paintPeople();
      $('[data-years]').innerHTML = Array.from({ length: YEARS }, (_, i) =>
        `<i class="${i + 1 < S.year ? 'done' : i + 1 === S.year ? 'now' : ''}"></i>`).join('') + `<span>${S.year}年目</span>`;
    }
    // コインが飛ぶ（from → to）。n 枚まで
    function flyCoins(fromEl, toEl, n, opt) {
      if (reduce || !fromEl || !toEl || !fromEl.getBoundingClientRect) return;
      const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect(), base = root.getBoundingClientRect();
      const count = Math.max(1, Math.min(6, n));
      for (let i = 0; i < count; i++) {
        const c = document.createElement('span');
        c.className = 'bgt-coin fly' + (opt && opt.out ? ' out' : '');
        const sx = a.left + a.width / 2 - base.left + (rand() - .5) * Math.min(60, a.width * .5);
        const sy = a.top + a.height / 2 - base.top + (rand() - .5) * 20;
        const ex = b.left + b.width / 2 - base.left, ey = b.top + b.height / 2 - base.top;
        c.style.left = sx + 'px'; c.style.top = sy + 'px';
        fx.appendChild(c);
        const dx = ex - sx, dy = ey - sy, lift = -60 - rand() * 50;
        const an = c.animate([
          { transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 },
          { transform: `translate(calc(-50% + ${dx * .35}px), calc(-50% + ${dy * .35 + lift}px)) scale(1.15)`, opacity: 1, offset: .35 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.7)`, opacity: .9 },
        ], { duration: 620 + i * 40, delay: i * 70, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'both' });
        anims.add(an);
        an.onfinish = () => { anims.delete(an); c.remove(); };
      }
    }
    function sparkle(el) {
      if (reduce || !el) return;
      const r = el.getBoundingClientRect(), base = root.getBoundingClientRect();
      for (let i = 0; i < 8; i++) {
        const s = document.createElement('span'); s.className = 'bgt-spark';
        s.style.left = (r.left - base.left + r.width / 2) + 'px'; s.style.top = (r.top - base.top + r.height / 2) + 'px';
        fx.appendChild(s);
        const ang = i / 8 * Math.PI * 2, d = 34 + rand() * 18;
        const an = s.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(ang) * d}px), calc(-50% + ${Math.sin(ang) * d}px)) scale(.2)`, opacity: 0 }], { duration: 520, easing: 'ease-out', fill: 'both' });
        anims.add(an); an.onfinish = () => { anims.delete(an); s.remove(); };
      }
    }
    function shake(el) { if (!el) return; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }

    // ---------- 街の絵 ----------
    function townHtml(cls) {
      return `<div class="bgt-town ${cls || ''}" data-town>
        <img class="bgt-town-base" src="${IMG}budget/town_before.jpg" alt="大阪の街のイラスト">
        <img class="bgt-town-lit" data-lit src="${IMG}budget/town_after.jpg" alt="">
        ${Object.keys(ZONES).map(k => ZONES[k].map(z => `<i class="bgt-glow" data-glow="${k}" style="left:${z.x}%;top:${z.y}%;width:${z.r * 2.4}%"></i>`).join('')).join('')}
        <div class="bgt-town-tags" data-tags></div>
      </div>`;
    }
    function levelOf(v) { return Math.min(1, v / 7); }
    function paintTown(townEl, lv) {
      const lit = townEl.querySelector('[data-lit]');
      const layers = [];
      Object.keys(ZONES).forEach(k => {
        const L = lv[k] || 0;
        if (L <= 0.001) return;
        ZONES[k].forEach(z => {
          const rx = z.r * (0.95 + 0.6 * L), ry = rx * 1.5;
          layers.push(`radial-gradient(ellipse ${rx.toFixed(2)}% ${ry.toFixed(2)}% at ${z.x}% ${z.y}%, rgba(0,0,0,${Math.min(1, 0.85 + 0.3 * L).toFixed(2)}) 0%, rgba(0,0,0,${(0.7 + 0.3 * L).toFixed(2)}) 55%, rgba(0,0,0,0) 100%)`);
        });
      });
      townEl.querySelectorAll('[data-glow]').forEach(gl => { gl.style.opacity = (Math.min(1, (lv[gl.dataset.glow] || 0) * 1.3) * 0.85).toFixed(3); });
      const g = Math.min(0.45, lv.all || 0);
      layers.push(`linear-gradient(rgba(0,0,0,${g.toFixed(3)}), rgba(0,0,0,${g.toFixed(3)}))`);
      const m = layers.join(',');
      lit.style.webkitMaskImage = m; lit.style.maskImage = m;
    }
    function levels(src) {
      const lv = {}; let total = 0;
      Object.keys(src).forEach(k => { if (k !== 'all') { lv[k] = levelOf(src[k]); total += src[k]; } });
      lv.all = src.all != null ? src.all : total * 0.02;
      return lv;
    }
    // 去年の状態から今年の状態へ、少しずつ明るくする
    function growTown(townEl, from, to, ms) {
      return new Promise(res => {
        if (reduce) { paintTown(townEl, levels(to)); res(); return; }
        const t0 = performance.now();
        const step = now => {
          if (dead) return;
          const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
          const mix = {};
          Object.keys(to).forEach(key => { mix[key] = from[key] + (to[key] - from[key]) * e; });
          paintTown(townEl, levels(mix));
          if (k < 1) requestAnimationFrame(step); else res();
        };
        requestAnimationFrame(step);
      });
    }
    function townState() {
      const s = Object.assign({}, S.invest);
      const tot = Object.values(S.invest).reduce((a, b) => a + b, 0);
      s.all = tot * 0.02;
      return s;
    }

    // ---------- 画面：はじめに ----------
    function intro() {
      const el = screen(`
        <div class="bgt-hero">
          ${townHtml('hero')}
          <div class="bgt-hero-text">
            <span class="bgt-kicker light">ここからは、あなたの想像の中</span>
            <h2 class="bgt-h1">もしも自分が、<br>大阪の知事だったら？</h2>
          </div>
        </div>
        <div class="bgt-pad">
          <p class="bgt-lead left">想像の中で、あなたは2年間、大阪のお財布をあずかります。<br>まちには、こんな4人が暮らしています。</p>
          <div class="bgt-cast">${PEOPLE.map(p => `<div>${face(p, 1)}<b>${esc(p.name)}</b><small>${esc(p.who)}</small>${heartsHtml(HEART0)}</div>`).join('')}</div>
          <div class="bgt-goal"><b>目標</b><span>2年後、4人をなるべく笑顔に（ハート${SMILE}つ以上）。<br>未来の安心と、借金のことも忘れずに。</span></div>
          <ol class="bgt-flow">
            <li><b>毎年、4人からお願いが届く</b><span>かなえるとハート +1、見送ると −1。でも、<em>お金は全員分ありません。</em></span></li>
            <li><b>お金をつくる手は、1年に1つ</b><span>改革・税金・借金。喜ぶ人もいれば、困る人もいます。</span></li>
            <li><b>出来事にそなえる</b><span>見送ると、翌年にお金や笑顔で返ってきます。</span></li>
          </ol>
          <button class="bgt-btn" data-act="begin">知事として、1年目へ</button>
          <p class="bgt-fine">※ ゲーム用に、お金を「コイン」に単純化しています。実際の予算の大きさや比率、制度の効果とは異なります。</p>
        </div>`, 'intro');
      paintTown(el.querySelector('[data-town]'), levels({ kyoiku: 0, kosodate: 0, anshin: 0, sonae: 0, machi: 0, all: 0.12 }));
    }

    // ---------- 年のはじめ ----------
    function startYear() {
      S.year++;
      const ev = S.events[S.year - 1];
      Y = { year: S.year, ev, req: S.reqs[S.year - 1], funds: new Set(), spends: new Set(), stopped: new Set(), forced: [], pre: [], dmz: 0, dmr: 0, start: 0, rows: [], after: [], costUp: ev.costUp || 0 };
      // 去年の出来事の結果
      const notes = [];
      if (S.pending) {
        const { ev: pe, ok } = S.pending;
        if (ok && pe.ok) notes.push({ good: true, text: pe.ok });
        else if (!ok && pe.miss) {
          const m = pe.miss;
          notes.push({ good: false, text: m.text });
          if (m.mz) Y.dmz += m.mz;
          if (m.mr) Y.dmr += m.mr;
          if (m.income) S.incomeMod += m.income;
          if (m.react) Y.pre.push(m.react);
          if (m.coin) Y.missCoin = m.coin;
        }
        S.pending = null;
      }
      // 今年のお財布
      const rows = [['税金などの収入', INCOME]];
      if (S.incomeMod) rows.push(['子育て世代が府の外へ（税金が減った）', S.incomeMod]);
      if (S.bonus) { rows.push(['商店街のにぎわい', S.bonus]); S.bonus = 0; }
      if (S.carry) rows.push(['去年のくり越し', S.carry]);
      FUNDS.forEach(f => { if (!f.loan && S.active[f.id] && S.active[f.id] <= S.year) rows.push([f.id === 'zouzei' ? '税金の引き上げ' : '改革の効果：' + f.label, f.coin]); });
      if (ev.coin) rows.push(['今年の出来事：' + ev.title, ev.coin]);
      if (Y.missCoin) rows.push(['去年の出来事の影響', Y.missCoin]);
      let rep = 0;
      S.loans.forEach(l => { if (l.from <= S.year && l.left > 0) { const p = Math.min(l.per, l.left); l.left -= p; rep += p; } });
      if (rep) rows.push(['借金の返済', -rep]);
      Y.rows = rows;
      Y.start = Math.max(0, rows.reduce((a, r) => a + r[1], 0));
      S.wallet = Y.start;
      S.carry = 0;
      paintBar();
      if (S.year === 1) { shownWallet = 0; $('[data-wallet]').textContent = 0; }
      setGauge('debt', debt());

      const el = screen(`
        ${steps(1)}
        <div class="bgt-pad">
          <div class="bgt-yearhead"><small>${S.year}年目</small><h2>${S.year === YEARS ? '最後の年' : S.year === 1 ? 'お財布をあずかった' : 'つぎの年'}</h2></div>
          ${notes.length ? `<div class="bgt-notes"><h4>去年からの影響</h4>${notes.map(n => `<p class="${n.good ? 'good' : 'bad'}">${esc(n.text)}</p>`).join('')}</div>` : ''}
          <article class="bgt-event ${ev.good ? 'good' : ''}" data-event>
            <div class="bgt-event-band">${icon(['e', ev.ic], 'bgt-event-pic')}</div>
            <div class="bgt-event-body">
              <span class="bgt-kicker">今年の出来事</span>
              <h3>${esc(ev.title)}</h3>
              <p>${esc(ev.text)}</p>
              ${ev.fx ? `<p class="bgt-chip warn">${esc(ev.fx)}</p>` : ''}
              ${ev.need.length ? `<dl class="bgt-need"><dt>対応するなら</dt><dd>${esc(ev.needText)}${ev.good ? '' : 'で対応できます'}</dd>${ev.risk ? `<dt>見送ると</dt><dd>${esc(ev.risk)}</dd>` : ''}</dl>` : ''}
            </div>
          </article>
          ${asksHtml()}
          <div class="bgt-ledger" data-ledger>
            <h4>今年のお財布</h4>
            ${rows.map(([l, v], i) => `<div class="bgt-row" style="--i:${i}"><span>${esc(l)}</span><b class="${v < 0 ? 'minus' : 'plus'}">${sgn(v)}</b></div>`).join('')}
            <div class="bgt-row total"><span>使えるお金</span><b>${coinHtml(`<span data-start>0</span>`)}</b></div>
          </div>
          <button class="bgt-btn" data-act="tofund">お金をつくる</button>
        </div>`, 'year');
      sfx('card');
      (async () => {
        await wait(reduce ? 0 : 500 + rows.length * 120);
        if (!main.contains(el)) return;
        animNum(el.querySelector('[data-start]'), 0, Y.start, 600);
        flyCoins(el.querySelector('.bgt-row.total'), $('[data-wallet-box]'), Y.start);
        await wait(500);
        if (!main.contains(el)) return;
        sfx('coin');
        setWallet(S.wallet, 'up');
      })();
    }

    // 今年のお願い（年のはじめに見せる。全部かなえると何コインかも）
    function asksHtml() {
      const ids = [...new Set(PEOPLE.map(p => Y.req[p.id].id))];
      const all = ids.reduce((a, id) => a + costOf(SD[id]), 0);
      return `<div class="bgt-asks">
        <h4>今年、府民から届いたお願い</h4>
        ${PEOPLE.map(p => { const r = Y.req[p.id], s = SD[r.id]; return `<div class="bgt-ask">${face(p, S.hearts[p.id] >= SMILE ? 1 : -1)}<div><small>${esc(p.name)}（${esc(p.who)}）</small><p>「${esc(r.ask)}」</p><span>${esc(s.label)}${s.every ? '<em>毎年</em>' : ''}　${coinHtml(costOf(s))}</span></div></div>`; }).join('')}
        <p class="bgt-sum">全部かなえると <b>${coinHtml(all)}</b></p>
      </div>`;
    }

    function steps(n) {
      const names = ['出来事', 'お金をつくる', '使い道', '府民の声'];
      return `<ol class="bgt-steps">${names.map((t, i) => `<li class="${i + 1 < n ? 'done' : i + 1 === n ? 'now' : ''}"><i>${i + 1}</i>${t}</li>`).join('')}</ol>`;
    }

    // ---------- お金をつくる ----------
    function fundScreen() {
      setWallet(S.wallet);
      screen(`
        ${steps(2)}
        <div class="bgt-pad">
          <h3 class="bgt-h2">お金をつくる</h3>
          <p class="bgt-rule">1年に<b>1つだけ</b>選べます（選ばなくてもかまいません）。改革と税金は、一度始めると毎年お金が入ります。<span class="bgt-left" data-picks></span></p>
          <div class="bgt-funds">${FUNDS.map(f => fundCard(f)).join('')}</div>
          <button class="bgt-btn" data-act="tospend">使い道を決める</button>
          <p class="bgt-fine">※ 改革の効果の大きさや時期は、ゲーム用に単純化した目安です。実際には議論があります。</p>
        </div>`, 'fund');
      paintFunds();
    }
    function fundCard(f) {
      const when = f.loan ? '今年だけ' : f.delay ? '翌年から毎年' : '今年から毎年';
      return `<button class="bgt-fcard" data-act="fund" data-id="${f.id}">
        ${icon(f.ic)}
        <span class="bgt-fbody">
          <b>${esc(f.label)}</b>
          <span class="pro">${esc(f.good)}</span>
          <span class="con">${esc(f.bad)}</span>
          <span class="bgt-rcs">${reactChips(f.react)}</span>
        </span>
        <span class="bgt-fcoin"><em>+${f.coin}</em><small>${when}</small></span>
        <span class="bgt-state" data-state></span>
      </button>`;
    }
    function paintFunds() {
      root.querySelectorAll('[data-act="fund"]').forEach(b => {
        const f = FD[b.dataset.id];
        const mine = Y.funds.has(f.id);
        const before = !f.loan && S.active[f.id] && !mine;
        b.classList.toggle('on', mine);
        b.classList.toggle('active', !!before);
        const late = !mine && !before && f.delay && S.year + f.delay > YEARS;
        b.classList.toggle('full', !!late);
        b.querySelector('[data-state]').textContent = mine ? (f.delay ? '来年から' : '決定') : before ? '実施中' : late ? '間に合わない' : '';
        b.setAttribute('aria-pressed', mine ? 'true' : 'false');
      });
      const p = root.querySelector('[data-picks]');
      if (p) p.textContent = Y.funds.size ? '決めました' : 'まだ選んでいません';
    }
    function toggleFund(btn) {
      const f = FD[btn.dataset.id];
      if (!f.loan && S.active[f.id] && !Y.funds.has(f.id)) { toast('すでに実施中です（効果は毎年続きます）'); sfx('tap'); return; }
      if (!Y.funds.has(f.id) && f.delay && S.year + f.delay > YEARS) { toast('効果が出る前に、2年が終わってしまいます'); sfx('wrong'); shake(btn); return; }
      // 1年に1つ：ほかを選んでいたら入れかえる
      if (!Y.funds.has(f.id) && Y.funds.size >= PICKS) {
        const prev = root.querySelector(`[data-act="fund"][data-id="${[...Y.funds][0]}"]`);
        if (prev) toggleFund(prev);
      }
      if (Y.funds.has(f.id)) {
        Y.funds.delete(f.id);
        if (f.loan) S.loans.pop(); else delete S.active[f.id];
        if (!f.delay) { S.wallet -= f.coin; flyCoins($('[data-wallet-box]'), btn, f.coin, { out: true }); setWallet(S.wallet, 'down'); }
        sfx('tap');
      } else {
        Y.funds.add(f.id);
        if (f.loan) S.loans.push({ left: f.coin + 1, per: 2, from: S.year + 1, made: S.year });
        else S.active[f.id] = S.year + f.delay;
        if (!f.delay) {
          S.wallet += f.coin;
          flyCoins(btn, $('[data-wallet-box]'), f.coin);
          later(() => { sfx('coin'); setWallet(S.wallet, 'up'); }, 520);
        } else { toast('準備に1年。来年から毎年 +' + f.coin + ' コイン'); sfx('choose'); }
        if (f.loan) later(() => setGauge('debt', debt()), 600);
        buzz(10);
        sparkle(btn);
      }
      if (f.loan && !Y.funds.has(f.id)) setGauge('debt', debt());
      paintFunds();
    }

    // ---------- 使い道 ----------
    const costOf = s => s.cost + (!s.every && Y.costUp ? Y.costUp : 0);
    function spendScreen() {
      // 続けている制度は、はじめから選ばれている（お金が足りなければ続けられない）
      S.cont.forEach(id => {
        const s = SD[id];
        if (costOf(s) <= S.wallet) { Y.spends.add(id); S.wallet -= costOf(s); }
        else { Y.stopped.add(id); Y.forced.push(s.label); }
      });
      setWallet(S.wallet);
      const ev = Y.ev;
      const asked = new Set(PEOPLE.map(p => Y.req[p.id].id));
      const list = SPENDS.filter(s => (!s.only || s.only === ev.id) && !asked.has(s.id));
      const need = list.filter(s => ev.need.includes(s.id));
      const rest = list.filter(s => !ev.need.includes(s.id));
      const kinds = Object.keys(KINDS);
      rest.sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind));
      screen(`
        ${steps(3)}
        <div class="bgt-pad">
          <h3 class="bgt-h2">使い道を決める</h3>
          <p class="bgt-rule">押すとお財布からコインが出ていきます。<b>全員のお願いはかなえられません。</b>「毎年」の制度は、来年も自動で続き、毎年お金がかかります（やめると、その人は悲しみます）。残ったお金は来年へ。</p>
          ${Y.forced.length ? `<p class="bgt-alert">お金が足りず、「${Y.forced.map(esc).join('」「')}」を続けられませんでした。</p>` : ''}
          <div class="bgt-sec asks"><h4>府民からのお願い</h4>${reqRows(ev)}</div>
          ${need.length ? `<div class="bgt-sec need"><h4>今年の出来事「${esc(ev.title)}」への対応</h4><div class="bgt-grid">${need.map(spendCard).join('')}</div></div>` : ''}
          ${rest.length ? `<div class="bgt-sec"><h4>そのほかの使い道</h4><p class="bgt-fine top">お願いはないけれど、未来の安心や、来年のために。</p><div class="bgt-grid">${rest.map(spendCard).join('')}</div></div>` : ''}
          <p class="bgt-fine">※ 金額と効果は、ゲーム用に単純化した目安です。</p>
        </div>
        <div class="bgt-dock">
          <div class="bgt-dock-left"><small>残り（来年へ）</small><b>${coinHtml('<span data-left>0</span>')}</b></div>
          <button class="bgt-btn" data-act="decide">この予算で決める</button>
        </div>`, 'spend');
      paintSpends();
    }
    // お願いの札（同じ使い道を2人がお願いしたら、1枚に2人）
    function reqRows(ev) {
      const by = new Map();
      PEOPLE.forEach(p => { const id = Y.req[p.id].id; if (!by.has(id)) by.set(id, []); by.get(id).push(p); });
      return [...by.entries()].map(([id, ps]) => {
        const s = SD[id], k = KINDS[s.kind];
        return `<button class="bgt-req" data-act="spend" data-id="${s.id}" style="--k:${k.color}">
          <span class="bgt-req-faces">${ps.map(p => face(p, S.hearts[p.id] >= SMILE ? 1 : -1)).join('')}</span>
          <span class="bgt-req-body">
            <small>${ps.map(p => esc(p.name)).join('と')}のお願い${ps.length > 1 ? '<em>2人が喜ぶ</em>' : ''}${ev.need.includes(s.id) ? '<em class="ev">出来事にも対応</em>' : ''}</small>
            <b>${esc(s.label)}${s.every ? '<em>毎年</em>' : ''}</b>
            <span class="bgt-req-q">${ps.map(p => `「${esc(Y.req[p.id].ask)}」`).join('')}</span>
          </span>
          <span class="bgt-scost">${coinHtml(costOf(s))}</span>
          <span class="bgt-check" aria-hidden="true"></span>
          <span class="bgt-cont" data-cont></span>
        </button>`;
      }).join('');
    }
    function spendCard(s) {
      const k = KINDS[s.kind];
      const eff = [s.mr ? `未来 +${s.mr}` : '', s.payback ? `借金 −${s.payback}` : '', s.bonus ? `翌年 税金+${s.bonus}` : ''].filter(Boolean);
      return `<button class="bgt-scard" data-act="spend" data-id="${s.id}" style="--k:${k.color}">
        <span class="bgt-skind">${k.label}${s.every ? '<em>毎年</em>' : ''}</span>
        ${icon(s.ic, 'bgt-sic')}
        <b class="bgt-stitle">${esc(s.label)}</b>
        <span class="bgt-ssub">${esc(s.sub)}</span>
        <span class="bgt-seff">${eff.map(t => `<i>${t}</i>`).join('')}</span>
        <span class="bgt-scost">${coinHtml(costOf(s))}</span>
        <span class="bgt-check" aria-hidden="true"></span>
        <span class="bgt-cont" data-cont></span>
      </button>`;
    }
    function paintSpends() {
      root.querySelectorAll('[data-act="spend"]').forEach(b => {
        const s = SD[b.dataset.id], on = Y.spends.has(s.id);
        b.classList.toggle('on', on);
        b.classList.toggle('poor', !on && costOf(s) > S.wallet);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        const c = b.querySelector('[data-cont]');
        c.textContent = S.cont.has(s.id) ? (on ? '続けている' : 'やめる') : '';
        b.classList.toggle('stopped', S.cont.has(s.id) && !on);
      });
      const l = root.querySelector('[data-left]');
      if (l) l.textContent = S.wallet;
    }
    function toggleSpend(btn) {
      const s = SD[btn.dataset.id], c = costOf(s);
      if (Y.spends.has(s.id)) {
        Y.spends.delete(s.id); S.wallet += c;
        if (S.cont.has(s.id)) { Y.stopped.add(s.id); toast('「' + s.label + '」をやめます'); }
        flyCoins(btn, $('[data-wallet-box]'), c);
        later(() => setWallet(S.wallet, 'up'), 400);
        sfx('tap');
      } else {
        if (c > S.wallet) { toast('コインが足りません'); sfx('wrong'); shake(btn); shake($('[data-wallet-box]')); buzz(30); return; }
        Y.spends.add(s.id); Y.stopped.delete(s.id); S.wallet -= c;
        flyCoins($('[data-wallet-box]'), btn, c, { out: true });
        setWallet(S.wallet, 'down');
        sfx('choose'); buzz(10);
        later(() => sparkle(btn), 380);
      }
      paintSpends();
    }

    // ---------- 一年のおわり ----------
    async function endYear() {
      const ev = Y.ev;
      const before = Object.assign({}, S.shown);
      let dmz = Y.dmz, dmr = Y.dmr;
      Y.spends.forEach(id => {
        const s = SD[id];
        dmz += s.mz; dmr += s.mr;
        S.invest[s.kind] += costOf(s);
        if (s.payback) payback(s.payback);
        if (s.bonus) S.bonus += s.bonus;
        if (s.every) S.cont.add(id);
      });
      Y.stopped.forEach(id => S.cont.delete(id));
      FUNDS.forEach(f => {
        if (f.mzEvery && S.active[f.id] && S.active[f.id] <= S.year) dmz += f.mzEvery;
        if (f.mz && Y.funds.has(f.id)) dmz += f.mz;
      });
      const responded = ev.need.length ? ev.need.some(id => Y.spends.has(id)) : null;
      if (ev.need.length && (ev.miss || ev.ok)) S.pending = { ev, ok: responded };
      S.carry = S.wallet;
      const mz0 = S.manzoku, mr0 = S.mirai;
      S.manzoku = Math.max(0, S.manzoku + dmz);
      S.mirai = Math.max(0, S.mirai + dmr);
      S.shown = townState();
      const voices = reactions();
      const hd = {};
      voices.forEach(v => {
        S.people[v.p.id] += v.sum; if (v.mood < 0) S.sad[v.p.id]++;
        const h0 = S.hearts[v.p.id];
        S.hearts[v.p.id] = Math.max(0, Math.min(HEART_MAX, h0 + v.sum));
        v.d = hd[v.p.id] = S.hearts[v.p.id] - h0;
        v.hearts = S.hearts[v.p.id];
      });
      S.manzoku = heartSum();
      S.years.push({
        year: S.year, event: ev.title, eventId: ev.id, responded,
        funds: [...Y.funds].map(id => FD[id].label),
        spends: [...Y.spends].map(id => SD[id].label),
        stopped: [...Y.stopped].map(id => SD[id].label),
        met: PEOPLE.filter(p => Y.spends.has(Y.req[p.id].id)).map(p => p.name),
        carry: S.carry, manzoku: S.manzoku, mirai: S.mirai, debt: debt(), smile: smileCount(),
        dManzoku: S.manzoku - mz0, dMirai: S.mirai - mr0,
      });

      const last = S.year === YEARS;
      const grew = Object.keys(KINDS).filter(k => S.shown[k] > before[k]);
      const el = screen(`
        ${steps(4)}
        <div class="bgt-pad">
          <div class="bgt-yearhead"><small>${S.year}年目のおわり</small><h2>府民の声と、街の変化</h2></div>
          ${townHtml()}
          <div class="bgt-deltas">
            <div><small>笑顔の府民</small><b>${smileCount()}<span class="of">/4人</span></b></div>
            <div><small>未来の安心</small><b class="${dmr >= 0 ? 'up' : 'down'}">${sgn(S.mirai - mr0)}</b></div>
            <div><small>来年へくり越し</small><b>${coinHtml(S.carry)}</b></div>
          </div>
          ${ev.need.length && !ev.good ? `<p class="bgt-evres ${responded ? 'ok' : 'ng'}">「${esc(ev.title)}」に${responded ? '対応しました' : '今年は対応しませんでした。来年に影響が出るかもしれません'}</p>` : ''}
          <div class="bgt-voices" data-voices>${voices.map((v, i) => voiceHtml(v, i)).join('')}</div>
          <button class="bgt-btn" data-act="${last ? 'final' : 'next'}" disabled>${last ? '2年間をふり返る' : (S.year + 1) + '年目へ'}</button>
        </div>`, 'end');
      const town = el.querySelector('[data-town]');
      paintTown(town, levels(before));
      setGauge('mirai', S.mirai); setGauge('debt', debt());
      paintPeople(hd);
      await wait(450);
      if (grew.length) sfx('clear');
      const tags = el.querySelector('[data-tags]');
      grew.forEach((k, i) => {
        const z = ZONES[k][0];
        const t = document.createElement('span');
        t.className = 'bgt-tag'; t.style.left = Math.max(27, Math.min(73, z.x)) + '%'; t.style.top = Math.max(12, Math.min(88, z.y)) + '%'; t.style.setProperty('--k', KINDS[k].color);
        t.style.animationDelay = (0.3 + i * 0.35) + 's';
        t.textContent = KINDS[k].glow;
        tags.appendChild(t);
      });
      await growTown(town, before, S.shown, grew.length ? 1600 : 400);
      const vs = el.querySelectorAll('.bgt-voice');
      for (let i = 0; i < vs.length; i++) { vs[i].classList.add('in'); sfx('tap'); await wait(380); }
      const nb = el.querySelector('[data-act="next"],[data-act="final"]');
      if (nb) nb.disabled = false;
    }
    function payback(n) {
      // 新しい借金から先に返す
      for (let i = S.loans.length - 1; i >= 0 && n > 0; i--) { const p = Math.min(n, S.loans[i].left); S.loans[i].left -= p; n -= p; }
    }
    // ハートが動くのは：お願い（+1／−1）・お金のつくり方・やめた制度・出来事の影響
    function reactions() {
      return PEOPLE.map(p => {
        const ent = [];
        const rq = Y.req[p.id];
        ent.push(Y.spends.has(rq.id) ? [1, rq.yes] : [-1, rq.no]);
        Y.pre.forEach(r => { if (r[p.id]) ent.push(r[p.id]); });
        Y.funds.forEach(id => { const r = FD[id].react[p.id]; if (r) ent.push(r); });
        Y.stopped.forEach(id => { if (id === rq.id) return; const r = SD[id].stop && SD[id].stop[p.id]; if (r) ent.push([-1, r[1]]); });
        if (Y.ev.good && Y.ev.miss && Y.ev.need.length && !Y.ev.need.some(id => Y.spends.has(id)) && Y.ev.miss.react[p.id]) ent.push(Y.ev.miss.react[p.id]);
        const sum = ent.reduce((a, e) => a + e[0], 0);
        let pick = null;
        const pool = ent.filter(e => e[1]);
        const same = pool.filter(e => Math.sign(e[0]) === Math.sign(sum) && e[0] !== 0);
        const from = same.length ? same : pool;
        from.forEach(e => { if (!pick || Math.abs(e[0]) > Math.abs(pick[0])) pick = e; });   // 同じ強さなら先の（お願いの）ひとこと
        const line = pick ? pick[1] : p.idle;
        const mood = sum !== 0 ? Math.sign(sum) : (pick ? Math.sign(pick[0]) : 0);
        return { p, sum, mood, line };
      });
    }
    // 制度が今年はじまったか（去年から続いているものは、声を出さない）
    const startedThisYear = new Set();
    function isNewThisYear(id) { return startedThisYear.has(id); }
    function voiceHtml(v, i) {
      const hs = v.hearts != null ? `<span class="bgt-vh">${heartsHtml(v.hearts)}${v.d ? `<b class="${v.d > 0 ? 'up' : 'down'}">${v.d > 0 ? '+' : '−'}${Math.abs(v.d)}</b>` : ''}</span>` : '';
      return `<div class="bgt-voice ${v.mood > 0 ? 'happy' : v.mood < 0 ? 'sad' : 'calm'}" style="--i:${i}">
        ${face(v.p, v.mood)}
        <div class="bgt-bubble"><small>${esc(v.p.name)}（${esc(v.p.who)}）${hs}</small><p>${esc(v.line)}</p></div>
      </div>`;
    }

    // ---------- ふり返り ----------
    function finalScreen() {
      // 最後の年の出来事に対応しなかったぶん・借金の残り
      const late = [];
      if (S.pending && !S.pending.ok && S.pending.ev.miss) {
        const m = S.pending.ev.miss;
        if (m.mz) S.manzoku = Math.max(0, S.manzoku + m.mz);
        if (m.mr) S.mirai = Math.max(0, S.mirai + m.mr);
        late.push(`「${S.pending.ev.title}」への対応は、この先の課題として残りました。`);
      }
      const d = debt();
      const pen = Math.max(0, Math.floor((d - 2) / 2));
      if (pen) { S.mirai = Math.max(0, S.mirai - pen); late.push(`借金が${d}コイン残っています。これから返していくぶん、未来の安心 −${pen}。`); }
      else late.push(`借金の残りは${d}コイン。返す負担を、大きく増やさずにすみました。`);
      setGauge('mirai', S.mirai);
      const smile = smileCount();
      const HEAD = ['お金が足りず、多くの人が不満をかかえました。', 'お金が足りず、多くの人が不満をかかえました。', '笑顔は半分。だれのお願いを先にするか、悩ましい2年でした。', 'あと1人……！ 全員のお願いをかなえるのは、むずかしい。', '4人とも笑顔！ 見事なやりくりです。'];

      const tot = Object.entries(S.invest).sort((a, b) => b[1] - a[1]);
      const sum = tot.reduce((a, b) => a + b[1], 0);
      let kind = 'bal';
      if (sum > 0 && tot[0][1] / sum >= 0.3 && tot[0][1] - tot[1][1] >= 2) kind = tot[0][0];
      const [typeName, typeLine] = TYPES[kind];
      const used = new Set(S.years.flatMap(y => y.funds));
      const how = [];
      if (['teisu', 'tougou', 'minei', 'minaoshi'].some(id => used.has(FD[id].label))) how.push(HOW.kaikaku);
      if (used.has(FD.zouzei.label)) how.push(HOW.zouzei);
      if (used.has(FD.shakkin.label)) how.push(HOW.shakkin);
      if (!how.length) how.push(HOW.none);
      const maxV = Math.max(1, ...tot.map(t => t[1]));

      const el = screen(`
        <div class="bgt-pad">
          <div class="bgt-score ${smile === 4 ? 'all' : ''}">
            <small>2年後、笑顔でいてくれた府民</small>
            <b>${smile}<span>/ 4人</span></b>
            <p>${HEAD[smile]}</p>
            <div class="bgt-score-people">${PEOPLE.map(p => { const h = S.hearts[p.id]; return `<span class="${h >= SMILE ? 'ok' : 'ng'}">${face(p, h >= SMILE ? 1 : -1)}<small>${esc(p.name)}</small>${heartsHtml(h)}</span>`; }).join('')}</div>
            <div class="bgt-score-sub"><span>未来の安心 <b>${S.mirai}</b></span><span>借金の残り <b>${d}</b></span></div>
          </div>
          <button class="bgt-btn ghost" data-act="retry">もう一度、2年間をやってみる</button>
          <div class="bgt-type small">
            <small>あなたの予算のかたち</small>
            <b>${typeName}</b>
            <p>${esc(typeLine)}</p>
          </div>
          ${townHtml('final')}
          <div class="bgt-card">
            <h4>2年間で、お金を回した分野</h4>
            ${Object.keys(KINDS).map(k => `<div class="bgt-share"><span>${KINDS[k].label}</span><i><em style="--w:${(S.invest[k] / maxV * 100).toFixed(1)}%;--k:${KINDS[k].color}"></em></i><b>${S.invest[k]}</b></div>`).join('')}
          </div>
          <div class="bgt-card">
            <h4>お金のつくり方</h4>
            ${how.map(t => `<p>${esc(t)}</p>`).join('')}
            <div class="bgt-res"><span>笑顔の府民（いま）</span><b>${smile}人</b></div>
            <div class="bgt-res"><span>未来の安心（これから）</span><b>${S.mirai}</b></div>
            <div class="bgt-res"><span>借金の残り</span><b>${d}コイン</b></div>
            ${late.map(t => `<p class="bgt-note">${esc(t)}</p>`).join('')}
          </div>
          <div class="bgt-card">
            <h4>2年間のふり返り</h4>
            <ol class="bgt-time">${S.years.map(y => `
              <li><b>${y.year}年目</b>
                <p class="ev">出来事：${esc(y.event)}${y.responded === true ? '<em class="ok">対応した</em>' : y.responded === false ? '<em class="ng">見送った</em>' : ''}</p>
                <p>お願いをかなえた：${y.met.length ? y.met.map(esc).join('・') : 'なし'}</p>
                <p>つくる：${y.funds.length ? y.funds.map(esc).join('・') : 'なし'}</p>
                <p>使う：${y.spends.length ? y.spends.map(esc).join('・') : 'なし'}${y.stopped.length ? `（やめた：${y.stopped.map(esc).join('・')}）` : ''}</p>
              </li>`).join('')}</ol>
          </div>
          <div class="bgt-card">
            <h4>2年後の府民の声</h4>
            <div class="bgt-voices final">${PEOPLE.map((p, i) => { const h = S.hearts[p.id]; const m = h >= SMILE ? 1 : h <= 1 ? -1 : 0; return voiceHtml({ p, mood: m, hearts: h, line: m > 0 ? p.endGood : m < 0 ? p.endBad : MIXED }, i); }).join('')}</div>
          </div>
          <p class="bgt-lead">どの道にも、よい面と課題があります。<br>実際の予算も、こうした選択の積み重ねで決まっています。</p>
          <p class="bgt-fine">※ ゲーム用に、お金を「コイン」に単純化しています。実際の予算の大きさや比率、制度の効果とは異なります。</p>
          <button class="bgt-btn" data-act="finish">想像から、現実へもどる</button>
          <button class="bgt-btn ghost" data-act="retry">もう一度やってみる</button>
        </div>`, 'final');
      paintBar();
      $('[data-years]').innerHTML = Array.from({ length: YEARS }, () => '<i class="done"></i>').join('') + `<span>${YEARS}年</span>`;
      paintTown(el.querySelector('[data-town]'), levels(S.shown));
      el.querySelectorAll('.bgt-voice').forEach(v => v.classList.add('in'));
      sfx('clear');
      result = {
        typeName, typeLine, typeKey: kind, smile, hearts: Object.assign({}, S.hearts), manzoku: heartSum(), mirai: S.mirai, debt: d,
        invest: Object.assign({}, S.invest), years: S.years,
      };
    }
    let result = null;

    // ---------- 押したとき ----------
    let busy = false;
    function onClick(e) {
      const b = e.target.closest('[data-act]');
      if (!b || !root.contains(b) || b.disabled || busy) return;
      const act = b.dataset.act;
      if (act === 'fund') return toggleFund(b);
      if (act === 'spend') return toggleSpend(b);
      busy = true; later(() => { busy = false; }, 350);
      if (act === 'begin') { sfx('choose'); buzz(10); startYear(); }
      else if (act === 'tofund') { sfx('tap'); fundScreen(); }
      else if (act === 'tospend') { sfx('tap'); startedThisYear.clear(); spendScreen(); }
      else if (act === 'decide') {
        sfx('choose'); buzz(12);
        Y.spends.forEach(id => { if (!S.cont.has(id)) startedThisYear.add(id); });
        endYear();
      }
      else if (act === 'next') { sfx('tap'); startYear(); }
      else if (act === 'final') { sfx('tap'); finalScreen(); }
      else if (act === 'finish') { sfx('tap'); finish(); }
      else if (act === 'retry') { sfx('choose'); restart(); }
    }
    root.addEventListener('click', onClick);

    function cleanup() {
      dead = true;
      timers.forEach(id => clearTimeout(id)); timers.clear();
      anims.forEach(a => { try { a.cancel(); } catch (e) { /* なにもしない */ } }); anims.clear();
      root.removeEventListener('click', onClick);
      root.remove();
    }
    function finish() {
      if (dead) return;
      cleanup();
      done(result || { typeName: TYPES.bal[0], typeLine: TYPES.bal[1], smile: smileCount(), manzoku: heartSum(), mirai: S.mirai, debt: debt(), years: S.years });
    }
    // もう一度：出来事とお願いの順番を引きなおして、1年目から
    function restart() {
      if (dead) return;
      cleanup();
      start(host, Object.assign({}, opts, { seed: null, again: true }), done);
    }

    if (opts.again) startYear(); else intro();
  }

  window.Budget = { run };
})();
