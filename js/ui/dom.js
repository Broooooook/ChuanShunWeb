// 小型 DOM 工具：h() 建立元素、對話框、提示訊息
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
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

// ── 與 Android 版相同的輸入元件 ────────────────────────────────────

/** 可輸入也可下拉選擇的欄位（對應 Android DropdownField）；輸入不存在的名稱會出現「新增 "xxx"」 */
export function comboField(options, value, onChange, onAdd) {
  let cur = value || '';
  const input = h('input', { class: 'input combo-input', value: cur, placeholder: '請輸入或選擇...', autocomplete: 'off' });
  const list = h('div', { class: 'combo-list', hidden: true });
  const wrap = h('div', { class: 'combo' }, h('div', { class: 'combo-row' }, input,
    h('button', { class: 'combo-arrow', type: 'button', tabindex: -1, 'aria-label': '展開', onclick: () => { if (list.hidden) { draw(''); open(); } else close(); } }, '▾')), list);
  const open = () => { list.hidden = false; };
  const close = () => { list.hidden = true; };
  const pick = (v) => { cur = v; input.value = v; onChange(v); close(); };
  function draw(filter) {
    const f = filter.trim().toLowerCase();
    const items = options.filter((o) => !f || o.toLowerCase().includes(f));
    list.replaceChildren(...items.map((o) => h('button', { type: 'button', class: 'combo-item' + (o === cur ? ' on' : ''), onmousedown: (e) => e.preventDefault(), onclick: () => pick(o) }, o)));
    const typed = filter.trim();
    if (onAdd && typed && !options.includes(typed)) {
      list.append(h('button', { type: 'button', class: 'combo-item add', onmousedown: (e) => e.preventDefault(), onclick: () => { onAdd(typed); options = [...options, typed]; pick(typed); } }, `＋ 新增 "${typed}"`));
    }
    if (!list.childElementCount) list.append(h('div', { class: 'combo-empty' }, '沒有符合的項目'));
  }
  input.addEventListener('focus', () => { draw(''); open(); });
  input.addEventListener('input', () => { cur = input.value; onChange(cur); draw(input.value); open(); });
  input.addEventListener('blur', () => setTimeout(close, 150));
  return wrap;
}

/** 核取方塊＋文字 */
export function checkRow(label, checked, onChange, extraClass = '') {
  return h('label', { class: 'check ' + extraClass }, h('input', { type: 'checkbox', checked, onchange: (e) => onChange(e.target.checked) }), h('span', {}, label));
}

/** 橫向計步器（對應 Android RowStepperField）：標籤 − 數字 ＋ */
export function rowStepper(label, value, onChange) {
  return h('div', { class: 'row-stepper' }, h('span', { class: 'rs-label' }, label), stepper(value, onChange));
}

/** 直向計步器（對應 Android StepperField：標籤在上、數字有框） */
export function columnStepper(label, value, onChange) {
  const out = h('span', { class: 'cs-val' }, value);
  const set = (v) => { v = Math.max(0, v); out.textContent = v; onChange(v); };
  return h('div', { class: 'col-stepper' }, h('span', { class: 'cs-label' }, label),
    h('div', { class: 'cs-row' },
      h('button', { class: 'icon-btn small', type: 'button', 'aria-label': '減少', onclick: () => set(Number(out.textContent) - 1) }, '−'), out,
      h('button', { class: 'icon-btn small', type: 'button', 'aria-label': '增加', onclick: () => set(Number(out.textContent) + 1) }, '＋')));
}

/** 頁首標題列（對應 Android TopAppBar） */
export function appBar(title, ...actions) {
  return h('header', { class: 'appbar' }, h('h1', {}, title), h('div', { class: 'appbar-actions' }, actions));
}

/** 可摺疊區塊（對應 Android SettingSection） */
export function section(title, open, ...content) {
  return h('details', { class: 'card section', open }, h('summary', {}, h('span', {}, title)), h('div', { class: 'section-body' }, content));
}

/** 選項文字顏色（#FFFFFF／#000000 視為未設定） */
export function optionColor(state, key, name, fallback = '') {
  const c = (state.settings[key] || []).find((o) => o.name === name)?.colorHex;
  return c && !/^#?(ffffff)$/i.test(c) ? c : fallback;
}

/** 時間輸入：只收 4 位數字，顯示為 HH:mm（對應 Android TimeVisualTransformation） */
export function timeInput(value, onInput, placeholder = 'HH:mm') {
  const fmt = (d) => (d.length > 2 ? d.slice(0, 2) + ':' + d.slice(2) : d);
  const el = h('input', { class: 'input', inputmode: 'numeric', placeholder, value: fmt(value || '') });
  el.addEventListener('input', () => {
    const d = el.value.replace(/\D/g, '').slice(0, 4);
    el.value = fmt(d); onInput(d);
    if (d.length === 4) { const next = el.closest('.form')?.querySelectorAll('input')?.[[...el.closest('.form').querySelectorAll('input')].indexOf(el) + 1]; if (next && next.type !== 'checkbox') next.focus(); }
  });
  return el;
}
