const express = require("express");
const app = express();
const fs = require("fs/promises");
const path = require("path");
require("dotenv").config();

const port = process.env.APIPORT || 4001;

async function getstations() {
    try {
        const data = await fs.readFile(path.join(__dirname, "stations.json"), "utf-8");
        return JSON.parse(data);
    } catch (err) {
        console.error("Failed to read stations.json:", err);
        return [];
    }
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/v0/data", async (req, res) => {
    const authheader = req.headers["authorization"];
    if (!authheader) return res.status(401).json({ error: "Unauthorized" });

    const token = authheader.split(" ")[1];
    const stations = await getstations();
    const station = stations.find((c) => c.token === token);
    if (!station) return res.status(401).json({ error: "Unauthorized" });

    const { timestamp, windspeed_mps } = req.body;

    const entry = {
        timestamp: timestamp || new Date().toISOString(),
        windspeed_mps: windspeed_mps,
    };

    //console.log(`Data received from ${station.name}:`, entry);

    try {
        const dir = path.join(__dirname, "stations", station.name);
        await fs.mkdir(dir, { recursive: true });

        const iso = new Date().toISOString().split("T")[0];
        const filepath = path.join(dir, `data_${iso}.json`);
        const tmpPath = filepath + ".tmp";

        let fileData = [];
        try {
            const existingData = await fs.readFile(filepath, "utf-8");
            fileData = JSON.parse(existingData);
        } catch {
            fileData = [];
        }

        fileData.push(entry);

        await fs.writeFile(tmpPath, JSON.stringify(fileData, null, 2));
        await fs.rename(tmpPath, filepath);

        res.status(200).json({ status: "success" });
    } catch (err) {
        console.error("error saving data:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get("/v0/stations", async (_req, res) => {
    const stations = await getstations();
    const publicstations = stations.map((s) => ({ name: s.name }));
    res.json(publicstations);
});

app.get("/v0/stations/:name/data", async (req, res) => {
    const stations = await getstations();
    const stationname = req.params.name;
    const station = stations.find((s) => s.name === stationname);
    if (!station) return res.status(404).json({ error: "Station not found" });

    try {
        const dir = path.join(__dirname, "stations", station.name);

        try {
            await fs.access(dir);
        } catch {
            return res.status(404).json({ error: "No data for this station" });
        }

        const files = await fs.readdir(dir);
        const datafiles = files.filter((file) => file.startsWith("data_") && file.endsWith(".json"));

        if (datafiles.length === 0) {
            return res.status(404).json({ error: "No data for this station" });
        }

        const now = new Date();
        const last = new Date(now.getTime() - 60 * 60 * 1000);

        const neededdates = new Set([last.toISOString().slice(0, 10), now.toISOString().slice(0, 10)]);

        const neededfiles = datafiles.filter((file) => {
            const dateStr = file.slice(5, 15);
            return neededdates.has(dateStr);
        });

        let alldata = [];
        for (const file of neededfiles) {
            const filePath = path.join(dir, file);
            const fileContent = await fs.readFile(filePath, "utf-8");
            const jsonData = JSON.parse(fileContent);
            alldata = alldata.concat(jsonData);
        }

        const lastdata = alldata.filter((d) => {
            const ts = new Date(d.timestamp).getTime();
            return ts >= last.getTime();
        });

        res.json(lastdata);
    } catch (err) {
        console.error("error reading data:", err);
        res.status(500).json({ error: "failed to read data" });
    }
});

app.listen(port, () => {
    console.log(`listening at http://localhost:${port}`);
});
