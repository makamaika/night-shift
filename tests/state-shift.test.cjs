const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

function source(file) {
  return process.env.BASELINE === '1' && file !== 'js/data/story.js'
    ? execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8' })
    : fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

function runtime(saved = new Map(), storageAvailable = true) {
  const timers = new Map();
  let timerId = 0;
  const root = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; },
    removeAttribute(k) { delete this.attrs[k]; } };
  const localStorage = {
    getItem(k) { return saved.get(k) ?? null; },
    setItem(k, v) { saved.set(k, v); },
    removeItem(k) { saved.delete(k); },
  };
  const context = { console, Promise, document: { documentElement: root },
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); } };
  if (storageAvailable) context.localStorage = localStorage;
  context.window = context;
  vm.createContext(context);
  for (const file of ['js/data/story.js', 'js/engine/state.js', 'js/engine/shift.js']) {
    vm.runInContext(source(file), context, { filename: file });
  }
  return { NS: context.NS, saved, timers, root,
    tick() { const [id, fn] = timers.entries().next().value || []; if (fn) { timers.delete(id); fn(); } },
  };
}

test('previously found evidence completes ripple, silent and line objectives once', () => {
  for (const [phase, evidence, objective] of [
    ['ripple', 'ev-iot', 'inspect-mfp'],
    ['silent', 'ev-deface', 'find-tampered'],
    ['line', 'ev-exfil', 'find-exfil'],
  ]) {
    const { NS } = runtime();
    NS.actions.setReduced(true);
    NS.actions.addEvidence(evidence); // acquired in an earlier phase
    let evidenceEvents = 0;
    NS.bus.on('evidence:add', (p) => { if (p.id === evidence) evidenceEvents++; });
    NS.shift.start({ phaseId: phase });
    assert.equal(NS.state.objectives[phase][objective], true, phase);
    assert.equal(NS.state.score.speed, 1, phase);
    NS.actions.addEvidence(evidence);
    assert.equal(evidenceEvents, 0, `${phase}: no duplicate evidence event`);
    assert.equal(NS.state.score.speed, 1, `${phase}: no duplicate score`);
  }
});

test('unfound evidence still waits for its event and switching phases removes old monitors', () => {
  const { NS } = runtime();
  NS.actions.setReduced(true);
  NS.shift.start({ phaseId: 'ripple' });
  assert.equal(NS.state.objectives.ripple['inspect-mfp'], undefined);
  NS.actions.addEvidence('ev-iot');
  assert.equal(NS.state.objectives.ripple['inspect-mfp'], true);
  NS.shift.jumpTo('silent');
  NS.actions.addEvidence('ev-deface');
  assert.equal(NS.state.objectives.silent['find-tampered'], true);
  assert.equal(NS.state.score.speed, 2);
});

test('all completed objectives advance on resume; unfinished games reopen once', () => {
  const { NS, timers } = runtime();
  NS.actions.setReduced(true);
  for (const id of ['list-devices', 'whois-scan', 'inspect-mfp']) {
    NS.actions.completeObjective('ripple', id);
  }
  NS.shift.start({ phaseId: 'ripple', resume: true });
  assert.equal(timers.size, 1, 'already completed phase schedules advance');

  const game = runtime();
  game.NS.actions.setReduced(true);
  game.NS.actions.completeObjective('storm', 'ping-underfire');
  game.NS.actions.completeObjective('storm', 'see-nat-storm');
  game.NS.actions.setClock(163);
  let opened = 0;
  game.NS.bus.on('game:open', () => opened++);
  game.NS.shift.start({ phaseId: 'storm', resume: true });
  assert.equal(game.NS.state.clockMin, 163, 'resume preserves clock');
  assert.equal(opened, 1, 'unfinished minigame reopens');
  game.NS.bus.emit('ddos:resolved', {});
  assert.equal(game.NS.state.flags['gameDone:storm'], true);
  assert.equal(game.timers.size, 1);
});

test('completed minigame does not award or reopen again after reload', async () => {
  const saved = new Map();
  const first = runtime(saved);
  first.NS.actions.setReduced(true);
  first.NS.actions.completeObjective('storm', 'ping-underfire');
  first.NS.actions.completeObjective('storm', 'see-nat-storm');
  first.NS.shift.start({ phaseId: 'storm' });
  first.NS.bus.emit('ddos:resolved', {});
  await Promise.resolve();
  assert.ok(saved.has('ns-save-v1'));
  const second = runtime(saved);
  assert.equal(second.NS.actions.load(), true);
  let opened = 0;
  second.NS.bus.on('game:open', () => opened++);
  second.NS.shift.start({ phaseId: 'storm', resume: true });
  assert.equal(opened, 0);
  assert.equal(second.timers.size, 1);
  second.tick();
  assert.equal(second.NS.state.phaseId, 'silent');
});

test('load preserves progress and corrupt saves until explicit reset', async () => {
  const saved = new Map();
  const first = runtime(saved);
  first.NS.actions.addEvidence('ev-iot');
  first.NS.actions.unlockKnowledge('mirai');
  first.NS.actions.setReduced(true);
  await Promise.resolve();
  const second = runtime(saved);
  assert.equal(second.NS.actions.load(), true);
  assert.equal(second.NS.actions.saveStatus(), 'valid');
  assert.equal(second.NS.state.evidence[0], 'ev-iot');
  assert.equal(second.NS.state.knowledgeUnlocked[0], 'mirai');
  assert.equal(second.NS.state.reduced, true);

  const bad = new Map([['ns-save-v1', '{broken']]);
  const corrupt = runtime(bad);
  assert.equal(corrupt.NS.actions.load(), false);
  assert.equal(corrupt.NS.actions.saveStatus(), 'corrupt');
  corrupt.NS.actions.setReduced(true);
  await Promise.resolve();
  assert.equal(bad.get('ns-save-v1'), '{broken');
  corrupt.NS.actions.reset();
  await Promise.resolve();
  assert.equal(bad.has('ns-save-v1'), false, 'reset leaves no empty resumable save');

  const pending = runtime(new Map());
  pending.NS.actions.addEvidence('ev-iot');
  pending.NS.actions.reset();
  await Promise.resolve();
  assert.equal(pending.saved.has('ns-save-v1'), false, 'pending write cannot undo reset');

  const partial = new Map([['ns-save-v1', JSON.stringify({
    ...JSON.parse(saved.get('ns-save-v1')), evidence: 'ev-iot',
  })]]);
  const malformed = runtime(partial);
  assert.equal(malformed.NS.actions.load(), false);
  assert.equal(malformed.NS.actions.saveStatus(), 'corrupt');
  const before = partial.get('ns-save-v1');
  malformed.NS.actions.addEvidence('ev-new');
  await Promise.resolve();
  assert.equal(partial.get('ns-save-v1'), before);

  const unavailable = runtime(new Map(), false);
  assert.equal(unavailable.NS.actions.load(), false);
  assert.equal(unavailable.NS.actions.saveStatus(), 'unavailable');
  assert.equal(unavailable.NS.actions.save(), false);
});
