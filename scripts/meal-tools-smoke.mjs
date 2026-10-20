import assert from 'node:assert/strict';
import { mountMealTools, GAME_NOTICE } from '../dist/assets/meal-tools-v1.js';

// Minimal DOM fixture: tests local UI event handlers without a browser or API.
export function testMealToolsUI() {
  const original = { document: globalThis.document, matchMedia: globalThis.matchMedia, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  const animations = [], timers = new Map(), sent = [];
  let reduced = true, serial = 0;
  class Node {
    constructor(tag) { this.tag = tag; this.children = []; this.style = {}; this.attributes = {}; this.listeners = {}; this.dataset = {}; this.disabled = false; this.className = ''; this.value = ''; }
    set textContent(value) { this.text = value; this.children = []; }
    get textContent() { return this.text + this.children.map(child => child.textContent).join(' '); }
    append(...nodes) { this.children.push(...nodes); }
    prepend(...nodes) { this.children.unshift(...nodes); }
    replaceChildren(...nodes) { this.text = ''; this.children = nodes; }
    get firstElementChild() { return this.children[0]; }
    setAttribute(key, value) { this.attributes[key] = value; if (key === 'disabled') this.disabled = true; }
    removeAttribute(key) { delete this.attributes[key]; if (key === 'disabled') this.disabled = false; }
    get classList() { return { remove() {}, add() {} }; }
    addEventListener(event, callback) { (this.listeners[event] ||= []).push(callback); }
    emit(event) { for (const callback of this.listeners[event] || []) callback({ target: this }); }
    click() { if (!this.disabled) this.emit('click'); }
    focus() {}
    showModal() { this.open = true; }
    close() { this.open = false; this.emit('close'); }
    animate(...args) { animations.push(args); }
    querySelectorAll(selector) {
      const tags = selector.replace(':last-of-type', '').split(',');
      return this.children.flatMap(child => [...(tags.includes(child.tag) ? [child] : []), ...child.querySelectorAll(selector)]);
    }
    querySelector(selector) { const nodes = this.querySelectorAll(selector); return selector.includes(':last-of-type') ? nodes.at(-1) : nodes[0]; }
  }
  const body = new Node('body'), taskMenu = new Node('div'), plus = new Node('button');
  const triggers = ['category', 'wheel', 'ladder'].map(tool => { const node = new Node('button'); node.dataset.mealTool = tool; return node; });
  const createElement = tag => { const node = new Node(tag); node.text = ''; return node; };
  const byText = (root, text) => root.querySelectorAll('button').find(node => node.textContent === text);
  try {
    globalThis.document = { body, createElement, createElementNS(namespace, tag) { const node = createElement(tag); node.namespaceURI = namespace; return node; }, querySelectorAll(selector) { return selector === '[data-meal-tool]' ? triggers : [plus]; }, querySelector(selector) { return selector === '#taskMenu' ? taskMenu : plus; } };
    globalThis.matchMedia = () => ({ matches: reduced });
    globalThis.setTimeout = callback => { timers.set(++serial, callback); return serial; };
    globalThis.clearTimeout = id => timers.delete(id);
    mountMealTools({ getMessages: () => [{ role: 'assistant', meta: { mode: 'A', responseModeState: { aCandidates: ['냉면', '국밥', '피자'] } } }], isBusy: () => false, onSend: (...args) => sent.push(args) });
    const dialog = body.children[0];
    triggers[0].click();
    byText(dialog, '중식').click();
    byText(dialog, '마라탕').click();
    assert.deepEqual(sent.pop(), ['마라탕 먹고 싶어', { freshMenu: true }]);
    assert.equal(dialog.open, false);
    triggers[1].click();
    assert.equal(dialog.querySelectorAll('input').length, 3);
    byText(dialog, '삭제').click();
    assert.equal(dialog.querySelectorAll('input').length, 2);
    assert.ok(dialog.querySelectorAll('button').filter(node => node.textContent === '삭제').every(node => node.disabled));
    for (let i = 2; i < 8; i += 1) byText(dialog, '＋ 후보 추가').click();
    assert.equal(dialog.querySelectorAll('input').length, 8);
    assert.equal(byText(dialog, '＋ 후보 추가').disabled, true);
    byText(dialog, '돌림판 돌리기').click();
    assert.ok(dialog.textContent.includes('후보를 2~8개 입력해 주세요.'));
    dialog.querySelectorAll('input').forEach((input, i) => { input.value = `메뉴${i}`; input.emit('input'); });
    byText(dialog, '돌림판 돌리기').click();
    assert.ok(dialog.textContent.includes('돌림판 결과:'));
    assert.ok(dialog.textContent.includes(GAME_NOTICE));
    assert.equal(animations.length, 0);
    assert.equal(timers.size, 0, 'reduced motion must complete immediately');
    byText(dialog, '이 결과로 대화하기').click();
    assert.match(sent.at(-1)[0], /^돌림판 결과: 메뉴\d/);
    triggers[2].click();
    const count = dialog.querySelector('select'); count.value = '8'; count.emit('change');
    assert.equal(dialog.querySelectorAll('input').length, 8);
    dialog.querySelectorAll('input').forEach((input, i) => { input.value = `메뉴${i}`; input.emit('input'); });
    byText(dialog, '사다리 시작').click();
    assert.equal(dialog.querySelectorAll('button').filter(node => /번 →/.test(node.textContent)).length, 8);
    assert.ok(dialog.textContent.includes(GAME_NOTICE));
    dialog.querySelectorAll('button').find(node => /^1번 →/.test(node.textContent)).click();
    assert.match(sent.at(-1)[0], /^사다리게임 결과: 1번 → 메뉴\d/);
    reduced = false;
    triggers[1].click(); byText(dialog, '돌림판 돌리기').click();
    assert.equal(byText(dialog, '돌림판 돌리기').disabled, true);
    assert.equal(animations.length, 1);
    assert.equal(timers.size, 1);
    dialog.close();
    assert.equal(timers.size, 0, 'closing a game must cancel delayed results');
  } finally {
    for (const [name, value] of Object.entries(original)) { if (value === undefined) delete globalThis[name]; else globalThis[name] = value; }
  }
}
