/* ============================================================
   Mr. Johnson — icons.js
   ONE SHAPE VOCABULARY, read by every view.

   ── WHY THIS EXISTS ─────────────────────────────────────────
   The route graph picked a room's shape from a HASH of its id:
   circle, diamond, square or hexagon, four shapes chosen by an
   arbitrary number and meaning nothing at all. It looked like a
   floor plan and taught the player nothing, because there was
   nothing to learn — two rooms drawn differently were not
   different in any way.

   With a tactical grid arriving beside the route, that stops
   being merely wasteful and starts being actively misleading:
   the same building would be drawn in two vocabularies, and a
   shape would mean one thing on one view and nothing on the
   other.

   So shapes MEAN something now, and they mean the SAME thing
   wherever they are drawn:

     ROOMS say what the room is FOR. A vault is not a corridor.
     THINGS say what kind of thing they are, at a glance, so a
     grid full of markers reads as a situation rather than as
     confetti.

   ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────
   Colour. Every view already has its own colour language —
   teal for held ground, amber for something standing, dim for
   unseen — and a shape that also carried colour would fight it.
   Callers pass their own fill and stroke; this decides form.
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  // ── Rooms, by what they are for ────────────────────────────────
  // Read off the room's own anchors (site.js's ANCHOR_TYPES), which
  // generation has always rolled and only the objective room has
  // ever carried. A room with no anchor is ordinary ground.
  const ROOM_SHAPE = {
    objective:   "star",      // the thing you came for
    target:      "star",
    safe:        "vault",     // something locked, and worth locking
    terminal:    "terminal",  // a way into the host from in here
    vantage:     "vantage",   // sightlines — a place that watches other places
    spiritNest:  "nest",
    reagentNode: "nest",
    plain:       "room",
  };

  function roomShape(room) {
    if (!room) return "room";
    const a = (room.anchors || [])[0];
    return ROOM_SHAPE[a] || "room";
  }

  // ── Things, by what kind of thing they are ─────────────────────
  // Keyed on the obstacle `type` site.js generates, so adding a
  // template and forgetting the icon degrades to a labelled blank
  // rather than to a wrong picture.
  const THING = {
    // A SENTRY IS NOT A RUNNER. Both are people and both were drawn
    // as `figure`, which left colour doing all the work of telling
    // your crew from theirs — too thin for a tactical grid, where the
    // whole job of the picture is reading a situation at a glance.
    // Same silhouette family, squared off and helmeted.
    guard:      { shape: "sentry",  label: "Guard",      tone: "hostile" },
    camera:     { shape: "eye",     label: "Camera",     tone: "watcher" },
    maglock:    { shape: "lock",    label: "Maglock",    tone: "device"  },
    spirit:     { shape: "flame",   label: "Spirit",     tone: "astral"  },
    ward:       { shape: "barrier", label: "Ward",       tone: "astral"  },
    barrierIce: { shape: "barrier", label: "Barrier ICE", tone: "matrix" },
    patrolIce:  { shape: "eye",     label: "Patrol ICE", tone: "matrix"  },
    blackIce:   { shape: "fang",    label: "Black ICE",  tone: "lethal"  },
  };

  // The player's own bodies are drawn as what they are, not as what
  // they can do — a drone is a drone whatever it is carrying.
  const BODY = {
    runner: { shape: "figure", tone: "crew" },
    drone:  { shape: "rotor",  tone: "crew" },
    spirit: { shape: "flame",  tone: "crew" },
  };

  function thingIcon(o) {
    if (!o) return { shape: "room", label: "?", tone: "device" };
    const t = THING[o.type];
    if (t) return t;
    return { shape: "blank", label: o.label || o.type || "?", tone: "device" };
  }

  function bodyIcon(b) {
    if (!b) return BODY.runner;
    return BODY[b.bodyKind] || BODY.runner;
  }

  // ── The shapes themselves ──────────────────────────────────────
  // Each returns SVG path/element markup centred on (cx, cy) at a
  // given radius, with no fill or stroke of its own — the caller
  // owns colour, because each view already has a colour language and
  // a shape that argued with it would win the wrong argument.
  const DRAW = {
    room: (x, y, r) =>
      `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" rx="1"/>`,
    vault: (x, y, r) =>
      `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" rx="1"/>` +
      `<circle cx="${x}" cy="${y}" r="${r * 0.38}"/>`,
    star: (x, y, r) => {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const rad = (Math.PI / 5) * i - Math.PI / 2;
        const rr = i % 2 ? r * 0.46 : r;
        pts.push((x + Math.cos(rad) * rr).toFixed(1) + "," + (y + Math.sin(rad) * rr).toFixed(1));
      }
      return `<polygon points="${pts.join(" ")}"/>`;
    },
    terminal: (x, y, r) =>
      `<rect x="${x - r}" y="${y - r * 0.78}" width="${2 * r}" height="${r * 1.56}" rx="1"/>` +
      `<line x1="${x - r * 0.5}" y1="${y + r * 1.1}" x2="${x + r * 0.5}" y2="${y + r * 1.1}"/>`,
    vantage: (x, y, r) =>
      `<polygon points="${x},${y - r} ${x + r},${y + r * 0.7} ${x - r},${y + r * 0.7}"/>`,
    nest: (x, y, r) => {
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const rad = (Math.PI / 3) * i - Math.PI / 2;
        pts.push((x + Math.cos(rad) * r).toFixed(1) + "," + (y + Math.sin(rad) * r).toFixed(1));
      }
      return `<polygon points="${pts.join(" ")}"/>`;
    },
    // A person: head and shoulders, the most readable silhouette at
    // eight pixels there is.
    figure: (x, y, r) =>
      `<circle cx="${x}" cy="${y - r * 0.45}" r="${r * 0.4}"/>` +
      `<path d="M ${x - r * 0.62} ${y + r} q ${r * 0.62} ${-r * 1.05} ${r * 1.24} 0 z"/>`,
    // The same body plan as `figure`, squared: a helmet instead of a
    // head, and shoulders that come to a point rather than a curve.
    // Reads as "one of theirs" at eight pixels without relying on the
    // colour to say it.
    sentry: (x, y, r) =>
      `<rect x="${x - r * 0.42}" y="${y - r * 0.95}" width="${r * 0.84}" height="${r * 0.62}" rx="1"/>` +
      `<polygon points="${x - r * 0.72},${y + r} ${x},${y - r * 0.2} ${x + r * 0.72},${y + r}"/>`,
    eye: (x, y, r) =>
      `<path d="M ${x - r} ${y} q ${r} ${-r * 0.95} ${2 * r} 0 q ${-r} ${r * 0.95} ${-2 * r} 0 z"/>` +
      `<circle cx="${x}" cy="${y}" r="${r * 0.3}"/>`,
    lock: (x, y, r) =>
      `<rect x="${x - r * 0.8}" y="${y - r * 0.15}" width="${r * 1.6}" height="${r * 1.1}" rx="1"/>` +
      `<path d="M ${x - r * 0.45} ${y - r * 0.15} v ${-r * 0.45} a ${r * 0.45} ${r * 0.45} 0 0 1 ${r * 0.9} 0 v ${r * 0.45}" fill="none"/>`,
    flame: (x, y, r) =>
      `<path d="M ${x} ${y - r} q ${r * 0.8} ${r * 0.7} ${r * 0.4} ${r * 1.2} q ${-r * 0.4} ${r * 0.5} ${-r * 0.4} ${r * 0.8} q 0 ${-r * 0.3} ${-r * 0.4} ${-r * 0.8} q ${-r * 0.4} ${-r * 0.5} ${r * 0.4} ${-r * 1.2} z"/>`,
    barrier: (x, y, r) =>
      `<path d="M ${x - r} ${y - r} h ${2 * r} v ${2 * r} h ${-2 * r} z" fill="none"/>` +
      `<line x1="${x - r}" y1="${y}" x2="${x + r}" y2="${y}"/>` +
      `<line x1="${x}" y1="${y - r}" x2="${x}" y2="${y + r}"/>`,
    fang: (x, y, r) =>
      `<polygon points="${x - r},${y - r} ${x + r},${y - r} ${x},${y + r}"/>`,
    rotor: (x, y, r) =>
      `<circle cx="${x}" cy="${y}" r="${r * 0.42}"/>` +
      `<line x1="${x - r}" y1="${y - r * 0.72}" x2="${x + r}" y2="${y + r * 0.72}"/>` +
      `<line x1="${x - r}" y1="${y + r * 0.72}" x2="${x + r}" y2="${y - r * 0.72}"/>`,
    blank: (x, y, r) =>
      `<circle cx="${x}" cy="${y}" r="${r * 0.8}" fill="none"/>`,
  };

  function draw(shape, x, y, r) {
    return (DRAW[shape] || DRAW.blank)(x, y, r);
  }

  MJ.icons = {
    roomShape: roomShape,
    thingIcon: thingIcon,
    bodyIcon: bodyIcon,
    draw: draw,
    SHAPES: Object.keys(DRAW),
    THING: THING,
  };
})();
