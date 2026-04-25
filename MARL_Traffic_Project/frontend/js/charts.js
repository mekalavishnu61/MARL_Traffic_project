/*
    charts.js – Plotly chart rendering, one function per visualisation.
*/

var Charts = (function () {

    // colour palette — kept consistent across every chart
    var C = {
        fixed: "#dc2626",
        dqn:   "#2563eb",
        marl:  "#059669",
        palette: ["#059669","#2563eb","#7c3aed","#d97706",
                  "#dc2626","#eab308","#ec4899","#06b6d4"]
    };

    // shared layout base for the light theme
    function baseLayout(extra) {
        var layout = {
            font: { family: "Inter, system-ui, sans-serif", size: 13, color: "#111827" },
            paper_bgcolor: "#ffffff",
            plot_bgcolor: "#fafbfc",
            margin: { l: 60, r: 30, t: 55, b: 55 },
            hoverlabel: { bgcolor: "#fff", font_size: 13, bordercolor: "#d1d5db" },
            legend: { bgcolor: "rgba(255,255,255,0.95)", bordercolor: "#e5e7eb", borderwidth: 1, font: { size: 12 } },
            xaxis: { gridcolor: "#f3f4f6", zerolinecolor: "#d1d5db", gridwidth: 1 },
            yaxis: { gridcolor: "#f3f4f6", zerolinecolor: "#d1d5db", gridwidth: 1 },
            autosize: true
        };
        if (extra) { for (var k in extra) layout[k] = extra[k]; }
        return layout;
    }

    var plotCfg = { responsive: true, displayModeBar: true, displaylogo: false,
                     modeBarButtonsToRemove: ["lasso2d", "select2d"] };


    // ────────────────────────────────────────────
    //  PAGE 1: DASHBOARD
    // ────────────────────────────────────────────

    function renderKPIs(containerId) {
        var m = TrafficData.metrics;
        var marlIdx = 2, fixIdx = 0;
        var waitDelta  = ((m.waiting[fixIdx] - m.waiting[marlIdx]) / m.waiting[fixIdx] * 100).toFixed(1);
        var queueDelta = ((m.queue[fixIdx] - m.queue[marlIdx]) / m.queue[fixIdx] * 100).toFixed(1);
        var thruDelta  = ((m.throughput[marlIdx] - m.throughput[fixIdx]) / m.throughput[fixIdx] * 100).toFixed(1);
        var efficiency = ((1 - m.queue[marlIdx] / m.queue[fixIdx]) * 100).toFixed(0);

        var cards = [
            { label: "AVG WAITING TIME", value: m.waiting[marlIdx].toFixed(1) + "s", delta: waitDelta + "% vs Fixed", positive: parseFloat(waitDelta) > 0, color: "#2563eb" },
            { label: "AVG QUEUE LENGTH", value: m.queue[marlIdx].toFixed(1), delta: queueDelta + "% vs Fixed", positive: parseFloat(queueDelta) > 0, color: "#7c3aed" },
            { label: "TOTAL THROUGHPUT", value: m.throughput[marlIdx], delta: thruDelta + "% vs Fixed", positive: parseFloat(thruDelta) > 0, color: "#059669" },
            { label: "OVERALL EFFICIENCY", value: efficiency + "%", delta: "MARL Advantage", positive: true, color: "#d97706" }
        ];

        var container = document.getElementById(containerId);
        container.innerHTML = "";
        cards.forEach(function (c) {
            var div = document.createElement("div");
            div.className = "kpi-card";
            div.innerHTML =
                '<div class="kpi-stripe" style="background:' + c.color + '"></div>' +
                '<div class="kpi-label">' + c.label + '</div>' +
                '<div class="kpi-value">' + c.value + '</div>' +
                '<div class="kpi-delta ' + (c.positive ? "positive" : "negative") + '">' +
                (c.positive ? "&#9650; " : "&#9660; ") + c.delta + '</div>';
            container.appendChild(div);
        });
    }

    function renderBarComparison(divId) {
        var m = TrafficData.metrics;
        var labels = ["Waiting", "Queue", "Throughput"];
        var maxVals = [Math.max.apply(null, m.waiting), Math.max.apply(null, m.queue), Math.max.apply(null, m.throughput)];
        var colors = [C.fixed, C.dqn, C.marl];

        var traces = m.models.map(function (model, idx) {
            var vals = [m.waiting[idx], m.queue[idx], m.throughput[idx]];
            var normed = vals.map(function (v, i) { return v / maxVals[i] * 100; });
            return { x: labels, y: normed, type: "bar", name: model, marker: { color: colors[idx] } };
        });
        Plotly.newPlot(divId, traces, baseLayout({ barmode: "group", height: 450, title: "Normalised Performance (% of max)", yaxis: { title: "Score (%)" } }), plotCfg);
    }

    function renderRadar(divId) {
        var m = TrafficData.metrics;
        var axes = ["Low Wait", "Low Queue", "High Throughput", "Efficiency", "Stability"];
        var colors = [C.fixed, C.dqn, C.marl];
        var mw = Math.max.apply(null, m.waiting), mq = Math.max.apply(null, m.queue), mt = Math.max.apply(null, m.throughput);
        var stab = TrafficData.getTemporalStability();

        var traces = m.models.map(function (model, idx) {
            var stabKey = idx === 0 ? "fixed" : idx === 1 ? "dqn" : "marl";
            var r = [
                (1 - m.waiting[idx] / mw) * 100,
                (1 - m.queue[idx] / mq) * 100,
                m.throughput[idx] / mt * 100,
                (1 - m.queue[idx] / mq) * 90 + 10,
                stab[stabKey]
            ];
            r.push(r[0]);
            return {
                type: "scatterpolar", r: r,
                theta: axes.concat([axes[0]]),
                fill: "toself", name: model,
                line: { color: colors[idx], width: 2 },
                opacity: 0.8
            };
        });
        Plotly.newPlot(divId, traces, baseLayout({
            height: 450, title: "Multi-Dimensional Assessment",
            polar: {
                radialaxis: { visible: true, range: [0, 100], gridcolor: "#e2e8f0" },
                angularaxis: { gridcolor: "#e2e8f0" },
                bgcolor: "#fafbfc"
            }
        }), plotCfg);
    }

    function renderMetricsTable(divId) {
        var m = TrafficData.metrics;
        var html = '<table class="data-table"><thead><tr>' +
            '<th>Model</th><th>Waiting</th><th>Queue</th><th>Throughput</th>' +
            '<th>Wait Reduction</th><th>Queue Reduction</th><th>Throughput Gain</th></tr></thead><tbody>';
        m.models.forEach(function (model, i) {
            var wr = ((m.waiting[0] - m.waiting[i]) / m.waiting[0] * 100).toFixed(1);
            var qr = ((m.queue[0] - m.queue[i]) / m.queue[0] * 100).toFixed(1);
            var tg = ((m.throughput[i] - m.throughput[0]) / m.throughput[0] * 100).toFixed(1);
            html += '<tr><td><strong>' + model + '</strong></td>' +
                '<td>' + m.waiting[i].toFixed(1) + '</td>' +
                '<td>' + m.queue[i].toFixed(2) + '</td>' +
                '<td>' + m.throughput[i] + '</td>' +
                '<td>' + wr + '%</td><td>' + qr + '%</td><td>' + tg + '%</td></tr>';
        });
        html += '</tbody></table>';
        document.getElementById(divId).innerHTML = html;
    }


    // ────────────────────────────────────────────
    //  PAGE 2: TRAINING
    // ────────────────────────────────────────────

    function renderRewardCurves(divId, windowSize) {
        var d = TrafficData.buildTrainingCurves(100);
        var sf = TrafficData.smooth(d.fixed, windowSize);
        var sd = TrafficData.smooth(d.dqn, windowSize);
        var sm = TrafficData.smooth(d.marl, windowSize);

        var traces = [
            { x: d.episodes, y: sf, mode: "lines", name: "Fixed Time", line: { color: C.fixed, width: 2 } },
            { x: d.episodes, y: sd, mode: "lines", name: "Independent DQN", line: { color: C.dqn, width: 2 } },
            { x: d.episodes, y: sm, mode: "lines", name: "Proposed MARL", line: { color: C.marl, width: 2.5 } }
        ];
        Plotly.newPlot(divId, traces, baseLayout({ height: 480, title: "Cumulative Reward per Episode", xaxis: { title: "Episode", gridcolor: "#f1f5f9" }, yaxis: { title: "Total Reward", gridcolor: "#f1f5f9" } }), plotCfg);
    }

    function renderViolins(divId) {
        var d = TrafficData.buildTrainingCurves(100);
        var names = ["Fixed Time", "Independent DQN", "Proposed MARL"];
        var arrs = [d.fixed, d.dqn, d.marl];
        var colors = [C.fixed, C.dqn, C.marl];

        var traces = names.map(function (n, i) {
            return { y: arrs[i].slice(-30), type: "violin", name: n, box: { visible: true }, meanline: { visible: true }, fillcolor: colors[i], line: { color: colors[i] }, opacity: 0.75 };
        });
        Plotly.newPlot(divId, traces, baseLayout({ height: 440, title: "Reward Distribution (Last 30)", yaxis: { title: "Reward" } }), plotCfg);
    }

    function renderMAConvergence(divId) {
        var d = TrafficData.buildTrainingCurves(100);
        var traces = [];
        [{ arr: d.dqn, name: "DQN", color: C.dqn }, { arr: d.marl, name: "MARL", color: C.marl }].forEach(function (item) {
            traces.push({ x: d.episodes, y: TrafficData.smooth(item.arr, 10), mode: "lines", name: item.name + " (MA-10)", line: { color: item.color, width: 1.5, dash: "dot" } });
            traces.push({ x: d.episodes, y: TrafficData.smooth(item.arr, 30), mode: "lines", name: item.name + " (MA-30)", line: { color: item.color, width: 2.5 } });
        });
        Plotly.newPlot(divId, traces, baseLayout({ height: 440, title: "Short vs Long Moving Average", xaxis: { title: "Episode" }, yaxis: { title: "Reward" } }), plotCfg);
    }

    function renderEpsilon(divId) {
        var eps = [];
        for (var i = 0; i < 100; i++) eps.push(i);
        var lin = eps.map(function (e) { return Math.max(0.01, 1 - e / 80); });
        var exp = eps.map(function (e) { return Math.max(0.01, Math.pow(0.995, e)); });
        var cos = eps.map(function (e) { return 0.01 + 0.5 * (1 + Math.cos(Math.PI * e / 100)) * 0.49; });

        Plotly.newPlot(divId, [
            { x: eps, y: lin, mode: "lines", name: "Linear", line: { width: 2.5 } },
            { x: eps, y: exp, mode: "lines", name: "Exponential", line: { width: 2.5 } },
            { x: eps, y: cos, mode: "lines", name: "Cosine Annealing", line: { width: 2.5 } }
        ], baseLayout({ height: 420, title: "Exploration Rate Schedules", xaxis: { title: "Episode" }, yaxis: { title: "Epsilon" } }), plotCfg);
    }

    function renderLoss(divId) {
        var d = TrafficData.buildTrainingCurves(100);
        var eps = d.episodes;
        var liveL = TrafficData.getLiveLosses();

        var lossDQN, lossMARL;

        if (liveL && liveL.dqn && liveL.dqn.length > 0) {
            lossDQN = liveL.dqn;
            lossMARL = liveL.marl && liveL.marl.length > 0 ? liveL.marl : lossDQN;
            eps = [];
            for (var i = 0; i < Math.max(lossDQN.length, lossMARL.length); i++) eps.push(i);
        } else {
            var rng = TrafficData.seededRng(99);
            lossDQN = eps.map(function (e) { return Math.abs(2 * Math.exp(-e / 20) + (rng() - 0.5) * 0.2); });
            lossMARL = eps.map(function (e) { return Math.abs(1.8 * Math.exp(-e / 15) + (rng() - 0.5) * 0.16); });
        }

        Plotly.newPlot(divId, [
            { x: eps, y: lossDQN, mode: "lines", name: "DQN Loss", line: { color: C.dqn, width: 2 } },
            { x: eps, y: lossMARL, mode: "lines", name: "MARL Loss", line: { color: C.marl, width: 2 } }
        ], baseLayout({ height: 420, title: "TD-Error Decay", xaxis: { title: "Episode" }, yaxis: { title: "Loss" } }), plotCfg);
    }

    function renderTrainingStats(divId) {
        var d = TrafficData.buildTrainingCurves(100);
        var names = ["Fixed Time", "Independent DQN", "Proposed MARL"];
        var arrs = [d.fixed, d.dqn, d.marl];

        function mean(a) { return a.reduce(function (s, v) { return s + v; }, 0) / a.length; }
        function std(a) { var m = mean(a); return Math.sqrt(a.reduce(function (s, v) { return s + (v - m) * (v - m); }, 0) / a.length); }

        var html = '<table class="data-table"><thead><tr><th>Model</th><th>Mean</th><th>Std Dev</th><th>Min</th><th>Max</th><th>Final (last 10)</th><th>Improvement</th></tr></thead><tbody>';
        names.forEach(function (n, i) {
            var a = arrs[i];
            var first10 = mean(a.slice(0, 10));
            var last10 = mean(a.slice(-10));
            var imp = ((last10 - first10) / Math.abs(first10) * 100).toFixed(1);
            html += '<tr><td><strong>' + n + '</strong></td><td>' + mean(a).toFixed(2) + '</td><td>' + std(a).toFixed(2) + '</td><td>' + Math.min.apply(null, a).toFixed(2) + '</td><td>' + Math.max.apply(null, a).toFixed(2) + '</td><td>' + last10.toFixed(2) + '</td><td>' + imp + '%</td></tr>';
        });
        html += '</tbody></table>';
        document.getElementById(divId).innerHTML = html;
    }


    // ────────────────────────────────────────────
    //  PAGE 3: TOPOLOGY
    // ────────────────────────────────────────────

    function renderGridHeatmap(divId, gridSize, metric, model) {
        var inter = TrafficData.buildIntersectionData(gridSize);
        var d = inter[model];
        var field = { waiting: d.waiting, queue: d.queue, throughput: d.throughput, efficiency: d.efficiency }[metric];
        var n = gridSize;
        var z = [];
        for (var r = 0; r < n; r++) {
            z.push(field.slice(r * n, (r + 1) * n));
        }
        var colLabels = [], rowLabels = [];
        for (var i = 0; i < n; i++) { colLabels.push("Col " + i); rowLabels.push("Row " + i); }

        var colorscale = (metric === "throughput" || metric === "efficiency") ? "YlGn" : "YlOrRd";

        Plotly.newPlot(divId, [{
            z: z, x: colLabels, y: rowLabels,
            type: "heatmap", colorscale: colorscale,
            text: z.map(function (row) { return row.map(function (v) { return v.toFixed(1); }); }),
            texttemplate: "%{text}", textfont: { size: 13 },
            hovertemplate: "Row %{y}, Col %{x}<br>Value: %{z:.2f}<extra></extra>",
            colorbar: { title: metric }
        }], baseLayout({ height: 420, title: metric + " \u2014 " + model + " (" + n + "x" + n + ")", xaxis: { side: "top" } }), plotCfg);
    }

    function renderIntersectionBars(divId, gridSize, metric) {
        var inter = TrafficData.buildIntersectionData(gridSize);
        var field = { waiting: "waiting", queue: "queue", throughput: "throughput", efficiency: "efficiency" }[metric];
        var colors = [C.fixed, C.dqn, C.marl];

        var traces = TrafficData.metrics.models.map(function (model, idx) {
            var d = inter[model];
            return { x: d.ids, y: d[field], type: "bar", name: model, marker: { color: colors[idx] }, opacity: 0.85 };
        });
        Plotly.newPlot(divId, traces, baseLayout({ barmode: "group", height: 420, title: metric + " per Intersection", xaxis: { title: "Intersection" }, yaxis: { title: metric } }), plotCfg);
    }

    function renderCoordination(divId, gridSize) {
        var mat = TrafficData.buildCoordinationMatrix(gridSize);
        var n = gridSize * gridSize;
        var liveIds = TrafficData.getCoordinationIds();
        var ids = [];
        if (liveIds && liveIds.length === n) {
            ids = liveIds;
        } else {
            for (var i = 0; i < n; i++) ids.push("TLS_" + i);
        }

        var textArr = mat.map(function (row) { return row.map(function (v) { return v.toFixed(2); }); });

        Plotly.newPlot(divId, [{
            z: mat, x: ids, y: ids, type: "heatmap",
            colorscale: "Greens",
            text: textArr, texttemplate: "%{text}", textfont: { size: 10 }
        }], baseLayout({ height: 440, title: "Action Correlation Between Intersections (MARL)" }), plotCfg);
    }


    // ────────────────────────────────────────────
    //  PAGE 4: ANALYTICS
    // ────────────────────────────────────────────

    function renderQueueTemporal(divId) {
        var d = TrafficData.buildTemporalQueues(200);
        Plotly.newPlot(divId, [
            { x: d.steps, y: d.fixed, mode: "lines", name: "Fixed Time", line: { color: C.fixed, width: 2 } },
            { x: d.steps, y: d.dqn, mode: "lines", name: "Independent DQN", line: { color: C.dqn, width: 2 } },
            { x: d.steps, y: d.marl, mode: "lines", name: "Proposed MARL", line: { color: C.marl, width: 2 } }
        ], baseLayout({ height: 450, title: "Queue Length Over Simulation Steps", xaxis: { title: "Step" }, yaxis: { title: "Queue Length" } }), plotCfg);
    }

    function renderCumulativeQueue(divId) {
        var d = TrafficData.buildTemporalQueues(200);
        Plotly.newPlot(divId, [
            { x: d.steps, y: TrafficData.cumsum(d.fixed), mode: "lines", name: "Fixed Time", fill: "tozeroy", line: { color: C.fixed } },
            { x: d.steps, y: TrafficData.cumsum(d.dqn), mode: "lines", name: "Independent DQN", fill: "tozeroy", line: { color: C.dqn } },
            { x: d.steps, y: TrafficData.cumsum(d.marl), mode: "lines", name: "Proposed MARL", fill: "tozeroy", line: { color: C.marl } }
        ], baseLayout({ height: 420, title: "Cumulative Queue Burden", xaxis: { title: "Step" }, yaxis: { title: "Cumulative Queue" } }), plotCfg);
    }

    function renderQueueHistogram(divId) {
        var d = TrafficData.buildTemporalQueues(200);
        Plotly.newPlot(divId, [
            { x: d.fixed, type: "histogram", name: "Fixed Time", opacity: 0.6, marker: { color: C.fixed }, nbinsx: 30 },
            { x: d.dqn, type: "histogram", name: "Independent DQN", opacity: 0.6, marker: { color: C.dqn }, nbinsx: 30 },
            { x: d.marl, type: "histogram", name: "Proposed MARL", opacity: 0.6, marker: { color: C.marl }, nbinsx: 30 }
        ], baseLayout({ barmode: "overlay", height: 420, title: "Queue Length Distribution", xaxis: { title: "Queue Length" }, yaxis: { title: "Frequency" } }), plotCfg);
    }

    function renderBoxplot(divId) {
        var d = TrafficData.buildTemporalQueues(200);
        Plotly.newPlot(divId, [
            { y: d.fixed, type: "box", name: "Fixed Time", marker: { color: C.fixed }, boxmean: "sd" },
            { y: d.dqn, type: "box", name: "Independent DQN", marker: { color: C.dqn }, boxmean: "sd" },
            { y: d.marl, type: "box", name: "Proposed MARL", marker: { color: C.marl }, boxmean: "sd" }
        ], baseLayout({ height: 420, title: "Queue Length by Model", yaxis: { title: "Queue Length" } }), plotCfg);
    }

    function renderSunburst(divId) {
        var m = TrafficData.metrics;
        var labels = ["Traffic System"];
        var parents = [""];
        var values = [0];

        m.models.forEach(function (mod) {
            labels.push(mod); parents.push("Traffic System"); values.push(0);
        });
        m.models.forEach(function (mod, i) {
            labels.push(mod + " - Waiting"); parents.push(mod); values.push(m.waiting[i]);
            labels.push(mod + " - Queue x10"); parents.push(mod); values.push(m.queue[i] * 10);
            labels.push(mod + " - Throughput"); parents.push(mod); values.push(m.throughput[i]);
        });
        Plotly.newPlot(divId, [{ type: "sunburst", labels: labels, parents: parents, values: values, branchvalues: "remainder", marker: { colors: C.palette } }], baseLayout({ height: 420, title: "Hierarchical Decomposition" }), plotCfg);
    }

    function renderStatsSummary(divId) {
        var d = TrafficData.buildTemporalQueues(200);
        var names = ["Fixed Time", "Independent DQN", "Proposed MARL"];
        var arrs = [d.fixed, d.dqn, d.marl];

        function mean(a) { return a.reduce(function (s, v) { return s + v; }, 0) / a.length; }
        function median(a) { var s = a.slice().sort(function (x, y) { return x - y; }); var m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
        function std(a) { var m = mean(a); return Math.sqrt(a.reduce(function (s, v) { return s + (v - m) * (v - m); }, 0) / a.length); }
        function pct(a, p) { var s = a.slice().sort(function (x, y) { return x - y; }); var i = Math.floor(p * s.length); return s[Math.min(i, s.length - 1)]; }

        var html = '<table class="data-table"><thead><tr><th>Model</th><th>Mean</th><th>Median</th><th>Std Dev</th><th>IQR</th><th>95th Pct</th><th>Max</th></tr></thead><tbody>';
        names.forEach(function (n, i) {
            var a = arrs[i];
            html += '<tr><td><strong>' + n + '</strong></td><td>' + mean(a).toFixed(2) + '</td><td>' + median(a).toFixed(2) + '</td><td>' + std(a).toFixed(2) + '</td><td>' + (pct(a, 0.75) - pct(a, 0.25)).toFixed(2) + '</td><td>' + pct(a, 0.95).toFixed(2) + '</td><td>' + Math.max.apply(null, a).toFixed(2) + '</td></tr>';
        });
        html += '</tbody></table>';
        document.getElementById(divId).innerHTML = html;
    }


    // ────────────────────────────────────────────
    //  PAGE 5: CONFIGURATION
    // ────────────────────────────────────────────

    function renderArchitecture(divId, nHidden, units) {
        var layers = [{ name: "Input", size: 10 }];
        for (var i = 0; i < nHidden; i++) layers.push({ name: "Hidden " + (i + 1), size: units });
        layers.push({ name: "Output", size: 4 });

        var nLayers = layers.length;
        var maxSize = Math.max.apply(null, layers.map(function (l) { return l.size; }));
        var traces = [];
        var shapes = [];

        var nodePositions = [];
        layers.forEach(function (layer, li) {
            var shown = Math.min(layer.size, 8);
            var xPos = li / Math.max(nLayers - 1, 1);
            var col = li === 0 ? "#059669" : li === nLayers - 1 ? "#dc2626" : "#2563eb";
            var positions = [];

            for (var j = 0; j < shown; j++) {
                var yPos = (j - shown / 2) / Math.max(maxSize / 2, 1) * 0.4 + 0.5;
                positions.push({ x: xPos, y: yPos });
                traces.push({
                    x: [xPos], y: [yPos], mode: "markers",
                    marker: { size: 16, color: col, line: { width: 1.5, color: "#fff" } },
                    showlegend: false, hovertext: layer.name + " (" + layer.size + " neurons)", hoverinfo: "text"
                });
            }
            nodePositions.push(positions);
        });

        for (var li = 0; li < nLayers - 1; li++) {
            var from = nodePositions[li];
            var to   = nodePositions[li + 1];
            for (var a = 0; a < from.length; a++) {
                for (var b = 0; b < to.length; b++) {
                    shapes.push({
                        type: "line",
                        x0: from[a].x, y0: from[a].y,
                        x1: to[b].x,   y1: to[b].y,
                        line: { color: "rgba(148,163,184,0.25)", width: 1 },
                        layer: "below"
                    });
                }
            }
        }

        var layout = baseLayout({
            height: 420, title: "Network Architecture",
            xaxis: { visible: false, range: [-0.1, 1.1] },
            yaxis: { visible: false, range: [-0.15, 1.05] },
            showlegend: false,
            shapes: shapes,
            annotations: layers.map(function (l, i) {
                return { x: i / Math.max(nLayers - 1, 1), y: -0.08, text: "<b>" + l.name + "</b><br>" + l.size, showarrow: false, font: { size: 11, color: "#64748b" } };
            })
        });
        Plotly.newPlot(divId, traces, layout, plotCfg);
    }


    // ────────────────────────────────────────────
    //  PAGE 6: INTELLIGENCE
    // ────────────────────────────────────────────

    function renderQValueSurface(divId) {
        var s = TrafficData.buildQValueSurface();
        Plotly.newPlot(divId, [{
            z: s.z, x: s.x, y: s.y, type: "surface",
            colorscale: "Greens",
            contours: { z: { show: true, usecolormap: true, project: { z: true } } }
        }], baseLayout({
            height: 500, title: "Q-Value Surface (Queue x Wait, Action = Green NS)",
            scene: { xaxis: { title: "Queue" }, yaxis: { title: "Waiting Time" }, zaxis: { title: "Q-Value" }, bgcolor: "#fafbfc" }
        }), plotCfg);
    }

    function renderQValueBars(divId) {
        var qv = TrafficData.buildQValues();
        var traces = qv.actions.map(function (a, i) {
            return { x: qv.ids, y: qv.bars[a], type: "bar", name: a, marker: { color: C.palette[i] } };
        });
        Plotly.newPlot(divId, traces, baseLayout({ barmode: "group", height: 440, title: "Q-Values by Action" }), plotCfg);
    }

    function renderQValueHeatmap(divId) {
        var qv = TrafficData.buildQValues();
        var textArr = qv.matrix.map(function (row) { return row.map(function (v) { return v.toFixed(2); }); });
        Plotly.newPlot(divId, [{
            z: qv.matrix, x: qv.actions, y: qv.ids,
            type: "heatmap", colorscale: "Greens",
            text: textArr, texttemplate: "%{text}", textfont: { size: 11 }
        }], baseLayout({ height: 440, title: "Q-Value Matrix" }), plotCfg);
    }

    function renderActionFreq(divId) {
        var af = TrafficData.buildActionFrequencies();
        var traces = af.actions.map(function (a, ai) {
            return { x: af.ids, y: af.freqs.map(function (f) { return f[ai]; }), type: "bar", name: a, marker: { color: C.palette[ai] } };
        });
        Plotly.newPlot(divId, traces, baseLayout({ barmode: "stack", height: 440, title: "Action Selection Frequency", yaxis: { title: "Proportion" } }), plotCfg);
    }

    function renderActionPie(divId) {
        var af = TrafficData.buildActionFrequencies();
        var avg = [0, 0, 0, 0];
        af.freqs.forEach(function (f) { f.forEach(function (v, i) { avg[i] += v; }); });
        avg = avg.map(function (v) { return v / Math.max(af.freqs.length, 1); });

        Plotly.newPlot(divId, [{
            labels: af.actions, values: avg, type: "pie", hole: 0.4,
            marker: { colors: C.palette.slice(0, 4), line: { color: "#fff", width: 2 } },
            textfont: { size: 13 }
        }], baseLayout({ height: 440, title: "Global Action Distribution" }), plotCfg);
    }

    function renderRanking(divId) {
        var inter = TrafficData.buildIntersectionData(3);
        var d = inter["Proposed MARL"];
        var mw = Math.max.apply(null, d.waiting);
        var mq = Math.max.apply(null, d.queue);
        var mt = Math.max.apply(null, d.throughput);

        var scores = d.ids.map(function (_, i) {
            return (1 - d.waiting[i] / mw) * 30 + (1 - d.queue[i] / mq) * 30 + (d.throughput[i] / mt) * 40;
        });

        var paired = d.ids.map(function (id, i) { return { id: id, score: scores[i] }; });
        paired.sort(function (a, b) { return b.score - a.score; });

        Plotly.newPlot(divId, [{
            x: paired.map(function (p) { return p.id; }),
            y: paired.map(function (p) { return p.score; }),
            type: "bar",
            marker: { color: paired.map(function (p) { return p.score; }), colorscale: "Greens" },
            text: paired.map(function (p) { return p.score.toFixed(1); }),
            textposition: "outside", textfont: { size: 12, color: "#059669" }
        }], baseLayout({ height: 440, title: "Composite Performance Score", xaxis: { title: "Intersection" }, yaxis: { title: "Score (0-100)" } }), plotCfg);

        return paired;
    }

    function renderGauges(containerId, ranked) {
        var container = document.getElementById(containerId);
        container.innerHTML = "";
        var top3 = ranked.slice(0, 3);

        top3.forEach(function (agent) {
            var card = document.createElement("div");
            card.className = "card";
            var gaugeId = "gauge-" + agent.id;
            card.innerHTML = '<div id="' + gaugeId + '"></div>';
            container.appendChild(card);

            Plotly.newPlot(gaugeId, [{
                type: "indicator", mode: "gauge+number+delta",
                value: agent.score,
                title: { text: agent.id, font: { size: 15, color: "#0f172a" } },
                delta: { reference: 50, increasing: { color: "#059669" }, decreasing: { color: "#dc2626" } },
                gauge: {
                    axis: { range: [0, 100], tickcolor: "#94a3b8" },
                    bar: { color: "#059669" },
                    bgcolor: "#f8fafc",
                    borderwidth: 1, bordercolor: "#e2e8f0",
                    steps: [
                        { range: [0, 40], color: "#fee2e2" },
                        { range: [40, 70], color: "#fef3c7" },
                        { range: [70, 100], color: "#d1fae5" }
                    ],
                    threshold: { line: { color: "#d97706", width: 3 }, thickness: 0.8, value: 70 }
                },
                number: { font: { size: 26, color: "#0f172a" } }
            }], {
                paper_bgcolor: "#ffffff",
                font: { color: "#0f172a", family: "Inter" },
                height: 220, margin: { l: 30, r: 30, t: 55, b: 15 }
            }, plotCfg);
        });
    }

    return {
        renderKPIs: renderKPIs,
        renderBarComparison: renderBarComparison,
        renderRadar: renderRadar,
        renderMetricsTable: renderMetricsTable,
        renderRewardCurves: renderRewardCurves,
        renderViolins: renderViolins,
        renderMAConvergence: renderMAConvergence,
        renderEpsilon: renderEpsilon,
        renderLoss: renderLoss,
        renderTrainingStats: renderTrainingStats,
        renderGridHeatmap: renderGridHeatmap,
        renderIntersectionBars: renderIntersectionBars,
        renderCoordination: renderCoordination,
        renderQueueTemporal: renderQueueTemporal,
        renderCumulativeQueue: renderCumulativeQueue,
        renderQueueHistogram: renderQueueHistogram,
        renderBoxplot: renderBoxplot,
        renderSunburst: renderSunburst,
        renderStatsSummary: renderStatsSummary,
        renderArchitecture: renderArchitecture,
        renderQValueSurface: renderQValueSurface,
        renderQValueBars: renderQValueBars,
        renderQValueHeatmap: renderQValueHeatmap,
        renderActionFreq: renderActionFreq,
        renderActionPie: renderActionPie,
        renderRanking: renderRanking,
        renderGauges: renderGauges
    };
})();
