// main.js — 起動シーケンス / モード・章選択の読み取り / ヘルプ / 全体結線(統合)。DOMContentLoaded起点。
(() => {
  'use strict';

  const bus = NS.bus;
  const actions = NS.actions;
  const state = NS.state;

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const clear = (node) => { if (node) while (node.firstChild) node.removeChild(node.firstChild); };

  const D = () => window.NSD || {};
  const STORY = () => D().STORY || {};

  // 有効なフェーズidの検証(story.phases を正、無ければ台帳の固定順)
  const PHASE_IDS = ['quiet', 'ripple', 'storm', 'silent', 'line', 'dawn'];
  function validPhase(id) {
    const phases = STORY().phases;
    if (Array.isArray(phases) && phases.length) {
      return phases.some((p) => p && p.id === id) ? id : phases[0].id;
    }
    return PHASE_IDS.includes(id) ? id : PHASE_IDS[0];
  }

  // ============================================================
  // ブート画面 → アプリ本体への遷移
  // ============================================================
  function startShift() {
    const form = $('#boot-form');
    // モード読み取り
    let mode = 'guided';
    if (form) {
      const checked = form.querySelector('input[name="mode"]:checked');
      if (checked) mode = checked.value === 'pro' ? 'pro' : 'guided';
    }
    // 章(開始フェーズ)読み取り
    let phaseId = 'quiet';
    const sel = $('#jump-select');
    if (sel && sel.value) phaseId = sel.value;
    phaseId = validPhase(phaseId);

    // reduced は a11y が #chk-reduce を監視して既に state/html に反映済み。
    if (typeof actions.setMode === 'function') actions.setMode(mode);

    // 画面遷移
    const boot = $('#boot');
    const app = $('#app');
    if (boot) { boot.hidden = true; boot.setAttribute('data-done', '1'); }
    if (app) app.hidden = false;

    // ブートのフォーカストラップ解除(a11y が張っていれば)
    if (NS.a11y && typeof NS.a11y.release === 'function') NS.a11y.release(boot);

    // 静的パネル(ネット図/NAT表)をこのタイミングで描画(データ確定後)
    if (NS.ui && typeof NS.ui.renderStatic === 'function') NS.ui.renderStatic();

    // まず boot 完了を通知、次に shift 開始
    bus.emit('boot:done', {});
    bus.emit('shift:start', { mode: mode, phaseId: phaseId });

    // ターミナル入力へフォーカス(実務モードで即打鍵できるように)
    const inp = $('#term-input');
    if (inp) window.setTimeout(() => { try { inp.focus(); } catch (e) { /* noop */ } }, 60);
  }

  function bindBoot() {
    const form = $('#boot-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        startShift();
      });
    } else {
      // フォームが無い場合の保険:開始ボタン直結
      const btn = $('#btn-start');
      if (btn) btn.addEventListener('click', (e) => { e.preventDefault(); startShift(); });
    }
    // boot 画面にフォーカストラップ(モーダル)。開始で解除される。
    const boot = $('#boot');
    if (boot && !boot.hidden && NS.a11y && typeof NS.a11y.trap === 'function') {
      // 起動直後は最初の操作要素へ
      NS.a11y.trap(boot);
    }
  }

  // ============================================================
  // ヘルプダイアログ本文の構築
  // ============================================================
  const COMMAND_HELP = [
    { cmd: 'help', desc: '使えるコマンドの一覧を表示' },
    { cmd: 'whois <ip>', desc: 'IPアドレスの登録組織・RIRを照会' },
    { cmd: 'ping <host|ip>', desc: '到達性とRTT(応答時間)を確認' },
    { cmd: 'traceroute <host|ip>', desc: '宛先までの経路(ホップ)を可視化' },
    { cmd: 'curl <url>', desc: 'URLの応答内容を取得' },
    { cmd: 'show <nat-table|devices|mail|logs …>', desc: '各種情報を一覧表示' },
    { cmd: 'inspect <deviceId>', desc: '機器の詳細を調べる' },
    { cmd: 'hash <filePath>', desc: 'ファイルのハッシュを基準値と照合' },
    { cmd: 'block <ip>', desc: '指定IPからの通信を遮断' },
    { cmd: 'isolate <deviceId>', desc: '感染疑いの機器をネットワークから隔離' },
    { cmd: 'clear', desc: 'ターミナル出力を消去' },
  ];

  const KEY_HELP = [
    { key: '↑ / ↓', desc: 'コマンド履歴の呼び出し' },
    { key: 'Tab', desc: 'コマンド名・IP・IDの補完' },
    { key: '1 – 4', desc: 'ワークスペースのタブを切り替え' },
    { key: '?', desc: 'このヘルプを開く(入力欄以外で。ヘルプボタンからも開けます)' },
    { key: 'Esc', desc: 'ヘルプ・ダイアログを閉じる' },
    { key: 'Enter', desc: 'アラート/カードを開く・コマンド実行' },
  ];

  function buildHelp() {
    const body = $('#help-body');
    if (!body || body.getAttribute('data-built')) return;

    const intro = el('p', 'ns-help__intro',
      'あなたは新米SOCアナリスト。ターミナルで調査コマンドを打ち、アラートを一件ずつ処理して夜を越えます。' +
      '見学モードではサジェストされた次の一手をクリックするだけでも進められます。');
    body.appendChild(intro);

    // コマンド表
    const cmdH = el('h3', 'ns-help__h', 'コマンド');
    body.appendChild(cmdH);
    const cmdList = el('dl', 'ns-help__dl');
    COMMAND_HELP.forEach((c) => {
      const dt = el('dt', 'ns-help__cmd', c.cmd);
      const dd = el('dd', 'ns-help__desc', c.desc);
      cmdList.appendChild(dt);
      cmdList.appendChild(dd);
    });
    body.appendChild(cmdList);

    // キーボード表
    const keyH = el('h3', 'ns-help__h', 'キーボード操作');
    body.appendChild(keyH);
    const keyList = el('dl', 'ns-help__dl');
    KEY_HELP.forEach((k) => {
      const dt = el('dt', 'ns-help__key');
      dt.appendChild(el('kbd', null, k.key.trim()));
      const dd = el('dd', 'ns-help__desc', k.desc);
      keyList.appendChild(dt);
      keyList.appendChild(dd);
    });
    body.appendChild(keyList);

    const note = el('p', 'ns-help__note',
      '本サイトの企業・IP・ドメインはすべて架空です。実在の事件は公知の事実として参考カードで引用しています。');
    body.appendChild(note);

    body.setAttribute('data-built', '1');
  }

  // ============================================================
  // 実践演習(CHALLENGE)モードの起動結線
  //   起動画面の #btn-challenge → NS.challenge.open()
  //   戻り(#btn-challenge-back → close())は challenge.js 側が結線する。
  // ============================================================
  function bindChallenge() {
    const btn = $('#btn-challenge');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (NS.challenge && typeof NS.challenge.open === 'function') {
        NS.challenge.open();
      }
    });
  }

  function bindHelp() {
    const btn = $('#btn-help');
    const dlg = $('#help-dialog');
    if (btn) {
      btn.addEventListener('click', () => {
        buildHelp();
        if (NS.ui && typeof NS.ui.openDialog === 'function') NS.ui.openDialog(dlg);
        else if (dlg) { dlg.hidden = false; if (NS.a11y) NS.a11y.trap(dlg); }
      });
    }
    // a11y の ? キーからも開けるよう、本文を先に用意
    buildHelp();
  }

  // ============================================================
  // 再スタート(エンディング → boot)
  // ============================================================
  function bindRestart() {
    const btn = $('#btn-restart');
    if (!btn) return;
    btn.addEventListener('click', () => {
      // state をリセット
      if (typeof actions.reset === 'function') actions.reset();
      // ゲーム・法メモ・チャットの結線状態もリセット(reloadしない復帰でも再プレイ可能に)
      unmountGame();
      Object.keys(shownLaws).forEach((k) => { delete shownLaws[k]; });
      Object.keys(firedChats).forEach((k) => { delete firedChats[k]; });
      curPhaseId = 'quiet';
      // UI をクリア
      if (NS.ui && typeof NS.ui.reset === 'function') NS.ui.reset();
      // 画面を boot に戻す
      const ending = $('#ending');
      const app = $('#app');
      const boot = $('#boot');
      if (ending) ending.hidden = true;
      if (app) app.hidden = true;
      if (boot) { boot.hidden = false; boot.removeAttribute('data-done'); }
      // ターミナル出力もクリア(terminal が clear を持てば)
      if (NS.term && typeof NS.term.reset === 'function') NS.term.reset();
      else { const out = $('#term-output'); if (out) clear(out); }
      // boot に再度トラップ
      if (boot && NS.a11y && typeof NS.a11y.trap === 'function') NS.a11y.trap(boot);
      window.scrollTo(0, 0);
    });
  }

  // ============================================================
  // shift:end → エンディング表示(report.js が中身を構築)
  // ============================================================
  bus.on('shift:end', () => {
    const ending = $('#ending');
    const app = $('#app');
    // report.js が #ending 内を構築する。ここでは表示切替のみ担保。
    if (ending) ending.hidden = false;
    // app は残してもよいが、没入のため隠す(report が app 情報を参照済みの想定)
    if (app) app.hidden = true;
    // エンディングの先頭へフォーカス
    const h = $('#ending-h');
    if (h) { h.setAttribute('tabindex', '-1'); window.setTimeout(() => { try { h.focus(); } catch (e) { /* noop */ } }, 0); }
    window.scrollTo(0, 0);
  });

  // clock 表示(topbar #clock)。state が clock:set を出すので main が拾って表示。
  bus.on('clock:set', (p) => {
    if (!p) return;
    const clock = $('#clock');
    if (clock && p.label) {
      clock.textContent = p.label;
      clock.setAttribute('datetime', p.label);
    }
  });

  // フェーズ名の表示(#phase-name)
  bus.on('phase:enter', (p) => {
    if (!p) return;
    const phases = STORY().phases || [];
    const ph = phases.find((x) => x && x.id === p.phaseId);
    const nameEl = $('#phase-name');
    if (nameEl && ph && ph.title) nameEl.textContent = ph.title;
  });

  // ============================================================
  // ゲーム結線: game:open → #game-root へ mount(api付与)
  //   contract §10: api={world, story, state, actions, term, onDone}
  //   shift は game の done イベント(ddos:resolved/hash:solved/chain:done)で
  //   次フェーズへ進む。ここでは mount と、完了時の証跡確定・後片付けを担う。
  // ============================================================
  let mountedGame = null; // { name, mod }

  // フェーズ→そのフェーズの主証跡(ゲーム完了時に確実に確定させる保険)。
  // 通しプレイでは調査コマンドで先に確定するが、章ジャンプや取りこぼしに備える。
  const GAME_EVIDENCE = { ddos: 'ev-ddos', hash: 'ev-deface', killchain: 'ev-exfil' };

  function gameApi() {
    const D0 = D();
    return {
      world: D0.WORLD || {},
      story: D0.STORY || {},
      state: NS.state,
      actions: NS.actions,
      term: NS.term,
      onDone(result) {
        // ゲーム由来の証跡を確定(冪等)。resultにgame名があれば優先。
        const g = (result && result.game) || (mountedGame && mountedGame.name);
        const evId = g && GAME_EVIDENCE[g];
        if (evId && actions && typeof actions.addEvidence === 'function') actions.addEvidence(evId);
      },
    };
  }

  function unmountGame() {
    if (mountedGame && mountedGame.mod && typeof mountedGame.mod.unmount === 'function') {
      try { mountedGame.mod.unmount(); } catch (e) { /* noop */ }
    }
    mountedGame = null;
  }

  function mountGame(name) {
    const games = NS.games || {};
    const mod = games[name];
    const rootEl = $('#game-root');
    if (!mod || typeof mod.mount !== 'function' || !rootEl) return;
    // 直前のゲームがあれば片付ける
    unmountGame();
    // idle プレースホルダは mount 側で innerHTML='' により消える
    try {
      mod.mount(rootEl, gameApi());
      mountedGame = { name: name, mod: mod };
      // mount 完了後、ゲーム内の見出しへフォーカスを移す(キーボードのみでも操作対象を見失わない)。
      // タブ切替(panels の game:open ハンドラ)と mount がどちらも同期完了した後に実行する。
      focusMountedGame(rootEl);
    } catch (e) {
      // mount 失敗時も詰まらせない: 証跡だけ確定して done イベントを促す
      const evId = GAME_EVIDENCE[name];
      if (evId && actions) actions.addEvidence(evId);
    }
  }

  // ゲーム mount 直後、ゲーム見出し(なければ最初の操作要素)へフォーカスを移動。
  function focusMountedGame(rootEl) {
    if (!rootEl) return;
    const heading =
      rootEl.querySelector('.ns-game__title, .ns-kc__title') ||
      rootEl.querySelector('h3, h4');
    let target = heading;
    if (heading) {
      if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    } else {
      // 見出しが無ければ最初の操作可能要素へ
      target = rootEl.querySelector(
        'button:not([disabled]), [role="button"]:not([aria-disabled="true"]), a[href], input, select, textarea'
      );
    }
    if (!target) return;
    try {
      target.focus();
    } catch (e) {
      /* focus 不可環境は無視 */
    }
  }

  bus.on('game:open', (p) => {
    const name = p && p.game;
    if (!name) return;
    mountGame(name);
  });

  // 各ゲーム完了イベントで主証跡を確実に確定(onDoneを呼ばない実装への保険)。
  bus.on('ddos:resolved', () => { if (actions) actions.addEvidence('ev-ddos'); });
  bus.on('hash:solved', () => { if (actions) actions.addEvidence('ev-deface'); });
  bus.on('chain:done', () => { if (actions) actions.addEvidence('ev-exfil'); });

  // フェーズが変わったら(ゲーム無しフェーズへ進んだら)前フェーズのゲームを片付ける。
  bus.on('phase:enter', (p) => {
    const phases = STORY().phases || [];
    const ph = phases.find((x) => x && x.id === (p && p.phaseId));
    if (!ph || !ph.game) unmountGame();
  });

  // ============================================================
  // チャット結線: story.chats(先輩の合いの手)を進行イベントに応じて発火。
  //   story.chats = [{phase, on, match, from, text, cls}] は誰も配線していない
  //   ため、統合側で購読して chat:push を出す(course_mapの知識を会話で教える中核)。
  //   各エントリは1プレイにつき最大1回。match は string→payload.id/phaseId、
  //   object→部分一致、null→無条件。
  // ============================================================
  const firedChats = Object.create(null);
  let curPhaseId = 'quiet';
  bus.on('phase:enter', (p) => { if (p && p.phaseId) curPhaseId = p.phaseId; });

  function chatMatches(payload, match) {
    if (match == null) return true;
    if (typeof match !== 'object') {
      if (payload && typeof payload === 'object') {
        if (payload.id !== undefined) return payload.id === match;
        if (payload.phaseId !== undefined) return payload.phaseId === match;
        if (payload.alertId !== undefined) return payload.alertId === match;
        return false;
      }
      return payload === match;
    }
    if (payload == null || typeof payload !== 'object') return false;
    return Object.keys(match).every((k) => {
      const exp = match[k];
      const act = payload[k];
      if (exp == null) return true;
      if (Array.isArray(act)) return act.indexOf(exp) !== -1;
      return act === exp;
    });
  }

  function setupChatDispatch() {
    const chats = STORY().chats;
    if (!Array.isArray(chats)) return;
    // 使用イベント名を集約して一度ずつ購読
    const events = {};
    chats.forEach((c, i) => {
      if (!c || !c.on) return;
      (events[c.on] || (events[c.on] = [])).push(i);
    });
    Object.keys(events).forEach((evName) => {
      bus.on(evName, (payload) => {
        events[evName].forEach((i) => {
          if (firedChats[i]) return;
          const c = chats[i];
          // フェーズ限定(指定があれば現フェーズと一致必須)
          if (c.phase && c.phase !== curPhaseId) return;
          if (!chatMatches(payload, c.match)) return;
          firedChats[i] = true;
          bus.emit('chat:push', { from: c.from, text: c.text, cls: c.cls });
        });
      });
    });
  }

  // ============================================================
  // 法・倫理メモ結線: フェーズ入場時、trigger.phase が一致する law を popup。
  //   contract §4: law:popup は shift 発火だが、shift 実装が未発火のため
  //   統合側(全結線担当)がフェーズ入場を購読して一度だけ提示する。
  //   panels.js が law:popup を受けて #law-dialog を構築・表示する。
  // ============================================================
  const shownLaws = Object.create(null);
  bus.on('phase:enter', (p) => {
    const phaseId = p && p.phaseId;
    if (!phaseId) return;
    const laws = STORY().laws || [];
    laws.forEach((law) => {
      if (!law || !law.id) return;
      const trig = law.trigger || {};
      if (trig.phase && trig.phase === phaseId && !shownLaws[law.id]) {
        shownLaws[law.id] = true;
        // 導入チャットの直後に落ち着いて出す(少し遅延)。
        const delay = (NS.state && NS.state.reduced) ? 0 : 2600;
        window.setTimeout(() => { bus.emit('law:popup', { id: law.id }); }, delay);
      }
    });
  });

  // ============================================================
  // 起動
  // ============================================================
  function init() {
    bindBoot();
    bindChallenge();
    bindHelp();
    bindRestart();
    setupChatDispatch();

    // セーブがあれば load を試みる(state 側が実装)。ここでは自動再開はしない
    // — boot からの明示開始を基本フローとする。
    // ただし復帰時のUI同期のため、state に既存進捗があれば ui.syncFromState を促す。
    if (state && Array.isArray(state.knowledgeUnlocked) && state.knowledgeUnlocked.length &&
        NS.ui && typeof NS.ui.syncFromState === 'function') {
      NS.ui.syncFromState();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
