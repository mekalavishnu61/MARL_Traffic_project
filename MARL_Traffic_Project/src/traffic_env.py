import traci
import numpy as np


class TrafficEnv:

    def __init__(self, config, gui=False):
        self.config = config
        self.gui = gui
        self.tls = []

    def start(self):
        sumo_cmd = "sumo-gui" if self.gui else "sumo"
        traci.start([sumo_cmd, "-c", self.config, "--no-warnings"])
        self.tls = list(traci.trafficlight.getIDList())

    def step(self):
        traci.simulationStep()

    def reset(self):
        traci.close()
        self.start()

    def close(self):
        try:
            traci.close()
        except traci.exceptions.FatalTraCIError:
            pass

    def get_state(self, tls_id):
        """10-dim observation: 4 halt counts, 4 wait times, phase index, time fraction."""
        lanes = traci.trafficlight.getControlledLanes(tls_id)
        unique_lanes = list(dict.fromkeys(lanes))

        halt = []
        wait = []
        for lane in unique_lanes[:4]:
            halt.append(traci.lane.getLastStepHaltingNumber(lane))
            wait.append(traci.lane.getWaitingTime(lane))

        while len(halt) < 4:
            halt.append(0.0)
        while len(wait) < 4:
            wait.append(0.0)

        phase = traci.trafficlight.getPhase(tls_id)
        num_phases = len(traci.trafficlight.getAllProgramLogics(tls_id)[0].phases)
        phase_norm = phase / max(num_phases - 1, 1)

        sim_time = traci.simulation.getTime()
        end_time = 1000.0
        time_frac = min(sim_time / end_time, 1.0)

        halt_norm = [min(h / 15.0, 1.0) for h in halt]
        wait_norm = [min(w / 200.0, 1.0) for w in wait]

        state = halt_norm + wait_norm + [phase_norm, time_frac]
        return np.array(state, dtype=np.float32)

    def get_all_states(self):
        return {tls_id: self.get_state(tls_id) for tls_id in self.tls}

    def get_metrics(self):
        """Return (total_waiting, total_halting, arrived) across all lanes."""
        total_waiting = 0.0
        total_halting = 0
        all_lanes = traci.lane.getIDList()

        for lane in all_lanes:
            total_waiting += traci.lane.getWaitingTime(lane)
            total_halting += traci.lane.getLastStepHaltingNumber(lane)

        throughput = traci.simulation.getArrivedNumber()
        return total_waiting, total_halting, throughput
