/* ============================================================
   Mr. Johnson - models/mission-routes.js
   THE GROUND A RUN WALKS, in three pillars.

   Split out of mission.js. Pure shape: give it a site and it hands
   back {path, obstacles} - it rolls nothing, resolves nothing, and
   never touches a runner. That is what makes it separable at all,
   and it is why the three routes can sit together without becoming
   one route with flags.

     routeObstacles  MEATSPACE. The shortest entry->objective path,
                     WALKED. Physical and astral obstacles interleave
                     in the order the ground presents them, because
                     both projections cover the same rooms.
     hostRoute       THE MATRIX. Its own graph, its own topology -
                     never the room graph reskinned.
     astralRoute     THE ASTRAL. Ignores the room graph entirely;
                     walls mean nothing out here and only a ward is
                     a wall.

   ALL THREE SHARE ONE SHAPE ({path, obstacles}) so anything that can
   draw a run can draw any of them - and WALK ORDER IS THE CONTRACT
   with every renderer. A list can print obstacles in any order and
   still read; a map cannot. The crew occupies one room at a time and
   has to get to the next one, so the sequence IS the movement.
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  // ── Route + recon obstacle selection ────────────────────────────
  // The shortest entry->objective path, WALKED: the crew comes in
  // through the entry point, clears the room it lands in, crosses to
  // the next room, and so on to the objective. Physical and astral
  // obstacles interleave in the order the ground presents them,
  // because both projections cover the same route.
  //
  // Walk order is the contract with every renderer. A list can print
  // obstacles in any order and still read; a map cannot — the crew
  // occupies one room at a time and has to get to the next one. So
  // the sequence IS the movement, and `leg` is how far along it the
  // crew has come.
  // `forcedPath` — the player chose their way in. Without one the
  // shortest route stands in, which is what the auto-resolver and
  // every probe want; the popup's approach step passes the choice.
  function routeObstacles(site, forcedPath) {
    const paths = MJ.findPaths(site);
    if (paths.length === 0) return { path: [], obstacles: [] };
    const path = forcedPath || paths.reduce((a, b) => (a.length <= b.length ? a : b));
    const roomById = {};
    for (const room of site.layout.rooms) roomById[room.id] = room;
    // Edges are undirected; index both ways so a step can find its
    // door whichever end the walk approaches from.
    const edgeBetween = {};
    for (const edge of site.layout.edges) {
      edgeBetween[edge.from + "->" + edge.to] = edge;
      edgeBetween[edge.to + "->" + edge.from] = edge;
    }
    const obstacles = [];
    // Each obstacle carries WHERE it is, because witnessing is about
    // what else can see you from the same ground (§07), and WHEN the
    // crew reaches it, because a renderer has to move them there.
    // Both derive straight from the layout, so stamping the shared
    // instance is idempotent — the same obstacle is always in the
    // same place, at the same point in the same walk.
    const at = (rooms, leg, where, list) => {
      for (const o of list) {
        o.rooms = rooms; o.leg = leg; o.where = where;
        obstacles.push(o);
      }
    };
    const entry = site.layout.entryPoints.find((e) => e.roomId === path[0]);
    if (entry) at([entry.roomId], 0, { kind: "entry", type: entry.type, roomId: entry.roomId }, entry.physicalObstacles);

    // A patrol or a spirit zone covers a BEAT of rooms rather than
    // sitting in one, so the crew meets it at the FIRST room of its
    // circuit they set foot in — and it can witness them anywhere
    // along that circuit, which is why `rooms` stays the whole beat.
    const firstLegOn = (ids) => {
      for (let i = 0; i < path.length; i++) {
        if ((ids || []).includes(path[i])) return i;
      }
      return -1;
    };
    const mobile = [];
    for (const patrol of site.layout.patrols || []) {
      const leg = firstLegOn(patrol.roomIds);
      if (leg >= 0) mobile.push({ leg, rooms: patrol.roomIds, kind: "patrol", list: patrol.physicalObstacles });
    }
    for (const zone of site.layout.spiritZones || []) {
      const leg = firstLegOn(zone.roomIds);
      if (leg >= 0) mobile.push({ leg, rooms: zone.roomIds, kind: "zone", list: zone.astralObstacles });
    }

    for (let leg = 0; leg < path.length; leg++) {
      const room = roomById[path[leg]];
      if (!room) continue;
      const here = { kind: "room", roomId: room.id, label: room.label, size: room.size };
      // What is posted in this room, then what is passing through it.
      for (const slot of room.postSlots) at([room.id], leg, here, slot.physicalObstacles);
      at([room.id], leg, here, room.astralObstacles);
      for (const m of mobile) {
        if (m.leg !== leg) continue;
        at(m.rooms, leg, { kind: m.kind, roomIds: m.rooms, roomId: room.id }, m.list);
      }
      // Then the door out, which belongs to the crossing rather than
      // to either room — met on the way out of this one.
      const next = path[leg + 1];
      if (next === undefined) continue;
      const edge = edgeBetween[room.id + "->" + next];
      if (edge) at([room.id, next], leg, { kind: "edge", from: room.id, to: next }, edge.physicalObstacles);
    }
    return { path: path, obstacles: obstacles };
  }

  // ── The host crawl ─────────────────────────────────────────────
  // A Matrix run is not the building. Walls mean nothing; what
  // constrains a decker is the system's own topology, so this walks
  // the host graph rather than the room graph — the third pillar
  // finally having its own space to be a pillar of.
  //
  // §05's Route layer is the trade this implements: the long way
  // passes more nodes, which means more ice AND more datastores, so
  // greed and exposure are the same decision. The short way skips
  // both. `wantData` is what a data-hungry run picks.
  function hostPaths(host) {
    const out = [];
    const walk = (at, seen) => {
      if (at === host.objectiveNode) { out.push(seen.concat([at])); return; }
      if (seen.length > 12) return;
      for (const e of host.edges) {
        if (e.from !== at || seen.indexOf(e.to) !== -1) continue;
        walk(e.to, seen.concat([at]));
      }
    };
    walk(host.entryNode, []);
    return out;
  }

  function hostRoute(site, opts) {
    opts = opts || {};
    const host = site.host;
    if (!host) return { path: [], obstacles: [], dataNodes: [] };
    const paths = hostPaths(host);
    if (!paths.length) return { path: [], obstacles: [], dataNodes: [] };

    // Greedy route wants datastores; a quiet run wants the fewest
    // nodes it can get away with. Same graph, opposite priorities.
    const score = (p) => {
      const dataCount = p.filter((id) => host.nodes[id].holdsData).length;
      return opts.wantData ? (dataCount * 10 - p.length) : -p.length;
    };
    const path = paths.reduce((a, b) => (score(a) >= score(b) ? a : b));

    const obstacles = [];
    const dataNodes = [];
    for (const id of path) {
      const node = host.nodes[id];
      if (node.holdsData) dataNodes.push(node);
      for (const ice of node.ice) {
        // Co-location inside the host, so witnessing works exactly
        // as it does in meatspace: two pieces of ice on one node see
        // each other's business.
        ice.rooms = ["node" + id];
        ice.hostNode = id;
        obstacles.push(ice);
      }
    }
    return { path: path, obstacles: obstacles, dataNodes: dataNodes, host: host };
  }

  // ── The astral run ─────────────────────────────────────────────
  // The inverse of a break-in. §08: "movement is free, vision is
  // constrained" — an astral form passes through walls, so the whole
  // room graph the meatspace crew has to solve is simply irrelevant.
  // A corridor of guards is nothing to a projecting mage.
  //
  // Two things constrain them instead, and they are the level design:
  //   1. WARDS. "The one wall that works both ways." A ward seals an
  //      area; nothing else stops astral movement at all.
  //   2. WHAT LIVES THERE. Spirits, in their zones.
  //
  // Which yields the pillar's nastiest situation for free, straight
  // from §08: "a ward between you and your body blocks the way home."
  // Every ward crossed on the way in has to be crossed again on the
  // way out — going in is only half the budget, and a mage who
  // spends everything reaching the objective is stranded inside it.
  function astralRoute(site) {
    const objective = site.layout.rooms[0]; // room 0 is always the objective
    const inbound = [];
    for (const ward of objective.astralObstacles || []) {
      ward.rooms = ["astral-objective"];
      inbound.push(ward);
    }
    for (const zone of site.layout.spiritZones || []) {
      if ((zone.roomIds || []).indexOf(objective.id) === -1) continue;
      for (const spirit of zone.astralObstacles || []) {
        spirit.rooms = ["astral-objective"];
        inbound.push(spirit);
      }
    }
    // The way home. Only WARDS gate the exit — a spirit you slipped
    // past is not standing between you and your body, but a wall of
    // light is.
    const outbound = inbound
      .filter((o) => o.type === "ward")
      .map((ward) => Object.assign({}, ward, {
        label: ward.label + " (the way back)",
        // Its own copy of everything a run WRITES to. The way back is
        // a second crossing of the same wall: the immunities are the
        // same facts about the same weave, but damage done on the way
        // in is not damage done on the way out, and per-obstacle
        // memory is keyed by object so these must be two objects.
        immune: Object.assign({}, ward.immune),
        rooms: ["astral-objective"],
        isExitWard: true,
      }));
    return { inbound: inbound, outbound: outbound, obstacles: inbound.concat(outbound) };
  }

  MJ.routeObstacles = routeObstacles;
  MJ.hostPaths = hostPaths;
  MJ.hostRoute = hostRoute;
  MJ.astralRoute = astralRoute;
})();
