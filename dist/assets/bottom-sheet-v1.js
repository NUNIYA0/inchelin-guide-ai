// Shared native-modal sheet: native focus trapping plus explicit dismissal/restore.
export function createBottomSheet({ titleId, onClose = () => {} }) {
  const el = (tag, className = '') => {
    const node = document.createElement(tag); node.className = className; return node;
  };
  const dialog = el('dialog', 'meal-tools-dialog bottom-sheet');
  dialog.setAttribute('aria-labelledby', titleId);
  const handle = el('div', 'sheet-handle'); handle.setAttribute('aria-hidden', 'true');
  const header = el('header', 'sheet-header');
  const title = el('h2'); title.id = titleId;
  const close = el('button', 'sheet-close'); close.type = 'button'; close.setAttribute('aria-label', '닫기');
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M6 6l12 12M18 6L6 18'); path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '2'); path.setAttribute('stroke-linecap', 'round');
  icon.append(path); close.append(icon);
  const body = el('div', 'sheet-body'), footer = el('div', 'sheet-footer');
  header.append(title, close); dialog.append(handle, header, body, footer); document.body.append(dialog);
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', event => { event.preventDefault?.(); dialog.close(); });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect?.();
    if (!rect || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', onClose);
  return {
    dialog, body, footer,
    open(text) { title.textContent = text; body.replaceChildren(); footer.replaceChildren(); if (!dialog.open) dialog.showModal(); },
    setActions(...actions) { footer.replaceChildren(...actions); }
  };
}
