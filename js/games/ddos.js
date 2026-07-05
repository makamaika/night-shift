// games/ddos.js … フェーズ3ミニゲーム: DDoS(処理能力超過)を手で収める。
// SVG折れ線トラフィックグラフ + NAPTセッションゲージ + 対策4類型 + リトライストームの罠。
(() => {
  'use strict';

  const NS = (window.NS = window.NS || {});
  NS.games = NS.games || {};

  // ---- 定数 ----------------------------------------------------------------
  const SESSION_MAX = 65536;      // NAPTセッション上限(ポート16bit)
  const BASE_CAPACITY = 100;      // サーバの基準処理能力(相対値)
  const WINDOW_SEC = 60;          // グラフの時間窓(秒)
  const POINTS = 120;             // 折れ線のサンプル点数(0.5秒刻み=60秒)
  const GRAPH_W = 640;            // SVG論理幅
  const GRAPH_H = 200;            // SVG論理高
  const AMBER_RATIO = 0.80;       // ゲージ琥珀しきい
  const RED_RATIO = 0.95;         // ゲージ赤しきい
  const RETRY_MULT = 1.6;         // リトライ指示を踏んだときの負荷倍率
  const KDDI_REF_ID = 'kddi2022'; // REAL_REFS のKDDIカード

  // ---- モジュール状態 ------------------------------------------------------
  let api = null;
  let root = null;
  let els = null;             // DOM参照のまとめ
  let series = null;          // 折れ線の値配列(load, %)
  let rafId = 0;
  let stepTimer = 0;
  let settleTimer = 0;
  let running = false;
  let lastFrame = 0;
  let simTime = 0;            // 経過秒(内部)
  let resolved = false;

  // ゲームの動的変数
  let load = 0;              // 現在の流入負荷(capacityに対する相対%: 0〜約400)
  let targetLoad = 0;        // 攻撃が押し込もうとする目標負荷
  let capacity = BASE_CAPACITY;
  let attackMult = 1;        // リトライ罠で増える攻撃倍率
  let sessions = 0;          // 現在のNAPTセッション数

  // 対策の適用状態(4類型 + 罠)
  const measures = {
    rate: false,   // 流入を減らす(レートリミット)
    scale: false,  // 処理を増やす(スケールアウト)
    prio: false,   // 優先順位(QoS)
    isolate: false // 分離(仮想待合室)
  };
  let mistakes = 0;        // 罠を踏んだ回数
  let retryArmed = false;  // 罠を1度踏んだフラグ(重複KDDIカード抑止)

  // 収束の必須2手: レートリミット + 分離
  const REQUIRED = ['rate', 'isolate'];

  // ---- 対策ボタン定義 ------------------------------------------------------
  // effect: 適用時に負荷/セッション/容量へ与える即時+継続効果。
  const BUTTONS = [
    {
      key: 'rate', kind: 'good',
      label: '流入を減らす(レートリミット)',
      desc: '過剰なリクエストを入口で間引く。輻輳制御と同じ発想。',
      knowledge: 'tcp-cc'
    },
    {
      key: 'scale', kind: 'good',
      label: '処理を増やす(スケールアウト)',
      desc: 'サーバ台数を増やして処理能力そのものを引き上げる。',
      knowledge: 'throughput'
    },
    {
      key: 'prio', kind: 'good',
      label: '優先順位をつける(QoS)',
      desc: '正規利用者の通信を優先し、疑わしい流入を後回しに。',
      knowledge: 'congestion'
    },
    {
      key: 'isolate', kind: 'good',
      label: '分離する(仮想待合室)',
      desc: '待合室に一旦入れて捌く量を制御し、本体を守る。',
      knowledge: 'reverse-proxy'
    },
    {
      key: 'retry', kind: 'trap',
      label: '全クライアントに即時リトライ指示',
      desc: '「すぐ再接続を」と一斉通知。一見親切だが……',
      knowledge: 'retry-storm'
    }
  ];

  // =========================================================================
  // マウント / アンマウント
  // =========================================================================
  function mount(rootEl, apiObj) {
    api = apiObj || {};
    root = rootEl;
    resolved = false;
    mistakes = 0;
    retryArmed = false;
    attackMult = 1;
    simTime = 0;

    for (const k in measures) measures[k] = false;

    build();
    initSim();
    renderMeasures();
    updateReadout();
    drawGraph();

    start();
    return true;
  }

  function unmount() {
    stop();
    if (root) root.innerHTML = '';
    els = null;
    series = null;
    api = null;
  }

  // =========================================================================
  // DOM 構築(rootEl配下のみ。ns-クラス + 既存トークン)
  // =========================================================================
  function build() {
    root.innerHTML = '';
    const wrap = ce('div', 'ns-game ns-game--ddos');

    // 見出し
    const head = ce('div', 'ns-game__head');
    head.appendChild(ce('p', 'ns-game__kicker', '02:30 ｜ INCIDENT — VOLUMETRIC DDoS'));
    head.appendChild(ce('h3', 'ns-game__title', '嵐が来る — 処理能力を超える要求を収める'));
    head.appendChild(ce('p', 'ns-game__lede',
      '自社サイトへ流量スパイク。グラフとセッションゲージを見ながら対策を打ち、収束させてください。' +
      '正しい二手(入口で減らす+分離)で嵐は収まります。'));
    wrap.appendChild(head);

    // 計器(グラフ + ゲージ)
    const meters = ce('div', 'ns-ddos__meters');

    // --- トラフィックグラフ ---
    const gWrap = ce('div', 'ns-ddos__graph ns-card');
    const gTitle = ce('div', 'ns-ddos__meter-title');
    gTitle.appendChild(ce('span', 'ns-ddos__meter-name', 'トラフィック(直近60秒)'));
    const gVal = ce('span', 'ns-ddos__meter-val', '負荷 0%');
    gTitle.appendChild(gVal);
    gWrap.appendChild(gTitle);

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'ns-ddos__svg');
    svg.setAttribute('viewBox', `0 0 ${GRAPH_W} ${GRAPH_H}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', '受信トラフィックの折れ線グラフ。処理能力の上限を超えると危険域に入ります。');

    // グリッド + 容量ライン
    const grid = document.createElementNS(svgNS, 'g');
    grid.setAttribute('class', 'ns-ddos__grid');
    for (let i = 1; i < 4; i++) {
      const y = (GRAPH_H / 4) * i;
      const ln = document.createElementNS(svgNS, 'line');
      ln.setAttribute('x1', 0); ln.setAttribute('x2', GRAPH_W);
      ln.setAttribute('y1', y); ln.setAttribute('y2', y);
      grid.appendChild(ln);
    }
    svg.appendChild(grid);

    // 容量(処理能力)ライン = 100% の高さ
    const capLine = document.createElementNS(svgNS, 'line');
    capLine.setAttribute('class', 'ns-ddos__capline');
    capLine.setAttribute('x1', 0); capLine.setAttribute('x2', GRAPH_W);
    const capY = loadToY(100);
    capLine.setAttribute('y1', capY); capLine.setAttribute('y2', capY);
    svg.appendChild(capLine);

    // 塗り(エリア) + 折れ線
    const area = document.createElementNS(svgNS, 'path');
    area.setAttribute('class', 'ns-ddos__area');
    svg.appendChild(area);
    const line = document.createElementNS(svgNS, 'polyline');
    line.setAttribute('class', 'ns-ddos__line');
    line.setAttribute('fill', 'none');
    svg.appendChild(line);

    // 容量ラベル
    const capLabel = document.createElementNS(svgNS, 'text');
    capLabel.setAttribute('class', 'ns-ddos__caplabel');
    capLabel.setAttribute('x', 6);
    capLabel.setAttribute('y', capY - 5);
    capLabel.textContent = '処理能力の上限';
    svg.appendChild(capLabel);

    gWrap.appendChild(svg);
    meters.appendChild(gWrap);

    // --- NAPTセッションゲージ ---
    const sWrap = ce('div', 'ns-ddos__gauge ns-card');
    const sTitle = ce('div', 'ns-ddos__meter-title');
    sTitle.appendChild(ce('span', 'ns-ddos__meter-name', 'NAPTセッション'));
    const sVal = ce('span', 'ns-ddos__meter-val', '0 / ' + fmt(SESSION_MAX));
    sTitle.appendChild(sVal);
    sWrap.appendChild(sTitle);

    const barOuter = ce('div', 'ns-ddos__bar');
    barOuter.setAttribute('role', 'progressbar');
    barOuter.setAttribute('aria-label', 'NAPTセッション使用率');
    barOuter.setAttribute('aria-valuemin', '0');
    barOuter.setAttribute('aria-valuemax', String(SESSION_MAX));
    barOuter.setAttribute('aria-valuenow', '0');
    const barFill = ce('div', 'ns-ddos__bar-fill');
    barFill.setAttribute('data-level', 'ok');
    barOuter.appendChild(barFill);
    sWrap.appendChild(barOuter);

    const sNote = ce('p', 'ns-ddos__gauge-note',
      'ポート番号は16ビット=上限およそ65,536。ここが枯渇すると新規通信ができなくなります。');
    sWrap.appendChild(sNote);

    // 状態テキスト(色+アイコン+文字の三重表現)
    const sState = ce('p', 'ns-ddos__state');
    sState.setAttribute('data-level', 'ok');
    sState.setAttribute('aria-live', 'polite');
    const sIco = ce('span', 'ns-ddos__state-ico', '●');
    sIco.setAttribute('aria-hidden', 'true');
    const sTxt = ce('span', 'ns-ddos__state-txt', '正常: 余裕あり');
    sState.appendChild(sIco);
    sState.appendChild(sTxt);
    sWrap.appendChild(sState);

    meters.appendChild(sWrap);
    wrap.appendChild(meters);

    // 対策ボタン群
    const controls = ce('div', 'ns-ddos__controls');
    const cTitle = ce('h4', 'ns-ddos__controls-title', '対策を打つ(4類型)');
    controls.appendChild(cTitle);
    const goodGrid = ce('div', 'ns-ddos__btns');
    controls.appendChild(goodGrid);

    const trapWrap = ce('div', 'ns-ddos__trap');
    trapWrap.appendChild(ce('p', 'ns-ddos__trap-label', '通知オプション'));
    const trapGrid = ce('div', 'ns-ddos__btns ns-ddos__btns--trap');
    trapWrap.appendChild(trapGrid);
    controls.appendChild(trapWrap);
    wrap.appendChild(controls);

    // 進捗 / メッセージ
    const status = ce('div', 'ns-ddos__status');
    status.setAttribute('aria-live', 'polite');
    const stepList = ce('ol', 'ns-ddos__steps');
    status.appendChild(stepList);
    const msg = ce('p', 'ns-ddos__msg', '対策を選ぶと、効果がすぐグラフに反映されます。');
    status.appendChild(msg);
    wrap.appendChild(status);

    root.appendChild(wrap);

    els = {
      svg, area, line, capLine, capLabel,
      gVal, sVal, barOuter, barFill, sState, sStateIco: sIco, sStateTxt: sTxt,
      goodGrid, trapGrid, stepList, msg
    };

    buildButtons();
    buildSteps();
  }

  function buildButtons() {
    els.goodGrid.innerHTML = '';
    els.trapGrid.innerHTML = '';
    for (const b of BUTTONS) {
      const btn = ce('button', 'ns-btn ns-ddos__btn');
      btn.type = 'button';
      btn.dataset.key = b.key;
      btn.dataset.kind = b.kind;
      if (b.kind === 'trap') btn.classList.add('ns-ddos__btn--trap');
      const t = ce('span', 'ns-ddos__btn-label', b.label);
      const d = ce('span', 'ns-ddos__btn-desc', b.desc);
      btn.appendChild(t);
      btn.appendChild(d);
      btn.addEventListener('click', () => onMeasure(b));
      (b.kind === 'trap' ? els.trapGrid : els.goodGrid).appendChild(btn);
    }
  }

  function buildSteps() {
    els.stepList.innerHTML = '';
    const labels = [
      { key: 'rate', text: '入口で流入を減らす' },
      { key: 'isolate', text: '本体を待合室で分離する' }
    ];
    for (const s of labels) {
      const li = ce('li', 'ns-ddos__step');
      li.dataset.key = s.key;
      const ico = ce('span', 'ns-ddos__step-ico', '○');
      ico.setAttribute('aria-hidden', 'true');
      const tx = ce('span', 'ns-ddos__step-txt', s.text);
      li.appendChild(ico);
      li.appendChild(tx);
      els.stepList.appendChild(li);
    }
  }

  // =========================================================================
  // シミュレーション初期化
  // =========================================================================
  function initSim() {
    load = 40;                 // 開始時点で軽い上昇の兆し
    targetLoad = 320;          // 攻撃が押し込む目標(容量の3倍超)
    capacity = BASE_CAPACITY;
    sessions = Math.round(SESSION_MAX * 0.30);
    // 折れ線の初期化(平坦から)
    series = new Array(POINTS).fill(load);
  }

  // =========================================================================
  // 対策ボタンのハンドラ
  // =========================================================================
  function onMeasure(b) {
    if (resolved) return;

    if (b.kind === 'trap') {
      // 罠: リトライストーム。負荷を1.6倍化、悪化、KDDIカード提示。
      mistakes++;
      attackMult *= RETRY_MULT;
      targetLoad = Math.min(targetLoad * RETRY_MULT, 900);
      load = Math.min(load * 1.25 + 40, 900);
      sessions = Math.min(sessions + Math.round(SESSION_MAX * 0.12), SESSION_MAX);
      useKnowledge(b.knowledge);
      flashMsg('一斉リトライで再接続が殺到——負荷が跳ね上がった。これがリトライストームです。', 'warn');
      pushChat('アオイ先輩',
        'それ、逆効果! みんなが同時に繋ぎ直すと入口がさらに詰まる。KDDIの事例を見て。', 'warn');
      presentKddiCard();
      pulseTrapButton(b.key);
      updateReadout();
      drawGraph();
      return;
    }

    // 通常の4類型
    if (measures[b.key]) {
      flashMsg('その対策はすでに投入済みです。', 'info');
      return;
    }
    measures[b.key] = true;
    useKnowledge(b.knowledge);
    applyMeasureEffect(b.key);
    markButtonApplied(b.key);
    renderMeasures();
    updateReadout();
    drawGraph();
    evaluateConvergence();
  }

  // 各対策の即時効果(押すたびグラフに即反映=収束の快感)
  function applyMeasureEffect(key) {
    switch (key) {
      case 'rate':
        // 入口で流入を減らす: 目標負荷を大きく削る
        targetLoad *= 0.45;
        load *= 0.7;
        flashMsg('レートリミット投入。過剰な流入を入口で間引き始めました。', 'ok');
        break;
      case 'isolate':
        // 分離(待合室): 本体到達量を抑え、セッション消費を止める
        targetLoad *= 0.5;
        sessions = Math.round(sessions * 0.6);
        flashMsg('仮想待合室を有効化。捌ける量に絞って本体を守ります。', 'ok');
        break;
      case 'scale':
        // 処理を増やす: 容量を引き上げる(相対的に負荷率が下がる)
        capacity = Math.round(capacity * 1.6);
        flashMsg('スケールアウト。処理能力そのものを引き上げました。', 'ok');
        break;
      case 'prio':
        // 優先順位: 正規通信を優先。負荷ピークをならす
        targetLoad *= 0.8;
        load *= 0.9;
        flashMsg('QoSで正規利用者を優先。疑わしい流入を後回しにします。', 'ok');
        break;
    }
    if (capacity < 1) capacity = 1;
  }

  // =========================================================================
  // 収束判定
  // =========================================================================
  function evaluateConvergence() {
    if (resolved) return;
    const has = REQUIRED.every(k => measures[k]);
    if (has) {
      // 必須2手が揃った。以降のシムで負荷は基準以下へ収束していく。
      targetLoad = Math.min(targetLoad, capacity * 0.35);
      finalize();
    }
  }

  function finalize() {
    resolved = true;
    flashMsg('嵐は収束しました。処理能力の範囲に流入が戻っています。', 'ok');
    pushChat('アオイ先輩',
      'ナイス。入口で減らして、待合室で分ける——王道の二手で収まったね。よく捌いた。', 'ok');

    const methods = Object.keys(measures).filter(k => measures[k]);

    // 主ループを止め、settle専用ループでグラフを収束方向へ落としてから完了通知。
    stop();
    running = true;                 // settleループ継続のため
    const stopAt = Date.now() + 1400;
    const settle = () => {
      if (!running) return;
      if (Date.now() >= stopAt) {
        stop();
        emit('ddos:resolved', { methods, mistakes });
        if (typeof api.onDone === 'function') {
          api.onDone({ game: 'ddos', methods, mistakes });
        }
        return;
      }
      simStep(0.2);
      pushSample();
      drawGraph();
      updateReadout();
      settleTimer = window.setTimeout(settle, 200);
    };
    settleTimer = window.setTimeout(settle, 200);
  }

  // =========================================================================
  // シミュレーションループ
  // =========================================================================
  function start() {
    running = true;
    if (isReduced()) {
      // reduced: 1秒ステップの離散更新(requestAnimationFrame不使用)
      const tick = () => {
        if (!running) return;
        simStep(1.0);
        pushSample();
        drawGraph();
        updateReadout();
        stepTimer = window.setTimeout(tick, 1000);
      };
      stepTimer = window.setTimeout(tick, 1000);
    } else {
      lastFrame = 0;
      rafId = window.requestAnimationFrame(frame);
    }
  }

  function stop() {
    running = false;
    if (rafId) { window.cancelAnimationFrame(rafId); rafId = 0; }
    if (stepTimer) { window.clearTimeout(stepTimer); stepTimer = 0; }
    if (settleTimer) { window.clearTimeout(settleTimer); settleTimer = 0; }
  }

  function frame(ts) {
    if (!running) return;
    if (!lastFrame) lastFrame = ts;
    let dt = (ts - lastFrame) / 1000;
    lastFrame = ts;
    if (dt > 0.1) dt = 0.1;       // タブ復帰などの巨大dtを抑制

    simTime += dt;
    simStep(dt);

    // 0.5秒ごとにサンプルを1点追加(WINDOW_SEC/POINTS = 0.5s)
    if (simTime >= 0.5) {
      simTime -= 0.5;
      pushSample();
    }
    drawGraph();
    updateReadout();

    rafId = window.requestAnimationFrame(frame);
  }

  // 物理: loadはtargetLoadへ追従。未対策なら攻撃で上振れ。
  function simStep(dt) {
    // 追従速度(対策後は速く収束)
    const applied = REQUIRED.every(k => measures[k]);
    const follow = applied ? 1.8 : 0.9;
    const diff = targetLoad - load;
    load += diff * Math.min(1, follow * dt);

    // 未収束なら小さな揺らぎ(攻撃の脈動)。reduced時は揺らぎ無し。
    if (!resolved && !isReduced()) {
      const wob = Math.sin(simTimePhase()) * 6 * attackMult;
      load += wob * dt;
    }
    if (load < 0) load = 0;
    if (load > 900) load = 900;

    // セッション: 負荷が容量超過だと増え、収まると自然減
    const ratio = load / capacity;         // 1.0で容量ちょうど
    if (!measures.isolate) {
      if (ratio > 1) {
        sessions += (ratio - 1) * SESSION_MAX * 0.05 * dt * attackMult;
      } else {
        sessions -= SESSION_MAX * 0.03 * dt;
      }
    } else {
      // 待合室ありなら消費が頭打ち→ゆっくり回復
      sessions -= SESSION_MAX * 0.06 * dt;
    }
    if (sessions < SESSION_MAX * 0.05) sessions = SESSION_MAX * 0.05;
    if (sessions > SESSION_MAX) sessions = SESSION_MAX;
  }

  let _phase = 0;
  function simTimePhase() { _phase += 0.35; return _phase; }

  function pushSample() {
    series.push(loadPercent());
    while (series.length > POINTS) series.shift();
  }

  // =========================================================================
  // 描画
  // =========================================================================
  function loadPercent() { return (load / capacity) * 100; }

  function loadToY(pct) {
    // 0% → 底(GRAPH_H), 200%(容量2倍) → 天井付近。表示上限は250%でクランプ。
    const clamped = Math.max(0, Math.min(250, pct));
    const y = GRAPH_H - (clamped / 250) * GRAPH_H;
    return Math.round(y * 10) / 10;
  }

  function drawGraph() {
    if (!els) return;
    const n = series.length;
    const stepX = GRAPH_W / (POINTS - 1);
    let pts = '';
    for (let i = 0; i < n; i++) {
      const x = Math.round(i * stepX * 10) / 10;
      const y = loadToY(series[i]);
      pts += (i ? ' ' : '') + x + ',' + y;
    }
    els.line.setAttribute('points', pts);

    // エリア(塗り): 折れ線の下を閉じる
    if (n > 0) {
      const firstX = 0;
      const lastX = Math.round((n - 1) * stepX * 10) / 10;
      let d = `M ${firstX},${GRAPH_H} `;
      for (let i = 0; i < n; i++) {
        const x = Math.round(i * stepX * 10) / 10;
        const y = loadToY(series[i]);
        d += `L ${x},${y} `;
      }
      d += `L ${lastX},${GRAPH_H} Z`;
      els.area.setAttribute('d', d);
    }

    // 危険域(容量超過)なら線色を切り替え
    const pct = loadPercent();
    let lvl = 'ok';
    if (pct >= 130) lvl = 'red';
    else if (pct >= 95) lvl = 'amber';
    els.line.setAttribute('data-level', lvl);
    els.area.setAttribute('data-level', lvl);
    els.svg.setAttribute('data-level', lvl);
  }

  function updateReadout() {
    if (!els) return;
    const pct = loadPercent();
    els.gVal.textContent = '負荷 ' + Math.round(pct) + '%';

    const sInt = Math.round(sessions);
    const sRatio = sInt / SESSION_MAX;
    els.sVal.textContent = fmt(sInt) + ' / ' + fmt(SESSION_MAX);
    const pctW = Math.max(0, Math.min(100, sRatio * 100));
    els.barFill.style.width = pctW.toFixed(1) + '%';
    els.barOuter.setAttribute('aria-valuenow', String(sInt));

    let lvl = 'ok', txt = '正常: 余裕あり';
    if (sRatio >= RED_RATIO) { lvl = 'red'; txt = '危険: セッション枯渇まぢか'; }
    else if (sRatio >= AMBER_RATIO) { lvl = 'amber'; txt = '警告: セッション消費が急増'; }
    els.barFill.setAttribute('data-level', lvl);
    els.sState.setAttribute('data-level', lvl);
    els.sStateTxt.textContent = txt + '(' + Math.round(sRatio * 100) + '%)';
    els.sStateIco.textContent = lvl === 'red' ? '▲' : (lvl === 'amber' ? '■' : '●');

    // busへ計器値を放流
    emit('ddos:update', {
      load: Math.round(load),
      capacity: Math.round(capacity),
      sessions: sInt,
      sessionMax: SESSION_MAX
    });
  }

  function renderMeasures() {
    if (!els) return;
    // ステップのチェック更新
    const items = els.stepList.querySelectorAll('.ns-ddos__step');
    items.forEach(li => {
      const k = li.dataset.key;
      const on = !!measures[k];
      li.setAttribute('data-done', on ? '1' : '0');
      const ico = li.querySelector('.ns-ddos__step-ico');
      if (ico) ico.textContent = on ? '●' : '○';
    });
  }

  function markButtonApplied(key) {
    const btn = els.goodGrid.querySelector('.ns-ddos__btn[data-key="' + key + '"]');
    if (btn) {
      btn.setAttribute('data-applied', '1');
      btn.disabled = true;
    }
  }

  function pulseTrapButton(key) {
    const btn = els.trapGrid.querySelector('.ns-ddos__btn[data-key="' + key + '"]');
    if (!btn) return;
    btn.setAttribute('data-pulsed', '1');
    if (!isReduced()) {
      btn.classList.remove('ns-ddos__btn--shake');
      // 再フロー後にクラス付与でアニメを走らせる
      void btn.offsetWidth;
      btn.classList.add('ns-ddos__btn--shake');
      window.setTimeout(() => btn.classList.remove('ns-ddos__btn--shake'), 600);
    }
  }

  function flashMsg(text, kind) {
    if (!els) return;
    els.msg.textContent = text;
    els.msg.setAttribute('data-kind', kind || 'info');
  }

  // =========================================================================
  // KDDIカード提示(REAL_REFS参照 → chat:push)
  // =========================================================================
  function presentKddiCard() {
    if (retryArmed) return;   // 1度だけ提示
    retryArmed = true;
    const ref = findRealRef(KDDI_REF_ID);
    let text;
    if (ref) {
      text = '【参考事例】' + (ref.name || 'KDDI大規模通信障害') +
        ' — ' + (ref.fact || '') +
        (ref.lesson ? '(' + ref.lesson + ')' : '');
    } else {
      text = '【参考事例】KDDI大規模通信障害(2022) — 一斉再接続(リトライストーム)が復旧を長引かせた実例。';
    }
    pushChat('参考カード', text, 'ref');
  }

  function findRealRef(id) {
    const list = (window.NSD && Array.isArray(NSD.REAL_REFS)) ? NSD.REAL_REFS : null;
    if (!list) return null;
    for (const r of list) if (r && r.id === id) return r;
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

  function isReduced() {
    if (api && api.state && typeof api.state.reduced === 'boolean') return api.state.reduced;
    if (NS.state && typeof NS.state.reduced === 'boolean') return NS.state.reduced;
    return false;
  }

  // ---- 小物ユーティリティ --------------------------------------------------
  function ce(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  function fmt(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // ---- 公開 ----------------------------------------------------------------
  NS.games.ddos = { mount, unmount };
})();
