import { createBottomSheet } from './bottom-sheet-v1.js?v=113';
export const CATEGORY_MENUS = [
  { name: '한식', menus: ['국밥', '김치찌개', '냉면'] },
  { name: '중식', menus: ['마라탕', '마라샹궈'] },
  { name: '일식', menus: ['초밥', '라멘', '우동', '돈까스'] },
  { name: '양식', menus: ['파스타', '피자', '햄버거'] },
  { name: '분식', menus: ['떡볶이'] },
  { name: '고기·구이', menus: ['삼겹살', '갈비', '곱창'] },
  { name: '면', menus: ['냉면', '쌀국수', '라멘', '우동'] },
  { name: '국밥·찌개', menus: ['국밥', '김치찌개', '순두부찌개'] },
];
export const GAME_NOTICE = '재미로 고른 메뉴예요, 식당 품질 추천이 아니에요';

export function secureRandomInt(limit, provider = globalThis.crypto) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 0x100000000) throw new Error('올바른 난수 범위가 필요해요.');
  const ceiling = Math.floor(0x100000000 / limit) * limit;
  const sample = new Uint32Array(1);
  do { provider.getRandomValues(sample); } while (sample[0] >= ceiling);
  return sample[0] % limit;
}

export function normalizeOptions(values) {
  return values.map(value => String(value || '').trim().slice(0, 40)).filter(Boolean).slice(0, 8);
}

export function autoCandidates(messages) {
  for (const message of [...messages].reverse()) {
    if (message.role !== 'assistant') continue;
    if (message.meta?.variant === 'hard_reset') return [];
    if (message.meta?.mode === 'A') return normalizeOptions(message.meta.responseModeState?.aCandidates || (message.quickReplies || []).map(reply => reply.split('|')[0]));
    if (message.restaurants?.length) return normalizeOptions(message.restaurants.map(card => card.name));
  }
  return [];
}

export function spinWheel(options, random = secureRandomInt) {
  if (options.length < 2 || options.length > 8 || options.some(value => !String(value).trim())) throw new Error('후보를 2~8개 입력해 주세요.');
  const index = random(options.length);
  return { index, value: options[index], rotation: 1800 + 360 - (index + 0.5) * 360 / options.length };
}

export function makeLadder(count, menus, random = secureRandomInt) {
  if (!Number.isInteger(count) || count < 2 || count > 8 || menus.length !== count || menus.some(value => !String(value).trim())) throw new Error('인원과 같은 수의 메뉴를 2~8개 입력해 주세요.');
  const rows = Array.from({ length: 10 }, () => {
    const bridges = [];
    for (let column = 0; column < count - 1; column += 1) {
      if (random(3) === 0) { bridges.push(column); column += 1; }
    }
    return bridges;
  });
  const paths = Array.from({ length: count }, (_, start) => {
    let column = start;
    const points = [{ column, row: -1 }];
    rows.forEach((bridges, row) => {
      points.push({ column, row });
      if (bridges.includes(column)) column += 1;
      else if (bridges.includes(column - 1)) column -= 1;
      points.push({ column, row });
    });
    points.push({ column, row: rows.length });
    return { person: start + 1, destination: column, menu: menus[column], points };
  });
  return { rows, paths };
}

export function resultMessage(kind, menu, person = null) {
  return `${kind === 'wheel' ? '돌림판' : '사다리게임'} 결과: ${person ? `${person}번 → ` : ''}${menu}\n${GAME_NOTICE}`;
}

export function categoryRequest(menu) {
  if (!CATEGORY_MENUS.some(category => category.menus.includes(menu))) throw new Error('지원하는 메뉴를 선택해 주세요.');
  return { message: `${menu} 먹고 싶어`, freshMenu: true };
}

export function wheelLabel(value, count) {
  const letters = Array.from(String(value).trim());
  const limit = count >= 6 ? 4 : 7;
  return letters.length > limit ? `${letters.slice(0, limit - 1).join('')}…` : letters.join('');
}

export function mountMealTools({ getMessages, isBusy, onSend, onOpen = () => null, source = 'naver' }) {
  const el = (tag, text = '', className = '') => {
    const node = document.createElement(tag); node.textContent = text; node.className = className; return node;
  };
  const button = (text, action, className = 'meal-chip') => {
    const node = el('button', text, className); node.type = 'button'; node.addEventListener('click', action); return node;
  };
  const sheetUI = createBottomSheet({ titleId: 'mealToolsTitle', onClose: () => { cancel(); opener?.focus(); } });
  const dialog = sheetUI.dialog;
  let kind, candidates, count, selected, timer, busy = false, opener;
  let content, result, run, editor, stage;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cancel = () => { clearTimeout(timer); busy = false; };
  const colors = ['#d3e4c6', '#f5d7bd', '#d8d5ee', '#f3d2db', '#bfe0df', '#ece2b2', '#cbd9ef', '#e5d4bf'];
  const send = (message, freshMenu = false) => {
    if (isBusy()) { result.textContent = '현재 답변이 끝나면 다시 눌러 주세요.'; return; }
    dialog.close(); onSend(message, { freshMenu });
  };
  function renderCategories() {
    content.replaceChildren();
    content.append(el('p', '현재 네이버 검색에서 사용하는 음식 분류예요. 지역에 따라 검색 결과가 없을 수 있어요.', 'meal-muted'));
    const chips = el('div', '', 'meal-chips');
    if (source !== 'naver') { content.append(el('p', '현재 데이터 소스의 검색 가능한 분류가 확인되면 표시할게요.')); return; }
    const details = el('div', '', 'meal-chips');
    details.setAttribute('aria-label', '세부 메뉴');
    CATEGORY_MENUS.forEach(category => {
      const chip = button(category.name, () => {
        chips.querySelectorAll('button').forEach(node => node.setAttribute('aria-pressed', String(node === chip)));
        details.replaceChildren(...category.menus.map(menu => button(menu, () => { const request = categoryRequest(menu); send(request.message, request.freshMenu); })));
      });
      chip.setAttribute('aria-pressed', 'false'); chips.append(chip);
    });
    content.append(chips, el('h3', '세부 메뉴'), details);
    chips.firstElementChild?.click();
  }
  function invalidate() {
    selected = null; result.replaceChildren(); stage.replaceChildren();
    if (run) { run.disabled = busy || candidates.length < 2 || candidates.some(value => !value.trim()); sheetUI.setActions(run); }
  }
  function renderEditor() {
    editor.replaceChildren();
    candidates.forEach((value, index) => {
      const row = el('div', '', 'meal-input-row');
      const input = el('input'); input.type = 'text'; input.maxLength = 40; input.value = value;
      input.placeholder = `메뉴 ${index + 1}`; input.setAttribute('aria-label', `${kind === 'wheel' ? '후보' : '메뉴'} ${index + 1}`);
      input.addEventListener('input', () => { candidates[index] = input.value; invalidate(); });
      row.append(input);
      if (kind === 'wheel') {
        const remove = button('삭제', () => { if (busy) return; candidates.splice(index, 1); invalidate(); renderEditor(); });
        remove.disabled = candidates.length <= 2; remove.setAttribute('aria-label', `후보 ${index + 1} 삭제`); row.append(remove);
      } else row.prepend(el('span', `${index + 1}번`, 'meal-muted'));
      editor.append(row);
    });
    if (kind === 'wheel') {
      const add = button('＋ 후보 추가', () => { candidates.push(''); invalidate(); renderEditor(); editor.querySelector('input:last-of-type')?.focus(); });
      add.disabled = candidates.length >= 8; editor.append(add);
    }
    if (run) run.disabled = candidates.length < 2 || candidates.some(value => !value.trim());
  }
  function complete(action, ms) {
    if (reduced()) { action(); return; }
    busy = true; run.disabled = true;
    editor.querySelectorAll('input,button').forEach(node => { node.disabled = true; });
    content.querySelector('select')?.setAttribute('disabled', '');
    timer = setTimeout(() => {
      busy = false; run.disabled = false; content.querySelector('select')?.removeAttribute('disabled');
      renderEditor(); action();
    }, ms);
  }
  function showWheel() {
    const choice = spinWheel(candidates.map(value => value.trim()));
    const wheel = el('div', '', 'meal-wheel'); wheel.setAttribute('aria-hidden', 'true');
    wheel.style.background = `conic-gradient(${candidates.map((_, index) => `${colors[index]} ${index * 100 / candidates.length}% ${(index + 1) * 100 / candidates.length}%`).join(',')})`;
    candidates.forEach((value, index) => {
      const angle = (index + 0.5) * 360 / candidates.length;
      const radians = angle * Math.PI / 180;
      const label = el('span', wheelLabel(value, candidates.length), 'meal-wheel-label');
      label.title = value;
      label.style.left = `${50 + Math.sin(radians) * 31}%`;
      label.style.top = `${50 - Math.cos(radians) * 31}%`;
      label.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
      label.style.fontSize = candidates.length >= 6 ? '11px' : '12px';
      wheel.append(label);
    });
    const shell = el('div', '', 'meal-wheel-shell'); shell.append(wheel, el('span', '▼', 'meal-wheel-pointer'));
    const legend = el('div', '', 'meal-chips');
    candidates.forEach((value, index) => { const label = el('span', `${index + 1}. ${value}`, 'meal-legend'); label.style.borderColor = colors[index]; legend.append(label); });
    stage.replaceChildren(shell, legend);
    if (!reduced()) {
      wheel.animate([{ transform: 'rotate(0deg)' }, { transform: `rotate(${choice.rotation}deg)` }], { duration: 1500, easing: 'cubic-bezier(.15,.7,.2,1)', fill: 'forwards' });
    } else wheel.style.transform = `rotate(${choice.rotation}deg)`;
    complete(() => {
      selected = choice.value;
      result.replaceChildren(el('p', `돌림판 결과: ${choice.value}`, 'meal-result-title'), el('p', GAME_NOTICE, 'meal-muted'));
      sheetUI.setActions(run, button('이 결과로 대화하기', () => send(resultMessage('wheel', selected)), 'primary-action'));
    }, 1500);
  }
  function showLadder() {
    const ladder = makeLadder(count, candidates.map(value => value.trim()));
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${count * 64} 320`); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `${count}명 사다리게임`); svg.style.minWidth = `${count * 56}px`;
    const x = column => 32 + column * 64;
    const y = row => 48 + (row + 1) * 21;
    const line = (x1, y1, x2, y2) => {
      const node = document.createElementNS(svg.namespaceURI, 'line');
      for (const [key, value] of Object.entries({ x1, y1, x2, y2, stroke: '#ccc', 'stroke-width': 2 })) node.setAttribute(key, value);
      svg.append(node);
    };
    for (let column = 0; column < count; column += 1) {
      line(x(column), y(-1), x(column), y(10));
      for (const [label, cy] of [[`${column + 1}번`, 26], [candidates[column], 310]]) {
        const text = document.createElementNS(svg.namespaceURI, 'text'); text.setAttribute('x', x(column)); text.setAttribute('y', cy); text.setAttribute('text-anchor', 'middle'); text.setAttribute('font-size', '10'); text.textContent = label.length > 6 ? `${label.slice(0, 5)}…` : label; svg.append(text);
      }
    }
    ladder.rows.forEach((bridges, row) => bridges.forEach(column => line(x(column), y(row), x(column + 1), y(row))));
    ladder.paths.forEach((path, index) => {
      const trace = document.createElementNS(svg.namespaceURI, 'polyline'); trace.setAttribute('points', path.points.map(point => `${x(point.column)},${y(point.row)}`).join(' '));
      trace.setAttribute('fill', 'none'); trace.setAttribute('stroke', ['#4f7447', '#a45938', '#7060a2', '#9f4967', '#327c7a', '#89731e', '#3f6598', '#866044'][index]); trace.setAttribute('stroke-width', '3'); trace.setAttribute('pathLength', '1');
      if (!reduced()) trace.animate([{ strokeDasharray: '1', strokeDashoffset: '1' }, { strokeDasharray: '1', strokeDashoffset: '0' }], { duration: 1000, fill: 'forwards' });
      svg.append(trace);
    });
    stage.replaceChildren(svg);
    complete(() => {
      result.replaceChildren(el('p', '대화로 이어갈 결과를 선택해 주세요.', 'meal-result-title'), el('p', GAME_NOTICE, 'meal-muted'));
      const choices = el('div', '', 'meal-chips');
      ladder.paths.forEach(path => choices.append(button(`${path.person}번 → ${path.menu}`, () => send(resultMessage('ladder', path.menu, path.person)))));
      result.append(choices);
    }, 1000);
  }
  function open(tool, trigger) {
    if (isBusy()) return;
    cancel(); kind = tool; opener = onOpen(trigger) || document.querySelector('.task-trigger[aria-expanded="true"]') || trigger; selected = null;
    candidates = autoCandidates(getMessages());
    while (candidates.length < 2) candidates.push('');
    count = candidates.length;
    sheetUI.open({ category: '카테고리로 찾기', wheel: '오늘의 메뉴 돌림판', ladder: '함께 고르는 사다리게임' }[kind]);
    content = el('div', '', 'meal-tools-content'); result = el('div', '', 'meal-tools-result'); result.setAttribute('aria-live', 'polite');
    sheetUI.body.append(content, result);
    if (kind === 'category') renderCategories();
    else {
      content.append(el('p', kind === 'wheel' ? '최근 메뉴 후보나 식당 이름을 담았어요. 후보를 2~8개로 바꿀 수 있어요.' : '인원을 정하고 각 칸에 메뉴를 입력하세요. 결과에서 한 사람의 메뉴를 대화로 이어갈 수 있어요.', 'meal-muted'));
      if (kind === 'ladder') {
        const label = el('label', '참여 인원 '); const select = el('select');
        for (let value = 2; value <= 8; value += 1) { const option = el('option', `${value}명`); option.value = value; select.append(option); }
        select.value = count;
        select.addEventListener('change', () => { count = Number(select.value); candidates = Array.from({ length: count }, (_, i) => candidates[i] || ''); invalidate(); renderEditor(); }); label.append(select); content.append(label);
      }
      editor = el('div', '', 'meal-editor'); stage = el('div', '', 'meal-stage');
      run = button(kind === 'wheel' ? '돌림판 돌리기' : '사다리 시작', () => {
        if (busy) return;
        invalidate();
        try { if (kind === 'wheel') showWheel(); else showLadder(); }
        catch (error) { result.textContent = error.message; }
      }, 'primary-action');
      content.append(editor, el('p', GAME_NOTICE, 'meal-muted'), stage);
      sheetUI.setActions(run); renderEditor();
    }
    document.querySelector('#taskMenu')?.classList.remove('open');
    document.querySelectorAll('.task-trigger').forEach(node => node.setAttribute('aria-expanded', 'false'));
  }
  // Plugin sections are re-rendered by filters/search; delegate to keep their tools working.
  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-meal-tool]');
    if (trigger) open(trigger.dataset.mealTool, trigger);
  });
  return { close: () => dialog.close() };
}
