// ============================================================
// PDF 賽程表匯入：把「單淘汰樹狀賽程表」PDF 轉成可操作的賽程
// ------------------------------------------------------------
// 支援的版面（例：115三對三籃球賽賽程表.pdf）：
//   ・最上方大字標題
//   ・每場比賽標示【場次】、時間（10:10~10:20）、場地【A】，置中於該場兩條分支上方
//   ・最下方一排隊伍框（隊名可直書），框下方是籤號 1、2、3…
//   ・冠軍戰與季殿軍賽並列在最上層（上面那行是冠亞軍賽，下面那行是季殿軍賽）
// PDF 必須是文字型（可選取文字），掃描圖片檔無法辨識。
// ============================================================
(function (root) {
  'use strict';

  const PDFJS_VER = '3.11.174';
  const PDFJS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}/`;

  const RE_ID = /^【\s*(\d+)\s*】/;
  const RE_TIME = /(\d{1,2}[:：]\d{2})\s*[~～\-－–]\s*(\d{1,2}[:：]\d{2})/;
  const RE_COURT_ONLY = /^【\s*([A-Za-zＡ-Ｚａ-ｚ]{1,2})\s*】$/;
  const RE_COURT_TAIL = /【\s*([A-Za-zＡ-Ｚａ-ｚ]{1,2})\s*】\s*$/;
  const RE_DIGITS = /^\d+$/;

  function fmtTime(m) {
    return m ? `${m[1].replace('：', ':')}~${m[2].replace('：', ':')}` : '';
  }

  /**
   * items: [{ str, x, y, w, size }]，x/y 為 PDF 座標（y 向上），x 為字串左緣，w 為寬度
   * 回傳 { title, teams: [...依籤號排序], layout: { matches: [...] } }
   */
  function parseBracketItems(rawItems) {
    const items = rawItems
      .filter(i => i && typeof i.str === 'string' && i.str.trim())
      .map(i => ({ str: i.str.trim(), x: i.x + (i.w || 0) / 2, y: i.y, size: i.size || 0 }));
    if (!items.length) throw new Error('PDF 裡沒有可讀取的文字（可能是掃描圖片檔）。');

    // 1. 標題：字級最大的文字
    const maxSize = Math.max(...items.map(i => i.size));
    const title = items
      .filter(i => i.size >= maxSize - 0.5)
      .sort((a, b) => b.y - a.y || a.x - b.x)
      .map(i => i.str).join('');

    // 2. 場次標籤
    const labels = items.filter(i => RE_ID.test(i.str));
    if (labels.length === 0) throw new Error('找不到場次編號（如【1】、【2】）。');
    const used = new Set(labels);
    const matches = labels.map(l => {
      const id = Number(l.str.match(RE_ID)[1]);
      let time = fmtTime(l.str.match(RE_TIME));
      let court = (l.str.replace(RE_ID, '').match(RE_COURT_TAIL) || [])[1] || '';
      const near = (re, dyMax) => items
        .filter(i => !used.has(i) && re.test(i.str) && Math.abs(i.x - l.x) < 14 && i.y < l.y && l.y - i.y < dyMax)
        .sort((a, b) => b.y - a.y)[0];
      if (!time) {
        const t = near(RE_TIME, 28);
        if (t) { time = fmtTime(t.str.match(RE_TIME)); used.add(t); }
      }
      if (!court) {
        const c = near(RE_COURT_ONLY, 48);
        if (c) { court = c.str.match(RE_COURT_ONLY)[1]; used.add(c); }
      }
      return { id, x: l.x, y: l.y, time, court: court.toUpperCase() };
    });
    const ids = new Set();
    matches.forEach(m => {
      if (ids.has(m.id)) throw new Error(`場次【${m.id}】重複出現。`);
      ids.add(m.id);
    });

    // 3. 籤位：場次資訊下方最低的一排純數字；隊名是籤號上方、同一欄的文字
    const metaBottom = Math.min(...[...used].map(i => i.y));
    const below = items.filter(i => !used.has(i) && i.y < metaBottom - 4);
    if (!below.length) throw new Error('找不到最下方的隊伍籤位。');
    const minY = Math.min(...below.map(i => i.y));
    const nums = below
      .filter(i => Math.abs(i.y - minY) < 3 && RE_DIGITS.test(i.str))
      .sort((a, b) => a.x - b.x);
    if (nums.length < 2) throw new Error('找不到隊伍框下方的籤號（1、2、3…）。');
    const slots = nums.map(n => ({ n: Number(n.str), x: n.x, chars: [] }));
    slots.forEach((s, i) => {
      if (s.n !== i + 1) throw new Error(`籤號不連續：第 ${i + 1} 個位置標示為 ${s.n}。`);
    });
    const gap = Math.min(...slots.slice(1).map((s, i) => s.x - slots[i].x));
    below.filter(i => !nums.includes(i)).forEach(i => {
      let best = null, bestD = Infinity;
      slots.forEach(s => { const d = Math.abs(s.x - i.x); if (d < bestD) { bestD = d; best = s; } });
      if (best && bestD < gap / 2) best.chars.push(i);
    });
    const teams = slots.map(s => {
      const name = s.chars.sort((a, b) => b.y - a.y || a.x - b.x).map(c => c.str).join('').replace(/\s+/g, '');
      return name || `第${s.n}籤`;
    });
    const dup = teams.find((t, i) => teams.indexOf(t) !== i);
    if (dup) throw new Error(`隊名「${dup}」重複，請確認 PDF 內容。`);

    // 4. 由下往上重建樹狀結構：每場比賽取左右最接近、尚未晉級的節點
    const sortedTop = [...matches].sort((a, b) => b.y - a.y);
    const finalM = sortedTop[0];
    const second = sortedTop[1];
    const bronzeM = (second && Math.abs(second.y - finalM.y) < 30 && Math.abs(second.x - finalM.x) < 25) ? second : null;

    let free = slots.map(s => ({ ref: { slot: s.n }, x: s.x }));
    const out = [];
    const take = (m) => {
      const left = free.filter(f => f.x < m.x - 1).sort((a, b) => b.x - a.x)[0];
      const right = free.filter(f => f.x > m.x + 1).sort((a, b) => a.x - b.x)[0];
      if (!left || !right) throw new Error(`無法判斷場次【${m.id}】的對戰雙方。`);
      free = free.filter(f => f !== left && f !== right);
      return [left.ref, right.ref];
    };
    matches
      .filter(m => m !== finalM && m !== bronzeM)
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .forEach(m => {
        const [a, b] = take(m);
        out.push({ id: m.id, a, b, time: m.time, court: m.court });
        free.push({ ref: { match: m.id }, x: m.x });
      });
    if (free.length !== 2) throw new Error('賽程樹狀結構不完整，冠軍戰前應剩下 2 個晉級者。');
    const [fa, fb] = take(finalM);
    out.push({ id: finalM.id, a: fa, b: fb, time: finalM.time, court: finalM.court, final: true });
    if (bronzeM) {
      if (!fa.match || !fb.match) throw new Error('季殿軍賽需要由兩場準決賽的敗者出賽。');
      out.push({ id: bronzeM.id, a: { loser: fa.match }, b: { loser: fb.match }, time: bronzeM.time, court: bronzeM.court, bronze: true });
    }
    out.sort((a, b) => a.id - b.id);
    return { title, teams, layout: { source: 'pdf', matches: out } };
  }

  // 頁籤用短名稱：「市立楊梅高中115學年度高一女生組三對三籃球賽賽程表」→「高一女生組」
  function shortLabel(title, fileName) {
    const m = (title || '').match(/(高[一二三]\S{0,3}?組)/) || (fileName || '').match(/(高[一二三][男女]生)/);
    if (m) return m[1];
    const t = (title || fileName || '匯入賽程').replace(/\.pdf$/i, '').replace(/^.*學年度/, '').replace(/賽程表$/, '');
    return t.slice(0, 10);
  }

  async function ensurePdfJs() {
    if (root.pdfjsLib) return root.pdfjsLib;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PDFJS_CDN + 'pdf.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('無法載入 PDF 解析元件，請確認網路連線。'));
      document.head.appendChild(s);
    });
    root.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_CDN + 'pdf.worker.min.js';
    return root.pdfjsLib;
  }

  // 讀取 PDF 第一頁的文字與座標
  async function extractItems(pdfjsLib, data) {
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const page = await doc.getPage(1);
    const tc = await page.getTextContent();
    return tc.items.map(it => ({
      str: it.str,
      x: it.transform[4],
      y: it.transform[5],
      w: it.width,
      size: Math.hypot(it.transform[0], it.transform[1]) || it.height
    }));
  }

  async function parsePdfFile(file) {
    const pdfjsLib = await ensurePdfJs();
    const data = new Uint8Array(await file.arrayBuffer());
    const parsed = parseBracketItems(await extractItems(pdfjsLib, data));
    parsed.label = shortLabel(parsed.title, file.name);
    return parsed;
  }

  const api = { parseBracketItems, shortLabel, extractItems, parsePdfFile };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PdfBracketImport = api;
})(typeof window !== 'undefined' ? window : globalThis);
