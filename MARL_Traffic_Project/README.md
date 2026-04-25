# Multi-Agent Reinforcement Learning for Traffic Signal Control

This project applies Deep Q-Network (DQN) based multi-agent reinforcement
learning to coordinate traffic signals across grid road networks simulated
in SUMO. An interactive dashboard visualises the training results and
model comparisons.

## Architecture Overview

```
Python Backend (src/)  <-- TraCI -->  SUMO Simulator (sumo_networks/)
        |
        | writes CSV
        v
   results/           <-- HTTP -->   serve.py (JSON API)
    metrics.csv                           |
    rewards.csv                      frontend/
                                       index.html, js/, css/
```

## Directory Layout

```
MARL_Traffic_Project/
├── src/
│   ├── agent.py              DQN agent with replay buffer
│   ├── traffic_env.py        SUMO environment wrapper
│   ├── reward.py             Multi-objective reward function
│   ├── train.py              Training loop
│   ├── evaluate.py           Model evaluation + baseline comparison
│   ├── baseline_fixed.py     Fixed-time signal baseline
│   ├── plot_results.py       Static chart generation
│   └── generate_network.py   SUMO grid network generator
├── sumo_networks/            SUMO net/route/config files
├── results/                  CSV outputs + plot files
├── frontend/
│   ├── index.html
│   ├── css/styles.css
│   └── js/  (data.js, charts.js, app.js)
├── serve.py                  HTTP server + API
├── requirements.txt
└── README.md
```

## Prerequisites

- **Python 3.8+**
- **SUMO 1.14+** with `SUMO_HOME` environment variable set
- A modern browser for the dashboard

## Setup

```bash
pip install -r requirements.txt
```

## Running the Full Pipeline

```bash
# 1. Generate SUMO grid networks (3x3 and 5x5)
cd src
python generate_network.py

# 2. Train agents (Independent DQN + cooperative MARL)
python train.py

# 3. Evaluate all three strategies and write metrics.csv
python evaluate.py

# 4. Generate static plots (optional)
python plot_results.py

# 5. Launch the dashboard
cd ..
python serve.py
# Open http://localhost:8000
```

## How Training Works

1. SUMO is launched with the 3x3 grid config via TraCI.
2. One DQN agent is created per traffic light intersection.
3. Each episode runs 1000 simulation steps. Agents observe local
   state (halting counts, waiting times, phase), pick actions via
   epsilon-greedy, and receive shaped rewards.
4. `train.py` first trains in **independent** mode (each agent
   optimises locally), then in **cooperative** mode (agents share
   a global reward component penalising network-wide congestion).
5. Episode rewards and losses are saved to `results/rewards.csv`.

### Key Hyperparameters

| Parameter | Value |
|-----------|-------|
| State dim | 10 |
| Action dim | 4 |
| Hidden layers | 2 x 128 (ReLU) |
| Learning rate | 0.001 |
| Gamma | 0.99 |
| Buffer size | 10 000 |
| Epsilon decay | 0.96 per episode |

## Evaluation

`evaluate.py` compares three strategies:

- **Fixed Time** -- SUMO's built-in signal plans
- **Independent DQN** -- each agent trained in isolation
- **Proposed MARL** -- cooperative training with global reward

Results are written to `results/`:

- `metrics.csv` – per-model summary
- `intersection_metrics.json` – per-intersection breakdown
- `temporal_metrics.json` – per-step queue/waiting time-series
- `action_freq.json` – action selection frequencies per agent
- `qvalues.json` – Q-value matrix and surface from trained models
- `coordination.json` – inter-agent action correlation matrix

## Dashboard

The frontend is a single-page application with six sections:

| Page | What it shows |
|------|---------------|
| Dashboard | KPI cards, bar chart, radar, metrics table |
| Training | Reward curves, violin plot, convergence, loss |
| Topology | Grid heatmap, intersection bars, coordination matrix |
| Analytics | Queue time-series, histogram, box plot, sunburst |
| Configuration | Architecture visualiser, hyperparameter controls |
| Intelligence | Q-value surface, action frequencies, agent ranking |

`serve.py` serves the frontend files and exposes `/api/metrics`
and `/api/rewards` as JSON endpoints that read the CSV results.
When the page is opened without the server, built-in placeholder
data is shown instead.

## Technologies

| Category | Tool |
|----------|------|
| Simulation | SUMO + TraCI |
| Deep Learning | PyTorch |
| Data | NumPy, Pandas |
| Visualisation | Plotly.js, Matplotlib, Seaborn |
| Frontend | HTML / CSS / JavaScript |
