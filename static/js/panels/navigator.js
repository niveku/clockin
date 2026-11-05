/* Navigator: sets the scope for every other panel. Now / Unfiled / All projects, then clients and their projects. */
(function () {
  const esc = U.esc;
  const collapsed = () => U.pref('navCollapsed', { 'arch:': true });
  const isCollapsed = k => { const c = collapsed(); return k in c ? c[k] : k.startsWith('arch:'); };
  const toggle = k => U.setPref('navCollapsed', { ...collapsed(), [k]: !isCollapsed(k) });

  const openIn = fn => S.d.tasks.filter(t => S.isOpen(t) && fn(t)).length;
  const cur = (view, client = '', project = '') => {
    const s = S.scope;
    if (view !== s.view) return false;
    return view === 'client' ? s.client === client : view === 'project' ? s.client === client && s.project === project : true;
  };
  const item = (view, label, n, extra = '') =>
    `<div class="nav-item ${cur(view) ? 'sel' : ''}" data-go="${view}" ${extra} tabindex="0" role="button"><span>${label}</span><span class="n">${n}</span></div>`;

  function render(el) {
    const projects = S.d.projects.filter(p => p.name !== 'Unassigned' || p.entry_count);
    const names = S.d.clients.map(c => c.name);
    const groups = names.map(n => ({ name: n }));
    if (projects.some(p => !names.includes(p.client || '')) || S.d.tasks.some(t => S.isOpen(t) && !names.includes(t.client || '') && !t.project))
      groups.push({ name: '' });
    const run = S.timer();

    let h = item('now', 'Now', openIn(() => true)) + item('unfiled', 'Unfiled', openIn(t => !t.project)) + item('projects', 'All projects', projects.filter(p => !S.isArchived(p)).length);
    groups.forEach(g => {
      const mine = projects.filter(p => (p.client || '') === g.name).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      const live = mine.filter(p => !S.isArchived(p)), arch = mine.filter(S.isArchived);
      const ck = 'c:' + g.name, closed = isCollapsed(ck);
      h += `<div class="nav-client" data-group="${esc(ck)}" data-client="${esc(g.name)}"><span>${closed ? '▸' : '▾'}</span>
              ${g.name ? `<span class="dot" style="background:${esc(S.clientColor(g.name))}"></span>` : ''}<span class="ell">${esc(g.name || 'No client')}</span></div>`;
      if (closed) return;
      h += `<div class="nav-item ${cur('client', g.name) ? 'sel' : ''}" data-go="client" data-client="${esc(g.name)}" tabindex="0" role="button"><em>All ${esc(g.name || 'unassigned')} tasks</em><span class="n">${openIn(t => (t.client || '') === g.name)}</span></div>`;
      live.forEach(p => {
        const n = openIn(t => S.taskInProject(t, p.name, p.client)), running = run && run.project === p.name && (run.client || '') === (p.client || '');
        h += `<div class="nav-item proj ${cur('project', p.client || '', p.name) ? 'sel' : ''}" data-go="project" data-client="${esc(p.client || '')}" data-project="${esc(p.name)}" draggable="true" tabindex="0" role="button">
                <span class="dot" style="background:${esc(S.projectColor(p.name, p.client))}"></span><span class="ell">${esc(p.name)}</span>${running ? '<span class="live" title="Timer running"></span>' : n ? `<span class="n">${n}</span>` : ''}</div>`;
      });
      if (arch.length) {
        const ak = 'arch:' + g.name, ac = isCollapsed(ak);
        h += `<div class="nav-item proj muted" data-group="${esc(ak)}" tabindex="0" role="button">${ac ? '▸' : '▾'} Archived (${arch.length})</div>`;
        if (!ac) arch.forEach(p => h += `<div class="nav-item proj muted ${cur('project', p.client || '', p.name) ? 'sel' : ''}" data-go="project" data-client="${esc(p.client || '')}" data-project="${esc(p.name)}" draggable="true" tabindex="0" role="button"><span class="dot" style="background:${esc(S.projectColor(p.name, p.client))};opacity:.5"></span><span class="ell">${esc(p.name)}</span></div>`);
      }
    });
    h += `<button class="nav-add" data-act="newproject">+ New project</button><button class="nav-add" data-act="clients">Manage clients</button>`;
    el.innerHTML = `<div class="panel nav-panel">${h}</div>`;
  }

  async function newProject(preClient) {
    const form = U.form([{ key: 'name', label: 'Name' }, { key: 'client', label: 'Client', type: 'select', options: [{ value: '', label: '(no client)' }, ...S.d.clients.map(c => c.name)] }],
      { client: preClient ?? S.scope.client });
    const v = await U.dialog({ title: 'New project', body: form, actions: [{ label: 'Cancel', value: null }, { label: 'Create', primary: true, value: b => U.formValues(b) }] });
    if (!v || !v.name.trim()) return;
    try {
      await S.act(() => U.api('POST', '/api/projects', { name: v.name.trim(), client: v.client }));
      S.setScope({ view: 'project', client: v.client, project: v.name.trim() });
    } catch (e) { /* toast shown */ }
  }

  async function projectPut(p, body) { return S.act(() => U.api('PUT', `/api/projects/${encodeURIComponent(p.name)}?client=${encodeURIComponent(p.client || '')}`, body)); }

  async function renameProject(p) {
    const name = await U.prompt('Rename project', 'New name', p.name);
    if (!name || name === p.name) return;
    try {
      await projectPut(p, { name });
      if (S.scope.view === 'project' && S.scope.project === p.name) S.setScope({ ...S.scope, project: name });
      U.toast(`Renamed to ${name}`);
    } catch (e) { /* toast shown */ }
  }

  async function moveProject(p, client) {
    const mine = S.entries.filter(e => e.project === p.name && (e.client || '') === (p.client || ''));
    const hrs = S.sumHours(mine);
    const ok = await U.confirm(`Move “${p.name}” to ${client || 'no client'}?`,
      `${mine.length} time entr${mine.length === 1 ? 'y' : 'ies'} (${U.fmtH1(hrs)} h) and its tasks move too. This changes who the hours are invoiced to.`, { ok: 'Move project' });
    if (!ok) return;
    try { await projectPut(p, { client }); U.toast(`Moved to ${client || 'no client'}`); if (S.scope.view === 'project' && S.scope.project === p.name) S.setScope({ view: 'project', client, project: p.name }); } catch (e) { /* toast shown */ }
  }

  U.moveTask = async (id, target) => {            // shared with the Tasks panel's menus
    const t = S.d.tasks.find(x => x.id === id); if (!t) return;
    let body;
    if (target.view === 'project') body = { client: target.client || null, project: target.project };
    else if (target.view === 'client') body = { client: target.client || null, project: S.project(t.project, target.client) ? t.project : null };
    else body = { project: null };
    const old = { project: t.project || null, client: t.client || null };
    try {
      await S.act(() => U.api('PATCH', `/api/tasks/${id}`, body));
      U.toast(`Moved: ${t.task}`, { undo: () => S.act(() => U.api('PATCH', `/api/tasks/${id}`, old)) });
    } catch (e) { /* toast shown */ }
  };

  function setup(el) {
    el.addEventListener('click', e => {
      const go = e.target.closest('[data-go]'), grp = e.target.closest('[data-group]'), act = e.target.closest('[data-act]');
      if (act) return act.dataset.act === 'newproject' ? newProject() : window.ClientsDialog && ClientsDialog.open();
      if (grp) { toggle(grp.dataset.group); return S.emit('nav'); }
      if (go) S.setScope({ view: go.dataset.go, client: go.dataset.client || '', project: go.dataset.project || '' });
    });
    el.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.nav-item')) { e.preventDefault(); e.target.click(); } });
    U.onContext(el, '[data-go="project"]', t => {
      const p = S.project(t.dataset.project, t.dataset.client); if (!p) return [];
      return [
        { label: 'Open details', onClick: () => { S.select({ type: 'project', name: p.name, client: p.client || '' }); Workspaces.reveal('inspector'); } },
        { label: 'Rename…', onClick: () => renameProject(p) },
        { sep: true }, { header: 'Status' },
        ...S.d.statuses.map(s => ({ label: s.replace('_', ' '), checked: p.status === s, onClick: () => projectPut(p, { status: s }).then(() => U.toast(`${p.name}: ${s.replace('_', ' ')}`)).catch(() => {}) })),
      ];
    });
    // drag a task or a project onto the tree
    const OK = e => e.dataTransfer.types.includes('application/x-clockin-task') || e.dataTransfer.types.includes('application/x-clockin-project');
    el.addEventListener('dragstart', e => {
      const p = e.target.closest('[data-go="project"]'); if (!p) return;
      e.dataTransfer.setData('application/x-clockin-project', JSON.stringify({ name: p.dataset.project, client: p.dataset.client })); e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragover', e => {
      if (!OK(e)) return;
      const t = e.target.closest('[data-go="project"],[data-go="client"],[data-go="unfiled"],.nav-client');
      document.querySelectorAll('.nav-drop').forEach(x => x.classList.remove('nav-drop'));
      if (t) { e.preventDefault(); t.classList.add('nav-drop'); }
    });
    el.addEventListener('dragleave', e => { if (!el.contains(e.relatedTarget)) document.querySelectorAll('.nav-drop').forEach(x => x.classList.remove('nav-drop')); });
    el.addEventListener('drop', e => {
      document.querySelectorAll('.nav-drop').forEach(x => x.classList.remove('nav-drop'));
      const t = e.target.closest('[data-go="project"],[data-go="client"],[data-go="unfiled"],.nav-client'); if (!t) return;
      e.preventDefault();
      const tid = e.dataTransfer.getData('application/x-clockin-task'), pj = e.dataTransfer.getData('application/x-clockin-project');
      const client = t.dataset.client || '';
      if (tid) U.moveTask(tid, t.dataset.go ? { view: t.dataset.go, client, project: t.dataset.project || '' } : { view: 'client', client });
      else if (pj) { const o = JSON.parse(pj), p = S.project(o.name, o.client); if (p && (p.client || '') !== client && (t.dataset.go === 'client' || t.classList.contains('nav-client'))) moveProject(p, client); }
    });
  }

  U.newProject = newProject;
  U.definePanel('navigator', { title: 'Navigator', events: ['data', 'scope', 'nav'], render, setup });
})();
