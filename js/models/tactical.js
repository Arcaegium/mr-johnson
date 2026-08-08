/* ============================================================
   Mr. Johnson — tactical.js
   THE RUN CLOCK: where every body is, and whose turn it is.

   ── WHAT THIS IS NOT ────────────────────────────────────────
   It is NOT the initiative system. That already exists, in
   combat.js: rounds and passes, order by initiativeScore
   (Agility + Intelligence + modifiers), Wired Reflexes buying
   +4 and an extra die. It runs INSIDE a firefight and only for
   the fight's participants, and it is reused here rather than
   replaced — a second ordering rule would be two answers to one
   question.

   ── WHAT WAS MISSING ────────────────────────────────────────
   A clock for the RUN. Outside combat a run is a sequence of
   obstacle beats: `run.index` walks `run.obstacles` and every
   body is abstractly "wherever the crew is". There is no
   per-body position, so none of this could be said:

     the drone is in room 3 working the maglock
     while the mage holds room 1
     and the slumped rigger lies between them

   Movement was something the route did for you between
   obstacles. Here it is something you spend a turn on.

   ── THE SHAPE ───────────────────────────────────────────────
   A ROOM IS A GRID, sized off the room's own `size` word, which
   generation has always rolled and nothing has ever used for
   anything but flavour. Every body and every obstacle stands on
   a square. A turn is MOVE (up to a speed) plus one ACTION.

   ── DETERMINISM ─────────────────────────────────────────────
   Placement consumes NO RNG. It is a pure function of the room
   and of what is standing in it, hashed — because taking draws
   here would shift every roll downstream and hand the same seed
   a different world, which has already been measured happening
   twice in this project. The same site always lays out the same
   way, which a renderer and a save file both need.

   ── THE SEAM THIS SERVES ────────────────────────────────────
   docs/VISUAL-LAYER-SEAM.md 2a/2b/2c. Geometry and facing are
   additive; witnessing-by-position is the one rule that
   changes, and it stays behind MJ.sensesPlane / MJ.wasWitnessed
   so it changes in one place. Nothing here consults an arc yet.
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  // The room's own size word, finally load-bearing. Odd dimensions
  // so there is a true centre to enter from and stand on.
  const ROOM_GRID = {
    small:  { w: 5, h: 5 },
    medium: { w: 7, h: 7 },
    large:  { w: 9, h: 9 },
  };
  const DEFAULT_GRID = ROOM_GRID.medium;

  function roomGrid(room) {
    return ROOM_GRID[(room && room.size) || "medium"] || DEFAULT_GRID;
  }

  // ── Stable hashing, so a layout is a fact about the site ───────
  // Same string, same number, forever. Nothing here touches the
  // run's rng.
  function hash(str) {
    let h = 2166136261;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }

  // A name a body answers to for hashing purposes. Runners have a
  // handle; an obstacle has a label and a tier; anything else gets
  // its own identity stamped when it joins.
  function bodyKey(b) {
    if (!b) return "?";
    if (b.tacticalId) return b.tacticalId;
    if (b.identity && b.identity.handle) return "r:" + b.identity.handle;
    if (b.label) return "o:" + b.label + ":" + (b.tier || 0);
    return "b:" + hash(JSON.stringify(Object.keys(b)));
  }

  // ── Speed: how far a body moves in one turn ────────────────────
  // SR5 walks at Agility x 2 metres and a square is about two
  // metres, so a square per point of Agility. A body with its own
  // declared speed (a drone, a spirit) uses that instead — the
  // point of putting them on this system is that they are not all
  // people.
  function speedFor(body) {
    if (!body) return 1;
    if (typeof body.speed === "number") return Math.max(1, body.speed);
    const agi = (body.attributes && body.attributes.agility) || 1;
    // Chrome that is about legs rather than reflexes moves you
    // further in the same turn — one list of what the implants do,
    // read here and by the fight, never two.
    const chrome = MJ.implantChannel ? MJ.implantChannel(body, "move") : 0;
    return Math.max(1, agi + chrome);
  }

  // ── Turn order ─────────────────────────────────────────────────
  // combat.js's own score, so a runner who is fast in a firefight is
  // fast in a corridor. Ties break on the stable key rather than on
  // array order, or the same site would order differently depending
  // on how the crew list happened to be built.
  // A SITE OBSTACLE IS NOT A CHARACTER. It has a tier, not a sheet —
  // combat.js builds it a stat block only when a fight starts, so
  // asking initiativeScore for its Agility here throws. A thing's
  // tier IS how sharp it is, and reading it that way keeps a T8
  // trooper ahead of a T2 rent-a-cop without inventing a second
  // stat line nobody maintains.
  function initiativeOf(body) {
    if (!body) return 0;
    if (body.attributes) {
      const base = MJ.initiativeScore ? MJ.initiativeScore(body)
        : (body.attributes.agility || 0) + (body.attributes.intelligence || 0);
      // initiativeScore reads a COMBATANT's effects, and a runner
      // walking a corridor is not one — so chrome that buys initiative
      // has to be read off the implants directly, or Wired Reflexes
      // would make you fast in a firefight and ordinary in the hallway
      // outside it.
      return base + (MJ.implantChannel ? MJ.implantChannel(body, "initiative") : 0);
    }
    // Anything unplaceable on that scale goes last, which is right
    // for a maglock: it does not take turns.
    if (!body.fights) return -1;
    return body.tier || 0;
  }

  function turnOrder(bodies) {
    return (bodies || []).slice().sort((a, b) => {
      const d = initiativeOf(b) - initiativeOf(a);
      if (d) return d;
      return hash(bodyKey(a)) - hash(bodyKey(b));
    });
  }

  // ── Placement ──────────────────────────────────────────────────
  // Deterministic, collision-free, and it means something: the crew
  // comes in at the room's edge and what is posted in the room
  // stands away from it. A renderer can draw this and a player can
  // read a threat from where it is standing.
  function squaresOf(grid) {
    const out = [];
    for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) out.push({ x: x, y: y });
    return out;
  }

  // Ring 0 is the room's own edge, rising toward the middle — so
  // "deeper into the room" is a real direction on the grid.
  function ringOf(grid, p) {
    return Math.min(p.x, p.y, grid.w - 1 - p.x, grid.h - 1 - p.y);
  }

  // ── SOME THINGS ARE BOLTED TO WALLS ────────────────────────────
  // A maglock is a DOOR: it is in a wall, and if it is an edge
  // obstacle it is in the wall facing the room it leads to. A camera
  // is screwed to a wall or a ceiling corner and watches the floor
  // from there. Neither of them stands in the middle of a room, and
  // drawing them there made a floor plan read like a chessboard.
  //
  // Everything else — people, spirits, drones — walks on the floor
  // and stands where it likes.
  const WALL_MOUNTED = { maglock: true, camera: true };
  const isWallMounted = (o) => !!(o && WALL_MOUNTED[o.type]);
  const onEdge = (grid, p) => ringOf(grid, p) === 0;

  // Which wall a thing should be on, when it leads somewhere. The
  // route graph draws the walk left-to-right, so a door OUT of this
  // room reads as the right-hand wall and the way IN as the left —
  // which makes the two pictures agree about direction without the
  // grid having to know anything about how the graph is laid out.
  function wallFor(grid, o, roomId) {
    if (!o || !o.where) return null;
    if (o.where.kind === "edge") {
      return o.where.from === roomId ? "right" : "left";
    }
    if (o.where.kind === "entry") return "left";
    return null;
  }

  function onWall(grid, p, wall) {
    if (wall === "right") return p.x === grid.w - 1;
    if (wall === "left") return p.x === 0;
    if (wall === "top") return p.y === 0;
    if (wall === "bottom") return p.y === grid.h - 1;
    return onEdge(grid, p);
  }

  // Deal squares to a set of occupants, farthest-in first or
  // nearest-the-door first, breaking ties on the occupant's own
  // hash so two guards do not both want the same square.
  function dealSquares(grid, occupants, opts) {
    opts = opts || {};
    const all = squaresOf(grid);
    const taken = new Set((opts.taken || []).map((p) => p.x + "," + p.y));
    const out = new Map();
    for (const o of occupants) {
      const seed = hash(bodyKey(o) + "|" + (opts.salt || ""));
      let free = all.filter((p) => !taken.has(p.x + "," + p.y));
      if (!free.length) break;
      // A wall-mounted thing takes a wall square, and the wall its
      // door actually leads through where it has one. Falls back
      // through "any wall" to "anywhere" so a crowded room can never
      // fail to place something.
      if (isWallMounted(o)) {
        const wall = wallFor(grid, o, opts.roomId);
        const wanted = wall && free.filter((p) => onWall(grid, p, wall));
        const anyWall = free.filter((p) => onEdge(grid, p));
        free = (wanted && wanted.length) ? wanted : (anyWall.length ? anyWall : free);
      }
      // Sort by how well the square suits this kind of occupant,
      // then pick a stable one out of the best few so a room does
      // not line everybody up on one tile.
      free.sort((a, b) => {
        const ra = ringOf(grid, a), rb = ringOf(grid, b);
        const da = opts.deep ? -ra : ra, db = opts.deep ? -rb : rb;
        if (da !== db) return da - db;
        return hash(a.x + ":" + a.y) - hash(b.x + ":" + b.y);
      });
      const band = free.slice(0, Math.max(1, Math.min(free.length, 6)));
      const pick = band[seed % band.length];
      taken.add(pick.x + "," + pick.y);
      out.set(o, { x: pick.x, y: pick.y });
    }
    return out;
  }

  // ── The tactical state ─────────────────────────────────────────
  // Hung off the run, built once, and ADDITIVE: the beat loop does
  // not read any of it, so a run that never opens a tactical view
  // behaves exactly as it did before.
  function begin(run) {
    if (!run || run.tactical) return run && run.tactical;
    const state = {
      // body -> { roomId, x, y }
      pos: new Map(),
      // body -> squares of movement left this turn
      moveLeft: new Map(),
      // bodies that have spent their action this turn
      acted: new Set(),
      order: [],
      at: 0,
      round: 1,
    };
    run.tactical = state;
    reseat(run);
    return state;
  }

  // Give everybody in this room a legal square — and NOTHING ELSE.
  //
  // A REPAINT IS NOT A REDEPLOYMENT. The panel calls this on every
  // beat, and the first version re-dealt the whole floor each time.
  // That was invisible while nobody could move: the deal is a pure
  // function of the room, so it kept landing on the same squares. The
  // moment the player could walk somewhere, the next repaint silently
  // marched them back. So: same room, same positions. Only the ones
  // with nowhere legal to stand get dealt a square.
  //
  // A thing already placed stays placed even once it is neutralized —
  // a dropped guard is still lying there, and the view dims it.
  function reseat(run) {
    const t = run.tactical;
    if (!t) return;
    const here = run.obstacles && run.obstacles[run.index];
    const roomId = here && here.rooms && here.rooms.length ? here.rooms[0] : 0;
    const room = roomOf(run, roomId);
    const grid = roomGrid(room);

    // What is standing in this room: the obstacle in front of the
    // crew and anything else that shares its ground.
    const inRoom = (run.obstacles || []).filter((o) =>
      o.rooms && o.rooms.indexOf(roomId) !== -1);
    const present = inRoom.filter((o) =>
      !run.neutralized.has(o) && !(run.groupPassed && run.groupPassed.has(o)));
    const crew = bodiesOf(run);

    const moved = t.roomId !== roomId;
    const keep = new Map();
    if (!moved) {
      for (const [b, p] of t.pos) {
        if (p.roomId !== roomId) continue;
        if (inRoom.indexOf(b) !== -1 || crew.indexOf(b) !== -1) keep.set(b, p);
      }
    }
    const held = [...keep.values()];
    const unplaced = (list) => list.filter((o) => !keep.has(o));

    // Hostiles stand deeper in; the crew comes in from the edge.
    // WALLS FIRST. A door and a camera have only a handful of legal
    // squares between them; letting the floor-standers take the room
    // first could leave a maglock with no wall to be in.
    const wallThings = unplaced(present.filter(isWallMounted));
    const floorThings = unplaced(present.filter((o) => !isWallMounted(o)));
    const walls = dealSquares(grid, wallThings, {
      salt: "wall" + roomId, roomId: roomId, taken: held,
    });
    const foes = dealSquares(grid, floorThings, {
      deep: true, salt: "foe" + roomId, roomId: roomId,
      taken: held.concat([...walls.values()]),
    });
    const mine = dealSquares(grid, unplaced(crew), {
      deep: false, salt: "crew" + roomId, roomId: roomId,
      taken: held.concat([...walls.values()]).concat([...foes.values()]),
    });

    t.pos = new Map();
    for (const [b, p] of keep) t.pos.set(b, p);
    for (const [o, p] of walls) t.pos.set(o, { roomId: roomId, x: p.x, y: p.y });
    for (const [o, p] of foes) t.pos.set(o, { roomId: roomId, x: p.x, y: p.y });
    for (const [b, p] of mine) t.pos.set(b, { roomId: roomId, x: p.x, y: p.y });
    t.roomId = roomId;
    t.grid = grid;
    t.order = turnOrder(crew.concat(present));
    // A new room is a new clock. Standing in the same one, whatever
    // has already been spent stays spent.
    if (moved) {
      t.at = 0;
      t.round = 1;
      t.moveLeft = new Map();
      t.acted = new Set();
    }
    if (t.at >= t.order.length) t.at = 0;
    for (const b of t.order) if (!t.moveLeft.has(b)) t.moveLeft.set(b, speedFor(b));
  }

  function roomOf(run, roomId) {
    const rooms = run.site && run.site.layout && run.site.layout.rooms;
    if (!rooms) return null;
    return rooms.find((r) => r.id === roomId) || null;
  }

  // EVERY BODY THE PLAYER IS RESPONSIBLE FOR. Today that is the
  // crew; when spirits and drones land they join this list and
  // everything downstream — the party column, the turn order, the
  // grid — picks them up without being told.
  function bodiesOf(run) {
    const out = (run.runners || []).filter((r) => !run.downed || !run.downed.has(r));
    for (const b of run.extraBodies || []) {
      if (!run.downed || !run.downed.has(b)) out.push(b);
    }
    return out;
  }

  // ── Reading it ─────────────────────────────────────────────────
  const posOf = (run, body) => (run.tactical && run.tactical.pos.get(body)) || null;
  const whoseTurn = (run) => (run.tactical && run.tactical.order[run.tactical.at]) || null;

  // Chebyshev: diagonals cost the same as orthogonals, which is what
  // a square grid wants unless it is pretending to be hexes.
  function distance(a, b) {
    if (!a || !b) return Infinity;
    if (a.roomId !== b.roomId) return Infinity;
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  }

  // Where this body could get to. Occupied squares are out;
  // everything else inside the room is fair.
  //
  // TWO BUDGETS, ONE PATH. Nothing is counting seconds until the
  // shooting starts, so out of a fight the whole room is walkable and
  // `free` says so; in one, the allowance is what the round left you.
  // Both go through here so "where can I go" and "did the move take"
  // can never disagree — the view marks exactly the squares the model
  // would accept.
  function reachable(run, body, opts) {
    const t = run.tactical;
    if (!t) return [];
    const from = posOf(run, body);
    if (!from) return [];
    const left = (opts && opts.free) ? Infinity : (t.moveLeft.get(body) || 0);
    const taken = new Set();
    for (const [other, p] of t.pos) {
      if (other !== body && p.roomId === from.roomId) taken.add(p.x + "," + p.y);
    }
    const out = [];
    for (const p of squaresOf(t.grid)) {
      if (taken.has(p.x + "," + p.y)) continue;
      const d = Math.max(Math.abs(p.x - from.x), Math.abs(p.y - from.y));
      if (d > 0 && d <= left) out.push({ x: p.x, y: p.y, cost: d });
    }
    return out;
  }

  // Spend movement to get there. Returns what it cost, or 0 if the
  // square was not legally reachable — the caller never has to
  // guess whether the move happened. A free walk costs nothing off
  // the round's allowance, because there is no round yet.
  function moveTo(run, body, x, y, opts) {
    const t = run.tactical;
    if (!t) return 0;
    const ok = reachable(run, body, opts).find((p) => p.x === x && p.y === y);
    if (!ok) return 0;
    const from = posOf(run, body);
    t.pos.set(body, { roomId: from.roomId, x: x, y: y });
    if (!(opts && opts.free)) {
      t.moveLeft.set(body, (t.moveLeft.get(body) || 0) - ok.cost);
    }
    return ok.cost;
  }

  // ── Reach: can this body act on that thing from here ───────────
  // A hand needs to be next to what it touches; a gun and a hack do
  // not. The verb already knows which it is — melee-mode acts and
  // the by-hand manipulations are adjacency, everything else is
  // anywhere in the room. Nothing about arcs yet: this is about
  // whether you can REACH it, not whether it can see you.
  const ADJACENT_ONLY = ["melee"];
  function reachOf(verb) {
    if (!verb) return 1;
    if (verb.pillar === "matrix") return Infinity;      // the grid is not where a hack happens
    const modes = verb.modes || [];
    if (verb.weaponFor || modes.indexOf("melee") !== -1) return 1;
    if (verb.byHand) return 1;
    return Infinity;                                     // same room is enough
  }

  function canReach(run, body, target, verb) {
    const a = posOf(run, body), b = posOf(run, target);
    if (!a || !b) return true;   // unplaced things are not gated by geometry
    const need = reachOf(verb);
    if (need === Infinity) return a.roomId === b.roomId;
    return distance(a, b) <= need;
  }

  // ── The turn ───────────────────────────────────────────────────
  // MOVE UP TO A SPEED PLUS ONE ACTION, in either order. Ending a
  // turn hands the clock to the next body; when the order runs out
  // the round ticks and everybody's movement comes back.
  function spendAction(run, body) {
    const t = run.tactical;
    if (!t) return false;
    if (t.acted.has(body)) return false;
    t.acted.add(body);
    return true;
  }

  function endTurn(run) {
    const t = run.tactical;
    if (!t || !t.order.length) return null;
    t.at += 1;
    if (t.at >= t.order.length) {
      t.at = 0;
      t.round += 1;
      t.acted = new Set();
      for (const b of t.order) t.moveLeft.set(b, speedFor(b));
    }
    return whoseTurn(run);
  }

  MJ.tactical = {
    ROOM_GRID: ROOM_GRID,
    roomGrid: roomGrid,
    begin: begin,
    reseat: reseat,
    bodiesOf: bodiesOf,
    posOf: posOf,
    whoseTurn: whoseTurn,
    turnOrder: turnOrder,
    initiativeOf: initiativeOf,
    speedFor: speedFor,
    distance: distance,
    reachable: reachable,
    moveTo: moveTo,
    reachOf: reachOf,
    canReach: canReach,
    spendAction: spendAction,
    endTurn: endTurn,
    squaresOf: squaresOf,
  };
})();
