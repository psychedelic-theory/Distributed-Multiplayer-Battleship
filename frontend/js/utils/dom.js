// ==========================================================================
// DOM helpers — tiny hyperscript
// ==========================================================================

/**
 * h(tag, props?, ...children)
 * Creates a DOM element. Props:
 *   - class / className: string
 *   - on{Event}: event handler (e.g. onClick)
 *   - style: object or string
 *   - dataset: object
 *   - attrs: object of raw attributes
 *   - anything else: set as property on the element
 * Children may be: strings, numbers, Nodes, arrays, null/undefined/false (ignored).
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) applyProps(el, props);
  appendChildren(el, children);
  return el;
}

function applyProps(el, props) {
  for (const key in props) {
    const val = props[key];
    if (val === null || val === undefined || val === false) continue;

    if (key === 'class' || key === 'className') {
      el.className = Array.isArray(val) ? val.filter(Boolean).join(' ') : String(val);
    } else if (key === 'style') {
      if (typeof val === 'string') el.style.cssText = val;
      else Object.assign(el.style, val);
    } else if (key === 'dataset') {
      Object.assign(el.dataset, val);
    } else if (key === 'attrs') {
      for (const ak in val) el.setAttribute(ak, val[ak]);
    } else if (key.startsWith('on') && typeof val === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), val);
    } else if (key === 'html') {
      el.innerHTML = val;
    } else if (key === 'ref' && typeof val === 'function') {
      val(el);
    } else {
      try { el[key] = val; }
      catch { el.setAttribute(key, String(val)); }
    }
  }
}

function appendChildren(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === true) continue;
    if (child instanceof Node) el.appendChild(child);
    else el.appendChild(document.createTextNode(String(child)));
  }
}

/** Replace mountEl's children with `node`. Safe for nulls. */
export function mount(mountEl, node) {
  clear(mountEl);
  if (node) mountEl.appendChild(node);
}

/** Remove all children. */
export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Short querySelector. */
export function $(selector, root = document) { return root.querySelector(selector); }
export function $$(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }
