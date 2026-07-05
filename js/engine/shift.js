// engine/shift.js — NS.shift(フェーズ進行の状態機械)。契約§11準拠。
// intro→alerts push→objectives監視→(game)→次フェーズ→…→dawnで shift:end。
// 連携はすべて NS.bus / NS.actions 経由。DOM は触らない。
(() => {
  'use strict';

  const NS = (window.NS = window.NS || {});
  const bus = NS.bus;
  const actions = NS.actions;

  function story() {
    return (window.NSD && NSD.STORY) || {};
  }
  function phasesList() {
    const s = story();
    return Array.isArray(s.phases) ? s.phases : [];
  }
  function reduced() {
    return !!(NS.state && NS.state.reduced);
  }

  // ---- 進行状態 ------------------------------------------------------------
  let started = false;
  let currentPhase = null; // story.phases の要素
  let advancing = false; // 二重進行ガード
  const objectiveMonitors = []; // {off} 現フェーズの監視解除関数
  let advanceTimer = null;

  function phaseIndexOf(id) {
    const list = phasesList();
    for (let i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return i;
    return -1;
  }
  function phaseById(id) {
    return phasesList().find((p) => p && p.id === id) || null;
  }

  // =========================================================================
  //  起動
  // =========================================================================
  function start(payload) {
    const mode = payload && payload.mode;
    const phaseId = (payload && payload.phaseId) || 'quiet';
    if (mode && actions) actions.setMode(mode);
    started = true;
    jumpTo(phaseId);
  }

  // 章ジャンプ:前提(grants)を投入してから直接そのフェーズへ。
  function jumpTo(phaseId) {
    const phase = phaseById(phaseId) || phasesList()[0] || null;
    if (!phase) return;

    // 前フェーズの監視を止める。
    teardownPhase();
    clearAdvanceTimer();

    // ジャンプ先までの前提投入(選んだ地点から始めても物語が破綻しないように)。
    applyGrants(phase);

    enterPhase(phase);
  }

  // grants:{knowledge:[], evidence:[]} を silent 解禁/追加。
  // さらに、ジャンプ先より前のフェーズの unlocks も前提として静かに解禁する。
  function applyGrants(phase) {
    if (!actions) return;
    const targetIndex = phaseIndexOf(phase.id);

    // 先行フェーズの unlocks を前提投入(通しプレイと同じ知識状態に近づける)。
    const list = phasesList();
    for (let i = 0; i < targetIndex; i++) {
      const p = list[i];
      if (!p) continue;
      if (Array.isArray(p.unlocks)) p.unlocks.forEach((id) => actions.unlockKnowledge(id, { silent: true }));
      // 先行フェーズの目標は「達成済み」として簡易フラグ化(監視対象にしない)。
    }

    const g = phase.grants || {};
    if (Array.isArray(g.knowledge)) g.knowledge.forEach((id) => actions.unlockKnowledge(id, { silent: true }));
    if (Array.isArray(g.evidence)) g.evidence.forEach((id) => actions.addEvidence(id));
    if (g.flags && typeof g.flags === 'object') {
      Object.keys(g.flags).forEach((k) => actions.setFlag(k, g.flags[k]));
    }
  }

  // =========================================================================
  //  フェーズ進入
  // =========================================================================
  function enterPhase(phase) {
    currentPhase = phase;

    // 時計を合わせる(clockMin 優先、なければ clock 文字列から)。
    const min = resolvePhaseMin(phase);
    if (actions) actions.setClock(min);

    // state 更新 + phase:enter 発火。
    if (actions) actions.enterPhase(phase.id);

    // 導入チャット。
    emitIntro(phase);

    // この時点で解禁する知識(unlocks)。
    if (actions && Array.isArray(phase.unlocks)) {
      phase.unlocks.forEach((id) => actions.unlockKnowledge(id));
    }

    // アラート push。
    pushPhaseAlerts(phase);

    // dawn(report フェーズ)なら即シフト終了へ。
    if (phase.report || phase.id === 'dawn') {
      endShift();
      return;
    }

    // 目標監視を開始。目標が無ければ即ゲーム/次へ。
    setupObjectiveMonitors(phase);
    if (!hasObjectives(phase)) {
      onAllObjectivesDone(phase);
    }
  }

  function resolvePhaseMin(phase) {
    if (Number.isFinite(phase.clockMin)) return phase.clockMin;
    if (typeof phase.clock === 'string') {
      const m = /^(\d{1,2}):(\d{2})$/.exec(phase.clock.trim());
      if (m) return Number(m[1]) * 60 + Number(m[2]);
    }
    return NS.state ? NS.state.clockMin : 0;
  }

  function emitIntro(phase) {
    const intro = phase.intro;
    if (!Array.isArray(intro) || !bus) return;
    // reduced でも内容は出す。演出のみ shift 側では簡素に順次 emit。
    if (reduced()) {
      intro.forEach((m) => m && bus.emit('chat:push', { from: m.from, text: m.text, cls: m.cls || 'intro' }));
      return;
    }
    // 少し間を置いて1通ずつ流す。
    let i = 0;
    const tick = () => {
      if (i >= intro.length) return;
      const m = intro[i++];
      if (m) bus.emit('chat:push', { from: m.from, text: m.text, cls: m.cls || 'intro' });
      if (i < intro.length) setTimeout(tick, 900);
    };
    tick();
  }

  function pushPhaseAlerts(phase) {
    if (!Array.isArray(phase.alerts) || !actions) return;
    phase.alerts.forEach((id) => id && actions.pushAlert(id));
  }

  // =========================================================================
  //  目標監視(doneOn: busイベント名 + match の部分一致で汎用判定)
  // =========================================================================
  function hasObjectives(phase) {
    return Array.isArray(phase.objectives) && phase.objectives.length > 0;
  }

  function setupObjectiveMonitors(phase) {
    teardownMonitors();
    if (!Array.isArray(phase.objectives) || !bus) return;

    phase.objectives.forEach((obj) => {
      if (!obj || !obj.id) return;
      // 既に達成済みなら監視しない(ジャンプ/再開対応)。
      if (isObjectiveDone(phase.id, obj.id)) return;

      const doneOn = obj.doneOn;
      if (!doneOn || !doneOn.event) return;

      const handler = (payload) => {
        if (matchesPartial(payload, doneOn.match)) {
          markObjectiveDone(phase, obj);
        }
      };
      const off = bus.on(doneOn.event, handler);
      objectiveMonitors.push({ off: off });
    });
  }

  function isObjectiveDone(phaseId, objId) {
    const st = NS.state;
    return !!(st && st.objectives && st.objectives[phaseId] && st.objectives[phaseId][objId] === true);
  }

  function markObjectiveDone(phase, obj) {
    if (isObjectiveDone(phase.id, obj.id)) return;
    if (actions) actions.completeObjective(phase.id, obj.id); // objective:done 発火
    // 速度スコア:早い達成にわずかな加点(任意)。
    if (actions) actions.addScore('speed', 1);
    // このフェーズの全目標が揃ったか。
    if (allObjectivesDone(phase)) {
      onAllObjectivesDone(phase);
    }
  }

  function allObjectivesDone(phase) {
    if (!Array.isArray(phase.objectives)) return true;
    return phase.objectives.every((o) => o && o.id && isObjectiveDone(phase.id, o.id));
  }

  // payload が match の全キーに部分一致するか(値が配列なら含有、オブジェクトなら再帰)。
  function matchesPartial(payload, match) {
    if (match == null) return true; // match未指定=イベント発火のみで達成
    if (typeof match !== 'object') {
      // 文字列/数値 match は、id を持つイベント(evidence:add {id} 等)では
      // payload.id との一致を意味する(story の match:'ev-iot' 記法)。
      if (payload && typeof payload === 'object') {
        if (payload.id !== undefined) return payload.id === match;
        if (payload.alertId !== undefined) return payload.alertId === match;
        if (payload.phaseId !== undefined) return payload.phaseId === match;
        return false;
      }
      return payload === match;
    }
    if (payload == null || typeof payload !== 'object') return false;
    return Object.keys(match).every((k) => valueMatches(payload[k], match[k]));
  }

  function valueMatches(actual, expected) {
    if (expected == null) return true;
    if (Array.isArray(expected)) {
      // 期待が配列:actualがその配列の要素のいずれかに一致(argv一致等)、
      // または actual 自身が配列で expected を包含。
      if (Array.isArray(actual)) return expected.every((e) => actual.indexOf(e) !== -1);
      return expected.indexOf(actual) !== -1;
    }
    if (typeof expected === 'object') {
      if (actual == null || typeof actual !== 'object') return false;
      return Object.keys(expected).every((k) => valueMatches(actual[k], expected[k]));
    }
    // プリミティブ:厳密一致。ただし actual が配列なら含有で判定(argvにcmd名等)。
    if (Array.isArray(actual)) return actual.indexOf(expected) !== -1;
    return actual === expected;
  }

  // =========================================================================
  //  全目標達成 → ゲーム or 次フェーズ
  // =========================================================================
  function onAllObjectivesDone(phase) {
    teardownMonitors();

    // アラートを解決済みに(このフェーズが push した分)。
    if (Array.isArray(phase.alerts) && actions) {
      phase.alerts.forEach((id) => id && actions.resolveAlert(id));
    }

    // ゲーム付きフェーズ:game:open を出し、ゲームの done イベントを待つ。
    const game = phase.game;
    if (game) {
      openGame(phase, game);
      return;
    }

    // それ以外は次フェーズへ。
    scheduleAdvance(phase);
  }

  // ゲーム連携:game:open 発火 → 各ゲームの完了イベントで次へ。
  const GAME_DONE_EVENT = {
    ddos: 'ddos:resolved',
    hash: 'hash:solved',
    killchain: 'chain:done',
  };

  let gameDoneOff = null;

  function openGame(phase, game) {
    if (!bus) {
      scheduleAdvance(phase);
      return;
    }
    // 対応タブへ促す(UIはこのイベントで pane-game を活性化)。
    bus.emit('game:open', { game: game });

    const doneEvent = GAME_DONE_EVENT[game];
    if (!doneEvent) {
      // 未知ゲームは待たず進める(安全側)。
      scheduleAdvance(phase);
      return;
    }
    cleanupGameListener();
    const handler = () => {
      cleanupGameListener();
      // ゲーム由来の証跡/相関は各ゲームが actions 経由で反映済みの想定。次フェーズへ。
      scheduleAdvance(phase);
    };
    gameDoneOff = bus.on(doneEvent, handler);
  }

  function cleanupGameListener() {
    if (gameDoneOff) {
      try {
        gameDoneOff();
      } catch (_) {
        /* noop */
      }
      gameDoneOff = null;
    }
  }

  // =========================================================================
  //  フェーズ送り(2秒の間、clockを次のclockMinへ)
  // =========================================================================
  function scheduleAdvance(phase) {
    if (advancing) return;
    advancing = true;
    const delay = reduced() ? 400 : 2000;
    clearAdvanceTimer();
    advanceTimer = setTimeout(() => {
      advancing = false;
      advanceTimer = null;
      goNext(phase);
    }, delay);
  }

  function clearAdvanceTimer() {
    if (advanceTimer != null) {
      clearTimeout(advanceTimer);
      advanceTimer = null;
    }
    advancing = false;
  }

  function goNext(fromPhase) {
    const idx = phaseIndexOf(fromPhase.id);
    const list = phasesList();
    const next = idx >= 0 ? list[idx + 1] : null;
    teardownPhase();
    if (!next) {
      // 末尾に到達:シフト終了。
      endShift();
      return;
    }
    enterPhase(next);
  }

  // =========================================================================
  //  終了
  // =========================================================================
  function endShift() {
    teardownPhase();
    clearAdvanceTimer();
    // 朝の時刻に合わせる(dawn相当)。
    const dawn = phaseById('dawn');
    const min = dawn ? resolvePhaseMin(dawn) : 360;
    if (actions) actions.setClock(min);
    if (bus) bus.emit('shift:end', {});
  }

  // =========================================================================
  //  片付け
  // =========================================================================
  function teardownMonitors() {
    while (objectiveMonitors.length) {
      const m = objectiveMonitors.pop();
      if (m && typeof m.off === 'function') {
        try {
          m.off();
        } catch (_) {
          /* noop */
        }
      }
    }
  }

  function teardownPhase() {
    teardownMonitors();
    cleanupGameListener();
  }

  // =========================================================================
  //  結線
  // =========================================================================
  if (bus) {
    bus.on('shift:start', (p) => start(p));
  }

  // ---- 公開(NS.shift) ----------------------------------------------------
  NS.shift = {
    start: start,
    jumpTo: jumpTo,
    // 現在フェーズの id(UI補助)。
    current() {
      return currentPhase ? currentPhase.id : null;
    },
    // 明示的に次へ(デバッグ/UI用。安全に片付けてから進める)。
    next() {
      if (currentPhase) {
        clearAdvanceTimer();
        goNext(currentPhase);
      }
    },
    isStarted() {
      return started;
    },
  };
})();
