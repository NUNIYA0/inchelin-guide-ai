import { createBottomSheet } from './bottom-sheet-v1.js?v=113';
// These tools collect messages/slots only. Response modes stay in the existing pipeline.
export const PLUGIN_IDS = [1, 2, 3, 4, 5];
// Naver local search supports these region queries; availability still depends on the menu.
export const NAVER_REGIONS = ['강남역', '역삼', '홍대'];
export const SITUATIONS = ['혼밥', '회식', '데이트', '가족 모임', '접대·비즈니스', '주차 필요', '단체석'];
export const NO_COMPARE = '먼저 식당을 찾아야 비교할 수 있어요. 지역과 메뉴를 알려주세요';
export function readPins(storage) {
  try {
    const values = JSON.parse(storage.getItem('insight-ai-pins') || '[]');
    return Array.isArray(values) ? [...new Set(values.filter(id => PLUGIN_IDS.includes(id)))] : [];
  } catch (_) { return []; }
}
export function persistPins(storage, pins) {
  try { storage.setItem('insight-ai-pins', JSON.stringify(pins)); return true; }
  catch (_) { return false; }
}
export function situationSlots(values) {
  const selected = SITUATIONS.filter(value => values.includes(value));
  return {
    companion: selected.filter(value => !['주차 필요', '단체석'].includes(value)).join(' · ') || null,
    parking: selected.includes('주차 필요') ? true : null,
    other: selected.filter(value => ['접대·비즈니스', '단체석'].includes(value))
  };
}
export function situationRequest(values) {
  const phrases = {
    '혼밥': '혼자 먹기 좋은 곳', '회식': '회식하기 좋은 곳', '데이트': '데이트하기 좋은 곳',
    '가족 모임': '가족 모임하기 좋은 곳', '접대·비즈니스': '접대·비즈니스에 맞는 곳',
    '주차 필요': '주차 필요한 곳', '단체석': '단체석이 필요한 곳'
  };
  return SITUATIONS.filter(value => values.includes(value)).map(value => phrases[value]).join(', ') + '으로 찾아줘';
}
export function latestCards(messages) {
  const state = [...messages].reverse().find(message => message.role === 'assistant' && message.meta?.responseModeState)?.meta.responseModeState;
  if (state) return (state.lastCards || []).slice(0, 3);
  return ([...messages].reverse().find(message => message.role === 'assistant' && message.restaurants?.length)?.restaurants || []).slice(0, 3);
}
export function selectedComparison(cards, indexes) {
  const selected = [...new Set(indexes)].map(index => cards[index]).filter(Boolean);
  if (selected.length < 2 || selected.length > 3) throw new Error('비교할 식당을 2~3개 골라주세요.');
  return { message: selected.map(card => card.name).join('랑 ') + ' 비교해줘', cards: selected };
}
export function validRegion(value) {
  return typeof value === 'string' && /^[가-힣a-zA-Z0-9·.\s-]{2,40}$/.test(value.trim()) && !/찾아줘|추천해줘|알려줘|먹을 곳|갈만한/.test(value);
}
export function mountPluginActions({ getMessages, getSlots, send, reply, setRegion, setSituations, locate, isBusy, onOpen, storage, onPins, source = 'naver' }) {
  let pins = readPins(storage), opener;
  const el = (tag, text = '', className = '') => {
    const node = document.createElement(tag); node.textContent = text; node.className = className; return node;
  };
  const button = (text, action) => {
    const node = el('button', text, 'meal-chip'); node.type = 'button';
    node.addEventListener('click', action); return node;
  };
  const sheetUI = createBottomSheet({ titleId: 'pluginActionTitle', onClose: () => opener?.focus() });
  const dialog = sheetUI.dialog;
  function sheet(title) {
    sheetUI.open(title);
    return sheetUI.body;
  }
  const blocked = () => isBusy();
  function finishRegion(value) {
    if (blocked()) return;
    if (!validRegion(value)) return;
    dialog.close(); setRegion(value.trim());
  }
  function regions() {
    const view = sheet('어느 지역에서 찾을까요?');
    const manual = el('form', '', 'meal-input-row');
    const input = el('input'); input.type = 'text'; input.maxLength = 40; input.placeholder = '동네나 역 이름을 입력해 주세요';
    input.setAttribute('aria-label', '찾을 지역');
    const error = el('p', '', 'meal-muted'); error.setAttribute('role', 'status');
    const submit = () => {
      if (!validRegion(input.value)) { error.textContent = '동네나 역 이름을 2~40자로 입력해 주세요.'; return; }
      finishRegion(input.value);
    };
    manual.addEventListener('submit', event => { event.preventDefault(); submit(); });
    const find = button('이 지역으로 찾기', submit); find.className = 'primary-action'; find.disabled = true;
    let selectedRegion = '';
    input.addEventListener('input', () => { selectedRegion = input.value.trim(); find.disabled = !validRegion(selectedRegion); });
    const location = button('현재 위치 연결', () => { if (blocked()) return; dialog.close(); locate(); }); location.className = 'primary-action';
    manual.append(input);
    view.append(location, manual, error);
    sheetUI.setActions(find);
    if (source === 'naver') {
      view.append(el('p', '자주 찾는 지역이에요. 메뉴에 따라 검색 결과가 없을 수 있어요.', 'meal-muted'));
      const chips = el('div', '', 'meal-chips');
      NAVER_REGIONS.forEach(region => {
        const chip = button(region, () => {
          selectedRegion = region; input.value = region; find.disabled = false;
          chips.querySelectorAll('button').forEach(node => node.setAttribute('aria-pressed', String(node === chip)));
        });
        chip.setAttribute('aria-pressed', 'false'); chips.append(chip);
      });
      view.append(chips);
    }
  }
  function situations() {
    const view = sheet('어떤 상황인가요?');
    const slots = getSlots();
    const selected = new Set(SITUATIONS.filter(value => (slots.companion || '').includes(value) || (slots.other || []).includes(value) || (value === '주차 필요' && slots.parking)));
    view.append(el('p', '여러 조건을 함께 골라도 돼요.', 'meal-muted'));
    const complete = button('선택 완료', () => {
      if (blocked() || !selected.size) return;
      dialog.close(); setSituations(situationSlots([...selected]), situationRequest([...selected]));
    }); complete.className = 'primary-action'; complete.disabled = !selected.size;
    for (const [title, values] of [['누구와', SITUATIONS.slice(0, 5)], ['조건', SITUATIONS.slice(5)]]) {
      const chips = el('div', '', 'meal-chips');
      view.append(el('h3', title), chips);
      values.forEach(value => {
      const chip = button(value, () => {
        if (selected.has(value)) selected.delete(value); else selected.add(value);
        chip.setAttribute('aria-pressed', String(selected.has(value)));
        complete.disabled = !selected.size;
      });
      chip.setAttribute('aria-pressed', String(selected.has(value))); chips.append(chip);
      });
    }
    sheetUI.setActions(complete);
  }
  function compare() {
    const cards = latestCards(getMessages());
    if (cards.length < 2) {
      reply(NO_COMPARE, ['지역별 찾기']);
      const view = sheet('비교할 식당을 먼저 찾아볼까요?');
      view.append(el('p', NO_COMPARE), button('지역별 찾기', regions)); return;
    }
    const view = sheet('비교할 식당을 2~3개 골라주세요');
    const selected = new Set();
    const counter = el('p', '0/3 선택', 'meal-muted'); counter.setAttribute('role', 'status'); view.append(counter);
    const confirm = button('선택한 식당 비교', () => {
      if (blocked() || selected.size < 2) return;
      const result = selectedComparison(cards, [...selected].sort((a, b) => a - b));
      dialog.close(); send(result.message, { compareCards: result.cards });
    }); confirm.className = 'primary-action'; confirm.disabled = true;
    cards.forEach((card, index) => {
      const label = el('label', '', 'plugin-compare-row');
      const check = el('input'); check.type = 'checkbox';
      check.addEventListener('change', () => {
        if (check.checked) selected.add(index); else selected.delete(index);
        counter.textContent = selected.size + '/3 선택'; confirm.disabled = selected.size < 2;
      });
      const text = el('span', '', 'plugin-text'); text.append(el('strong', card.name), el('span', card.address || '주소 정보가 없어요', 'meal-muted'));
      label.append(check, text); view.append(label);
    });
    sheetUI.setActions(confirm);
  }
  async function run(id, trigger) {
    if (!PLUGIN_IDS.includes(id) || blocked()) return;
    opener = trigger || document.activeElement;
    onOpen();
    if (id === 1) send('오늘 뭐 먹을지 같이 골라줘', { freshMenu: true });
    if (id === 2) situations();
    if (id === 3) regions();
    if (id === 4) compare();
    if (id === 5) send('추천은 어떤 기준으로 하나요?');
  }
  function togglePin(id) {
    if (!PLUGIN_IDS.includes(id)) return;
    pins = pins.includes(id) ? pins.filter(value => value !== id) : [...pins, id];
    const saved = persistPins(storage, pins);
    onPins([...pins], saved);
  }
  onPins([...pins], persistPins(storage, pins));
  return { run, togglePin, getPins: () => [...pins], dialog };
}
