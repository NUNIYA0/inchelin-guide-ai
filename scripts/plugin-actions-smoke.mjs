import assert from 'node:assert/strict';
import { mountPluginActions, readPins, persistPins, situationSlots, latestCards, selectedComparison, validRegion, NO_COMPARE } from '../dist/assets/plugin-actions-v1.js';

// DOM fixture exercises the same sheet/button handlers as the frontend, without APIs.
export async function testPluginActionsUI() {
  const previous = globalThis.document;
  class Node {
    constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.attributes = {}; this.value = ''; }
    set textContent(value) { this.text = value; this.children = []; }
    get textContent() { return (this.text || '') + this.children.map(child => child.textContent).join(' '); }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.text = ''; this.children = nodes; }
    addEventListener(event, action) { this.listeners[event] = action; }
    setAttribute(key, value) { this.attributes[key] = value; }
    emit(event) { this.listeners[event]?.({ target: this, preventDefault() {} }); }
    click() { this.emit('click'); }
    focus() { this.focused = true; }
    showModal() { this.open = true; }
    close() { this.open = false; this.emit('close'); }
  }
  const body = new Node('body'), opener = new Node('button');
  const nodes = root => [root, ...root.children.flatMap(nodes)];
  const byText = (dialog, text) => nodes(dialog).find(node => node.tag === 'button' && node.textContent === text);
  let stored = JSON.stringify([1, 6, 1, 999]);
  const storage = { getItem: () => stored, setItem: (key, value) => { assert.equal(key, 'insight-ai-pins'); stored = value; } };
  assert.deepEqual(readPins(storage), [1]);
  assert.deepEqual(readPins({ getItem() { throw new Error('blocked'); } }), []);
  assert.deepEqual(readPins({ getItem: () => '{broken' }), []);
  assert.deepEqual(readPins({ getItem: () => '{}' }), []);
  assert.equal(persistPins({ setItem() { throw new Error('quota'); } }, [1]), false);
  assert.equal(validRegion('역삼'), true);
  assert.equal(validRegion('찾아줘'), false);
  assert.equal(validRegion('<script>'), false);
  assert.equal(validRegion(''), false);
  const sent = [], replies = [], regions = [], situations = [], pins = [];
  let messages = [], slots = {}, busy = false, located = 0, opened = 0, faqCalls = 0;
  try {
    globalThis.document = { body, activeElement: opener, createElement: tag => new Node(tag) };
    const options = {
      getMessages: () => messages, getSlots: () => slots, isBusy: () => busy,
      send: (...args) => sent.push(args), reply: (...args) => replies.push(args),
      setRegion: (...args) => regions.push(args), setSituations: (...args) => situations.push(args),
      locate: () => located++, faq: async () => { faqCalls++; return 'FAQ 고정 문구'; },
      onOpen: () => opened++, storage, onPins: (values, saved) => pins.push({ values, saved })
    };
    const actions = mountPluginActions(options);
    const dialog = actions.dialog;
    await actions.run(1);
    assert.deepEqual(sent.pop(), ['오늘 뭐 먹을지 같이 골라줘', { freshMenu: true }]);
    await actions.run(3);
    byText(dialog, '지역 직접 입력').click();
    const input = nodes(dialog).find(node => node.tag === 'input');
    assert.equal(input.focused, true);
    input.value = '찾아줘'; byText(dialog, '지역 선택 완료').click();
    assert.equal(regions.length, 0);
    input.value = '부산 서면'; byText(dialog, '지역 선택 완료').click();
    assert.deepEqual(regions.pop(), ['부산 서면']);
    await actions.run(3); byText(dialog, '역삼').click();
    assert.deepEqual(regions.pop(), ['역삼']);
    await actions.run(3); byText(dialog, '현재 위치 연결').click();
    assert.equal(located, 1);
    await actions.run(2); byText(dialog, '선택 완료').click();
    assert.equal(situations.length, 0, 'empty situations do not submit');
    for (const value of ['혼밥', '주차 필요', '단체석']) byText(dialog, value).click();
    assert.equal(byText(dialog, '주차 필요').attributes['aria-pressed'], 'true');
    byText(dialog, '선택 완료').click();
    assert.deepEqual(situations.pop()[0], { companion: '혼밥', parking: true, other: ['단체석'] });
    assert.deepEqual(situationSlots(['회식', '가족 모임', '접대·비즈니스']), { companion: '회식 · 가족 모임 · 접대·비즈니스', parking: null, other: ['접대·비즈니스'] });
    slots = { companion: '데이트', parking: true, other: [] };
    await actions.run(2);
    assert.equal(byText(dialog, '데이트').attributes['aria-pressed'], 'true');
    assert.equal(byText(dialog, '주차 필요').attributes['aria-pressed'], 'true');
    await actions.run(4);
    assert.deepEqual(replies.pop(), [NO_COMPARE, ['지역별 찾기']]);
    byText(dialog, '지역별 찾기').click();
    assert.ok(byText(dialog, '강남역'));
    const cards = [{ id: 'a', name: '가게A' }, { id: 'b', name: '가게B' }, { id: 'c', name: '가게C' }];
    messages = [{ role: 'assistant', restaurants: cards, meta: { responseModeState: { lastCards: cards } } }];
    await actions.run(4);
    byText(dialog, '선택한 식당 비교').click();
    assert.equal(sent.length, 0);
    const checks = nodes(dialog).filter(node => node.tag === 'input');
    for (const index of [0, 2]) { checks[index].checked = true; checks[index].emit('change'); }
    byText(dialog, '선택한 식당 비교').click();
    assert.deepEqual(sent.pop(), ['(가게A)랑 (가게C) 비교해줘', { compareCards: [cards[0], cards[2]] }]);
    assert.throws(() => selectedComparison(cards, [0]));
    messages.push({ role: 'assistant', meta: { responseModeState: { lastCards: [] } } });
    assert.deepEqual(latestCards(messages), [], 'reset/region selection cannot resurrect stale cards');
    await actions.run(5);
    assert.equal(faqCalls, 1);
    assert.deepEqual(replies.pop(), ['FAQ 고정 문구', [], '추천 기준·데이터 안내']);
    actions.togglePin(3);
    assert.deepEqual(actions.getPins(), [1, 3]);
    assert.deepEqual(readPins(storage), [1, 3]);
    actions.togglePin(1);
    assert.deepEqual(readPins(storage), [3]);
    actions.togglePin(6);
    assert.deepEqual(actions.getPins(), [3]);
    const reloaded = mountPluginActions(options);
    assert.deepEqual(reloaded.getPins(), [3], 'pins survive remount/reload');
    const unavailableStorage = mountPluginActions({ ...options, storage: undefined });
    unavailableStorage.togglePin(2);
    assert.deepEqual(unavailableStorage.getPins(), [2]);
    assert.equal(pins.at(-1).saved, false);
    busy = true;
    const before = opened;
    await actions.run(1);
    assert.equal(opened, before);
    assert.equal(sent.length, 0);
    busy = false;
    const badFaq = mountPluginActions({ ...options, faq: async () => { throw new Error('offline'); } });
    await badFaq.run(5);
    assert.match(replies.at(-1)[0], /불러오지 못했어요/);
  } finally { globalThis.document = previous; }
}
