/**
 * Tiny DOM builders for the options UI. Each returns an element already wired to
 * an onChange callback; the OptionsMenu connects those to the SettingsStore.
 * No framework — just createElement, kept declarative via these factories.
 */

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

function row(label, sublabel) {
  const r = el('div', 'row');
  const l = el('div', 'label');
  l.textContent = label;
  if (sublabel) {
    const s = el('small');
    s.textContent = sublabel;
    l.appendChild(s);
  }
  const c = el('div', 'control');
  r.append(l, c);
  return { row: r, control: c };
}

export function sectionTitle(text) {
  return el('div', 'section-title', text);
}

export function slider({ label, sublabel, min, max, step, value, format = (v) => v, onChange }) {
  const { row: r, control } = row(label, sublabel);
  const wrap = el('div', 'sl');
  const input = el('input');
  input.type = 'range';
  input.min = min; input.max = max; input.step = step; input.value = value;
  const val = el('span', 'val', format(value));
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    val.textContent = format(v);
    onChange(v);
  });
  wrap.append(input, val);
  control.appendChild(wrap);
  return r;
}

export function toggle({ label, sublabel, value, onChange }) {
  const { row: r, control } = row(label, sublabel);
  const tg = el('div', 'tg' + (value ? ' on' : ''));
  tg.addEventListener('click', () => {
    const next = !tg.classList.contains('on');
    tg.classList.toggle('on', next);
    onChange(next);
  });
  control.appendChild(tg);
  return r;
}

export function segmented({ label, sublabel, options, value, labels, onChange }) {
  const { row: r, control } = row(label, sublabel);
  const seg = el('div', 'seg');
  options.forEach((opt, i) => {
    const b = el('button');
    b.textContent = (labels ? labels[i] : String(opt));
    b.classList.toggle('active', opt === value);
    b.addEventListener('click', () => {
      [...seg.children].forEach((c) => c.classList.remove('active'));
      b.classList.add('active');
      onChange(opt);
    });
    seg.appendChild(b);
  });
  control.appendChild(seg);
  return r;
}

export function select({ label, sublabel, options, value, format = (v) => v, onChange }) {
  const { row: r, control } = row(label, sublabel);
  const sel = el('select', 'sel-box');
  options.forEach((opt) => {
    const o = el('option');
    o.value = String(opt);
    o.textContent = format(opt);
    if (opt === value) o.selected = true;
    sel.appendChild(o);
  });
  sel.addEventListener('change', () => {
    const raw = sel.value;
    const num = Number(raw);
    onChange(Number.isNaN(num) || raw === '' ? raw : num);
  });
  control.appendChild(sel);
  return r;
}

/** Pretty-print a KeyboardEvent.code / synthetic mouse code. */
export function keyLabel(code) {
  if (!code) return '—';
  const map = {
    Space: 'SPACE', Escape: 'ESC', Enter: 'ENTER', Tab: 'TAB', Backspace: 'BACK',
    ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL',
    AltLeft: 'L-ALT', AltRight: 'R-ALT',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    Mouse0: 'MOUSE 1', Mouse1: 'MOUSE 3', Mouse2: 'MOUSE 2',
  };
  if (map[code]) return map[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6);
  return code.toUpperCase();
}

/**
 * A keybind row that captures the next key/mouse press when clicked.
 * onRebind(code) is called with the chosen code; Escape cancels.
 */
export function keybindRow({ label, code, onRebind }) {
  const { row: r, control } = row(label);
  const btn = el('button', 'keybind');
  btn.textContent = keyLabel(code);

  let listening = false;
  const stop = (capturedCode) => {
    listening = false;
    btn.classList.remove('listening');
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('mousedown', onMouse, true);
    if (capturedCode) {
      btn.textContent = keyLabel(capturedCode);
      onRebind(capturedCode);
    } else {
      btn.textContent = keyLabel(code);
    }
  };
  const onKey = (e) => {
    e.preventDefault();
    e.stopPropagation();
    stop(e.code === 'Escape' ? null : e.code);
  };
  const onMouse = (e) => {
    e.preventDefault();
    e.stopPropagation();
    stop(`Mouse${e.button}`);
  };

  btn.addEventListener('click', () => {
    if (listening) return;
    listening = true;
    btn.classList.add('listening');
    btn.textContent = '[ PRESS ]';
    // capture phase + timeout so this click doesn't immediately register as the bind
    setTimeout(() => {
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('mousedown', onMouse, true);
    }, 0);
  });

  control.appendChild(btn);
  return r;
}
