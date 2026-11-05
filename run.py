"""Start Clock-in'.   CLOCKIN_DATA_DIR=./data CLOCKIN_PORT=5002 python3 run.py"""
from clockin import ANY_HOST, create_app, local_names, settings, start_background_jobs

app = create_app()

if __name__ == "__main__":
    start_background_jobs()
    s = settings.SETTINGS
    print(f"Clock-in' · data in {s['data_dir']} · http://{s['host']}:{s['port']}", flush=True)
    if s["host"] in ANY_HOST:
        print(f"  open it from other machines at: {', '.join(local_names())}"
              " (add other names to CLOCKIN_TRUSTED_HOSTS)", flush=True)
    app.run(host=s["host"], port=s["port"])
