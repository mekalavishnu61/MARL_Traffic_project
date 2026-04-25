"""Evaluate all three traffic signal strategies and save detailed metrics.

Outputs:
  metrics.csv               – per-model summary (waiting, queue, throughput)
  intersection_metrics.json – per-intersection breakdown for each model
  temporal_metrics.json     – per-step queue/waiting time-series
  action_freq.json          – action selection frequencies per agent
  qvalues.json              – Q-value matrix and surface from trained models
  coordination.json         – inter-agent action correlation matrix
"""

import os
import json
import glob
import numpy as np
import pandas as pd
import torch
import traci
from traffic_env import TrafficEnv
from agent import Agent
from baseline_fixed import run_fixed

STATE_DIM = 10
ACTION_DIM = 4
STEPS = 1000
SAMPLE_INTERVAL = 5
CONFIG = "../sumo_networks/config_3x3.sumocfg"

os.makedirs("../results", exist_ok=True)


def _controlled_lanes(tls_id):
    return list(dict.fromkeys(traci.trafficlight.getControlledLanes(tls_id)))


def evaluate_fixed(config, steps=STEPS):
    """Run SUMO with default fixed-time plans, collecting detailed metrics."""
    traci.start(["sumo", "-c", config, "--no-warnings"])
    tls_ids = list(traci.trafficlight.getIDList())

    waiting_all, queue_all = [], []
    throughput = 0
    per_w = {t: [] for t in tls_ids}
    per_q = {t: [] for t in tls_ids}
    t_steps, t_queue, t_wait = [], [], []

    for step in range(steps):
        traci.simulationStep()
        lanes = traci.lane.getIDList()
        w = sum(traci.lane.getWaitingTime(l) for l in lanes)
        q = sum(traci.lane.getLastStepHaltingNumber(l) for l in lanes)
        waiting_all.append(w)
        queue_all.append(q)
        throughput += traci.simulation.getArrivedNumber()

        for t in tls_ids:
            ctrl = _controlled_lanes(t)
            per_w[t].append(sum(traci.lane.getWaitingTime(l) for l in ctrl))
            per_q[t].append(
                sum(traci.lane.getLastStepHaltingNumber(l) for l in ctrl))

        if step % SAMPLE_INTERVAL == 0:
            t_steps.append(step)
            t_queue.append(round(q, 2))
            t_wait.append(round(w, 2))

    traci.close()

    avg_w = float(np.mean(waiting_all))
    avg_q = float(np.mean(queue_all))
    max_q = max(
        (float(np.mean(per_q[t])) for t in tls_ids), default=1) or 1

    intersection = {
        "ids": tls_ids,
        "waiting": [round(float(np.mean(per_w[t])), 2) for t in tls_ids],
        "queue":   [round(float(np.mean(per_q[t])), 2) for t in tls_ids],
        "throughput": [
            sum(1 for i in range(1, len(per_q[t]))
                if per_q[t][i] < per_q[t][i - 1])
            for t in tls_ids
        ],
        "efficiency": [
            round(max(0, min(100,
                  (1 - float(np.mean(per_q[t])) / max_q) * 100)), 1)
            for t in tls_ids
        ],
    }

    print(f"  Fixed Time: Waiting={avg_w:.2f}, Queue={avg_q:.2f}, "
          f"Throughput={throughput}")

    return {
        "avg_waiting": avg_w, "avg_queue": avg_q, "throughput": throughput,
        "intersection": intersection,
        "temporal": {"steps": t_steps, "queue": t_queue, "waiting": t_wait},
        "action_freqs": {},
        "actions_per_step": [],
    }


def evaluate_agents(config, model_pattern, label, steps=STEPS):
    """Load saved models, run them on SUMO, and collect detailed metrics."""
    env = TrafficEnv(config)
    env.start()
    tls_ids = list(env.tls)

    agents = {}
    loaded = 0
    for t in tls_ids:
        a = Agent(STATE_DIM, ACTION_DIM)
        path = model_pattern.replace("*", t)
        if os.path.exists(path):
            a.load(path)
            a.epsilon = 0.0
            loaded += 1
        agents[t] = a
    print(f"  Loaded {loaded}/{len(tls_ids)} models for {label}")

    waiting_all, queue_all = [], []
    throughput = 0
    per_w = {t: [] for t in tls_ids}
    per_q = {t: [] for t in tls_ids}
    act_counts = {t: [0] * ACTION_DIM for t in tls_ids}
    act_history = []
    t_steps, t_queue, t_wait = [], [], []

    states = env.get_all_states()

    for step in range(steps):
        step_acts = {}
        for t in tls_ids:
            act = agents[t].act(states[t])
            step_acts[t] = act
            act_counts[t][act % ACTION_DIM] += 1
            try:
                traci.trafficlight.setPhase(t, act % ACTION_DIM)
            except traci.exceptions.TraCIException:
                pass

        act_history.append(step_acts)
        env.step()
        states = env.get_all_states()

        w, q, arrived = env.get_metrics()
        waiting_all.append(w)
        queue_all.append(q)
        throughput += arrived

        for t in tls_ids:
            ctrl = _controlled_lanes(t)
            per_w[t].append(sum(traci.lane.getWaitingTime(l) for l in ctrl))
            per_q[t].append(
                sum(traci.lane.getLastStepHaltingNumber(l) for l in ctrl))

        if step % SAMPLE_INTERVAL == 0:
            t_steps.append(step)
            t_queue.append(round(q, 2))
            t_wait.append(round(w, 2))

    env.close()

    avg_w = float(np.mean(waiting_all))
    avg_q = float(np.mean(queue_all))
    max_q = max(
        (float(np.mean(per_q[t])) for t in tls_ids), default=1) or 1

    intersection = {
        "ids": tls_ids,
        "waiting": [round(float(np.mean(per_w[t])), 2) for t in tls_ids],
        "queue":   [round(float(np.mean(per_q[t])), 2) for t in tls_ids],
        "throughput": [
            sum(1 for i in range(1, len(per_q[t]))
                if per_q[t][i] < per_q[t][i - 1])
            for t in tls_ids
        ],
        "efficiency": [
            round(max(0, min(100,
                  (1 - float(np.mean(per_q[t])) / max_q) * 100)), 1)
            for t in tls_ids
        ],
    }

    freqs = {}
    for t in tls_ids:
        total = sum(act_counts[t])
        freqs[t] = [round(c / max(total, 1), 4) for c in act_counts[t]]

    print(f"  {label}: Waiting={avg_w:.2f}, Queue={avg_q:.2f}, "
          f"Throughput={throughput}")

    return {
        "avg_waiting": avg_w, "avg_queue": avg_q, "throughput": throughput,
        "intersection": intersection,
        "temporal": {"steps": t_steps, "queue": t_queue, "waiting": t_wait},
        "action_freqs": freqs,
        "actions_per_step": act_history,
    }


def compute_qvalues(model_pattern, tls_ids):
    """Load trained models and compute Q-value matrix + surface."""
    agents = {}
    for t in tls_ids:
        a = Agent(STATE_DIM, ACTION_DIM)
        path = model_pattern.replace("*", t)
        if os.path.exists(path):
            a.load(path)
        agents[t] = a

    actions = ["Phase 0", "Phase 1", "Phase 2", "Phase 3"]
    matrix = []
    for t in tls_ids:
        state = np.array([0.3, 0.5, 0.2, 0.4,
                          0.4, 0.6, 0.3, 0.5,
                          0.25, 0.5], dtype=np.float32)
        with torch.no_grad():
            q = agents[t].policy_net(torch.FloatTensor(state).unsqueeze(0))
            matrix.append([round(v, 4) for v in q.squeeze().tolist()])

    res = 25
    xs = [round(i / (res - 1), 3) for i in range(res)]
    ys = [round(i / (res - 1), 3) for i in range(res)]
    first = agents[tls_ids[0]]
    z = []
    for yi in range(res):
        row = []
        for xi in range(res):
            s = np.array([xs[xi], 0.3, 0.2, 0.3,
                          ys[yi], 0.3, 0.2, 0.3,
                          0.25, 0.5], dtype=np.float32)
            with torch.no_grad():
                q = first.policy_net(torch.FloatTensor(s).unsqueeze(0))
                row.append(round(q.max().item(), 4))
        z.append(row)

    return {
        "ids": tls_ids, "actions": actions, "matrix": matrix,
        "surface": {"x": xs, "y": ys, "z": z},
    }


def compute_coordination(act_history, tls_ids):
    """Compute action correlation matrix between agents."""
    n = len(tls_ids)
    steps = len(act_history)
    mat = np.zeros((n, steps))
    for s, acts in enumerate(act_history):
        for i, t in enumerate(tls_ids):
            mat[i, s] = acts.get(t, 0)
    corr = np.corrcoef(mat)
    corr = np.nan_to_num(corr, nan=0.0)
    return [[round(float(corr[i][j]), 4)
             for j in range(n)] for i in range(n)]


def main():
    print("=" * 60)
    print("MARL Traffic Signal Control \u2014 Evaluation")
    print("=" * 60)

    dqn_pattern = "../results/model_independent_dqn_*.pt"
    marl_pattern = "../results/model_marl_*.pt"

    if not glob.glob(dqn_pattern):
        print("WARNING: No Independent DQN model files found. Run train.py first.")
        print("         Continuing with Fixed Time and MARL only.\n")
    if not glob.glob(marl_pattern):
        print("WARNING: No MARL model files found. Run train.py first.")
        print("         Continuing with Fixed Time and Independent DQN only.\n")

    results = {}

    print("\n[1/3] Running Fixed Time baseline...")
    results["Fixed Time"] = evaluate_fixed(CONFIG)

    if glob.glob(dqn_pattern):
        print("\n[2/3] Evaluating Independent DQN agents...")
        results["Independent DQN"] = evaluate_agents(
            CONFIG, dqn_pattern, "Independent DQN")
    else:
        print("\n[2/3] Skipping Independent DQN (no models)...")
        results["Independent DQN"] = evaluate_fixed(CONFIG)

    if glob.glob(marl_pattern):
        print("\n[3/3] Evaluating Proposed MARL agents...")
        results["Proposed MARL"] = evaluate_agents(
            CONFIG, marl_pattern, "Proposed MARL")
    else:
        print("\n[3/3] Skipping Proposed MARL (no models)...")
        results["Proposed MARL"] = evaluate_fixed(CONFIG)

    models = ["Fixed Time", "Independent DQN", "Proposed MARL"]

    # ── metrics.csv ──
    pd.DataFrame({
        "Model": models,
        "Waiting": [round(results[m]["avg_waiting"], 2) for m in models],
        "Queue":   [round(results[m]["avg_queue"], 2)   for m in models],
        "Throughput": [int(results[m]["throughput"])     for m in models],
    }).to_csv("../results/metrics.csv", index=False)

    # ── intersection_metrics.json ──
    inter = {}
    for m in models:
        d = results[m]["intersection"]
        inter[m] = {k: d[k] for k in
                    ("ids", "waiting", "queue", "throughput", "efficiency")}
    with open("../results/intersection_metrics.json", "w") as f:
        json.dump(inter, f)

    # ── temporal_metrics.json ──
    temporal = {"steps": results[models[0]]["temporal"]["steps"]}
    for m in models:
        temporal[m] = {
            "queue":   results[m]["temporal"]["queue"],
            "waiting": results[m]["temporal"]["waiting"],
        }
    with open("../results/temporal_metrics.json", "w") as f:
        json.dump(temporal, f)

    # ── action_freq.json ──
    act_data = {"actions": ["Phase 0", "Phase 1", "Phase 2", "Phase 3"]}
    for m in ("Independent DQN", "Proposed MARL"):
        fq = results[m]["action_freqs"]
        ids = list(fq.keys())
        act_data[m] = {"ids": ids, "frequencies": [fq[t] for t in ids]}
    with open("../results/action_freq.json", "w") as f:
        json.dump(act_data, f)

    # ── qvalues.json ──
    print("\nComputing Q-values from MARL models...")
    tls_ids = results["Proposed MARL"]["intersection"]["ids"]
    qv = compute_qvalues(marl_pattern, tls_ids)
    with open("../results/qvalues.json", "w") as f:
        json.dump(qv, f)

    # ── coordination.json ──
    print("Computing agent coordination matrix...")
    coord = compute_coordination(
        results["Proposed MARL"]["actions_per_step"], tls_ids)
    with open("../results/coordination.json", "w") as f:
        json.dump({"ids": tls_ids, "matrix": coord}, f)

    print("\n" + "=" * 60)
    print("All results saved to results/")
    print("  metrics.csv  intersection_metrics.json  temporal_metrics.json")
    print("  action_freq.json  qvalues.json  coordination.json")
    df = pd.read_csv("../results/metrics.csv")
    print(df.to_string(index=False))
    print("=" * 60)


if __name__ == "__main__":
    main()
