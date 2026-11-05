# Clock-in'

A small, local time tracker with projects and tasks on the same screen. One timer, one task list, one
timesheet, and a dock you can rearrange. Your data stays in plain JSON files on your machine.

- **Track time** with one click from any task or preset, or type what you're doing and press Enter.
- **Plan work**: projects, tasks, subtasks, contexts, and repeating tasks that stack up when you miss one.
- **See it all at once**: Navigator, Tasks, Timesheet, Week, Presets and Inspector are panels you can tab,
  split, float, collapse to a rail, and save as named workspaces.
- **Pricing is optional.** Give a client a rate and you get money totals and invoices (timesheet `.xlsx` +
  invoice `.pdf` + email text). Leave it empty and that client is only ever tracked in hours.

## Run it

```bash
pip install -r requirements.txt
python3 tools/seed_demo.py ./data     # optional: demo data, so there's something to look at
python3 run.py                        # http://127.0.0.1:5002
```

Your data lives in `CLOCKIN_DATA_DIR` (default `./data`): `entries.json`, `clients.json`, `projects.json`,
`tasks.json`, `presets.json` and the running `.timer.json`. Every write takes a file lock, keeps a rolling
backup in `data/backups/rolling/` (newest 50 per file) and refuses to silently drop records.

| Environment variable | Default | |
|---|---|---|
| `CLOCKIN_DATA_DIR` | `./data` | where your files live |
| `CLOCKIN_HOST` / `CLOCKIN_PORT` | `127.0.0.1` / `5002` | use `0.0.0.0` to reach it from another machine on your network (there's no login, so only do this on a network you trust) |
| `CLOCKIN_SETTINGS` | `<data dir>/settings.json` | see `settings.example.json` |

Run **one** copy against a data folder. Several processes work (writes are locked), but one is simpler.

## Settings

Your invoice details (name, address, picture, how to pay you, notes, email text and currency) are set in the app:
**? → Your invoice details…**, or the form opens by itself the first time you make an invoice. They're saved to
`data/settings.json` (readable only by you).

For the rest, copy `settings.example.json` to `data/settings.json`: your default areas and operations, how long a
forgotten timer may run before it's stopped (default 8 h), and the host and port. Nothing personal is in the code.

## The screen

| Panel | What it does |
|---|---|
| Timer bar | Always visible. Start by typing, stop, switch, discard, open the details. |
| Navigator | Sets the scope for everything: Now, Unfiled, All projects, then clients and projects. Drag tasks onto it to file them; drag a project onto a client to move it. |
| Tasks | The open list for the scope, with a ▶ on every row. Right-click for more. |
| Timesheet | Entries for the scope and period (this/last week or month, all). Columns, CSV, add/edit, invoice. |
| Week | Day, 7-day or week timeline; click a block to edit it. |
| Presets | One-click timers that remember the labels you used last time, per project. |
| Inspector | Edits the running timer, a task (repeat rules included) or a project. |
| Projects | Cards with hours, what the time went on, and deadlines. |

Workspaces (top bar): **Plan**, **Track** (used automatically in narrow windows), **Review**, **Timer** (just the
clock, for a small window), or save your own. Drag tabs to rearrange; the ‹ button folds a panel into a strip.
Layouts are stored in your browser. `⌘1…⌘6` jump to a panel.

The first time you open Clock-in' a one-minute tour shows you around. Replay it from **? → Take the tour**.

## Tests

```bash
python3 tests/smoke.py      # end-to-end API checks on throwaway demo data
```

## Credits and licence

The docking uses [dockview-core](https://github.com/mathuo/dockview) 8.6.1 (MIT), vendored in
`static/vendor/dockview-core/`. Only its open-source core is used.
This project's own licence is not chosen yet.
