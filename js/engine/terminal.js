// engine/terminal.js — NS.term(パーサ・履歴・Tab補完・print演出・サジェスト)+ 全コマンドhandler。
// コマンドは NSD.WORLD のデータを引くだけ(ハードコード禁止)。連携は NS.bus / NS.actions 経由。
(() => {
  'use strict';

  const NS = (window.NS = window.NS || {});
  const bus = NS.bus;
  const actions = NS.actions;

  // ---- DOM(自ペイン内のみ操作) -------------------------------------------
  let elOutput = null;
  let elInput = null;
  let elSuggest = null;
  let elForm = null;

  function grabDom() {
    elOutput = document.getElementById('term-output');
    elInput = document.getElementById('term-input');
    elSuggest = document.getElementById('term-suggest');
    elForm = document.getElementById('term-form');
  }

  // ---- ユーティリティ ------------------------------------------------------
  function reduced() {
    return !!(NS.state && NS.state.reduced);
  }
  function world() {
    return (window.NSD && NSD.WORLD) || {};
  }
  function story() {
    return (window.NSD && NSD.STORY) || {};
  }
  function ctx() {
    return { world: world(), state: NS.state, actions: actions };
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => {
      switch (c) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        default: return '&#39;';
      }
    });
  }

  // ---- パーサ(クオート不要の空白分割) ------------------------------------
  function parse(raw) {
    const trimmed = String(raw == null ? '' : raw).trim();
    if (!trimmed) return { cmd: '', argv: [] };
    const parts = trimmed.split(/\s+/);
    return { cmd: parts[0].toLowerCase(), argv: parts.slice(1) };
  }

  // ---- print(タイプライタ演出は requestAnimationFrame、reduced時即時) -----
  // lines: string | {text, cls} | 配列。cls: ok|warn|err|dim|head。
  // 戻り値は演出完了で解決する Promise。
  function normalizeLines(lines) {
    const arr = Array.isArray(lines) ? lines : [lines];
    return arr
      .filter((l) => l !== undefined && l !== null)
      .map((l) => {
        if (typeof l === 'string') return { text: l, cls: '' };
        return { text: String(l.text == null ? '' : l.text), cls: l.cls || '' };
      });
  }

  function makeLineEl(cls) {
    const div = document.createElement('div');
    div.className = 'ns-term__line' + (cls ? ' ns-term__line--' + cls : '');
    return div;
  }

  function scrollToEnd() {
    if (elOutput) elOutput.scrollTop = elOutput.scrollHeight;
  }

  function print(lines, opts) {
    const items = normalizeLines(lines);
    const typing = !!(opts && opts.typing) && !reduced();

    return new Promise((resolve) => {
      if (!elOutput) {
        resolve();
        return;
      }
      if (!typing) {
        // 即時:全行を一気に描画。
        for (let i = 0; i < items.length; i++) {
          const el = makeLineEl(items[i].cls);
          el.textContent = items[i].text;
          elOutput.appendChild(el);
        }
        scrollToEnd();
        resolve();
        return;
      }
      // タイプ演出中は polite ライブリージョンを一時停止(aria-busy)。
      // 部分文字列を1フレームごとに書き換えるとSRが伸長文字列を延々読み上げるため、
      // 演出ノードは aria-hidden で流し、行が完成した時だけ露出させて一度だけ読ませる。
      elOutput.setAttribute('aria-busy', 'true');
      typeLines(items, 0, function () {
        elOutput.setAttribute('aria-busy', 'false');
        resolve();
      });
    });
  }

  // 1行ずつ、文字を requestAnimationFrame で送る(過負荷を避けフレーム毎に数文字)。
  function typeLines(items, idx, done) {
    if (idx >= items.length) {
      scrollToEnd();
      done();
      return;
    }
    const item = items[idx];
    const el = makeLineEl(item.cls);
    // 演出中の伸長テキストはライブリージョンへ露出しない(完成時に解除)。
    el.setAttribute('aria-hidden', 'true');
    elOutput.appendChild(el);
    const full = item.text;
    let pos = 0;
    const perFrame = Math.max(1, Math.ceil(full.length / 90)); // 長い行でも約1.5秒以内

    function finishLine() {
      el.textContent = full;
      // 完成した確定テキストだけをSRに一度露出(部分文字列は読ませない)。
      el.removeAttribute('aria-hidden');
      scrollToEnd();
      typeLines(items, idx + 1, done);
    }

    function step() {
      if (pos >= full.length) {
        finishLine();
        return;
      }
      pos = Math.min(full.length, pos + perFrame);
      el.textContent = full.slice(0, pos);
      scrollToEnd();
      requestAnimationFrame(step);
    }
    if (full.length === 0) {
      // 空行も確定露出扱い(aria-hidden を残さない)。
      el.removeAttribute('aria-hidden');
      typeLines(items, idx + 1, done);
    } else {
      requestAnimationFrame(step);
    }
  }

  // プロンプト行(入力エコー)の描画。
  function echoInput(raw) {
    if (!elOutput) return;
    const el = makeLineEl('cmd');
    const prompt = document.createElement('span');
    prompt.className = 'ns-term__echo-prompt';
    prompt.textContent = 'analyst@soc:~$ ';
    const body = document.createElement('span');
    body.textContent = raw;
    el.appendChild(prompt);
    el.appendChild(body);
    elOutput.appendChild(el);
    scrollToEnd();
  }

  // ---- コマンド登録 --------------------------------------------------------
  const registry = Object.create(null); // name -> spec

  function register(name, spec) {
    if (typeof name !== 'string' || !name || !spec || typeof spec.run !== 'function') return;
    registry[name] = {
      usage: spec.usage || name,
      hint: spec.hint || '',
      run: spec.run,
    };
  }

  // ---- 履歴(↑↓) ---------------------------------------------------------
  const history = [];
  let histIndex = -1; // -1 = 未参照(現在の下書き)
  let draft = '';

  function pushHistory(raw) {
    if (!raw) return;
    if (history.length === 0 || history[history.length - 1] !== raw) history.push(raw);
    if (history.length > 200) history.shift();
    histIndex = -1;
    draft = '';
  }

  function historyPrev() {
    if (history.length === 0) return;
    if (histIndex === -1) {
      draft = elInput ? elInput.value : '';
      histIndex = history.length - 1;
    } else if (histIndex > 0) {
      histIndex--;
    }
    setInput(history[histIndex]);
  }

  function historyNext() {
    if (histIndex === -1) return;
    if (histIndex < history.length - 1) {
      histIndex++;
      setInput(history[histIndex]);
    } else {
      histIndex = -1;
      setInput(draft);
    }
  }

  function setInput(v) {
    if (!elInput) return;
    elInput.value = v == null ? '' : v;
    const n = elInput.value.length;
    try {
      elInput.setSelectionRange(n, n);
    } catch (_) {
      /* noop */
    }
  }

  // ---- Tab補完(コマンド名 + world由来の候補) ------------------------------
  function commandNames() {
    return Object.keys(registry).sort();
  }

  // world から補完候補になる文字列(id/ip/host/url/path等)を集める。
  function worldCandidates() {
    const w = world();
    const out = [];
    const seen = Object.create(null);
    const add = (s) => {
      if (typeof s === 'string' && s && !seen[s]) {
        seen[s] = true;
        out.push(s);
      }
    };
    try {
      if (Array.isArray(w.devices)) {
        w.devices.forEach((d) => {
          if (!d) return;
          add(d.id);
          add(d.ip);
        });
      }
      if (w.hosts && typeof w.hosts === 'object') {
        Object.keys(w.hosts).forEach((h) => {
          add(h);
          if (w.hosts[h] && w.hosts[h].ip) add(w.hosts[h].ip);
        });
      }
      if (w.whois && typeof w.whois === 'object') Object.keys(w.whois).forEach(add);
      if (w.routes && typeof w.routes === 'object') Object.keys(w.routes).forEach(add);
      if (w.pings && typeof w.pings === 'object') Object.keys(w.pings).forEach(add);
      if (w.curls && typeof w.curls === 'object') Object.keys(w.curls).forEach(add);
      if (Array.isArray(w.files)) w.files.forEach((f) => f && add(f.path));
    } catch (_) {
      /* 補完はベストエフォート */
    }
    return out;
  }

  // show のサブコマンド候補。
  const SHOW_SUBS = ['nat-table', 'devices', 'mail', 'logs'];

  function completions(rawBefore) {
    // カーソル位置は末尾前提(input全体)。最後のトークンを補完する。
    const value = rawBefore == null ? '' : rawBefore;
    const endsWithSpace = /\s$/.test(value);
    const tokens = value.trim().length ? value.trim().split(/\s+/) : [];
    // 補完対象トークンの決定。
    if (tokens.length === 0) return { list: commandNames(), token: '' };

    if (tokens.length === 1 && !endsWithSpace) {
      const t = tokens[0].toLowerCase();
      return { list: commandNames().filter((n) => n.indexOf(t) === 0), token: tokens[0] };
    }

    const cmd = tokens[0].toLowerCase();
    const current = endsWithSpace ? '' : tokens[tokens.length - 1];

    // show のサブコマンド
    if (cmd === 'show') {
      const argIndex = endsWithSpace ? tokens.length - 1 : tokens.length - 2; // 0=show
      if (argIndex === 0) {
        return { list: SHOW_SUBS.filter((s) => s.indexOf(current) === 0), token: current };
      }
      if (argIndex === 1 && (tokens[1] === 'logs' || (endsWithSpace && tokens[1] === 'logs'))) {
        // show logs <deviceId>
        const ids = deviceIds();
        return { list: ids.filter((s) => s.indexOf(current) === 0), token: current };
      }
      return { list: [], token: current };
    }

    // それ以外は world 候補
    const cands = worldCandidates();
    return { list: cands.filter((s) => s.indexOf(current) === 0), token: current };
  }

  function deviceIds() {
    const w = world();
    if (!Array.isArray(w.devices)) return [];
    return w.devices.map((d) => (d && d.id) || '').filter(Boolean);
  }

  function commonPrefix(arr) {
    if (arr.length === 0) return '';
    let p = arr[0];
    for (let i = 1; i < arr.length; i++) {
      const s = arr[i];
      let j = 0;
      while (j < p.length && j < s.length && p[j] === s[j]) j++;
      p = p.slice(0, j);
      if (!p) break;
    }
    return p;
  }

  function applyCompletion() {
    if (!elInput) return;
    const value = elInput.value;
    const res = completions(value);
    const list = res.list;
    if (list.length === 0) return;

    // 置換範囲:最後のトークンを補完結果に置換。
    const endsWithSpace = /\s$/.test(value);
    const head = endsWithSpace ? value : value.replace(/\S*$/, '');

    if (list.length === 1) {
      setInput(head + list[0] + ' ');
      clearSuggestHint();
      return;
    }
    const prefix = commonPrefix(list);
    if (prefix && prefix.length > res.token.length) {
      setInput(head + prefix);
    }
    // 複数候補はサジェスト行に一覧提示(見学/実務どちらでも補助として)。
    showCompletionHint(list);
  }

  function showCompletionHint(list) {
    if (!elSuggest) return;
    // サジェストチップ(物語進行)と衝突しないよう、補完ヒント専用のヒント表示。
    clearSuggestChips();
    const wrap = document.createElement('div');
    wrap.className = 'ns-suggest__hint';
    wrap.textContent = '候補: ' + list.slice(0, 12).join('  ') + (list.length > 12 ? ' …' : '');
    elSuggest.appendChild(wrap);
    elSuggest.dataset.kind = 'hint';
  }
  function clearSuggestHint() {
    if (!elSuggest) return;
    if (elSuggest.dataset.kind === 'hint') {
      elSuggest.innerHTML = '';
      delete elSuggest.dataset.kind;
      // ヒントを消したらチップを復元。
      renderChips();
    }
  }

  // ---- サジェストチップ(見学モード) --------------------------------------
  let currentChips = [];

  function suggest(chips) {
    currentChips = Array.isArray(chips) ? chips.filter((c) => c && c.cmd) : [];
    renderChips();
  }

  function clearSuggestChips() {
    if (elSuggest) elSuggest.innerHTML = '';
  }

  function renderChips() {
    if (!elSuggest) return;
    if (elSuggest.dataset.kind === 'hint') return; // 補完ヒント表示中は触らない
    elSuggest.innerHTML = '';
    if (currentChips.length === 0) return;
    const frag = document.createDocumentFragment();
    currentChips.forEach((c) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ns-chip'; // CSS 所有の可視スタイル(枠/背景/フォーカスリング)に合わせる
      btn.textContent = c.label || c.cmd;
      btn.setAttribute('data-cmd', c.cmd);
      btn.addEventListener('click', () => {
        typeAndRun(c.cmd);
      });
      frag.appendChild(btn);
    });
    elSuggest.appendChild(frag);
  }

  // チップクリック時:入力欄にタイプ演出風に入れてから実行。
  function typeAndRun(cmd) {
    if (!elInput) {
      runLine(cmd);
      return;
    }
    if (reduced()) {
      setInput(cmd);
      runLine(cmd);
      return;
    }
    setInput('');
    let i = 0;
    const step = () => {
      if (i >= cmd.length) {
        runLine(cmd);
        return;
      }
      i++;
      setInput(cmd.slice(0, i));
      setTimeout(step, 18);
    };
    step();
  }

  // ---- 実行(パース→handler→term:executed→egg判定) ----------------------
  let running = false;

  async function runLine(raw) {
    const line = String(raw == null ? '' : raw);
    if (running) return; // 演出中の二重実行防止
    const { cmd, argv } = parse(line);
    if (!cmd) {
      setInput('');
      return;
    }
    running = true;
    pushHistory(line.trim());
    echoInput(line.trim());
    setInput('');

    let result;
    const spec = registry[cmd];
    try {
      if (!spec) {
        await print(
          [
            { text: '未知のコマンド: ' + cmd, cls: 'err' },
            { text: "使えるコマンドは help で確認できます。", cls: 'dim' },
          ],
          { typing: true }
        );
        result = { ok: false, meta: { unknown: true } };
      } else {
        const out = await spec.run(argv, ctx());
        result = out && typeof out === 'object' ? out : { ok: true };
        if (Array.isArray(result.lines) && result.lines.length) {
          await print(result.lines, { typing: true });
        }
      }
    } catch (err) {
      await print(
        [{ text: 'コマンド処理中にエラーが発生しました。', cls: 'err' }],
        { typing: false }
      );
      result = { ok: false, meta: { error: true } };
    }

    const meta = (result && result.meta) || {};
    const ok = result ? result.ok !== false : true;

    // handler が申告した知識・証跡を反映(terminalが actions を呼ぶ)。
    applyMeta(meta);

    // term:executed 発火。
    // objectives の doneOn.match は {cmd, sub, arg} 形で照合される(shift.matchesPartial)。
    // 契約ペイロードの {cmd, argv, ok, meta} に加え、argv[0] を sub/arg として併記し、
    // show系(sub)・引数指定系(arg)の目標判定を確実に成立させる。
    const first = argv.length ? argv[0] : undefined;
    if (bus) {
      bus.emit('term:executed', {
        cmd: cmd,
        argv: argv,
        sub: first,
        arg: first,
        ok: ok,
        meta: meta,
      });
    }

    // egg 判定(STORY.eggs の on.cmd/on.arg に一致)。
    checkEgg(cmd, argv);

    running = false;
  }

  function applyMeta(meta) {
    if (!meta || !actions) return;
    if (Array.isArray(meta.knowledge)) {
      meta.knowledge.forEach((id) => id && actions.useKnowledge(id));
    }
    if (Array.isArray(meta.evidence)) {
      meta.evidence.forEach((id) => id && actions.addEvidence(id));
    }
  }

  function checkEgg(cmd, argv) {
    const eggs = story().eggs;
    if (!Array.isArray(eggs)) return;
    const argJoined = argv.join(' ');
    for (let i = 0; i < eggs.length; i++) {
      const e = eggs[i];
      if (!e || !e.on) continue;
      if (e.on.cmd && e.on.cmd !== cmd) continue;
      // sub 指定(show awards 等)は第1引数と厳密一致させる。
      // これが無いと {cmd:'show', sub:'awards'} が任意の show で誤発火する。
      if (e.on.sub !== undefined && e.on.sub !== null) {
        if (String(argv[0]) !== String(e.on.sub)) continue;
      }
      if (e.on.arg !== undefined && e.on.arg !== null) {
        // arg 一致は「いずれかの引数」または「引数全体」で判定(柔軟)。
        const argMatch = argv.indexOf(String(e.on.arg)) !== -1 || argJoined === String(e.on.arg);
        if (!argMatch) continue;
      }
      // 一致:記録して表示。
      if (actions) actions.addEgg(e.id); // addEgg 内で egg:found 発火(冪等)
      if (e.text) {
        print([{ text: '⟡ ' + e.text, cls: 'ok' }], { typing: !reduced() });
      }
      break; // 1コマンドで1エッグ
    }
  }

  // =========================================================================
  //  コマンドハンドラ(すべて NSD.WORLD を引くのみ)
  //  handler は {ok, lines, meta} を返す。meta.knowledge / meta.evidence を申告可。
  //  §12 のID台帳に基づき、コマンド→関連knowledge を合理的に対応付ける。
  // =========================================================================

  // IP/ホスト名の解決:ホスト名→ip、既にipならそのまま。
  function resolveTarget(token) {
    const w = world();
    if (!token) return { ip: null, host: null };
    // devices の id / ip
    if (Array.isArray(w.devices)) {
      for (const d of w.devices) {
        if (!d) continue;
        if (d.id === token || d.name === token) return { ip: d.ip, host: d.id };
        if (d.ip === token) return { ip: d.ip, host: d.id };
      }
    }
    // hosts はキーがホスト名 or 短縮名
    if (w.hosts && typeof w.hosts === 'object') {
      if (w.hosts[token]) return { ip: w.hosts[token].ip || token, host: token };
      // 逆引き: ip から host 名
      const hk = Object.keys(w.hosts).find((k) => w.hosts[k] && w.hosts[k].ip === token);
      if (hk) return { ip: token, host: hk };
    }
    // それ以外は素の文字列(ipかもしれない)。
    return { ip: token, host: token };
  }

  function isIpLike(s) {
    return typeof s === 'string' && /^\d{1,3}(\.\d{1,3}){3}$/.test(s);
  }

  // ---- help ---------------------------------------------------------------
  register('help', {
    usage: 'help',
    hint: '使えるコマンドの一覧を表示',
    run() {
      const lines = [{ text: '使用可能なコマンド:', cls: 'head' }];
      commandNames().forEach((name) => {
        const spec = registry[name];
        lines.push({ text: '  ' + padRight(spec.usage, 26) + (spec.hint || ''), cls: 'dim' });
      });
      lines.push({ text: '', cls: '' });
      lines.push({ text: '↑↓で履歴、Tabで補完。clear で画面を消去します。', cls: 'dim' });
      return Promise.resolve({ ok: true, lines: lines, meta: { knowledge: ['soc'] } });
    },
  });

  function padRight(s, n) {
    s = String(s);
    while (s.length < n) s += ' ';
    return s;
  }

  // ---- whois <ip> ---------------------------------------------------------
  register('whois', {
    usage: 'whois <ip>',
    hint: 'IPの登録組織・RIRを照会',
    run(argv) {
      if (argv.length === 0) return usageErr('whois <ip>');
      const target = argv[0];
      const w = world();
      const rec = (w.whois && (w.whois[target] || w.whois[resolveTarget(target).ip])) || null;
      if (!rec || !Array.isArray(rec.lines)) {
        return Promise.resolve({
          ok: false,
          lines: [{ text: 'whois: ' + target + ' の登録情報は見つかりませんでした。', cls: 'warn' }],
          meta: { knowledge: ['whois'] },
        });
      }
      const lines = [{ text: 'whois ' + target, cls: 'head' }];
      rec.lines.forEach((l) => lines.push({ text: l, cls: 'dim' }));
      return Promise.resolve({
        ok: true,
        lines: lines,
        meta: { knowledge: ['whois', 'iana-apnic', 'rir'] },
      });
    },
  });

  // ---- ping <host|ip> -----------------------------------------------------
  register('ping', {
    usage: 'ping <host|ip>',
    hint: '到達性とRTTを確認',
    run(argv) {
      if (argv.length === 0) return usageErr('ping <host|ip>');
      const token = argv[0];
      const w = world();
      const r = resolveTarget(token);
      const rec = (w.pings && (w.pings[token] || (r.ip && w.pings[r.ip]))) || null;
      const ipShown = r.ip || token;
      if (!rec) {
        return Promise.resolve({
          ok: false,
          lines: [
            { text: 'PING ' + token + ' (' + ipShown + ')', cls: 'head' },
            { text: 'Request timeout — 応答がありません(到達不能または応答抑止)。', cls: 'warn' },
          ],
          meta: { knowledge: ['ping', 'icmp-time-exceeded'] },
        });
      }
      const rtt = rec.rtt;
      const loss = rec.loss == null ? 0 : rec.loss;
      const lines = [{ text: 'PING ' + token + ' (' + ipShown + ')', cls: 'head' }];
      for (let i = 1; i <= 3; i++) {
        const jitter = (Math.sin(i * 1.7) * (rtt * 0.03)).toFixed(1);
        const t = (Number(rtt) + Number(jitter)).toFixed(1);
        lines.push({ text: '64 bytes: icmp_seq=' + i + ' time=' + t + ' ms', cls: 'ok' });
      }
      lines.push({
        text: '--- ' + token + ' ping statistics --- ' + loss + '% packet loss, avg ' + rtt + ' ms',
        cls: 'dim',
      });
      return Promise.resolve({
        ok: true,
        lines: lines,
        meta: { knowledge: ['ping', 'icmp-time-exceeded'] },
      });
    },
  });

  // ---- traceroute <host|ip> ----------------------------------------------
  register('traceroute', {
    usage: 'traceroute <host|ip>',
    hint: '経路上のルーターとTTLを可視化',
    run(argv) {
      if (argv.length === 0) return usageErr('traceroute <host|ip>');
      const token = argv[0];
      const w = world();
      const r = resolveTarget(token);
      const route = (w.routes && (w.routes[token] || (r.ip && w.routes[r.ip]))) || null;
      const ipShown = r.ip || token;
      if (!Array.isArray(route)) {
        return Promise.resolve({
          ok: false,
          lines: [{ text: 'traceroute: ' + token + ' への経路情報がありません。', cls: 'warn' }],
          meta: { knowledge: ['traceroute', 'ttl'] },
        });
      }
      const lines = [{ text: 'traceroute to ' + token + ' (' + ipShown + '), 最大30ホップ', cls: 'head' }];
      route.forEach((hop) => {
        if (!hop) return;
        if (hop.host === '*' || hop.ip === '*' || hop.rtt === '*') {
          lines.push({ text: padRight(String(hop.hop || ''), 3) + ' * * *', cls: 'dim' });
        } else {
          const host = hop.host || hop.ip || '?';
          const ip = hop.ip ? ' (' + hop.ip + ')' : '';
          const rtt = hop.rtt != null ? '  ' + hop.rtt + ' ms' : '';
          lines.push({ text: padRight(String(hop.hop || ''), 3) + ' ' + host + ip + rtt, cls: '' });
        }
      });
      return Promise.resolve({
        ok: true,
        lines: lines,
        meta: { knowledge: ['traceroute', 'ttl', 'icmp-time-exceeded'] },
      });
    },
  });

  // ---- curl <url> ---------------------------------------------------------
  register('curl', {
    usage: 'curl <url>',
    hint: 'URLへHTTP取得(応答本文を表示)',
    run(argv) {
      if (argv.length === 0) return usageErr('curl <url>');
      const url = argv[0];
      const w = world();
      // curls のキーは url そのもの or 短縮(ホスト/パス)。
      let rec =
        (w.curls && (w.curls[url] || w.curls[stripScheme(url)] || w.curls[url.replace(/^https?:\/\//, '')])) || null;
      // ホスト名だけ(パス無し)で叩かれた場合は既定ドキュメント index.html にフォールバック。
      // 例: `curl aoba-web` → `aoba-web/index.html`。FQDN(www.aoba-mfg.example 等)も
      //     同一IPに解決される既定ドキュメントへ寄せる。
      if ((!rec || !Array.isArray(rec.lines)) && w.curls) {
        const bare = stripScheme(url).replace(/\/+$/, '');
        if (bare.indexOf('/') === -1) {
          rec =
            w.curls[bare + '/index.html'] ||
            curlByDefaultDoc(w, resolveTarget(url).ip) ||
            rec;
        }
      }
      if (!rec || !Array.isArray(rec.lines)) {
        return Promise.resolve({
          ok: false,
          lines: [{ text: 'curl: (6) ' + url + ' を解決できませんでした。', cls: 'warn' }],
          meta: { knowledge: ['curl-ifconfig'] },
        });
      }
      const lines = [{ text: '$ curl ' + url, cls: 'head' }];
      rec.lines.forEach((l) => lines.push({ text: l, cls: '' }));
      const meta = { knowledge: ['curl-ifconfig', 'reverse-proxy'] };
      // 偽ログインサイト(203.0.113.80 / aoba-mfg.example.co)の取得で
      // AiTMによる情報持ち出しの証跡 ev-exfil を確定(line目標 find-exfil)。
      const targetIp = resolveTarget(url).ip;
      if (rec.phishing === true || targetIp === '203.0.113.80' ||
          /aoba-mfg\.example\.co(\b|\/)/.test(String(url))) {
        lines.push({ text: '', cls: '' });
        lines.push({ text: '⚠ 送信先が自社ドメインと異なる偽ログインサイト。AiTMによる資格情報・OTPの中継窃取の証跡として記録します。', cls: 'err' });
        meta.evidence = ['ev-exfil'];
        meta.knowledge = meta.knowledge.concat(['aitm', 'kill-chain']);
      }
      return Promise.resolve({ ok: true, lines: lines, meta: meta });
    },
  });

  function stripScheme(u) {
    return String(u).replace(/^https?:\/\//, '');
  }

  // ホスト名のみで叩かれた curl を、同一IPに解決される「<host>/index.html」既定
  // ドキュメントへ寄せる(www.aoba-mfg.example → aoba-web/index.html など)。
  function curlByDefaultDoc(w, ip) {
    if (!ip || !w || !w.curls) return null;
    const keys = Object.keys(w.curls);
    for (const k of keys) {
      if (!/\/index\.html$/.test(k)) continue;
      const host = k.slice(0, k.indexOf('/'));
      if (host === ip) return w.curls[k];
      if (w.hosts && w.hosts[host] && w.hosts[host].ip === ip) return w.curls[k];
    }
    return null;
  }

  // ---- show nat-table | devices | mail | logs <deviceId> ------------------
  register('show', {
    usage: 'show <nat-table|devices|mail|logs <id>>',
    hint: 'NAT表・機器・メール・ログを表示',
    run(argv) {
      if (argv.length === 0) return usageErr('show <nat-table|devices|mail|logs <id>>');
      const sub = argv[0];
      const w = world();

      if (sub === 'nat-table' || sub === 'nat') {
        const nat = Array.isArray(w.natTable) ? w.natTable : [];
        if (nat.length === 0) {
          return Promise.resolve({ ok: false, lines: [{ text: 'NATセッションはありません。', cls: 'warn' }] });
        }
        const lines = [{ text: 'NAPTセッション表 (proto  内部  ->  外部  宛先  状態)', cls: 'head' }];
        nat.forEach((row) => {
          if (!row) return;
          const inSide = (row.inIp || '?') + ':' + (row.inPort != null ? row.inPort : '?');
          const outSide = ':' + (row.outPort != null ? row.outPort : '?');
          lines.push({
            text:
              padRight(row.proto || 'tcp', 5) +
              ' ' +
              padRight(inSide, 24) +
              ' -> ' +
              padRight(outSide, 8) +
              ' ' +
              padRight(row.dst || '', 22) +
              ' ' +
              (row.state || ''),
            cls: '',
          });
        });
        lines.push({
          text: 'セッション数 ' + nat.length + '(ポート16bit=約65,536が上限)',
          cls: 'dim',
        });
        return Promise.resolve({
          ok: true,
          lines: lines,
          meta: { knowledge: ['nat', 'napt', 'nat-pool', 'port-saving-nat'] },
        });
      }

      if (sub === 'devices' || sub === 'device') {
        const devs = Array.isArray(w.devices) ? w.devices : [];
        if (devs.length === 0) {
          return Promise.resolve({ ok: false, lines: [{ text: '機器情報がありません。', cls: 'warn' }] });
        }
        const lines = [{ text: '監視対象機器 (id  種別  ゾーン  IP  名称)', cls: 'head' }];
        devs.forEach((d) => {
          if (!d) return;
          lines.push({
            text:
              padRight(d.id || '', 10) +
              ' ' +
              padRight(d.type || '', 6) +
              ' ' +
              padRight(d.zone || '', 8) +
              ' ' +
              padRight(d.ip || '', 16) +
              ' ' +
              (d.name || ''),
            cls: '',
          });
        });
        return Promise.resolve({
          ok: true,
          lines: lines,
          meta: { knowledge: ['network-host', 'rfc1918'] },
        });
      }

      if (sub === 'mail' || sub === 'mails') {
        const mails = Array.isArray(w.mails) ? w.mails : [];
        if (mails.length === 0) {
          return Promise.resolve({ ok: false, lines: [{ text: 'メールはありません。', cls: 'warn' }] });
        }
        const lines = [{ text: '受信メール一覧 (id  差出人  件名)', cls: 'head' }];
        mails.forEach((m) => {
          if (!m) return;
          lines.push({
            text: padRight(m.id || '', 12) + ' ' + padRight(m.from || '', 34) + ' ' + (m.subj || ''),
            cls: m.phishing ? 'warn' : '',
          });
        });
        lines.push({ text: '本文は inspect <mailId> で確認できます。', cls: 'dim' });
        return Promise.resolve({
          ok: true,
          lines: lines,
          meta: { knowledge: ['aitm'] },
        });
      }

      if (sub === 'logs' || sub === 'log') {
        if (argv.length < 2) return usageErr('show logs <deviceId>');
        const id = argv[1];
        const dev = findDevice(id);
        if (!dev) {
          return Promise.resolve({
            ok: false,
            lines: [{ text: 'show logs: 機器 ' + id + ' が見つかりません。', cls: 'warn' }],
          });
        }
        const logs = Array.isArray(dev.logs) ? dev.logs : [];
        if (logs.length === 0) {
          return Promise.resolve({
            ok: true,
            lines: [{ text: id + ': ログはありません。', cls: 'dim' }],
          });
        }
        const lines = [{ text: 'ログ: ' + (dev.name || id) + ' (' + id + ')', cls: 'head' }];
        logs.forEach((entry) => {
          if (!entry) return;
          const tag = entry.tag ? '[' + entry.tag + '] ' : '';
          const cls = entry.tag === 'auth' ? 'warn' : entry.tag === 'alert' ? 'err' : '';
          lines.push({ text: (entry.t ? entry.t + '  ' : '') + tag + (entry.line || ''), cls: cls });
        });
        return Promise.resolve({
          ok: true,
          lines: lines,
          meta: { knowledge: ['mirai', 'mirai-dict', 'botnet', 'strace-tcpdump'] },
        });
      }

      return Promise.resolve({
        ok: false,
        lines: [
          { text: 'show: 未知のサブコマンド "' + sub + '"', cls: 'err' },
          { text: 'show nat-table | devices | mail | logs <id>', cls: 'dim' },
        ],
      });
    },
  });

  function findDevice(id) {
    const w = world();
    if (!Array.isArray(w.devices)) return null;
    return w.devices.find((d) => d && (d.id === id || d.name === id)) || null;
  }

  // ---- inspect <deviceId> -------------------------------------------------
  register('inspect', {
    usage: 'inspect <deviceId>',
    hint: '機器/メールを詳しく調べる',
    run(argv) {
      if (argv.length === 0) return usageErr('inspect <deviceId>');
      const id = argv[0];
      const w = world();

      // メールの inspect(フィッシング調査)
      if (Array.isArray(w.mails)) {
        const mail = w.mails.find((m) => m && m.id === id);
        if (mail) {
          const lines = [
            { text: 'メール詳細: ' + id, cls: 'head' },
            { text: 'From: ' + (mail.from || ''), cls: mail.phishing ? 'warn' : '' },
            { text: 'Subject: ' + (mail.subj || ''), cls: '' },
            { text: '', cls: '' },
          ];
          String(mail.body || '')
            .split('\n')
            .forEach((l) => lines.push({ text: l, cls: '' }));
          if (mail.phishing) {
            lines.push({ text: '', cls: '' });
            lines.push({ text: '⚠ フィッシングの疑い。着目点: ' + (mail.clue || '差出人ドメイン'), cls: 'err' });
          }
          return Promise.resolve({
            ok: true,
            lines: lines,
            meta: { knowledge: mail.phishing ? ['aitm', 'kill-chain'] : ['aitm'] },
          });
        }
      }

      const dev = findDevice(id);
      if (!dev) {
        return Promise.resolve({
          ok: false,
          lines: [{ text: 'inspect: ' + id + ' が見つかりません。show devices で一覧を確認してください。', cls: 'warn' }],
        });
      }
      const lines = [
        { text: '機器詳細: ' + (dev.name || id) + ' (' + id + ')', cls: 'head' },
        { text: '種別: ' + (dev.type || '不明') + '   ゾーン: ' + (dev.zone || '不明'), cls: '' },
        { text: 'IP: ' + (dev.ip || '不明'), cls: '' },
      ];
      if (dev.note) lines.push({ text: '所見: ' + dev.note, cls: 'dim' });
      const logs = Array.isArray(dev.logs) ? dev.logs : [];
      if (logs.length) {
        lines.push({ text: '', cls: '' });
        lines.push({ text: '直近ログ(全文は show logs ' + id + '):', cls: 'dim' });
        logs.slice(0, 3).forEach((entry) => {
          if (!entry) return;
          const tag = entry.tag ? '[' + entry.tag + '] ' : '';
          lines.push({ text: '  ' + (entry.t ? entry.t + ' ' : '') + tag + (entry.line || ''), cls: '' });
        });
      }
      const meta = { knowledge: ['edr', 'network-host', 'mirai'] };
      // 感染IoT(複合機)の精査で初期侵入の証跡 ev-iot を確定(ripple目標 inspect-mfp)。
      const infected = detectMiraiInfection(dev);
      if (infected) {
        lines.push({ text: '', cls: '' });
        lines.push({ text: '⚠ Mirai型デフォルトパスワード辞書での侵入痕跡を検出。証跡として記録します。', cls: 'err' });
        meta.evidence = ['ev-iot'];
        meta.infect = dev.id; // ネット図の感染表示を更新(panels)
        meta.knowledge = meta.knowledge.concat(['mirai-dict', 'botnet']);
      }
      return Promise.resolve({ ok: true, lines: lines, meta: meta });
    },
  });

  // 認証ログに辞書攻撃SUCCESS/wget等の侵入痕跡があれば感染とみなす。
  function detectMiraiInfection(dev) {
    if (!dev || !Array.isArray(dev.logs)) return false;
    return dev.logs.some((e) => {
      if (!e || !e.line) return false;
      const s = String(e.line);
      return /login SUCCESS/.test(s) || /wget .*bins|C2 telnet callback/.test(s);
    });
  }

  // ---- hash <filePath> ----------------------------------------------------
  register('hash', {
    usage: 'hash <filePath>',
    hint: 'ファイルのMD5を算出し基準値と照合',
    run(argv) {
      if (argv.length === 0) return usageErr('hash <filePath>');
      const path = argv[0];
      const w = world();
      const files = Array.isArray(w.files) ? w.files : [];
      const f = files.find((x) => x && x.path === path);
      if (!f) {
        return Promise.resolve({
          ok: false,
          lines: [{ text: 'hash: ' + path + ' が見つかりません。', cls: 'warn' }],
          meta: { knowledge: ['virustotal'] },
        });
      }
      const lines = [
        { text: 'md5(' + path + ')', cls: 'head' },
        { text: '  算出値: ' + (f.md5 || '(不明)'), cls: '' },
      ];
      if (f.legit === false) {
        lines.push({ text: '  基準値と不一致 — 改ざんの疑いがあります。', cls: 'err' });
      } else {
        lines.push({ text: '  基準値と一致 — 正常。', cls: 'ok' });
      }
      const meta = { knowledge: ['virustotal', 'cve-cvss', 'ipa-top10'] };
      // 改ざんファイルを引き当てたら Web改ざんの証跡 ev-deface を確定(silent目標 find-tampered)。
      // story.evidence の正準id(ev-deface)を申告する(world側の f.id='tampered' はゲーム内部用)。
      if (f.legit === false) meta.evidence = ['ev-deface'];
      return Promise.resolve({ ok: true, lines: lines, meta: meta });
    },
  });

  // ---- block <ip> ---------------------------------------------------------
  register('block', {
    usage: 'block <ip>',
    hint: '境界FWで指定IPを遮断',
    run(argv) {
      if (argv.length === 0) return usageErr('block <ip>');
      const ip = argv[0];
      if (!isIpLike(ip)) {
        return Promise.resolve({
          ok: false,
          lines: [{ text: 'block: "' + ip + '" はIP形式ではありません。', cls: 'warn' }],
        });
      }
      const lines = [
        { text: '境界ファイアウォールにルールを追加しました。', cls: 'ok' },
        { text: '  deny from ' + ip + ' (all ports)', cls: 'dim' },
        { text: '  以後この送信元からの通信を遮断します。', cls: 'dim' },
      ];
      if (actions) actions.setFlag('blocked:' + ip, true);
      return Promise.resolve({
        ok: true,
        lines: lines,
        meta: { knowledge: ['defense-in-depth', 'waf'] },
      });
    },
  });

  // ---- isolate <deviceId> -------------------------------------------------
  register('isolate', {
    usage: 'isolate <deviceId>',
    hint: '感染機器をネットワークから隔離',
    run(argv) {
      if (argv.length === 0) return usageErr('isolate <deviceId>');
      const id = argv[0];
      const dev = findDevice(id);
      if (!dev) {
        return Promise.resolve({
          ok: false,
          lines: [{ text: 'isolate: 機器 ' + id + ' が見つかりません。', cls: 'warn' }],
        });
      }
      const lines = [
        { text: (dev.name || id) + ' (' + id + ') を隔離VLANへ移動しました。', cls: 'ok' },
        { text: '  ' + (dev.ip || '') + ' の東西/南北通信を遮断。封じ込め完了。', cls: 'dim' },
      ];
      if (actions) {
        actions.setFlag('isolated:' + id, true);
        actions.addScore('containment', 1);
      }
      return Promise.resolve({
        ok: true,
        lines: lines,
        meta: { knowledge: ['defense-in-depth', 'edr'] },
      });
    },
  });

  // ---- clear --------------------------------------------------------------
  register('clear', {
    usage: 'clear',
    hint: '画面を消去',
    run() {
      if (elOutput) elOutput.innerHTML = '';
      return Promise.resolve({ ok: true, lines: [], meta: {} });
    },
  });

  // 共通:usage エラー。
  function usageErr(usage) {
    return Promise.resolve({
      ok: false,
      lines: [{ text: '使い方: ' + usage, cls: 'dim' }],
      meta: {},
    });
  }

  // ---- 入力イベント結線 ----------------------------------------------------
  function bindInput() {
    if (!elForm || !elInput) return;
    elForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = elInput.value;
      runLine(v);
    });
    elInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        historyPrev();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        historyNext();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        applyCompletion();
      } else if (e.key === 'Escape') {
        // 補完ヒントを消す/入力をクリア。
        if (elSuggest && elSuggest.dataset.kind === 'hint') {
          clearSuggestHint();
        }
      }
    });
    // 入力が変わったら補完ヒントは畳む(チップは維持)。
    elInput.addEventListener('input', () => {
      if (elSuggest && elSuggest.dataset.kind === 'hint') clearSuggestHint();
    });
  }

  // ---- 初期化 --------------------------------------------------------------
  function init() {
    grabDom();
    bindInput();
    renderChips();
    ready = true;
    if (pendingFocus) focusInput();
  }

  let ready = false;
  let pendingFocus = false;

  function focusInput() {
    if (!ready) {
      pendingFocus = true;
      return;
    }
    if (elInput) {
      try {
        elInput.focus();
      } catch (_) {
        /* noop */
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  // ---- 公開(NS.term) -----------------------------------------------------
  NS.term = {
    print: print,
    register: register,
    run: runLine, // main/shift からの明示実行に使える
    suggest: suggest,
    clearSuggest() {
      currentChips = [];
      renderChips();
    },
    focus: focusInput,
    parse: parse,
    // テスト/UIが登録済みコマンド名を知りたい場合。
    commands: commandNames,
  };
})();
