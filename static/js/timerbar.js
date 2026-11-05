/* The timer bar: always visible, the only place the running timer is shown. */
(function () {
  const bar = () => U.$('#timerbar');
  let built = '';

  const todayHours = () => { const t = U.today(); return S.sumHours(S.entries.filter(e => (e.start_time || '').startsWith(t))); };

  function render() {
    const t = S.timer(), key = t ? `r${t.entry_id}${t.description}${t.project}${t.area}${t.operation}` : 'idle';
    if (key !== built) {                                   // rebuild only when the structure changes; tick just updates numbers
      built = key;
      if (t) {
        bar().className = 'running';
        bar().innerHTML = `<span class="dotr"></span>
          <span class="what ell" title="${U.esc(t.description)}">${U.esc(t.description || 'Untitled')}</span>
          <span class="sub ell">${[t.project, [t.area, t.operation].filter(Boolean).join(' · ')].filter(Boolean).map(U.esc).join(' · ')}</span>
          <span class="clock" id="tbClock">0:00:00</span>
          <span class="today" id="tbToday"></span>
          <button class="tb-btn" id="tbDetails" title="Edit the running timer">Details</button>
          <button class="tb-btn" id="tbSwitch">Switch ▾</button>
          <button class="tb-btn" id="tbDiscard" title="Delete this timer without saving">Discard</button>
          <button class="tb-btn stop" id="tbStop">Stop</button>`;
        U.$('#tbDetails').onclick = () => { S.select({ type: 'timer' }); Workspaces.reveal('inspector'); };
        U.$('#tbSwitch').onclick = e => switchMenu(e.currentTarget);
        U.$('#tbDiscard').onclick = () => S.discardTimer().catch(() => {});
        U.$('#tbStop').onclick = () => S.stopTimer().catch(() => {});
      } else {
        bar().className = 'idle';
        bar().innerHTML = `<span class="dotr" style="color:var(--muted)"></span>
          <input id="tbNew" class="grow" type="text" placeholder="What are you working on? Press Enter to start — or press ▶ on a task or preset" aria-label="Start a timer" style="max-width:560px">
          <button class="btn sm" id="tbSwitch">Presets ▾</button>
          <span class="today" id="tbToday" style="margin-left:auto"></span>`;
        U.$('#tbNew').onkeydown = e => {
          if (e.key !== 'Enter') return;
          const v = e.target.value.trim(); if (!v) return;
          e.target.value = '';
          S.startTimer({ description: v, project: S.scope.view === 'project' ? S.scope.project : '' }).catch(() => {});
        };
        U.$('#tbSwitch').onclick = e => switchMenu(e.currentTarget);
      }
    }
    tick();
  }

  function tick() {
    const clock = U.$('#tbClock'); if (clock) clock.textContent = U.fmtClock(S.elapsed());
    const td = U.$('#tbToday'); if (td) td.textContent = `Today ${U.fmtH1(todayHours())} h`;
  }

  function switchMenu(btn) {
    const items = [{ header: 'Presets' }];
    const pre = S.seeds.presets.filter(p => !S.scope.client || p.client === S.scope.client);
    pre.forEach(p => items.push({ label: '▶ ' + p.label, onClick: () => S.startTimer({ client: p.client, project: p.project, description: p.description, area: p.area, operation: p.operation, preset_id: p.id }) }));
    if (!pre.length) items.push({ label: 'No presets yet', disabled: true });
    const tasks = S.d.tasks.filter(t => !t.done && S.seeds.tasks[t.id] && S.inScope(t)).slice(0, 12);
    if (tasks.length) { items.push({ sep: true }, { header: 'Tasks' }); tasks.forEach(t => items.push({ label: '▶ ' + t.task, onClick: () => S.startTimer(S.taskSeed(t)) })); }
    U.menuAt(btn, items);
  }

  window.TimerBar = { render, tick };
  S.on('data', render);
  S.on('tick', tick);
})();
