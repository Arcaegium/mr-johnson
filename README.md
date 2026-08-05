# Mr. Johnson

You are the Johnson. You don't run the shadows — you hire the people who do.

An original cyberpunk roster-management game, Shadowrun-inspired, built
text-first: procedurally generated runners, sites, and contracts; a
day-by-day dispatch loop; and systems that are meant to work in plain
text long before anything gets polished.

**[▶ Play the current build](https://arcaegium.com/mr-johnson/)**
· [dev inspector](https://arcaegium.com/mr-johnson/inspector.html)

No install, no accounts, no backend — it's static files and your
browser's local storage. Saves live on the device you played on.

## Design documents

**Two, and only two.** Both are written for an AI assistant's recall rather than
for a human reader.

| document | what it is |
|---|---|
| [`docs/UNDERSTANDING.md`](docs/UNDERSTANDING.md) | **what the game is, and how we build it.** Read first, every session. Opens with the four pillars of perspective, which decide most questions on their own. |
| [`docs/SYSTEM-STATE.md`](docs/SYSTEM-STATE.md) | **what is in the code right now** — built, placeholder, built-but-unreachable — and what happens next. |

Earlier sessions produced a build plan, a phase plan, a pillar plan and two HTML
artifacts. All of it is folded into these two or deleted. If you go looking for a
third document, it does not exist.

`§NN` in code comments is dead numbering from a retired HTML version of the
design; it does not match the sections in `UNDERSTANDING.md`. Ignore it, and
strip it when you touch the surrounding comment.

Phase 0 (foundation) and Phase 1 (management game) are complete. **Phase 2 —
Text Missions — is the current work.**

## The loop

Watch the runner market and hire on a ladder of commitment (freelance →
retainer → permanent). Take contracts off the board, reading estimated
site security that is only *mostly* true. Queue each day's dispatches —
recon, crafting, resource hunts, Medicae treatment, or the job itself —
in the order you want them resolved, because order matters: a decker who
loops the cameras this morning softens the building for the team that
walks in this afternoon. Get paid once, when the contract's deliverable
is done; your runners earn Karma for everything they actually did.

Sites remember. Hit one too often and its security ratchets up
permanently; leave it alone and it cools back down.

## Some things worth knowing

- **Runners are people, gear is property.** Equipment belongs to the
  operation and gets issued per dispatch. Cyberware is the exception —
  surgery consumes it, spends Essence, and never comes back out.
- **Every site has a key**, like `Finally-Coral-Ivory-Arrow-5413`. The
  name *is* the seed, and its words encode the site's qualities — so the
  same key names the same building in every universe. Call one in from
  the Known Sites panel. Addresses are shareable.
- **The dice are never replayed.** Reloading restores the situation, not
  the outcome: a wipe can be retried, but you can't inch through a fight
  on memorized rolls.

## Running it locally

```bash
python serve.py
```

Then open `http://localhost:8123/`. (Windows: double-click `serve.bat`.)
The server sets `Cache-Control: no-store`, so edits show up on reload
without a cache fight.

`inspector.html` is the developer inspector — per-system benches plus a
mechanical stress suite (~93k assertions covering determinism,
cross-system data flow, state machines, and a randomized multi-day soak).
Run it after any change; it's the regression gate.

## Layout

```
index.html / js/game.js / js/game-ui.js  the playable shell + session layer
inspector.html / js/harness.js           the dev benches
js/models/                               runners, sites, jobs, missions,
                                         market, economy, armory, alert
js/core/                                 rng, clock, save, task resolution
js/stress.js                             the stress suite
```

## Status

Phases 0 and 1 are complete. **Phase 2 (Text Missions) is nearly done** —
all three pillars have distinct scene-text genres: meatspace with turn-based
combat, a Matrix host crawl, and astral projection with wards and a tether.
Remaining: simultaneity (multi-front operations), which is gated on the hub
console rebuild. See `docs/SYSTEM-STATE.md` for exactly what is built.

The text shell is a **placeholder renderer** — a lie detector for the systems.
The destination is a drawn CRT hub console plus three rendered pillar worlds.

Everything in here is original work. The setting is a homage to the
cyberpunk tabletop tradition; names, mechanics, and content are our own.

MIT licensed.
