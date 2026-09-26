# Paradiso

A small private cinema. The films on your laptop, played on your TV, over your
own wifi — no screen mirroring, so the picture is full quality and your laptop
screen stays free.

Named after *Cinema Paradiso*: one projectionist, quietly showing films to the
people in the room.

## Running it

```bash
./start.sh
```

(or `npm start`, if you would rather not have the laptop kept awake)

It prints something like:

```
Open this on your TV browser:
    http://192.168.0.106:8080
```

Type that into the TV's web browser. That's it. Leave the terminal open while
you watch — closing it stops the server.

`start.sh` wraps the server in `caffeinate`, so the laptop won't fall asleep
mid-film. It still needs to stay powered on and on the same wifi.

## The interface

Laid out like Netflix: a billboard across the top showing whatever the remote is
resting on, then horizontal rows underneath — **Continue Watching** first, then
one row per folder. Red is reserved for progress, so the only red on screen is
the scrubber and the resume line under a thumbnail.

| Key | What it does |
| --- | --- |
| Arrows | Move along a row, or between rows |
| OK / Enter | Open a title, then play or pause |
| Left / Right *while playing* | Jump back / forward 10 seconds |
| Up *while playing* | Show the control bar |
| Back | Hide the controls, then leave the film |
| F *(keyboard)* | Toggle full screen |

Where you stopped is remembered, so a half-watched film shows a **Resume**
button, a red progress line on its thumbnail, and a place in Continue Watching.

## The three playback modes

The app picks the right one automatically. You only need this if something
looks wrong, and you can switch mid-film from **Mode** in the control bar.

- **Direct** — sends the file untouched. No CPU use at all, instant seeking.
  Used for MP4 files.
- **Remux** — repackages the video into MP4 while streaming. Picture and sound
  are *copied, not re-encoded*, so quality is identical and the laptop barely
  works. Used for MKV files, which TV browsers won't open directly.
- **Convert** — re-encodes on the fly, using the Mac's hardware encoder. Only
  needed for unusual codecs. Works everywhere, but the laptop gets warm.

If a file fails, the app automatically retries down this list before showing an
error, so a stubborn file usually fixes itself.

## Why there's no buffering

Nothing is uploaded anywhere. The video travels straight from the laptop's disk
to the TV across your router, which is far faster than any internet connection:

| | Throughput |
| --- | --- |
| What your files need | 3–4 Mbps |
| Direct / Remux can deliver | limited only by disk and wifi |
| Convert can deliver | ~27 Mbps (about 6× faster than needed) |

Seeking inside an MKV works a little differently: because the video is being
repackaged live, jumping restarts the stream at the new position. The app waits
until you stop pressing before it does, so holding the arrow key scrubs
smoothly instead of stuttering.

## Subtitles

Subtitles embedded in your MKV files are pulled out automatically and shown at a
size meant for across-the-room viewing. If a file has them, they're **on by
default**. Cycle or switch them off with the **Subtitles** button.

Only text subtitles work (SRT/ASS, which is what your files use). Image-based
subtitles found on some Blu-ray rips can't be displayed.

## Adding more folders

Edit `config.json`:

```json
{
  "libraries": ["~/Desktop/CP", "~/Downloads", "~/Movies"],
  "minSizeMB": 200,
  "maxDepth": 2,
  "exclude": ["ZeroToMastery*", "Zoom", "node_modules"]
}
```

- **libraries** — folders to look in.
- **minSizeMB** — hides anything smaller, which keeps screen recordings and
  short clips out of the way. The **Show everything** button ignores this
  whenever you want the full list.
- **maxDepth** — how many subfolder levels to search.
- **exclude** — folder names to skip entirely (`*` works as a wildcard).

Press **Rescan** in the app after adding files — no need to restart.

## Working on it

```bash
npm install   # once: TypeScript is the only dependency
npm start     # compile the browser code, then run the server
npm test      # type-check both halves, then run 79 unit tests
npm run watch # recompile the browser code as you edit it
```

Written in TypeScript. Node runs the server straight from `.ts` source with no
build step; only the browser code is compiled, into `public/app/`.

`ARCHITECTURE.md` explains how the code is laid out and why — worth reading
before changing anything in `src/media`, which is the part with real subtlety.

## Notes

- Thumbnails, subtitles and file details are cached in `.cache/`. Safe to
  delete; it just rebuilds.
- The server listens on your local network only. Anyone on your wifi can browse
  these folders, so it's worth stopping it when you're done on a shared network.
- Requires Node 24+ (for running TypeScript directly) and `ffmpeg`
  (`brew install ffmpeg`).
