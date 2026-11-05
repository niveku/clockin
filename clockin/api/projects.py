from flask import Blueprint, jsonify, request

from .. import services, store
from ..store import P

bp = Blueprint("projects", __name__)


@bp.route("/api/projects")
def list_projects():
    return jsonify(services.aggregate_projects(store.load_entries(), store.load_project_meta()))


@bp.route("/api/projects", methods=["POST"])
def create_project():
    d = request.json or {}
    name, client = (d.get("name") or "").strip(), (d.get("client") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400

    def add(meta):
        if (name, client) in meta:
            return None
        meta[(name, client)] = services.new_project(
            name, client, status=d.get("status") or "active", description=d.get("description") or "",
            deadline=d.get("deadline") or None, notes=d.get("notes") or "")
        return meta[(name, client)]

    rec = store.mutate_projects(add)
    if rec is None:
        return jsonify({"error": "Project already exists for this client"}), 409
    return jsonify(rec), 201


@bp.route("/api/projects/<path:name>", methods=["PUT"])
def update_project(name):
    """Identify the project by (name, ?client=<old client>). A different `client` in the body
    moves the project, its entries and its tasks; a different `name` renames it everywhere."""
    old_client = (request.args.get("client") or "").strip()
    d = request.json or {}
    new_client = d["client"].strip() if "client" in d else old_client
    client_changed = "client" in d and new_client != old_client
    new_name = (d.get("name") or name).strip() if "name" in d else name
    if not new_name:
        return jsonify({"error": "Project name can't be empty"}), 400
    renamed = new_name != name
    if "color" in d and d["color"] not in services.PROJECT_PALETTE:
        return jsonify({"error": "Pick one of the palette colours"}), 400

    def apply(meta):
        m = services.ensure_project_meta(name, old_client, meta)
        if (client_changed or renamed) and (new_name, new_client) in meta:
            return None, f"{new_client or '(no client)'} already has a project called {new_name}"
        for f in ("status", "description", "deadline", "notes", "client", "color"):
            if f in d:
                m[f] = (d[f] or None) if f == "deadline" else d[f]
        if client_changed:
            meta.pop((name, old_client), None)
            meta[(name, new_client)] = m
            _move_to_client(name, old_client, new_client)
        if renamed:
            meta.pop((name, new_client), None)
            m["name"] = new_name
            meta[(new_name, new_client)] = m
            _rename_everywhere(name, new_name, new_client,
                               others=any(n == name and c != new_client for n, c in meta))
        return m, None

    rec, err = store.mutate_projects(apply)
    if err:
        return jsonify({"error": err}), 409
    return jsonify(rec)


def _move_to_client(name, old_client, new_client):
    def entries(rows):
        for e in rows:
            if e.get("project") == name and (e.get("client") or "") == old_client:
                e["client"] = new_client

    def tasks(rows):
        for t in rows:
            if t.get("project") == name and (t.get("client") or "") == old_client:
                t["client"] = new_client or None

    store.mutate_entries(entries, only_if_changed=True)
    store.mutate_tasks(tasks, only_if_changed=True)


def _rename_everywhere(old, new, client, others):
    """Rename a project wherever its name is stored: entries, tasks, presets and the running timer.
    Tasks with no client only follow when no other client has a project with the old name."""
    def match(rec, allow_blank=False):
        c = rec.get("client") or ""
        return rec.get("project") == old and (c == client or (allow_blank and not c and not others))

    def rename(rows, blank=False):
        for r in rows:
            if match(r, blank):
                r["project"] = new

    store.mutate_entries(rename, only_if_changed=True)
    store.mutate_presets(rename, only_if_changed=True)
    store.mutate_tasks(lambda rows: rename(rows, True), only_if_changed=True)
    with store.file_lock(P.timer):
        timer = store.load_timer()
        if timer and match(timer):
            timer["project"] = new
            store.write_timer(timer)
