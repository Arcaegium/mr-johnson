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

The canonical design lives in three living documents. **Read them before
extending anything** — working from a remembered version of the design is how
a placeholder gets mistaken for the target.

| document | in this repo | living artifact |
|---|---|---|
| **Design bible** — what the game is; cited throughout the code as §NN | [`docs/current-understanding.html`](docs/current-understanding.html) | [artifact](https://claude.ai/code/artifact/43d59edd-4438-4069-af3b-f9262adacff8) |
| **Build plan** — phases, the fidelity ladder, the deferred backlog | [`docs/build-plan.html`](docs/build-plan.html) · [markdown](docs/BUILD-PLAN.md) | [artifact](https://claude.ai/code/artifact/225900e6-99bc-408a-9ea7-0533d727140d) |
| **Phase 2 work plan** — the current phase, in dependency order | [`docs/PHASE-2-PLAN.md`](docs/PHASE-2-PLAN.md) | [artifact](https://claude.ai/code/artifact/ae02034e-d2a1-4496-9828-fc84d275eba3) |

The artifacts are the editable originals; the repo copies are the durable
mirror, so nothing is lost if a link goes stale. **When you change one, update
the other** — a stale mirror is worse than no mirror.

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
mechanical stress suite (~73k assertions covering determinism,
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

Phase 1 (the management game) is complete and playable end to end.
Next up: the tactical pillar systems — the Matrix as a card game,
meatspace runs, and the astral layer — which zoom into missions the
management layer currently quick-resolves.

Everything in here is original work. The setting is a homage to the
cyberpunk tabletop tradition; names, mechanics, and content are our own.

MIT licensed.
