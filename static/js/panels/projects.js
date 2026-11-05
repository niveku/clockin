/* Projects overview: one card per project with hours, what the time went on, and the deadline. */
(function () {
  const esc = U.esc;
  const OP = ['#5e5ce6', '#30d158', '#ff9f0a', '#ff453a', '#4a9eff', '#bf5af2', '#00b4d8', '#e8a930', '#ff6b6b', '#a855f7'];
  const showArch = () => U.pref('projArchived', false);

  function render(el) {
    const arch = showArch();
    const list = S.d.projects.filter(p => (!S.scope.client || (p.client || '') === S.scope.client) && (arch || !S.isArchived(p)) && (p.name !== 'Unassigned' || p.entry_count))
      .sort((a, b) => (b.last_date || '').localeCompare(a.last_date || ''));
    el.innerHTML = `<div class="panel roomy"><div class="view-head"><div class="grow"><div class="view-title" style="font-size:14px">Projects</div><div class="view-sub">${S.scope.client ? esc(S.scope.client) : 'All clients'} · ${list.length}</div></div>
      <button class="pill ${arch ? 'on' : ''}" data-act="arch">Show archived</button><button class="btn sm" data-act="new">+ New project</button></div>
      ${list.length ? `<div class="cards">${list.map(p => {
        const tot = p.total_hours || 0;
        return `<div class="card" data-name="${esc(p.name)}" data-client="${esc(p.client || '')}" tabindex="0" style="border-left:3px solid ${esc(S.projectColor(p.name, p.client))}">
          <div style="display:flex;gap:6px;align-items:center"><b class="ell grow" style="font-weight:500">${esc(p.name)}</b>${p.status && p.status !== 'active' ? `<span class="chip">${esc(p.status.replace('_', ' '))}</span>` : ''}</div>
          <div class="muted" style="font-size:12px">${esc(p.client || 'No client')}${p.deadline ? ` · ⏱ ${esc(U.niceD(p.deadline))}` : ''}</div>
          <div class="opbar">${(p.operations || []).map((o, i) => `<span style="width:${tot ? (o.hours / tot) * 100 : 0}%;background:${OP[i % OP.length]}" title="${esc(o.op)} ${o.hours}h"></span>`).join('')}</div>
          <div style="font-size:12px"><b>${p.month_hours || 0}h</b> this month · ${tot}h total</div></div>`;
      }).join('')}</div>` : '<div class="empty">No projects yet.</div>'}</div>`;
  }

  function setup(el) {
    el.addEventListener('click', e => {
      const a = e.target.closest('[data-act]'), c = e.target.closest('.card');
      if (a && a.dataset.act === 'arch') { U.setPref('projArchived', !showArch()); return S.emit('nav2'); }
      if (a && a.dataset.act === 'new') return U.newProject();
      if (c) S.setScope({ view: 'project', client: c.dataset.client, project: c.dataset.name });
    });
    el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('card')) e.target.click(); });
  }
  U.definePanel('projects', { title: 'Projects', events: ['data', 'scope', 'nav2'], render, setup });
})();
