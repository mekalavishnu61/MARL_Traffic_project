import os
import numpy as np
import pandas as pd
from traffic_env import TrafficEnv
from agent import Agent
from reward import compute_reward
import traci

STATE_DIM = 10
ACTION_DIM = 4

EPISODES = 50
STEPS = 1000
LEARN_INTERVAL = 5  # learn every N steps to stabilise training

CONFIG = "../sumo_networks/config_3x3.sumocfg"

os.makedirs("../results", exist_ok=True)


def train(config=CONFIG, episodes=EPISODES, steps=STEPS, cooperative=True):
    """Run the training loop. cooperative=True adds global reward terms (MARL)."""
    env = TrafficEnv(config)
    env.start()

    tls_ids = list(env.tls)
    if not tls_ids:
        env.close()
        raise RuntimeError(
            "No traffic lights found in the network. "
            "Regenerate with --tls.guess enabled."
        )

    n_agents = len(tls_ids)
    agents = {t: Agent(STATE_DIM, ACTION_DIM) for t in tls_ids}

    episode_rewards = []
    episode_losses = []

    tag = "marl" if cooperative else "independent_dqn"
    print(f"Training {'MARL' if cooperative else 'Independent DQN'} "
          f"on {n_agents} intersections for {episodes} episodes")
    print("-" * 60)

    for ep in range(episodes):
        env.reset()
        tls_ids = list(env.tls)
        if not tls_ids:
            print(f"  Warning: no TLS found after reset on episode {ep}, skipping")
            continue
        for t in tls_ids:
            if t not in agents:
                agents[t] = Agent(STATE_DIM, ACTION_DIM)
        states = env.get_all_states()

        ep_reward = 0.0
        ep_loss = 0.0
        loss_count = 0

        for step in range(steps):
            actions = {}
            for t in tls_ids:
                actions[t] = agents[t].act(states[t])

            for t in tls_ids:
                try:
                    traci.trafficlight.setPhase(t, actions[t] % ACTION_DIM)
                except traci.exceptions.TraCIException:
                    pass

            env.step()

            next_states = env.get_all_states()

            for t in tls_ids:
                r = compute_reward(t, tls_ids, cooperative=cooperative)
                done = 1.0 if step == steps - 1 else 0.0

                agents[t].store_transition(
                    states[t], actions[t], r, next_states[t], done
                )

                if step % LEARN_INTERVAL == 0:
                    loss = agents[t].learn()
                    if loss > 0:
                        ep_loss += loss
                        loss_count += 1

                ep_reward += r

            states = next_states

        for t in tls_ids:
            agents[t].decay_epsilon()

        avg_loss = ep_loss / max(loss_count, 1)
        episode_rewards.append(ep_reward)
        episode_losses.append(avg_loss)

        if tls_ids:
            eps_val = agents[tls_ids[0]].epsilon
        else:
            eps_val = 1.0
        print(f"Episode {ep:3d} | Reward: {ep_reward:10.2f} | "
              f"Avg Loss: {avg_loss:.4f} | Epsilon: {eps_val:.3f}")

    env.close()

    for t in tls_ids:
        agents[t].save(f"../results/model_{tag}_{t}.pt")

    print("-" * 60)
    print(f"Training complete. Models saved to results/model_{tag}_*.pt")

    return tag, episode_rewards, episode_losses


if __name__ == "__main__":
    all_frames = []

    tag1, rewards1, losses1 = train(cooperative=False)
    all_frames.append(pd.DataFrame({
        "episode": list(range(len(rewards1))),
        "reward": rewards1,
        "loss": losses1,
        "mode": tag1
    }))

    tag2, rewards2, losses2 = train(cooperative=True)
    all_frames.append(pd.DataFrame({
        "episode": list(range(len(rewards2))),
        "reward": rewards2,
        "loss": losses2,
        "mode": tag2
    }))

    pd.concat(all_frames, ignore_index=True).to_csv(
        "../results/rewards.csv", index=False
    )
    print("Rewards saved to results/rewards.csv")
