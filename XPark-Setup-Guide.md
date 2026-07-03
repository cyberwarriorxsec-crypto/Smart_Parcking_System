# XPark Smart Parking System — Setup Guide
### From Zero to Public URL, Step by Step

---

## What You Need Before Starting

- A Windows PC or Laptop
- ESP32 with code already uploaded
- Internet connection
- Your phone (for testing)

---

## Step 1 — Install Node.js

1. Open browser → go to **nodejs.org**
2. Click the big **LTS** download button
3. Open the downloaded file → click Next → Next → Install
4. When done, open **Command Prompt**:
   ```
   Win + R → type cmd → press Enter
   ```
5. Type this and press Enter:
   ```bash
   node --version
   ```
   You should see something like `v20.x.x` ✅

---

## Step 2 — Create Your Project Folder

In Command Prompt, type these one by one:

```bash
cd Desktop
mkdir xpark-server
cd xpark-server
```

You are now inside your project folder.

---

## Step 3 — Install Required Packages

Type this and press Enter — wait for it to finish:

```bash
npm init -y
npm install express better-sqlite3 nodemailer express-session bcryptjs cors axios node-cron
```

> This takes 1–2 minutes. You will see a lot of text — that is normal.
> When done you will see your cursor again. ✅

---

## Step 4 — Put server.js in the Folder

1. Download the `server.js` file
2. Copy it into your `xpark-server` folder on Desktop

Your folder should now look like:

```
xpark-server/
├── server.js        ← you just added this
├── package.json     ← auto created by npm
└── node_modules/    ← auto created by npm
```

---

## Step 5 — Edit server.js

Open `server.js` with **Notepad** or any text editor.

### 5a — Set your ESP32 IP

Find and change **line 8**:

```js
// Change this:
const ESP32_IP = 'http://192.168.x.x';

// To your real ESP32 IP, example:
const ESP32_IP = 'http://192.168.1.45';
```

**How to find your ESP32 IP:**
1. Upload ESP32 code via Arduino IDE
2. Open Serial Monitor (top right button)
3. Set baud rate to **115200**
4. Press reset button on ESP32
5. You will see: `XPark ESP32 IP: 192.168.1.45`
6. Copy that number

### 5b — Set your team member names

```js
const TEAM_MEMBERS = [
  { name: 'Rupam Dhali',  role: 'Project Lead & Backend',  avatar: 'RD' },
  { name: 'Member Two',   role: 'Hardware & Wiring',        avatar: 'MT' },
  { name: 'Member Three', role: 'Frontend & Dashboard',     avatar: 'MH' },
  { name: 'Member Four',  role: 'IoT & ESP32 Programming',  avatar: 'MF' },
];
```

> `avatar` = 2 letter initials shown in the coloured box

### 5c — Save the file

Press **Ctrl + S** to save.

---

## Step 6 — Run the Server

In Command Prompt (make sure you are in `xpark-server` folder):

```bash
node server.js
```

You should see:

```
Default login → admin / admin123
XPark running → http://localhost:3000
Public page   → http://localhost:3000/
Admin panel   → http://localhost:3000/login
```

✅ Server is running.

---

## Step 7 — Test on Your Own PC First

Open your browser and go to:

```
http://localhost:3000
```

You should see the **XPark public page** with slot availability.

Then test admin login:

```
http://localhost:3000/login

Username: admin
Password: admin123
```

If both work — everything is ready. ✅

---

## Step 8 — Download ngrok

1. Go to **ngrok.com**
2. Click **Sign up** — create free account with your email
3. After signing up → go to **Dashboard**
4. Click **Download** → choose **Windows**
5. A zip file downloads → open it → drag `ngrok.exe` into your `xpark-server` folder

Your folder now:

```
xpark-server/
├── server.js
├── ngrok.exe        ← just added
├── package.json
└── node_modules/
```

---

## Step 9 — Connect ngrok to Your Account

1. On ngrok website → go to **Dashboard → Your Authtoken**
2. Copy the token — it looks like:
   ```
   2abc123xyz_ABC123defGHI456jkl
   ```
3. In Command Prompt type (paste your real token):
   ```bash
   ngrok config add-authtoken YOUR_TOKEN_HERE
   ```

You will see: `Authtoken saved` ✅

> You only do this **once ever.**

---

## Step 10 — Open Second Command Prompt Window

Keep the **first window** running `node server.js`.

Open a **new** Command Prompt window:
```
Win + R → cmd → Enter
```

Go to your folder:
```bash
cd Desktop\xpark-server
```

Run ngrok:
```bash
ngrok http 3000
```

You will see:
```
Session Status    online
Forwarding        https://a1b2c3.ngrok-free.app → localhost:3000
```

**That https link is your public URL.** ✅

---

## Step 11 — Test From Your Phone

1. Take your phone
2. Open any browser
3. Type the ngrok URL:
   ```
   https://a1b2c3.ngrok-free.app
   ```
4. You should see XPark public page ✅
5. Tap **Admin Panel** → login → full dashboard ✅

---

## Step 12 — Share the URL

Send this URL to anyone:

```
Public view (no login needed):
https://a1b2c3.ngrok-free.app

Admin panel (login required):
https://a1b2c3.ngrok-free.app/login
```

---

## Important — Two Windows Must Stay Open

```
Window 1                  Window 2
────────────────────────  ────────────────────────
node server.js            ngrok http 3000

DO NOT CLOSE ❌           DO NOT CLOSE ❌
```

> If either window closes → website goes offline.

---

## Default Login Credentials

| Field    | Value      |
|----------|------------|
| Username | admin      |
| Password | admin123   |

> Change these after your demo for security.

---

## Who Sees What

| Person       | URL                        | Login Needed |
|--------------|----------------------------|--------------|
| Normal user  | ngrok URL (root `/`)       | ❌ No        |
| Admin        | ngrok URL + `/login`       | ✅ Yes       |

---

## If Something Goes Wrong

| Problem                   | Fix                                          |
|---------------------------|----------------------------------------------|
| `node` not recognized     | Restart PC after installing Node.js          |
| ESP32 unreachable warning | Check ESP32 IP is correct in server.js       |
| localhost:3000 not opening| Make sure `node server.js` is running        |
| ngrok URL not working     | Make sure ngrok window is open               |
| Login not working         | Use exactly `admin` / `admin123`             |
| Dashboard shows `—`       | ESP32 not connected — check WiFi             |

---

## Your Folder When Everything is Done

```
xpark-server/
├── server.js          ← your server code
├── ngrok.exe          ← internet tunnel
├── xpark.db           ← auto created database
├── package.json
└── node_modules/
```

---

## Quick Checklist for Demo Day

```
□ Node.js installed
□ npm packages installed
□ server.js placed in folder
□ ESP32 IP updated in server.js
□ Team names updated in server.js
□ node server.js running (Window 1)
□ ngrok http 3000 running (Window 2)
□ Tested on browser — localhost:3000 works
□ Tested on phone — ngrok URL works
□ ESP32 plugged in and connected to WiFi
□ Power bank fully charged
□ ngrok URL copied and ready to share
```

---

## Summary — All Steps in Order

| Step | Action                              |
|------|-------------------------------------|
| 1    | Install Node.js from nodejs.org     |
| 2    | Create xpark-server folder          |
| 3    | Run npm install                     |
| 4    | Put server.js in folder             |
| 5    | Edit ESP32 IP and team names        |
| 6    | Run node server.js                  |
| 7    | Test on localhost:3000              |
| 8    | Download ngrok.exe                  |
| 9    | Run ngrok config add-authtoken      |
| 10   | Run ngrok http 3000                 |
| 11   | Test on phone with ngrok URL        |
| 12   | Share URL with others               |

---

*XPark Smart Parking System — Built with ESP32 & Node.js*
