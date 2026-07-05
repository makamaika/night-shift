// games/hash.js … フェーズ4ミニゲーム: 基準ハッシュ表とサーバ上ファイルのMD5照合。
// 不一致1件(world.files legit:false)を特定→hash:solved。誤答2回でヒント段階開示。
(() => {
  'use strict';

  const NS = (window.NS = window.NS || {});
  NS.games = NS.games || {};

  const HINT_AFTER = 2;          // 誤答この回数でヒント開示
  const MD5_KNOWLEDGE = 'virustotal'; // MD5照合の教材カード(§12: フォレンジック照合)

  let api = null;
  let root = null;
  let els = null;
  let files = [];        // 表示用に正規化したファイル配列
  let tamperedIdx = -1;  // 改ざんファイルのインデックス
  let tries = 0;         // 誤答回数
  let solved = false;
  let hintLevel = 0;     // 0=なし, 1=更新日時ヒント, 2=強めのヒント

  // =========================================================================
  // マウント / アンマウント
  // =========================================================================
  function mount(rootEl, apiObj) {
    api = apiObj || {};
    root = rootEl;
    tries = 0;
    solved = false;
    hintLevel = 0;

    files = normalizeFiles();
    tamperedIdx = files.findIndex(f => f.legit === false);

    build();
    return true;
  }

  function unmount() {
    if (root) root.innerHTML = '';
    els = null;
    files = [];
    api = null;
  }

  // =========================================================================
  // データ正規化(world.files を安全に取り込む)
  // =========================================================================
  function normalizeFiles() {
    const src = getWorldFiles();
    const out = [];
    for (let i = 0; i < src.length; i++) {
      const f = src[i] || {};
      const path = f.path || f.name || ('/var/www/js/file-' + (i + 1) + '.js');
      const legit = f.legit === false ? false : true;
      // 基準ハッシュ(baseline)と実測ハッシュ(server)を用意する。
      // world側が baselineMd5/serverMd5 を持てば尊重、無ければ md5 を基準とし、
      // 改ざんファイルだけ server 側を変える。
      const baseline = f.baselineMd5 || f.baseMd5 || f.md5 || fakeMd5(path + ':base:' + i);
      let server;
      if (f.serverMd5) {
        server = f.serverMd5;
      } else if (legit) {
        server = baseline;                       // 正規: 一致
      } else {
        server = fakeMd5(path + ':tampered:' + i); // 改ざん: 別ハッシュ
      }
      out.push({
        path,
        legit,
        baseline: normHash(baseline),
        server: normHash(server),
        mtime: pickMtime(f, legit, i),
        note: f.note || ''
      });
    }
    return out;
  }

  function getWorldFiles() {
    const w = (api && api.world) || (window.NSD && NSD.WORLD) || null;
    if (w && Array.isArray(w.files) && w.files.length) return w.files;
    // データ未提供時のフォールバック(自己完結・構文検証用の最小データ)
    const stub = [];
    for (let i = 0; i < 10; i++) {
      const path = '/var/www/js/lib-' + String.fromCharCode(97 + i) + '.js';
      const legit = i !== 6;   // 7件目を改ざんに
      stub.push({ path, md5: fakeMd5(path), legit, id: legit ? undefined : 'tampered' });
    }
    return stub;
  }

  // 更新日時: world側にあれば使い、無ければ生成。改ざんは必ず深夜帯。
  function pickMtime(f, legit, i) {
    const raw = f.mtime || f.updated || f.modified || f.time || f.t;
    if (raw) return String(raw);
    if (!legit) {
      // 改ざんファイルは事件時刻帯(深夜)に更新されている
      return '04:0' + (i % 6) + '';
    }
    // 正規ファイルは日中〜夕方のビルド時刻に散らす
    const hh = 9 + (i % 9);              // 09〜17時
    const mm = (i * 7) % 60;
    return pad2(hh) + ':' + pad2(mm);
  }

  // =========================================================================
  // DOM 構築
  // =========================================================================
  function build() {
    root.innerHTML = '';
    const wrap = ce('div', 'ns-game ns-game--hash');

    const head = ce('div', 'ns-game__head');
    head.appendChild(ce('p', 'ns-game__kicker', '03:30 ｜ FORENSICS — INTEGRITY CHECK'));
    head.appendChild(ce('h3', 'ns-game__title', '静かすぎる — 改ざんファイルをMD5で洗い出す'));
    head.appendChild(ce('p', 'ns-game__lede',
      '公開サーバ上のJSファイルを、配布時に控えた「基準ハッシュ」と一件ずつ照合します。' +
      'ハッシュが食い違う一件が、書き換えられたファイル。クリックまたはEnter/Spaceで照合してください。'));
    wrap.appendChild(head);

    // 教材カード参照ボタン + ヒント
    const bar = ce('div', 'ns-hash__bar');
    const kBtn = ce('button', 'ns-btn ns-btn--ghost ns-hash__ref');
    kBtn.type = 'button';
    kBtn.appendChild(ce('span', 'ns-hash__ref-ico', '▣'));
    kBtn.appendChild(document.createTextNode(' MD5とハッシュ照合の教材カードを見る'));
    kBtn.addEventListener('click', openKnowledgeCard);
    bar.appendChild(kBtn);

    const counter = ce('span', 'ns-hash__counter');
    counter.setAttribute('aria-live', 'polite');
    counter.textContent = '照合: 0 / ' + files.length;
    bar.appendChild(counter);
    wrap.appendChild(bar);

    // ヒント表示領域
    const hint = ce('p', 'ns-hash__hint');
    hint.setAttribute('aria-live', 'polite');
    hint.hidden = true;
    wrap.appendChild(hint);

    // 照合テーブル(横スクロール封じ)
    const tableWrap = ce('div', 'ns-hash__table-wrap');
    const table = ce('table', 'ns-hash__table');
    table.setAttribute('aria-label', '基準ハッシュとサーバ上ファイルの照合表');

    const thead = ce('thead');
    const htr = document.createElement('tr');
    ['ファイルパス', '更新日時', '基準ハッシュ(MD5)', 'サーバ上のハッシュ', '照合'].forEach(h => {
      const th = ce('th', null, h);
      th.scope = 'col';
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);

    const tbody = ce('tbody', 'ns-hash__rows');
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    wrap.appendChild(tableWrap);

    // 結果メッセージ
    const msg = ce('p', 'ns-hash__msg', '一件ずつ照合していきましょう。');
    msg.setAttribute('aria-live', 'polite');
    wrap.appendChild(msg);

    root.appendChild(wrap);

    els = { counter, hint, tbody, msg };
    buildRows();
    updateCounter();
  }

  function buildRows() {
    els.tbody.innerHTML = '';
    files.forEach((f, idx) => {
      const tr = ce('tr', 'ns-hash__row');
      tr.dataset.idx = String(idx);
      tr.setAttribute('tabindex', '0');
      tr.setAttribute('role', 'button');
      tr.setAttribute('aria-label', f.path + ' を照合する');

      const cPath = ce('td', 'ns-hash__c-path');
      cPath.appendChild(ce('code', 'ns-hash__path', f.path));
      tr.appendChild(cPath);

      const cTime = ce('td', 'ns-hash__c-time');
      cTime.appendChild(ce('span', 'ns-hash__time', f.mtime));
      tr.appendChild(cTime);

      const cBase = ce('td', 'ns-hash__c-hash');
      cBase.appendChild(ce('code', 'ns-hash__hash', shortHash(f.baseline)));
      tr.appendChild(cBase);

      // サーバ側ハッシュは照合するまで伏せる
      const cServer = ce('td', 'ns-hash__c-hash');
      const serverCode = ce('code', 'ns-hash__hash ns-hash__hash--server', '••••••••••••');
      cServer.appendChild(serverCode);
      tr.appendChild(cServer);

      const cRes = ce('td', 'ns-hash__c-res');
      const badge = ce('span', 'ns-hash__badge', '未照合');
      badge.setAttribute('data-state', 'idle');
      cRes.appendChild(badge);
      tr.appendChild(cRes);

      tr.addEventListener('click', () => onCompare(idx));
      tr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          onCompare(idx);
        }
      });

      tr._refs = { serverCode, badge };
      els.tbody.appendChild(tr);
    });
  }

  // =========================================================================
  // 照合ロジック
  // =========================================================================
  function onCompare(idx) {
    if (solved) return;
    const tr = els.tbody.querySelector('.ns-hash__row[data-idx="' + idx + '"]');
    if (!tr) return;
    const f = files[idx];
    const refs = tr._refs;

    // サーバ側ハッシュを露出
    refs.serverCode.textContent = shortHash(f.server);
    tr.setAttribute('data-checked', '1');

    const match = f.baseline === f.server;   // legit と等価
    if (match) {
      refs.badge.textContent = '一致';
      refs.badge.setAttribute('data-state', 'match');
      tr.setAttribute('data-result', 'match');
    } else {
      refs.badge.textContent = '不一致';
      refs.badge.setAttribute('data-state', 'mismatch');
      tr.setAttribute('data-result', 'mismatch');
    }

    if (!f.legit) {
      // 正解: 改ざんファイル発見
      onFound(idx);
    } else {
      // 誤答: 正規ファイルを疑った(=不一致を探しているのに一致だった)
      tries++;
      flashMsg('このファイルは基準ハッシュと一致。改ざんはありません。', 'info');
      maybeHint();
    }
    updateCounter();
  }

  function onFound(idx) {
    solved = true;
    const tr = els.tbody.querySelector('.ns-hash__row[data-idx="' + idx + '"]');
    if (tr) {
      tr.classList.add('ns-hash__row--found');
      tr.setAttribute('data-found', '1');
    }
    const f = files[idx];
    flashMsg('発見。' + f.path + ' は基準ハッシュと食い違います。これが書き換えられたファイルです。', 'ok');

    useKnowledge(MD5_KNOWLEDGE);
    pushChat('アオイ先輩',
      'ビンゴ。たった1バイト違えばハッシュは全く別物になる——だから改ざん検知に効くの。中身を追いましょう。', 'ok');

    emit('hash:solved', { found: f.path, tries });
    if (typeof api.onDone === 'function') {
      api.onDone({ game: 'hash', found: f.path, tries });
    }

    // 他行の照合ボタンを無効化(演出の締め)
    const rows = els.tbody.querySelectorAll('.ns-hash__row');
    rows.forEach(r => {
      if (r !== tr) {
        r.setAttribute('aria-disabled', 'true');
        r.removeAttribute('tabindex');
      }
    });
  }

  function maybeHint() {
    if (hintLevel >= 2) return;
    if (tries >= HINT_AFTER && hintLevel === 0) {
      hintLevel = 1;
      showHint('ヒント: 攻撃者はいつ書き換えたでしょう? 更新日時が「深夜」のファイルに注目してみてください。');
      pushChat('アオイ先輩', '更新日時、見てみて。みんなが寝てる時間に更新されたファイルがあるはず。', 'info');
    } else if (tries >= HINT_AFTER + 2 && hintLevel === 1) {
      hintLevel = 2;
      // 改ざんファイルの更新時刻を名指しで示す(パスは伏せる)
      const t = tamperedIdx >= 0 ? files[tamperedIdx].mtime : '深夜';
      showHint('ヒント(強): 更新日時 ' + t + ' のファイルが怪しい。基準ハッシュと照合してみましょう。');
    }
  }

  function showHint(text) {
    if (!els) return;
    els.hint.hidden = false;
    els.hint.textContent = text;
    els.hint.setAttribute('data-level', String(hintLevel));
  }

  function updateCounter() {
    if (!els) return;
    const checked = els.tbody.querySelectorAll('.ns-hash__row[data-checked="1"]').length;
    els.counter.textContent = '照合: ' + checked + ' / ' + files.length;
  }

  function flashMsg(text, kind) {
    if (!els) return;
    els.msg.textContent = text;
    els.msg.setAttribute('data-kind', kind || 'info');
  }

  // =========================================================================
  // 教材カード(knowledge)参照
  // =========================================================================
  function openKnowledgeCard() {
    // まず解禁して詳細表示を促す。UIがknowledge:usedを拾って詳細を出す想定。
    useKnowledge(MD5_KNOWLEDGE);
    if (api && api.actions && typeof api.actions.unlockKnowledge === 'function') {
      api.actions.unlockKnowledge(MD5_KNOWLEDGE, { silent: false });
    }
    const card = findKnowledge(MD5_KNOWLEDGE);
    const short = card && card.short
      ? card.short
      : 'MD5はファイル内容から固定長の要約値を作る一方向関数。1バイトでも違えば値が激変するため、配布時の基準値と照合すれば改ざんを検知できる。';
    flashMsg('【教材】' + (card ? card.term + ' — ' : '') + short, 'info');
    pushChat('参考カード',
      (card ? '【' + card.term + '】' : '【ハッシュ照合】') + short, 'ref');
    emit('toast', { text: 'ナレッジ: ハッシュ照合を参照しました', kind: 'info' });
  }

  function findKnowledge(id) {
    const list = (window.NSD && Array.isArray(NSD.KNOWLEDGE)) ? NSD.KNOWLEDGE : null;
    if (!list) return null;
    for (const k of list) if (k && k.id === id) return k;
    return null;
  }

  // =========================================================================
  // 連携ヘルパ
  // =========================================================================
  function pushChat(from, text, cls) {
    emit('chat:push', { from, text, cls: cls || 'info' });
  }

  function useKnowledge(id) {
    if (!id) return;
    if (api && api.actions && typeof api.actions.useKnowledge === 'function') {
      api.actions.useKnowledge(id);
    }
  }

  function emit(name, payload) {
    if (NS.bus && typeof NS.bus.emit === 'function') NS.bus.emit(name, payload || {});
  }

  // ---- ハッシュ小物 --------------------------------------------------------
  // 表示用の疑似MD5(32桁hex)。暗号目的ではなく、データ未提供時の見た目確保用。
  function fakeMd5(seed) {
    let h1 = 0x811c9dc5, h2 = 0x1000193, h3 = 0xdeadbeef, h4 = 0x41c6ef;
    for (let i = 0; i < seed.length; i++) {
      const c = seed.charCodeAt(i);
      h1 = (h1 ^ c) * 0x01000193 >>> 0;
      h2 = (h2 + c * 0x85ebca6b) >>> 0;
      h3 = ((h3 << 5) - h3 + c) >>> 0;
      h4 = (h4 ^ (c << (i % 16))) >>> 0;
    }
    return (hex8(h1) + hex8(h2) + hex8(h3) + hex8(h4)).slice(0, 32);
  }

  function hex8(n) { return (n >>> 0).toString(16).padStart(8, '0'); }

  function normHash(h) {
    return String(h == null ? '' : h).toLowerCase();
  }

  function shortHash(h) {
    const s = String(h || '');
    if (s.length <= 20) return s;
    return s.slice(0, 10) + '…' + s.slice(-8);
  }

  // ---- 小物ユーティリティ --------------------------------------------------
  function ce(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  // ---- 公開 ----------------------------------------------------------------
  NS.games.hash = { mount, unmount };
})();
