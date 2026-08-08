# THE VISUAL LAYER SEAM

**Written 2026-08-07.** The end state is a top-down 16-bit game with mixed
real-time/turn-based play: the player walks runners around and between rooms,
uses movement and spells to stay out of opponents' visual arcs, and falls back
on stealth when they end up inside one.

This document exists so that layer can be *plugged in* rather than retrofitted.
It records what already supports it, what does not, and — the important part —
**which functions are the seams**, so nobody has to go looking.

Nothing here is a build order. It is the map for when one is given.

---

## 0. THE RULE THIS DOCUMENT PROTECTS

> The model does not know a renderer exists, and the renderer does not
> reimplement a rule.

Verified as of writing: `grep -rl "document\.|innerHTML" js/models js/core`
returns **nothing**. Every rule lives in DOM-free code; `game-ui.js`,
`mission-popup.js`, `grimoire.js` and `character-creation.js` are leaves over
it. A second renderer is a second leaf, not a fork.

---

## 1. WHAT IS ALREADY THERE

**Rooms are real places, not labels.** `site.layout.rooms` carries `id`,
`label`, `size` (small/medium/large), `coverFlags` (low/high/open) and
`anchors`. `site.layout.edges` is the adjacency graph. `entryPoints` carry a
`type` — door, window, roof, vent, loading dock — which is already a distinct
visual and a distinct tactical opening.

**The chain is geometric already.** Rooms run `room[N-1] → … → room[0]`, and
room 0 is the Objective Room. So **the room id IS the depth**, and
`depthOf(roomId, roomCount)` in `site.js` turns it into 0..1. Obstacle
difficulty already slides along it (`distributeObstacles`), which means a
rendered floor plan will *look* like what it is: the hard ones stand near the
prize.

**Every obstacle knows where it is and when you meet it.** `routeObstacles`
stamps `o.rooms`, `o.leg`, `o.where` onto each one, with the comment
*"because a renderer has to move them there."* `where` is already
discriminated: `{kind: "entry"|"room"|"edge"|"patrol"|"zone", …}`.

**Patrols and zones already cover a BEAT of rooms**, not a point —
`patrol.roomIds`, `zone.roomIds`. That is a movement path waiting for a clock.

**Witnessing is already co-located and per-plane.** `o.senses` is which worlds
a thing can perceive an act in. A guard sees meat; a spirit is dual-natured; a
maglock sees nothing anywhere.

**Order within a room is already the player's.** `missionRoomPeers` /
`missionFaceFirst` — take the camera before the guard. That is the text-mode
statement of a movement decision, and it means the *decision* already exists
for a visual layer to express differently.

---

## 2. WHAT IS NOT THERE, AND WHAT IT COSTS

### 2a. Geometry — **additive, cheap**
Rooms have a size word, not a shape, and nothing has an x/y. A renderer needs
coordinates for rooms, for doors, and for things standing in them.

*Why it is cheap:* rooms are already entities with stable ids and an adjacency
graph. Coordinates hang off them. Nothing that reads a room today asks where it
is, so nothing breaks by answering.

### 2b. Facing — **additive, cheap**
`senses` says which PLANES a thing perceives, never which DIRECTION it looks.
A camera watches "the room" as a binary.

*Why it is cheap:* `o.facing` sits beside `o.senses` on the instance. Generation
already stamps per-instance properties (`senses`, `presence`, `immune`).

### 2c. Witnessing by position — **THE SEAM. One function.**
Today: *"is it on the same ground, and does it sense this plane?"*
Then: *"is the actor inside its arc?"*

This is the only rule that genuinely changes, and it is deliberately kept in
one place:

| function | file | what it decides |
|---|---|---|
| `MJ.sensesPlane(o, plane)` | `mission-witness.js` | can this thing perceive an act at all |
| `MJ.wasWitnessed(run, obstacle, act, …)` | `mission-witness.js` | did anything see THIS act |
| `MJ.castNoticedBy(…)` | `mission-witness.js` | the wider question a cast asks |

**Every caller goes through these.** Four inline `senses.indexOf(plane)` checks
were consolidated into `sensesPlane` on 2026-08-07 for exactly this reason —
`sneakGroupFor`, `spawnResponders` re-engagement, and the popup's watcher line.
If a fifth appears, the arc will be wrong in one place and right everywhere
else, which is the worst possible failure. **Do not inline this check.**

### 2d. A clock inside the beat — **the real work**
`run.index` steps one obstacle at a time. Real-time movement needs a tick
underneath that, with position updating between decisions.

*This is the one that is not additive*, and it should be planned before it is
started. The encouraging part: the beat loop is already driven through a tiny
interface — `beginMission` / `missionPrompt` / `missionChoose` /
`missionDone` — and the popup and the auto-resolver are two independent drivers
of it *today*. A tick loop is a third driver, not a rewrite of the rules it
drives.

### 2e. Stances — flagged previously as the seam a visual layer rewrites.
Unchanged; see `SYSTEM-STATE.md`.

---

## 3. THINGS THAT WOULD BREAK THE PLAN

Written down so they can be refused:

1. **Any rule reading the DOM.** The moment a model file asks a widget
   anything, there is no second renderer.
2. **Any inline `senses` / co-location check** (see 2c).
3. **Room identity that is not `room.id`.** Positions, labels and contents may
   all change; the id is what a renderer, a save file and the route graph all
   agree on.
4. **Assuming one obstacle per decision.** Group contests already resolve
   several at once, and re-engagement already moves one across the index. A
   renderer that assumes 1:1 will desync the first time a room has three guards
   in it.

---

## 4. WHAT WOULD BE BUILT FIRST, WHEN ASKED

In dependency order, smallest useful step first:

1. Coordinates on rooms and doors — floor plan renders, nothing else changes.
2. Positions for obstacles inside rooms — things stand somewhere.
3. `o.facing` + an arc shape, **rendered only**, still not consulted by any
   rule. The arcs are visible and lie about nothing because they decide nothing.
4. Flip `sensesPlane`/`wasWitnessed` to consult the arc. **This is the moment
   the game changes**, and it is one function pair.
5. The tick loop underneath the beat.

Steps 1–3 are free to land at any time and cost nothing if the rest never
happens.
