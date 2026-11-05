/* Boot: load data, set the scope, build the dock. */
(async function () {
  const root = document.documentElement, store = (k, v) => { try { v ? localStorage.setItem('clockin.' + k, v) : localStorage.removeItem('clockin.' + k); } catch (e) { /* ok */ } };
  const PALETTES = [['', 'Mint', '#3DDC97'], ['ocean', 'Ocean', '#2F6FE0'], ['poppy', 'Poppy', '#E0443D'], ['sun', 'Sun', '#F2B01E'], ['spectrum', 'Spectrum', 'linear-gradient(90deg,#7B2A6F,#0B5CA8,#1F8A4C,#FDB927,#E8541F,#DC2323)']];
  const setMode = m => { m ? root.setAttribute('data-theme', m) : root.removeAttribute('data-theme'); store('theme', m); };
  const setPalette = p => { p ? root.setAttribute('data-palette', p) : root.removeAttribute('data-palette'); store('palette', p); };
  document.getElementById('themeBtn').onclick = e => {
    const mode = root.getAttribute('data-theme') || '', pal = root.getAttribute('data-palette') || '';
    U.menuAt(e.currentTarget, [{ header: 'Colour' }, ...PALETTES.map(([k, label, c]) => ({ label, swatch: c, checked: pal === k, onClick: () => setPalette(k) })), { sep: true },
      { header: 'Appearance' }, ...[['', 'Follow system'], ['light', 'Light'], ['dark', 'Dark']].map(([k, label]) => ({ label, checked: mode === k, onClick: () => setMode(k) }))]);
  };
  S.initScope();
  try { await S.refresh(); } catch (e) { U.fail(e); document.getElementById('topStatus').textContent = 'Offline'; }
  TimerBar.render();
  Workspaces.init();
  S.poll();
  S.on('data', () => { document.getElementById('topStatus').textContent = ''; });
  // ? menu: the tour and the keyboard shortcuts. The tour also opens by itself once per browser.
  const SHORTCUTS = [['⌘1', 'Tasks'], ['⌘2', 'Timesheet'], ['⌘3', 'Week'], ['⌘4', 'Presets'], ['⌘5', 'Inspector'], ['⌘6', 'Projects'], ['⌘0', 'Navigator'],
    ['Enter', 'in the timer box: start a timer'], ['Esc', 'close a menu, dialog or the tour'], ['← →', 'move through the tour']];
  const helpBtn = document.getElementById('helpBtn');
  if (helpBtn) helpBtn.onclick = e => U.menuAt(e.currentTarget, [{ header: 'Help' },
    { label: 'Take the tour', disabled: !window.Tour, onClick: () => window.Tour && Tour.start() },
    { label: 'Keyboard shortcuts', onClick: () => U.dialog({ title: 'Keyboard shortcuts', body: `<table class="keys">${SHORTCUTS.map(([k, d]) => `<tr><td><kbd>${U.esc(k)}</kbd></td><td>${U.esc(d)}</td></tr>`).join('')}</table>` }) },
    ...(window.SenderDialog ? [{ label: 'Your invoice details…', onClick: () => SenderDialog.open() }] : [])]);
  if (window.Tour && !U.pref('tourDone', false)) setTimeout(() => { if (!Tour.isOpen()) Tour.start(); }, 700);

  window.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && /^[0-9]$/.test(e.key)) {
      const map = { 1: 'tasks', 2: 'timesheet', 3: 'week', 4: 'presets', 5: 'inspector', 0: 'navigator', 6: 'projects' };
      if (map[e.key]) { e.preventDefault(); Workspaces.reveal(map[e.key]); }
    }
  });
})();
