# Wind API

just a simple wind api with static page included

## Endpoints

- `GET /v0/stations` – list all stations  
- `GET /v0/stations/:name/data` – get data for a station 
- `POST /v0/data` – submit wind data (`timestamp` and `windspeed_mps`)