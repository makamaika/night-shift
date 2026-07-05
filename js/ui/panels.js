// panels.js — NS.ui : アラートキュー/チャット/ナレッジ/証跡/タブ/法メモ/ネット図/NAT表/トースト描画。
// 描画専用。状態変更は必ず NS.actions 経由、連携は NS.bus 経由(逆方向参照禁止)。
(() => {
  'use strict';

  const bus = NS.bus;
  const state = NS.state;
  const actions = NS.actions;

  // ---- data アクセサ(データが未ロードでも壊れないよう防御的に引く) ----
  const D = () => window.NSD || {};
  const STORY = () => D().STORY || {};
  const WORLD = () => D().WORLD || {};
  const KNOWLEDGE = () => D().KNOWLEDGE || [];

  const byId = (list, id) => (Array.isArray(list) ? list.find((x) => x && x.id === id) : null);

  const alertsMap = () => {
    const a = STORY().alerts;
    return a && typeof a === 'object' ? a : {};
  };
  const getAlert = (id) => alertsMap()[id] || null;
  const getEvidence = (id) => byId(STORY().evidence, id);
  const getKnowledge = (id) => byId(KNOWLEDGE(), id);
  const getLaw = (id) => byId(STORY().laws, id);
  const getWeek = (n) => {
    const ws = D().WEEKS;
    return Array.isArray(ws) ? ws.find((w) => w && w.week === n) : null;
  };

  // ---- 小さなDOMヘルパ ----
  const $ = (sel, root) => (root || document).querySelector(sel);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const clear = (node) => { if (node) while (node.firstChild) node.removeChild(node.firstChild); };
  const setHidden = (node, hide) => { if (node) node.hidden = !!hide; };

  // 重要度→CSS/ラベル(色+アイコン+文字の三重表現)
  const SEV = {
    info: { cls: 'info', ico: '•', label: '情報' },
    warn: { cls: 'warn', ico: '▲', label: '警告' },
    crit: { cls: 'crit', ico: '■', label: '重大' },
    high: { cls: 'crit', ico: '■', label: '重大' },
  };
  const sevInfo = (sev) => SEV[sev] || SEV.info;

  // ============================================================
  // 1. アラートキュー
  // ============================================================
  const AlertsUI = (() => {
    const listEl = () => $('#alert-list');
    const emptyEl = () => $('.ns-queue__empty[data-empty]');

    function nodeFor(id) {
      const l = listEl();
      return l ? l.querySelector('.ns-alert[data-alert-id="' + cssEsc(id) + '"]') : null;
    }

    function render(id) {
      const l = listEl();
      const data = getAlert(id);
      if (!l || !data) return null;
      let li = nodeFor(id);
      const sev = sevInfo(data.sev);
      const status = state.alerts[id] || 'new';
      if (!li) {
        li = el('li', 'ns-alert');
        li.setAttribute('data-alert-id', id);
        li.setAttribute('role', 'button');
        li.tabIndex = 0;

        const head = el('div', 'ns-alert__head');
        // 重要度は「形(アイコン)+色(data-sev)+文字ラベル」の三重表現。
        // 形状は CSS 所有の .ns-alert__ico(sev別に着色)に載せる。
        const badge = el('span', 'ns-alert__ico');
        badge.setAttribute('aria-hidden', 'true');
        head.appendChild(badge);
        const sevLabel = el('span', 'ns-alert__sevlabel');
        head.appendChild(sevLabel);
        const time = el('time', 'ns-alert__time');
        if (data.time) { time.textContent = data.time; time.setAttribute('datetime', data.time); }
        head.appendChild(time);
        const st = el('span', 'ns-alert__status');
        head.appendChild(st);
        li.appendChild(head);

        const title = el('p', 'ns-alert__title', data.title || 'アラート');
        li.appendChild(title);
        if (data.source) li.appendChild(el('p', 'ns-alert__src', '検知: ' + data.source));

        li.addEventListener('click', () => open(id));
        li.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(id); }
        });
        l.appendChild(li);
      }
      // 状態反映(CSS は data-state / .ns-alert__ico / .ns-alert__title を参照)
      li.setAttribute('data-sev', sev.cls);
      li.setAttribute('data-state', status);
      const badge = $('.ns-alert__ico', li);
      if (badge) badge.textContent = sev.ico; // 形状のみ(色は data-sev、文字は sevlabel)
      const sevLabel = $('.ns-alert__sevlabel', li);
      if (sevLabel) sevLabel.textContent = sev.label;
      const st = $('.ns-alert__status', li);
      if (st) {
        st.textContent = status === 'resolved' ? '対応済' : status === 'open' ? '調査中' : '新規';
      }
      const aria = (data.title || 'アラート') + '。重要度' + sev.label +
        '。' + (status === 'resolved' ? '対応済み' : status === 'open' ? '調査中' : '新規') + '。';
      li.setAttribute('aria-label', aria);
      refreshEmpty();
      return li;
    }

    function refreshEmpty() {
      const l = listEl();
      const e = emptyEl();
      if (!e) return;
      const has = l && l.querySelector('.ns-alert');
      setHidden(e, !!has);
    }

    // アラート本文をターミナルに展開し、steps をサジェストに連携
    function open(id) {
      const data = getAlert(id);
      if (!data) return;
      if (state.alerts[id] !== 'resolved') actions.openAlert(id);
      render(id);
      Tabs.select('terminal');

      const lines = [];
      lines.push({ text: '── アラート詳細: ' + (data.title || id) + ' ──', cls: 'head' });
      if (data.time || data.source) {
        lines.push({ text: (data.time ? data.time + ' ' : '') + (data.source ? '/ ' + data.source : ''), cls: 'dim' });
      }
      if (data.body) {
        String(data.body).split('\n').forEach((line) => lines.push({ text: line, cls: '' }));
      }
      if (Array.isArray(data.steps) && data.steps.length) {
        lines.push({ text: '推奨する調査手順:', cls: 'warn' });
        data.steps.forEach((s, i) => {
          const cmd = s && s.cmd ? '  → ' + s.cmd : '';
          lines.push({ text: '  ' + (i + 1) + '. ' + (s && s.text ? s.text : '') + cmd, cls: 'dim' });
        });
      }
      const printed = NS.term && typeof NS.term.print === 'function'
        ? NS.term.print(lines)
        : Promise.resolve();

      // steps を見学モードのサジェストへ(cmdを持つものだけ)
      Promise.resolve(printed).then(() => {
        if (!NS.term || typeof NS.term.suggest !== 'function') return;
        const chips = (Array.isArray(data.steps) ? data.steps : [])
          .filter((s) => s && s.cmd)
          .map((s) => ({ label: s.text ? s.text : s.cmd, cmd: s.cmd }));
        if (chips.length) NS.term.suggest(chips);
      });
      bus.emit('toast', { text: 'アラートを展開しました', kind: 'info' });
    }

    function markResolved(id) {
      render(id);
    }

    function reset() {
      const l = listEl();
      clear(l);
      refreshEmpty();
    }

    return { render, open, markResolved, reset, refreshEmpty };
  })();

  // ============================================================
  // 2. チャットログ(チーム連絡)
  // ============================================================
  const ChatUI = (() => {
    const box = () => $('#chat');

    function push(from, text, cls) {
      const b = box();
      if (!b || text == null) return;
      const msg = el('div', 'ns-chat__msg');
      if (from) msg.setAttribute('data-from', from);
      if (cls) msg.classList.add('ns-chat__msg--' + cls);
      if (from) msg.appendChild(el('span', 'ns-chat__from', from));
      const t = el('p', 'ns-chat__text');
      // 改行を保持
      String(text).split('\n').forEach((ln, i) => {
        if (i) t.appendChild(document.createElement('br'));
        t.appendChild(document.createTextNode(ln));
      });
      msg.appendChild(t);
      b.appendChild(msg);
      b.scrollTop = b.scrollHeight;
    }

    function reset() { clear(box()); }

    return { push, reset };
  })();

  // ============================================================
  // 3. ナレッジパネル
  // ============================================================
  const KnowledgeUI = (() => {
    const listEl = () => $('#knowledge-list');
    const emptyEl = () => $('.ns-knowledge__empty[data-empty]');
    const detailEl = () => $('#knowledge-detail');

    let activeFilter = 'all';
    const readSet = new Set();
    let selectedId = null;

    // カテゴリ順(A系=ネットワーク, B系=セキュリティ, C系=法社会 …)。未知catは末尾。
    const CAT_ORDER = ['A', 'B', 'C', 'D'];
    const catGroup = (cat) => (cat && CAT_ORDER.includes(String(cat)[0]) ? String(cat)[0] : 'Z');

    function ensureFilterBar() {
      const l = listEl();
      if (!l) return;
      let bar = l.parentNode.querySelector('.ns-knowledge__filters');
      if (bar) return bar;
      bar = el('div', 'ns-knowledge__filters');
      bar.setAttribute('role', 'group');
      bar.setAttribute('aria-label', 'ナレッジの分類フィルタ');
      const cats = [
        { key: 'all', label: 'すべて' },
        { key: 'A', label: 'ネットワーク' },
        { key: 'B', label: 'セキュリティ' },
        { key: 'C', label: '法・社会' },
        { key: 'D', label: '学び方' },
      ];
      cats.forEach((c) => {
        const b = el('button', 'ns-chip ns-chip--filter', c.label);
        b.type = 'button';
        b.setAttribute('data-cat', c.key);
        b.setAttribute('aria-pressed', c.key === activeFilter ? 'true' : 'false');
        b.addEventListener('click', () => setFilter(c.key));
        bar.appendChild(b);
      });
      l.parentNode.insertBefore(bar, l);
      return bar;
    }

    function setFilter(key) {
      activeFilter = key;
      const bar = listEl() && listEl().parentNode.querySelector('.ns-knowledge__filters');
      if (bar) {
        bar.querySelectorAll('.ns-chip--filter').forEach((b) => {
          b.setAttribute('aria-pressed', b.getAttribute('data-cat') === key ? 'true' : 'false');
        });
      }
      applyFilter();
    }

    function applyFilter() {
      const l = listEl();
      if (!l) return;
      l.querySelectorAll('.ns-know-card').forEach((card) => {
        const g = card.getAttribute('data-catgroup');
        const show = activeFilter === 'all' || g === activeFilter;
        card.hidden = !show;
      });
    }

    function nodeFor(id) {
      const l = listEl();
      return l ? l.querySelector('.ns-know-card[data-know-id="' + cssEsc(id) + '"]') : null;
    }

    function add(id, opts) {
      const l = listEl();
      const k = getKnowledge(id);
      if (!l || !k) return;
      ensureFilterBar();
      if (nodeFor(id)) return; // 冪等
      const card = el('button', 'ns-know-card');
      card.type = 'button';
      card.setAttribute('data-know-id', id);
      const grp = catGroup(k.cat);
      card.setAttribute('data-catgroup', grp);
      card.setAttribute('role', 'listitem');

      const top = el('div', 'ns-know-card__top');
      const term = el('span', 'ns-know-card__term', k.term || id);
      top.appendChild(term);
      if (k.week) {
        const wk = el('span', 'ns-know-card__week', 'WEEK ' + String(k.week).padStart(2, '0'));
        top.appendChild(wk);
      }
      card.appendChild(top);
      if (k.short) card.appendChild(el('p', 'ns-know-card__short', k.short));

      // 未読マーク
      const unread = el('span', 'ns-know-card__new', 'NEW');
      unread.setAttribute('aria-label', '未読');
      card.appendChild(unread);
      if (!(opts && opts.silent)) card.setAttribute('data-unread', '1');

      card.addEventListener('click', () => showDetail(id));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showDetail(id); }
      });
      l.appendChild(card);
      applyFilter();
      refreshEmpty();
    }

    function refreshEmpty() {
      const l = listEl();
      const e = emptyEl();
      if (!e) return;
      setHidden(e, !!(l && l.querySelector('.ns-know-card')));
    }

    function showDetail(id) {
      const k = getKnowledge(id);
      const d = detailEl();
      if (!k || !d) return;
      selectedId = id;
      readSet.add(id);
      const node = nodeFor(id);
      if (node) { node.removeAttribute('data-unread'); node.setAttribute('aria-current', 'true'); }
      const l = listEl();
      if (l) l.querySelectorAll('.ns-know-card').forEach((c) => {
        if (c !== node) c.removeAttribute('aria-current');
      });
      if (typeof actions.useKnowledge === 'function') actions.useKnowledge(id);

      clear(d);
      const head = el('div', 'ns-know-detail__head');
      head.appendChild(el('h3', 'ns-know-detail__term', k.term || id));
      const meta = el('p', 'ns-know-detail__meta');
      if (k.week) {
        const w = getWeek(k.week);
        meta.textContent = 'WEEK ' + String(k.week).padStart(2, '0') +
          (w && w.title ? ' — ' + w.title : '') + (k.cat ? '  [' + k.cat + ']' : '');
      } else if (k.cat) {
        meta.textContent = '[' + k.cat + ']';
      }
      head.appendChild(meta);
      d.appendChild(head);

      if (k.detail) {
        String(k.detail).split('\n').forEach((line) => {
          d.appendChild(el('p', 'ns-know-detail__body', line));
        });
      }
      if (k.number && (k.number.label || k.number.value != null)) {
        const num = el('div', 'ns-know-detail__number');
        num.appendChild(el('span', 'ns-know-detail__num-label', k.number.label || ''));
        num.appendChild(el('span', 'ns-know-detail__num-value', String(k.number.value)));
        d.appendChild(num);
      }
      // 関連カード
      if (Array.isArray(k.refs) && k.refs.length) {
        const refWrap = el('div', 'ns-know-detail__refs');
        refWrap.appendChild(el('span', 'ns-know-detail__refs-label', '関連: '));
        k.refs.forEach((rid) => {
          const rk = getKnowledge(rid);
          const chip = el('button', 'ns-chip ns-chip--ref', rk ? (rk.term || rid) : rid);
          chip.type = 'button';
          const unlocked = state.knowledgeUnlocked.includes(rid);
          if (unlocked) {
            chip.addEventListener('click', () => showDetail(rid));
          } else {
            chip.disabled = true;
            chip.title = '未解禁';
          }
          refWrap.appendChild(chip);
        });
        d.appendChild(refWrap);
      }
      d.setAttribute('data-has', '1');
    }

    function updateBadge() {
      // 解禁数バッジ(パネルタイトルに件数)。存在すれば更新。
      const h = $('#knowledge-h');
      if (!h) return;
      let b = h.querySelector('.ns-panel-title__badge');
      const n = state.knowledgeUnlocked.length;
      if (!b) {
        b = el('span', 'ns-panel-title__badge');
        b.setAttribute('aria-hidden', 'true');
        h.appendChild(b);
      }
      b.textContent = String(n);
    }

    function reset() {
      clear(listEl());
      const d = detailEl();
      if (d) { clear(d); d.removeAttribute('data-has'); }
      readSet.clear();
      selectedId = null;
      activeFilter = 'all';
      refreshEmpty();
      updateBadge();
    }

    return { add, showDetail, setFilter, updateBadge, reset };
  })();

  // ============================================================
  // 4. 証跡ボード
  // ============================================================
  const EvidenceUI = (() => {
    const board = () => $('#evidence-board');
    const emptyEl = () => $('.ns-evidence-board__empty[data-empty]');
    const countEl = () => $('#evidence-count');

    function nodeFor(id) {
      const b = board();
      return b ? b.querySelector('.ns-ev-card[data-ev-id="' + cssEsc(id) + '"]') : null;
    }

    function add(id) {
      const b = board();
      const ev = getEvidence(id);
      if (!b || !ev) return;
      if (nodeFor(id)) return; // 冪等
      const card = el('article', 'ns-ev-card');
      card.setAttribute('data-ev-id', id);
      if (ev.chainStep != null) card.setAttribute('data-step', String(ev.chainStep));

      const head = el('header', 'ns-ev-card__head');
      if (ev.chainStep != null) {
        const step = el('span', 'ns-ev-card__step', String(ev.chainStep));
        step.setAttribute('aria-label', 'キルチェーン第' + ev.chainStep + '段階');
        head.appendChild(step);
      }
      if (ev.kind) head.appendChild(el('span', 'ns-ev-card__kind', ev.kind));
      if (ev.time) {
        const t = el('time', 'ns-ev-card__time', ev.time);
        t.setAttribute('datetime', ev.time);
        head.appendChild(t);
      }
      card.appendChild(head);

      card.appendChild(el('h3', 'ns-ev-card__label', ev.label || '証跡'));
      if (ev.detail) card.appendChild(el('p', 'ns-ev-card__detail', ev.detail));
      b.appendChild(card);

      refreshEmpty();
      updateCount();
    }

    function refreshEmpty() {
      const b = board();
      const e = emptyEl();
      if (!e) return;
      setHidden(e, !!(b && b.querySelector('.ns-ev-card')));
    }

    function updateCount() {
      const c = countEl();
      if (!c) return;
      const n = state.evidence.length;
      c.textContent = String(n);
      setHidden(c, n === 0);
    }

    function reset() {
      clear(board());
      refreshEmpty();
      updateCount();
    }

    return { add, reset, updateCount };
  })();

  // ============================================================
  // 5. タブ切替(キーボード対応・ロービングtabindex)
  // ============================================================
  const Tabs = (() => {
    const TAB_IDS = ['terminal', 'network', 'evidence', 'game'];

    function tabButtons() {
      return Array.prototype.slice.call(document.querySelectorAll('#tabs .ns-tab'));
    }
    function paneFor(tab) { return $('#pane-' + tab); }

    function select(tab, opts) {
      if (!TAB_IDS.includes(tab)) return;
      const btns = tabButtons();
      btns.forEach((b) => {
        const isSel = b.getAttribute('data-tab') === tab;
        b.setAttribute('aria-selected', isSel ? 'true' : 'false');
        b.tabIndex = isSel ? 0 : -1;
        const p = paneFor(b.getAttribute('data-tab'));
        if (p) p.hidden = !isSel;
      });
      if (opts && opts.focusPane) {
        const p = paneFor(tab);
        if (p) p.focus();
      }
      if (opts && opts.focusTab) {
        const b = btns.find((x) => x.getAttribute('data-tab') === tab);
        if (b) b.focus();
      }
      // ターミナルに切り替えたら入力へフォーカス移動(自動タイプの利便)
      if (tab === 'terminal' && !(opts && opts.noInputFocus)) {
        const inp = $('#term-input');
        if (inp && document.activeElement !== inp && !(opts && opts.silent)) {
          // ダイアログ表示中は奪わない
          if (!document.querySelector('.ns-dialog:not([hidden])')) inp.focus();
        }
      }
    }

    function current() {
      const b = document.querySelector('#tabs .ns-tab[aria-selected="true"]');
      return b ? b.getAttribute('data-tab') : 'terminal';
    }

    function move(dir) {
      const order = TAB_IDS;
      let i = order.indexOf(current());
      if (i < 0) i = 0;
      i = (i + dir + order.length) % order.length;
      select(order[i], { focusTab: true });
    }

    function bind() {
      const btns = tabButtons();
      btns.forEach((b) => {
        b.addEventListener('click', () => select(b.getAttribute('data-tab')));
        b.addEventListener('keydown', (e) => {
          switch (e.key) {
            case 'ArrowRight': case 'ArrowDown': e.preventDefault(); move(1); break;
            case 'ArrowLeft': case 'ArrowUp': e.preventDefault(); move(-1); break;
            case 'Home': e.preventDefault(); select(TAB_IDS[0], { focusTab: true }); break;
            case 'End': e.preventDefault(); select(TAB_IDS[TAB_IDS.length - 1], { focusTab: true }); break;
            default: break;
          }
        });
      });
    }

    return { select, current, move, bind, TAB_IDS };
  })();

  // ============================================================
  // 6. 法メモダイアログ
  // ============================================================
  const LawUI = (() => {
    const dlg = () => $('#law-dialog');
    const titleEl = () => $('#law-title');
    const bodyEl = () => $('#law-body');
    const choicesEl = () => $('#law-choices');
    let currentId = null;
    let decided = false;

    function popup(id) {
      const law = getLaw(id);
      const dialog = dlg();
      if (!law || !dialog) return;
      currentId = id;
      decided = false;

      if (titleEl()) titleEl().textContent = law.title || 'その調査、越権では?';

      const body = bodyEl();
      clear(body);
      if (law.body) {
        String(law.body).split('\n').forEach((line) => {
          body.appendChild(el('p', 'ns-law__p', line));
        });
      }
      if (law.week) {
        const w = getWeek(law.week);
        const src = el('p', 'ns-law__src', '出典: WEEK ' + String(law.week).padStart(2, '0') +
          (w && w.title ? ' 「' + w.title + '」' : ''));
        body.appendChild(src);
      }

      const ch = choicesEl();
      clear(ch);
      const choice = law.choice || {};
      const opts = [];
      if (choice.a != null) opts.push({ key: 'a', text: choice.a });
      if (choice.b != null) opts.push({ key: 'b', text: choice.b });
      // 3択以上にも対応(c,d…)
      ['c', 'd', 'e'].forEach((k) => { if (choice[k] != null) opts.push({ key: k, text: choice[k] }); });

      opts.forEach((o) => {
        const btn = el('button', 'ns-btn ns-btn--choice');
        btn.type = 'button';
        btn.setAttribute('data-choice', o.key);
        btn.appendChild(el('span', 'ns-btn__key', o.key.toUpperCase()));
        btn.appendChild(el('span', 'ns-btn__choice-text', o.text));
        btn.addEventListener('click', () => choose(law, o.key, btn));
        ch.appendChild(btn);
      });

      openDialog(dialog);
    }

    function choose(law, key, btn) {
      if (decided) return;
      decided = true;
      const right = law.right;
      const isRight = key === right;
      const ch = choicesEl();
      // ボタン確定表示
      ch.querySelectorAll('.ns-btn--choice').forEach((b) => {
        b.disabled = true;
        const bk = b.getAttribute('data-choice');
        if (bk === key) b.setAttribute('data-picked', '1');
        if (bk === right) b.setAttribute('data-right', '1');
      });

      // 結果の説明を本文末尾に追加
      const body = bodyEl();
      const result = el('div', 'ns-law__result');
      result.setAttribute('data-ok', isRight ? '1' : '0');
      result.setAttribute('role', 'status');
      const verdict = el('p', 'ns-law__verdict', isRight ? '妥当な判断です。' : 'ここは踏みとどまるべきでした。');
      result.appendChild(verdict);
      // 正解でない選択には、なぜ問題かの説明を出す
      const explain = law.explain || {};
      let msg = '';
      if (!isRight) {
        msg = explain[key] || explain.wrong ||
          '越権や比例原則の逸脱にあたる恐れがあります。調べる範囲は、必要最小限と正当な根拠に限るのが原則です。';
      } else {
        msg = explain[key] || explain.right ||
          '必要最小限の範囲で、正当な根拠に基づいて調べる。技術・法・社会は切り離せません。';
      }
      result.appendChild(el('p', 'ns-law__explain', msg));
      body.appendChild(result);

      // 回答後の明確な導線(×やEscを探させない)。フォーカスもここへ移す。
      const cont = el('button', 'ns-btn ns-btn--primary ns-law__continue');
      cont.type = 'button';
      cont.textContent = '閉じて調査に戻る';
      cont.addEventListener('click', () => closeDialog(dlg()));
      ch.appendChild(cont);
      cont.focus();

      // decision:made を発火(state 記録)。actions.decide が唯一の発火者。
      // actions 経由で記録できない場合のみ直接発火して二重発火を防ぐ。
      if (typeof actions.decide === 'function') {
        actions.decide(law.id, key);
      } else {
        bus.emit('decision:made', { id: law.id, choice: key });
      }
      bus.emit('toast', {
        text: isRight ? '判断を記録しました' : '判断を記録しました(要再考)',
        kind: isRight ? 'ok' : 'warn',
      });
    }

    function reset() { currentId = null; decided = false; }

    return { popup, reset };
  })();

  // ============================================================
  // 7. ダイアログ共通(law / help)。a11y のフォーカストラップを使う。
  // ============================================================
  function openDialog(dialog) {
    if (!dialog) return;
    dialog.hidden = false;
    dialog.setAttribute('data-open', '1');
    // バックドロップ/×ボタンで閉じる
    dialog.querySelectorAll('[data-close]').forEach((c) => {
      if (c.getAttribute('data-close-bound')) return;
      c.setAttribute('data-close-bound', '1');
      c.addEventListener('click', () => closeDialog(dialog));
    });
    if (NS.a11y && typeof NS.a11y.trap === 'function') NS.a11y.trap(dialog);
    else {
      const f = dialog.querySelector('button, [tabindex], input, select, a[href]');
      if (f) f.focus();
    }
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    dialog.hidden = true;
    dialog.removeAttribute('data-open');
    if (NS.a11y && typeof NS.a11y.release === 'function') NS.a11y.release(dialog);
  }

  // ============================================================
  // 8. ネットワーク図(#net-map)— world.devices から静的SVG生成
  // ============================================================
  const NetMap = (() => {
    const NS_SVG = 'http://www.w3.org/2000/svg';
    // ゾーン→列レイアウト。契約のzone: external/edge/dmz/office/core など。
    const ZONE_ORDER = ['external', 'edge', 'dmz', 'office', 'core', 'internal'];
    const ZONE_LABEL = {
      external: 'インターネット', edge: '境界', dmz: 'DMZ',
      office: '社内ゾーン', core: '基幹', internal: '社内ゾーン',
    };

    function svgEl(tag, attrs) {
      const n = document.createElementNS(NS_SVG, tag);
      if (attrs) Object.keys(attrs).forEach((k) => n.setAttribute(k, attrs[k]));
      return n;
    }

    function render() {
      const root = $('#net-map');
      if (!root) return;
      clear(root);
      const devices = Array.isArray(WORLD().devices) ? WORLD().devices : [];

      // ゾーン別にまとめる(未知ゾーンは末尾 internal 扱い)
      const zones = {};
      const zoneList = [];
      devices.forEach((d) => {
        const z = ZONE_ORDER.includes(d.zone) ? d.zone : 'internal';
        if (!zones[z]) { zones[z] = []; zoneList.push(z); }
        zones[z].push(d);
      });
      // 表示順を ZONE_ORDER に沿わせる
      zoneList.sort((a, b) => ZONE_ORDER.indexOf(a) - ZONE_ORDER.indexOf(b));

      const colW = 150;
      const rowH = 72;
      const padX = 20;
      const padTop = 34;
      const cols = Math.max(zoneList.length, 1);
      const maxRows = zoneList.reduce((m, z) => Math.max(m, zones[z].length), 1);
      const width = padX * 2 + cols * colW;
      const height = padTop + 20 + maxRows * rowH + 20;

      const svg = svgEl('svg', {
        viewBox: '0 0 ' + width + ' ' + height,
        class: 'ns-netsvg',
        preserveAspectRatio: 'xMidYMin meet',
        role: 'img',
      });
      svg.setAttribute('aria-hidden', 'true'); // 親 #net-map が aria-label を持つ

      // ノード座標を記録(隣接ゾーン間を結ぶ)
      const posOf = {}; // deviceId -> {x,y}
      const zoneCenterX = {};

      zoneList.forEach((z, ci) => {
        const cx = padX + ci * colW + colW / 2;
        zoneCenterX[z] = cx;
        // ゾーン見出し
        const label = svgEl('text', {
          x: cx, y: padTop - 12, class: 'ns-netsvg__zone', 'text-anchor': 'middle',
        });
        label.textContent = ZONE_LABEL[z] || z;
        svg.appendChild(label);
        // ゾーン枠
        const bandH = padTop + maxRows * rowH;
        svg.appendChild(svgEl('rect', {
          x: padX + ci * colW + 6, y: padTop - 4,
          width: colW - 12, height: bandH - padTop + 8,
          rx: 8, class: 'ns-netsvg__band',
        }));

        zones[z].forEach((d, ri) => {
          const y = padTop + 16 + ri * rowH;
          posOf[d.id] = { x: cx, y: y + 18 };
        });
      });

      // 接続線(隣り合うゾーンの代表ノード同士を薄く結ぶ)
      for (let i = 0; i < zoneList.length - 1; i++) {
        const a = zones[zoneList[i]][0];
        const b = zones[zoneList[i + 1]][0];
        if (a && b && posOf[a.id] && posOf[b.id]) {
          svg.appendChild(svgEl('line', {
            x1: posOf[a.id].x, y1: posOf[a.id].y,
            x2: posOf[b.id].x, y2: posOf[b.id].y,
            class: 'ns-netsvg__link',
          }));
        }
      }

      // ノード描画
      zoneList.forEach((z) => {
        zones[z].forEach((d) => {
          const p = posOf[d.id];
          if (!p) return;
          const g = svgEl('g', { class: 'ns-netsvg__node', 'data-device-id': d.id });
          g.setAttribute('data-type', d.type || 'host');
          // 感染状態:state.flags['infected:'+id] または device.infected を参照
          const infected = isInfected(d.id, d);
          g.setAttribute('data-infected', infected ? '1' : '0');

          g.appendChild(svgEl('rect', {
            x: p.x - 58, y: p.y - 16, width: 116, height: 40, rx: 7,
            class: 'ns-netsvg__box',
          }));
          const name = svgEl('text', { x: p.x, y: p.y - 1, 'text-anchor': 'middle', class: 'ns-netsvg__name' });
          name.textContent = d.name || d.id;
          g.appendChild(name);
          const ip = svgEl('text', { x: p.x, y: p.y + 13, 'text-anchor': 'middle', class: 'ns-netsvg__ip' });
          ip.textContent = d.ip || '';
          g.appendChild(ip);
          if (infected) {
            const mark = svgEl('text', { x: p.x + 46, y: p.y - 4, 'text-anchor': 'middle', class: 'ns-netsvg__mark' });
            mark.textContent = '⚠';
            g.appendChild(mark);
          }
          // タイトルでSR/ツールチップ
          const title = svgEl('title');
          title.textContent = (d.name || d.id) + ' / ' + (d.ip || '') +
            (infected ? ' / 感染疑い' : '');
          g.appendChild(title);
          svg.appendChild(g);
        });
      });

      if (!devices.length) {
        const t = svgEl('text', { x: width / 2, y: height / 2, 'text-anchor': 'middle', class: 'ns-netsvg__ip' });
        t.textContent = 'ネットワーク情報を読み込み中…';
        svg.appendChild(t);
      }

      root.appendChild(svg);
    }

    function isInfected(id, d) {
      if (state.flags && state.flags['infected:' + id]) return true;
      if (d && d.infected) return true;
      return false;
    }

    // 感染状態が変わったらそのノードだけ更新
    function markInfected(id, on) {
      const root = $('#net-map');
      if (!root) return;
      const g = root.querySelector('.ns-netsvg__node[data-device-id="' + cssEsc(id) + '"]');
      if (g) g.setAttribute('data-infected', on ? '1' : '0');
    }

    return { render, markInfected };
  })();

  // ============================================================
  // 9. NAT表(#nat-view)— world.natTable をテーブル描画
  // ============================================================
  const NatView = (() => {
    function render() {
      const root = $('#nat-view');
      if (!root) return;
      clear(root);
      const rows = Array.isArray(WORLD().natTable) ? WORLD().natTable : [];
      const wrap = el('div', 'ns-nat__scroll');
      const table = el('table', 'ns-nat__table');
      table.setAttribute('aria-label', 'NAPTセッション表');

      const cols = [
        { k: 'proto', h: 'PROTO' },
        { k: 'inIp', h: '内部アドレス' },
        { k: 'inPort', h: '内部PORT' },
        { k: 'outPort', h: '変換PORT' },
        { k: 'dst', h: '宛先' },
        { k: 'state', h: '状態' },
      ];
      const thead = el('thead');
      const htr = el('tr');
      cols.forEach((c) => {
        const th = el('th', null, c.h);
        th.scope = 'col';
        htr.appendChild(th);
      });
      thead.appendChild(htr);
      table.appendChild(thead);

      const tbody = el('tbody');
      rows.forEach((r) => {
        const tr = el('tr', 'ns-nat__row');
        if (r.state) tr.setAttribute('data-state', String(r.state).toLowerCase());
        cols.forEach((c) => {
          const td = el('td', 'ns-nat__cell', r[c.k] != null ? String(r[c.k]) : '');
          if (c.k === 'proto' || c.k === 'inPort' || c.k === 'outPort' || c.k === 'state') {
            td.classList.add('ns-nat__cell--mono');
          }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
      root.appendChild(wrap);

      const foot = el('p', 'ns-nat__foot');
      if (rows.length) {
        // セッション件数の注記(NAPT上限との対比を軽く示す)
        foot.textContent = '現在のセッション: ' + rows.length + ' 件(NAPT上限 約65,536)';
      } else {
        foot.textContent = 'セッション情報がありません。';
      }
      root.appendChild(foot);
    }
    return { render };
  })();

  // ============================================================
  // 10. トースト
  // ============================================================
  const Toast = (() => {
    const region = () => $('#toast-region');
    function show(text, kind) {
      const r = region();
      if (!r || text == null) return;
      const t = el('div', 'ns-toast');
      t.setAttribute('data-kind', kind || 'info');
      t.setAttribute('role', kind === 'warn' ? 'alert' : 'status');
      const ico = kind === 'ok' ? '✓' : kind === 'warn' ? '▲' : '•';
      const icoEl = el('span', 'ns-toast__ico', ico);
      icoEl.setAttribute('aria-hidden', 'true');
      t.appendChild(icoEl);
      t.appendChild(el('span', 'ns-toast__text', String(text)));
      r.appendChild(t);
      // 退場(reduced時も timeout は同じ。アニメはCSSが担当)
      const life = 3200;
      window.setTimeout(() => {
        t.setAttribute('data-leaving', '1');
        window.setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 400);
      }, life);
    }
    return { show };
  })();

  // ---- CSS属性セレクタ用エスケープ(id中の記号対策) ----
  function cssEsc(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/["\\\]]/g, '\\$&');
  }

  // ============================================================
  // 公開API(NS.ui)
  // ============================================================
  NS.ui = {
    // 描画エントリ
    renderNetwork() { NetMap.render(); },
    renderNat() { NatView.render(); },
    renderStatic() { NetMap.render(); NatView.render(); },
    // 個別操作(main/shift から使える)
    selectTab(tab, opts) { Tabs.select(tab, opts); },
    currentTab() { return Tabs.current(); },
    openAlert(id) { AlertsUI.open(id); },
    pushChat(from, text, cls) { ChatUI.push(from, text, cls); },
    addKnowledge(id, opts) { KnowledgeUI.add(id, opts); },
    showKnowledge(id) { KnowledgeUI.showDetail(id); },
    addEvidence(id) { EvidenceUI.add(id); },
    showLaw(id) { LawUI.popup(id); },
    toast(text, kind) { Toast.show(text, kind); },
    openDialog(dialog) { openDialog(dialog); },
    closeDialog(dialog) { closeDialog(dialog); },
    setDeviceInfected(id, on) { NetMap.markInfected(id, on); },
    // リセット(再スタート時)
    reset() {
      AlertsUI.reset();
      ChatUI.reset();
      KnowledgeUI.reset();
      EvidenceUI.reset();
      LawUI.reset();
    },
    // 現在stateから全再描画(セーブロード復帰・章ジャンプ後の同期)
    syncFromState() {
      // アラート
      Object.keys(state.alerts || {}).forEach((id) => AlertsUI.render(id));
      // ナレッジ(解禁済みを silent で並べる)
      (state.knowledgeUnlocked || []).forEach((id) => KnowledgeUI.add(id, { silent: true }));
      KnowledgeUI.updateBadge();
      // 証跡
      (state.evidence || []).forEach((id) => EvidenceUI.add(id));
      // 静的パネル
      NS.ui.renderStatic();
    },
    // 内部モジュールへの参照(main が結線に使う場合)
    _tabs: Tabs,
  };

  // ============================================================
  // バス購読(唯一の連携経路)
  // ============================================================
  bus.on('alert:push', (p) => { if (p && p.alertId) AlertsUI.render(p.alertId); });
  bus.on('alert:open', (p) => { if (p && p.alertId) AlertsUI.render(p.alertId); });
  bus.on('alert:resolved', (p) => { if (p && p.alertId) AlertsUI.markResolved(p.alertId); });

  bus.on('chat:push', (p) => { if (p) ChatUI.push(p.from, p.text, p.cls); });

  bus.on('knowledge:unlock', (p) => {
    if (!p || !p.id) return;
    KnowledgeUI.add(p.id, { silent: p.silent });
    KnowledgeUI.updateBadge();
    if (!p.silent) Toast.show('ナレッジ解禁: ' + (getKnowledge(p.id) ? getKnowledge(p.id).term : p.id), 'ok');
  });

  bus.on('evidence:add', (p) => {
    if (!p || !p.id) return;
    EvidenceUI.add(p.id);
    const ev = getEvidence(p.id);
    Toast.show('証跡を記録: ' + (ev ? ev.label : p.id), 'info');
  });

  bus.on('law:popup', (p) => { if (p && p.id) LawUI.popup(p.id); });

  bus.on('game:open', () => { Tabs.select('game'); });

  bus.on('toast', (p) => { if (p) Toast.show(p.text, p.kind); });

  // 感染状態の変化を反映(shift が flag を立てたら state経由でここには来ないため
  // shift/terminal が toast/独自手段で通知する。isolate 等での更新は下記フックで拾う)
  bus.on('term:executed', (p) => {
    if (!p || !p.meta) return;
    // handler が meta.infect / meta.disinfect に deviceId を入れて申告した場合に反映
    if (p.meta.infect) NetMap.markInfected(p.meta.infect, true);
    if (p.meta.disinfect) NetMap.markInfected(p.meta.disinfect, false);
    if (p.meta.isolate) NetMap.markInfected(p.meta.isolate, false);
  });

  // フェーズ遷移時にネット図の感染表示を再同期
  bus.on('phase:enter', () => { NetMap.render(); });

  // ============================================================
  // 初期化(DOM準備後にタブ結線・静的パネル描画)
  // ============================================================
  function init() {
    Tabs.bind();
    // 静的パネルはデータがそろっていれば描画(main が shift:start 後にも呼ぶ)
    if (WORLD().devices) NetMap.render();
    if (WORLD().natTable) NatView.render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
