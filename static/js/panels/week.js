/* Week: a timeline of the time you tracked, one row per day. Click a block to edit that entry. */
(function () {
  const esc = U.esc;
  const mode = () => U.pref('weekMode', 'week');
  const setMode = m => { U.setPref('weekMode', m); S.emit('weekmode'); };

  function days() {
    const t = new Date(), m = mode();
    if (m === 'day') return [t];
    if (m === '7days') return Array.from({ length: 7 }, (_, i) => U.addDays(t, i - 6));
    const a = U.weekStart(t); return Array.from({ length: 7 }, (_, i) => U.addDays(a, i));
  }
  const mins = d => d.getHours() * 60 + d.getMinutes();

  function render(el) {
    const ds = days(), keys = ds.map(U.ymd), today = U.today(), run = S.timer(), nowD = new Date();
    const list = S.entries.filter(e => S.inScope(e) && keys.includes((e.start_time || '').slice(0, 10)));
    // hour window: wide enough for everything shown, never narrower than 8 hours
    let lo = 7 * 60, hi = 19 * 60;
    list.forEach(e => {
      const s = U.parseDT(e.start_time), en = e.end_time ? U.parseDT(e.end_time) : nowD;
      if (!s) return; lo = Math.min(lo, mins(s)); if (en && U.ymd(en) === U.ymd(s)) hi = Math.max(hi, mins(en));
    });
    lo = Math.max(0, Math.floor(lo / 60) * 60); hi = Math.min(24 * 60, Math.ceil(hi / 60) * 60); if (hi - lo < 480) hi = Math.min(24 * 60, lo + 480);
    const span = hi - lo, pct = v => ((v - lo) / span) * 100;
    const total = S.sumHours(list), m = mode();
    const label = m === 'day' ? 'Today' : m === '7days' ? 'Last 7 days' : 'This week';
    const range = ds.length > 1 ? ` · ${U.MON[ds[0].getMonth()]} ${ds[0].getDate()} – ${U.MON[ds[6].getMonth()]} ${ds[6].getDate()}` : '';
    const seg = (k, l) => `<button class="pill ${m === k ? 'on' : ''}" data-mode="${k}">${l}</button>`;
    const rows = ds.map((d, i) => {
      const es = list.filter(e => (e.start_time || '').startsWith(keys[i])), h = S.sumHours(es);
      const blocks = es.map(e => {
        const s = U.parseDT(e.start_time); if (!s) return '';
        const isRun = !e.end_time && run && run.entry_id === e.id, en = e.end_time ? U.parseDT(e.end_time) : nowD;
        const a = mins(s), b = Math.max(a + 3, en && U.ymd(en) === U.ymd(s) ? mins(en) : 24 * 60);
        return `<div class="wk-block ${isRun ? 'run' : ''}" data-id="${e.id}" style="left:${pct(a)}%;width:${Math.max(0.5, pct(b) - pct(a))}%;background:${esc(S.projectColor(e.project, e.client))}"
          title="${esc(e.description)} · ${esc(e.project || '')} · ${U.fmtH(S.entryHours(e))}h">${esc(e.description)}</div>`;
      }).join('');
      const nowMark = keys[i] === today && mins(nowD) >= lo && mins(nowD) <= hi ? `<div style="position:absolute;top:-2px;bottom:-2px;left:${pct(mins(nowD))}%;width:2px;background:var(--text)"></div>` : '';
      return `<div class="wk-row ${keys[i] === today ? 'today' : ''} ${m === 'day' ? 'big' : ''}"><span class="d">${U.dayLabel(d)}</span><div class="tr">${blocks}${nowMark}</div><span class="h">${h ? U.fmtH1(h) + ' h' : ''}</span></div>`;
    }).join('');
    const ticks = []; for (let t = Math.ceil(lo / 60); t * 60 <= hi; t += (span > 600 ? 2 : 1)) ticks.push(`<span style="left:${pct(t * 60)}%">${t}</span>`);
    el.innerHTML = `<div class="panel"><div class="view-head"><div class="grow"><div class="view-title" style="font-size:14px">${label}<span class="muted" style="font-size:12px;font-weight:400">${range}</span></div></div>
      <div style="display:flex;gap:4px;align-items:center">${seg('day', 'Day')}${seg('7days', '7 days')}${seg('week', 'This week')}<span class="muted mono" style="margin-left:8px">${U.fmtH1(total)} h</span></div></div>
      ${rows}<div class="wk-axis">${ticks.join('')}</div></div>`;
  }

  function setup(el, redraw, track) {
    el.addEventListener('click', e => {
      const md = e.target.closest('[data-mode]'), b = e.target.closest('.wk-block');
      if (md) return setMode(md.dataset.mode);
      if (b) { const en = S.entries.find(x => x.id === +b.dataset.id); if (en) { S.select({ type: 'entry', id: en.id }); Timesheet.editEntry(en); } }
    });
    let n = 0; track(S.on('tick', () => { if (S.timer() && ++n % 30 === 0) redraw(); }));   // the running block grows
  }
  U.definePanel('week', { title: 'Week', events: ['data', 'scope', 'weekmode'], render, setup });
})();
