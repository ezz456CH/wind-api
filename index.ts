import { Elysia, t } from "elysia";
import { staticPlugin } from "@elysiajs/static";
import { mkdir, appendFile } from "node:fs/promises";
import * as path from "node:path";

const port = process.env.PORT ?? 4001;
const filter_stations = process.env.FILTER_STATIONS === "true";
const filter_stations_uuids = (process.env.FILTER_STATIONS_UUIDS || "").split(",").map((s) => s.trim().toLowerCase());
const connections = new Map();
const recent_connections = new Map();

interface client_data {
    uuid: string | null;
    station: string | null;
}

const app = new Elysia()
    .use(staticPlugin({ prefix: "/" }))
    .get("/v0/stations", () => {
        return Array.from(recent_connections.entries()).map(([uuid, infos]) => ({
            uuid: uuid.replace(/-/g, "").slice(-12),
            infos: infos,
        }));
    })
    .get(
        "/v0/stations/:station/:id/data",
        async ({ params, status }) => {
            const { station, id } = params;

            const fulluuidentry = Array.from(recent_connections.entries()).find(([uuid, c]) => uuid.replace(/-/g, "").slice(-12) === id && c.station === station);

            if (!fulluuidentry) {
                return status(404, "Station Not Found");
            }

            const [fulluuid, infos] = fulluuidentry;

            const iso = new Date().toISOString().split("T")[0];
            const filepath = path.join("stations", fulluuid, `data_${iso}.jsonl`);

            const now = Date.now();
            const last = now - 60 * 60 * 1000;

            try {
                const text = await Bun.file(filepath).text();

                const data = text
                    .trim()
                    .split("\n")
                    .map((line) => JSON.parse(line))
                    .filter((entry) => {
                        const ts = new Date(entry.timestamp).getTime();
                        return ts >= last && ts <= now;
                    });

                return {
                    station,
                    uuid: id,
                    server_time: new Date(now).toISOString(),
                    online: infos.online,
                    data,
                };
            } catch {
                return {
                    station,
                    uuid: id,
                    server_time: new Date(now).toISOString(),
                    online: infos.online,
                    data: [],
                };
            }
        },
        {
            params: t.Object({
                station: t.String(),
                id: t.String(),
            }),
        }
    )
    .ws("/ws", {
        open(ws: any) {
            ws.data = { uuid: null, station: null } as client_data;
            ws.send(JSON.stringify({ action: "identify" }));
        },

        async message(ws: any, message) {
            let data: any;
            if (typeof message === "string") {
                data = JSON.parse(message);
            } else if (message instanceof Buffer) {
                data = JSON.parse(message.toString());
            } else {
                data = message;
            }

            if (data.uuid && data.station && !ws.data.uuid) {
                if (filter_stations && !filter_stations_uuids.includes(data.uuid)) {
                    ws.send(JSON.stringify({ action: "rejected", reason: "unauthorized" }));
                    ws.close(1008);
                    return;
                }

                ws.data.uuid = data.uuid;
                ws.data.station = data.station;

                const ip = ws.data.headers?.["x-forwarded-for"] || ws.remoteAddress;

                const connected_at = new Date().toISOString();

                connections.set(ws.data.uuid, {
                    uuid: ws.data.uuid,
                    station: ws.data.station,
                    ip,
                    connected_at,
                    online: true,
                    ws,
                });

                recent_connections.set(ws.data.uuid, {
                    station: ws.data.station,
                    connected_at,
                    lastseen: connected_at,
                    online: true,
                });
                console.log(`✅ Connected from: ${data.station} (${data.uuid}) @ ${ip}`);

                ws.send(JSON.stringify({ action: "registered", uuid: data.uuid }));
                return;
            }

            if (!ws.data.uuid) {
                return;
            }

            try {
                if (recent_connections.has(ws.data.uuid)) {
                    recent_connections.get(ws.data.uuid).lastseen = new Date().toISOString();
                }

                const dir = path.join("stations", ws.data.uuid);
                await mkdir(dir, { recursive: true });

                const iso = new Date().toISOString().split("T")[0];
                const filepath = path.join(dir, `data_${iso}.jsonl`);

                const line =
                    JSON.stringify({
                        ...data,
                    }) + "\n";

                await appendFile(filepath, line, "utf8");
            } catch (err) {
                console.error(`❌ Failed to save data for ${ws.data.station}:`, err);
            }
        },

        close(ws: any) {
            if (ws.data.uuid) {
                connections.delete(ws.data.uuid);

                if (recent_connections.has(ws.data.uuid)) {
                    recent_connections.get(ws.data.uuid).online = false;
                }

                console.log(`❌ Disconnected from: ${ws.data.station} (${ws.data.uuid})`);
            }
        },
    })
    .listen(port);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
