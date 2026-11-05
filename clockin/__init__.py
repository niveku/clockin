"""Clock-in': time tracking, projects and tasks in one small local app."""
import threading
import time
from urllib.parse import urlsplit

from flask import Flask, jsonify, render_template, request

from . import settings, store
from .recurrence import UserError, run_materialize
from .store import UnsafeWrite

ANY_HOST = ("0.0.0.0", "::", "")     # bind addresses that mean "every interface", not a host name


def create_app(data_dir=None):
    cfg = settings.load(data_dir)
    settings.SETTINGS.clear()
    settings.SETTINGS.update(cfg)
    store.P.configure(cfg["data_dir"], cfg.get("tasks_file"))

    app = Flask(__name__, template_folder=str(settings.ROOT / "templates"),
                static_folder=str(settings.ROOT / "static"))
    app.config["TEMPLATES_AUTO_RELOAD"] = True
    # Only answer to known Host headers (blocks DNS rebinding); the port is ignored.
    bound = [] if cfg["host"] in ANY_HOST else [cfg["host"]]
    app.config["TRUSTED_HOSTS"] = ["localhost", "127.0.0.1", *bound, *cfg.get("trusted_hosts", [])]

    from .api import clients, projects, settings as settings_api, state, tasks, time as time_api
    for mod in (state, tasks, projects, clients, time_api, settings_api):
        app.register_blueprint(mod.bp)

    @app.before_request
    def _same_origin():
        """Refuse cross-site writes (CSRF), e.g. a form posting to /api/settings/avatar. Browsers send Origin on these."""
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return None
        origin = request.headers.get("Origin")
        if (origin and urlsplit(origin).netloc != request.host) or request.headers.get("Sec-Fetch-Site") == "cross-site":
            return jsonify({"error": "Cross-origin request refused"}), 403

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
