// challenge.js — NS.challenge : 実践演習(CHALLENGE)モードのエンジン。
// NSD.CHALLENGES を #ch-list に全問描画。kind別入力UI・採点・ヒント・進捗永続化(ns-challenge-v1)。
// DOM操作は #challenge 配下のみ。データ(NSD)は参照のみ、他モジュールへ逆参照しない。
(() => {
  'use strict';

  const NS = (window.NS = window.NS || {});

  const STORE_KEY = 'ns-challenge-v1';

  // ---- 小道具 --------------------------------------------------------------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const D = () => window.NSD || {};
  const list = () => (Array.isArray(D().CHALLENGES) ? D().CHALLENGES : []);

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // ---- 進捗の永続化 --------------------------------------------------------
  const solved = new Set();

  function loadProgress() {
    solved.clear();
    let raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch (e) { raw = null; }
    if (!raw) return;
    try {
      const obj = JSON.parse(raw);
      if (obj && Array.isArray(obj.solved)) {
        obj.solved.forEach((id) => { if (typeof id === 'string') solved.add(id); });
      }
    } catch (e) {
      // 壊れた保存は破棄
      try { localStorage.removeItem(STORE_KEY); } catch (e2) { /* noop */ }
    }
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ solved: Array.from(solved) }));
    } catch (e) { /* 保存不可(容量/プライベート)でも進行は続く */ }
  }

  // ---- 正規化(text採点用) ------------------------------------------------
  // 全角英数を半角へ(任意の簡易半角化)
  function toHalfWidth(s) {
    return s.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/　/g, ' ');
  }

  function normalizeText(raw, opt) {
    const o = opt || {};
    let s = String(raw == null ? '' : raw);
    s = toHalfWidth(s);
    s = s.trim().replace(/\s+/g, ' ');
    if (o.lower) s = s.toLowerCase();
    if (o.stripSpace) s = s.replace(/\s+/g, '');
    return s;
  }

  // number採点: 数字と符号以外を除去して整数化
  function parseIntLoose(raw) {
    const s = toHalfWidth(String(raw == null ? '' : raw)).replace(/[^0-9+-]/g, '');
    if (s === '' || s === '+' || s === '-') return null;
    const n = parseInt(s, 10);
    return Number.isNaN(n) ? null : n;
  }

  // ---- 難易度(★/☆) ------------------------------------------------------
  function diffStars(diff) {
    const d = Math.max(0, Math.min(5, diff | 0));
    const wrap = el('span', 'ns-ch__diff');
    wrap.setAttribute('aria-label', '難易度 ' + d + '/5');
    for (let i = 1; i <= 5; i++) {
      const star = el('span', i <= d ? 'ns-ch__star is-on' : 'ns-ch__star');
      star.textContent = i <= d ? '★' : '☆';
      star.setAttribute('aria-hidden', 'true');
      wrap.appendChild(star);
    }
    return wrap;
  }

  // ---- artifacts 描画 ------------------------------------------------------
  function renderArtifacts(container, artifacts) {
    if (!Array.isArray(artifacts) || !artifacts.length) return;
    const box = el('div', 'ns-ch__artifacts');
    artifacts.forEach((a) => {
      if (!a || typeof a !== 'object') return;
      const art = el('div', 'ns-ch__art');
      if (a.label) art.appendChild(el('p', 'ns-ch__art-label', a.label));
      if (a.type === 'kv' && Array.isArray(a.rows)) {
        const dl = el('dl', 'ns-ch__kv');
        a.rows.forEach((row) => {
          const k = Array.isArray(row) ? row[0] : '';
          const v = Array.isArray(row) ? row[1] : '';
          dl.appendChild(el('dt', null, k == null ? '' : String(k)));
          dl.appendChild(el('dd', null, v == null ? '' : String(v)));
        });
        art.appendChild(dl);
      } else if (a.type === 'log' && Array.isArray(a.lines)) {
        const scroll = el('div', 'ns-ch__scroll');
        const pre = el('pre', 'ns-ch__log');
        pre.textContent = a.lines.map((x) => String(x == null ? '' : x)).join('\n');
        scroll.appendChild(pre);
        art.appendChild(scroll);
      } else if (a.type === 'code') {
        const scroll = el('div', 'ns-ch__scroll');
        const pre = el('pre', 'ns-ch__code');
        pre.textContent = String(a.text == null ? '' : a.text);
        scroll.appendChild(pre);
        art.appendChild(scroll);
      } else if (a.type === 'note') {
        art.appendChild(el('p', 'ns-ch__note', String(a.text == null ? '' : a.text)));
      }
      box.appendChild(art);
    });
    container.appendChild(box);
  }

  // ---- 各 kind の入力UI + 採点関数 ----------------------------------------
  // 返り値: { node, grade() => boolean, disable(), correctText } を持つコントローラ
  function buildInput(ch, cardId) {
    if (ch.kind === 'choice') return buildChoice(ch, cardId);
    if (ch.kind === 'multichoice') return buildMultiChoice(ch, cardId);
    if (ch.kind === 'text') return buildText(ch);
    if (ch.kind === 'number') return buildNumber(ch);
    if (ch.kind === 'order') return buildOrder(ch);
    // 未知kindは空(採点は常に不正解)
    return { node: el('div', 'ns-ch__input'), grade: () => false, disable() {}, correctText: '' };
  }

  function buildChoice(ch, cardId) {
    const wrap = el('div', 'ns-ch__input');
    wrap.setAttribute('role', 'radiogroup');
    const opts = Array.isArray(ch.options) ? ch.options : [];
    const inputs = [];
    const labels = [];
    opts.forEach((text, i) => {
      const label = el('label', 'ns-ch__opt');
      const input = el('input');
      input.type = 'radio';
      input.name = 'ch-' + cardId;
      input.value = String(i);
      input.className = 'ns-ch__opt-input';
      const span = el('span', 'ns-ch__opt-text', String(text));
      label.appendChild(input);
      label.appendChild(span);
      wrap.appendChild(label);
      inputs.push(input);
      labels.push(label);
    });
    const answer = ch.answer;
    return {
      node: wrap,
      grade() {
        let sel = -1;
        inputs.forEach((inp, i) => { if (inp.checked) sel = i; });
        const ok = sel === answer;
        // 選択・正解の視覚マーク
        labels.forEach((lab, i) => {
          lab.classList.remove('is-correct', 'is-wrong');
          if (i === answer) lab.classList.add('is-correct');
          else if (i === sel) lab.classList.add('is-wrong');
        });
        return ok;
      },
      disable() { inputs.forEach((inp) => { inp.disabled = true; }); },
      correctText: opts[answer] != null ? String(opts[answer]) : '',
    };
  }

  function buildMultiChoice(ch, cardId) {
    const wrap = el('div', 'ns-ch__input');
    wrap.setAttribute('role', 'group');
    const opts = Array.isArray(ch.options) ? ch.options : [];
    const answers = Array.isArray(ch.answers) ? ch.answers.slice() : [];
    const answerSet = new Set(answers);
    const inputs = [];
    const labels = [];
    opts.forEach((text, i) => {
      const label = el('label', 'ns-ch__opt');
      const input = el('input');
      input.type = 'checkbox';
      input.value = String(i);
      input.className = 'ns-ch__opt-input';
      const span = el('span', 'ns-ch__opt-text', String(text));
      label.appendChild(input);
      label.appendChild(span);
      wrap.appendChild(label);
      inputs.push(input);
      labels.push(label);
    });
    return {
      node: wrap,
      grade() {
        const chosen = new Set();
        inputs.forEach((inp, i) => { if (inp.checked) chosen.add(i); });
        // 集合完全一致
        let ok = chosen.size === answerSet.size;
        if (ok) { answerSet.forEach((i) => { if (!chosen.has(i)) ok = false; }); }
        labels.forEach((lab, i) => {
          lab.classList.remove('is-correct', 'is-wrong');
          if (answerSet.has(i)) lab.classList.add('is-correct');
          else if (chosen.has(i)) lab.classList.add('is-wrong');
        });
        return ok;
      },
      disable() { inputs.forEach((inp) => { inp.disabled = true; }); },
      correctText: answers.map((i) => (opts[i] != null ? String(opts[i]) : '')).join(' / '),
    };
  }

  function buildText(ch) {
    const wrap = el('div', 'ns-ch__input');
    const input = el('input', 'ns-ch__text');
    input.type = 'text';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');
    if (ch.placeholder) input.placeholder = String(ch.placeholder);
    wrap.appendChild(input);
    const accept = Array.isArray(ch.accept) ? ch.accept : [];
    const norm = ch.normalize || {};
    const acceptNorm = accept.map((a) => normalizeText(a, norm));
    return {
      node: wrap,
      grade() {
        const v = normalizeText(input.value, norm);
        return acceptNorm.indexOf(v) !== -1;
      },
      disable() { input.disabled = true; },
      correctText: accept.length ? String(accept[0]) : '',
      _input: input,
    };
  }

  function buildNumber(ch) {
    const wrap = el('div', 'ns-ch__input ns-ch__input--num');
    const input = el('input', 'ns-ch__text');
    input.type = 'text';
    input.setAttribute('inputmode', 'numeric');
    input.setAttribute('autocomplete', 'off');
    if (ch.placeholder) input.placeholder = String(ch.placeholder);
    wrap.appendChild(input);
    if (ch.unit) wrap.appendChild(el('span', 'ns-ch__unit', String(ch.unit)));
    const answer = typeof ch.answer === 'number' ? ch.answer : NaN;
    return {
      node: wrap,
      grade() {
        const n = parseIntLoose(input.value);
        return n !== null && n === answer;
      },
      disable() { input.disabled = true; },
      correctText: Number.isNaN(answer) ? '' : String(answer) + (ch.unit ? ' ' + ch.unit : ''),
      _input: input,
    };
  }

  function buildOrder(ch) {
    const wrap = el('div', 'ns-ch__input');
    const opts = Array.isArray(ch.options) ? ch.options : [];
    const order = Array.isArray(ch.order) ? ch.order : [];
    // 現在の並び。要素は元 options のindex。初期は 0..n-1(=表示順のまま)。
    const cur = opts.map((_, i) => i);
    const olist = el('ol', 'ns-ch__order');
    olist.setAttribute('aria-label', '並べ替え。各項目の上下ボタンで順序を変える');

    function render() {
      olist.textContent = '';
      cur.forEach((optIdx, pos) => {
        const item = el('li', 'ns-ch__order-item');
        const label = el('span', 'ns-ch__order-label', String(opts[optIdx]));
        const btns = el('span', 'ns-ch__order-btns');
        const up = el('button', 'ns-btn ns-btn--ghost ns-ch__order-btn');
        up.type = 'button';
        up.textContent = '↑';
        up.setAttribute('aria-label', (pos + 1) + '番目「' + String(opts[optIdx]) + '」を上へ');
        up.disabled = pos === 0;
        const down = el('button', 'ns-btn ns-btn--ghost ns-ch__order-btn');
        down.type = 'button';
        down.textContent = '↓';
        down.setAttribute('aria-label', (pos + 1) + '番目「' + String(opts[optIdx]) + '」を下へ');
        down.disabled = pos === cur.length - 1;
        up.addEventListener('click', () => { move(pos, -1); });
        down.addEventListener('click', () => { move(pos, 1); });
        btns.appendChild(up);
        btns.appendChild(down);
        item.appendChild(label);
        item.appendChild(btns);
        olist.appendChild(item);
      });
    }

    let locked = false;
    function move(pos, delta) {
      if (locked) return;
      const to = pos + delta;
      if (to < 0 || to >= cur.length) return;
      const tmp = cur[pos];
      cur[pos] = cur[to];
      cur[to] = tmp;
      render();
      // 移動後、同じ論理位置のボタンへフォーカスを戻す(キーボード連続操作)
      const items = olist.querySelectorAll('.ns-ch__order-item');
      const target = items[to];
      if (target) {
        const btn = delta < 0
          ? target.querySelector('.ns-ch__order-btn')            // ↑ボタン
          : target.querySelectorAll('.ns-ch__order-btn')[1];     // ↓ボタン
        // 端で disabled のときは対のボタンへ
        let f = btn;
        if (f && f.disabled) {
          const both = target.querySelectorAll('.ns-ch__order-btn');
          f = both[0] && !both[0].disabled ? both[0] : both[1];
        }
        if (f) { try { f.focus(); } catch (e) { /* noop */ } }
      }
    }

    render();
    wrap.appendChild(olist);
    return {
      node: wrap,
      grade() {
        if (cur.length !== order.length) return false;
        for (let i = 0; i < cur.length; i++) { if (cur[i] !== order[i]) return false; }
        return true;
      },
      disable() {
        locked = true;
        olist.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      },
      correctText: order.map((i) => String(opts[i])).join(' → '),
    };
  }

  // ---- カード1枚 -----------------------------------------------------------
  function renderCard(ch) {
    const art = el('article', 'ns-ch');
    art.setAttribute('aria-labelledby', 'ch-t-' + ch.id);
    if (solved.has(ch.id)) art.classList.add('is-solved');

    // ヘッダ: 番号 / 難易度 / カテゴリ / (クリア済み)
    const head = el('div', 'ns-ch__head');
    head.appendChild(el('span', 'ns-ch__num', '#' + ch.n));
    head.appendChild(diffStars(ch.diff));
    if (ch.cat) head.appendChild(el('span', 'ns-ch__cat', ch.cat));
    const solvedBadge = el('span', 'ns-ch__solved', 'クリア済み');
    solvedBadge.hidden = !solved.has(ch.id);
    head.appendChild(solvedBadge);
    art.appendChild(head);

    // タイトル / brief
    const title = el('h3', 'ns-ch__title', ch.title || '');
    title.id = 'ch-t-' + ch.id;
    art.appendChild(title);
    if (ch.brief) art.appendChild(el('p', 'ns-ch__brief', ch.brief));

    // artifacts
    renderArtifacts(art, ch.artifacts);

    // question
    if (ch.question) art.appendChild(el('p', 'ns-ch__question', ch.question));

    // 入力UI
    const ctrl = buildInput(ch, ch.id);
    art.appendChild(ctrl.node);

    // 操作行(ヒント / 採点)
    const actions = el('div', 'ns-ch__actions');
    const hintBtn = el('button', 'ns-btn ns-btn--ghost ns-ch__hintbtn');
    hintBtn.type = 'button';
    const hints = Array.isArray(ch.hints) ? ch.hints : [];
    hintBtn.textContent = 'ヒント';
    if (!hints.length) hintBtn.disabled = true;
    const gradeBtn = el('button', 'ns-btn ns-btn--primary ns-ch__gradebtn');
    gradeBtn.type = 'button';
    gradeBtn.textContent = '採点する';
    actions.appendChild(hintBtn);
    actions.appendChild(gradeBtn);
    art.appendChild(actions);

    // ヒント開示欄
    const hintBox = el('ul', 'ns-ch__hints');
    hintBox.hidden = true;
    art.appendChild(hintBox);
    let hintShown = 0;
    hintBtn.addEventListener('click', () => {
      if (hintShown >= hints.length) return;
      const li = el('li', 'ns-ch__hint', String(hints[hintShown]));
      hintBox.appendChild(li);
      hintBox.hidden = false;
      hintShown += 1;
      if (hintShown >= hints.length) {
        hintBtn.disabled = true;
        hintBtn.textContent = 'ヒントは以上';
      } else {
        hintBtn.textContent = 'ヒント(' + hintShown + '/' + hints.length + ')';
      }
    });

    // 結果欄
    const result = el('div', 'ns-ch__result');
    result.setAttribute('role', 'status');
    result.hidden = true;
    art.appendChild(result);

    let graded = false;
    function doGrade() {
      if (graded) return;
      graded = true;
      const ok = !!ctrl.grade();
      ctrl.disable();
      gradeBtn.disabled = true;
      gradeBtn.textContent = '採点済み';

      result.hidden = false;
      result.textContent = '';
      result.setAttribute('data-ok', ok ? '1' : '0');

      const verdict = el('p', 'ns-ch__verdict');
      if (ok) {
        verdict.textContent = '正解';
      } else {
        verdict.textContent = ctrl.correctText
          ? 'もう一度考えてみよう(正解: ' + ctrl.correctText + ')'
          : 'もう一度考えてみよう';
      }
      result.appendChild(verdict);

      // 正誤に関わらず explain / ref を表示
      if (ch.explain) result.appendChild(el('p', 'ns-ch__explain', ch.explain));
      if (ch.ref) result.appendChild(el('p', 'ns-ch__ref', 'この技術を学んだ回: ' + ch.ref));

      if (ok && !solved.has(ch.id)) {
        solved.add(ch.id);
        saveProgress();
        art.classList.add('is-solved');
        solvedBadge.hidden = false;
      }
      updateProgress();
    }
    gradeBtn.addEventListener('click', doGrade);

    // text/number は Enter で採点
    if (ctrl._input) {
      ctrl._input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); doGrade(); }
      });
    }

    return art;
  }

  // ---- 進捗表示 ------------------------------------------------------------
  function updateProgress() {
    const prog = $('#ch-progress');
    if (!prog) return;
    const total = list().length;
    const done = list().filter((c) => c && solved.has(c.id)).length;
    let text = done + ' / ' + total + ' クリア';
    if (total > 0 && done === total) text += ' — 全問制覇。夜勤明けの手練、確かに見た。';
    prog.textContent = text;
  }

  // ---- ビルド(初回のみ) --------------------------------------------------
  let built = false;
  function build() {
    if (built) return;
    const listEl = $('#ch-list');
    if (!listEl) return;
    listEl.textContent = '';
    loadProgress();
    list().forEach((ch) => {
      if (ch && ch.id) listEl.appendChild(renderCard(ch));
    });
    updateProgress();
    built = true;
  }

  // ---- 公開API -------------------------------------------------------------
  function open() {
    build();
    const screen = $('#challenge');
    const boot = $('#boot');
    if (boot) boot.hidden = true;
    if (screen) {
      screen.hidden = false;
      if (NS.a11y && typeof NS.a11y.trap === 'function') {
        try { NS.a11y.trap(screen); } catch (e) { /* noop */ }
      }
    }
    const title = $('#ch-title');
    if (title) {
      if (!title.hasAttribute('tabindex')) title.setAttribute('tabindex', '-1');
      try { title.focus(); } catch (e) { /* noop */ }
    }
    try { window.scrollTo(0, 0); } catch (e) { /* noop */ }
    const inner = $('.ns-challenge__inner');
    if (inner && typeof inner.scrollTo === 'function') { try { inner.scrollTo(0, 0); } catch (e) { /* noop */ } }
  }

  function close() {
    const screen = $('#challenge');
    const boot = $('#boot');
    if (screen) {
      if (NS.a11y && typeof NS.a11y.release === 'function') {
        try { NS.a11y.release(screen); } catch (e) { /* noop */ }
      }
      screen.hidden = true;
    }
    if (boot) boot.hidden = false;
    const backBtn = $('#btn-challenge');
    if (backBtn) { try { backBtn.focus(); } catch (e) { /* noop */ } }
  }

  // #btn-challenge-back → close() の結線(engine自身が行う)
  function wireBack() {
    const back = $('#btn-challenge-back');
    if (back && !back.__nsWired) {
      back.__nsWired = true;
      back.addEventListener('click', () => close());
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireBack, { once: true });
  } else {
    wireBack();
  }

  NS.challenge = { open, close };
})();
