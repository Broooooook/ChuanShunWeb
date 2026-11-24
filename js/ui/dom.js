// 小型 DOM 工具：h() 建立元素、對話框、提示訊息
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && k !== 'list' && k !== 'type') { try { el[k] = v; } catch { el.setAttribute(k, v); } }
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function toast(msg, ms = 2600) {
  const t = h('div', { class: 'toast' }, msg);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
}

/**
 * 開啟對話框。buttons: [{label, kind:'primary'|'danger'|'', onClick(close) → 回傳 false 可阻止關閉}]
 * 回傳 close()
 */
export function openDialog({ title, body, buttons = [], wide = false, onClose }) {
  const close = () => { dlg.close(); dlg.remove(); onClose?.(); };
  const footer = h('div', { class: 'dlg-actions' }, buttons.map((b) =>
    h('button', { class: 'btn ' + (b.kind || ''), type: 'button', onclick: async () => { const r = await b.onClick?.(close); if (r !== false) close(); } }, b.label)));
  const dlg = h('dialog', { class: 'dlg' + (wide ? ' wide' : '') },
    h('div', { class: 'dlg-head' }, h('h2', {}, title), h('button', { class: 'icon-btn', type: 'button', 'aria-label': '關閉', onclick: close }, '✕')),
    h('div', { class: 'dlg-body' }, body),
    buttons.length ? footer : null);
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  document.body.append(dlg);
  dlg.showModal();
  return close;
}

export function confirmDialog(title, message, { okLabel = '確定', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    openDialog({
      title, body: h('div', {}, Array.isArray(message) ? message.map((m) => h('p', {}, m)) : h('p', {}, message)),
      buttons: [
        { label: '取消', onClick: () => { done = true; resolve(false); } },
        { label: okLabel, kind: danger ? 'danger' : 'primary', onClick: () => { done = true; resolve(true); } },
      ],
      onClose: () => { if (!done) resolve(false); },
    });
  });
}

export function promptDialog(title, { label = '', value = '', inputmode = 'text', placeholder = '' } = {}) {
  return new Promise((resolve) => {
    const input = h('input', { class: 'input', value, inputmode, placeholder });
    let done = false;
    openDialog({
      title, body: h('label', { class: 'field' }, label ? h('span', {}, label) : null, input),
      buttons: [
        { label: '取消', onClick: () => { done = true; resolve(null); } },
        { label: '確定', kind: 'primary', onClick: () => { done = true; resolve(input.value); } },
      ],
      onClose: () => { if (!done) resolve(null); },
    });
    setTimeout(() => input.focus(), 50);
  });
}

export function stepper(value, onChange, { min = 0, max = 99 } = {}) {
  const out = h('span', { class: 'step-val' }, value);
  const set = (v) => { v = Math.max(min, Math.min(max, v)); out.textContent = v; onChange(v); };
  return h('span', { class: 'stepper' },
    h('button', { class: 'step-btn', type: 'button', 'aria-label': '減少', onclick: () => set(Number(out.textContent) - 1) }, '−'),
    out,
    h('button', { class: 'step-btn', type: 'button', 'aria-label': '增加', onclick: () => set(Number(out.textContent) + 1) }, '+'));
}

export const money = (v) => 'NT$ ' + Math.round(v || 0).toLocaleString('en-US');

/** 下拉選單＋「新增…」；options 為名稱陣列 */
export function selectWithAdd(options, value, onChange, onAdd) {
  const sel = h('select', { class: 'input' },
    h('option', { value: '' }, '（未選）'),
    options.map((o) => h('option', { value: o, selected: o === value }, o)),
    value && !options.includes(value) ? h('option', { value, selected: true }, value) : null,
    onAdd ? h('option', { value: '__add__' }, '＋ 新增…') : null);
  let last = value || '';
  sel.addEventListener('change', async () => {
    if (sel.value === '__add__') {
      const name = (await promptDialog('新增選項', { label: '名稱' }) || '').trim();
      if (name) {
        onAdd(name);
        sel.insertBefore(h('option', { value: name }, name), sel.lastElementChild);
        sel.value = name; last = name; onChange(name);
      } else sel.value = last;
    } else { last = sel.value; onChange(sel.value); }
  });
  return sel;
}
