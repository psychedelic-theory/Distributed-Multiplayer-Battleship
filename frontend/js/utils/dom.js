/**
 * dom.js — Lightweight DOM helpers.
 *
 * We roll our own rather than pull in a framework. Keeps this client
 * drop-in portable and free of build-step concerns.
 */

/**
 * Create a DOM element.
 *
 * @param {string} tag                 — tag name, with optional '.class' and '#id' (e.g. 'div.card.card--lg')
 * @param {object} [attrs]             — attributes / props / event handlers. Keys starting with 'on' become event listeners.
 * @param {Array|Node|string} [kids]   — children: nodes, strings, or arrays thereof
 * @returns {HTMLElement}
 */
export function h(tag, attrs = {}, kids = []) {
  // Support 'div.foo#bar.baz' shorthand
  let tagName = tag;
  const classes = [];
  let id = null;

  const hashIdx = tag.indexOf('#');
  const dotIdx  = tag.indexOf('.');

  if (hashIdx !== -1 || dotIdx !== -1) {
    const firstSplit = Math.min(
      hashIdx === -1 ? Infinity : hashIdx,
      dotIdx  === -1 ? Infinity : dotIdx
    );
    tagName = tag.slice(0, firstSplit);
    const rest = tag.slice(firstSplit);
    // Very small parser
    rest.split(/(?=[.#])/).forEach(tok => {
      if (tok.startsWith('.')) classes.push(tok.slice(1));
      else if (tok.startsWith('#')) id = tok.slice(1);
    });
  }

  const el = document.createElement(tagName || 'div');
  if (id) el.id = id;
  if (classes.length) el.className = classes.join(' ');

  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class' || k === 'className') {
      el.className = [el.className, v].filter(Boolean).join(' ');
    } else if (k === 'style' && typeof v === 'object') {
      Object.assign(el.style, v);
    } else if (k === 'dataset' && typeof v === 'object') {
      for (const [dk, dv] of Object.entries(v)) el.dataset[dk] = dv;
    } else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'html') {
      el.innerHTML = v;
    } else if (k in el) {
      el[k] = v;
    } else {
      el.setAttribute(k, v);
    }
  }

  appendKids(el, kids);
  return el;
}

function appendKids(el, kids) {
  if (kids === null || kids === undefined || kids === false) return;
  if (Array.isArray(kids)) {
    kids.forEach(k => appendKids(el, k));
  } else if (kids instanceof Node) {
    el.appendChild(kids);
  } else {
    el.appendChild(document.createTextNode(String(kids)));
  }
}

/**
 * Mount a node (or array of nodes) into a container, replacing its contents.
 */
export function mount(container, content) {
  container.innerHTML = '';
  appendKids(container, content);
  return container;
}

/**
 * Query shortcut.
 */
export const $ = (sel, root = document) => root.querySelector(sel);

/**
 * Clear an element's children.
 */
export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}
