# Paradiso

A small private cinema. The films on your computer, played on your TV, over your
own wifi — no screen mirroring, so the picture is full quality and your laptop
screen stays free.

Named after *Cinema Paradiso*: one projectionist, quietly showing films to the
people in the room.

Nothing is uploaded anywhere. The video goes straight from your disk to your TV
across your router, which is why there is no buffering.

---

## Contents

- [What you need](#what-you-need)
- [Install](#install)
  - [macOS](#macos)
  - [Linux](#linux)
  - [Windows](#windows)
  - [Docker](#docker-any-platform-nas-or-home-server)
- [Opening it on your TV](#opening-it-on-your-tv)
  - [Samsung](#samsung-tizen) · [LG](#lg-webos) · [Android TV / Google TV](#android-tv--google-tv)
    · [Fire TV](#fire-tv) · [Apple TV](#apple-tv) · [Older or awkward TVs](#older-or-awkward-tvs)
  - [Phones, tablets and other computers](#phones-tablets-and-other-computers)
- [Using it](#using-it)
- [Configuring your library](#configuring-your-library)
- [How playback works](#how-playback-works)
- [Subtitles](#subtitles)
- [Troubleshooting](#troubleshooting)
- [Developing](#developing)
- [A note on security](#a-note-on-security)

---

## What you need

| | |
| --- | --- |
| **A computer** with your films on it | macOS, Linux or Windows. It stays on while you watch. |
| **Node 24 or newer** | The server runs TypeScript directly, which needs 24+. |
| **ffmpeg** | Does the repackaging and, rarely, the re-encoding. |
| **A TV with a web browser** | Or a phone, tablet, or another computer. |
| **One network** | TV and computer on the same wifi or router. |

Using Docker instead? Then you only need Docker — Node and ffmpeg come inside
the image.

---

## Install

### macOS

```bash
# 1. Install the two prerequisites (skip either if you have it already)
brew install node ffmpeg

# 2. Get Paradiso
git clone https://github.com/RiyasaatAhmed/paradiso.git
cd paradiso

# 3. Run it
./start.sh
```

The first run creates a `config.json` for you, pointing at `~/Movies` and
`~/Downloads`. If your films live elsewhere, open it, edit `libraries`, and run
`./start.sh` again — see [Configuring your library](#configuring-your-library).

No Homebrew? Install Node from [nodejs.org](https://nodejs.org) and ffmpeg with
`brew install ffmpeg` after installing [Homebrew](https://brew.sh).

`start.sh` wraps the server in `caffeinate`, so the Mac will not fall asleep
mid-film. It still has to stay powered on and on the same wifi.

### Linux

```bash
# Debian / Ubuntu / Raspberry Pi OS
sudo apt update && sudo apt install -y ffmpeg git curl
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs

# Fedora
sudo dnf install -y ffmpeg nodejs git

# Arch
sudo pacman -S ffmpeg nodejs npm git
```

Then:

```bash
git clone https://github.com/RiyasaatAhmed/paradiso.git
cd paradiso
./start.sh
```

On a desktop Linux machine `start.sh` uses `systemd-inhibit` to stop the machine
sleeping while it streams. On a headless server there is nothing to inhibit and
it simply runs.

Check your Node version if the script complains — distribution packages are
often older than 24:

```bash
node -v    # must be v24 or higher
```

**Running it permanently?** A systemd unit is the tidy way:

```ini
# /etc/systemd/system/paradiso.service
[Unit]
Description=Paradiso
After=network-online.target

[Service]
WorkingDirectory=/home/you/paradiso
ExecStart=/usr/bin/node src/main.ts
Restart=on-failure
User=you

[Install]
WantedBy=multi-user.target
```

```bash
npm run build                      # compile the browser code once
sudo systemctl enable --now paradiso
```

### Windows

Use PowerShell:

```powershell
# 1. Install the prerequisites
winget install OpenJS.NodeJS
winget install Gyan.FFmpeg
winget install Git.Git
```

Close and reopen PowerShell so the new tools are on your `PATH`, then:

```powershell
git clone https://github.com/RiyasaatAhmed/paradiso.git
cd paradiso
npm install
Copy-Item config.example.json config.json
```

Open `config.json` and set `libraries` to your film folders, using forward
slashes:

```json
"libraries": ["C:/Users/you/Videos", "D:/Films"]
```

Then start it:

```powershell
npm start
```

`start.sh` is a bash script and does not run here, which is why the steps are
separate. Two Windows-specific things:

- **Let it through the firewall.** The first run pops up a Windows Defender
  prompt — tick **Private networks** and allow it, or the TV cannot connect.
- **Stop Windows sleeping** while you watch: *Settings → System → Power &
  battery → Screen and sleep* → set sleep to *Never*.

Alternatively, install [Docker Desktop](https://docs.docker.com/desktop/install/windows-install/)
and follow the Docker section — it avoids both of the above.

### Docker (any platform, NAS or home server)

Best suited to a machine that is always on. Node and ffmpeg are inside the
image, so nothing is installed on the host.

```bash
git clone https://github.com/RiyasaatAhmed/paradiso.git
cd paradiso

cp .env.example .env
```

Edit `.env` and set **`PARADISO_MEDIA`** to the folder holding your films, and
**`PARADISO_ANNOUNCE_HOST`** to your machine's wifi address:

```ini
PARADISO_MEDIA=/Users/you/Movies
PARADISO_PORT=8080
PARADISO_ANNOUNCE_HOST=192.168.0.106
```

Then:

```bash
docker compose up -d
docker compose logs -f     # prints the address to type into the TV
```

Everything under `PARADISO_MEDIA` is scanned three folders deep, mounted
read-only — Paradiso never modifies your files.

| Task | Command |
| --- | --- |
| Start | `docker compose up -d` |
| Stop | `docker compose down` |
| Logs | `docker compose logs -f` |
| Update after a `git pull` | `docker compose up -d --build` |
| Clear thumbnails and resume points | `docker volume rm paradiso_paradiso-cache` |

Without compose, if you prefer:

```bash
docker build -t paradiso .
docker run -d --name paradiso \
  -p 8080:8080 \
  -v /path/to/your/films:/media:ro \
  -v "$PWD/config.docker.json:/config/config.json:ro" \
  -v paradiso-cache:/cache \
  -e PARADISO_ANNOUNCE_HOST=192.168.0.106 \
  paradiso
```

Three things worth knowing about the Docker route:

- **Settings live in `config.docker.json`**, not `config.json`, and its paths are
  paths *inside* the container. Leave `libraries` as `/media` and change what you
  mount there instead. Keep `port` at 8080 and remap from outside if you want a
  different one.
- **No hardware encoding.** A Linux container cannot reach a Mac's VideoToolbox
  engine, so the rare file that needs re-encoding uses software encoding, which
  is slower and warmer. *Direct* and *Remux* — what almost every file uses — are
  completely unaffected. If you have a Mac and mainly want it on your laptop,
  the plain macOS install is the better fit.
- **It runs as root by default** so it can read your media whatever owns it. To
  run as yourself, uncomment the `user:` line in `docker-compose.yml`.

---

## Opening it on your TV

However you installed it, the terminal prints something like:

```
  Open this on your TV browser:
      http://192.168.0.106:8080      (en0)
```

Type that whole thing — numbers, dots, colon and port — into your TV's web
browser and press OK. Leave the terminal running while you watch.

> **There is no app to install on the TV.** Paradiso is a web page. Anything with
> a reasonably modern browser can open it.

If you cannot see the address, find it yourself:

```bash
ipconfig getifaddr en0                 # macOS wifi
hostname -I | awk '{print $1}'         # Linux
ipconfig                               # Windows — the IPv4 Address
```

### Samsung (Tizen)

Verified on a UA50AU7700 running Tizen 6.0.

1. **Home** → scroll right to **Apps** → open **Internet**. On some sets it is
   under *Apps → Search → "Internet"*.
2. Press **Up** to reveal the address bar, or select the URL field.
3. Type the address and press **Enter**.
4. Optional: with the page open, press **Up** → **Add to Bookmarks**, so next
   time it is two clicks.

No Internet app on your model? Samsung removed it from some 2023+ sets — use
[Older or awkward TVs](#older-or-awkward-tvs) below.

### LG (webOS)

1. **Home** → **Web Browser** (a globe icon, sometimes inside *More Apps*).
2. Select the address bar at the top, type the address, press the wheel.
3. Optional: **☰ menu → Add to Favourites**.

The Magic Remote's pointer works on the page, but the arrow keys and the wheel
button are the intended way to drive it.

### Android TV / Google TV

There is no browser preinstalled, so add one first:

1. Open the **Play Store** on the TV and install **Chrome**, or sideload
   [Puffin TV Browser](https://play.google.com/store/apps/details?id=com.cloudmosa.puffinTV)
   which is built for remotes.
2. Open it and enter the address.

This covers Sony, TCL, Philips, Hisense, Nvidia Shield and Chromecast with
Google TV.

### Fire TV

1. Install **Amazon Silk Browser** from the Appstore (it is free).
2. Open it and enter the address.

### Apple TV

tvOS has no web browser, so Paradiso cannot run on it directly. Two options:

- Open Paradiso on an **iPhone or iPad** and AirPlay the video to the Apple TV.
  Tap the AirPlay icon in the player's own controls once playback starts.
- Or open it on any of the TVs above.

### Older or awkward TVs

If the browser is missing, ancient, or refuses to play:

- **A cheap streaming stick** solves it permanently — a Fire TV Stick or
  Chromecast with Google TV plugged into any HDMI port gives you a modern
  browser regardless of the TV's age.
- **A laptop on HDMI**, opening the address in Chrome, pressing `F` for full
  screen.
- **Chromecast**: open Paradiso in desktop Chrome, start the film, then
  **⋮ → Cast → Cast tab**.

### Phones, tablets and other computers

The same address works everywhere on your network — nothing extra to do:

| Device | How |
| --- | --- |
| **iPhone / iPad** | Safari or Chrome → type the address. *Share → Add to Home Screen* makes it feel like an app. |
| **Android** | Chrome → type the address. *⋮ → Add to Home screen*. |
| **Mac / Windows / Linux** | Any browser. `F` toggles full screen; arrow keys and Enter work as the remote does. |

Touchscreens work by tapping. The layout adapts to the screen size, so a phone
gets a phone-shaped version rather than a shrunken TV one.

---

## Using it

A billboard across the top showing whatever you are resting on, then horizontal
rows underneath — **Continue Watching** first, then one row per folder.

The interface is deliberately quiet, so the film artwork is the only bright thing
on screen. One blue carries everything you can act on — the Play button, the
focus ring, the scrubber, the progress line under a thumbnail — and nothing else
is coloured at all.

| Key | What it does |
| --- | --- |
| **Arrows** | Move along a row, or between rows |
| **OK / Enter** | Open a title, then play or pause |
| **Left / Right** *while playing* | Jump back / forward 10 seconds |
| **Up** *while playing* | Show the control bar |
| **Back** | Hide the controls, then leave the film |
| **F** *(keyboard only)* | Toggle full screen |

Where you stopped is remembered, so a half-watched film shows a **Resume**
button, a progress line on its thumbnail, and a place in Continue Watching.

Added new files? Press **Rescan** in the app — no restart needed.

---

## Configuring your library

Edit `config.json` (or `config.docker.json` when using Docker):

```json
{
  "port": 8080,
  "libraries": ["~/Movies", "~/Downloads", "/Volumes/External/Films"],
  "maxDepth": 2,
  "minSizeMB": 200,
  "exclude": ["node_modules", ".*", "*.app"]
}
```

| Setting | What it does |
| --- | --- |
| `port` | The port to serve on. Change it if 8080 is taken. |
| `libraries` | Folders to look in. `~` means your home folder. External drives and network shares work, as long as they are mounted. |
| `maxDepth` | How many subfolder levels to search. `2` finds `Films/Heat/heat.mkv`. |
| `minSizeMB` | Hides anything smaller, keeping screen recordings and clips out of the way. The **Show everything** button in the app ignores it whenever you want. |
| `exclude` | Folder names to skip entirely. `*` works as a wildcard. |

Restart the server after editing this file. Adding *files* only needs **Rescan**;
adding *folders* here needs a restart.

---

## How playback works

A video file is two separate things: a **container** (`.mkv`, `.mp4` — the
wrapper) and the **codecs** inside it (H.264, HEVC, AAC). A TV is often perfectly
able to decode the contents while refusing the box. Paradiso picks the cheapest
way to give it something it will accept, automatically. You can also switch
mid-film from **Mode** in the control bar.

| Mode | What happens | Quality | Cost to your computer |
| --- | --- | --- | --- |
| **Direct** | The file is sent untouched | Identical | None at all |
| **Remux** | Repackaged into MP4 while streaming; audio and video are *copied, not re-encoded* | Identical | Negligible |
| **Convert** | Re-encoded on the fly, using hardware acceleration where available | Slightly reduced | Real — the machine gets warm |

MP4 files go **Direct**. MKV files, which TV browsers will not open, go
**Remux** — the picture is bit-for-bit the same. Only genuinely unusual codecs
need **Convert**. If a file fails, Paradiso retries down this list before showing
an error, so a stubborn file usually fixes itself.

**Why there is no buffering.** Your router is far faster than any internet
connection:

| | Throughput |
| --- | --- |
| What your files need | 3–4 Mbps |
| Direct / Remux can deliver | limited only by your disk and wifi |
| Convert can deliver | ~27 Mbps (about 6× more than needed) |

Seeking inside an MKV works a little differently: because the video is being
repackaged live, jumping restarts the stream at the new position. Paradiso waits
until you stop pressing before doing it, so holding the arrow key scrubs smoothly
instead of stuttering.

---

## Subtitles

Subtitles embedded in your files are pulled out automatically and shown at a size
meant for across-the-room viewing. If a file has them they are **on by default**.
Cycle between tracks or switch them off with the **Subtitles** button.

Only text subtitles work — SRT and ASS, which is what almost every file uses.
Image-based subtitles (PGS/VobSub, found on some Blu-ray rips) cannot be
displayed in a browser.

---

## Troubleshooting

**The TV says "Server not found", or the page never loads.**

1. Check both devices are on the *same* wifi. A phone on mobile data, or a TV on
   a 5 GHz band the laptop is not on, will not reach it. Guest networks are
   usually isolated from the main one — that is the most common cause.
2. Re-check the address. `192.168.0.106:8080` — the port matters.
3. Confirm the server is up from the computer itself: open
   `http://localhost:8080`. If that fails, the problem is the server, not the TV.
4. **Firewall.** On Windows, allow Node on private networks. On macOS, *System
   Settings → Network → Firewall* → allow incoming connections for Node.
5. Some routers have **AP isolation** or "client isolation" switched on, which
   blocks devices from seeing each other. Turn it off in the router settings.
6. Watch the terminal while the TV tries to load. Requests from other devices are
   logged, so if nothing appears the traffic is not arriving at all.

**A film is listed but will not play.** Open it and try **Mode → Convert** in the
control bar. If Convert works and the others do not, the TV is refusing the
codec. If nothing works, the file may be corrupt — try playing it on the computer.

**No films are listed.** Check `libraries` in your config points at the right
folders, and that `minSizeMB` is not hiding them — press **Show everything** to
find out. Then press **Rescan**.

**Playback stops after a while.** The computer went to sleep. Use `./start.sh`
rather than `npm start`, or disable sleep in your system settings.

**Everything is slow, or the machine is hot.** A file is being converted rather
than remuxed. The **Mode** button in the control bar shows which is in use.

**Thumbnails are wrong or missing.** Delete the `.cache/` folder and restart; it
rebuilds. On Docker: `docker volume rm paradiso_paradiso-cache`.

**`ffmpeg: command not found`.** ffmpeg is not installed or not on your `PATH`.
Reopen your terminal after installing it, then check with `ffmpeg -version`.

**Node version errors.** Paradiso runs TypeScript without a build step, which
needs Node 24+. Check with `node -v`.

---

## Developing

```bash
npm install     # once: TypeScript is the only dependency
npm start       # compile the browser code, then run the server
npm test        # type-check both halves, then run 79 unit tests
npm run watch   # recompile the browser code as you edit it
npm run typecheck
```

Written in TypeScript with **zero runtime dependencies** — Node's standard
library on the server, plain ES modules in the browser, ffmpeg for the media
work. Node runs the server straight from `.ts` source; only the browser code is
compiled, into `public/app/`.

[`ARCHITECTURE.md`](ARCHITECTURE.md) explains how the code is laid out and why —
worth reading before changing anything in `src/media`, which is the part with
real subtlety.

[`DESIGN.md`](DESIGN.md) records the design system the interface follows and the
three places it deliberately departs from it — worth reading before changing
anything in `public/styles/`.

---

## A note on security

Paradiso listens on your local network with **no password**. Anyone on the same
wifi can browse and play the folders you configured. That is fine at home; on a
shared, office or hotel network it is worth stopping the server when you are
done.

Do not forward its port on your router. It is not built to face the internet.
