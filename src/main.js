// Connects the prerendered page in index.html to its logic (site.js).
//
// The markup carries small markers left by the prerender:
//   data-b-<attr>="… {{path}} …"   an attribute computed from the component's values
//   <x-t data-t="{{path}}">         text computed from the values
//   <x-if data-if="path">           shown only while the value is truthy
//   <x-dc data-dc="PhoneMockup">    a phone mockup whose props come from data-props-tmpl
//   data-on-click="path"            calls that handler
//   data-ref="name"                 hands the element to the component as this[name].current
// After every state change the values are recomputed and applied to these markers only.
import { Component } from './site.js';
import { phoneVals } from './phone-mockup.js';
import { DOWNLOAD, RELEASE, LEAFITY } from './config.js';

const root = document.getElementById('app');
const comp = new Component();
comp.props = {
  apkUrl: DOWNLOAD.url,
  apkFileName: DOWNLOAD.fileName,
  apkIsTest: DOWNLOAD.isTest,
  ...RELEASE,
  ...LEAFITY,
};

const HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
const look = (path, vals) => {
  path = path.trim();
  if (path === 'true') return true;
  if (path === 'false') return false;
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), vals);
};
const whole = (t) => { const m = /^\{\{\s*([^}]+?)\s*\}\}$/.exec(t.trim()); return m ? m[1] : null; };
const fill = (t, vals) => t.replace(HOLE, (_, p) => { const v = look(p, vals); return v == null ? '' : v; });

// Apply values to the markers inside `scope`, skipping nested phone mockups (they have their own values).
function apply(scope, vals) {
  const mine = (el) => el.closest('x-dc') === (scope.matches('x-dc') ? scope : null);
  scope.querySelectorAll('*').forEach((el) => {
    if (!mine(el)) return;
    for (const a of el.attributes) {
      if (!a.name.startsWith('data-b-')) continue;
      const name = a.name.slice(7), w = whole(a.value);
      const v = w ? look(w, vals) : fill(a.value, vals);
      if (name.startsWith('aria-') && typeof v === 'boolean') el.setAttribute(name, String(v));
      else if (v === false || v == null || (name === 'src' && v === '')) el.removeAttribute(name);
      else if (el.getAttribute(name) !== String(v)) el.setAttribute(name, String(v));
    }
    if (el.localName === 'x-t') { const t = fill(el.dataset.t, vals); if (el.textContent !== t) el.textContent = t; }
    if (el.localName === 'x-if') el.hidden = !look(el.dataset.if, vals);
  });
}

let vals = {}, queued = false;
function sync() {
  queued = false;
  vals = comp.renderVals();
  apply(root, vals);
  root.querySelectorAll('x-dc[data-dc^="PhoneMockup"]').forEach((box) => {
    const tmpl = JSON.parse(box.dataset.propsTmpl || '{}'), props = {};
    for (const k in tmpl) { const w = whole(String(tmpl[k])); props[k] = w ? look(w, vals) : tmpl[k]; }
    apply(box, phoneVals(props));
  });
}
comp.onUpdate = () => { if (!queued) { queued = true; queueMicrotask(sync); } };

root.querySelectorAll('[data-ref]').forEach((el) => { comp[el.dataset.ref].current = el; });
root.addEventListener('click', (e) => {
  const el = e.target.closest('[data-on-click]');
  if (!el || !root.contains(el)) return;
  const fn = look(el.dataset.onClick, vals);
  if (typeof fn === 'function') fn(e);
});
sync();
comp.componentDidMount();
window.addEventListener('pagehide', (e) => { if (!e.persisted && comp.componentWillUnmount) comp.componentWillUnmount(); });
