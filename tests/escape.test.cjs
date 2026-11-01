const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

function source(file) {
  return process.env.BASELINE === '1'
    ? execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8' })
    : fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

function setup(withSave = false) {
  const callbacks = new Map();
  const document = { readyState: 'loading', activeElement: null,
    querySelector(sel) { return nodes.get(sel) || null; },
    addEventListener(type, fn) { (callbacks.get(type) || callbacks.set(type, []).get(type)).push(fn); },
    contains() { return true; },
  };
  class Element {
    constructor(id, hidden = false) {
      this.id = id; this.hidden = hidden; this.attrs = {}; this.listeners = new Map();
      this.children = []; this.offsetParent = {};
    }
    addEventListener(type, fn) { (this.listeners.get(type) || this.listeners.set(type, []).get(type)).push(fn); }
    removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter((f) => f !== fn)); }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return this.attrs[k] ?? null; }
    removeAttribute(k) { delete this.attrs[k]; }
    hasAttribute(k) { return k in this.attrs; }
    querySelectorAll() { return this.children; }
    querySelector() { return null; }
    contains(n) { return this.children.includes(n); }
    getClientRects() { return [1]; }
    focus() { document.activeElement = this; }
    fire(type, key) {
      const event = { type, key, target: this, preventDefault() {}, stopPropagation() {} };
      for (const fn of this.listeners.get(type) || []) fn(event);
    }
  }
  const nodes = new Map();
  function node(sel, hidden = false) { const n = new Element(sel, hidden); nodes.set(sel, n); return n; }
  const root = node('html');
  document.documentElement = root;
  const boot = node('#boot');
  const app = node('#app', true);
  const bootButton = node('#btn-challenge');
  boot.children.push(bootButton);
  node('#btn-resume', true);
  node('#start-label');
  node('#save-note', true);
  node('#btn-restart');
  node('#ending', true);
  const challenge = node('#challenge', true);
  challenge.children.push(node('#btn-challenge-back'));
  node('#ch-title');
  const drawerButton = node('#btn-drawer');
  const drawer = node('#knowledge');
  drawer.children.push(node('#btn-drawer-close'));
  node('#drawer-backdrop', true);
  app.children.push(drawerButton);
  document.activeElement = bootButton;
  const storage = new Map();
  const context = { document, console, Promise,
    localStorage: { getItem(k) { return storage.get(k) || null; },
      setItem(k, v) { storage.set(k, v); }, removeItem(k) { storage.delete(k); } },
    setTimeout(fn) { fn(); return 1; }, clearTimeout() {},
    requestAnimationFrame(fn) { fn(); }, scrollTo() {},
    getComputedStyle() { return { display: 'block', visibility: 'visible' }; },
    innerWidth: 800, addEventListener() {}, NSD: { STORY: { phases: [{ id: 'quiet' }], laws: [] } },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source('js/engine/state.js'), context);
  if (withSave) {
    context.NS.actions.addEvidence('ev-iot');
    context.NS.actions.unlockKnowledge('mirai');
    context.NS.actions.save();
    context.NS.state.evidence = [];
    context.NS.state.knowledgeUnlocked = [];
  }
  context.NS.ui = {
    closeDialog(elm) { elm.hidden = true; elm.removeAttribute('data-open'); context.NS.a11y.release(elm); },
  };
  for (const file of ['js/a11y.js', 'js/challenge.js', 'js/main.js']) {
    vm.runInContext(source(file), context, { filename: file });
  }
  for (const fn of callbacks.get('DOMContentLoaded') || []) fn();
  return { NS: context.NS, NSD: context.NSD, nodes, document, Element, boot, challenge, drawer, drawerButton, app };
}

test('boot ignores Escape, and challenge Escape returns to boot for reopening', () => {
  const { NS, boot, challenge, nodes, document } = setup();
  boot.fire('keydown', 'Escape');
  assert.equal(boot.hidden, false);
  NS.challenge.open();
  assert.equal(boot.hidden, true);
  challenge.fire('keydown', 'Escape');
  assert.equal(challenge.hidden, true);
  assert.equal(boot.hidden, false);
  assert.equal(document.activeElement, nodes.get('#btn-challenge'));
  NS.challenge.open();
  assert.equal(challenge.hidden, false);
  NS.challenge.close();
  assert.equal(boot.hidden, false);
});

test('drawer Escape uses its close path and can reopen; ordinary dialogs close', () => {
  const { NS, drawer, drawerButton, nodes, Element } = setup();
  drawerButton.fire('click');
  assert.equal(drawer.getAttribute('data-drawer'), 'open');
  drawer.fire('keydown', 'Escape');
  assert.equal(drawer.getAttribute('data-drawer'), null);
  assert.equal(drawerButton.getAttribute('aria-expanded'), 'false');
  assert.equal(nodes.get('#drawer-backdrop').hidden, true);
  drawerButton.fire('click');
  assert.equal(drawer.getAttribute('data-drawer'), 'open');
  nodes.get('#btn-drawer-close').fire('click');
  assert.equal(drawer.getAttribute('data-drawer'), null);

  for (const id of ['help', 'law']) {
    const fake = new Element(id);
    // Ordinary dialog uses the generic NS.ui.closeDialog fallback.
    fake.hidden = false;
    NS.a11y.trap(fake);
    fake.fire('keydown', 'Escape');
    assert.equal(fake.hidden, true, id);
  }
});

test('saved shift resumes, while restart clears the stale resume choice', () => {
  const { NS, nodes, boot, app } = setup(true);
  assert.equal(nodes.get('#btn-resume').hidden, false);
  assert.equal(nodes.get('#start-label').textContent, '新しく始める');
  nodes.get('#btn-resume').fire('click');
  assert.equal(boot.hidden, true);
  assert.equal(app.hidden, false);
  assert.equal(NS.state.evidence[0], 'ev-iot');
  assert.equal(NS.state.knowledgeUnlocked[0], 'mirai');
  nodes.get('#btn-restart').fire('click');
  assert.equal(boot.hidden, false);
  assert.equal(nodes.get('#btn-resume').hidden, true);
  assert.equal(nodes.get('#start-label').textContent, 'シフト開始');
});

test('answered law memo is not reopened on phase resume', () => {
  const { NS, NSD } = setup();
  NSD.STORY.laws.push({ id: 'law-test', trigger: { phase: 'quiet' } });
  NS.actions.decide('law-test', 'safe');
  let popups = 0;
  NS.bus.on('law:popup', () => popups++);
  // The main phase:enter handler reads the current story on each event.
  NS.bus.emit('phase:enter', { phaseId: 'quiet' });
  assert.equal(popups, 0);
});
