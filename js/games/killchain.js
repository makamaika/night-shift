// games/killchain.js — フェーズ5クライマックス「一本の線」。証跡を時刻順に整列しSVG線で結び、封じ込め判断を下す。
(() => {
  'use strict';

  const NS = (window.NS = window.NS || {});
  NS.games = NS.games || {};

  // ---- コピー(第12回名場面。§10) --------------------------------------
  const KILL_TITLE = 'THE KILL CHAIN';
  const KILL_COPY = '個人の隙が組織を滅ぼし、組織の陥落が個人の財布を空にする。';
  const KILL_SUB = 'バラバラの脅威に潜んでいた一本の線が、いま像を結ぶ。';

  // ---- 封じ込め判断の3択(隔離範囲。§10) ------------------------------
  // score差は containment を主、過剰遮断は ethics(比例原則)を減点、遅さ回避で speed。
  const CHOICES = [
    {
      id: 'infected-only',
      label: '感染機器のみ隔離',
      caption: '複合機(mfp-3f)だけをネットワークから切り離す',
      verdict: 'partial',
      score: { containment: 1, ethics: 2, speed: 3 },
      review:
        'C2への通路は塞がるが、すでに横展開した経路や設置済みバックドアは残る。' +
        '侵入は複合機1台では終わっていない——キルチェーンは「初期侵入→陽動→改ざん→持ち出し」と伸びていた。' +
        '最小限で速いが、封じ込めとしては甘い。',
    },
    {
      id: 'segment',
      label: 'セグメント全体を隔離',
      caption: '感染ゾーンとDMZを社内基幹から論理的に分離する',
      verdict: 'best',
      score: { containment: 3, ethics: 3, speed: 2 },
      review:
        '被害範囲(IoT・DMZ)を丸ごと切り、基幹DBと経理系への通路を断つ。' +
        '多層防御の考え方どおり「攻撃者がいる区画」を面で囲い込みつつ、無関係な部門の業務は生かす。' +
        '比例原則にかない、封じ込めとしても妥当——今夜の最適解。',
    },
    {
      id: 'full-cut',
      label: '全社ネットを遮断',
      caption: '対外回線を落とし社内全通信を停止する',
      verdict: 'over',
      score: { containment: 2, ethics: 0, speed: 1 },
      review:
        '攻撃者は確実に締め出せる。だが全部門が停止し、被害額は攻撃そのものより自らの遮断で膨らむ。' +
        '「琵琶湖の水、止めたろか」——強すぎる一手は比例原則を踏み外す。' +
        '過剰な封じ込めは、それ自体が二次被害になる。',
    },
  ];

  const VERDICT_META = {
    best: { tag: '最適', cls: 'ok' },
    partial: { tag: '不足', cls: 'warn' },
    over: { tag: '過剰', cls: 'warn' },
  };

  // ---- 内部状態 --------------------------------------------------------
  let root = null;
  let apiRef = null;
  let els = null;
  let phase = 'scatter'; // scatter -> aligning -> chained -> decided
  let cleanups = [];
  const timers = [];

  // ---- ユーティリティ --------------------------------------------------
  function reduced() {
    const st = apiRef && apiRef.state;
    if (st && typeof st.reduced === 'boolean') return st.reduced;
    return document.documentElement.getAttribute('data-reduced') === '1';
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function svgEl(tag, attrs) {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function after(ms, fn) {
    const id = window.setTimeout(fn, ms);
    timers.push(id);
    return id;
  }

  function on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    cleanups.push(() => target.removeEventListener(type, fn, opts));
  }

  function emit(name, payload) {
    if (NS.bus && typeof NS.bus.emit === 'function') NS.bus.emit(name, payload || {});
  }

  function toast(text, kind) {
    emit('toast', { text, kind: kind || 'info' });
  }

  // 証跡を chainStep(なければ time)で昇順に。story.evidence を正準に。
  function getChain() {
    const story = apiRef && apiRef.story;
    let list = story && Array.isArray(story.evidence) ? story.evidence.slice() : [];
    // stateに集まった証跡のみを線にする。未収集でも安全側で全件を使う。
    const st = apiRef && apiRef.state;
    if (st && Array.isArray(st.evidence) && st.evidence.length) {
      const found = new Set(st.evidence);
      const filtered = list.filter((e) => found.has(e.id));
      if (filtered.length >= 2) list = filtered;
    }
    list.sort((a, b) => {
      const sa = a.chainStep != null ? a.chainStep : 999;
      const sb = b.chainStep != null ? b.chainStep : 999;
      if (sa !== sb) return sa - sb;
      return String(a.time || '').localeCompare(String(b.time || ''));
    });
    return list;
  }

  // ---- 構築 ------------------------------------------------------------
  function build() {
    root.innerHTML = '';
    const wrap = el('div', 'ns-kc');

    // ヘッダ
    const head = el('header', 'ns-kc__head');
    head.appendChild(el('p', 'ns-kc__kicker', '05:00 ｜ 相関分析'));
    head.appendChild(el('h3', 'ns-kc__title', '一本の線 — 証跡の相関分析'));
    head.appendChild(
      el(
        'p',
        'ns-kc__lede',
        '夜のうちに掘り当てた証跡が、バラバラに散っている。時刻順に並べ、相関をとれば——攻撃の全体像が一本の線として立ち上がる。'
      )
    );
    wrap.appendChild(head);

    // ステージ(カード + SVG線 + 中央コピー)
    const stage = el('div', 'ns-kc__stage');
    stage.setAttribute('role', 'group');
    stage.setAttribute('aria-label', '証跡の相関分析ステージ');

    // カード(上段) → 連結線ストリップ(中段) → バナー(下段) の順で縦に積む。
    // 線はカードの真下に置き、証跡どうしを一本に結ぶ。
    const cardsLayer = el('div', 'ns-kc__cards');
    stage.appendChild(cardsLayer);

    const svg = svgEl('svg', {
      class: 'ns-kc__links',
      viewBox: '0 0 1000 72',
      preserveAspectRatio: 'none',
      'aria-hidden': 'true',
      focusable: 'false',
    });
    stage.appendChild(svg);

    const banner = el('div', 'ns-kc__banner');
    banner.setAttribute('aria-hidden', 'true');
    banner.hidden = true;
    const bTitle = el('p', 'ns-kc__banner-title', KILL_TITLE);
    const bCopy = el('p', 'ns-kc__banner-copy', KILL_COPY);
    const bSub = el('p', 'ns-kc__banner-sub', KILL_SUB);
    banner.appendChild(bTitle);
    banner.appendChild(bCopy);
    banner.appendChild(bSub);
    stage.appendChild(banner);

    wrap.appendChild(stage);

    // 操作行
    const controls = el('div', 'ns-kc__controls');
    const runBtn = el('button', 'ns-btn ns-btn--primary ns-kc__run');
    runBtn.type = 'button';
    const ico = el('span', 'ns-btn__ico', '⌁');
    ico.setAttribute('aria-hidden', 'true');
    runBtn.appendChild(ico);
    runBtn.appendChild(document.createTextNode('相関分析を実行'));
    const status = el('p', 'ns-kc__status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.textContent = '証跡は ' + getChain().length + ' 件。準備ができたら相関分析を実行してください。';
    controls.appendChild(runBtn);
    controls.appendChild(status);
    wrap.appendChild(controls);

    // 封じ込め判断(初期は隠す)
    const decision = el('section', 'ns-kc__decision');
    decision.hidden = true;
    decision.setAttribute('aria-labelledby', 'kc-decision-h');
    const dHead = el('h4', 'ns-kc__decision-title');
    dHead.id = 'kc-decision-h';
    dHead.textContent = '封じ込め判断 — 隔離の範囲を決める';
    decision.appendChild(dHead);
    decision.appendChild(
      el(
        'p',
        'ns-kc__decision-lede',
        '攻撃の全体像は見えた。ここからは封じ込めだ。どこまでを切り離す? 狭すぎれば取り逃がし、広すぎれば自らの首を絞める。'
      )
    );
    const choicesWrap = el('div', 'ns-kc__choices');
    choicesWrap.setAttribute('role', 'group');
    choicesWrap.setAttribute('aria-label', '封じ込め範囲の選択');
    CHOICES.forEach((c) => {
      const btn = el('button', 'ns-kc__choice');
      btn.type = 'button';
      btn.dataset.choice = c.id;
      const t = el('span', 'ns-kc__choice-label', c.label);
      const cap = el('span', 'ns-kc__choice-caption', c.caption);
      btn.appendChild(t);
      btn.appendChild(cap);
      choicesWrap.appendChild(btn);
    });
    decision.appendChild(choicesWrap);
    const review = el('div', 'ns-kc__review');
    review.setAttribute('role', 'status');
    review.setAttribute('aria-live', 'polite');
    review.hidden = true;
    decision.appendChild(review);
    wrap.appendChild(decision);

    root.appendChild(wrap);

    els = {
      wrap,
      stage,
      svg,
      cardsLayer,
      banner,
      runBtn,
      status,
      decision,
      choicesWrap,
      review,
    };

    renderCards();
    on(runBtn, 'click', onRun);
  }

  // 散開レイアウト(擬似ランダムだが決定的。プロジェクタ映え用に大きめに散らす)
  const SCATTER = [
    { x: 4, y: 6, rot: -7 },
    { x: 62, y: 2, rot: 6 },
    { x: 8, y: 52, rot: 5 },
    { x: 58, y: 55, rot: -6 },
    { x: 34, y: 26, rot: 3 },
    { x: 30, y: 70, rot: -4 },
  ];

  function renderCards() {
    const chain = getChain();
    els.cardsLayer.innerHTML = '';
    els.cards = [];
    // カードを常に1行(証跡数の列)に。連結線のノードが各カードの真下に揃う。
    els.cardsLayer.style.setProperty('--kc-n', String(chain.length || 1));
    chain.forEach((ev, i) => {
      const card = el('article', 'ns-kc__card');
      card.dataset.evId = ev.id;
      card.dataset.step = String(ev.chainStep != null ? ev.chainStep : i + 1);
      const s = SCATTER[i % SCATTER.length];
      card.style.setProperty('--kc-x', s.x + '%');
      card.style.setProperty('--kc-y', s.y + '%');
      card.style.setProperty('--kc-rot', s.rot + 'deg');
      card.style.setProperty('--kc-i', String(i));

      const badge = el('span', 'ns-kc__card-step', String(ev.chainStep != null ? ev.chainStep : i + 1));
      badge.setAttribute('aria-hidden', 'true');
      const time = el('span', 'ns-kc__card-time', ev.time || '');
      const kind = el('span', 'ns-kc__card-kind', ev.kind || '');
      const label = el('p', 'ns-kc__card-label', ev.label || ev.id);
      const detail = el('p', 'ns-kc__card-detail', ev.detail || '');

      const top = el('div', 'ns-kc__card-top');
      top.appendChild(badge);
      top.appendChild(time);
      top.appendChild(kind);
      card.appendChild(top);
      card.appendChild(label);
      if (ev.detail) card.appendChild(detail);

      els.cardsLayer.appendChild(card);
      els.cards.push(card);
    });
  }

  // ---- 相関分析の実行 --------------------------------------------------
  function onRun() {
    if (phase !== 'scatter') return;
    phase = 'aligning';
    els.runBtn.disabled = true;
    els.runBtn.classList.add('is-running');

    const chain = getChain();
    if (!chain.length) {
      // 証跡皆無でも詰まらせない
      phase = 'chained';
      revealBanner();
      openDecision();
      return;
    }

    if (reduced()) {
      // reduced: 即座に整列 + 線完成(演出なし)。バナー/判断は finishChain 側で一度だけ。
      alignCards(true);
      els.stage.classList.add('is-chained');
      drawLinks(true); // 完了時に finishChain() → revealBanner()/openDecision()
      return;
    }

    // 通常演出: 整列 → 線を1本ずつ → バナー
    els.status.textContent = '相関分析を実行中——証跡を時刻順に整列しています。';
    els.stage.classList.add('is-aligning');
    alignCards(false);

    // 整列トランジション後(CSS transform遷移)に線描画へ
    after(900, () => {
      els.status.textContent = '整列完了。証跡どうしの関連を結線しています。';
      els.stage.classList.add('is-chained');
      drawLinks(false);
    });
  }

  // カードを時刻順の横一列へ。CSS変数 --kc-slot(0..1)で最終位置を制御。
  function alignCards(instant) {
    const n = els.cards.length;
    els.cards.forEach((card, i) => {
      const slot = n > 1 ? i / (n - 1) : 0.5;
      card.style.setProperty('--kc-slot', String(slot));
      card.style.setProperty('--kc-slot-i', String(i));
      if (instant) card.classList.add('is-instant');
      card.classList.add('is-aligned');
    });
  }

  // カード中心座標(viewBox 0..1000 / 0..320 換算)を返す。整列後の横一列を線で結ぶ。
  function slotPoint(i, n) {
    // ノードを各カードの中心の真下に置く(等幅グリッドの中心 = (i+0.5)/n)。
    const x = n > 1 ? (1000 * (i + 0.5)) / n : 500;
    const y = 42; // 連結ストリップ(viewBox高さ72)の中心付近
    return { x, y };
  }

  function drawLinks(instant) {
    const n = els.cards.length;
    if (n < 2) {
      after(instant ? 0 : 300, () => {
        finishChain();
      });
      return;
    }
    els.svg.innerHTML = '';

    // グロー用フィルタ
    const defs = svgEl('defs');
    const filter = svgEl('filter', { id: 'kc-glow', x: '-30%', y: '-60%', width: '160%', height: '220%' });
    const blur = svgEl('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: '3.2', result: 'b' });
    const merge = svgEl('feMerge');
    merge.appendChild(svgEl('feMergeNode', { in: 'b' }));
    merge.appendChild(svgEl('feMergeNode', { in: 'SourceGraphic' }));
    filter.appendChild(blur);
    filter.appendChild(merge);
    defs.appendChild(filter);
    els.svg.appendChild(defs);

    const segs = [];
    for (let i = 0; i < n - 1; i++) {
      const a = slotPoint(i, n);
      const b = slotPoint(i + 1, n);
      // ゆるいカーブで隣接ノードを結ぶ(上に反った弧)
      const midX = (a.x + b.x) / 2;
      const ctrlY = a.y - 20;
      const d = 'M ' + a.x + ' ' + a.y + ' Q ' + midX + ' ' + ctrlY + ' ' + b.x + ' ' + b.y;

      const base = svgEl('path', { d, class: 'ns-kc__link-base' });
      els.svg.appendChild(base);

      const glow = svgEl('path', { d, class: 'ns-kc__link-glow', filter: 'url(#kc-glow)' });
      els.svg.appendChild(glow);
      segs.push(glow);

      // ノードの光点
      const node = svgEl('circle', { cx: a.x, cy: a.y, r: '6', class: 'ns-kc__node' });
      els.svg.appendChild(node);
      if (i === n - 2) {
        els.svg.appendChild(svgEl('circle', { cx: b.x, cy: b.y, r: '6', class: 'ns-kc__node' }));
      }
    }

    if (instant) {
      segs.forEach((p) => {
        p.style.strokeDasharray = 'none';
        p.style.strokeDashoffset = '0';
        p.classList.add('is-drawn');
      });
      finishChain();
      return;
    }

    // 1本ずつ stroke-dashoffset を 0 へ。前の線の完了後に次を開始。
    let idx = 0;
    const drawNext = () => {
      if (idx >= segs.length) {
        after(360, () => finishChain());
        return;
      }
      const p = segs[idx];
      const len = p.getTotalLength ? p.getTotalLength() : 300;
      p.style.strokeDasharray = String(len);
      p.style.strokeDashoffset = String(len);
      // 次フレームで 0 へ遷移させアニメを走らせる
      requestAnimationFrame(() => {
        p.classList.add('is-drawing');
        p.style.strokeDashoffset = '0';
      });
      idx++;
      after(720, drawNext);
    };
    drawNext();
  }

  let chainFinished = false;
  function finishChain() {
    if (chainFinished) return; // どの経路からでも一度だけ
    chainFinished = true;
    phase = 'chained';
    els.stage.classList.add('is-complete');
    els.status.textContent = '相関分析が完了しました。陽動DDoSの裏で本命が進行——一本の攻撃ストーリーが立ち上がりました。';
    revealBanner();
    openDecision();
  }

  let bannerShown = false;
  function revealBanner() {
    if (bannerShown) return;
    bannerShown = true;
    els.banner.hidden = false;
    // 二重フレームでフェードイン(reduced時はCSS側で即時)
    requestAnimationFrame(() => {
      els.banner.classList.add('is-shown');
    });
    els.stage.classList.add('has-banner');
    emit('chat:push', {
      from: 'アオイ先輩',
      text: '……つながったね。全部、一本の線だった。ここからは封じ込めの判断。あなたが決めて。',
      cls: 'sys',
    });
  }

  // ---- 封じ込め判断 ----------------------------------------------------
  let decisionOpened = false;
  function openDecision() {
    if (decisionOpened) return;
    decisionOpened = true;
    els.decision.hidden = false;
    const btns = els.choicesWrap.querySelectorAll('.ns-kc__choice');
    btns.forEach((b) => {
      const handler = () => onDecide(b.dataset.choice, btns);
      b.addEventListener('click', handler);
      cleanups.push(() => b.removeEventListener('click', handler));
    });
    // 判断へ視線誘導
    after(reduced() ? 0 : 400, () => {
      try {
        els.decision.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' });
      } catch (e) {
        /* 古い環境ではオプション非対応 */
      }
    });
  }

  function onDecide(choiceId, btns) {
    if (phase === 'decided') return;
    const choice = CHOICES.find((c) => c.id === choiceId);
    if (!choice) return;
    phase = 'decided';

    btns.forEach((b) => {
      b.disabled = true;
      b.classList.toggle('is-picked', b.dataset.choice === choiceId);
      if (b.dataset.choice === choiceId) b.setAttribute('aria-pressed', 'true');
    });

    // スコア反映(actions.addScore。無ければ握りつぶす)
    const actions = apiRef && apiRef.actions;
    let decidedViaActions = false;
    if (actions) {
      if (typeof actions.addScore === 'function') {
        const sc = choice.score;
        if (sc.containment) actions.addScore('containment', sc.containment);
        if (sc.ethics) actions.addScore('ethics', sc.ethics);
        if (sc.speed) actions.addScore('speed', sc.speed);
      }
      if (typeof actions.decide === 'function') {
        // actions.decide が decision:made を発火する(唯一の発火者)。
        actions.decide('containment', choiceId);
        decidedViaActions = true;
      }
    }
    // actions 経由で記録できない場合のみ、判断イベントを直接発火(二重発火防止)。
    if (!decidedViaActions) emit('decision:made', { id: 'containment', choice: choiceId });

    // 講評表示(色+タグ+テキストの三重表現)
    const meta = VERDICT_META[choice.verdict] || { tag: '判断', cls: 'info' };
    els.review.hidden = false;
    els.review.className = 'ns-kc__review is-shown ns-kc__review--' + meta.cls;
    els.review.innerHTML = '';
    const rTag = el('span', 'ns-kc__review-tag ns-kc__review-tag--' + meta.cls, meta.tag);
    const rHead = el('p', 'ns-kc__review-head');
    rHead.appendChild(rTag);
    rHead.appendChild(el('span', 'ns-kc__review-choice', choice.label));
    els.review.appendChild(rHead);
    els.review.appendChild(el('p', 'ns-kc__review-body', choice.review));

    // スコア差の可視化
    const diff = el('p', 'ns-kc__review-score');
    diff.textContent =
      '封じ込め +' + choice.score.containment + ' ｜ 倫理 +' + choice.score.ethics + ' ｜ 迅速 +' + choice.score.speed;
    els.review.appendChild(diff);

    // 次へ進むボタン(演出の「間」を残しつつ、確定でchain:done)
    const nextBtn = el('button', 'ns-btn ns-btn--primary ns-kc__next', '判断を確定して朝を待つ');
    nextBtn.type = 'button';
    const nextHandler = () => {
      nextBtn.disabled = true;
      emit('chain:done', {});
    };
    nextBtn.addEventListener('click', nextHandler);
    cleanups.push(() => nextBtn.removeEventListener('click', nextHandler));
    els.review.appendChild(nextBtn);

    toast('封じ込め判断を記録しました。', meta.cls === 'ok' ? 'ok' : 'warn');
  }

  // ---- 公開API(§10) ---------------------------------------------------
  function mount(rootEl, api) {
    root = rootEl || document.getElementById('game-root');
    apiRef = api || {};
    phase = 'scatter';
    chainFinished = false;
    bannerShown = false;
    decisionOpened = false;
    cleanups = [];
    timers.length = 0;
    if (!root) return;
    build();
  }

  function unmount() {
    timers.forEach((id) => window.clearTimeout(id));
    timers.length = 0;
    cleanups.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        /* リスナー解除失敗は無視 */
      }
    });
    cleanups = [];
    if (root) root.innerHTML = '';
    els = null;
    apiRef = null;
    root = null;
    phase = 'scatter';
  }

  NS.games.killchain = { mount, unmount };
})();
