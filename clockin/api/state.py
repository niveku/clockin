from flask import Blueprint, jsonify

from .. import services, store
from ..recurrence import run_materialize, with_missed
from ..settings import SETTINGS

bp = Blueprint("state", __name__)


@bp.route("/api/state")
def state():
    """Everything the panels share, in one round trip. Entries are fetched per range via /api/entries."""
    try:
        run_materialize()                                    # recurring tasks whose show-date has arrived
    except Exception as e:                                   # never let one bad series take the whole app down
        print("materialize failed:", e, flush=True)
    store.mutate_projects(services.assign_colors, only_if_changed=True)
    entries, clients = store.load_entries(), store.load_clients()
    timer, auto_stopped = services.resolve_timer()
    options = {"": services.options_for(entries)}
    for c in clients:
        options[c["name"]] = services.options_for(entries, c["name"])
    return jsonify({
        "projects": services.aggregate_projects(entries, store.load_project_meta()),
        "clients": clients,
        "tasks": with_missed(store.load_tasks()),
        "options": options,
        "presets": store.load_presets(),
        "timer": timer,
        "auto_stopped": auto_stopped,
        "settings": {"currency": SETTINGS["currency"], "email_template": SETTINGS["email_template"],
                     "signature": SETTINGS["sender"].get("signature", ""),
                     "payment_lines": SETTINGS["sender"].get("payment_lines", []),
                     "sender_ready": bool((SETTINGS["sender"].get("name") or "").strip())},
        "palette": services.PROJECT_PALETTE,
        "statuses": services.STATUSES,
    })
