# XPark — Smart Parking System

IoT-based real-time parking management system built on an ESP32 microcontroller with a Node.js/Express dashboard for live monitoring, gate control, and slot management.

![Node.js](https://img.shields.io/badge/Node.js-Express-green)
![ESP32](https://img.shields.io/badge/Hardware-ESP32-blue)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

---

## Overview

XPark tracks parking slot occupancy through ESP32-connected sensors, controls an automated gate, and streams live status to a web dashboard. The system has two layers:

- **ESP32 firmware** — reads the sensors, drives the gate servo and LEDs, and exposes a local HTTP API (`/data`, `/admin/*`)
- **Node.js server** — polls the ESP32, adds authentication, logging, and analytics, and serves two web interfaces:
  - **Public view** — no login required, shows live slot availability only
  - **Admin dashboard** — login-protected, full control over the gate, slots, and system lock, plus activity logs and analytics

## Features

- 🅿️ **Live slot tracking** — real-time occupied/available status per bay
- 🚧 **Automated gate control** — IR/PIR-triggered, plus manual admin override
- 🔒 **System lock** — disable sensors for maintenance
- 📋 **Activity log** — entries, exits, and admin actions (last 100 events)
- 📊 **Analytics** — today's/weekly entry counts and per-slot usage stats
- 🔐 **Admin authentication** — session-based login with bcrypt password hashing
- 🌐 **Public status page** — visitors can check availability without signing in
- 💡 **Status LEDs** — green/red indicators for at-a-glance availability

## Tech Stack

| Layer | Technology |
|---|---|
| Microcontroller | ESP32 |
| Firmware | Arduino (`WiFi.h`, `WebServer.h`, `ESP32Servo`) |
| Backend | Node.js, Express |
| Auth | express-session, bcryptjs |
| HTTP client | Axios (ESP32 polling) |
| Frontend | Vanilla HTML/CSS/JS (server-rendered) |

## Hardware

| Component | Purpose |
|---|---|
| ESP32 dev board | Main controller, WiFi + web server |
| IR sensor | Entry detection |
| PIR sensor | Exit detection |
| SG90 (or similar) servo | Barrier gate arm |
| Green LED | "Slots available" indicator |
| Red LED | "Full" indicator |

**Wiring (per `xpark_firmware.ino`):**

| Pin | Component |
|---|---|
| GPIO 18 | IR sensor (entry) |
| GPIO 19 | PIR sensor (exit) |
| GPIO 25 | Servo (barrier gate) |
| GPIO 26 | Green LED |
| GPIO 27 | Red LED |

## Project Structure

```
xpark/
├── server.js               # Express server — routes, ESP32 polling, dashboard/login/public HTML
├── firmware/
│   └── xpark_firmware.ino  # ESP32 sketch — sensors, gate control, local HTTP API
├── package.json
└── README.md
```

## Prerequisites

**Server**
- Node.js 16+
- npm

**Firmware**
- Arduino IDE with the ESP32 board package installed
- `ESP32Servo` library (Library Manager → search "ESP32Servo")
- An ESP32 dev board, wired per the table above, on the same WiFi network as the server

## Installation

```bash
git clone https://github.com/<your-username>/xpark.git
cd xpark
npm install
```

## Configuration

### 1. Flash the ESP32 firmware

Open `firmware/xpark_firmware.ino` in the Arduino IDE and update your WiFi credentials before uploading:

```cpp
const char* ssid     = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
```

Select your board under **Tools → Board**, set the port, and upload at 115200 baud. Open the Serial Monitor after boot — it prints the ESP32's assigned IP address, e.g.:

```
IP: 192.168.43.58
```

You'll need this IP for the server config in the next step.

### 2. Configure the server

Open `server.js` and update the config block at the top:

```js
const ESP32_IP        = 'http://192.168.43.58';   // IP printed by the ESP32 on boot
const ESP32_TOKEN     = 'XParkToken2026';          // see security note below
const PORT             = 3000;
const SESSION_SECRET   = 'xpark_secret_2026';      // change to a random secret

const ADMIN_USERNAME       = 'admin';
const ADMIN_PASSWORD_HASH  = bcrypt.hashSync('admin123', 10); // change this password
```

> ⚠️ **Before deploying:** change `SESSION_SECRET` and the admin password from their defaults.

> ⚠️ **Security note:** the server sends `ESP32_TOKEN` as an `X-Auth-Token` header on every admin request, but the current firmware does not validate it — any device on the same network can call the ESP32's `/admin/*` endpoints directly, bypassing the Node.js login. If the gate is exposed to a shared or public network, add a token check to the firmware before relying on this in production.

Team member names/roles shown on the dashboard's Team tab can be edited in the `TEAM_MEMBERS` array in `server.js`.

## Usage

```bash
node server.js
```

| Route | Description |
|---|---|
| `http://localhost:3000/` | Public live-availability view |
| `http://localhost:3000/login` | Admin sign-in |
| `http://localhost:3000/dashboard` | Admin dashboard (requires login) |

The ESP32 also serves its own minimal dashboard directly at `http://<esp32-ip>/` — useful for testing the hardware without the Node server running.

## API Endpoints

### Node.js server (`server.js`)

**Public**
- `GET /api/public-status` — available slots, total, occupied slot list

**Admin (session required)**
- `GET /api/status` — full ESP32 state
- `GET /api/logs` — activity log
- `GET /api/stats` — today/week counts + per-slot usage
- `POST /api/admin/gate/open` · `/gate/close`
- `POST /api/admin/lock` · `/unlock`
- `POST /api/admin/slot/add` · `/slot/remove`
- `POST /api/admin/reset`

### ESP32 firmware (`xpark_firmware.ino`)

- `GET /data` — current state (available, occupied, total, gate, locked, activity, occupied_slots)
- `/admin/gate/open` · `/gate/close`
- `/admin/lock` · `/unlock`
- `/admin/slot/add` · `/slot/remove`
- `/admin/reset`

## Screenshots

<!-- Add dashboard screenshots here -->
| Public View | Admin Dashboard |
|---|---|
| _add screenshot_ | _add screenshot_ |

## Roadmap

- [ ] Token validation on ESP32 admin endpoints (see security note above)
- [ ] Persistent storage (currently in-memory on both server and firmware — resets on restart)
- [ ] Multi-admin support with roles
- [ ] Mobile app / PWA support
- [ ] Slot reservation system

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you'd like to change.

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## Team

Built by the XPark project team — see the Team tab in the admin dashboard for current members and roles.
