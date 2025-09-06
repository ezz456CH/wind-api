const stationselect = document.getElementById("station-select");

const windspeedmpsel = document.querySelector(".windspeedmps");
const windspeedkmhel = document.querySelector(".windspeedkmh");
const windspeedmphel = document.querySelector(".windspeedmph");

const sustainedwindspeedmpsel = document.querySelector(".sustainedmps");
const sustainedwindspeedkmhel = document.querySelector(".sustainedkmh");
const sustainedwindspeedmphel = document.querySelector(".sustainedmph");

const gustmpsel = document.querySelector(".gustmps");
const gustkmhel = document.querySelector(".gustkmh");
const gustmphel = document.querySelector(".gustmph");

const ctx = document.getElementById("history-chart").getContext("2d");

Chart.defaults.font.family = "JetBrains Mono, monospace";
Chart.defaults.font.size = 12;
Chart.defaults.font.style = "normal";
Chart.defaults.font.weight = "600";

const windchart = new Chart(ctx, {
    type: "line",
    data: {
        labels: [],
        datasets: [
            {
                label: "Windspeed (km/h)",
                data: [],
                borderWidth: 2,
                borderColor: "rgba(173, 250, 247, 1)",
                backgroundColor: "rgba(255, 255, 255, 0)",
                tension: 0.2,
                pointRadius: 0,
                pointHitRadius: 5,
                yAxisID: "y",
            },
            {
                label: "Windspeed (mph)",
                data: [],
                borderWidth: 2,
                borderColor: "rgba(247, 250, 173, 1)",
                backgroundColor: "rgba(255, 255, 255, 0)",
                pointRadius: 0,
                pointHitRadius: 5,
                yAxisID: "y",
            },
            {
                label: "Windspeed (m/s)",
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
                    maxTicksLimit: 3,
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
                    stepSize: 0.5,
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
                windchart.data.labels = [];
                windchart.data.datasets.forEach((ds) => (ds.data = []));
                windchart.update();

                windspeedmpsel.textContent = "n/a m/s";
                windspeedkmhel.textContent = "n/a km/h";
                windspeedmphel.textContent = "n/a mph";

                sustainedwindspeedmpsel.textContent = "n/a m/s";
                sustainedwindspeedkmhel.textContent = "n/a km/h";
                sustainedwindspeedmphel.textContent = "n/a mph";

                gustmpsel.textContent = "n/a m/s";
                gustkmhel.textContent = "n/a km/h";
                gustmphel.textContent = "n/a mph";

                return;
            } else {
                throw new Error(`HTTP error: ${res.status}`);
            }
        }

        const data = await res.json();

        windchart.data.labels = [];
        windchart.data.datasets.forEach((ds) => (ds.data = []));

        if (!data || data.length === 0) {
            windchart.update();

            windspeedmpsel.textContent = "n/a m/s";
            windspeedkmhel.textContent = "n/a km/h";
            windspeedmphel.textContent = "n/a mph";

            sustainedwindspeedmpsel.textContent = "n/a m/s";
            sustainedwindspeedkmhel.textContent = "n/a km/h";
            sustainedwindspeedmphel.textContent = "n/a mph";

            gustmpsel.textContent = "n/a m/s";
            gustkmhel.textContent = "n/a km/h";
            gustmphel.textContent = "n/a mph";

            return;
        }

        const now = new Date();
        const last = data.filter((item) => now - new Date(item.timestamp) <= 10 * 60 * 1000);

        last.forEach((item) => {
            const windspeedmps = parseFloat(item.windspeed_mps);
            const timestamp = new Date(item.timestamp);
            if (!isNaN(windspeedmps)) {
                windchart.data.labels.push(timestamp);
                windchart.data.datasets[0].data.push(windspeedmps * 3.6);
                windchart.data.datasets[1].data.push(windspeedmps * 2.23694);
                windchart.data.datasets[2].data.push(windspeedmps);
            }
        });

        windchart.update();

        if (last.length > 0) {
            const latestitem = last[last.length - 1];
            const windspeedmps = parseFloat(latestitem.windspeed_mps);
            let sustainedmps = parseFloat(latestitem.last_10m_sustained);
            const gustmps = parseFloat(latestitem.last_10m_gust);

            if (isNaN(windspeedmps)) {
                windspeedmpsel.textContent = "n/a m/s";
                windspeedkmhel.textContent = "n/a km/h";
                windspeedmphel.textContent = "n/a mph";
            } else {
                windspeedmpsel.textContent = `${windspeedmps.toFixed(1)} m/s`;
                windspeedkmhel.textContent = `${(windspeedmps * 3.6).toFixed(1)} km/h`;
                windspeedmphel.textContent = `${(windspeedmps * 2.23694).toFixed(1)} mph`;
            }

            if (isNaN(sustainedmps) || sustainedmps == 0) {
                const calculated_sustained = last.reduce((a, b) => a + (parseFloat(b.windspeed_mps) || 0), 0) / last.length;

                sustainedwindspeedmpsel.textContent = `${calculated_sustained.toFixed(1)} m/s`;
                sustainedwindspeedkmhel.textContent = `${(calculated_sustained * 3.6).toFixed(1)} km/h`;
                sustainedwindspeedmphel.textContent = `${(calculated_sustained * 2.23694).toFixed(1)} mph`;
            } else {
                sustainedwindspeedmpsel.textContent = `${sustainedmps.toFixed(1)} m/s`;
                sustainedwindspeedkmhel.textContent = `${(sustainedmps * 3.6).toFixed(1)} km/h`;
                sustainedwindspeedmphel.textContent = `${(sustainedmps * 2.23694).toFixed(1)} mph`;
            }

            if (isNaN(gustmps) || gustmps == 0) {
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

                gustmpsel.textContent = `${maxgust.toFixed(1)} m/s`;
                gustkmhel.textContent = `${(maxgust * 3.6).toFixed(1)} km/h`;
                gustmphel.textContent = `${(maxgust * 2.23694).toFixed(1)} mph`;
            } else {
                gustmpsel.textContent = `${gustmps.toFixed(1)} m/s`;
                gustkmhel.textContent = `${(gustmps * 3.6).toFixed(1)} km/h`;
                gustmphel.textContent = `${(gustmps * 2.23694).toFixed(1)} mph`;
            }
        } else {
            windspeedmpsel.textContent = "n/a m/s";
            windspeedkmhel.textContent = "n/a km/h";
            windspeedmphel.textContent = "n/a mph";

            sustainedwindspeedmpsel.textContent = "n/a m/s";
            sustainedwindspeedkmhel.textContent = "n/a km/h";
            sustainedwindspeedmphel.textContent = "n/a mph";

            gustmpsel.textContent = "n/a m/s";
            gustkmhel.textContent = "n/a km/h";
            gustmphel.textContent = "n/a mph";
        }
    } catch (error) {
        if (error.name === "AbortError") {
            return;
        }

        console.error("Error fetching windspeed:", error);

        windchart.data.labels = [];
        windchart.data.datasets.forEach((ds) => (ds.data = []));
        windchart.update();

        windspeedmpsel.textContent = "n/a m/s";
        windspeedkmhel.textContent = "n/a km/h";
        windspeedmphel.textContent = "n/a mph";

        sustainedwindspeedmpsel.textContent = "n/a m/s";
        sustainedwindspeedkmhel.textContent = "n/a km/h";
        sustainedwindspeedmphel.textContent = "n/a mph";

        gustmpsel.textContent = "n/a m/s";
        gustskmhel.textContent = "n/a km/h";
        gustsmphel.textContent = "n/a mph";
    }

    setTimeout(() => fetchdata(stationselect.value), 1000);
}

loadstations();
