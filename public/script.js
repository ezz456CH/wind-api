const stationselect = document.getElementById("station-select");

const windspeedel = document.querySelector(".windspeed");
const sustainedwindspeedel = document.querySelector(".sustained");
const gustel = document.querySelector(".gust");

const ctx = document.getElementById("history-chart").getContext("2d");

const updatedel = document.querySelector(".updated");

const unitels = document.querySelectorAll(".unit");

let windspeed_history = [];
let windspeedmps = null;
let sustainedmps = null;
let gustmps = null;

const unit = localStorage.getItem("unit") || "m/s";
const units = ["m/s", "km/h", "mph"];

unitels.textContent = unit;

if (!units.includes(unit)) {
    localStorage.setItem("unit", "m/s");
}

unitels.forEach((el) => {
    el.textContent = unit;

    el.addEventListener("click", () => {
        let currentindex = units.indexOf(el.textContent);
        currentindex = (currentindex + 1) % units.length;
        const newunit = units[currentindex];

        el.textContent = newunit;
        localStorage.setItem("unit", newunit);
        unitels.forEach((other) => (other.textContent = newunit));

        updatedata();
    });
});

Chart.defaults.font.family = "JetBrains Mono, monospace";
Chart.defaults.font.size = 12;
Chart.defaults.font.style = "normal";
Chart.defaults.font.weight = "600";

const chart = new Chart(ctx, {
    type: "line",
    data: {
        labels: [],
        datasets: [
            {
                label: "Windspeed",
                data: [],
                borderWidth: 2,
                borderColor: "rgba(250, 173, 247, 1)",
                backgroundColor: "rgba(255, 255, 255, 0)",
                tension: 0.2,
                pointRadius: 0,
                pointHitRadius: 5,
                yAxisID: "y",
            },
        ],
    },
    options: {
        responsive: true,
        animation: false,
        maintainAspectRatio: false,
        interaction: {
            mode: "index",
            intersect: false,
        },
        plugins: {
            tooltip: {
                callbacks: {
                    label: function (context) {
                        const label = context.dataset.label || "";
                        const value = context.raw;
                        return `${label}: ${value.toFixed(1)}`;
                    },
                },
            },
        },
        scales: {
            x: {
                type: "time",
                time: {
                    unit: "minute",
                    tooltipFormat: "yyyy-MM-dd HH:mm:ss",
                },
                ticks: {
                    maxTicksLimit: 2,
                    callback: function (value, index, ticks) {
                        const date = new Date(value);
                        const hours = date.getHours().toString().padStart(2, "0");
                        const minutes = date.getMinutes().toString().padStart(2, "0");
                        const offset = -date.getTimezoneOffset() / 60;
                        const sign = offset >= 0 ? "+" : "-";
                        return `${hours}:${minutes} (UTC${sign}${Math.abs(offset)})`;
                    },
                },
            },
            y: {
                beginAtZero: true,
                ticks: {
                    stepSize: 1,
                    callback: function (value) {
                        return Number(value).toFixed(1);
                    },
                },
            },
        },
    },
});

async function loadstations() {
    try {
        const res = await fetch("/v0/stations");
        const stations = await res.json();

        stationselect.innerHTML = "";
        stations.forEach((s) => {
            const option = document.createElement("option");
            option.value = s.name;
            option.textContent = s.name;
            stationselect.appendChild(option);
        });

        const laststation = localStorage.getItem("laststation");
        if (laststation && stations.find((s) => s.name === laststation)) {
            stationselect.value = laststation;
        } else {
            stationselect.value = stations[0]?.name || "";
        }

        fetchdata(stationselect.value);
    } catch (err) {
        console.error("Failed to load stations:", err);
    }
}

stationselect.addEventListener("change", () => {
    const selected = stationselect.value;
    localStorage.setItem("laststation", selected);
    fetchdata(selected);
});

let currentcontroller = null;

async function fetchdata(station_name) {
    if (!station_name) return;

    if (currentcontroller) {
        currentcontroller.abort();
    }
    currentcontroller = new AbortController();

    try {
        const res = await fetch(`/v0/stations/${station_name}/data`, {
            signal: currentcontroller.signal,
        });

        if (!res.ok) {
            if (res.status === 404) {
                chart.data.labels = [];
                chart.data.datasets.forEach((ds) => (ds.data = []));
                chart.update();

                windspeedmps = "n/a";
                sustainedmps = "n/a";
                gustmps = "n/a";

                return;
            } else {
                throw new Error(`HTTP error: ${res.status}`);
            }
        }

        const data = await res.json();

        if (!data || data.length === 0) {
            windspeed_history = [];

            windspeedmps = "n/a";
            sustainedmps = "n/a";
            gustmps = "n/a";

            return;
        }

        const now = new Date();
        const last = data.filter((item) => now - new Date(item.timestamp) <= 10 * 60 * 1000);

        windspeed_history = last.map((item) => ({
            timestamp: new Date(item.timestamp),
            windspeed: parseFloat(item.windspeed_mps) || null,
        }));

        if (last.length > 0) {
            const latestitem = last[last.length - 1];
            const windspeed = parseFloat(latestitem.windspeed_mps);
            let sustained = parseFloat(latestitem.last_10m_sustained);
            const gust = parseFloat(latestitem.last_10m_gust);

            if (isNaN(windspeed)) {
                windspeedmps = "n/a";
            } else {
                windspeedmps = `${windspeed.toFixed(1)}`;
            }

            if (isNaN(sustained) || sustained == 0) {
                let calculated_sustained = last.reduce((a, b) => a + (parseFloat(b.windspeed_mps) || 0), 0) / last.length;
                calculated_sustained = calculated_sustained.toFixed(1);

                sustainedmps = `${calculated_sustained}`;
            } else {
                sustainedmps = `${sustained.toFixed(1)}`;
            }

            if (isNaN(gust) || gust == 0) {
                let maxgust = 0;

                for (let i = 0; i < last.length; i++) {
                    let segmentmax = last[i].windspeed_mps;
                    let starttime = new Date(last[i].timestamp).getTime();
                    let lasttime = starttime;

                    for (let j = i + 1; j < last.length; j++) {
                        const currenttime = new Date(last[j].timestamp).getTime();
                        const delta = (currenttime - lasttime) / 1000;
                        if (delta > 2) break;

                        segmentmax = Math.max(segmentmax, last[j].windspeed_mps);
                        lasttime = currenttime;

                        const elapsed = (lasttime - starttime) / 1000;
                        if (elapsed >= 3) maxgust = Math.max(maxgust, segmentmax);
                        if (elapsed > 20) break;
                    }
                }

                gustmps = `${maxgust.toFixed(1)}`;
            } else {
                gustmps = `${gust.toFixed(1)}`;
            }
        } else {
            windspeedmps = "n/a";
            sustainedmps = "n/a";
            gustmps = "n/a";
        }
    } catch (error) {
        if (error.name === "AbortError") {
            return;
        }

        console.error("Error fetching windspeed:", error);

        windspeedmps = "ERR";
        sustainedmps = "ERR";
        gustmps = "ERR";
    }

    setTimeout(() => fetchdata(stationselect.value), 1000);
}

let updatetimer;

async function updatedata() {
    const unit = localStorage.getItem("unit") || "m/s";

    if (unit === "km/h") {
        windspeedel.textContent = windspeedmps === "n/a" || windspeedmps === "ERR" ? windspeedmps : (parseFloat(windspeedmps) * 3.6).toFixed(1);
        sustainedwindspeedel.textContent = sustainedmps === "n/a" || sustainedmps === "ERR" ? sustainedmps : (parseFloat(sustainedmps) * 3.6).toFixed(1);
        gustel.textContent = gustmps === "n/a" || gustmps === "ERR" ? gustmps : (parseFloat(gustmps) * 3.6).toFixed(1);
    } else if (unit === "mph") {
        windspeedel.textContent = windspeedmps === "n/a" || windspeedmps === "ERR" ? windspeedmps : (parseFloat(windspeedmps) * 2.23694).toFixed(1);
        sustainedwindspeedel.textContent = sustainedmps === "n/a" || sustainedmps === "ERR" ? sustainedmps : (parseFloat(sustainedmps) * 2.23694).toFixed(1);
        gustel.textContent = gustmps === "n/a" || gustmps === "ERR" ? gustmps : (parseFloat(gustmps) * 2.23694).toFixed(1);
    } else {
        windspeedel.textContent = windspeedmps;
        sustainedwindspeedel.textContent = sustainedmps;
        gustel.textContent = gustmps;
    }

    chart.data.labels = windspeed_history.map((item) => item.timestamp);
    chart.data.datasets.forEach((ds) => {
        const unit = localStorage.getItem("unit") || "m/s";
        ds.data = windspeed_history.map((item) => {
            if (item.windspeed == null) return null;
            if (unit === "km/h") return item.windspeed * 3.6;
            if (unit === "mph") return item.windspeed * 2.23694;
            return item.windspeed;
        });
    });
    chart.data.datasets[0].label = `Windspeed (${unit})`;
    chart.update();

    const lastupdated = windspeed_history.length > 0 ? windspeed_history[windspeed_history.length - 1].timestamp : null;
    updatedel.textContent = lastupdated ? `Last Updated: ${lastupdated.getFullYear()}-${String(lastupdated.getMonth() + 1).padStart(2, "0")}-${String(lastupdated.getDate()).padStart(2, "0")} ${String(lastupdated.getHours()).padStart(2, "0")}:${String(lastupdated.getMinutes()).padStart(2, "0")}:${String(lastupdated.getSeconds()).padStart(2, "0")}` : "Last Updated: n/a";

    clearTimeout(updatetimer);
    updatetimer = setTimeout(updatedata, 500);
}

loadstations();
updatedata();
