// engine/state.js — NS.state(状態) / NS.bus(イベントバス) / NS.actions(唯一の変更経路) / セーブ・時計。
// 契約§3〜§6・§11準拠。データ(NSD)は参照のみ。UI/ゲームは参照しない(連携は NS.bus 経由)。
(() => {
  'use strict';

  const NS = (window.NS = window.NS || {});

  const SAVE_KEY = 'ns-save-v1';

  // ---- イベントバス(on/off/emit、リスナ例外は隔離) -----------------------
  const listeners = Object.create(null); // name -> Set<fn>

  const bus = {
    on(name, fn) {
      if (typeof name !== 'string' || typeof fn !== 'function') return () => {};
      (listeners[name] || (listeners[name] = new Set())).add(fn);
      return () => bus.off(name, fn);
    },
    off(name, fn) {
      const set = listeners[name];
      if (set) {
        set.delete(fn);
        if (set.size === 0) delete listeners[name];
      }
    },
    emit(name, payload) {
      const set = listeners[name];
      if (!set || set.size === 0) return;
      // スナップショットして反復中の増減に耐える。1つのリスナの例外が他を止めない。
      const snapshot = Array.from(set);
      const arg = payload === undefined ? {} : payload;
      for (let i = 0; i < snapshot.length; i++) {
        try {
          snapshot[i](arg);
        } catch (err) {
          reportListenerError(name, err);
        }
      }
    },
  };

  function reportListenerError(name, err) {
    // console.log は禁止。開発時のみ console.error に握りつぶし通知(本番でも無害)。
    try {
      if (typeof console !== 'undefined' && console && typeof console.error === 'function') {
        console.error('[NS.bus] listener error on "' + name + '":', err);
      }
    } catch (_) {
      /* noop */
    }
  }

  // ---- 状態の初期形(契約§5) ---------------------------------------------
  function freshState() {
    return {
      mode: 'guided', // 'guided'(見学) | 'pro'(実務)
      reduced: false, // prefers-reduced-motion または手動トグル
      clockMin: 0, // ゲーム内時刻(分)。00:00起点、06:00=360で朝
      phaseId: 'quiet',
      phaseIndex: 0,
      alerts: {}, // {alertId: 'new'|'open'|'resolved'}
      objectives: {}, // {phaseId: {objectiveId: true}}
      knowledgeUnlocked: [],
      knowledgeUsed: [],
      evidence: [], // 発見順の証跡id配列
      decisions: [], // {id, choice, clockMin}
      eggs: [], // 発見済みイースターエッグid
      score: { containment: 0, ethics: 0, speed: 0 },
      flags: {}, // 自由領域(文字列キー→プリミティブ)
    };
  }

  const state = freshState();

  // ---- 時刻整形 ------------------------------------------------------------
  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }
  function formatClock(min) {
    let m = Math.floor(Number(min) || 0);
    if (m < 0) m = 0;
    const hh = Math.floor(m / 60) % 24;
    const mm = m % 60;
    return pad2(hh) + ':' + pad2(mm);
  }

  // ---- 永続化 --------------------------------------------------------------
  let saveScheduled = false;

  function serialize() {
    return {
      v: 1,
      mode: state.mode,
      reduced: state.reduced,
      clockMin: state.clockMin,
      phaseId: state.phaseId,
      phaseIndex: state.phaseIndex,
      alerts: state.alerts,
      objectives: state.objectives,
      knowledgeUnlocked: state.knowledgeUnlocked,
      knowledgeUsed: state.knowledgeUsed,
      evidence: state.evidence,
      decisions: state.decisions,
      eggs: state.eggs,
      score: state.score,
      flags: state.flags,
    };
  }

  function hasStorage() {
    try {
      return typeof window !== 'undefined' && !!window.localStorage;
    } catch (_) {
      return false; // Safariプライベート等で localStorage アクセス自体が投げる場合
    }
  }

  function save() {
    saveScheduled = false;
    if (!hasStorage()) return false;
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(serialize()));
      return true;
    } catch (_) {
      // 容量超過・プライベートモード等。保存失敗は致命ではないので黙って諦める。
      return false;
    }
  }

  // 主要イベントごとに毎回 setItem すると重いので、次のマイクロ/フレームに集約。
  function scheduleSave() {
    if (saveScheduled) return;
    saveScheduled = true;
    const flush = () => save();
    if (typeof Promise !== 'undefined') {
      Promise.resolve().then(flush);
    } else if (typeof setTimeout !== 'undefined') {
      setTimeout(flush, 0);
    } else {
      flush();
    }
  }

  function isPlainObject(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
  }
  function asArray(v) {
    return Array.isArray(v) ? v.slice() : [];
  }

  function load() {
    if (!hasStorage()) return false;
    let raw;
    try {
      raw = window.localStorage.getItem(SAVE_KEY);
    } catch (_) {
      return false;
    }
    if (!raw) return false;
    let data;
    try {
      data = JSON.parse(raw);
    } catch (_) {
      // 壊れたセーブは破棄。
      discardSave();
      return false;
    }
    if (!isPlainObject(data)) {
      discardSave();
      return false;
    }
    try {
      applyLoaded(data);
      return true;
    } catch (_) {
      // 予期しない形なら破棄して初期状態に戻す。
      discardSave();
      Object.assign(state, freshState());
      return false;
    }
  }

  function applyLoaded(data) {
    const base = freshState();
    state.mode = data.mode === 'pro' ? 'pro' : 'guided';
    state.reduced = data.reduced === true;
    state.clockMin = Number.isFinite(data.clockMin) ? Math.max(0, Math.floor(data.clockMin)) : base.clockMin;
    state.phaseId = typeof data.phaseId === 'string' ? data.phaseId : base.phaseId;
    state.phaseIndex = Number.isFinite(data.phaseIndex) ? Math.max(0, Math.floor(data.phaseIndex)) : base.phaseIndex;
    state.alerts = isPlainObject(data.alerts) ? Object.assign({}, data.alerts) : {};
    state.objectives = isPlainObject(data.objectives) ? cloneObjectives(data.objectives) : {};
    state.knowledgeUnlocked = uniqueStrings(data.knowledgeUnlocked);
    state.knowledgeUsed = uniqueStrings(data.knowledgeUsed);
    state.evidence = uniqueStrings(data.evidence);
    state.decisions = asArray(data.decisions).filter(isPlainObject);
    state.eggs = uniqueStrings(data.eggs);
    state.score = {
      containment: numOr(data.score && data.score.containment, 0),
      ethics: numOr(data.score && data.score.ethics, 0),
      speed: numOr(data.score && data.score.speed, 0),
    };
    state.flags = isPlainObject(data.flags) ? Object.assign({}, data.flags) : {};
  }

  function cloneObjectives(obj) {
    const out = {};
    Object.keys(obj).forEach((pid) => {
      if (isPlainObject(obj[pid])) out[pid] = Object.assign({}, obj[pid]);
    });
    return out;
  }
  function uniqueStrings(v) {
    const out = [];
    const seen = Object.create(null);
    asArray(v).forEach((x) => {
      if (typeof x === 'string' && !seen[x]) {
        seen[x] = true;
        out.push(x);
      }
    });
    return out;
  }
  function numOr(v, d) {
    return Number.isFinite(v) ? v : d;
  }

  function discardSave() {
    if (!hasStorage()) return;
    try {
      window.localStorage.removeItem(SAVE_KEY);
    } catch (_) {
      /* noop */
    }
  }

  // ---- reduced を html[data-reduced] に同期(契約 申し送り#6 の推奨運用) ----
  function syncReducedAttr(b) {
    try {
      const el = document.documentElement;
      if (!el) return;
      if (b) el.setAttribute('data-reduced', '1');
      else el.removeAttribute('data-reduced');
    } catch (_) {
      /* DOM未準備でも状態は保持 */
    }
  }

  // ---- アクション(唯一の状態変更経路。すべて冪等・saveは自動) -----------
  const actions = {
    setMode(m) {
      const next = m === 'pro' ? 'pro' : 'guided';
      if (state.mode === next) return;
      state.mode = next;
      scheduleSave();
    },

    setReduced(b) {
      const next = !!b;
      const changed = state.reduced !== next;
      state.reduced = next;
      syncReducedAttr(next); // 属性は毎回そろえる(外部で剥がれても復旧)
      if (changed) scheduleSave();
    },

    setClock(min) {
      let m = Math.floor(Number(min));
      if (!Number.isFinite(m) || m < 0) m = 0;
      state.clockMin = m;
      const label = formatClock(m);
      bus.emit('clock:set', { min: m, label: label });
      scheduleSave();
    },

    enterPhase(phaseId) {
      if (typeof phaseId !== 'string' || !phaseId) return;
      const index = phaseIndexOf(phaseId);
      state.phaseId = phaseId;
      if (index >= 0) state.phaseIndex = index;
      if (!state.objectives[phaseId]) state.objectives[phaseId] = {};
      bus.emit('phase:enter', { phaseId: phaseId, index: state.phaseIndex });
      scheduleSave();
    },

    pushAlert(id) {
      if (!id) return;
      if (state.alerts[id] === undefined) {
        state.alerts[id] = 'new';
        bus.emit('alert:push', { alertId: id });
        scheduleSave();
      }
    },

    openAlert(id) {
      if (!id) return;
      if (state.alerts[id] === undefined) state.alerts[id] = 'new';
      if (state.alerts[id] !== 'open' && state.alerts[id] !== 'resolved') {
        state.alerts[id] = 'open';
        bus.emit('alert:open', { alertId: id });
        scheduleSave();
      }
    },

    resolveAlert(id) {
      if (!id) return;
      if (state.alerts[id] !== 'resolved') {
        state.alerts[id] = 'resolved';
        bus.emit('alert:resolved', { alertId: id });
        scheduleSave();
      }
    },

    completeObjective(phaseId, objId) {
      if (!phaseId || !objId) return;
      const bucket = state.objectives[phaseId] || (state.objectives[phaseId] = {});
      if (bucket[objId] === true) return; // 冪等
      bucket[objId] = true;
      bus.emit('objective:done', { phaseId: phaseId, objectiveId: objId });
      scheduleSave();
    },

    unlockKnowledge(id, opts) {
      if (!id) return;
      const silent = !!(opts && opts.silent);
      if (state.knowledgeUnlocked.indexOf(id) !== -1) return; // 冪等
      state.knowledgeUnlocked.push(id);
      bus.emit('knowledge:unlock', { id: id, silent: silent });
      scheduleSave();
    },

    useKnowledge(id) {
      if (!id) return;
      // 使用は解禁も兼ねる(未解禁の知識をコマンドで引いたら解禁扱い)。
      if (state.knowledgeUnlocked.indexOf(id) === -1) {
        state.knowledgeUnlocked.push(id);
        bus.emit('knowledge:unlock', { id: id, silent: true });
      }
      if (state.knowledgeUsed.indexOf(id) !== -1) return; // 冪等(既使用は無視)
      state.knowledgeUsed.push(id);
      bus.emit('knowledge:used', { id: id });
      scheduleSave();
    },

    addEvidence(id) {
      if (!id) return;
      if (state.evidence.indexOf(id) !== -1) return; // 冪等
      state.evidence.push(id);
      bus.emit('evidence:add', { id: id });
      scheduleSave();
    },

    decide(id, choice) {
      if (!id) return;
      // 同一idの再判断は上書きせず記録は残す設計だが、二重発火を避けるため既存があれば無視(冪等)。
      const exists = state.decisions.some((d) => d && d.id === id);
      if (exists) return;
      state.decisions.push({ id: id, choice: choice, clockMin: state.clockMin });
      bus.emit('decision:made', { id: id, choice: choice });
      scheduleSave();
    },

    setFlag(k, v) {
      if (typeof k !== 'string' || !k) return;
      if (state.flags[k] === v) return; // 冪等(同値は無視)
      state.flags[k] = v;
      scheduleSave();
    },

    addEgg(id) {
      if (!id) return;
      if (state.eggs.indexOf(id) !== -1) return; // 冪等
      state.eggs.push(id);
      bus.emit('egg:found', { id: id });
      scheduleSave();
    },

    addScore(key, n) {
      if (!state.score || !(key in state.score)) return;
      const amt = Number(n);
      if (!Number.isFinite(amt)) return;
      state.score[key] += amt;
      scheduleSave();
    },

    save() {
      return save();
    },
    load() {
      return load();
    },
    reset() {
      Object.assign(state, freshState());
      syncReducedAttr(false);
      discardSave();
      scheduleSave();
    },
  };

  // phase順の index を story から引く(なければ -1)。story未ロードでも安全。
  function phaseIndexOf(phaseId) {
    try {
      const phases = window.NSD && NSD.STORY && Array.isArray(NSD.STORY.phases) ? NSD.STORY.phases : null;
      if (!phases) return -1;
      for (let i = 0; i < phases.length; i++) {
        if (phases[i] && phases[i].id === phaseId) return i;
      }
    } catch (_) {
      /* noop */
    }
    return -1;
  }

  // ---- 公開 ----------------------------------------------------------------
  NS.bus = bus;
  NS.state = state;
  NS.actions = actions;
})();
