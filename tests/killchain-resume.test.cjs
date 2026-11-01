const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

function gameSource() {
  const source = process.env.BASELINE === '1'
    ? execFileSync('git', ['show', 'HEAD:js/games/killchain.js'], { encoding: 'utf8' })
    : fs.readFileSync(path.join(__dirname, '../js/games/killchain.js'), 'utf8');
  return source.replace('NS.games.killchain = { mount, unmount };',
    `NS.games.killchain = { mount, unmount };
     NS.gameTest = { setup(api, ui) { apiRef = api; els = ui; phase = 'chained'; },
       onDecide, openDecision };`);
}

function setup(state, actions) {
  class Element {
    constructor(tag = 'div') {
      this.tag = tag; this.children = []; this.hidden = true; this.dataset = {};
      this.classList = { toggle() {}, add() {} };
    }
    set innerHTML(_) { this.children = []; }
    appendChild(child) { this.children.push(child); return child; }
    setAttribute() {}
    addEventListener() {}
    removeEventListener() {}
    scrollIntoView() {}
  }
  const buttons = ['segment', 'full-cut'].map((id) => {
    const button = new Element('button'); button.dataset.choice = id; return button;
  });
  const ui = { review: new Element(), decision: new Element(),
    choicesWrap: { querySelectorAll: () => buttons } };
  const context = { document: { createElement: (tag) => new Element(tag) },
    NS: { games: {}, bus: { emit() {} } },
    setTimeout(fn) { fn(); return 1; }, clearTimeout() {} };
  context.window = context;
  vm.runInNewContext(gameSource(), context);
  context.NS.gameTest.setup({ state, actions }, ui);
  return { game: context.NS.gameTest, buttons, ui };
}

test('a saved containment decision restores its review without scoring twice', () => {
  const state = { reduced: true, decisions: [], score: { containment: 0, ethics: 0, speed: 0 } };
  const actions = {
    addScore(key, amount) { state.score[key] += amount; },
    decide(id, choice) { if (!state.decisions.some((d) => d.id === id)) state.decisions.push({ id, choice }); },
  };
  const first = setup(state, actions);
  first.game.onDecide('segment', first.buttons);
  assert.equal(state.decisions[0].choice, 'segment');
  assert.equal(state.score.containment, 3);

  const resumed = setup(state, actions);
  resumed.game.openDecision();
  assert.equal(resumed.ui.review.hidden, false);
  assert.equal(resumed.buttons[0].disabled, true);
  assert.equal(state.score.containment, 3);
  assert.equal(state.score.ethics, 3);
  assert.equal(state.score.speed, 2);
  assert.equal(state.decisions.length, 1);
});
