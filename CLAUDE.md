# Paradiso

A LAN media server with a TV front end. Node runs the server straight from
TypeScript source; only the browser half in `client/` is compiled.

## Before changing anything visual

**Read [DESIGN.md](DESIGN.md) first.** It records which design system this app
follows, the three places it deliberately departs from that system, and the
rules that follow. Styling that skips it will not match what is already here.

The short version: every colour, size and radius comes from
`public/styles/tokens.css` and nowhere else; one blue accent carries everything
interactive; the weight ladder has no 500; there is exactly one shadow in the
app. Check a change by screenshotting it at TV size *and* phone size — the
recipe is at the end of DESIGN.md.

## Before changing anything in `src/media`

Read [ARCHITECTURE.md](ARCHITECTURE.md). That directory holds the container and
codec logic, which is the part with real subtlety — particularly `chooseMode()`
and the reason HEVC is never tagged `hvc1`.

## Checks

```bash
npm test        # type-checks both halves, then runs the suite
npm run build   # compiles the browser code into public/app/
```

## Commits

One-line subject, one concern per commit, written so the history reads like one
person working through the project in order. **No `Co-Authored-By` trailer and
no AI attribution of any kind.**
