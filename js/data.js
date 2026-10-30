// 大阪で生きてみた — ゲームの中身（文章・クイズ・制度カード・出典）
// 数字は 2026年10月29日時点で、府・市などの資料で確かめたもの。変えるときは出典も一緒に直す。
window.GAME_DATA = (() => {

  // ---------- 制度カード ----------
  // by：決めた場所（国府＝国と大阪府、府＝大阪府、市＝大阪市、府市＝府と市が一緒に、いま＝大阪のいま）
  // cond：いつも見える条件の1行。why：府・市としてのねらい（党の考え方はエンディングにまとめる）
  // osakaCityOnly：大阪市だけの制度（大阪市以外を選んだ人には「大阪市の制度」と出す）
  const CARDS = {
    shiritsu: {
      ishin: true, who: '大阪維新の会の吉村知事のもとで所得制限をなくし、2024年度から段階的に実施。府の独自の無償化は、橋下知事のもとで2011年度に始まった。',
      big: '年63万円', bigSub: '私立高校の授業料の支援（国＋大阪府）',
      cond: '府内在住・所得制限なし・2026年度から全学年。こえた分は学校が負担。入学金などは対象外',
      icon: 0, by: '国府', title: '私立高校の授業料が実質無料に',
      fact: '国の支援（2026年4月から所得制限なしで年45万7,200円まで）に大阪府が上乗せし、年63万円まで支援',
      detail: '2024年度の3年生から始まり、2026年度から全学年に。公立高校の授業料は、国の制度で無料。',
      why: '家の収入で、行ける高校が決まらないように。',
      src: { label: '大阪府「授業料無償化制度」', url: 'https://www.pref.osaka.lg.jp/shigaku/shigakumushouka/index.html' },
    },
    daigaku: {
      ishin: true, who: '大阪維新の会の吉村知事のもとで、2024年度から段階的に実施。',
      big: '0円', bigSub: '大阪公立大学などの授業料（府内の学生）',
      cond: '本人と親が3年以上前から府内在住・申請が必要・2026年度から全学年と大学院（修士）',
      icon: 1, by: '府', title: '大学の授業料が無料に',
      fact: '授業料（通常 年53万5,800円）と入学金が、親の所得にかかわらず無料',
      detail: '国の修学支援の対象になる人は、その分は国の支援になる（国と府の合計で無料）。',
      why: '学ぶお金の心配を減らし、若い人が大阪で学べるように。',
      src: { label: '大阪府「大阪公立大学等の授業料等無償化」', url: 'https://www.pref.osaka.lg.jp/o010010/fukushutosuishin/shin-musyoka/index.html' },
    },
    fushiawase: {
      ishin: true, who: '大阪維新の会が2011年の選挙公約に掲げた「府と市の一体運営」。2017〜2022年に実現した。',
      big: '4組', bigSub: '府と市で別々だったものを、一つに',
      cond: '大学（2022年）・港（2020年）・2つの研究所（2017年）',
      icon: 2, by: '府市', title: '府と市で、一緒に運営',
      fact: '大阪公立大学・大阪港湾局・大阪健康安全基盤研究所・大阪産業技術研究所',
      detail: '2021年には、府と市が一緒に仕事を進めるための条例もできた。一つにした効果の大きさには、いろいろな意見がある。',
      why: '府と市が別々に持っていた役目を、一つにまとめて運営する。',
      src: { label: '大阪府「府市一体条例の骨子」', url: 'https://www.pref.osaka.lg.jp/documents/12882/fushi_jorei_kosshi.pdf' },
    },
    metro: {
      ishin: true, who: '大阪維新の会が公約に掲げ、2017年に大阪市議会で可決（公明・自民も賛成）。',
      big: '2018年', bigSub: '市営地下鉄が株式会社「Osaka Metro」に',
      cond: '公営地下鉄の民営化は全国で初めて。株は大阪市が100%',
      icon: 3, by: '市', title: '市営地下鉄が民営化',
      fact: '2018年4月、大阪市の地下鉄が株式会社になった',
      detail: '2019年の消費税アップのときも、初乗り180円を据え置いた。',
      why: '民間のやり方で、サービスと経営をよくする。',
      src: { label: '東洋経済オンライン（2018年）', url: 'https://toyokeizai.net/articles/-/217557' },
    },
    teisu: {
      ishin: true, who: '2011年（109→88人）と2026年（79→73人）は大阪維新の会の提案。2022年（88→79人）は維新・自民・公明の共同提案。',
      big: '109→73人', bigSub: '大阪府議会の議員の数',
      cond: '73人は2027年の選挙から。1人しか当選しない選挙区が増える、という指摘もある',
      icon: 4, by: '府', kicker: '議会のルール', title: '府議会の議員を減らす',
      fact: '2011年に109人から88人へ。2022年に79人、2026年6月に73人とする条例ができた',
      detail: '議員の数は、府議会が条例で決める。',
      why: '議会のコストを下げる。',
      src: { label: '大阪府議会 改正案資料', url: 'https://www.pref.osaka.lg.jp/documents/131784/08061606.pdf' },
    },
    zaisei: {
      ishin: true, who: '2008年度に橋下知事が借り入れをやめ、松井・吉村知事のもとで15年かけて戻し終えた。',
      big: '5,202億円', bigSub: '借りていた積立金（減債基金）を、全額戻した',
      cond: '2001〜2007年度に借りた分を、2009年度から戻しはじめ、2023年度末に戻し終えた',
      icon: 5, by: '府', kicker: '大阪の財政', title: '借りていた積立金を戻した',
      fact: '借金を返すための積立金から借りていた5,202億円を、全額戻した',
      detail: '大阪府の決算（一般会計の実質収支）は、2025年度まで18年続けて黒字。',
      why: '将来の借金返済にそなえる。',
      src: { label: '大阪府「減債基金の復元」', url: 'https://www.pref.osaka.lg.jp/o050010/zaisei/joukyou/gennsaikikinhukugenn.html' },
    },
    taiki: {
      ishin: true, who: '大阪維新の会の吉村市長のもとで、2016年に「待機児童解消特別チーム」を設置。2025年4月に初めてゼロに。',
      big: '0人', bigSub: '大阪市の待機児童（2026年4月）',
      cond: '大阪市は2025年4月に初めてゼロ、2026年も2年続けてゼロ。大阪府全体では133人（2026年4月）',
      icon: 6, by: '市', osakaCityOnly: true, title: '待機児童ゼロ',
      fact: '2025年度に、保育の受け入れ枠を1,151人分ふやした',
      detail: '待機児童は、保育所に申しこんでも入れずに待っている子どもの数。',
      why: '働きたい人が、子どもを預けられないことがないように。',
      src: { label: '大阪市 報道発表（2026年5月）', url: 'https://www.city.osaka.lg.jp/hodoshiryo/kodomo/0000678477.html' },
    },
    hoikuryo: {
      ishin: true, who: '大阪維新の会の横山市長のもとで実施。',
      big: '0円', bigSub: '大阪市・0〜2歳の保育料',
      cond: '第2子以降は2024年9月から、第1子も2026年9月から。所得にかかわらず',
      icon: 7, by: '市', osakaCityOnly: true, title: '0〜2歳の保育料が無料に',
      fact: '認可保育所などの0〜2歳の保育料が、所得にかかわらず無料に',
      detail: '3〜5歳の保育料は、国の制度ですでに無料。',
      why: '子育てにかかるお金を減らす。',
      src: { label: '大阪市 報道発表', url: 'https://www.city.osaka.lg.jp/hodoshiryo/seisakukikakushitsu/0000669117.html' },
    },
    jukudai: {
      ishin: true, who: '大阪維新の会の橋下市長のもとで2012年に始まり、2024年10月から所得制限なしに。',
      big: '月1万円', bigSub: '大阪市・小5〜中3の塾・習いごと代',
      cond: '所得制限なし（2024年10月から）。2026年度からスマホのクーポンに',
      icon: 8, by: '市', osakaCityOnly: true, title: '塾・習いごと代を助成',
      fact: '大阪市の小学5年生〜中学3年生に、月1万円まで',
      detail: 'あなたの子どもが小学5年生になる、約10年後から使える制度。',
      why: '学びや習いごとの機会に、家の収入で差がつかないように。',
      src: { label: '大阪市 報道発表', url: 'https://www.city.osaka.lg.jp/hodoshiryo/kodomo/0000666309.html' },
    },
    kitakyu: {
      ishin: false, who: '大阪府・箕面市・北大阪急行・阪急の4者で進めた事業。',
      big: '約24分', bigSub: '箕面萱野 → 梅田（乗り換えなし）',
      cond: '2024年3月、北大阪急行が千里中央から2.5km延びて開業',
      icon: 3, by: 'いま', kicker: '街の変化', title: '北大阪急行が延びた',
      fact: '新しく箕面船場阪大前駅と箕面萱野駅ができた',
      detail: '府・箕面市・鉄道会社などが一緒に進めた事業。',
      why: '府の北部と大阪の中心部を、乗り換えなしでつなぐ。',
      src: { label: '箕面市 報道資料', url: 'https://www.city.minoh.lg.jp/kitakyu/houdou/documents/houdou_countdownboard.pdf' },
    },
    tenshiba: {
      ishin: true, who: '大阪維新の会の橋下市長のもとで、大阪市が民間の事業者を公募して実現。',
      big: '2015年', bigSub: '天王寺公園の入口が、芝生の広場「てんしば」に',
      cond: '民間の会社が運営する、芝生の広場とお店',
      icon: 10, by: '市', title: '公園の入口が芝生の広場に',
      fact: '2015年10月、天王寺公園の入口エリアが生まれ変わった',
      detail: '公園の運営に民間の力を借りた例。',
      why: '民間の力を借りて、公園をにぎわいの場にする。',
      src: { label: '「てんしば」2周年のお知らせ', url: 'https://newscast.jp/news/0122106' },
    },
  };

  // ---------- ステージ ----------
  // 各ステップの type：story / choice / quiz / card / doubt / giin / pair / budget / slider / dash
  // if：(state) => true のときだけ出す
  const STAGES = [
    {
      id: 's1', age: 15, title: '高校選び', img: 'img/s1.jpg',
      steps: [
        { type: 'story', lines: ['中学3年の冬。行きたい高校が、2つある。', '家から近い<b>公立</b>と、部活が強い<b>私立</b>。', '親は「お金は気にせんでええよ」って言うけど……。'] },
        { type: 'choice', key: 's1', q: 'どっちに行く？', options: [
          { pic: 0, label: '私立高校', sub: '部活に全力', eff: { yume: 20, yutori: -5, money: -5 }, res: '部活づけの3年間。しんどいけど、毎日が濃い。' },
          { pic: 1, label: '公立高校', sub: '近くて余裕', eff: { yutori: 15, money: 5 }, res: '通学5分。放課後はバイトと友だちと。' },
        ] },
        { type: 'quiz', card: 'shiritsu', q: '大阪の私立高校の授業料。国と大阪府の支援は、あわせて年いくらまでだと思いますか？', note: '2026年度から全学年・所得制限なし', options: ['年45万円まで', '年63万円まで', '年90万円まで'], answer: 1 },
        { type: 'doubt', q: 'そのお金、どこから出てるの？',
          voices: '財源はずっと続くの？ 公立高校の定員割れが増えた、という報道もあるけど。',
          ishin: '行財政改革で生んだお金を、教育に回すと説明しています。公立も私立も同じ条件で選ばれるよう、学校どうしが魅力を競うことも、ねらいの一つです。',
          stance: { ask: 'この説明、あなたはどう受けとった？',
            yes: 'お金の出どころまで見ると、制度の見え方が変わってきます。続けられるかどうかは、これからの毎年の予算で決まっていきます。',
            no: 'その「気になる」は大事な目線です。財源をどうするかは、選挙のときに各党の答えをくらべるポイントにもなります。' } },
      ],
    },
    {
      id: 's2', age: 18, title: '卒業したら？', img: 'img/s2.jpg',
      steps: [
        { type: 'story', lines: ['高校3年の秋。進路希望の紙が配られた。', '進学する人も、働きはじめる人もいる。'] },
        { type: 'choice', key: 's2', q: 'あなたは？', options: [
          { pic: 2, label: '大学へ行く', sub: 'もっと学びたい', eff: { yume: 15, yutori: 5, money: -5 }, res: '大阪公立大学に合格。4年間、学ぶことに集中できる。' },
          { pic: 3, label: '働きはじめる', sub: '早く稼ぎたい', eff: { money: 20, yume: 5, yutori: -10 }, res: '社会人1年目。お給料はうれしいけど、朝が早い。' },
        ] },
        { type: 'quiz', card: 'daigaku', q: '大阪公立大学などの授業料が無料になる条件は、次のうちどれでしょう？', options: ['親の年収が一定以下', '本人と親が3年以上前から府内に住んでいる', '高校の成績が上位1割'], answer: 1 },
        { type: 'story', lines: ['ところで、大阪公立大学。', 'じつは<b>府立大学</b>と<b>市立大学</b>が、一つになってできた。', '大阪には、府と市で別々に持っていたものが、ほかにもあった。'] },
        { type: 'pair' },
        { type: 'giin', at: 's2' },
      ],
    },
    {
      id: 's3', age: 22, title: 'はじめての通勤', img: 'img/s3.jpg',
      steps: [
        { type: 'story', lines: ['22歳の春。ついに一人暮らし。', '窓から見える夜景が、ちょっと自慢。', 'さて、明日からの通勤どうしよう。'] },
        { type: 'choice', key: 's3', q: 'どうやって通う？', options: [
          { pic: 4, label: '地下鉄', sub: '本も読める', eff: { yutori: 10, money: -5 }, res: '朝の御堂筋線。人は多いけど、本が1冊進む。' },
          { pic: 5, label: '自転車', sub: '節約と運動', eff: { money: 10, yutori: -5 }, res: '風が気持ちいい。夏はつらい。' },
          { pic: 6, label: '近くで働く', sub: '通勤5分', eff: { yutori: 15, yume: -5 }, res: '近いのは正義。でも、ちょっと世界がせまい？' },
        ] },
        { type: 'dash' },
        { type: 'quiz', card: 'metro', q: '2018年に民営化した「Osaka Metro」。今、株を持っているのはだれでしょう？', options: ['大阪市が100%', '大手の鉄道会社グループ', '海外の投資会社'], answer: 0 },
      ],
    },
    {
      id: 's4', age: 25, title: 'お財布ピンチ', img: 'img/s4.jpg',
      steps: [
        { type: 'story', lines: ['25歳。物価が上がって、家計簿はギリギリ。', '何を大事にして、何をがまんするか。', '……ふと思う。<b>大阪のお財布</b>って、どうやりくりしてるんやろ？'] },
        { type: 'story', img: 'img/s4_dream.jpg', pos: '47% 30%', lines: ['帰りの電車。スマホに、こんなニュースが流れてきた。', '<b>「大阪府、来年度の予算案を発表」</b>', '自分の家計でもこんなに悩むのに……。<br>もし自分が<b>知事</b>やったら、どうするんやろ？'] },
        { type: 'budget' },
        { type: 'quiz', card: 'teisu', q: '大阪府議会の議員は、2027年の選挙から73人になります。では2011年より前は、何人いたでしょう？', options: ['109人', '124人', '150人'], answer: 0 },
        { type: 'doubt', q: '議員を減らしたら、声が届きにくくならない？',
          voices: '1人しか当選しない選挙区が増えると、少ない意見が届きにくくなる。浮くお金も、予算全体から見ればわずかでしょ？',
          ishin: '議員1人あたりが受け持つ人は増えます。それでも、議会の中身で声を届けるべきだと考え、府民に改革をお願いする前に、まず自分たちの身を切ることを出発点にしています。',
          stance: { ask: '議員が減ること、あなたはどう感じた？',
            yes: '「まず自分たちから」をどう評価するか。浮いたお金が何に使われたかまで追うと、もっと判断しやすくなります。',
            no: '声の届き方は、人数だけでは決まりません。地元の議員が、どこで何を話しているかを一度のぞいてみるのも手です。' } },
        { type: 'giin', at: 's4' },
      ],
    },
    {
      id: 's5', age: 28, title: '暮らしのかたち', img: 'img/s5.jpg',
      steps: [
        { type: 'story', lines: ['28歳。まわりの暮らし方も、いろいろになってきた。', '結婚する人、子どもを育てる人、ひとりを楽しむ人。', 'どれも、その人の正解。'] },
        { type: 'choice', key: 's5', q: 'あなたのこれからは？', options: [
          { pic: 7, label: '子どもを育てる', sub: 'にぎやかに', eff: { yume: 15, yutori: -10, money: -5 }, res: '寝不足の毎日。でも、笑い声が増えた。' },
          { pic: 8, label: 'パートナーと二人で', sub: '二人の時間', eff: { yutori: 10, money: 5 }, res: '休日は二人で新しいお店めぐり。' },
          { pic: 9, label: 'ひとりで自由に', sub: '身軽に', eff: { yume: 10, yutori: 5, money: -5 }, res: '思い立ったら旅に出る。身軽さが自分らしい。' },
        ] },
        { type: 'quiz', card: 'taiki', if: s => s.choices.s5 === 0, q: '保育所に申しこんでも入れずに待っている子ども（待機児童）。大阪市では2026年4月時点で何人だと思いますか？', options: ['約1,300人', '約300人', '0人'], answer: 2 },
        { type: 'card', id: 'hoikuryo', if: s => s.choices.s5 === 0 },
        { type: 'card', id: 'jukudai', if: s => s.choices.s5 === 0 },
        { type: 'story', if: s => s.choices.s5 !== 0, lines: ['週末は、ちょっと遠出。', '北のほうに、新しい駅ができたらしい。'] },
        { type: 'quiz', card: 'kitakyu', if: s => s.choices.s5 !== 0, q: '2024年3月に延びた北大阪急行。新しい終点・箕面萱野から梅田まで、乗り換えなしで何分くらいでしょう？', options: ['約14分', '約24分', '約40分'], answer: 1 },
      ],
    },
    {
      id: 's6', age: 30, title: 'まちを見わたす', img: 'img/s6_after.jpg',
      steps: [
        { type: 'story', lines: ['30歳の休日。天王寺の芝生で、ひと休み。', '親が見せてくれた昔の写真と、まるでちがう景色。'] },
        { type: 'slider' },
        { type: 'quiz', card: 'tenshiba', q: '天王寺公園の入口が、芝生の広場「てんしば」に生まれ変わったのは何年でしょう？', options: ['2005年', '2015年', '2025年'], answer: 1 },
        { type: 'giin', at: 's6' },
      ],
    },
  ];

  // ---------- 通勤ダッシュで見つける「大阪の変化」----------
  // ishin：大阪維新の会の首長のもとで進めたと言えるか（言い切れないものは false にして、主体を事実だけ書く）
  const FINDS = {
    namba: { title: 'なんば駅前が、広場に', ishin: true,
      fact: '車が行き交っていた駅前が、約6,000㎡の歩く人の広場に（2023年）。',
      who: '地元の声を受けて、大阪維新の会の市長のもとで大阪市が整備。地元の会社や商店街と一緒に進めた。',
      src: { label: '大阪市 なんば駅前広場', url: 'https://www.city.osaka.lg.jp/toshikeikaku/page/0000610348.html' } },
    midosuji: { title: '御堂筋の側道が、歩道に', ishin: true,
      fact: '車の側道を、歩く人の道に（2016年から順に）。2037年には御堂筋全体を「人中心の道」にする目標。',
      who: '大阪維新の会の市長のもとで、大阪市が沿道の地元と進めている。',
      src: { label: '大阪市 御堂筋将来ビジョン', url: 'https://www.city.osaka.lg.jp/kensetsu/cmsfiles/contents/0000464/464479/gaiyou.pdf' } },
    homedoor: { title: '地下鉄の全駅にホームドア', ishin: false,
      fact: 'Osaka Metroの全134駅にホームドアがついた（2026年3月）。転落や接触の事故は、2006年度より9割以上減った。',
      who: 'Osaka Metro（2018年3月までは大阪市交通局）が、2006年から進めてきた。',
      src: { label: 'Osaka Metro', url: 'https://subway.osakametro.co.jp/news/news_release/20260311_platform_screen_doors.php' } },
    churin: { title: '駅前の放置自転車が激減', ishin: false,
      fact: '大阪市の駅前の放置自転車は、約5万台（2007年度）から約2,400台（2025年）に。',
      who: '大阪市が、駐輪場づくりと撤去を長く続けてきた成果。',
      src: { label: '大阪市 放置自転車の状況', url: 'https://www.city.osaka.lg.jp/kensetsu/page/0000003525.html' } },
  };
  // 通い方ごとに、道の途中で出会う順
  const FIND_ROUTE = { subway: ['midosuji', 'namba', 'homedoor'], bike: ['churin', 'midosuji', 'namba'], walk: ['namba', 'churin', 'midosuji'] };

  // ---------- 府市あわせ（神経衰弱）----------
  // 表は名前だけ。どれとどれが同じ役目かを考えてそろえる。そろうと絵が出る（icon：img/merge.jpg の何番目）
  const PAIRS = [
    { id: 'univ', icon: 0, fu: '大阪府立大学', shi: '大阪市立大学', merged: '大阪公立大学', year: '2022年' },
    { id: 'port', icon: 1, fu: '府の港（堺泉北港など）', shi: '大阪港（市）', merged: '大阪港湾局', year: '2020年' },
    { id: 'health', icon: 2, fu: '府立公衆衛生研究所', shi: '市立環境科学研究所', merged: '大阪健康安全基盤研究所', year: '2017年' },
    { id: 'tech', icon: 3, fu: '府立産業技術総合研究所', shi: '市立工業研究所', merged: '大阪産業技術研究所', year: '2017年' },
  ];

  // ---------- 見比べ（民間の力と行政の工夫で変わった場所）----------
  // ishin：大阪維新の会の首長のもとで進めたと言えるか（言い切れないものは false にして、だれが進めたかを事実だけ書く）
  const BA = [
    { id: 'tenshiba', tab: 'てんしば', name: '天王寺公園の入口', before: 'img/s6_before.jpg', after: 'img/s6_after.jpg',
      text: '2015年、芝生の広場とお店の「てんしば」に。民間の会社が運営しています。', ishin: true,
      who: '橋下市長のもとで、大阪市が民間の事業者を公募' },
    { id: 'jo', name: '大阪城公園', before: 'img/ba_jo_before.jpg', after: 'img/ba_jo_after.jpg',
      text: '2015年度から、公園全体を民間の会社が一括で管理。2017年にカフェやレストランの並ぶ施設ができました。', ishin: true,
      who: '橋下市長のもとで、大阪市が民間の事業者を募集' },
    { id: 'umekita', tab: 'うめきた', name: 'うめきた（梅田）', before: 'img/ba_umekita_before.jpg', after: 'img/ba_umekita_after.jpg',
      text: '貨物駅の跡地が、2024年に大きな公園のある街「グラングリーン大阪」に。', ishin: false,
      who: '2002年から、国・大阪府・大阪市・民間が一緒に進めてきた事業' },
  ];

  // ---------- 大阪のお財布（予算パズル）----------
  // 金額はゲーム用に単純化した「コイン」。実際の予算の大きさや比率ではない。どの道にも、よい面と課題がある。
  const BUDGET = {
    start: 4,
    reforms: [
      { id: 'teisu', ic: 4, label: '議員の数を減らす', sub: '浮くお金は小さい', coin: 1 },
      { id: 'tougou', ic: 2, label: '府と市の仕事をまとめる', sub: '効果の大きさは議論あり', coin: 2 },
      { id: 'minei', ic: 3, label: '地下鉄などを民営化', sub: '民間のやり方で経営', coin: 2 },
      { id: 'minaoshi', ic: 10, label: '施設やイベントを見直す', sub: '使う人は少しさびしい', coin: 2, manzoku: -1 },
      { id: 'zouzei', ic: 'img/icon2_0.jpg', label: '税金を上げる', sub: 'すぐ財源に。負担は増える', coin: 4, manzoku: -2 },
      { id: 'shakkin', ic: 'img/icon2_1.jpg', label: '借金をする', sub: '大きな事業ができる。返すのは未来', coin: 3, mirai: -2 },
    ],
    wishes: [
      { id: 'koukou', ic: 0, label: '高校の学費を無料に', cost: 3, manzoku: 3, kind: 'kyoiku' },
      { id: 'daigaku', ic: 1, label: '大学の学費を無料に', cost: 3, manzoku: 3, kind: 'kyoiku' },
      { id: 'kosodate', ic: 6, label: '子育てを手厚く', cost: 3, manzoku: 3, kind: 'kosodate' },
      { id: 'bousai', ic: 'img/icon2_2.jpg', label: '災害にそなえる', cost: 2, mirai: 2, kind: 'mirai' },
      { id: 'midori', ic: 10, label: 'まちに緑を', cost: 1, manzoku: 1, kind: 'machi' },
      { id: 'hensai', ic: 5, label: '借金を返す', cost: 2, mirai: 3, kind: 'mirai' },
    ],
    // あなたの予算タイプ（いちばんお金を回した分野で決める）
    types: {
      kyoiku: ['教育投資型', '学びにお金を回しました。成果が出るのは少し先。'],
      kosodate: ['子育て応援型', '子育て世代を手厚く支えました。'],
      mirai: ['未来そなえ型', '災害や借金など、将来へのそなえを大事にしました。'],
      machi: ['まちづくり型', '暮らしの心地よさを大事にしました。'],
      bal: ['バランス型', 'いろいろな分野に少しずつ回しました。'],
    },
    how: {
      kaikaku: '改革でお金を作りました。時間と、反対する人への説明が必要です。',
      zouzei: '税金でお金を作りました。すぐ財源になる一方、みんなの負担は増えます。',
      shakkin: '借金でお金を作りました。大きなことができる一方、返すのは未来の大阪です。',
    },
  };

  // ---------- 人生タイプ（img/types.png の何番目）----------
  const TYPES = {
    yume:   { icon: 0, name: 'チャレンジャー', line: 'やりたいことに、まっすぐ。遠回りも全部ネタにする人生。' },
    yutori: { icon: 1, name: 'マイペース名人', line: '自分の時間を大切に。まわりにも余裕をくばれる人。' },
    money:  { icon: 2, name: 'しっかり者', line: '先を読んで、着実に。いざというとき頼られる人。' },
    bal:    { icon: 3, name: 'バランサー', line: '夢も、余裕も、お金も。ちょうどいいを見つける天才。' },
  };

  // ---------- 大阪維新の会の考え方（エンディング）----------
  const IDEAS = [
    { ic: 4, t: 'まず、自分たちから', ex: ['teisu', 'zaisei'], d: '改革をお願いする前に、議員の数や給料を減らす。「身を切る改革」と呼んでいる。' },
    { ic: 1, t: '未来への投資は、教育から', ex: ['shiritsu', 'daigaku', 'jukudai', 'hoikuryo'], d: '家の収入で学びに差がつかないように。高校・大学の授業料の無償化を進めてきた。' },
    { ic: 2, t: '府と市が、力を合わせる', ex: ['fushiawase', 'metro'], d: '府と市で別々だった大学や港などを、一緒に運営する。' },
  ];

  // ---------- 議員版（?giin=〇〇 で切りかえ）----------
  // 写真とメッセージは本人の確認がとれたものだけを入れる。いまは仮の枠。
  const GIIN = {
    izumi: {
      name: '泉 大介', role: '大阪維新の会　枚方市議会議員', photo: 'img/giin_izumi.jpg', initial: '泉',
      // 写真と本人の言葉は公式サイト（https://www.izumi-daisuke.net/）より。言葉は原文のまま、言いかえない。本人の書きおろしの言葉をもらったら差しかえる
      from: '泉 大介 公式サイトより',
      lines: {
        s2: { kicker: '泉 大介の重点政策', text: '「０歳児から２２歳まで教育の完全無償化を目指します。」' },
        s4: { kicker: '大阪維新の会 枚方市議会議員団の実績', text: '議員報酬の削減（6％）<br><b>月額66万9000円<br>⇒ 62万8800円</b>', sub: '活動実績【2019-2023】より' },
        s6: { kicker: '泉 大介の重点政策', text: '「地域の声に耳を傾け、住民目線の街づくりを！」', sub: '枚方市駅周辺の再整備の推進など' },
      },
      message: '「『地域が主役』の政治をとり戻す!」\n「地域の課題は地域で解決！」',
      links: [{ label: '泉 大介 公式サイト', url: 'https://www.izumi-daisuke.net/' }],
    },
  };

  const PARTY = {
    name: '大阪維新の会',
    message: 'ここまで遊んでくれて、ありがとうございます。\n今日出会った制度は、どれも「大阪をもっと暮らしやすく」と考えて、議会で話し合って決めてきたものです。賛成も反対もあって当然。あなたはどう思いましたか？',
    url: 'https://oneosaka.jp/',
  };

  const SOURCES_NOTE = '2026年10月時点の情報です。「いまの制度がこの先も続いたら」という仮定で作っています。ゲームのために、お金の仕組みなどを単純にしているところがあります。「受けられる支援」は国の制度の分を含まない目安です。制度の条件は、それぞれの出典でご確認ください。';

  return { CARDS, STAGES, PAIRS, BA, BUDGET, FINDS, FIND_ROUTE, TYPES, IDEAS, GIIN, PARTY, SOURCES_NOTE };
})();
