/* Workspaces: named dock layouts (Plan, Track, Review, and your own), saved per browser.
   Built on dockview-core: tabs, splits, floating groups and collapsible edge docks. */
(function () {
  const DV = window['dockview-core'];
  let api = null, current = 'plan', lastFull = 'plan', applying = false, saveTimer = null, locked = false;

  const TITLES = () => Object.fromEntries(Object.entries(Panels).map(([k, v]) => [k, v.title]));
  // Where each panel lives by default: an edge dock or the centre
  const HOME = { navigator: 'left', tasks: 'center', projects: 'center', week: 'bottom', timesheet: 'bottom', inspector: 'right', presets: 'right' };

  const BUILT_IN = {
    plan:   { label: 'Plan',   edges: { left: { size: 230, min: 150, max: 380 }, right: { size: 300, min: 220, max: 520, collapsed: true }, bottom: { size: 300, min: 120, max: 700 } },
              panels: { left: ['navigator'], center: ['tasks', 'projects'], bottom: ['timesheet', 'week'], right: ['inspector', 'presets'] } },
    track:  { label: 'Track',  edges: { bottom: { size: 220, min: 100, max: 500 } },
              panels: { center: ['tasks', 'presets', 'inspector'], bottom: ['week'] } },
    review: { label: 'Review', edges: { left: { size: 230, min: 150, max: 380, collapsed: true }, right: { size: 300, min: 220, max: 520, collapsed: true }, bottom: { size: 230, min: 100, max: 500 } },
              panels: { left: ['navigator'], center: ['timesheet'], bottom: ['week'], right: ['inspector', 'presets', 'projects'] } },
  };

  const names = () => ({ ...Object.fromEntries(Object.entries(BUILT_IN).map(([k, v]) => [k, v.label])), timer: 'Timer', ...Object.fromEntries(Object.keys(U.pref('wsCustom', {})).map(k => [k, k])) });

  function addPanelTo(id, where, ref) {
    if (api.getPanel(id) || !Panels[id]) return;
    const opts = { id, component: id, title: Panels[id].title };
    if (where === 'center') {
      const first = api.panels.find(p => p.group && !isEdge(p.group));
      if (first) opts.position = { referencePanel: first.id, direction: 'within' };
    } else {
      const g = edgeGroup(where);
      if (g) opts.position = { referenceGroup: g };
      else if (spanOn(current) && ROOT_DIR[where]) {
        const mate = (BUILT_IN[current] || BUILT_IN.plan).panels[where] || [], at = mate.map(m => api.getPanel(m)).find(Boolean);
        const mid = api.panels.find(q => q.group && !isEdge(q.group) && (BUILT_IN[current] || BUILT_IN.plan).panels.center.includes(q.id));
        opts.position = at ? { referencePanel: at.id, direction: 'within' }
          : where !== 'bottom' && mid ? { referencePanel: mid.id, direction: ROOT_DIR[where] }   // beside the centre, so the bottom dock stays full width
          : { direction: ROOT_DIR[where] };
        opts.after = at ? null : { [where === 'bottom' ? 'height' : 'width']: where === 'bottom' ? 300 : where === 'left' ? 230 : 320 };
      }
    }
    const after = opts.after; delete opts.after;
    const keep = after && where !== 'bottom' ? api.groups.filter(g => !isEdge(g) && g.panels.some(q => ['left', 'right'].some(w => ((BUILT_IN[current] || BUILT_IN.plan).panels[w] || []).includes(q.id)))).map(g => [g, g.width]) : [];
    try {
      const p = api.addPanel(opts);
      keep.forEach(([g, w]) => { try { g.api.setSize({ width: w }); } catch (e) { /* ok */ } });   // the other side docks keep their width
      if (after) { try { p.group.api.setSize(after); } catch (e) { /* default size */ } }
      return p;
    } catch (e) { console.warn('addPanel failed', id, where, e); return api.addPanel({ id, component: id, title: Panels[id].title }); }
  }
  const ROOT_DIR = { left: 'left', right: 'right', bottom: 'below' };
  const spanOn = n => !U.pref('rails.' + n, false);   // full-width bottom is the default; 'rails' = collapsible side docks
  const isEdge = g => ['left', 'right', 'top', 'bottom'].some(p => { const e = api.getEdgeGroup && api.getEdgeGroup(p); return e && e.id === g.id; });
  const edgeGroup = pos => { const e = api.getEdgeGroup(pos); return e ? e.id : null; };

  function build(name) {
    const def = BUILT_IN[name] || BUILT_IN.plan;
    U.setPref('collapsed.' + name, {});
    applying = true;
    try {
      api.clear();
      ['left', 'right', 'top', 'bottom'].forEach(p => { try { api.removeEdgeGroup(p); } catch (e) { /* none */ } });
      // the centre first, so the edge docks wrap it
      const centre = def.panels.center || [];
      centre.forEach((id, i) => api.addPanel({ id, component: id, title: Panels[id].title, ...(i ? { position: { referencePanel: centre[0], direction: 'within' } } : {}) }));
      if (spanOn(name)) { buildSpan(def); activateFirst(def); return; }
      Object.entries(def.edges).forEach(([pos, o]) => {
        try { api.addEdgeGroup(pos, { id: 'edge-' + pos, initialSize: o.size, minimumSize: o.min, maximumSize: o.max, collapsedSize: 30, collapsed: !!o.collapsed }); }
        catch (e) { console.warn('edge group failed', pos, e); }
      });
      Object.entries(def.panels).forEach(([where, ids]) => { if (where !== 'center') ids.forEach(id => addPanelTo(id, where)); });
      activateFirst(def);
    } finally { applying = false; }
  }
  // Bottom spans every column: ordinary root-level groups, with the bottom one added last so it wraps the rest.
  function buildSpan(def) {
    const sizes = { left: ['width', def.edges.left], right: ['width', def.edges.right], bottom: ['height', def.edges.bottom] };
    ['left', 'right', 'bottom'].forEach(where => {
      const ids = def.panels[where] || [], o = sizes[where][1];
      if (!ids.length || !o || (o.collapsed && where !== 'bottom')) return;          // a collapsed side dock simply isn't open
      ids.forEach((id, i) => api.addPanel({ id, component: id, title: Panels[id].title,
        position: i ? { referencePanel: ids[0], direction: 'within' } : { direction: ROOT_DIR[where] } }));
      try { api.getPanel(ids[0]).group.api.setSize({ [sizes[where][0]]: o.size }); } catch (e) { /* default size */ }
    });
  }
  function activateFirst(def) { Object.values(def.panels).forEach(ids => { const p = api.getPanel(ids[0]); if (p) try { p.api.setActive(); } catch (e) { /* ok */ } }); }


  // ── Collapsing: every group gets a ‹ › ⌄ button. A collapsed group folds to a slim strip of its tabs; a click on a tab (or the button) opens it again. ──
  const SLIM = 34, btns = new Map();
  const collapsedPref = () => U.pref('collapsed.' + current, {});
  const groupOf = el => api.groups.find(g => g.element === el);
  const keyOfGroup = g => (g.panels[0] || {}).id;
  function sideOf(g) { const d = document.getElementById('dock').getBoundingClientRect(), r = g.element.getBoundingClientRect(); return r.left + r.width / 2 < d.left + d.width / 2 ? 'left' : 'right'; }
  function paintBtn(g) {
    const b = btns.get(g.id); if (!b) return;
    const c = g.element.classList.contains('ck-collapsed'), h = g.element.classList.contains('ck-h');
    const dir = h ? 'bottom' : sideOf(g);
    b.textContent = h ? (c ? '⌃' : '⌄') : (dir === 'left' ? (c ? '›' : '‹') : (c ? '‹' : '›'));
    const name = g.panels.map(p => p.title).join(' / ');
    b.title = b.ariaLabel = (c ? 'Expand ' : 'Collapse ') + name;
  }
  function collapseGroup(g, prev) {
    if (!g || isEdge(g) || g.element.classList.contains('ck-collapsed')) return;
    const d = document.getElementById('dock').getBoundingClientRect(), r = g.element.getBoundingClientRect();
    const h = r.width >= d.width - 40;                              // a full-width group (the bottom dock) folds down; the rest fold sideways
    const size = h ? r.height : r.width;
    g.element.classList.add('ck-collapsed', h ? 'ck-h' : 'ck-w');
    try { g.api.setConstraints(h ? { minimumHeight: SLIM, maximumHeight: SLIM } : { minimumWidth: SLIM, maximumWidth: SLIM }); g.api.setSize(h ? { height: SLIM } : { width: SLIM }); } catch (e) { console.warn('collapse', e); }
    if (!applying) { const m = collapsedPref(); m[keyOfGroup(g)] = { h, prev: prev || size }; U.setPref('collapsed.' + current, m); }
    paintBtn(g);
  }
  function expandGroup(g) {
    if (!g || !g.element.classList.contains('ck-collapsed')) return;
    const h = g.element.classList.contains('ck-h'), m = collapsedPref(), k = keyOfGroup(g), prev = (m[k] && m[k].prev) || (h ? 260 : 260);
    g.element.classList.remove('ck-collapsed', 'ck-h', 'ck-w');
    try { g.api.setConstraints(h ? { minimumHeight: 100, maximumHeight: Number.MAX_SAFE_INTEGER } : { minimumWidth: 100, maximumWidth: Number.MAX_SAFE_INTEGER }); g.api.setSize(h ? { height: prev } : { width: prev }); } catch (e) { console.warn('expand', e); }
    delete m[k]; U.setPref('collapsed.' + current, m);
    paintBtn(g);
  }
  const toggleGroup = g => (g.element.classList.contains('ck-collapsed') ? expandGroup(g) : collapseGroup(g));
  function restoreCollapsed() {
    const m = collapsedPref();
    Object.entries(m).forEach(([id, v]) => { const p = api.getPanel(id); if (p && p.group) { applying = true; try { collapseGroup(p.group, v.prev); } finally { applying = false; } } });
  }
  function headerAction(group) {
    const el = document.createElement('div'); el.className = 'ck-actions';
    return { element: el, init() { if (isEdge(group)) return; const b = document.createElement('button'); b.type = 'button'; b.className = 'ck-collapse'; b.onclick = e => { e.stopPropagation(); toggleGroup(group); }; el.appendChild(b); btns.set(group.id, b); paintBtn(group); }, dispose() { btns.delete(group.id); } };
  }

  // ── persistence ──
  const keyOf = n => 'ws.' + n;
  function save() { if (applying || current === 'timer') return; clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { U.setPref(keyOf(current), api.toJSON()); } catch (e) { console.warn('save layout', e); } }, 400); }
  function load(name) {
    current = name; U.setPref('wsCurrent', name);
    document.getElementById('wsName').textContent = names()[name] || name;
    document.body.classList.toggle('ws-timer', name === 'timer');           // the light workspace: just the timer bar
    if (name === 'timer') { S.emit('data'); return; }
    lastFull = name; U.setPref('wsLast', name);
    const saved = U.pref(keyOf(name), null) || U.pref('wsCustom', {})[name];
    applying = true;
    try { if (saved) { api.fromJSON(saved); } else build(name); }
    catch (e) { console.warn('layout could not be restored; using the default', e); build(name); }
    finally { applying = false; }
    requestAnimationFrame(restoreCollapsed);
    S.emit('data');
  }

  // ── public ──
  function reveal(id) {
    if (current === 'timer') load(lastFull);
    let p = api.getPanel(id);
    if (p && p.group && p.group.element.classList.contains('ck-collapsed')) expandGroup(p.group);   // unfold a ‹-collapsed group first
    if (!p) { addPanelTo(id, HOME[id] || 'right'); p = api.getPanel(id); }
    if (!p) return;
    try {
      const g = p.group;                              // an edge dock may be collapsed to a rail: open it first
      ['left', 'right', 'top', 'bottom'].forEach(pos => {
        const e = api.getEdgeGroup(pos);
        if (e && g && e.id === g.id) {
          const flag = v => (typeof v === 'function' ? v.call(e) : v);   // these are getters or methods depending on the release
          if (!flag(e.isVisible)) e.setVisible(true);
          if (flag(e.isCollapsed)) e.expand();
        }
      });
      p.api.setActive();
    } catch (e) { console.warn('reveal', e); }
  }
  function togglePanel(id) { const p = api.getPanel(id); if (p) p.api.close(); else reveal(id); }
  function resetCurrent() { if (current === 'timer') return; try { localStorage.removeItem('clockin.' + keyOf(current)); } catch (e) { /* ok */ } if (BUILT_IN[current]) { build(current); save(); } else load(current); U.toast('Layout reset'); }

  async function saveAs() {
    if (current === 'timer') return U.toast('Switch to a layout first, then save it', { error: true });
    const name = await U.prompt('Save workspace', 'Name'); if (!name) return;
    if (BUILT_IN[name.toLowerCase()]) return U.toast('That name is taken by a built-in workspace', { error: true });
    const custom = U.pref('wsCustom', {}); custom[name] = api.toJSON(); U.setPref('wsCustom', custom); current = name; U.setPref('wsCurrent', name); U.setPref(keyOf(name), custom[name]);
    document.getElementById('wsName').textContent = name; U.toast(`Saved workspace “${name}”`);
  }
  function deleteCustom(name) { const c = U.pref('wsCustom', {}); delete c[name]; U.setPref('wsCustom', c); try { localStorage.removeItem('clockin.' + keyOf(name)); } catch (e) { /* ok */ } if (current === name) load('plan'); }

  async function toggleRails() {
    if (!BUILT_IN[current]) return;
    const rails = spanOn(current);
    if (!await U.confirm(rails ? 'Use collapsible side docks?' : 'Use the standard layout?', `This rebuilds the “${names()[current]}” workspace from its default arrangement. Your own rearranging in it is replaced.`, { ok: 'Rebuild' })) return;
    U.setPref('rails.' + current, rails); build(current); save(); U.toast(rails ? 'Side docks can now collapse to a rail' : 'Standard layout restored');
  }
  function wsMenu(btn) {
    const all = names(), custom = U.pref('wsCustom', {});
    U.menuAt(btn, [{ header: 'Workspace' }, ...Object.entries(all).map(([k, l]) => ({ label: l, checked: k === current, onClick: () => load(k) })), { sep: true },
      { label: 'Save current layout as…', onClick: saveAs }, { label: 'Reset this workspace', onClick: resetCurrent },
      { label: 'Collapsible side docks', checked: !spanOn(current) && !!BUILT_IN[current], disabled: !BUILT_IN[current], onClick: toggleRails },
      { label: locked ? 'Unlock layout' : 'Lock layout', onClick: () => { locked = !locked; api.updateOptions({ disableDnd: locked }); U.toast(locked ? 'Layout locked' : 'Layout unlocked'); } },
      ...Object.keys(custom).map(k => ({ label: `Delete “${k}”`, danger: true, onClick: () => deleteCustom(k) }))]);
  }
  function winMenu(btn) {
    const open = id => !!api.getPanel(id);
    U.menuAt(btn, [{ header: 'Panels' }, ...Object.entries(TITLES()).map(([id, t], i) => ({ label: `${t}`, checked: open(id), onClick: () => togglePanel(id) })), { sep: true },
      { header: 'Selected panel' },
      { label: 'Float', onClick: () => { const p = api.activePanel; if (p) api.addFloatingGroup(p, { width: 420, height: 360, x: 120, y: 90 }); } },
      { label: 'Maximize / restore', onClick: () => { const p = api.activePanel; if (!p) return; api.hasMaximizedGroup() ? api.exitMaximizedGroup() : api.maximizeGroup(p); } }]);
  }

  function init() {
    api = DV.createDockview(document.getElementById('dock'), {
      theme: { name: 'clockin', className: 'dockview-theme-clockin', gap: 6 },
      dndEdges: { size: { value: 28, type: 'pixels' }, activationSize: { value: 36, type: 'pixels' } },   // drag a tab to the window edge: it docks across the full side
      createComponent: ({ name }) => Panels[name].create(),
      createRightHeaderActionComponent: headerAction,
    });
    window.Dock = api;
    document.getElementById('dock').addEventListener('click', e => { const t = e.target.closest('.ck-collapsed .dv-tab'); if (t) expandGroup(groupOf(t.closest('.dv-groupview'))); });
    api.onDidLayoutChange(save);
    document.getElementById('wsBtn').onclick = e => wsMenu(e.currentTarget);
    document.getElementById('winBtn').onclick = e => winMenu(e.currentTarget);
    // narrow windows get the Track workspace, and go back when widened
    let narrow = innerWidth < 900, before = null;
    addEventListener('resize', () => {
      const n = innerWidth < 900; if (n === narrow) return; narrow = n; if (current === 'timer') return;
      if (n) { before = current; if (current !== 'track') load('track'); } else if (before && current === 'track') { load(before); before = null; }
    });
    lastFull = U.pref('wsLast', 'plan'); if (!BUILT_IN[lastFull] && !U.pref('wsCustom', {})[lastFull]) lastFull = 'plan';
    const saved = U.pref('wsCurrent', 'plan'), start = saved === 'timer' ? 'timer' : narrow ? 'track' : saved;
    load(names()[start] ? start : 'plan');
  }
  window.Workspaces = { get current() { return current; }, get lastFull() { return lastFull; }, toggleGroup, init, reveal, load, resetCurrent, get api() { return api; } };
})();
