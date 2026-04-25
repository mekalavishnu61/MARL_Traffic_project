import traci

# weights for reward shaping
W_WAIT = 0.5
W_NETWORK = 0.1
W_IMBALANCE = 0.2

# prevent excessively large rewards from destabilising Q-learning
REWARD_CLIP = 20.0


def compute_reward(tls_id, all_tls_ids, cooperative=True):
    """Return a scalar reward for the given traffic light.

    In independent mode only local penalties are used.
    In cooperative mode global queue + imbalance terms are added
    so agents account for network-wide congestion.
    """
    lanes = traci.trafficlight.getControlledLanes(tls_id)
    unique_lanes = list(dict.fromkeys(lanes))

    local_halt = sum(traci.lane.getLastStepHaltingNumber(l)
                     for l in unique_lanes)
    local_wait = sum(traci.lane.getWaitingTime(l) for l in unique_lanes)

    reward = -(local_halt + W_WAIT * local_wait)

    if not cooperative:
        return max(-REWARD_CLIP, reward)

    # normalise global queue by agent count to keep the penalty on the
    # same scale as local terms – avoids gradient / Q-value explosion
    n_agents = max(len(all_tls_ids), 1)
    all_lanes = traci.lane.getIDList()
    total_queue = sum(traci.lane.getLastStepHaltingNumber(l)
                      for l in all_lanes)
    mean_queue = total_queue / n_agents
    reward -= W_NETWORK * mean_queue

    reward -= W_IMBALANCE * abs(local_halt - mean_queue)

    return max(-REWARD_CLIP, reward)
