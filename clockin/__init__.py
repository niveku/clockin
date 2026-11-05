"""Clock-in': time tracking, projects and tasks in one small local app."""
import threading
import time

from flask import Flask, jsonify, render_template

from . import settings, store
from .recurrence import UserError, run_materialize
from .store import UnsafeWrite


def create_app(data_dir=None):
    cfg = settings.load(data_dir)
    settings.SETTINGS.clear()
    settings.SETTINGS.update(cfg)
    store.P.configure(cfg["data_dir"], cfg.get("tasks_file"))

    app = Flask(__name__, template_folder=str(settings.ROOT / "templates"),
                static_folder=str(settings.ROOT / "static"))
    app.config["TEMPLATES_AUTO_RELOAD"] = True
    # Only answer to known Host headers (blocks DNS rebinding); the port is ignored.
    app.config["TRUSTED_HOSTS"] = ["localhost", "127.0.0.1", *([cfg["host"]] if cfg["host"] not in ("0.0.0.0", "") else []),
                                   *cfg.get("trusted_hosts", [])]

    from .api import clients, projects, settings as settings_api, state, tasks, time as time_api
    for mod in (state, tasks, projects, clients, time_api, settings_api):
        app.register_blueprint(mod.bp)

    @app.route("/")
    def index():
        return render_template("index.html")

    @app.errorhandler(UnsafeWrite)
    def _unsafe(e):
        return jsonify({"error": str(e)}), 500

    @app.errorhandler(UserError)
    def _user_error(e):
        return jsonify({"error": str(e)}), 400

    @app.errorhandler(ValueError)
    def _bad_value(e):
        return jsonify({"error": f"Invalid value: {e}"}), 400

    return app


def start_background_jobs():
    """Hourly: create repeating-task copies whose show-date has arrived (also done on every /api/state)."""
    def loop():
        while True:
            try:
                run_materialize()
            except Exception as e:                       # keep the loop alive
                print("materialize failed:", e, flush=True)
            time.sleep(3600)
    threading.Thread(target=loop, daemon=True).start()
