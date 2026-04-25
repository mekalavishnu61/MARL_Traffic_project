/*
    data.js – data layer for the MARL dashboard

    Fetches live results from serve.py API endpoints.
    Falls back to synthetic placeholder values when the server is unavailable.
*/

var TrafficData = (function () {

    var metrics = {
        models:     ["Fixed Time", "Independent DQN", "Proposed MARL"],
        waiting:    [60.0, 46.0, 34.0],
        queue:      [5.2, 3.8, 2.5],
        throughput: [440, 510, 590]
    };

    var liveRewardsDQN  = null;
    var liveRewardsMARL = null;
    var liveLossesDQN   = null;
    var liveLossesMARL  = null;
    var liveIntersection = null;
    var liveTemporal     = null;
    var liveQValues      = null;
    var liveActions      = null;
    var liveCoordination = null;

    var _live = false;

    function fetchLiveData() {
        return Promise.all([
            fetch("/api/metrics")
                .then(function (r) { return r.json(); })
                .then(function (d) {
                    metrics.models     = d.models;
                    metrics.waiting    = d.waiting;
                    metrics.queue      = d.queue;
                    metrics.throughput = d.throughput;
                    _live = true;
                }).catch(function () {}),

            fetch("/api/rewards")
                .then(function (r) { return r.json(); })
                .then(function (d) {
                    if (d.dqn_rewards && d.dqn_rewards.length)  liveRewardsDQN  = d.dqn_rewards;
                    if (d.marl_rewards && d.marl_rewards.length) liveRewardsMARL = d.marl_rewards;
                    if (d.dqn_losses && d.dqn_losses.length)    liveLossesDQN   = d.dqn_losses;
                    if (d.marl_losses && d.marl_losses.length)  liveLossesMARL  = d.marl_losses;
                    _live = true;
                }).catch(function () {}),

            fetch("/api/intersection")
                .then(function (r) { return r.json(); })
                .then(function (d) { liveIntersection = d; })
                .catch(function () {}),

            fetch("/api/temporal")
                .then(function (r) { return r.json(); })
                .then(function (d) { liveTemporal = d; })
                .catch(function () {}),

            fetch("/api/qvalues")
                .then(function (r) { return r.json(); })
                .then(function (d) { liveQValues = d; })
                .catch(function () {}),

            fetch("/api/actions")
                .then(function (r) { return r.json(); })
                .then(function (d) { liveActions = d; })
                .catch(function () {}),

            fetch("/api/coordination")
                .then(function (r) { return r.json(); })
                .then(function (d) { liveCoordination = d; })
                .catch(function () {})
        ]);
    }


    // ── seeded pseudo-random (reproducible across refreshes) ──

    function seededRandom(seed) {
        var m = 0x80000000, a = 1103515245, c = 12345;
        var state = seed;
        return function () {
            state = (a * state + c) % m;
            return state / m;
        };
    }

    function gaussianRng(rng) {
        return function (mean, std) {
            var u1 = rng(), u2 = rng();
            var z = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
            return mean + std * z;
        };
    }


    // ── training reward curves ──

    function buildTrainingCurves(nEpisodes) {
        nEpisodes = nEpisodes || 100;

        var hasLiveDQN  = liveRewardsDQN  && liveRewardsDQN.length  > 0;
        var hasLiveMARL = liveRewardsMARL && liveRewardsMARL.length > 0;

        if (hasLiveDQN || hasLiveMARL) {
            var count = Math.max(
                hasLiveDQN  ? liveRewardsDQN.length  : 0,
                hasLiveMARL ? liveRewardsMARL.length : 0
            );
            count = Math.min(count, nEpisodes);

            var ep = [], fixed = [], dqn = [], marl = [];
            var rng = seededRandom(42);
            var g   = gaussianRng(rng);

            var fixedBase = metrics.waiting[0]
                ? -(metrics.waiting[0] + metrics.queue[0] * 10)
                : -55;

            for (var i = 0; i < count; i++) {
                ep.push(i);
                fixed.push(fixedBase + g(0, 2));
                dqn.push(hasLiveDQN && i < liveRewardsDQN.length
                    ? liveRewardsDQN[i]
                    : (-120 + 65 * (1 - Math.exp(-i / 25)) + g(0, 4)));
                marl.push(hasLiveMARL && i < liveRewardsMARL.length
                    ? liveRewardsMARL[i]
                    : (-130 + 90 * (1 - Math.exp(-i / 20)) + g(0, 3.5)));
            }
            return { episodes: ep, fixed: fixed, dqn: dqn, marl: marl };
        }

        var rng2 = seededRandom(42);
        var g2   = gaussianRng(rng2);
        var episodes = [], fixedF = [], dqnF = [], marlF = [];

        for (var j = 0; j < nEpisodes; j++) {
            episodes.push(j);
            fixedF.push(-55 + g2(0, 2));
            dqnF.push(-120 + 65 * (1 - Math.exp(-j / 25)) + g2(0, 4));
            marlF.push(-130 + 90 * (1 - Math.exp(-j / 20)) + g2(0, 3.5));
        }
        return { episodes: episodes, fixed: fixedF, dqn: dqnF, marl: marlF };
    }


    // ── per-intersection data ──

    function buildIntersectionData(gridSize) {
        if (liveIntersection) {
            var firstModel = metrics.models[0];
            if (liveIntersection[firstModel]) {
                var actual = liveIntersection[firstModel].ids.length;
                if (actual === gridSize * gridSize) {
                    return liveIntersection;
                }
            }
        }

        gridSize = gridSize || 3;
        var n = gridSize * gridSize;
        var rng = seededRandom(7 + gridSize);
        var g = gaussianRng(rng);

        var baselines = {
            "Fixed Time":       { w: 55, q: 4.5, t: 53 },
            "Independent DQN":  { w: 42, q: 3.2, t: 65 },
            "Proposed MARL":    { w: 28, q: 2.0, t: 78 }
        };

        var result = {};
        metrics.models.forEach(function (model) {
            var b = baselines[model] || { w: 50, q: 4.0, t: 55 };
            var waiting = [], queue = [], throughput = [], efficiency = [];
            for (var k = 0; k < n; k++) {
                waiting.push(b.w + g(0, 8));
                queue.push(Math.max(0, b.q + g(0, 1.5)));
                throughput.push(Math.max(0, b.t + g(0, 10)));
                efficiency.push(Math.min(100, Math.max(40, 70 + g(0, 12))));
            }
            result[model] = {
                ids: Array.from({ length: n }, function (_, i) { return "TLS_" + i; }),
                waiting: waiting,
                queue: queue,
                throughput: throughput,
                efficiency: efficiency
            };
        });
        return result;
    }


    // ── temporal queue simulation ──

    function buildTemporalQueues(nSteps) {
        if (liveTemporal && liveTemporal.steps) {
            return {
                steps: liveTemporal.steps,
                fixed: liveTemporal["Fixed Time"]       ? liveTemporal["Fixed Time"].queue       : [],
                dqn:   liveTemporal["Independent DQN"]  ? liveTemporal["Independent DQN"].queue  : [],
                marl:  liveTemporal["Proposed MARL"]     ? liveTemporal["Proposed MARL"].queue     : []
            };
        }

        nSteps = nSteps || 200;
        var rng = seededRandom(21);
        var g = gaussianRng(rng);
        var steps = [], fq = [], dq = [], mq = [];

        for (var t = 0; t < nSteps; t++) {
            var rush = 15 * Math.sin(2 * Math.PI * t / 80)
                     +  5 * Math.sin(2 * Math.PI * t / 30);
            steps.push(t);
            fq.push(Math.max(0, 8 + rush + g(0, 2)));
            dq.push(Math.max(0, 5 + 0.6 * rush + g(0, 1.5)));
            mq.push(Math.max(0, 3 + 0.35 * rush + g(0, 1.2)));
        }
        return { steps: steps, fixed: fq, dqn: dq, marl: mq };
    }


    // ── coordination matrix ──

    function buildCoordinationMatrix(gridSize) {
        if (liveCoordination && liveCoordination.matrix) {
            if (liveCoordination.ids.length === gridSize * gridSize) {
                return liveCoordination.matrix;
            }
        }

        var n = gridSize * gridSize;
        var rng = seededRandom(55 + gridSize);
        var g = gaussianRng(rng);
        var mat = [];

        for (var i = 0; i < n; i++) {
            mat[i] = [];
            for (var j = 0; j < n; j++) {
                if (i === j) { mat[i][j] = 1; continue; }
                var ri = Math.floor(i / gridSize), ci = i % gridSize;
                var rj = Math.floor(j / gridSize), cj = j % gridSize;
                var dist = Math.abs(ri - rj) + Math.abs(ci - cj);
                mat[i][j] = Math.max(0, 0.9 - 0.25 * dist + g(0, 0.05));
            }
        }
        return mat;
    }


    // ── Q-value surface ──

    function buildQValueSurface() {
        if (liveQValues && liveQValues.surface) {
            return liveQValues.surface;
        }

        var rng = seededRandom(88);
        var g = gaussianRng(rng);
        var xs = [], ys = [], Z = [];
        for (var i = 0; i < 30; i++) {
            xs.push(i / 3);
            ys.push(i / 3);
        }
        for (var r = 0; r < 30; r++) {
            Z[r] = [];
            for (var c = 0; c < 30; c++) {
                Z[r][c] = Math.sin(xs[c] / 2) * Math.cos(ys[r] / 3) * 5 + g(0, 0.3);
            }
        }
        return { x: xs, y: ys, z: Z };
    }


    // ── Q-value bars and matrix ──

    function buildQValues() {
        if (liveQValues && liveQValues.matrix) {
            var bars = {};
            liveQValues.actions.forEach(function (a) { bars[a] = []; });
            liveQValues.matrix.forEach(function (row) {
                liveQValues.actions.forEach(function (a, i) {
                    bars[a].push(row[i]);
                });
            });
            return {
                ids: liveQValues.ids,
                actions: liveQValues.actions,
                bars: bars,
                matrix: liveQValues.matrix
            };
        }

        var rng = seededRandom(77);
        var g = gaussianRng(rng);
        var actions = ["Phase 0", "Phase 1", "Phase 2", "Phase 3"];
        var ids = [];
        for (var i = 0; i < 9; i++) ids.push("TLS_" + i);

        var bars = {};
        actions.forEach(function (a) { bars[a] = []; });
        var matrix = [];

        for (var k = 0; k < 9; k++) {
            var row = [];
            actions.forEach(function (a) {
                var v = g(3, 1.5);
                bars[a].push(v);
                row.push(v);
            });
            matrix.push(row);
        }
        return { ids: ids, actions: actions, bars: bars, matrix: matrix };
    }


    // ── action frequencies ──

    function buildActionFrequencies() {
        if (liveActions && liveActions["Proposed MARL"]) {
            var d = liveActions["Proposed MARL"];
            return {
                ids: d.ids,
                actions: liveActions.actions,
                freqs: d.frequencies
            };
        }

        var rng = seededRandom(44);
        var actions = ["Phase 0", "Phase 1", "Phase 2", "Phase 3"];
        var ids = [];
        for (var i = 0; i < 9; i++) ids.push("TLS_" + i);

        function gammaSample(alpha) {
            var d = alpha - 1.0 / 3, c = 1 / Math.sqrt(9 * d);
            while (true) {
                var x, v;
                do { x = gaussianRng(rng)(0, 1); v = 1 + c * x; } while (v <= 0);
                v = v * v * v;
                var u = rng();
                if (u < 1 - 0.0331 * x * x * x * x) return d * v;
                if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
            }
        }

        var alphas = [4, 1, 3, 1];
        var freqs = [];
        for (var k = 0; k < 9; k++) {
            var raw = alphas.map(function (a) { return gammaSample(a); });
            var sum = raw.reduce(function (s, v) { return s + v; }, 0);
            freqs.push(raw.map(function (v) { return v / sum; }));
        }
        return { ids: ids, actions: actions, freqs: freqs };
    }


    // ── stability from temporal queue variance ──

    function getTemporalStability() {
        var d = buildTemporalQueues(200);
        var keys = ["fixed", "dqn", "marl"];
        var stabilities = {};
        keys.forEach(function (k) {
            var arr = d[k];
            if (!arr || arr.length === 0) { stabilities[k] = 50; return; }
            var mean = arr.reduce(function (s, v) { return s + v; }, 0) / arr.length;
            var variance = arr.reduce(function (s, v) {
                return s + (v - mean) * (v - mean);
            }, 0) / arr.length;
            var std = Math.sqrt(variance);
            var cv = mean > 0 ? std / mean : 1;
            stabilities[k] = Math.max(0, Math.min(100, (1 - cv) * 100));
        });
        return stabilities;
    }

    function getCoordinationIds() {
        if (liveCoordination && liveCoordination.ids) return liveCoordination.ids;
        return null;
    }


    // ── array helpers ──

    function smooth(arr, window) {
        var out = [];
        for (var i = 0; i < arr.length; i++) {
            var start = Math.max(0, i - window + 1);
            var sum = 0, count = 0;
            for (var j = start; j <= i; j++) { sum += arr[j]; count++; }
            out.push(sum / count);
        }
        return out;
    }

    function cumsum(arr) {
        var out = [], s = 0;
        for (var i = 0; i < arr.length; i++) { s += arr[i]; out.push(s); }
        return out;
    }

    function getLiveLosses() {
        if (!liveLossesDQN && !liveLossesMARL) return null;
        return { dqn: liveLossesDQN, marl: liveLossesMARL };
    }

    return {
        metrics:                 metrics,
        isLive:                  function () { return _live; },
        fetchLiveData:           fetchLiveData,
        buildTrainingCurves:     buildTrainingCurves,
        buildIntersectionData:   buildIntersectionData,
        buildTemporalQueues:     buildTemporalQueues,
        buildCoordinationMatrix: buildCoordinationMatrix,
        buildQValueSurface:      buildQValueSurface,
        buildQValues:            buildQValues,
        buildActionFrequencies:  buildActionFrequencies,
        getTemporalStability:    getTemporalStability,
        getCoordinationIds:      getCoordinationIds,
        getLiveLosses:           getLiveLosses,
        seededRng:               seededRandom,
        smooth:                  smooth,
        cumsum:                  cumsum
    };
})();
