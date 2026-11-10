/* ===== spd-core.js：SPD エディタの共通の処理（v1.25.0） =====
   spd-editor.html（学生用）と spd-log-viewer.html（先生用の集計画面）が <script src> で読む。
   画面（DOM）には触れず、マスのデータ（{ "x,y": 値 } の形。以下 d）を受け取って結果を返す関数だけを置く。
   spd-editor.html と同じフォルダに置く（root・1-python・2-java・3-C の4箇所に同じものを置く）。
   設計：docs/作業ログの設計.md の 3 章（最低限の入力量）・4.5（指紋）・7.1（切り出すもの） */
const SPD_CORE_VERSION = "1.26.0";

/* ===== グリッドの大きさ ===== */
const COLS = 90, ROWS = 500;

/* ===== マスの値 ===== */
const key = (x, y) => x + "," + y;
const isHalf = ch => !!ch && ch.charCodeAt(0) <= 0x7f;
const isQuote = ch => ch === '"' || ch === "'";
/* パディングの印（TX-21・v1.24.0）。半角が奇数個続く並びに入れる詰め物を、利用者が打った半角空白と
   区別してマスに保存する。isHalf() が真になる ASCII の制御文字を使い、表示では空白として描く。
   Export・テキストランの取り出しでは、モードに関係なく取り除く（EI-15） */
const PAD = "\u001F";
const unpad = s => s.split(PAD).join("");
const isBlankCell = v => !v || /^[\s　\u001F]+$/.test(v);   // 空マス・空白（とパディング）だけのマス

/* ===== タブ展開 =====
   タブ(U+0009)は isHalf() が真になるため、そのままだと「普通の半角文字」として
   隣の文字と 1 マスにペアリングされてしまう（cell は white-space:pre / overflow:hidden
   なのでタブが幅を食い、相方の文字が欄外へ押し出されて見えなくなる）。
   Eclipse など外部エディタから貼り付けたタブインデントを正しく扱うため、
   取り込み口（Import・文字入力欄）でタブ幅 TABSIZE の半角空白へ展開しておく。
   タブ位置は文字列（＝行）の先頭から数える（Eclipse と同じ数え方）。 */
const TABSIZE = 4;
function expandTabs(s){
  if (s.indexOf("\t") < 0) return s;
  let out = "", col = 0;
  for (const ch of s){
    if (ch === "\t"){
      const n = TABSIZE - (col % TABSIZE);
      out += " ".repeat(n); col += n;
    } else if (ch === "\n"){
      out += ch; col = 0;
    } else {
      out += ch; col++;
    }
  }
  return out;
}

/* ↻（for/while ループ記号）・▽（stream 処理記号）も下方向アンカー
   ＝記号の直下から │ を伸ばしてブロックを作る */
const LINE_DOWN = new Set(["┌","┐","├","┤","┬","┼","│","◇","〇","↻","▽"]);
const LINE_UP   = new Set(["└","┘","├","┤","┴","┼","│","◇","〇"]);
/* 上方向へ親ノードへ接続する罫線だけの集合。
   ◇（分岐/switch/match）・〇（try/catch）は「ブロックの開始記号」で下方向へ
   伸ばすだけなので上へは接続しない。上にあるテキストは親ではなく兄弟ノードの
   内容なので、そこへ │ を誤補完しないよう LINE_UP から ◇・〇 を除外する。 */
const LINE_UP_CONNECT = new Set(["└","┘","├","┤","┴","┼","│"]);

/* テキストランの境界となる罫線・制御記号セット */
const SPD_BORDER = new Set(["│","├","└","┌","┐","┘","┤","┼","─","◇","〇","↻","←","→","⇒","┬","┴","▽"]);

/* ===== ツール定義 ===== */
/* 罫線（─）の直後には空白を置かない方針のため、シンボルも ─ とラベルを詰めて定義する
   （ボタン表示・スタンプ出力ともにこの文字列を使う） */
const JAVA_SYMBOLS = [
  "◇─","└─else","↻─for:","↻─while:",
  "break","continue","◇─switch:","├─case","└─default","〇─try:","〇─catch:",
  /* Java 専用：λ():＝ラムダ式、▽─stream:＝ストリーム処理（v1.11.0） */
  "λ():","▽─stream:"
];
const PYTHON_SYMBOLS = [
  "◇─","└─else","↻─for:","↻─while:",
  "break","continue","◇─match:","├─case","└─default","〇─try:","〇─except:"
];
/* C 用シンボル。Java 用から 〇─try: / 〇─catch:（例外処理）を除いたもの */
const C_SYMBOLS = [
  "◇─","└─else","↻─for:","↻─while:",
  "break","continue","◇─switch:","├─case","└─default"
];
/* Thymeleaf 用シンボル（v1.21.0）。画面の部品を ［］ で示すラベル。罫線は付けない */
const THYMELEAF_SYMBOLS = [
  "［見出し］","［小見出し］","［文字］","［段落］","［フォーム］","［リンク］",
  "［表（行）］","［表（列）］","［画像］"
];
const THYMELEAF_TITLES = {
  "［見出し］":   "見出し（h1・h2 など、ページの表題）",
  "［小見出し］": "小見出し（h3〜h6 など、区画の表題）",
  "［文字］":     "文字（span など、文中の短い文字列や値の表示）",
  "［段落］":     "段落（p。ひとまとまりの文章）",
  "［フォーム］": "フォーム（form。入力内容を送信する。送信先は → で示す）",
  "［リンク］":   "リンク（a。別のページへ移動する。移動先は → で示す）",
  "［表（行）］": "表（行）（1行に1項目を並べる表。ラベルと値の組を縦に並べる）",
  "［表（列）］": "表（列）（1列に1項目を並べる一覧表。データの件数だけ行を繰り返す）",
  "［画像］":     "画像（img）"
};
/* 括弧記号（Thymeleaf・v1.21.0。（） は v1.26.0）。配置後のカーソルは括弧の中央に置く（追記しやすいように） */
const BRACKET_SYMBOLS = ["（）","＜＞","{}","<<>>"];
const BRACKET_TITLES = {
  "（）":  "（）（丸括弧）",
  "＜＞":  "＜＞（部品の種類。例：送信＜submit＞）",
  "{}":   "{}（変数・式。例：{変数}）",
  "<<>>": "<<>>（画像サイズ・CSS の指定）"
};
/* 罫線記号グループ（2段目の左側に配置）。Java / C は ┬・┴ を右端に追加 */
const LINE_SYMBOLS = ["│","─","└─","├─","┬─"];
const LINE_SYMBOLS_JAVA = ["│","─","└─","├─","┬─","┬","┴"];
/* 矢印記号グループ（2段目、罫線グループの右に配置）。
   Java は 送る →・入力 ⇒ と 継承 ─⊳・実装 ---⊳ を含む。C は 代入 ← のみ（継承・実装は除外） */
const ARROW_SYMBOLS_JAVA   = ["←","→","⇒","─⊳","---⊳"];
const ARROW_SYMBOLS_PYTHON = ["←","->"];
const ARROW_SYMBOLS_C      = ["←"];
/* Thymeleaf は罫線グループと区切らずに → と括弧記号を続ける（v1.21.0） */
const ARROW_SYMBOLS_THYMELEAF = ["→", ...BRACKET_SYMBOLS];
/* 言語モード（ラジオの並び順）。java は JavaSE（保存済みのファイルと合わせるため値は "java" のまま・v1.22.0） */
const LANGS = ["java", "spring", "thymeleaf", "python", "c"];
const LANG_NAMES = { java: "JavaSE", spring: "Spring", thymeleaf: "Thymeleaf", python: "Python", c: "C" };
/* Spring は JavaSE と同じツールバー・Export・Import（v1.22.0） */
const isJavaLang = lang => lang === "java" || lang === "spring";

/* 言語ごとのボタンの並び（ツールバーの描画と、最低限の入力量の R1 が共に使う）。
   symbols＝1段目の言語別シンボル、lines＝罫線、arrows＝矢印（Thymeleaf は → と括弧記号） */
function toolSymbols(lang){
  return {
    symbols: lang === "python"    ? PYTHON_SYMBOLS
           : lang === "c"         ? C_SYMBOLS
           : lang === "thymeleaf" ? THYMELEAF_SYMBOLS
           : JAVA_SYMBOLS,
    lines:   (lang === "python" || lang === "thymeleaf") ? LINE_SYMBOLS : LINE_SYMBOLS_JAVA,
    arrows:  lang === "python"    ? ARROW_SYMBOLS_PYTHON
           : lang === "c"         ? ARROW_SYMBOLS_C
           : lang === "thymeleaf" ? ARROW_SYMBOLS_THYMELEAF
           : ARROW_SYMBOLS_JAVA
  };
}

/* ===== │ 自動補完 ===== */
/* 指定マスがテキスト（罫線・SPD記号でない実内容）かどうかを判定する。
   自動補完の │ がテキストを横断して引かれるのを防ぐために使う。
   空白だけのマス・罫線・SPD記号（SPD_BORDER）はテキストとみなさない。 */
function isTextCell(x, y, d){
  const v = d[key(x, y)];
  if (v === undefined) return false;
  if (/^[\s　]+$/.test(v)) return false;          // 空白だけのマスは無視
  if (v.length === 1 && SPD_BORDER.has(v)) return false; // 罫線・SPD記号はテキストでない
  return true;                                    // それ以外（全角/半角テキスト）はテキスト
}
function colFill(x, d){
  const anchors = [];
  for (let y = 0; y < ROWS; y++){
    const v = d[key(x, y)];
    if (!v || v.length !== 1) continue;
    if (!LINE_DOWN.has(v) && !LINE_UP.has(v)) continue;
    // ◇（switch/match を含む）も ↻ と同様、記号の直下から │ を伸ばす方針のため
    // 通常アンカーとして扱う（旧 switch/match 除外は撤廃）
    anchors.push(y);
  }
  const fill = [];
  for (let i = 0; i < anchors.length - 1; i++){
    const ya = anchors[i], yb = anchors[i+1];
    const va = d[key(x, ya)], vb = d[key(x, yb)];
    if (!LINE_DOWN.has(va) || !LINE_UP.has(vb)) continue;
    // ◇ と 〇 は異なる種類なので相互に補完しない
    if ((va === "◇" && vb === "〇") || (va === "〇" && vb === "◇")) continue;
    // 下側アンカーが ─◇ / ─〇（左隣に ─ を持つ分岐/例外の開始記号）の場合、
    // それは左の親スパインにぶら下がる独立したブロック（単独の if 文など）であり、
    // 上の ◇/〇 の else-if 的な継続ではない。よって縦連結しない。
    // （else-if は下側が ◇─＝左隣に ─ を持たず ◇ が直接スパイン位置に来るので従来どおり補完する）
    if ((vb === "◇" || vb === "〇") && d[key(x - 1, yb)] === "─") continue;
    // アンカー間の「補完する列」にテキストがあれば、テキストを横断する補完はしない
    // （スパイン列が空＝テキストが右に寄っている入れ子構造の行は従来どおり補完する）
    let crossesText = false;
    for (let y = ya + 1; y < yb; y++){
      if (isTextCell(x, y, d)){ crossesText = true; break; }
    }
    if (crossesText) continue;
    for (let y = ya+1; y < yb; y++) fill.push(y);
  }
  // 上方向アンカー（└ ┘ ├ ┤ ┴ ┼ │）は、真上のテキスト（＝親ノード）まで
  // 空きマスを │ でつなぐ。行挿入などで親と子の間に空きができても接続を保つため。
  // 直上の内容がテキストの場合だけ接続し、テキストを横断はしない（空きマスのみ補完）。
  // ◇・〇 は分岐/例外の開始記号で、上の兄弟テキストへ誤接続しないよう対象外。
  for (let y = 0; y < ROWS; y++){
    if (!LINE_UP_CONNECT.has(d[key(x, y)])) continue;
    let ya = y - 1;
    while (ya >= 0 && d[key(x, ya)] === undefined) ya--;
    if (ya < 0) continue;            // 上に内容がない
    if (ya === y - 1) continue;      // 隙間なし（直上に内容あり）
    if (!isTextCell(x, ya, d)) continue;// 直上の内容がテキストのときだけ接続（親ノード）
    for (let yy = ya + 1; yy < y; yy++) fill.push(yy);
  }
  return fill;
}

/* ===== 半角ランのパディング位置（TX-21・v1.17.0） =====
   半角は2文字で1マスに詰めるため、半角が奇数個続く並び（半角ラン）には
   半角空白1個のパディングが必ず入る。その位置を前後のマスで決める：
     ・前後の一方だけが空き側（空マス・空白・罫線記号・行端）なら、空き側に置く。
       全角文字に接する側には置かない（.青 → " .青"／"あいう" → ' "あいう"'。
       クラス名や文字列の中に空白を入れない）
     ・前後とも空き → 末尾（従来どおりの左詰め）
     ・前後とも全角文字 → 末尾。ただし先頭が右側の語に付く記号（HEAD_PAD_CHARS）か開始引用符なら先頭
     ・引用符1文字だけのランは従来どおり奇偶判定（TX-11：開始=先頭、終了=末尾）
   文字入力（flush）・テキストラン編集（applyTextRunEdit）・Import（parseSPDText）が
   同じ判定を使い、テキストランの取り出し（extractTextRun）はその逆でパディングを除く。 */
const isOpenSide = v => isBlankCell(v) || SPD_BORDER.has(v);
/* 右側の語に付く記号（TX-21・v1.17.1）。前後とも全角文字に挟まれた半角ランがこれで始まるときは、
   パディングを先頭に置いて記号を右の語に付ける（例：［.青色］ → ［ .青色］。CSS のクラス名） */
const HEAD_PAD_CHARS = new Set([".", "{", "$", "#", "~", "%", "!", "&", "(", "[", "<", "@"]);
/* run：奇数長の半角ラン、leftV / rightV：前後のマス（文字）、opening：run[0] が開始引用符か。
   true なら先頭（左）にパディングを置く */
function padAtHead(run, leftV, rightV, opening){
  if (run.length === 1 && isQuote(run)) return opening;
  const lo = isOpenSide(leftV), ro = isOpenSide(rightV);
  if (lo !== ro) return lo;
  return !lo && (HEAD_PAD_CHARS.has(run[0]) || (isQuote(run[0]) && opening));
}

/* ===== Import 用：SPD テキストをセル配列へ解析 =====
   戻り値 { cells:[{x,y,v}], width, height }（x,y は左上(0,0)起点の相対位置） */
function parseSPDText(text){
  const lines = text.split(/\r?\n/);
  const cells = [];
  let width = 0;
  const height = Math.min(lines.length, ROWS);
  for (let y = 0; y < lines.length && y < ROWS; y++){
    const line = expandTabs(lines[y]);   // タブインデントを半角空白へ（外部エディタからの貼り付け対策）
    let x = 0, i = 0;
    let dqCount = 0, sqCount = 0;  // 行ごとに " ' の出現回数をカウント
    let inIndent = true;          // インデント領域判定（│ と半角空白で構成。半角空白2個＝空マス）
    let prevHalf = false;         // 直前のセルが半角か（＝半角ランの途中か）
    let leftV;                    // 直前のセルの内容（空セルは undefined。パディング位置の判定用・TX-21）
    const countQuote = c => { if (c === '"') dqCount++; else if (c === "'") sqCount++; };
    while (i < line.length && x < COLS){
      const ch = line[i];
      const next = line[i+1];
      if (ch === "　"){           // 全角空白＝空セル
        x++; i++; prevHalf = false; leftV = undefined;
      } else if (inIndent && ch === " " && (next === " " || !isHalf(next))){
        // インデントの半角空白：2個で1マス分の空セル（格納しない）。
        // 奇数個の最後の1個の直後に半角文字が続くときは、先頭パディング（" ." など・TX-21）
        // として半角ランの側で読む
        x++; i += (next === " ") ? 2 : 1; prevHalf = false; leftV = undefined;
      } else if (isHalf(ch)){         // ASCII → 半角2文字で1セル
        inIndent = false;
        // 半角ランの先頭で長さが奇数なら、パディングの位置を前後のセルで決める（TX-21）
        let headPad = false;
        if (!prevHalf){
          let j = i;
          while (j < line.length && isHalf(line[j])) j++;
          if ((j - i) % 2 === 1){
            const opening = isQuote(ch) && (ch === '"' ? dqCount : sqCount) % 2 === 0;
            headPad = padAtHead(line.slice(i, j), leftV, line[j], opening);
          }
        }
        let v;
        if (headPad){
          v = PAD + ch; countQuote(ch); i++;           // 先頭パディング
        } else if (next !== undefined && isHalf(next)){
          v = ch + next; countQuote(ch); countQuote(next); i += 2;   // ペア
        } else {
          v = ch + PAD; countQuote(ch); i++;           // 末尾パディング
        }
        cells.push({ x, y, v });
        x++; prevHalf = true; leftV = v;
      } else {                        // 全角文字＝1セル
        if (ch !== "│") inIndent = false;  // │ はインデント継続、それ以外で終了
        cells.push({ x, y, v: ch });
        x++; i++; prevHalf = false; leftV = ch;
      }
      if (x > width) width = x;
    }
  }
  return { cells, width, height };
}

/* ===== マスの並びとデータの変換 ===== */
/* parseSPDText() の cells（[{x,y,v}]）を、(ox,oy) を左上とした d に直す。グリッドの外は捨てる */
function cellsToData(cells, ox, oy){
  const d = {};
  for (const { x, y, v } of cells){
    const tx = x + (ox || 0), ty = y + (oy || 0);
    if (tx < COLS && ty < ROWS) d[key(tx, ty)] = v;
  }
  return d;
}
/* d の矩形 [x1,y1,x2,y2] の中のマスを、左上 (x1,y1) を (0,0) とした cells にする */
function dataToCells(d, r){
  const cells = [];
  for (const k in d){
    const [x, y] = k.split(",").map(Number);
    if (r && (x < r[0] || y < r[1] || x > r[2] || y > r[3])) continue;
    cells.push({ x: x - (r ? r[0] : 0), y: y - (r ? r[1] : 0), v: d[k] });
  }
  return cells;
}

/* ===== 最低限の入力量（作業ログ・設計 3 章） =====
   d を打ち込むのに最低限必要な操作の量を、ボタン（btn）と文字（chr）に分けて数える。
     R1 スタンプ（2文字以上のボタン）は、行を左から読んで最も長く一致したものを 1 回
     R2 スタンプに含まれない単文字の記号（SPD_BORDER）は 1 マス 1 回
     R3 │ は、そのマスだけを空けたとき自動補完（colFill）で現れるなら 0、現れなければ 1
     R4 そのほかの文字は 1 字 1 単位（全角・半角とも。打った空白も 1。パディングの印は 0）
     R5 Thymeleaf の括弧（（）・{}・<<>>・＜＞）は開きで 1 回、閉じは 0。中の文字は R4
     R6 スタンプの一覧は lang のもの
   空マスとインデントは数えない。自動補完の │（autoSet）は d に無いので数えない。
   迷う場合は少なめに数える（正当な学生を疑わない方向・設計 2.2） */
const STAMP_CACHE = {};
function stampsOf(lang){
  if (STAMP_CACHE[lang]) return STAMP_CACHE[lang];
  const t = toolSymbols(lang);
  const list = [...new Set([...t.symbols, ...t.lines, ...t.arrows])]
    .filter(s => s.length >= 2 && !BRACKET_SYMBOLS.includes(s))
    .sort((a, b) => b.length - a.length);              // 最長一致のため長い順
  return STAMP_CACHE[lang] = list;
}
const GAP = "\u0000";                                    // 空マス（スタンプをまたがせない）
function countMinUnits(d, lang){
  const stamps = stampsOf(lang);
  const thy = lang === "thymeleaf";
  const w = Object.assign({}, d);                        // R3 の判定で 1 マスずつ空けるための写し
  let maxX = -1, maxY = -1;
  for (const k in w){ const [x, y] = k.split(",").map(Number); if (x > maxX) maxX = x; if (y > maxY) maxY = y; }
  let btn = 0, chr = 0;
  for (let y = 0; y <= maxY; y++){
    // 行を1本の文字列にする（パディングの印は除き、空マスは GAP）。xs[i] は s[i] のマスの x
    let s = ""; const xs = [];
    for (let x = 0; x <= maxX; x++){
      const v = w[key(x, y)];
      if (!v){ s += GAP; xs.push(x); continue; }
      for (const ch of v){ if (ch !== PAD){ s += ch; xs.push(x); } }
    }
    let i = 0;
    while (i < s.length){
      const ch = s[i];
      if (ch === GAP){ i++; continue; }
      const st = stamps.find(p => s.startsWith(p, i));   // R1
      if (st){ btn++; i += st.length; continue; }
      if (thy){                                          // R5
        if (s.startsWith("<<", i)){ btn++; i += 2; continue; }
        if (s.startsWith(">>", i)){ i += 2; continue; }
        if (ch === "{" || ch === "＜" || ch === "（"){ btn++; i++; continue; }
        if (ch === "}" || ch === "＞" || ch === "）"){ i++; continue; }
      }
      if (ch === "│"){                                   // R3
        const k = key(xs[i], y), v = w[k];
        delete w[k];
        if (!colFill(xs[i], w).includes(y)) btn++;
        w[k] = v;
        i++; continue;
      }
      if (SPD_BORDER.has(ch)) btn++; else chr++;         // R2・R4
      i++;
    }
  }
  return { btn, chr };
}
/* parseSPDText() の cells の最低限の入力量（Import・ファイルを開く・スケルトンなどで入ったブロック） */
function countCellsUnits(cells, lang){
  return countMinUnits(cellsToData(cells), lang);
}

/* ===== 指紋（設計 4.5） =====
   マスの並びから 32 ビットの FNV-1a を作り、8 桁の 16 進で返す。自分で Export したものの再 Import と、
   外からの持ち込みを見分けるのに使う（改ざん対策ではない）。
   Export の囲み記号や余白の詰め方に左右されないよう、空白だけのマスを除き、内容のある左上を (0,0) に
   そろえ、パディングの印を除いた値で作る */
function spdHash(cells){
  const list = cells.filter(c => !isBlankCell(c.v));
  let mx = Infinity, my = Infinity;
  for (const c of list){ if (c.x < mx) mx = c.x; if (c.y < my) my = c.y; }
  const str = list.map(c => (c.y - my) + "," + (c.x - mx) + "=" + unpad(c.v))
                  .sort().join("\n");
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++){
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
