# Design decisions

Paradiso's interface follows one design system, adapted for a television. This
file records what was decided and why, so that styling added later matches
styling already here.

**Source system:** `~/Desktop/deisgn-system-md/DESIGN-apple.md`

Read that file for the full specification — palette, type ramp, component
grammar. This file only covers what is *specific to Paradiso*: the places the
source had to be adapted, the reasons, and the rules that follow from it.

> Everything lives in `public/styles/`. `tokens.css` is the only file allowed to
> contain a raw colour or size. If you are reaching for a hex value in any other
> file, the answer is a token — or a decision that belongs in this document.

---

## The three standing deviations

These are the only places Paradiso knowingly departs from the source. Each one
is forced by the medium. Do not "fix" them back.

### 1. Dark surfaces, not light

Apple's web canvas is white and parchment. Paradiso is a cinema, watched in a
dark room, and a white screen at fifty inches is punishing. The interface is
built from the source's own dark product tiles instead:

| Token | Value | Source name | Used for |
| --- | --- | --- | --- |
| `--canvas` | `#252527` | surface-tile-3 | The page itself |
| `--tile` | `#272729` | surface-tile-1 | The primary dark tile |
| `--tile-2` | `#2a2a2c` | surface-tile-2 | A step up, for raised chrome |
| `--black` | `#000000` | surface-black | True void: the video frame only |

This also serves the system's central idea better than the light mode would.
The idea is *UI recedes so the product can speak*; here the product is the film
artwork, and it can only be the brightest thing on screen if nothing else is.

### 2. The type ramp is scaled, not redrawn

The source sets body copy at 17px, for a screen two feet away. A television is
ten feet away. Every size in `tokens.css` is therefore Apple's own value
multiplied by `--scale`:

```css
--text-body: calc(17px * var(--scale));
```

This preserves the ramp's proportions exactly and moves the whole thing with one
variable. Tracking is expressed in `em` rather than the source's `px` so it stays
correct at every scale.

| Screen | `--scale` | Body lands at |
| --- | --- | --- |
| Television, large monitor | 1.3 | 22px |
| Laptop (≤1366px) | 1.15 | 20px |
| Phone and tablet (≤860px) | 1 | 17px — literally Apple's |

**When adding a size, never write a px value.** Use an existing `--text-*`
token, or add one as `calc(<Apple's px> * var(--scale))`.

### 3. The focus ring is Sky Link Blue, not Focus Blue

The source specifies a `#0071e3` focus ring. Ringing a `#0066cc` button with
`#0071e3` on a dark canvas is very nearly invisible — the two blues differ by
almost nothing — which hides the single most important control on a screen
driven by a remote.

The ring therefore uses `--primary-on-dark` (`#2997ff`), by the same rule the
source already applies to links on dark tiles. The token is
`--focus-ring-color`, and it is deliberately *not* the same as the selected-chip
border (`--primary-focus`), so that a chip which is both selected and focused
still reads as two distinct states.

---

## Hover is not a state here

The source document says never to design a hover state, and this app does not
have one — but not because pointers never appear. Samsung's television browser
steers an on-screen cursor with the d-pad, so a pointer is exactly what many
viewers have.

The resolution is that **a pointer moves focus** rather than lighting a second
style. Hovering a card sets the same ring the remote sets, so there is only ever
one highlight on screen and pressing OK always opens the thing that is lit.
Pointer-driven focus never scrolls, since moving the page under a cursor slides
the target away from where the hand is pointing.

So the rule stands as written — no `:hover` rules that mean anything on their
own — while the behaviour it was protecting survives on hardware the source
document never had to consider.

## One accent, and no second one

`--primary` `#0066cc` fills. `--primary-on-dark` `#2997ff` is its dark-surface
sibling for anything that would otherwise sink into the tile — links, progress,
the focus ring. That is the entire interactive palette.

**There is no red in this app.** An earlier version reserved red for progress;
the source permits exactly one accent, so the scrubber, the resume line and the
loading spinner are all blue now. Nothing else on screen is coloured at all.

---

## Grammar

Two button shapes, and nothing between them:

| Grammar | Radius | Token | For |
| --- | --- | --- | --- |
| Pill | `--r-pill` | `.btn`, `.btn.primary` | Things you *do* — Play, Back |
| Compact rect | `--r-sm` | `.btn.small`, `.chip`, `.pbtn`, `.badge`, `.tag` | Things you *set*, and labels |
| Utility card | `--r-lg` | `.thumb`, `.player-error`, `.seek-toast` | Artwork and panels |

`--r-pill` also fully rounds the scrubber and resume bars, where it means "round
this 4px line off" rather than "this is an action". `--r-md` is defined because
the source has it, but nothing in Paradiso uses it — a new component almost
certainly wants one of the three above instead.

- `.btn` is a **ghost pill** — transparent, blue border, blue label.
- `.btn.primary` is the **one loud thing** — Action Blue fill, white label.
- Selected chips take a **2px `--primary-focus` border**, never a fill change,
  so selection and focus stay legible at the same time.
- Every button presses with `transform: var(--press)` — `scale(0.95)`.

### Weight ladder

`300 / 400 / 600 / 700`. **500 is deliberately absent** — a mid-weight reading
always resolves to 600. Headlines are 600, never 700 or 800.

### The one shadow

`--shadow-product` exists for artwork resting on a surface, and it is applied in
exactly one place: a focused card's thumbnail. Never on buttons, panels, chips
or text. Elevation everywhere else comes from a surface-colour change or a
backdrop blur.

### Gradients

The source has none, and neither does this app **except** where text sits over
an unknown film still. The billboard and detail scrims, and the control-bar
scrim, are legibility, not decoration — which is also why no headline in the app
carries a `text-shadow`. Darken the canvas behind the text; do not outline the
text.

The scrims hardcode `rgba(37, 37, 39, …)` because that is `--canvas` with alpha,
and a Tizen 6.0 browser has neither `color-mix()` nor relative colour syntax.

---

## Rules learned the hard way

Both of these were caught by looking at a screenshot, not by reading the CSS.

1. **Blue-on-blue is invisible.** Any ring, border or label placed on a
   `--primary` fill must come from a *lighter* step — `--primary-on-dark` or
   white. Check it at a glance, not by contrast maths alone.
2. **A focused card grows into its neighbours.** Cards scale 1.07 on focus and
   carry a ring, so the row gutter must stay at `--space-lg` (24px) — which is
   also the source's specified grid gutter. A tighter gap overlaps.

---

## Before committing a style change

- [ ] No raw hex outside `tokens.css`, comments aside:
      `grep -nE "#[0-9a-fA-F]{3,6}" public/styles/*.css | grep -v tokens.css`
- [ ] No `font-weight: 500` anywhere
- [ ] Every `var(--…)` resolves to something defined in `tokens.css`
- [ ] Looked at it on a TV-sized viewport *and* a phone one

Verify by eye, because CSS review does not catch contrast or collision:

```bash
node src/main.ts &                       # or ./start.sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --hide-scrollbars --window-size=1920,1080 \
  --virtual-time-budget=9000 --screenshot=/tmp/home.png http://localhost:8080/
```

Change `--window-size` to `414,896` for the phone layout. Screens that need
interaction to reach — the detail sheet, the player — need Chrome driven over
`--remote-debugging-port`; clicking `.card` and then the Play button in
`#sheetActions` gets you to both.

---

## Using a different system later

The systems in `~/Desktop/deisgn-system-md/` are interchangeable in principle:
the app reads every colour, size and radius from `tokens.css`, so swapping is
mostly a matter of rewriting that one file and re-checking the component
grammars in `base.css`.

What would *not* survive a swap is this document's three deviations. Any system
adopted here has to answer the same three questions: does it have a dark mode,
does its ramp scale to ten feet, and is its focus state visible on its own
primary button?
