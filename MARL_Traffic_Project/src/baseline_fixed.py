import traci
import numpy as np

SIM_STEPS = 1000


def run_fixed(config):
    """Run SUMO with default fixed-time plans and return (avg_wait, avg_queue, throughput)."""
    traci.start(["sumo", "-c", config, "--no-warnings"])

    waiting_per_step = []
    queue_per_step = []
    throughput = 0

    for _ in range(SIM_STEPS):
        traci.simulationStep()
        lanes = traci.lane.getIDList()
        waiting_per_step.append(sum(traci.lane.getWaitingTime(l) for l in lanes))
        queue_per_step.append(sum(traci.lane.getLastStepHaltingNumber(l) for l in lanes))
        throughput += traci.simulation.getArrivedNumber()

    traci.close()
    return np.mean(waiting_per_step), np.mean(queue_per_step), throughput
