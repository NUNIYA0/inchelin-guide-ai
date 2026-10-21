import { createBottomSheet } from './bottom-sheet-v1.js?v=113';
import { SEARCH_FOODS, SEARCH_REGIONS, searchMessage, validSearchRegion } from './search-axes-data-v1.js';

// Shared two-axis controls for plugin sheets and result-condition editing, not the home screen.
export function mountSearchPicker({ home, getSlots, send, locate, isBusy, onOpen = () => {} }) {
  const el = (tag, text = '', className = '') => { const node = document.createElement(tag); node.textContent = text; node.className = className; return node; };
  const button = (label, action, cls = 'meal-chip') => { const node = el('button', label, cls); node.type = 'button'; node.addEventListener('click', action); return node; };
  const sheet = createBottomSheet({ titleId: 'searchPickerTitle' });
  function mount(root, initial = {}, axis = null, close = () => {}) {
    let food = initial.menu || initial.food_type || '', region = initial.region || '', current = initial.use_current_location === true, selectedCategory;
    const foodGroup = el('section', '', 'axis-group'), regionGroup = el('section', '', 'axis-group');
    const foods = el('div', '', 'meal-chips'), details = el('div', '', 'meal-chips axis-details');
    foods.setAttribute('aria-label', '음식 종류'); details.setAttribute('aria-label', '세부 메뉴');
    const regions = el('div', '', 'meal-chips'); regions.setAttribute('aria-label', '지역');
    const summary = el('p', '', 'meal-muted'); summary.setAttribute('role', 'status');
    const input = el('input'); input.type = 'text'; input.maxLength = 40; input.placeholder = '동네나 역 이름을 직접 입력해 주세요'; input.setAttribute('aria-label', '지역 직접 입력');
    const submit = () => {
      if (isBusy() || !food || !(current || validSearchRegion(region))) return;
      close(); const message = searchMessage({ food, region, current });
      if (current) locate(message); else send(message);
    };
    const find = button('찾기', submit, 'primary-action');
    const partial = button('한 가지만 정하고 이어가기', () => {
      if (isBusy() || Boolean(food) === Boolean(current || validSearchRegion(region)) || (!current && region && !validSearchRegion(region))) return;
      close(); const message = searchMessage({ food, region, current }); if (current) locate(message); else send(message);
    }, 'axis-continue');
    function update() {
      find.disabled = !food || !(current || validSearchRegion(region));
      partial.hidden = Boolean(food) === Boolean(current || validSearchRegion(region));
      summary.textContent = [current ? '현재 위치' : region, food].filter(Boolean).join(' · ') || '음식과 지역을 골라보세요.';
      foods.querySelectorAll('button').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.value === selectedCategory?.value || node.dataset.value === food)));
      regions.querySelectorAll('button').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.value === (current ? '현재 위치' : region))));
    }
    SEARCH_FOODS.forEach(category => {
      const node = button(category.name, () => {
        selectedCategory = category; food = category.value;
        details.replaceChildren(...category.menus.map(menu => {
          const choice = button(menu, () => { food = menu; details.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === choice))); update(); });
          return choice;
        })); update();
      }); node.dataset.value = category.value; foods.append(node);
    });
    SEARCH_REGIONS.forEach(value => { const node = button(value, () => { region = value; current = false; input.value = value; update(); }); node.dataset.value = value; regions.append(node); });
    const location = button('현재 위치', () => { current = true; region = ''; input.value = ''; update(); }); location.dataset.value = '현재 위치';
    const manual = button('직접 입력', () => { input.hidden = false; input.focus(); });
    regions.append(location, manual); input.hidden = true;
    input.addEventListener('input', () => { region = input.value.trim(); current = false; update(); });
    input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); submit(); } });
    foodGroup.append(el('h3', '1. 음식 종류'), foods, details); regionGroup.append(el('h3', '2. 지역'), regions, input);
    if (axis !== 'region') root.append(foodGroup);
    if (axis !== 'food') root.append(regionGroup);
    root.append(summary);
    const actions = el('div', '', 'axis-actions'); actions.append(find, partial);
    if (root === sheet.body) sheet.setActions(actions); else root.append(actions);
    update(); return { find, partial, input };
  }
  if (home) mount(home);
  return {
    open(axis = null) {
      if (isBusy()) return;
      onOpen(); sheet.open(axis === 'region' ? '지역 바꾸기' : axis === 'food' ? '음식 바꾸기' : '음식과 지역으로 찾기');
      const slots = getSlots();
      // Only the selected axis is editable; preserve the other axis and all preferences.
      mount(sheet.body, slots, axis, () => sheet.dialog.close());
    }, dialog: sheet.dialog,
  };
}
