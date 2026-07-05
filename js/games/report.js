// games/report.js — 朝(dawn)の引き継ぎレポート生成・知識点灯・共有カード。shift:end で #ending を構築する。
(() => {
  'use strict';

  const NS = (window.NS = window.NS || {});
  NS.games = NS.games || {};

  // ---- DOM参照(index.html §8) -----------------------------------------
  const $ = (id) => document.getElementById(id);

  let built = false;
  let cleanups = [];

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function on(target, type, fn, opts) {
    if (!target) return;
    target.addEventListener(type, fn, opts);
    cleanups.push(() => target.removeEventListener(type, fn, opts));
  }

  function emit(name, payload) {
    if (NS.bus && typeof NS.bus.emit === 'function') NS.bus.emit(name, payload || {});
  }

  // 00:00起点の分 → 'HH:MM'
  function fmtClock(min) {
    const m = Math.max(0, Math.round(min || 0));
    const hh = String(Math.floor(m / 60) % 24).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    return hh + ':' + mm;
  }

  function stateRef() {
    return (NS.state && typeof NS.state === 'object' && NS.state) || {};
  }
  function storyRef() {
    return (window.NSD && NSD.STORY && typeof NSD.STORY === 'object' && NSD.STORY) || {};
  }
  function endingRef() {
    const s = storyRef();
    return (s.ending && typeof s.ending === 'object' && s.ending) || {};
  }

  // ---- 週マッピング: knowledge id -> week --------------------------------
  function knowledgeWeekMap() {
    const map = {};
    const kb = (window.NSD && Array.isArray(NSD.KNOWLEDGE) && NSD.KNOWLEDGE) || [];
    kb.forEach((k) => {
      if (k && k.id != null && k.week != null) map[k.id] = k.week;
    });
    return map;
  }

  // 使用済み知識から点灯すべき週の集合を算出
  function usedWeeks() {
    const st = stateRef();
    const map = knowledgeWeekMap();
    const set = new Set();
    const used = Array.isArray(st.knowledgeUsed) ? st.knowledgeUsed : [];
    used.forEach((id) => {
      const w = map[id];
      if (w != null) set.add(w);
    });
    return set;
  }

  // 証跡idからラベル等を引く(story.evidence 正準)
  function evidenceInfo() {
    const s = storyRef();
    const arr = Array.isArray(s.evidence) ? s.evidence : [];
    const byId = {};
    arr.forEach((e) => {
      if (e && e.id != null) byId[e.id] = e;
    });
    return byId;
  }

  // ---- ランク算定(score合成) -------------------------------------------
  // containment/ethics/speed の合成。上限を仮定せず相対しきい値で S/A/B に落とす。
  function computeRank() {
    const st = stateRef();
    const sc = (st.score && typeof st.score === 'object' && st.score) || {};
    const containment = Number(sc.containment) || 0;
    const ethics = Number(sc.ethics) || 0;
    const speed = Number(sc.speed) || 0;
    // 重み: 封じ込めを主軸、倫理を同格、速度は従。
    const total = containment * 1.0 + ethics * 1.0 + speed * 0.6;

    // 知識をどれだけ「使って」夜を越えたかも評価に混ぜる(教材の狙い)。
    const usedCount = Array.isArray(st.knowledgeUsed) ? st.knowledgeUsed.length : 0;
    const evCount = Array.isArray(st.evidence) ? st.evidence.length : 0;
    const composite = total + usedCount * 0.4 + evCount * 0.8;

    let rank = 'B';
    if (composite >= 14) rank = 'S';
    else if (composite >= 8) rank = 'A';

    return { rank, composite: Math.round(composite * 10) / 10, containment, ethics, speed };
  }

  // ---- 引き継ぎレポート文面の組み立て -----------------------------------
  function buildReportText() {
    const st = stateRef();
    const evMap = evidenceInfo();
    const decisions = Array.isArray(st.decisions) ? st.decisions : [];
    const evidence = Array.isArray(st.evidence) ? st.evidence : [];
    const world = (window.NSD && NSD.WORLD) || {};
    const company = (world.company && world.company.name) || '監視対象組織';
    const endClock = fmtClock(st.clockMin != null ? st.clockMin : 360);

    // 封じ込め判断のラベル解決
    const CONTAINMENT_LABELS = {
      'infected-only': '感染機器のみ隔離',
      segment: 'セグメント全体を隔離',
      'full-cut': '全社ネットワーク遮断',
    };

    const lines = [];
    lines.push('件名: 夜間シフト インシデント引き継ぎ報告');
    lines.push('対象: ' + company + '(監視対象・架空)');
    lines.push('報告時刻: ' + endClock + ' / 当番: 夜勤アナリスト');
    lines.push('');

    lines.push('【1. 概況】');
    lines.push(
      '本シフト中、複数の事象を検知・調査した。個別のアラートは独立して見えたが、相関分析の結果、' +
        'これらは一連の攻撃キャンペーンの各段階であったことが判明した。'
    );
    lines.push('');

    lines.push('【2. 確認された証跡(時系列)】');
    if (!evidence.length) {
      lines.push('  ・記録された証跡なし。');
    } else {
      // chainStep順に並べ替え
      const ordered = evidence
        .map((id) => evMap[id])
        .filter(Boolean)
        .sort((a, b) => (a.chainStep || 99) - (b.chainStep || 99));
      const useList = ordered.length ? ordered : evidence.map((id) => ({ id, label: id, time: '', kind: '' }));
      useList.forEach((e, i) => {
        const t = e.time ? e.time + ' ' : '';
        const kind = e.kind ? '[' + e.kind + '] ' : '';
        lines.push('  ' + (i + 1) + '. ' + t + kind + (e.label || e.id));
      });
    }
    lines.push('');

    lines.push('【3. 攻撃ストーリー(相関の要旨)】');
    lines.push(
      '  陽動としてのDDoSの裏で本命が進行し、初期侵入 → 内部での足場確保 → 改ざん・バックドア設置 → ' +
        '認証情報の窃取と情報持ち出し、という一本のキルチェーンを形成していた。'
    );
    lines.push('');

    lines.push('【4. 実施した封じ込め判断】');
    if (!decisions.length) {
      lines.push('  ・封じ込め判断の記録なし。');
    } else {
      decisions.forEach((d) => {
        const label =
          (d && d.id === 'containment' && CONTAINMENT_LABELS[d.choice]) ||
          (d && d.choice) ||
          '(不明)';
        const at = d && d.clockMin != null ? ' (' + fmtClock(d.clockMin) + ')' : '';
        lines.push('  ・' + label + at);
      });
    }
    lines.push('');

    lines.push('【5. 申し送り・推奨対応】');
    lines.push('  ・隔離した区画の復旧前に、残存バックドアと横展開痕跡の全数確認を行うこと。');
    lines.push('  ・感染IoT機器は初期化・認証情報の総入れ替え(デフォルト資格情報の排除)を徹底すること。');
    lines.push('  ・窃取された可能性のある認証情報は失効・再発行し、多要素認証の再設定経路を点検すること。');
    lines.push('  ・本件の時系列と証跡は、正式なインシデントレポートとして保全すること。');
    lines.push('');

    // story側テンプレートがあれば末尾に添える(署名・定型文の想定)
    const tmpl = endingRef().handoffTemplate;
    if (typeof tmpl === 'string' && tmpl.trim()) {
      lines.push('---');
      lines.push(tmpl.trim());
    }

    return lines.join('\n');
  }

  // ---- #report-doc 描画(報告書らしい体裁) ------------------------------
  function renderReportDoc(reportText) {
    const host = $('report-doc');
    if (!host) return;
    host.innerHTML = '';

    const st = stateRef();
    const endClock = fmtClock(st.clockMin != null ? st.clockMin : 360);
    const world = (window.NSD && NSD.WORLD) || {};
    const company = (world.company && world.company.name) || '監視対象組織';

    // 用紙ヘッダ
    const paperHead = el('div', 'ns-report-doc__head');
    paperHead.appendChild(el('p', 'ns-report-doc__docid', 'INCIDENT HANDOFF ｜ NIGHT SHIFT'));
    paperHead.appendChild(el('h4', 'ns-report-doc__subject', 'インシデント引き継ぎ報告書'));
    const metaRow = el('p', 'ns-report-doc__meta');
    metaRow.textContent = '対象: ' + company + '(架空) ／ 報告時刻: ' + endClock;
    paperHead.appendChild(metaRow);
    host.appendChild(paperHead);

    // 本文(等幅・整形済みテキスト)
    const body = el('pre', 'ns-report-doc__body');
    body.setAttribute('tabindex', '0');
    body.setAttribute('aria-label', '引き継ぎレポート本文');
    body.textContent = reportText;
    host.appendChild(body);

    // 署名欄(報告書の体裁)
    const sign = el('div', 'ns-report-doc__sign');
    sign.appendChild(el('span', 'ns-report-doc__sign-label', '担当:'));
    sign.appendChild(el('span', 'ns-report-doc__sign-line', '夜勤アナリスト'));
    host.appendChild(sign);
  }

  // ---- #week-lights: 13週チップを並べ、使用週を順に点灯 -------------------
  function renderWeekLights() {
    const host = $('week-lights');
    if (!host) return;
    host.innerHTML = '';

    const weeks = (window.NSD && Array.isArray(NSD.WEEKS) && NSD.WEEKS) || [];
    const litSet = usedWeeks();
    const st = stateRef();
    const reduced =
      (st && st.reduced === true) || document.documentElement.getAttribute('data-reduced') === '1';

    // WEEKSが空でも1..13の器は出す(再訪動機のため未点灯で残す)
    const source =
      weeks.length >= 13
        ? weeks
        : Array.from({ length: 13 }, (_, i) => ({ week: i + 1, title: '', oneline: '' }));

    const chips = [];
    source.forEach((w) => {
      const num = w.week != null ? w.week : 0;
      const li = el('li', 'ns-week-light');
      li.dataset.week = String(num);
      li.setAttribute('role', 'listitem');
      const lit = litSet.has(num);
      li.classList.add(lit ? 'is-lit' : 'is-dark');
      li.setAttribute('aria-label', 'WEEK ' + num + ' ' + (w.title || '') + (lit ? ' 使用済み' : ' 未使用'));

      const dot = el('span', 'ns-week-light__dot');
      dot.setAttribute('aria-hidden', 'true');
      const numEl = el('span', 'ns-week-light__num', String(num).padStart(2, '0'));
      const titleEl = el('span', 'ns-week-light__title', w.title || ('WEEK ' + num));
      // 状態テキスト(色以外の手がかり)
      const stat = el('span', 'ns-week-light__state', lit ? '使用' : '—');
      stat.setAttribute('aria-hidden', 'true');

      li.appendChild(dot);
      li.appendChild(numEl);
      li.appendChild(titleEl);
      li.appendChild(stat);
      if (w.oneline) li.title = w.oneline;
      host.appendChild(li);
      chips.push({ li, lit });
    });

    // 点灯を順にアニメ(reduced時は即時)。CSSは .is-lit を前提に発光。
    if (reduced) {
      chips.forEach((c) => {
        if (c.lit) c.li.classList.add('is-on');
      });
      return;
    }
    let delay = 260;
    chips.forEach((c) => {
      if (!c.lit) return;
      const t = window.setTimeout(() => {
        c.li.classList.add('is-on');
      }, delay);
      cleanups.push(() => window.clearTimeout(t));
      delay += 220;
    });

    // まとめのキャプション(「今夜使ったのは、13週分の学びだった」の回収)
    const litCount = chips.filter((c) => c.lit).length;
    const cap = el('p', 'ns-week-lights__caption');
    cap.textContent =
      '今夜あなたが引いた知識は、全13週のうち ' +
      litCount +
      ' 週分。今夜使ったのは、13週分の学びだった。' +
      (litCount < 13 ? ' — 消えたままの週は、まだ触れていない夜がある。' : ' — 一つ残らず、今夜つながった。');
    // caption は host の直後に置く(週チップの外側)
    if (host.parentNode) host.parentNode.appendChild(cap);
    cleanups.push(() => {
      if (cap.parentNode) cap.parentNode.removeChild(cap);
    });
  }

  // ---- 共有カード用テキストサマリの組み立て ------------------------------
  function buildShareText(rankInfo) {
    const st = stateRef();
    const litCount = usedWeeks().size;
    const evCount = Array.isArray(st.evidence) ? st.evidence.length : 0;
    const endClock = fmtClock(st.clockMin != null ? st.clockMin : 360);

    const rankLabels = endingRef().rankLabels || {};
    const rankName = rankLabels[rankInfo.rank] || '';

    const lines = [];
    lines.push('夜勤のSOC ｜ NIGHT SHIFT — 一夜を勤め上げた');
    lines.push('シフト終了 ' + endClock + ' / 評価ランク: ' + rankInfo.rank + (rankName ? '(' + rankName + ')' : ''));
    lines.push('つないだ証跡: ' + evCount + ' 件 / 使った学び: 全13週のうち ' + litCount + ' 週');
    lines.push('陽動DDoSの裏で進む一本のキルチェーンを、コマンドとログで解き明かした。');
    lines.push('今夜使ったのは、13週分の学びだった。');
    lines.push('#NightShiftSOC');
    return lines.join('\n');
  }

  // ---- #share-card 描画(コピー: clipboard + フォールバック) --------------
  function renderShareCard(rankInfo) {
    const host = $('share-card');
    if (!host) return;
    host.innerHTML = '';

    const shareText = buildShareText(rankInfo);

    // ランクバッジ
    const rankLabels = endingRef().rankLabels || {};
    const badge = el('div', 'ns-share-card__rank ns-share-card__rank--' + rankInfo.rank.toLowerCase());
    badge.appendChild(el('span', 'ns-share-card__rank-k', 'RANK'));
    badge.appendChild(el('span', 'ns-share-card__rank-v', rankInfo.rank));
    if (rankLabels[rankInfo.rank]) {
      badge.appendChild(el('span', 'ns-share-card__rank-name', rankLabels[rankInfo.rank]));
    }
    host.appendChild(badge);

    // コピー対象テキスト(表示も兼ねる)
    const pre = el('pre', 'ns-share-card__text');
    pre.setAttribute('tabindex', '0');
    pre.setAttribute('aria-label', '共有用テキスト');
    pre.textContent = shareText;
    host.appendChild(pre);

    // コピーボタン + フォールバック用hidden textarea
    const actions = el('div', 'ns-share-card__actions');
    const copyBtn = el('button', 'ns-btn ns-btn--primary ns-share-card__copy', 'テキストをコピー');
    copyBtn.type = 'button';
    const feedback = el('span', 'ns-share-card__feedback');
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    actions.appendChild(copyBtn);
    actions.appendChild(feedback);
    host.appendChild(actions);

    const setFeedback = (msg, ok) => {
      feedback.textContent = msg;
      feedback.classList.toggle('is-ok', !!ok);
      feedback.classList.toggle('is-err', !ok);
      emit('toast', { text: msg, kind: ok ? 'ok' : 'warn' });
    };

    const doCopy = () => {
      // 1) navigator.clipboard(セキュアコンテキスト)
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(shareText).then(
          () => setFeedback('コピーしました。', true),
          () => fallbackCopy()
        );
        return;
      }
      fallbackCopy();
    };

    const fallbackCopy = () => {
      // 2) 一時textarea + execCommand フォールバック
      let ok = false;
      const ta = document.createElement('textarea');
      ta.value = shareText;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.left = '-9999px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      try {
        ta.focus();
        ta.select();
        ta.setSelectionRange(0, ta.value.length);
        ok = document.execCommand && document.execCommand('copy');
      } catch (e) {
        ok = false;
      }
      document.body.removeChild(ta);
      if (ok) {
        setFeedback('コピーしました。', true);
      } else {
        // 3) 最終手段: テキストを選択状態にして手動コピーを促す
        selectPre();
        setFeedback('自動コピーに失敗しました。表示のテキストを選択してコピーしてください。', false);
      }
    };

    const selectPre = () => {
      try {
        const range = document.createRange();
        range.selectNodeContents(pre);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (e) {
        /* 選択不可環境では何もしない */
      }
    };

    on(copyBtn, 'click', doCopy);
  }

  // ---- エンディング全体の構築 --------------------------------------------
  function buildEnding() {
    const ending = $('ending');
    if (!ending) return;

    // クロージング文(NSD.STORY.ending.closing)の演出挿入
    injectClosing(ending);

    const reportText = buildReportText();
    renderReportDoc(reportText);

    const rankInfo = computeRank();
    injectRankLine(rankInfo);

    renderWeekLights();
    renderShareCard(rankInfo);
    wireRestart();

    // #ending を表示に切り替え、#app/#boot を隠す
    revealEnding(ending);
    built = true;
  }

  // クロージング文をヘッダ直下に差し込む(重複防止)
  function injectClosing(ending) {
    const head = ending.querySelector('.ns-ending__head') || ending.firstElementChild || ending;
    let box = ending.querySelector('.ns-ending__closing');
    if (!box) {
      box = el('p', 'ns-ending__closing');
      // headの直後へ
      if (head && head.parentNode) head.parentNode.insertBefore(box, head.nextSibling);
      else ending.appendChild(box);
    }
    const closing = endingRef().closing;
    box.textContent =
      (typeof closing === 'string' && closing.trim()) ||
      '窓の外が白んできた。長い夜だった。あなたが今夜引いた道具の一つひとつは、いつかの授業で手渡されたものだ。' +
        '今夜使ったのは、13週分の学びだった——それを、次の当番へ引き継ぐ。';
  }

  // レポート見出し付近にランク行を差し込む(共有カードとは別に本文側にも明示)
  function injectRankLine(rankInfo) {
    const reportH = $('report-h');
    if (!reportH || !reportH.parentNode) return;
    let line = document.getElementById('ns-report-rank');
    if (!line) {
      line = el('p', 'ns-report-rank');
      line.id = 'ns-report-rank';
      reportH.parentNode.insertBefore(line, reportH.nextSibling);
      cleanups.push(() => {
        if (line.parentNode) line.parentNode.removeChild(line);
      });
    }
    const rankLabels = endingRef().rankLabels || {};
    const name = rankLabels[rankInfo.rank] ? '(' + rankLabels[rankInfo.rank] + ')' : '';
    line.textContent =
      '総合評価: ランク ' +
      rankInfo.rank +
      ' ' +
      name +
      ' ／ 封じ込め ' +
      rankInfo.containment +
      '・倫理 ' +
      rankInfo.ethics +
      '・迅速 ' +
      rankInfo.speed;
  }

  function wireRestart() {
    const btn = $('btn-restart');
    if (!btn) return;
    const handler = () => {
      const actions = NS.actions;
      if (actions && typeof actions.reset === 'function') {
        actions.reset();
      }
      // 保険: リロードで完全初期化(reset未実装/未結線でも復帰可能に)
      // reset がページ状態まで戻さない実装を考慮し、状態リセット後に再読込。
      try {
        window.location.reload();
      } catch (e) {
        /* reload不可環境では reset のみに委ねる */
      }
    };
    on(btn, 'click', handler);
  }

  function revealEnding(ending) {
    const app = $('app');
    const boot = $('boot');
    if (app) app.setAttribute('hidden', '');
    if (boot) boot.setAttribute('hidden', '');
    ending.removeAttribute('hidden');
    // 見出しへフォーカス移動(スクリーンリーダー通知)
    const h = $('ending-h');
    if (h) {
      if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
      try {
        h.focus();
      } catch (e) {
        /* focus不可は無視 */
      }
    }
    try {
      ending.scrollIntoView({ block: 'start' });
    } catch (e) {
      /* 無視 */
    }
  }

  // ---- 公開API + 自己結線 ------------------------------------------------
  // report は shift:end で発火するため、mount は「エンディング構築」を意味する。
  function mount() {
    if (built) return;
    buildEnding();
  }

  function unmount() {
    cleanups.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        /* 無視 */
      }
    });
    cleanups = [];
    built = false;
  }

  // shift:end を受けてエンディングを構築(§10: shift:endで#endingを構築)
  function wireBus() {
    if (NS.bus && typeof NS.bus.on === 'function') {
      NS.bus.on('shift:end', () => {
        built = false; // 再訪時の再構築を許可
        cleanups.forEach((fn) => {
          try {
            fn();
          } catch (e) {
            /* 無視 */
          }
        });
        cleanups = [];
        buildEnding();
      });
    }
  }

  wireBus();

  NS.games.report = { mount, unmount };
})();
