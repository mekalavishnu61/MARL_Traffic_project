"""Generate static charts from the CSV results produced by evaluate.py and train.py."""

import os
import pandas as pd
import matplotlib.pyplot as plt
import plotly.express as px
import seaborn as sns

PLOTS_DIR = "../results/plots"


def main():
    os.makedirs(PLOTS_DIR, exist_ok=True)

    df = pd.read_csv("../results/metrics.csv")
    models = df["Model"]
    colors = ["#dc2626", "#2563eb", "#059669"]

    fig, axes = plt.subplots(1, 3, figsize=(14, 4))
    for ax, col, ylabel in zip(axes, ["Waiting", "Queue", "Throughput"],
                                ["Waiting Time (s)", "Vehicles", "Vehicles"]):
        ax.bar(models, df[col], color=colors)
        ax.set_title("Average " + col if col != "Throughput" else "Total Throughput")
        ax.set_ylabel(ylabel)
    plt.tight_layout()
    plt.savefig(os.path.join(PLOTS_DIR, "metrics_comparison.png"), dpi=150)
    plt.close()

    rewards_path = "../results/rewards.csv"
    if os.path.exists(rewards_path):
        rdf = pd.read_csv(rewards_path)
        if "reward" in rdf.columns and "mode" in rdf.columns:
            plt.figure(figsize=(10, 5))
            for mode, color, label in [
                ("independent_dqn", "#2563eb", "Independent DQN"),
                ("marl", "#059669", "Proposed MARL"),
            ]:
                subset = rdf[rdf["mode"] == mode]
                if len(subset) == 0:
                    continue
                eps = list(range(len(subset)))
                rewards = subset["reward"].values
                plt.plot(eps, rewards, color=color, linewidth=1, alpha=0.4)
                window = min(5, len(subset))
                smoothed = pd.Series(rewards).rolling(
                    window=window, min_periods=1).mean()
                plt.plot(eps, smoothed, color=color, linewidth=2.5,
                         label=f"{label} (MA-{window})")
            plt.xlabel("Episode")
            plt.ylabel("Cumulative Reward")
            plt.title("Training Reward Curves")
            plt.legend()
            plt.grid(alpha=0.3)
            plt.tight_layout()
            plt.savefig(os.path.join(PLOTS_DIR, "training_rewards.png"), dpi=150)
            plt.close()

    plt.figure(figsize=(6, 4))
    heat_data = df.set_index("Model")[["Waiting", "Queue", "Throughput"]]
    sns.heatmap(heat_data, annot=True, fmt=".1f", cmap="coolwarm", linewidths=0.5)
    plt.title("Model Performance Heatmap")
    plt.tight_layout()
    plt.savefig(os.path.join(PLOTS_DIR, "metrics_heatmap.png"), dpi=150)
    plt.close()

    for col, seq in [("Waiting", px.colors.qualitative.Set3),
                     ("Queue", px.colors.qualitative.Pastel),
                     ("Throughput", px.colors.qualitative.Bold)]:
        fig = px.pie(df, values=col, names="Model",
                     title=f"{col} Distribution", color_discrete_sequence=seq)
        fig.write_html(os.path.join(PLOTS_DIR, f"{col.lower()}_pie.html"))

    scatter_combos = [("Waiting", "Queue", "Throughput"),
                      ("Waiting", "Throughput", "Queue"),
                      ("Queue", "Throughput", "Waiting")]
    for x, y, size in scatter_combos:
        fig = px.scatter(df, x=x, y=y, text="Model",
                         title=f"{x} vs {y}", color="Model", size=size)
        fig.write_html(os.path.join(PLOTS_DIR, f"{x.lower()}_vs_{y.lower()}.html"))

    print("All plots saved in results/plots/")


if __name__ == "__main__":
    main()
