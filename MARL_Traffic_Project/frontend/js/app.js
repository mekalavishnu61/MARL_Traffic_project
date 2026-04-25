/*
    app.js – navigation, tab switching, controls, and init
*/

(function () {

    // ── mobile sidebar toggle ───────────────

    var sidebar  = document.getElementById("sidebar");
    var togBtn   = document.getElementById("sidebar-toggle");
    var overlay  = document.getElementById("sidebar-overlay");

    if (togBtn) {
        togBtn.addEventListener("click", function () {
            sidebar.classList.toggle("open");
            overlay.classList.toggle("visible");
        });
    }
    if (overlay) {
        overlay.addEventListener("click", function () {
            sidebar.classList.remove("open");
            overlay.classList.remove("visible");
        });
    }

    // ── page navigation ──────────────────────

    var navItems = document.querySelectorAll(".nav-item");
    var pages    = document.querySelectorAll(".page");
    var rendered = {};

    navItems.forEach(function (item) {
        item.addEventListener("click", function () {
            var target = item.getAttribute("data-page");

            navItems.forEach(function (n) { n.classList.remove("active"); });
            pages.forEach(function (p)    { p.classList.remove("active"); });

            item.classList.add("active");
            document.getElementById("page-" + target).classList.add("active");

            sidebar.classList.remove("open");
            overlay.classList.remove("visible");

            if (!rendered[target]) {
                renderPage(target);
                rendered[target] = true;
            }
        });
    });


    // ── tab switching (used on the training page) ──

    document.querySelectorAll(".tab-bar").forEach(function (bar) {
        bar.querySelectorAll(".tab-btn").forEach(function (btn) {
            btn.addEventListener("click", function () {
                var tabId = btn.getAttribute("data-tab");
                bar.querySelectorAll(".tab-btn").forEach(function (b) { b.classList.remove("active"); });
                btn.classList.add("active");

                var parent = bar.parentElement;
                parent.querySelectorAll(".tab-content").forEach(function (tc) { tc.classList.remove("active"); });
                document.getElementById(tabId).classList.add("active");
            });
        });
    });


    // ── render each page on first visit ──

    function renderPage(name) {
        switch (name) {
            case "dashboard":   renderDashboard();    break;
            case "training":    renderTraining();     break;
            case "topology":    renderTopology();     break;
            case "analytics":   renderAnalytics();    break;
            case "configuration": renderConfig();     break;
            case "intelligence":  renderIntelligence(); break;
        }
    }


    // ── dashboard ──

    function renderDashboard() {
        Charts.renderKPIs("kpi-cards");
        Charts.renderBarComparison("chart-bar-comparison");
        Charts.renderRadar("chart-radar");
        Charts.renderMetricsTable("metrics-table");
    }


    // ── training ──

    function renderTraining() {
        var slider = document.getElementById("smoothing-slider");
        var label  = document.getElementById("smoothing-val");

        Charts.renderRewardCurves("chart-reward-curves", parseInt(slider.value));
        Charts.renderViolins("chart-violin");
        Charts.renderMAConvergence("chart-ma-convergence");
        Charts.renderEpsilon("chart-epsilon");
        Charts.renderLoss("chart-loss");
        Charts.renderTrainingStats("training-stats-table");

        slider.addEventListener("input", function () {
            label.textContent = slider.value;
            Charts.renderRewardCurves("chart-reward-curves", parseInt(slider.value));
        });
    }


    // ── topology ──

    function renderTopology() {
        var gridSel   = document.getElementById("grid-select");
        var metricSel = document.getElementById("topo-metric-select");
        var modelSel  = document.getElementById("topo-model-select");

        function refresh() {
            var g = parseInt(gridSel.value);
            var m = metricSel.value;
            var mod = modelSel.value;
            Charts.renderGridHeatmap("chart-grid-heatmap", g, m, mod);
            Charts.renderIntersectionBars("chart-intersection-bars", g, m);
            Charts.renderCoordination("chart-coordination", g);
        }

        refresh();
        gridSel.addEventListener("change", refresh);
        metricSel.addEventListener("change", refresh);
        modelSel.addEventListener("change", refresh);
    }


    // ── analytics ──

    function renderAnalytics() {
        Charts.renderQueueTemporal("chart-queue-temporal");
        Charts.renderCumulativeQueue("chart-cumulative-queue");
        Charts.renderQueueHistogram("chart-queue-histogram");
        Charts.renderBoxplot("chart-boxplot");
        Charts.renderSunburst("chart-sunburst");
        Charts.renderStatsSummary("stats-summary-table");
    }


    // ── configuration ──

    function renderConfig() {
        var layersSlider = document.getElementById("cfg-layers");
        var layersVal    = document.getElementById("cfg-layers-val");
        var unitsSelect  = document.getElementById("cfg-units");
        var gammaSlider  = document.getElementById("cfg-gamma");
        var gammaVal     = document.getElementById("cfg-gamma-val");
        var epsSlider    = document.getElementById("cfg-eps");
        var epsVal       = document.getElementById("cfg-eps-val");
        var wqSlider     = document.getElementById("cfg-wq");
        var wqVal        = document.getElementById("cfg-wq-val");
        var wwSlider     = document.getElementById("cfg-ww");
        var wwVal        = document.getElementById("cfg-ww-val");

        function updateArch() {
            var nH = parseInt(layersSlider.value);
            var u  = parseInt(unitsSelect.value);
            layersVal.textContent = nH;
            Charts.renderArchitecture("chart-architecture", nH, u);
        }

        function updateLabels() {
            gammaVal.textContent = (parseInt(gammaSlider.value) / 1000).toFixed(3);
            epsVal.textContent   = epsSlider.value;
            wqVal.textContent    = (parseInt(wqSlider.value) / 10).toFixed(1);
            wwVal.textContent    = (parseInt(wwSlider.value) / 10).toFixed(1);
        }

        function updateConfigJSON() {
            var cfg = {
                architecture:     document.getElementById("cfg-arch").value,
                hidden_layers:    parseInt(layersSlider.value),
                hidden_units:     parseInt(unitsSelect.value),
                activation:       document.getElementById("cfg-activation").value,
                learning_rate:    document.getElementById("cfg-lr").value,
                gamma:            parseInt(gammaSlider.value) / 1000,
                batch_size:       parseInt(document.getElementById("cfg-batch").value),
                buffer_size:      parseInt(document.getElementById("cfg-buffer").value),
                episodes:         parseInt(epsSlider.value),
                epsilon_strategy: document.getElementById("cfg-eps-strat").value,
                reward_weights: {
                    queue:   parseInt(wqSlider.value) / 10,
                    waiting: parseInt(wwSlider.value) / 10
                }
            };
            document.getElementById("config-json-output").textContent =
                JSON.stringify(cfg, null, 2);
        }

        updateArch();
        updateLabels();
        updateConfigJSON();

        layersSlider.addEventListener("input", function () { updateArch(); updateConfigJSON(); });
        unitsSelect.addEventListener("change", function () { updateArch(); updateConfigJSON(); });
        [gammaSlider, epsSlider, wqSlider, wwSlider].forEach(function (el) {
            el.addEventListener("input", function () { updateLabels(); updateConfigJSON(); });
        });
        document.querySelectorAll("#page-configuration select").forEach(function (sel) {
            sel.addEventListener("change", updateConfigJSON);
        });

        document.getElementById("download-config-btn").addEventListener("click", function () {
            var text = document.getElementById("config-json-output").textContent;
            var blob = new Blob([text], { type: "application/json" });
            var a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "marl_config.json";
            a.click();
        });
    }


    // ── intelligence ──

    function renderIntelligence() {
        Charts.renderQValueSurface("chart-qvalue-surface");
        Charts.renderQValueBars("chart-qvalue-bars");
        Charts.renderQValueHeatmap("chart-qvalue-heatmap");
        Charts.renderActionFreq("chart-action-freq");
        Charts.renderActionPie("chart-action-pie");
        var ranked = Charts.renderRanking("chart-ranking-bars");
        Charts.renderGauges("gauge-container", ranked);
    }


    // ── update the data-source badge ──

    function updateBadge() {
        var badge = document.getElementById("data-badge");
        if (!badge) return;
        if (TrafficData.isLive()) {
            badge.textContent = "Live Data";
            badge.className = "data-badge live";
        } else {
            badge.textContent = "Demo Data";
            badge.className = "data-badge demo";
        }
    }

    // ── render the first page on load ──

    function initialRender() {
        rendered["dashboard"] = true;
        renderDashboard();
        updateBadge();
    }

    TrafficData.fetchLiveData()
        .then(function () { initialRender(); })
        .catch(function () { initialRender(); });

})();
