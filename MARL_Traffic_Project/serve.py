"""
Dev server – serves frontend files and exposes JSON API endpoints
for the MARL Traffic dashboard.  Run with: python serve.py
"""

import http.server
import json
import csv
import os

PORT = 8000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
RESULTS_DIR = os.path.join(BASE_DIR, "results")


def read_metrics_csv():
    path = os.path.join(RESULTS_DIR, "metrics.csv")
    if not os.path.exists(path):
        return None

    models, waiting, queue, throughput = [], [], [], []
    with open(path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            models.append(row["Model"])
            waiting.append(float(row["Waiting"]))
            queue.append(float(row["Queue"]))
            throughput.append(float(row["Throughput"]))

    return {
        "models": models,
        "waiting": waiting,
        "queue": queue,
        "throughput": throughput,
    }


def read_rewards_csv():
    path = os.path.join(RESULTS_DIR, "rewards.csv")
    if not os.path.exists(path):
        return None

    dqn_rewards, marl_rewards = [], []
    dqn_losses, marl_losses = [], []

    with open(path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            mode = row.get("mode", "marl")
            reward = float(row["reward"])
            loss = float(row["loss"]) if "loss" in row and row["loss"] else 0.0

            if mode == "independent_dqn":
                dqn_rewards.append(reward)
                dqn_losses.append(loss)
            else:
                marl_rewards.append(reward)
                marl_losses.append(loss)

    return {
        "dqn_rewards": dqn_rewards,
        "marl_rewards": marl_rewards,
        "dqn_losses": dqn_losses,
        "marl_losses": marl_losses,
    }


def read_json_file(filename):
    path = os.path.join(RESULTS_DIR, filename)
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


class DashboardHandler(http.server.SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=FRONTEND_DIR, **kwargs)

    def do_GET(self):
        if self.path == "/api/metrics":
            self._send_json(read_metrics_csv())
        elif self.path == "/api/rewards":
            self._send_json(read_rewards_csv())
        elif self.path == "/api/intersection":
            self._send_json(read_json_file("intersection_metrics.json"))
        elif self.path == "/api/temporal":
            self._send_json(read_json_file("temporal_metrics.json"))
        elif self.path == "/api/qvalues":
            self._send_json(read_json_file("qvalues.json"))
        elif self.path == "/api/actions":
            self._send_json(read_json_file("action_freq.json"))
        elif self.path == "/api/coordination":
            self._send_json(read_json_file("coordination.json"))
        else:
            super().do_GET()

    def _send_json(self, data):
        if data is None:
            self.send_error(404, "Results file not found – run train.py and evaluate.py first")
            return

        body = json.dumps(data).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        # quieter logs — only show request path
        print(f"  {args[0]}")


if __name__ == "__main__":
    server = http.server.HTTPServer(("", PORT), DashboardHandler)
    print(f"MARL Traffic Dashboard running at http://localhost:{PORT}")
    print(f"  Frontend dir : {FRONTEND_DIR}")
    print(f"  Results dir  : {RESULTS_DIR}")
    print(f"  API endpoints: /api/metrics, /api/rewards, /api/intersection,")
    print(f"                 /api/temporal, /api/qvalues, /api/actions, /api/coordination")
    print()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        server.server_close()
