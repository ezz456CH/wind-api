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

const chartconfig = {
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
        layout: {
            padding: {
                left: 24,
                right: 24,
            },
        },
        responsive: true,
        animation: false,
        maintainAspectRatio: false,
        interaction: {
            mode: "index",
            intersect: false,
        },
        plugins: {
            title: {
                display: true,
                text: "Windspeed",
            },
            legend: { display: false },
            tooltip: {
                displayColors: false,
                callbacks: {
                    label: function (context) {
                        const label = context.dataset.label || "";
                        const value = context.raw;
                        return `${label}: ${value}`;
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
                suggestedMax: 1,
                ticks: {
                    stepSize: 1,
                    maxTicksLimit: 5,
                    callback: function (value) {
                        return Number(value).toFixed(1);
                    },
                },
            },
        },
    },
};

let chart = new Chart(ctx, chartconfig);

document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
        setTimeout(() => {
            chart.destroy();
            chart = new Chart(ctx, chartconfig);
        }, 50);
    }
});

async function loadstations() {
    try {
        const res = await fetch("/v0/stations");
        const stations = await res.json();

        stationselect.innerHTML = "";

        stations.forEach((s) => {
            const option = document.createElement("option");
            option.value = s.infos.station;
            option.textContent = s.infos.station;
            option.dataset.uuid = s.uuid;
            stationselect.appendChild(option);
        });

        const laststation = localStorage.getItem("laststation");
        let selectedoption;

        if (laststation && stations.find((s) => s.infos.station === laststation)) {
            stationselect.value = laststation;
            selectedoption = Array.from(stationselect.options).find((opt) => opt.value === laststation);
        } else {
            selectedoption = stationselect.options[0];
            stationselect.value = selectedoption ? selectedoption.value : "";
        }

        const uuid = selectedoption ? selectedoption.dataset.uuid : null;
        fetchdata(stationselect.value, uuid);
    } catch (err) {
        console.error("failed to load stations:", err);
    }
}

stationselect.addEventListener("change", () => {
    const selectedoption = stationselect.options[stationselect.selectedIndex];
    if (!selectedoption) return;

    const station = selectedoption.value;
    const uuid = selectedoption.dataset.uuid;

    localStorage.setItem("laststation", station);
    fetchdata(station, uuid);
});

let currentcontroller = null;
let currenttimer = null;

async function fetchdata(station, uuid) {
    if (!station || !uuid) return;

    if (currentcontroller) {
        currentcontroller.abort();
    }
    currentcontroller = new AbortController();

    if (currenttimer) {
        clearTimeout(currenttimer);
    }

    const timeoutid = setTimeout(() => {
        currentcontroller.abort();
    }, 5000);

    try {
        const res = await fetch(`/v0/stations/${station}/${uuid}/data`, {
            signal: currentcontroller.signal,
        });

        if (!res.ok) {
            if (res.status === 404) {
                chart.data.datasets.forEach((ds) => (ds.data = []));
                chart.update();

                windspeedmps = "n/a";
                sustainedmps = "n/a";
                gustmps = "n/a";

                setTimeout(() => fetchdata(stationselect.value, uuid), 1000);
                return;
            } else {
                throw new Error(`HTTP error: ${res.status}`);
            }
        }

        const result = await res.json();
        const data = result.data;

        if (!data || data.length === 0) {
            windspeed_history = [];

            windspeedmps = "n/a";
            sustainedmps = "n/a";
            gustmps = "n/a";

            return;
        }

        const now = new Date(result.server_time);
        const last = data.filter((item) => now - new Date(item.timestamp) <= 10 * 60 * 1000);

        windspeed_history = last.map((item) => ({
            timestamp: new Date(item.timestamp),
            windspeed: isNaN(parseFloat(item.windspeed_mps)) ? null : parseFloat(item.windspeed_mps),
        }));

        if (last.length > 0) {
            const latestitem = last[last.length - 1];

            const windspeed = parseFloat(latestitem.windspeed_mps);
            const sustained = parseFloat(latestitem.last_10m_sustained);
            const gust = parseFloat(latestitem.last_10m_gust);

            windspeedmps = isNaN(windspeed) ? "n/a" : windspeed.toFixed(1);
            sustainedmps = isNaN(sustained) ? "n/a" : sustained.toFixed(1);
            gustmps = isNaN(gust) ? "n/a" : gust.toFixed(1);
        } else {
            windspeedmps = "n/a";
            sustainedmps = "n/a";
            gustmps = "n/a";
        }
    } catch (error) {
        if (error.name === "AbortError") {
            console.warn("Request timed out or aborted");
        } else {
            console.error("Error fetching data:", error);
        }
    } finally {
        clearTimeout(timeoutid);
    }

    currenttimer = setTimeout(() => fetchdata(stationselect.value, uuid), 1000);
}

let updatetimer;
function updatedata() {
    const unit = localStorage.getItem("unit") || "m/s";
    const convert = (val) => {
        if (val === "n/a") return val;

        const num = parseFloat(val);
        if (isNaN(num)) return "n/a";

        if (unit === "km/h") return (num * 3.6).toFixed(1);
        if (unit === "mph") return (num * 2.23694).toFixed(1);

        return num.toFixed(1);
    };

    windspeedel.textContent = convert(windspeedmps);
    sustainedwindspeedel.textContent = convert(sustainedmps);
    gustel.textContent = convert(gustmps);

    chart.data.labels = windspeed_history.map((item) => item.timestamp);
    chart.data.datasets.forEach((ds) => {
        ds.data = windspeed_history.map((item) => (item.windspeed == null ? null : convert(item.windspeed)));
    });
    chart.options.plugins.title.text = `Windspeed (${unit})`;
    chart.data.datasets[0].label = `Windspeed (${unit})`;
    chart.update();

    const lastupdated = windspeed_history.at(-1)?.timestamp;
    updatedel.textContent = lastupdated ? `Last Updated: ${lastupdated.getFullYear()}-${String(lastupdated.getMonth() + 1).padStart(2, "0")}-${String(lastupdated.getDate()).padStart(2, "0")} ${String(lastupdated.getHours()).padStart(2, "0")}:${String(lastupdated.getMinutes()).padStart(2, "0")}:${String(lastupdated.getSeconds()).padStart(2, "0")}` : "Last Updated: n/a";

    clearTimeout(updatetimer);
    updatetimer = setTimeout(updatedata, 500);
}

loadstations();
updatedata();
