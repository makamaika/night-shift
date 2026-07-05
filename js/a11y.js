// a11y.js — NS.a11y : フォーカストラップ / Escでダイアログ閉 / reduced-motion検知と同期 / グローバルキー。
(() => {
  'use strict';

  const bus = NS.bus;
  const actions = NS.actions;
  const state = NS.state;

  const $ = (sel) => document.querySelector(sel);

  // フォーカス可能要素のセレクタ
  const FOCUSABLE = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled])',
    'select:not([disabled])', 'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  function focusableIn(root) {
    if (!root) return [];
    return Array.prototype.slice.call(root.querySelectorAll(FOCUSABLE))
      .filter((n) => {
        if (n === document.activeElement) return true;
        if (n.hidden) return false;
        // 非表示(display:none / visibility:hidden 等)を除外
        const style = window.getComputedStyle(n);
        if (style.visibility === 'hidden' || style.display === 'none') return false;
        // offsetParent は position:fixed の要素で null になり得るため、矩形も見る
        if (n.offsetParent !== null) return true;
        const r = n.getClientRects();
        return r && r.length > 0;
      });
  }

  // ============================================================
  // フォーカストラップ
  // ============================================================
  const trapStack = []; // {el, prevFocus, keyHandler}

  function trap(elm) {
    if (!elm) return;
    const prevFocus = document.activeElement;

    const keyHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        // 一番上のトラップ要素を閉じる
        requestClose(elm);
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusableIn(elm);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !elm.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !elm.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    elm.addEventListener('keydown', keyHandler, true);
    trapStack.push({ el: elm, prevFocus, keyHandler });

    // 初期フォーカスを内部の最初の要素へ
    const items = focusableIn(elm);
    const initial = elm.querySelector('[autofocus]') || items[0];
    if (initial) {
      // ダイアログの閉じるボタンより本文の意味ある要素を優先(なければ最初)
      window.setTimeout(() => { try { initial.focus(); } catch (e) { /* noop */ } }, 0);
    } else if (elm.tabIndex >= 0) {
      elm.focus();
    }
  }

  function release(elm) {
    // elm 指定があればそれ、なければ最上位を解除
    let idx = trapStack.length - 1;
    if (elm) {
      for (let i = trapStack.length - 1; i >= 0; i--) {
        if (trapStack[i].el === elm) { idx = i; break; }
      }
    }
    if (idx < 0 || !trapStack[idx]) return;
    const entry = trapStack.splice(idx, 1)[0];
    entry.el.removeEventListener('keydown', entry.keyHandler, true);
    // フォーカスを元へ戻す
    if (entry.prevFocus && document.contains(entry.prevFocus)) {
      try { entry.prevFocus.focus(); } catch (e) { /* noop */ }
    }
  }

  // ダイアログを閉じる要求(panels.js の closeDialog に委譲、なければ自前で hidden)
  function requestClose(elm) {
    if (NS.ui && typeof NS.ui.closeDialog === 'function') {
      NS.ui.closeDialog(elm);
    } else {
      elm.hidden = true;
      release(elm);
    }
  }

  // ============================================================
  // reduced-motion 検知 + トグル同期
  // ============================================================
  const REDUCE_KEY = 'ns-reduced-pref';

  function applyReduced(on) {
    const root = document.documentElement;
    if (on) root.setAttribute('data-reduced', '1');
    else root.removeAttribute('data-reduced');
    // UIの見た目を同期
    const chk = $('#chk-reduce');
    if (chk) chk.checked = !!on;
    const btn = $('#btn-reduce');
    if (btn) btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function setReduced(on, opts) {
    applyReduced(on);
    // state 側の真実は actions.setReduced が持つ(html属性も書く運用/推奨)
    if (typeof actions.setReduced === 'function') actions.setReduced(!!on);
    else if (state) state.reduced = !!on;
    if (!(opts && opts.silent)) {
      try { localStorage.setItem(REDUCE_KEY, on ? '1' : '0'); } catch (e) { /* noop */ }
    }
  }

  function toggleReduced() {
    const now = document.documentElement.getAttribute('data-reduced') === '1';
    setReduced(!now);
  }

  function initReduced() {
    const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    // 保存された手動設定を優先、なければ OS 設定
    let saved = null;
    try { saved = localStorage.getItem(REDUCE_KEY); } catch (e) { saved = null; }
    let initial;
    if (saved === '1' || saved === '0') initial = saved === '1';
    else initial = !!(mq && mq.matches);
    setReduced(initial, { silent: true });

    // OS 設定変化に追従(手動保存が無いときのみ)
    if (mq) {
      const onChange = (e) => {
        let cur = null;
        try { cur = localStorage.getItem(REDUCE_KEY); } catch (err) { cur = null; }
        if (cur !== '1' && cur !== '0') setReduced(e.matches, { silent: true });
      };
      if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onChange);
      else if (typeof mq.addListener === 'function') mq.addListener(onChange);
    }

    // #chk-reduce(boot画面)と #btn-reduce(topbar)の結線
    const chk = $('#chk-reduce');
    if (chk) chk.addEventListener('change', () => setReduced(chk.checked));
    const btn = $('#btn-reduce');
    if (btn) btn.addEventListener('click', () => toggleReduced());
  }

  // ============================================================
  // グローバルキーボードショートカット
  // ============================================================
  function isTypingTarget(t) {
    if (!t) return false;
    const tag = t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (t.isContentEditable) return true;
    return false;
  }

  function dialogOpen() {
    return !!document.querySelector('.ns-dialog[data-open], .ns-dialog:not([hidden])');
  }

  function toggleHelp() {
    const dlg = $('#help-dialog');
    if (!dlg) return;
    const isOpen = !dlg.hidden;
    if (isOpen) requestClose(dlg);
    else if (NS.ui && typeof NS.ui.openDialog === 'function') NS.ui.openDialog(dlg);
    else { dlg.hidden = false; trap(dlg); }
  }

  function initKeys() {
    document.addEventListener('keydown', (e) => {
      // 修飾キー付きは横取りしない
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // ? はヘルプ(入力中でも Shift+/ を許可するかは限定的に:入力中は無視)
      if ((e.key === '?' || (e.key === '/' && e.shiftKey)) && !isTypingTarget(e.target)) {
        e.preventDefault();
        toggleHelp();
        return;
      }

      // Escape: ダイアログが開いていれば a11y.trap 側で拾うが、
      // トラップ外(boot/app)でも保険的にヘルプ/法メモを閉じる
      if (e.key === 'Escape') {
        const openDlg = document.querySelector('.ns-dialog[data-open]');
        if (openDlg) { requestClose(openDlg); e.preventDefault(); }
        return;
      }

      // 1-4 でタブ切替(入力中/ダイアログ中は無効)
      if (!isTypingTarget(e.target) && !dialogOpen()) {
        const app = $('#app');
        const appVisible = app && !app.hidden;
        if (appVisible && /^[1-4]$/.test(e.key)) {
          const order = (NS.ui && NS.ui._tabs && NS.ui._tabs.TAB_IDS) || ['terminal', 'network', 'evidence', 'game'];
          const idx = parseInt(e.key, 10) - 1;
          if (order[idx] && NS.ui && typeof NS.ui.selectTab === 'function') {
            e.preventDefault();
            NS.ui.selectTab(order[idx], { focusTab: true });
          }
        }
      }
    });
  }

  // ============================================================
  // 公開API
  // ============================================================
  NS.a11y = {
    trap,
    release,
    setReduced,
    toggleReduced,
    focusableIn,
    // main が help を開閉に使える
    toggleHelp,
  };

  // ============================================================
  // 初期化
  // ============================================================
  function init() {
    initReduced();
    initKeys();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
