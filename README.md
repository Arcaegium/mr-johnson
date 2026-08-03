# Mr. Johnson

You are the Johnson. You don't run the shadows — you hire the people who do.

An original cyberpunk roster-management game, Shadowrun-inspired, built
text-first: procedurally generated runners, sites, and contracts; a
day-by-day dispatch loop; and systems that are meant to work in plain
text long before anything gets polished.

**[▶ Play the current build](https://arcaegium.github.io/mr-johnson/game.html)**
· [dev inspector](https://arcaegium.github.io/mr-johnson/index.html)

No install, no accounts, no backend — it's static files and your
browser's local storage. Saves live on the device you played on.

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

Then open `http://localhost:8123/game.html`. (Windows: double-click
`serve.bat`.) The server sets `Cache-Control: no-store`, so edits show up
on reload without a cache fight.

`index.html` is the developer inspector — per-system benches plus a
mechanical stress suite (~73k assertions covering determinism,
cross-system data flow, state machines, and a randomized multi-day soak).
Run it after any change; it's the regression gate.

## Layout

```
game.html / js/game.js / js/game-ui.js   the playable shell + session layer
js/models/                               runners, sites, jobs, missions,
                                         market, economy, armory, alert
js/core/                                 rng, clock, save, task resolution
js/stress.js                             the stress suite
```

## Status

Phase 1 (the management game) is complete and playable end to end.
Next up: the tactical pillar systems — the Matrix as a card game,
meatspace runs, and the astral layer — which zoom into missions the
management layer currently quick-resolves.

Everything in here is original work. The setting is a homage to the
cyberpunk tabletop tradition; names, mechanics, and content are our own.

MIT licensed.
