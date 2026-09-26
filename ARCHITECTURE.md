# Architecture

Paradiso is a LAN media server with a TV front end, written in TypeScript. Zero runtime
dependencies — Node's standard library on the server, plain ES modules in the
browser, `ffmpeg` for the media work. TypeScript itself is the only dev
dependency.

Node 24 executes `.ts` files directly, so **the server has no build step**; it
runs from source. Only the browser code is compiled, because a TV cannot run
TypeScript. Node strips types without checking them, so `tsc` is the checker
(`npm run typecheck`) rather than the thing that makes the code runnable.

## The one idea worth knowing

A video file is two separate things: a **container** (`.mkv`, `.mp4` — the
wrapper) and the **codecs** inside it (H.264, HEVC, AAC). A TV can be perfectly
able to decode the contents while refusing the box.

Everything in `src/media` follows from that, because it means most files need
their container swapped and nothing else. Three delivery modes, cheapest first:

| Mode | What happens | Cost | Quality |
| --- | --- | --- | --- |
| `direct` | Bytes served straight off disk | None | Untouched |
| `remux` | Streams copied into an MP4 wrapper | Negligible | Untouched |
| `transcode` | Decoded and re-encoded | Real CPU | Slightly degraded |

**Always prefer the mode that touches the video least.** `chooseMode()` in
`src/media/playbackPolicy.ts` is where that judgement lives, and it is pure and
tested precisely because it is the only real decision the server makes.

## Shared — `shared/`

The contract between the two halves, imported by both.

```
contracts.ts          The wire format: LibraryItem, MediaInfo, ProbeResult, ...
playback.ts           The three modes, their labels, and the fallback ladder
```

This is what TypeScript buys that JavaScript could not. A change to what the
server sends is now a compile error in the client, rather than `undefined`
appearing on a TV across the room. The playback ladder in particular used to be
declared twice — once per side — and could silently drift.

`ProbeResult` is a discriminated union of `MediaInfo | ProbeFailure`, so every
caller is forced to handle a corrupt file instead of reading `.duration` off a
failure.

## Server — `src/`

```
main.ts               Composition root: builds every service, wires, listens
config.ts             Reads config.json into resolved absolute paths

catalog/              What exists on disk
  scanner.ts            Walks the configured folders
  titles.ts             Release filename -> readable title   [tested]
  catalog.ts            The library, indexed by id

media/                What to do with a file
  playbackPolicy.ts     Mode choice + ffmpeg arguments       [tested, pure]
  probe.ts              ffprobe -> normalised metadata
  streaming.ts          Byte-range file serving, ffmpeg piping
  byteRange.ts          Range header parsing                 [tested, pure]
  ffmpeg.ts             Process primitives, encoder detection
  posters.ts            One representative frame per title
  subtitles.ts          Embedded SRT -> WebVTT

storage/              What to remember between runs
  jsonStore.ts          A generic JSON file with serialised writes
  metadataCache.ts      Probe results, keyed by size + mtime
  progressStore.ts      Resume positions

http/                 How it is exposed
  server.ts             Request pipeline and error handling
  router.ts             Pattern -> handler                   [tested]
  respond.ts            JSON / static / range responses
  services.ts           The dependency bundle routes receive
  routes/               One file per resource

support/              Logging, network interfaces, formatting
```

### Design notes

**Dependencies point inward, and are injected.** `src/main.ts` is the only file
that knows how the pieces fit. Routes receive a `catalog` and a `describe`
function; they never import a singleton or construct their own collaborators.
That is what makes the policy layer testable without a server, a filesystem, or
ffmpeg.

**Identifiers are hashes, not paths.** A request can only name a file the scan
already found, so path traversal is impossible by construction rather than by
filtering. The static route is separately confined to `public/`.

**ffmpeg output is piped, never buffered.** `pipe()` propagates backpressure, so
ffmpeg produces at the speed the TV consumes instead of racing ahead and holding
a film in memory. Processes are killed on client disconnect — without that,
every seek would leave an orphan transcode running.

## Client — `client/`

Source lives in `client/`; `npm run build` compiles it to `public/app/`, which is
generated and git-ignored.

```
main.ts               Composition root: builds screens, owns the keydown listener

core/
  api.ts                The only module that knows the server's URLs
  store.ts              Library state; views read here, never from each other
  format.ts             Clock and duration formatting             [tested, pure]
  dom.ts                Element helpers

navigation/
  focus.ts              Spatial focus engine
  remote.ts             Key codes -> semantic actions
  routes.ts             Route <-> URL, pure                        [tested]
  history.ts            Drives the History API

views/
  card.ts               One title, shared by the rows and the grid
  header.ts             The bar across the top, outliving every screen
  home.ts               Billboard and rows
  browse.ts             One folder as a grid, for large collections
  detail.ts             Title page and playback options
  player.ts             Playback orchestration

player/
  timeline.ts           The virtual timeline                      [tested]
  subtitles.ts          WebVTT parsing and cue lookup             [tested, pure]
  controls.ts           Control bar rendering
```

### Two client problems worth explaining

**Spatial focus.** A remote sends four directions and nothing else, so focus
cannot follow DOM order — pressing Right must land on whatever is physically to
the right. `focus.ts` resolves every move geometrically against what is on
screen, weighting cross-axis drift so a grid behaves like a grid. The layout can
change without navigation being rewired.

**The virtual timeline.** A remuxed stream is produced live, so it cannot answer
byte ranges and the video element's `currentTime` always starts at zero no
matter where in the film the stream began. The real position is
`offset + currentTime`, and everything the viewer sees — scrubber, remaining
time, subtitles, resume point — reads that virtual value.

Seeking such a stream means restarting ffmpeg at a new offset. Doing that per
key press would spawn a process per tap, so a requested position is held as
pending: shown immediately, committed only once the viewer stops pressing.
`timeline.ts` owns all of it, which is why subtitles are rendered by hand rather
than through a `<track>` element — native cues follow the element's clock, which
is the wrong clock.

**Rows hand off to a grid.** A horizontal row is a browsing device for roughly
twenty items; past that it is a corridor, and reaching the three hundredth item
means three hundred presses with no sense of position. So a row caps itself and
ends with a card that opens `browse.ts`, which lays the same folder out as a
wrapping grid with a range rail for crossing it in two presses. The focus engine
needed no changes for this — resolving moves geometrically means a grid already
behaved like a grid.

**Screens never import each other.** Navigation flows through callbacks wired in
`client/main.ts`, so there is one place describing how the app moves and no cycles.

**Routing did not add a stack; it named the one already there.** The screens
were always layered — player over detail over grid over home — so each layer
became a URL. Two rules keep it from tangling:

- Screens report what the viewer did. They never open each other and never
  decide what Back means.
- `applyRoute()` is the only function that opens or closes anything, and it
  never navigates. Everything else — a click, the remote's Back key, the
  browser's Back button, a pasted link — arrives there by the same path, which
  is why they cannot disagree.

Going back is real `history.back()` rather than a bespoke unwind, so the browser
button and the remote key are the same code. `routes.ts` is pure and tested;
`history.ts` is the only part that touches `window`. That split is not tidiness:
the test project has no DOM lib, so a URL parser that reached for `window` could
not be tested at all.

A server-side fallback serves `index.html` for anything that is not an asset or
an API path, so those URLs survive a reload. It refuses to shadow `/api`,
`/stream`, `/poster` and `/subs`, since a missing stream should stay a 404 and
not become a page that loads and then cannot explain itself.

## Testing

```bash
npm test        # type-check both projects, then run the suite
npm run build   # compile the browser code
npm start       # build, then run the server from TypeScript source
```

79 tests, using Node's built-in runner — which executes `.ts` directly, so the
tests need no build either. `npm test` type-checks first, because Node strips
types without verifying them. They cover the pure, load-bearing logic:
mode selection and ffmpeg argument construction, range parsing, title cleanup,
VTT parsing, the virtual timeline, routing, and formatting.

What is *not* unit-tested is the part that needs a real file and a real browser —
ffmpeg actually producing a playable stream. That is verified by running the
server against the library and probing the output with `ffprobe`.

One test deserves singling out: `never forces the hvc1 tag on HEVC`. Forcing
that tag corrupts the `hvcC` box on rips that keep parameter sets in-band, which
makes them unplayable everywhere. It cost a debugging session to find, so it has
a regression guard.

## The container image

Two stages, for one reason: the browser half must be compiled, and nothing that
compiles it is needed afterwards. The build stage installs npm dependencies and
runs `tsc`; the runtime stage copies only `public/app/` out of it.

Because the project has no runtime dependencies and Node runs the server from
`.ts` directly, **the runtime stage contains no `node_modules` at all** — Node,
ffmpeg, and the source. That is most of why the image is ~270 MB rather than the
usual Node application size.

Two things the container cannot do, both worth knowing before debugging it:

- **No hardware encoder.** `detectH264Encoder()` finds no VideoToolbox inside
  Linux and returns `libx264`, so `transcode` is software-encoded. `direct` and
  `remux` are untouched, which is the overwhelming majority of files.
- **No idea of its own address.** `lanAddresses()` reports the container's
  network, which no TV can route to, so the banner refuses to guess and
  `PARADISO_ANNOUNCE_HOST` supplies the real one instead.

`PARADISO_CONFIG` and `PARADISO_CACHE` exist only so both can be mounted, which
keeps the image read-only in practice — everything written at runtime goes to
`/cache`.

## Type-checking strictness

`strict`, plus `noUncheckedIndexedAccess`, `noImplicitReturns`, `noUnusedLocals`
and `verbatimModuleSyntax`. `erasableSyntaxOnly` is on as well, which forbids
anything Node cannot strip — no enums, no parameter properties — so the source
stays directly runnable.

The two configs differ in one important way: the server has `types: ["node"]`
and no DOM lib, the client has the DOM lib and no Node types. A stray `process`
in browser code, or a stray `document` on the server, is a compile error.

## Browser support

The front end compiles to ES2022 modules (Chromium 61+ for modules, 94+ for the
target). Verified on a Samsung UA50AU7700 (Tizen 6.0). Lower `target` in
`tsconfig.client.json` for older sets.
