import csv
import io
from datetime import datetime, timedelta

from flask import Blueprint, Response, jsonify, request

from .. import services, store
from ..services import FMT, calc_duration, next_id, safe_cell, with_week
from ..store import P

bp = Blueprint("time", __name__)

PRESET_TEXT = ("label", "description", "project", "area", "operation", "client")


# ── Entries ──────────────────────────────────────────────────────────────────

@bp.route("/api/entries")
def get_entries():
    entries = store.load_entries()
    client, month = request.args.get("client"), request.args.get("month")
    start, end = request.args.get("from"), request.args.get("to")      # inclusive YYYY-MM-DD
    if client:
        entries = [e for e in entries if e.get("client") == client]
    if month:
        entries = [e for e in entries if (e.get("start_time") or "").startswith(month)]
    if start:
        entries = [e for e in entries if (e.get("start_time") or "")[:10] >= start]
    if end:
        entries = [e for e in entries if (e.get("start_time") or "")[:10] <= end]
    entries.sort(key=lambda x: x.get("start_time") or "", reverse=True)
    return jsonify([with_week(e) for e in entries])


def _blank_entry(d, eid, start, end):
    entry = {"id": eid, "client": d.get("client", ""), "description": d.get("description", ""),
             "project": d.get("project", ""), "area": d.get("area", ""), "operation": d.get("operation", ""),
             "start_time": start, "end_time": end,
             "duration_hours": calc_duration(start, end) if start and end else None,
             "observations": d.get("observations", ""), "link": d.get("link", "")}
    for k in ("task_id", "preset_id"):
        if d.get(k):
            entry[k] = d[k]
    return entry


@bp.route("/api/entries", methods=["POST"])
def create_entry():
    d = request.json or {}

    def add(entries):
        e = _blank_entry(d, next_id(entries), d.get("start_time", ""), d.get("end_time", ""))
        e["duration_hours"] = e["duration_hours"] or 0
        entries.append(e)
        return e
    return jsonify(with_week(store.mutate_entries(add))), 201


@bp.route("/api/entries/<int:eid>", methods=["PUT"])
def update_entry(eid):
    d = request.json or {}
    with store.locked(P.entries, P.timer):
        entries = store.load_entries()
        entry = next((e for e in entries if e["id"] == eid), None)
        if not entry:
            return jsonify({"error": "Not found"}), 404
        for f in ("client", "description", "project", "area", "operation", "start_time",
                  "end_time", "observations", "link"):
            if f in d:
                entry[f] = d[f]
        s, e = entry.get("start_time"), entry.get("end_time")
        if s and e:
            entry["duration_hours"] = calc_duration(s, e)
        if "end_time" in d:                       # editing the end time counts as reviewing an auto-stop
            entry.pop("auto_stopped", None)
        store.safe_write_json(P.entries, entries)
        timer = store.load_timer()
        if "start_time" in d and timer and timer.get("entry_id") == eid and s:
            try:
                timer["start_time"] = s
                timer["start_epoch"] = datetime.strptime(s, FMT).timestamp()
                store.write_timer(timer)
            except ValueError:
                pass
    return jsonify(with_week(entry))


@bp.route("/api/entries/<int:eid>", methods=["DELETE"])
def delete_entry(eid):
    store.mutate_entries(lambda rows: rows.__setitem__(slice(None), [e for e in rows if e["id"] != eid]),
                         allow_shrink=1)
    return jsonify({"ok": True})


# ── Timer ────────────────────────────────────────────────────────────────────

@bp.route("/api/timer")
def get_timer():
    timer, auto = services.resolve_timer()
    return jsonify({"auto_stopped": auto} if auto else timer)


@bp.route("/api/timer/start", methods=["POST"])
def start_timer():
    d = request.json or {}
    now = datetime.now()
    with store.locked(P.entries, P.timer):
        entries = store.load_entries()
        entry = _blank_entry(d, next_id(entries), now.strftime(FMT), "")
        entries.append(entry)
        store.safe_write_json(P.entries, entries)
        store.write_timer({k: entry[k] for k in ("client", "description", "project", "area", "operation", "start_time")}
                          | {"entry_id": entry["id"], "start_epoch": now.timestamp()})
    return jsonify(with_week(entry)), 201


@bp.route("/api/timer/stop", methods=["POST"])
def stop_timer():
    with store.locked(P.entries, P.timer):
        timer = store.load_timer()
        if not timer:
            return jsonify({"error": "No active timer"}), 400
        entries = store.load_entries()
        entry = next((e for e in entries if e["id"] == timer.get("entry_id")), None)
        if not entry:
            store.clear_timer()
            return jsonify({"error": "Entry not found"}), 404
        entry["end_time"] = datetime.now().strftime(FMT)
        entry["duration_hours"] = calc_duration(entry["start_time"], entry["end_time"])
        store.safe_write_json(P.entries, entries)
        store.clear_timer()
    return jsonify(with_week(entry))


@bp.route("/api/timer", methods=["DELETE"])
def discard_timer():
    """Abort an accidental start: remove the running entry and clear the timer."""
    with store.locked(P.entries, P.timer):
        timer = store.load_timer()
        if not timer:
            return jsonify({"error": "No active timer"}), 400
        store.safe_write_json(P.entries, [e for e in store.load_entries() if e["id"] != timer.get("entry_id")],
                              allow_shrink=1)
        store.clear_timer()
    return jsonify({"ok": True})


@bp.route("/api/timer", methods=["PATCH"])
def patch_timer():
    d = request.json or {}
    with store.locked(P.entries, P.timer):
        timer = store.load_timer()
        if not timer:
            return jsonify({"error": "No active timer"}), 400
        entries = store.load_entries()
        entry = next((e for e in entries if e["id"] == timer.get("entry_id")), None)
        if not entry:
            return jsonify({"error": "Entry not found"}), 404
        for f in ("description", "project", "area", "operation", "observations", "link"):
            if f in d:
                entry[f] = d[f]
                if f in timer:
                    timer[f] = d[f]
        if d.get("start_time"):
            try:
                ts = datetime.strptime(d["start_time"], FMT)
                entry["start_time"] = timer["start_time"] = d["start_time"]
                timer["start_epoch"] = ts.timestamp()
            except ValueError:
                pass                                  # ignore a malformed start, keep the rest of the edit
        store.write_timer(timer)
        store.safe_write_json(P.entries, entries)
    return jsonify(with_week(entry))


# ── Presets and quick start ──────────────────────────────────────────────────

@bp.route("/api/presets")
def get_presets():
    presets, client = store.load_presets(), request.args.get("client")
    if client:
        presets = [p for p in presets if p.get("client") == client]
    return jsonify(presets)


@bp.route("/api/presets", methods=["PUT"])
def put_presets():
    body = request.get_json()
    if not isinstance(body, list):
        return jsonify({"error": "Expected a list of presets"}), 400
    for p in body:
        if not (isinstance(p, dict) and type(p.get("id")) is int
                and all(isinstance(p.get(k), (str, type(None))) for k in PRESET_TEXT)):
            return jsonify({"error": "Each preset needs a whole-number id and text fields"}), 400
    store.mutate_presets(lambda rows: rows.__setitem__(slice(None), body), allow_shrink=len(store.load_presets()))
    return jsonify(body)


@bp.route("/api/preset-memory")
def get_preset_memory():
    return jsonify(services.preset_memory(store.load_entries(), request.args.get("preset_id", type=int),
                                          request.args.get("project", ""), request.args.get("client", "")))


@bp.route("/api/quickstart")
def quickstart():
    """Presets with remembered labels, plus a seed (project/area/operation/description) for every
    open task that has a client. Repeating tasks show once, labelled "(+n)" when more are open."""
    active = request.args.get("client") or ""
    entries = store.load_entries()
    presets = [p for p in store.load_presets() if not active or p.get("client") == active]
    presets = [services.seed_preset(entries, p) for p in presets]

    buttons = []
    for t in store.load_tasks():
        if t.get("done") or t.get("someday") or _not_yet(t):
            continue
        client = t.get("client") or ""
        if not client or (active and client != active):
            continue
        b = services.seed_task(entries, t, client)
        b["series_id"], b["occurrence"] = t.get("series_id"), t.get("occurrence") or ""
        buttons.append(b)
    by_series, singles = {}, []
    for b in buttons:
        (by_series.setdefault(b["series_id"], []) if b["series_id"] else singles).append(b)
    for occ in by_series.values():
        occ.sort(key=lambda b: b["occurrence"])
        if len(occ) > 1:
            occ[0]["task"] = f'{occ[0]["task"]} (+{len(occ) - 1})'
        singles.append(occ[0])
    today = datetime.now().date().isoformat()
    singles.sort(key=lambda t: (0 if (t.get("due") or "9999-12-31") < today else 1, t.get("due") or "9999-12-31"))
    return jsonify({"presets": presets, "projects": [], "tasks": singles, "warnings": []})


def _not_yet(t):
    """A repeating copy stays hidden until its show-date (due − lead_days)."""
    r = t.get("recurrence")
    if not isinstance(r, dict) or not t.get("due"):
        return False
    try:
        show = datetime.strptime(t["due"], "%Y-%m-%d").date() - timedelta(days=int(r.get("lead_days", 3)))
    except (ValueError, TypeError):
        return False
    return show > datetime.now().date()


# ── Lookups ──────────────────────────────────────────────────────────────────

@bp.route("/api/options")
def get_options():
    return jsonify(services.options_for(store.load_entries(), request.args.get("client")))


@bp.route("/api/project-names")
def project_names():
    client, show_all = request.args.get("client"), request.args.get("all") == "true"
    projects = list(store.load_project_meta().values())
    if client:
        projects = [p for p in projects if p.get("client") == client]
    if not show_all:
        projects = [p for p in projects if p.get("status") in ("active", "on_hold")]
    return jsonify(sorted(p["name"] for p in projects))


# ── CSV export ───────────────────────────────────────────────────────────────

@bp.route("/api/export")
def export_csv():
    month = request.args.get("month", datetime.now().strftime("%Y-%m"))
    client = request.args.get("client")
    rows = sorted((e for e in store.load_entries()
                   if (e.get("start_time") or "").startswith(month) and (not client or e.get("client") == client)),
                  key=lambda x: x.get("start_time") or "")
    out = io.StringIO()
    w = csv.DictWriter(out, fieldnames=["Week", "Client", "Description", "Project", "Observations", "Area",
                                        "Operation", "Start Time", "End time", "Duration (hours)", "Link"])
    w.writeheader()
    for e in rows:
        e = with_week(e)
        t = lambda k: safe_cell(e.get(k, ""))
        w.writerow({"Week": e.get("week", ""), "Client": t("client"), "Description": t("description"),
                    "Project": t("project"), "Observations": t("observations"),
                    "Area": t("area"), "Operation": t("operation"),
                    "Start Time": t("start_time"), "End time": t("end_time"),
                    "Duration (hours)": e.get("duration_hours", ""), "Link": t("link")})
    y, m = month.split("-")
    fname = f"{m}_{y}_{client.replace(' ', '_') if client else 'all'}_hours.csv"
    return Response(out.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": f"attachment; filename={fname}"})
