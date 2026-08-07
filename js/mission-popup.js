/* ============================================================
   Mr. Johnson — mission-popup.js
   The interactive resolve: one obstacle at a time, in the
   player's hands.

   Two layers, deliberately separate:

     1. MJ.decide — a generic decision prompt. A modal, some
        context lines, a list of options, a transcript, and a
        row of side actions. It knows nothing about missions.
        Crafting a program and designing a spell are the same
        shape of question ("here are your variables, here is
        what each costs you"), so that dialog gets built on
        this, not next to it.

     2. MJ.missionPopup — drives MJ.beginMission/missionPrompt/
        missionChoose through that component. It is the exact
        stepper the auto-chooser uses; the only difference is
        who picks. That is the point: quick resolve and played
        resolve cannot drift apart, because they are one path.

   WHAT THE PLAYER IS SHOWN, and what they are not:
   the dice pool, yes — that is their own crew, they know what
   they brought. The threshold and the odds, no. Security is
   not confirmed until it is experienced (§09), and the same
   rule binds obstacles: an approach that cannot possibly work
   here looks exactly like one that can until somebody tries
   it. Finding out IS the attempt, and the attempt is what it
   costs.

   Colors carry word type so a wall of text stays readable:
   names white, numbers teal, success green, failure red.
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  // The console's shared vocabulary — see js/ui-text.js.
  const esc = MJ.text.esc, nm = MJ.text.nm, num = MJ.text.num;
  // Two more that only a transcript needs: the verdict words.
  const ok = (s) => '<span class="w-ok">' + esc(s) + "</span>";
  const no = (s) => '<span class="w-no">' + esc(s) + "</span>";

  // ── Layer 1: the generic decision prompt ────────────────────────
  let host = null;
  let current = null;

  function ensureHost() {
    if (host) return host;
    host = document.createElement("div");
    host.className = "modal-scrim";
    host.style.display = "none";
    document.body.appendChild(host);
    host.addEventListener("click", (e) => {
      const el = e.target.closest("[data-pick],[data-side],[data-body]");
      if (!el || !current) return;
      if (el.dataset.body !== undefined) {
        // Selecting a body re-asks the question from THEIR side.
        current.onSelectBody && current.onSelectBody(+el.dataset.body);
      } else if (el.dataset.pick !== undefined) {
        const i = +el.dataset.pick;
        if (el.classList.contains("dead")) return;
        current.onChoose && current.onChoose(current.options[i], i);
      } else {
        current.onAction && current.onAction(el.dataset.side);
      }
    });
    return host;
  }

  // spec: { title, subtitle, context[], heading, options[],
  //         transcript[], actions[{id,label,tone}], onChoose, onAction }
  // option: { html, meta, dead, tone }
  function open(spec) {
    current = spec;
    ensureHost().style.display = "flex";
    paint();
  }

  function update(patch) {
    if (!current) return;
    Object.assign(current, patch);
    paint();
  }

  function close() {
    current = null;
    if (!host) return;
    host.style.display = "none";
    host.innerHTML = ""; // leave nothing behind to be queried or clicked
  }

  function paint() {
    const s = current;
    if (!s) return;
    const opts = (s.options || []).map((o, i) =>
      // An approach the crew cannot take is disabled in the DOM as
      // well as dimmed in the CSS, so a keyboard and a screen reader
      // are told the same thing the eye is. The handler still guards
      // it — the two agree rather than one covering for the other.
      `<button class="opt${o.dead ? " dead" : ""}${o.tone ? " " + o.tone : ""}"${o.dead ? " disabled" : ""} data-pick="${i}">` +
      `<span class="opt-main">${o.html}</span>` +
      (o.meta ? `<span class="opt-meta">${o.meta}</span>` : "") +
      "</button>").join("");
    const acts = (s.actions || []).map((a) =>
      `<button class="sm${a.tone ? " " + a.tone : ""}" data-side="${esc(a.id)}">${esc(a.label)}</button>`).join(" ");
    // ── COLUMNS, AND THREE TENSES ──────────────────────────────────
    // Across: the mission (what is going on), the crew (who is here),
    // the choice (what they do about it). A long fight's log used to
    // squeeze the options into a sliver at the bottom of one stacked
    // panel — the one part of the screen the player has to act on.
    //
    // DOWN the mission column, the run is laid out in tenses, because
    // that is how the information actually divides:
    //   site      the standing facts — whose building, how hard
    //   FUTURE    the route ahead, drawn: where they are going
    //   PRESENT   the thing in front of them and what is known of it
    //   PAST      the transcript
    // The log is bounded so it can never eat the other two again; it
    // is the tense you can always scroll back into, and the only one
    // that never changes.
    const side = s.side !== false && (opts || s.heading);
    host.innerHTML =
      '<div class="modal-shell">' +
      '<div class="modal" role="dialog" aria-modal="true">' +
        '<div class="modal-head">' +
          `<div class="modal-title">${s.title || ""}</div>` +
          (s.subtitle ? `<div class="modal-sub">${s.subtitle}</div>` : "") +
        "</div>" +
        (s.site ? `<div class="modal-site">${s.site}</div>` : "") +
        (s.future ? `<div class="modal-future">${s.future}</div>` : "") +
        (s.present ? `<div class="modal-present">${s.present}</div>` : "") +
        (s.result ? `<div class="modal-result">${s.result}</div>` : "") +
        // ALWAYS RENDERED, empty or not. Dropping the pane when the
        // log was empty left the whole bottom half of the column as
        // dead space on the first beat of every run, and then made
        // the layout jump the moment the first line landed.
        (s.transcript
          ? '<div class="modal-past"><div class="pane-k">the run so far</div>' +
            '<div class="modal-transcript">' +
            (s.transcript.length ? s.transcript.join("<br>")
              : '<span class="dimmed">nothing yet — this is where the night gets written down</span>') +
            "</div></div>" : "") +
        // With no choice column, the way out belongs at the foot of
        // the column that IS on screen.
        (!side && acts ? `<div class="modal-actions">${acts}</div>` : "") +
      "</div>" +
      (s.party ? `<aside class="modal-party">${s.party}</aside>` : "") +
      (side
        ? '<div class="modal-side">' +
          (s.heading ? `<div class="modal-heading">${s.heading}</div>` : "") +
          (opts ? `<div class="modal-options">${opts}</div>` : "") +
          (acts ? `<div class="modal-actions">${acts}</div>` : "") +
          "</div>"
        : "") +
      "</div>";
    const t = host.querySelector(".modal-transcript");
    if (t) t.scrollTop = t.scrollHeight;
  }

  MJ.decide = { open: open, update: update, close: close, isOpen: () => !!current };
  MJ.fmt = { esc: esc, nm: nm, num: num, ok: ok, no: no };

  // ── Layer 2: the mission, played ────────────────────────────────
  // Mirrors game.js's readNote — said only when something moved.
  function readNote(read) {
    if (!read) return "";
    if (read.changed) return " — " + no("suspicion raised to " + read.band);
    if (read.band === "threatening") return ""; // nothing left to raise
    if (read.awkward) return ' — <span class="w-warn">noted</span><span class="dimmed"> (' +
      read.awkward + " odd moment" + (read.awkward === 1 ? "" : "s") + " here today)</span>";
    return "";
  }

  // ── The exchange, blow by blow ──────────────────────────────────
  // Every gate, on the page. A fight the player cannot watch is one
  // they have to take on trust, and "did that resolve or did it flip
  // a coin" deserves an answer you can read off the screen. So each
  // line says which gate decided it: the roll, then Power vs Armour,
  // then what got through and onto which track.
  function combatLog(log) {
    if (!log || !log.length) return "";
    const rows = log.map((e) => {
      const at = '<span class="dimmed">r' + e.round + "p" + e.pass + "</span> ";
      if (e.event === "hold") return at + nm(e.actor) + '<span class="dimmed"> holds (' + esc(e.stance || "") + ")</span>";
      if (e.event === "dry") return at + nm(e.actor) + " " + no("out of ammo") + '<span class="dimmed"> (' + esc(e.weapon) + ")</span>";
      // A cast is its own kind of line: the spell, the Force behind
      // it, the Drain it cost, and what landed — with "straight
      // through armour" said out loud when direct, because that is
      // the entire reason the mage did it.
      if (e.event === "spell") {
        return at + nm(e.actor) + '<span class="dimmed"> casts </span>' + nm(e.spell) +
          '<span class="dimmed"> (Force ' + e.force + ') → </span>' + nm(e.target) +
          " — " + (e.casterDown ? no("DRAIN DROPS THE CASTER") : esc(e.result || "cast")) +
          (e.drainTaken ? '<span class="dimmed"> · drain ' + e.drainTaken + "</span>" : "");
      }
      if (e.event !== "attack") return "";
      const head = at + nm(e.actor) + '<span class="dimmed"> → </span>' + nm(e.target) +
        '<span class="dimmed"> · ' + esc(e.weapon) + " " + esc(e.mode) + "</span> " +
        num(e.atkHits) + '<span class="dimmed"> vs </span>' + num(e.defHits);
      if (e.result === "miss") return head + " — " + no("miss");
      const pen = '<span class="dimmed"> · Power </span>' + num(e.power) +
        '<span class="dimmed"> vs Armour </span>' + num(e.armour);
      if (e.result === "no penetration") return head + pen + " — " + no("BOUNCED");
      const dmg = '<span class="dimmed"> · DV </span>' + num(e.dv) +
        '<span class="dimmed"> − soak </span>' + num(e.soaked) +
        '<span class="dimmed"> = </span>' + (e.damage > 0 ? no(e.damage) : '<span class="dimmed">0</span>') +
        (e.stun ? '<span class="dimmed"> stun</span>' : '<span class="dimmed"> phys</span>');
      return head + pen + dmg + (e.downed ? " " + no("DOWN") : "");
    }).filter(Boolean);
    return '<div class="fightlog">' + rows.join("<br>") + "</div>";
  }

  function describeTask(t) {
    // A utility cast: the spell, the Force, what it bought, and what
    // the Drain cost — the mage's whole transaction on one line.
    if (t.cast) {
      return nm(t.runner) + '<span class="dimmed"> casts </span>' + nm(t.verb) +
        (t.prep ? '<span class="dimmed"> before going in</span>' : "") +
        '<span class="dimmed"> at Force </span>' + num(t.force) +
        " (" + num(t.pool + "d") + '<span class="dimmed"> → </span>' + num(t.hits) + " hits) — " +
        (t.success ? ok(esc(t.result)) : no(esc(t.result))) +
        (t.drain && t.drain.damage > 0
          ? '<span class="dimmed"> · drain ' + t.drain.damage + (t.drain.physical ? " PHYSICAL" : "") + "</span>" : "") +
        readNote(t.read) +
        (t.responders && t.responders.length
          ? "<br>&nbsp;&nbsp;" + no("RESPONSE: " + t.responders.join(", ") + " — they are coming") : "");
    }
    if (!t.runner) return '<span class="dimmed">' + esc(t.obstacle) + " " + num("T" + t.tier) + " — " + esc(t.result) + "</span>";
    if (t.rejected) return nm(t.runner) + " tried " + esc(t.skill) + " on " + nm(t.obstacle) + " — " + no(t.rejected);
    if (t.combat) {
      const head = (t.surprise ? no("AMBUSH") : no("FIREFIGHT")) + " — " +
        nm(t.enemies.join(", ")) + " — " + num(t.rounds) +
        '<span class="dimmed"> round' + (t.rounds === 1 ? "" : "s") + "</span>: " +
        (t.success ? ok("crew held the ground")
          : t.futile ? no("broke off — nothing they carry gets through its armour")
          : t.stalemate ? no("broke off — could not finish them")
          : no("THE CREW WENT DOWN")) + readNote(t.read);
      const fallen = (t.casualties || []).map((c) => "<br>&nbsp;&nbsp;" + nm(c.runner) +
        (c.died ? " " + no("was KILLED")
          : " went down — carried out with " + num(c.wounds) + " box" + (c.wounds === 1 ? "" : "es") +
            (c.stabilized ? ' <span class="w-ok">— stabilized by ' + esc(c.by) + "</span>" : ""))).join("");
      return head + combatLog(t.log) + fallen +
        (t.responders && t.responders.length
          ? "<br>" + "&nbsp;&nbsp;" + no("RESPONSE: " + t.responders.join(", ") + " — they are coming") : "");
    }
    if (t.extended) {
      const outcome = t.abandoned ? no("backed off")
        : t.success ? ok("through")
        : t.glitch ? no("FUMBLED IT") : no("ran dry");
      return nm(t.runner) + " worked " + nm(t.obstacle) + " " + num("T" + t.tier) +
        " (" + esc(t.skill) + ") — " + num(t.hits) + '<span class="dimmed">/</span>' + num(t.threshold) +
        " over " + num(t.intervals) + '<span class="dimmed"> interval' + (t.intervals === 1 ? "" : "s") + "</span>: " + outcome +
        (t.criticalGlitch ? " " + no("CRITICAL GLITCH") : "") + readNote(t.read) +
        (t.responders && t.responders.length
          ? "<br>" + "&nbsp;&nbsp;" + no("RESPONSE: " + t.responders.join(", ") + " — they are coming") : "");
    }
    // Force against something that cannot fight back. The line has to
    // say WHICH GATE stopped it, because that is the whole decision:
    // a miss is bad luck and worth another swing, a bounce is a fact
    // about the wall and never will be.
    if (t.force) {
      const outcome = t.success ? ok("through it")
        : !t.penetrated ? no("BOUNCED") + '<span class="dimmed"> — Power ' + t.power +
            " against Armour " + t.armour + ", and it always will</span>"
        : '<span class="w-warn">hurt it</span><span class="dimmed"> — ' +
            t.damageTotal + " of " + t.structure + "</span>";
      return nm(t.runner) + " put " + esc(t.weapon) + " into " + nm(t.obstacle) + " " +
        num("T" + t.tier) + " — " + outcome + readNote(t.read) +
        (t.responders && t.responders.length
          ? "<br>" + "&nbsp;&nbsp;" + no("RESPONSE: " + t.responders.join(", ") + " — they are coming") : "");
    }
    const bits = esc(t.skill) + " " + num(t.pool + "d") + (t.loud ? ", " + no("LOUD") : "") + (t.boosted ? ", +" + num(t.boosted) : "");
    // HITS AGAINST THE BAR THEY WERE CLEARING. The threshold was
    // always on the task and never printed, so a failed roll said
    // "2 hits: MISSED" and the player could not tell a near miss from
    // a hopeless one — no way to judge whether trying again was worth
    // the noise. The extended test has always shown "3/3"; a simple
    // one hiding it was the odd case out.
    //
    // Showing it AFTERWARDS keeps the rule intact: the bar is not on
    // the menu before the click, and the attempt is what buys it. That
    // is the same thing the crew learns by doing it once.
    const shortBy = t.threshold === undefined ? ""
      : '<span class="dimmed">/</span>' + num(t.threshold);
    // A group label already names each member with its tier —
    // appending the primary's tier again would print "…T2 T3".
    return nm(t.runner) + " (" + bits + ") vs " + nm(t.obstacle) +
      (t.groupSize > 1 ? '<span class="dimmed"> — together</span>' : " " + num("T" + t.tier)) + " — " +
      num(t.hits) + shortBy + " hits: " + (t.success ? ok("through") : no("MISSED")) +
      (t.criticalGlitch ? " " + no("CRITICAL GLITCH") + (t.guarded ? ' <span class="dimmed">(absorbed by ' + esc(t.guarded) + ")</span>" : "") :
        t.glitch ? " " + no("glitch") : "") +
      // Why the read moved, on the line that moved it. After the
      // fact, so it is information the attempt bought.
      readNote(t.read) +
      (t.responders && t.responders.length
        ? "<br>" + "&nbsp;&nbsp;" + no("RESPONSE: " + t.responders.join(", ") + " — they are coming") : "");
  }

  // Everything the crew can see about where they are standing.
  // The crew's position on the route, from the `where`/`leg` stamps
  // routeObstacles walks onto every obstacle. Reads for all three
  // pillars: rooms in a building, nodes in a host, the astral's
  // there-and-back.
  // A crossing already names both rooms, so it says its own
  // position; the rest get the "n of m rooms in" tail appended.
  const WHERE_TEXT = {
    entry: (w) => ({ body: "coming in by the " + esc(w.type || "entry") }),
    room: (w) => ({ body: "in " + esc(w.label || ("Room " + w.roomId)) + (w.size ? " (" + esc(w.size) + ")" : "") }),
    edge: (w) => ({ body: "crossing from Room " + num(w.from) + " into Room " + num(w.to), located: true }),
    patrol: (w) => ({ body: "a patrol crosses here — its circuit covers " + num((w.roomIds || []).length) + " rooms" }),
    zone: (w) => ({ body: "inside a spirit's haunt — " + num((w.roomIds || []).length) + " rooms of it" }),
  };

  function whereLine(run) {
    const obstacle = run.obstacles && run.obstacles[run.index];
    const w = obstacle && obstacle.where;
    const route = run.streetRoute;
    if (!w || !route || !route.path.length) return null;
    const shape = WHERE_TEXT[w.kind] ? WHERE_TEXT[w.kind](w) : null;
    if (!shape) return null;
    if (shape.located) return '<span class="dimmed">' + shape.body + "</span>";
    return '<span class="dimmed">' + shape.body + " · room </span>" +
      num((obstacle.leg || 0) + 1) +
      '<span class="dimmed"> of </span>' + num(route.path.length) +
      '<span class="dimmed"> on the way in</span>';
  }

  // ── The party column ───────────────────────────────────────────
  // WHO IS STANDING THERE, on every screen of the run. There was
  // nowhere in the popup that said what the crew's own numbers were
  // — a player choosing who to armour, who to send at a lock, or
  // whether to press on had to remember a sheet they could not see.
  // The modal has room on both sides; one of them is now the crew.
  //
  // What each row carries is what a decision during a run turns on:
  // both damage tracks, armour, the gun in their hand, and what they
  // are holding up (a sustained spell is −2 on everything else, so
  // it belongs where the player is choosing).
  function partyPanel(run, selectedIndex) {
    // BODIES, not runners: today that is the crew, and when drones
    // and spirits land (Phase D) they join this same list — each row
    // takes 1/N of the stripe by flex, so the panel resizes itself
    // to however many the player is responsible for.
    const bodies = run.runners || [];
    if (!bodies.length) return "";
    const sustaining = run.sustaining || [];
    // NO NUMBERS ON THE TRACKS — the ticks are the truth and their
    // colour is the urgency: teal while it is fine, gold when it is
    // a concern, red when it is trouble. The exact figures ride on
    // the hover for anyone who wants arithmetic.
    const bar = (val, max, label) => {
      const frac = val / Math.max(1, max);
      const tone = frac >= 0.67 ? "u2" : frac >= 0.34 ? "u1" : "u0";
      const filled = Math.round(frac * max);
      return `<div class="pp-line" title="${label} ${val} of ${max}">` +
        `<span class="pp-k">${label}</span>` +
        `<span class="pp-bar ${tone}">` +
        Array.from({ length: Math.max(1, max) }, (_, i) =>
          `<i class="${i < filled ? "on" : ""}"></i>`).join("") + "</span></div>";
    };
    // The crew as the FIGHT sees them — gear on, held spells applied.
    // Armor is a spell whose entire job is a number going up, so the
    // number the panel prints is the one the armour gate will use.
    // Reading the gear rating here meant a mage could cast Armor, watch
    // the sheet not move, and have no way to tell it had worked.
    const asFought = MJ.crewCombatants ? MJ.crewCombatants(run) : [];
    const rows = bodies.map((r, i) => {
      const down = run.downed && run.downed.has(r);
      const loadout = MJ.combatLoadoutFor(r);
      const gun = MJ.weaponProfile(loadout.weaponId);
      const c = asFought.find((x) => x.source === r);
      const armour = c && MJ.effectiveArmour ? MJ.effectiveArmour(c) : loadout.armour;
      const lifted = armour - loadout.armour;
      const held = sustaining.filter((x) => x.caster === r)
        .map((x) => (MJ.spellDef(x.spell) || {}).label || x.spell);
      const on = sustaining.filter((x) => x.target === r && x.caster !== r)
        .map((x) => (MJ.spellDef(x.spell) || {}).label || x.spell);
      // Name and hardware share the horizontal axis; the two tracks
      // stack under them — mixed axes so a row compresses without
      // getting cryptic. The row is the SELECTOR: clicking a body
      // re-asks the room's question from their side.
      return `<div class="pp-row${down ? " pp-down" : ""}` +
        `${i === selectedIndex ? " pp-sel" : ""}"` +
        `${down ? "" : ` data-body="${i}"`}>` +
        `<div class="pp-top"><span class="pp-name">${esc(r.identity.handle)}</span>` +
        (down ? '<span class="w-no">DOWN</span>'
          : `<span class="pp-hw" title="${esc(gun.label || "bare hands")}${gun.power ? " — Power " + gun.power + ", DV " + gun.dv : ""}">` +
            `<span class="pp-arm${lifted > 0 ? " lifted" : ""}"` +
            ` title="armour ${armour}${lifted > 0 ? ` — ${loadout.armour} worn +${lifted} held` : " worn"}">` +
            `🛡${armour}</span>` +
            (gun.power ? ' <span class="dimmed">·</span> P' + gun.power : "") + "</span>") +
        "</div>" +
        bar(r.wounds || 0, MJ.physicalTrack(r), "P") +
        bar(r.stun || 0, MJ.stunTrack(r), "S") +
        (held.length ? `<div class="pp-held" title="sustaining costs −2 on everything else">✦ ${esc(held.join(", "))}<span class="dimmed"> −2</span></div>` : "") +
        (on.length ? `<div class="pp-held pp-on">✦ ${esc(on.join(", "))}</div>` : "") +
        "</div>";
    }).join("");
    return `<div class="pp-head">the crew</div><div class="pp-rows">${rows}</div>`;
  }

  // ── The shape of the run ───────────────────────────────────────
  // An abstract top-down: one geometric shape per room on the walk,
  // connected in sequence but deliberately NOT on a straight line —
  // the crew is moving through a building, not filling a progress
  // bar. This is the fidelity rung the route model was built waiting
  // for: mission-routes' own contract says walk order IS the movement.
  //
  // EARNED KNOWLEDGE ONLY. The shape of the route is free — the crew
  // cased the building — but what is IN a room renders only once
  // they have stood in it. Unreached rooms are dim outlines with a
  // "?", the red dot is the crew, the gold dot is where the job is.
  function roomHash(id) {
    let h = 0; const s = String(id);
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  // `opts.path` — draw THIS route instead of the run's current one:
  // the approach screen draws every candidate side by side, red dot
  // at each door, so "the roof is 4 rooms, the window is 2" is seen
  // rather than read. `opts.mini` shrinks it to fit an option row.
  function routeGraph(run, opts) {
    opts = opts || {};
    const route = opts.path ? { path: opts.path } : run.streetRoute;
    if (!route || !route.path || route.path.length < 2) return "";
    const path = route.path;
    const outside = opts.outside || !!opts.path;
    const mini = !!opts.mini;
    const S = mini
      ? { stepX: 46, cap: 380, h: 58, y: 32, r: 6, wob: 5, wobm: 5, font: 8, dot: 3.5, lift: 11, tick: 2.5 }
      : { stepX: 84, cap: 660, h: 112, y: 60, r: 12, wob: 9, wobm: 11, font: 12, dot: 5, lift: 21, tick: 4 };

    // The frontier: the furthest leg anyone has stood on. Outside,
    // only the entry room shows its contents — the prep screen is
    // already naming what waits there, so the graph agrees with it.
    let frontier = 0;
    if (!outside) {
      const upto = Math.min(run.index, run.obstacles.length - 1);
      for (let i = 0; i <= upto; i++) {
        const o = run.obstacles[i];
        if (o && o.leg !== undefined && o.leg > frontier) frontier = o.leg;
      }
      if (MJ.missionDone(run) && !run.failed) frontier = path.length - 1;
    }
    const knows = (i) => outside ? i === 0 : i <= frontier;

    const W = Math.min(S.cap, 44 + (path.length - 1) * S.stepX), H = S.h;
    const stepX = (W - 56) / (path.length - 1);
    const pos = path.map((rid, i) => ({
      x: 28 + i * stepX,
      // A stable per-room wobble, so the walk bends like a floor plan
      // and the same site always draws the same way.
      y: S.y + ((roomHash(rid) % 2 ? -1 : 1) * (S.wob + (roomHash(rid) % S.wobm))),
    }));

    const bits = [];
    // Doors between rooms: walked ground in teal, ground ahead dim.
    for (let i = 0; i < path.length - 1; i++) {
      const walked = !outside && i < frontier;
      bits.push(`<line x1="${pos[i].x}" y1="${pos[i].y}" x2="${pos[i + 1].x}" y2="${pos[i + 1].y}"` +
        ` stroke="${walked ? "var(--accent-2)" : "var(--line)"}" stroke-width="${walked ? 2.4 : 1.6}"/>`);
    }
    // Rooms. Shape varies by the room's own hash — a building, not a
    // bar chart — and the outline says what the crew knows: teal for
    // ground they hold, amber where something still stands, dim for
    // rooms nobody has seen into. A mini graph (the approach picker)
    // draws SHAPE only: nothing about contents is known from the
    // pavement, and the picker must not pretend otherwise.
    const r = S.r, r2 = Math.round(r * 0.5);
    for (let i = 0; i < path.length; i++) {
      const p = pos[i], rid = path[i], h = roomHash(rid);
      const here = mini ? [] : run.obstacles.filter((o) =>
        o.rooms && o.rooms.indexOf(rid) !== -1 && o.leg !== undefined && o.leg <= (outside ? 0 : frontier));
      const up = here.filter((o) => !run.neutralized.has(o)).length;
      const stroke = mini || !knows(i) ? "var(--line)" : up > 0 ? "var(--accent)" : "var(--accent-2)";
      const shape = h % 4;
      if (shape === 0) bits.push(`<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="var(--panel)" stroke="${stroke}" stroke-width="1.8"/>`);
      else if (shape === 1) bits.push(`<polygon points="${p.x},${p.y - r - 1} ${p.x + r + 1},${p.y} ${p.x},${p.y + r + 1} ${p.x - r - 1},${p.y}" fill="var(--panel)" stroke="${stroke}" stroke-width="1.8"/>`);
      else if (shape === 2) bits.push(`<rect x="${p.x - r + 1}" y="${p.y - r + 1}" width="${2 * r - 2}" height="${2 * r - 2}" fill="var(--panel)" stroke="${stroke}" stroke-width="1.8"/>`);
      else bits.push(`<polygon points="${p.x - r},${p.y} ${p.x - r2},${p.y - r} ${p.x + r2},${p.y - r} ${p.x + r},${p.y} ${p.x + r2},${p.y + r} ${p.x - r2},${p.y + r}" fill="var(--panel)" stroke="${stroke}" stroke-width="1.8"/>`);
      if (!mini && !knows(i)) {
        bits.push(`<text x="${p.x}" y="${p.y + S.font / 2 - 1}" text-anchor="middle" font-size="${S.font}" fill="var(--dim)">?</text>`);
      } else if (!mini) {
        // What the crew has seen in this room: an amber tick per
        // thing still standing, a dim tick per thing dealt with.
        const marks = here.slice(0, 4), t = S.tick, gap = t + 3;
        marks.forEach((o, k) => {
          const mx = p.x - ((marks.length - 1) * gap) / 2 + k * gap;
          bits.push(`<rect x="${mx - t / 2}" y="${p.y + r + 6}" width="${t}" height="${t}"` +
            ` fill="${run.neutralized.has(o) ? "var(--dim)" : "var(--accent)"}"/>`);
        });
      }
    }
    // The gold dot: where the job is. Skipped once the crew stands on
    // it — the red dot has arrived and saying both would stutter.
    const last = pos[path.length - 1];
    const atGoal = !outside && frontier === path.length - 1;
    if (!atGoal) bits.push(`<circle cx="${last.x}" cy="${last.y - S.lift}" r="${S.dot}" fill="#d2b356"><title>the job is here</title></circle>`);
    // The red dot: the crew — on the pavement before entry, in their
    // furthest room once inside.
    const at = outside ? { x: pos[0].x - S.lift, y: pos[0].y } : pos[frontier];
    bits.push(`<circle cx="${at.x}" cy="${outside ? at.y : at.y - S.lift}" r="${S.dot}" fill="#e05858"><title>the crew is here</title></circle>`);

    const legend = mini ? "" :
      `<div class="rg-legend"><span style="color:#e05858">●</span> crew · ` +
      `<span style="color:#d2b356">●</span> objective · ` +
      `<span style="color:var(--accent)">▪</span> standing · ` +
      `<span style="color:var(--dim)">▪</span> handled · ? unseen</div>`;
    return `<div class="routegraph${mini ? " rg-mini" : ""}"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${bits.join("")}</svg>` + legend + `</div>`;
  }

  // ── The value chip ─────────────────────────────────────────────
  // A label and a number, stacked, in a small box. The console is a
  // lot of small facts, and a wall of "key: value · key: value" prose
  // reads as one long sentence nobody parses — chips let a dozen
  // numbers sit on two lines and still be found by eye in one jump.
  // Same component everywhere a value is shown, so the security read,
  // the obstacle and the clocks all look like the same instrument.
  function chip(k, v, tone) {
    return `<div class="vchip${tone ? " " + tone : ""}">` +
      `<span class="vk">${esc(k)}</span><span class="vv">${v}</span></div>`;
  }
  const chips = (list) => '<div class="vrow">' + list.filter(Boolean).join("") + "</div>";

  // ── The site: the standing facts ───────────────────────────────
  // Whose building this is and how hard it is — true all night, and
  // therefore not part of any tense. Observers used to live in here
  // and do not any more: what can see you RIGHT NOW is a fact about
  // the room the crew is standing in, not about the address.
  function siteStrip(run) {
    const id = run.site ? run.site.identity : null;
    const out = [];
    if (id) {
      out.push('<div class="site-name">' + nm(id.name || ("site #" + id.universeIndex)) +
        ' <span class="dimmed">· ' + esc(id.owningFaction) + " · " + esc(id.district) +
        (id.theme ? " · " + esc(id.theme) : "") + "</span></div>");
    }
    const cells = [];
    if (run.site && run.state) {
      // ONLY THE PLANES THIS RUN WALKS. An astral projection has no
      // opinion about the corridor's cameras and no way to learn one,
      // so reciting a Matrix rating at it is quoting a number the
      // crew can neither use nor confirm — the same fault the
      // dispatch header had.
      for (const a of MJ.missionPlanes(run) || ["physical", "astral", "matrix"]) {
        const p = MJ.axisProven(run, a);
        const est = run.site.estimatedSecurity ? run.site.estimatedSecurity[a] : null;
        // TWO STATES ONLY: a guess, or a fact. `~4d` while it is still
        // an estimate, `4d✓` once the crew has earned it. Nothing about
        // "how much more looking" belongs on screen — the math decides
        // WHEN the tick appears; it is not something to narrate.
        // WHAT THE PLACE FIELDS — site.security, the same number the
        // obstacles on this route were minted from. Reading
        // state.axes[a].current here quoted the site's staffing level
        // at a crew who were about to meet its hardware.
        if (p && p.proven) {
          cells.push(chip(a, ok(MJ.diceForSecurity(run.site.security[a]) + "d✓"), "v-sure"));
        } else {
          // Contact corrects the guess upward as it happens: meet a
          // tier-5 on a place pencilled at ~3 and it reads ~5, because
          // you have MET a five.
          const shown = Math.max(est === null ? 0 : est, (p && p.maxTier) || 0);
          cells.push(chip(a, '<span class="dimmed">~</span>' +
            (shown ? num(MJ.diceForSecurity(shown) + "d") : '<span class="dimmed">?</span>')));
        }
      }
    }
    if (cells.length) out.push(chips(cells));
    const alert = alertBox(run);
    if (alert) out.push('<div class="site-alert">' + alert + "</div>");
    return out.join("");
  }

  // ── THE FUTURE: the ground ahead ───────────────────────────────
  // The walk, drawn — earned knowledge only. This is the tense that
  // says where this is going, and it is deliberately the only place
  // that speaks about rooms nobody has stood in yet.
  function futurePanel(run, opts) {
    const graph = routeGraph(run, opts);
    return graph ? '<div class="pane-k">the way in</div>' + graph : "";
  }

  // ── THE PRESENT: what is in front of the crew ──────────────────
  // The third tense, and the one that was missing. The log said what
  // had happened and the graph said what was coming, and the thing
  // the player was actually deciding about had one line naming it.
  //
  // Everything here is about THIS ROOM, THIS BEAT: the obstacle and
  // what is known of it, what else can see the crew from the same
  // ground, and the clocks running against them. Observers moved in
  // here out of the site read for exactly that reason — what can see
  // you is a fact about where you are standing, not about the
  // address.
  //
  // KNOWLEDGE IS MARKED, NEVER ASSUMED. What looking tells you is
  // plain; what an attempt bought is marked as learned; armour reads
  // `~3` until something has actually bounced off it and then `3✓`.
  function presentPanel(run, prompt, opts) {
    const outside = opts && opts.outside;
    const out = ['<div class="pane-k">' + (outside ? "on the pavement" : "the room") + "</div>"];
    const ob = prompt && prompt.obstacle;
    const k = ob && MJ.obstacleKnowledge ? MJ.obstacleKnowledge(run, ob) : null;

    if (k) {
      out.push('<div class="ob-name">' + nm(k.label) + " " + num("T" + k.tier) +
        (k.projection ? ' <span class="dimmed">(' + esc(k.projection) + ")</span>" : "") + "</div>");
      // The gate that decides whether the guns in the room matter at
      // all, and what it can do back. Both readable by looking, except
      // armour — an estimate until it has been tested.
      out.push(chips([
        chip("armour", k.armour.sure ? ok(k.armour.value + "✓")
          : '<span class="dimmed">~</span>' + num(k.armour.value)),
        k.fights
          ? chip("armed", '<span class="w-warn">' + esc((MJ.weaponProfile(k.weapon) || {}).label || k.weapon || "yes") + "</span>", "v-warn")
          : chip("armed", '<span class="dimmed">no</span>'),
        chip("watches", k.senses.length
          ? '<span class="w-warn">' + k.senses.map(esc).join(", ") + "</span>"
          : '<span class="dimmed">nothing</span>'),
        k.bypassable ? chip("ground", '<span class="dimmed">can be gone around</span>') : null,
        k.repairs ? chip("closes", '<span class="dimmed">behind you</span>') : null,
        k.tries ? chip("tried", num(k.tries)) : null,
      ]));
      // Bought with attempts, one at a time — the only thing on this
      // panel the crew could not simply see.
      if (k.learned.length) {
        out.push('<div class="ob-learned"><span class="dk">learned:</span> ' +
          k.learned.map((l) => '<span class="w-no">' + esc(l.skill) + "</span>" +
            '<span class="dimmed"> — ' + esc(l.reason) + "</span>").join("<br>") + "</div>");
      }
    }
    // What detection magic already bought about the ground ahead —
    // paid for in Drain, so it belongs on the screen every beat.
    if (prompt && prompt.revealed) {
      out.push(Object.keys(prompt.revealed).map((key) =>
        '<div class="ob-revealed">✦ ' + esc(prompt.revealed[key]) + "</div>").join(""));
    }
    // Everything else on this ground that has eyes, and the patrol
    // whose circuit runs through it.
    const watchers = watcherLine(run, opts);
    if (watchers) out.push('<div class="ob-eyes">' + watchers + "</div>");
    const here = whereLine(run);
    if (here) out.push('<div class="ob-where">' + here + "</div>");
    if (run.walkedIntoResponse && run.walkedIntoResponse.length) {
      out.push('<div class="ob-where">' + no("Already up from earlier: ") +
        run.walkedIntoResponse.map(esc).join(", ") + no(" — waiting at the door") + "</div>");
    }
    // The tether only exists on an astral run, and when it does it is
    // the most urgent number on the screen — how long until they are
    // ripped back into their body.
    if (run.tether !== null && run.tether !== undefined) {
      // Warn on the last quarter rather than a flat 2 — the budget
      // scales with Magic now, so a fixed number would shout at a weak
      // projector and never reach a strong one.
      const hard = run.tether <= Math.max(2, Math.ceil(run.tetherMax / 4));
      out.push(chips([chip("tether",
        (hard ? no(run.tether) : num(run.tether)) + '<span class="dimmed">/' + run.tetherMax + "</span>",
        hard ? "v-warn" : "")]));
    }
    return out.length > 1 ? out.join("") : "";
  }

  // ── The awareness meter ────────────────────────────────────────
  // How the place is reading the crew, and how much room is left
  // before that changes. A player who cannot see this is being
  // charged a resource they have no way to budget: three odd moments
  // tip you to questionable, and the whole skill of a quiet run is
  // knowing when to slow down.
  //
  // Drawn as the four bands with the current one lit, because the
  // ladder is the thing to understand — not a percentage. When the
  // visual layer arrives this is the same state a rotating camera arc
  // renders; the watchers below are the text stand-in for "what can
  // see you from where you are standing."

  // ── The alert, as ONE box ───────────────────────────────────────
  // The whole ladder used to print every band with the current one
  // highlighted. The player only ever needs the word that is TRUE
  // right now — so it is one box whose word and colour change as the
  // site's read of the crew moves, on the reverse of the readiness
  // ladder: NORMAL teal (their green is your green), AWKWARD gold,
  // QUESTIONABLE amber, THREATENING red.
  const ALERT_TONE = { normal: "a-ok", awkward: "a-close", questionable: "a-costly", threatening: "a-short" };
  function alertBox(run) {
    if (!run.site || !run.site.securityState || !MJ.awarenessRead) return null;
    const a = MJ.awarenessRead(run.site.securityState, run.day);
    let room = "";
    if (a.band === "threatening") room = " " + no("responding in force");
    else if (a.band === "questionable") room = ' <span class="w-warn">one more odd moment tips it</span>';
    else if (a.toNext !== null) {
      room = '<span class="dimmed">room for ' + a.toNext + " more odd moment" +
        (a.toNext === 1 ? "" : "s") + "</span>";
    }
    return '<span class="alert-box ' + (ALERT_TONE[a.band] || "a-costly") + '">' +
      esc(a.band.toUpperCase()) + "</span> " + room;
  }

  // What can actually perceive the crew on this ground, right now.
  // Witnessing is per-plane and co-located (§07), so this is the list
  // a vision arc eventually draws: the things whose attention is the
  // reason time costs anything.
  // `opts.outside` — the crew has not gone in yet. The list below is
  // built around `run.obstacles[run.index]`, which before entry is the
  // FIRST obstacle: things standing next to something the crew has not
  // reached. Saying they are "watching from the same ground" then put
  // a Guard on top of the prep step's own "nothing is watching yet",
  // and the two flatly contradicted each other on one screen. Same
  // data, and only one of the two readings is true at a time, so the
  // wording has to know which side of the door everyone is on.
  // Observers: a COUNT from outside, NAMES once inside. Standing on
  // the pavement you can count silhouettes at the way in, not read
  // badges; standing in the room, you can see what is in the room
  // with you — that is what having eyes means, and it is the same
  // earned-knowledge line the route graph draws.
  function watcherLine(run, opts) {
    const obstacle = run.obstacles && run.obstacles[run.index];
    if (!obstacle || !obstacle.rooms) return "";
    const plane = run.kind === "astralRun" ? "astral" : run.kind === "matrixRun" ? "matrix" : "physical";
    const here = [];
    for (const o of run.obstacles) {
      if (o === obstacle || run.neutralized.has(o)) continue;
      if (!o.senses || o.senses.indexOf(plane) === -1) continue;
      if (!o.rooms || !o.rooms.some((r) => obstacle.rooms.indexOf(r) !== -1)) continue;
      here.push(o.label + (o.fights ? "" : " (eyes only)"));
    }
    const outside = opts && opts.outside;
    if (outside) {
      return '<span class="dk">Observers:</span> ' +
        (here.length ? num(here.length) + '<span class="dimmed"> at the way in</span>'
          : '<span class="dimmed">none visible</span>');
    }
    return '<span class="dk">Observers:</span> ' +
      (here.length
        ? here.map((h) => '<span class="w-warn">' + esc(h) + "</span>").join('<span class="dimmed">, </span>')
        : '<span class="dimmed">nothing else here has eyes on this</span>');
  }

  // What this attempt would look like to anything watching. Nothing
  // runs out through use, so the price of trying again is here — and
  // showing it BEFORE the click is the difference between a player
  // choosing to slow down and a player finding out afterwards.
  const READ_TONE = { normal: "dimmed", awkward: "w-warn", questionable: "w-warn", threatening: "w-no" };

  function readsAsNote(o) {
    if (!o.readsAs) return "";
    const repeat = o.tries > 0;
    // A first quiet attempt that reads as nothing is not worth a
    // line — the readout should carry warnings, not noise.
    if (o.readsAs === "normal") return "";
    const tone = READ_TONE[o.readsAs] || "dimmed";
    return ' <span class="dimmed">· reads </span><span class="' + tone + '">' + esc(o.readsAs) + "</span>" +
      (repeat ? '<span class="dimmed"> (try ' + (o.tries + 1) + ")</span>" : "");
  }

  function optionFor(o) {
    // Whoever has the deepest pool fronts the approach; with nobody
    // trained the approach still shows, it just has no name on it.
    const named = !!o.runner || o.noRoll;
    const main = (o.runner ? nm(o.runner.identity.handle) + " — " : "") +
      (named ? esc(o.verb) : '<span class="dimmed">' + esc(o.verb) + "</span>") +
      (o.loud ? " " + no("(LOUD)") : "");
    // Pool is theirs to know. Threshold is not.
    //
    // Two kinds of dead entry, and the order matters. What the crew
    // LEARNED comes first — it was paid for with an attempt and is
    // the more interesting fact. What the thing simply IS comes next:
    // a camera has no opinion to change, and the crew can see that
    // without trying, so the line says so from the first look. Both
    // stay on the menu, named; neither is deleted.
    let meta;
    if (o.discovered) meta = no(o.discovered);
    else if (!o.lands) meta = '<span class="dimmed">' + esc(o.why) + "</span>";
    else if (o.noRoll) meta = '<span class="dimmed">no roll — costs the time</span>';
    else if (!o.runner) meta = '<span class="dimmed">no ' + esc(o.skill) + " on this crew</span>";
    else meta = esc(o.skill) + " " + num(o.pool + "d") + readsAsNote(o) +
      // The watch group, before the commit: one roll past the lot,
      // and every extra pair of eyes raises the bar by one hit.
      (o.group > 1
        ? ' <span class="w-warn">· ' + o.group + " of them — one chance past all " + o.group + "</span>"
        : "");
    return { html: main, meta: meta, dead: !o.available };
  }

  // Walk one opened dispatch. Calls `done()` when the run is
  // finished and logged — the caller moves to the next mission.
  function play(session, day, entry, done) {
    const run = entry.run;
    const transcript = [];
    let seen = 0;

    function absorb() {
      for (; seen < run.tasks.length; seen++) transcript.push(describeTask(run.tasks[seen]));
    }

    // ── The debrief ─────────────────────────────────────────────
    // A run used to end by vanishing: the modal closed, the hub came
    // back, and the player had to go read the log to find out what
    // had just happened to their people. A run is the whole point of
    // the day — it gets a verdict, what it cost, and what came home.
    function finish() {
      absorb();
      const res = MJ.game.resolveEntry(session, day, entry);
      showResult(res);
    }

    function showResult(res) {
      const run = entry.run || {};
      const site = run.site;
      const verdict = res.error ? no("REFUSED")
        : res.aborted ? no("WITHDREW")
        : res.success ? ok("SUCCESS") : no("FAILED");

      // Everyone who came home carrying something, and everyone who
      // did not come home at all.
      const fallen = [], hurt = [];
      for (const t of res.tasks || []) {
        for (const c of t.casualties || []) {
          (c.died ? fallen : hurt).push(c.died
            ? nm(c.runner) + " " + no("KILLED")
            : nm(c.runner) + " down — " + num(c.wounds) + " boxes");
        }
        for (const inj of t.injured || []) hurt.push(nm(inj.runner) + " — " + num(inj.wounds) + " boxes");
      }

      const cell = (k, v) => '<div class="res-cell"><span class="rk">' + k + "</span>" + v + "</div>";
      const cells = [];

      if (site) {
        // ONLY WHAT THEY EARNED. This printed securityState.current
        // for all three axes — so a crew that walked a corridor came
        // home reporting the astral and Matrix ratings of a building
        // they never touched either of. The debrief is the crew's
        // account of a night, not the game's own sheet: an axis they
        // proved reads confirmed, an axis they did not stays a guess.
        const view = MJ.siteIntelView(site, session.day);
        const axes = ["physical", "astral", "matrix"].map((a) => {
          const L = a[0].toUpperCase();
          return view[a].confirmed
            ? L + ":" + num(MJ.diceForSecurity(view[a].confirmed.value) + "d")
            : L + ':<span class="dimmed">~' + MJ.diceForSecurity(view[a].estimated) + "d</span>";
        }).join(" ");
        cells.push(cell("the site now reads", esc(res.threatBand || "normal") + "<br>" +
          '<span class="dimmed">security </span>' + axes +
          (res.incident && res.incident.ratcheted ? "<br>" + no("they have not stood down") : "")));
      }
      if (res.karmaAward) cells.push(cell("karma", num("+" + res.karmaAward) + '<span class="dimmed"> each</span>'));
      if (res.yield) cells.push(cell("salvage", num(res.yield.amount) + " " + esc(String(res.yield.kind).replace("resource:", ""))));
      if (res.bonusItem) cells.push(cell("found", nm(res.bonusItem.label)));
      if (res.dataHaul) cells.push(cell("data haul", num(res.dataHaul.files || res.dataHaul.amount || 0) + " files"));
      // Pay is a JOB-level event that lands when the day settles, not
      // when a leg finishes — so the honest thing to say here is
      // whether this leg CLOSED the contract, and what that is worth.
      const job = (session.jobs || []).find((j) => j.missions.indexOf(run.mission) !== -1);
      if (job) {
        const done = MJ.isJobComplete(job);
        cells.push(cell("contract #" + job.contractNumber,
          done && !job.paid
            ? ok("COMPLETE") + '<br><span class="dimmed">pays </span>' + num("¥" + job.pay) +
              '<span class="dimmed"> + 1 rep on settle</span>'
            : '<span class="dimmed">' + num(job.missions.filter((m) => m.resolved).length) + " of " +
              num(job.missions.length) + " legs done</span>"));
      }
      if (fallen.length) cells.push(cell("lost", fallen.join("<br>")));
      if (hurt.length) cells.push(cell("came home hurt", hurt.join("<br>")));
      if (res.gap) cells.push(cell("what was missing", no(esc(res.gap.needs ? res.gap.needs.join(", ") : ""))));
      if (!cells.length) cells.push(cell("outcome", '<span class="dimmed">nothing changed hands</span>'));

      // THE VERDICT IS THE POINT OF THE SCREEN. It used to be a
      // heading in the narrow choice column while the log had the
      // whole main panel to itself — so the one thing the player came
      // to read was the smallest thing on it. Now the card sits in
      // the mission column WITH the log, each taking half: read what
      // happened and what it was worth without moving your eyes off
      // the same panel. Nothing is being decided any more, so the
      // choice column closes and the two that remain get the room.
      MJ.decide.open({
        title: esc(entry.label || run.kind),
        subtitle: '<span class="dimmed">debrief</span>',
        site: siteStrip(run),
        future: futurePanel(run),
        party: partyPanel(run),
        transcript: transcript,
        result: '<div class="res-verdict">' + verdict +
          // `obstaclesFaced` is the route INDEX — how many they got
          // PAST, not how many they met. A crew that cleared two and
          // died on the third met three, and "2 obstacles faced"
          // quietly loses the one that killed them.
          ' <span class="dimmed">· ' + num(res.obstaclesFaced || 0) + " of " +
          num((run.obstacles || []).length) + " cleared</span></div>" +
          '<div class="res-grid">' + cells.join("") + "</div>",
        side: false,
        actions: [{ id: "close", label: "back to the hub", tone: "warn-btn" }],
        onAction: () => { MJ.decide.close(); done(res); },
      });
    }

    // Mid-extended-work. The only question is whether to spend
    // another interval, so the whole prompt collapses to that — with
    // the progress, the shrinking pool, and the time already burned
    // laid out, because those are exactly what the decision turns on.
    function stepExtended(prompt) {
      const shortBy = prompt.threshold - prompt.hits;
      MJ.decide.open({
        title: esc(entry.label || run.kind),
        subtitle: '<span class="dimmed">obstacle </span>' + num(prompt.index + 1) +
          '<span class="dimmed"> of </span>' + num(prompt.total) +
          '<span class="dimmed"> · working</span>',
        site: siteStrip(run),
        future: futurePanel(run),
        present: presentPanel(run, prompt),
        party: partyPanel(run),
        transcript: transcript,
        heading: nm(prompt.runner.identity.handle) + '<span class="dimmed"> is working on </span>' +
          nm(prompt.label) + " " + num("T" + prompt.tier) +
          '<div class="ask">' + esc(prompt.verb) + " — " +
          num(prompt.hits) + '<span class="dimmed"> of </span>' + num(prompt.threshold) +
          '<span class="dimmed"> done, </span>' + num(prompt.intervals) +
          '<span class="dimmed"> interval' + (prompt.intervals === 1 ? "" : "s") + " spent</span></div>",
        options: [{
          html: '<span class="w-ok">keep working</span>',
          meta: prompt.pool > 0
            ? esc(prompt.skill) + " " + num(prompt.pool + "d") +
              '<span class="dimmed"> next interval · </span>' + num(shortBy) + '<span class="dimmed"> to go</span>'
            : '<span class="dimmed">nothing left to roll</span>',
          dead: prompt.pool <= 0,
        }, {
          html: "back off",
          meta: '<span class="dimmed">lose the progress, keep the time</span>',
        }],
        actions: [{ id: "withdraw", label: "withdraw the crew", tone: "warn-btn" }],
        onChoose: (opt, i) => {
          MJ.missionExtendedStep(run, i === 0);
          step();
        },
        onAction: (id) => { if (id === "withdraw") { MJ.missionAbort(run); finish(); } },
      });
    }

    // ── Opening the grimoire ────────────────────────────────────
    // The menu itself lives in grimoire.js and knows nothing about
    // obstacles — a spell is something a mage DOES, not a way of
    // answering the thing in front of them, and the most valuable
    // moment to cast most of them is before anybody is looking. This
    // is one caller of two; the pre-run prep step is the other, and
    // anything later (a hub screen, an astral scene) is a third.
    const SPELL_VERB_IDS = MJ.grimoire.SPELL_VERB_IDS;

    function openGrimoire(mage, ctx, headingSuffix, onDone) {
      MJ.grimoire.open({
        caster: mage,
        ctx: ctx,
        chrome: {
          title: esc(entry.label || run.kind),
          site: siteStrip(run),
          future: futurePanel(run),
          // No obstacle in the context means the crew is still outside
          // — the watcher line has to say what is WAITING, not what is
          // watching, or it contradicts the prep step it opened from.
          present: presentPanel(run, { obstacle: ctx.obstacle }, { outside: !ctx.obstacle }),
          party: partyPanel(run),
          transcript: transcript,
        },
        heading: nm(mage.identity.handle) + '<span class="dimmed"> — what they know</span>' +
          (headingSuffix || "") + '<div class="ask">Cast which?</div>',
        onRelease: (e) => {
          MJ.dropSustainedInRun(run, mage, e.spellId);
          onDone();
        },
        onCast: (e, force) => {
          if (e.verbId) {
            // A thrown spell resolves through the verb table, so the
            // three gates and the whole witness/threat chain apply
            // exactly as they do to a rifle.
            MJ.missionChoose(run, { approach: e.verbId, runner: mage, spellId: e.spellId, force: force });
          } else {
            MJ.castUtilitySpell(run, mage, e.spellId, {
              obstacle: ctx.obstacle, target: e.target, force: force,
              // No obstacle in the context means the crew is still
              // outside — say so, rather than letting the model fall
              // back to the first thing on the route.
              prep: !ctx.obstacle,
            });
          }
          onDone();
        },
        onBack: onDone,
      });
    }

    // WHOSE TURN THE PLAYER IS THINKING ABOUT. Held across repaints
    // by identity, not index — the roster order never changes mid-run
    // but a downed runner should not stay selected.
    let selected = null;

    function selectableBodies() {
      return (run.runners || []).filter((r) => !run.downed || !run.downed.has(r));
    }

    function step() {
      absorb();
      const prompt = MJ.missionPrompt(run);
      if (!prompt) return finish();
      if (prompt.extended) return stepExtended(prompt);
      // What the crew LEARNED stays on screen, greyed, because they
      // bought it with an attempt. What was never on the table for
      // this crew — the wrong kind of act for this thing, or a skill
      // nobody has — is not information, it is nine lines of noise
      // between the player and the transcript.
      // Spell verbs are FUNNELLED through the grimoire: the obstacle
      // menu shows one "cast a spell" per mage instead of a scatter of
      // per-shape entries, and the submenu is where the spells live.
      const bodies = selectableBodies();
      if (!bodies.length) return finish();
      // Default to whoever the model would have auto-picked — the
      // best answer in the room — so the console opens on the useful
      // body rather than on roster slot one.
      if (!selected || bodies.indexOf(selected) === -1) {
        const lead = prompt.options.find((o) => o.available && o.runner);
        selected = (lead && lead.runner) || bodies[0];
      }
      const who = selected;

      // ── THIS BODY'S ANSWERS ─────────────────────────────────────
      // The menu asked "what is the crew's best answer" and named a
      // runner. The console asks "what can THIS one do", which is the
      // question a player with a selected body is actually holding.
      // A verb nobody can front stays visible while it is LEARNED
      // (paid for with an attempt); a verb this body simply cannot
      // work is somebody else's row, not a dead line here.
      const shown = prompt.options.filter((o) => {
        if (SPELL_VERB_IDS.indexOf(o.verbId) !== -1) return false;
        if (o.discovered) return true;                       // learned: keep, greyed
        if (!o.available) return false;
        if (o.noRoll) return true;                           // anyone can walk around
        return (o.byRunner || []).some((c) => c.runner === who);
      }).map((o) => {
        // Re-point the row at the selected body: their skill, their
        // pool, their label. Nothing about the verb changes.
        const mine = (o.byRunner || []).find((c) => c.runner === who);
        if (!mine) return o;
        return Object.assign({}, o, {
          runner: who, skill: mine.skill, pool: mine.pool,
          verb: MJ.verbLabel ? MJ.verbLabel(MJ.VERBS[o.verbId], prompt.obstacle, who) : o.verb,
        });
      });
      const ctx = { run: run, obstacle: prompt.obstacle, options: prompt.options };
      // Only THIS body's grimoire — the others are a click away in
      // the crew column.
      const casts = MJ.grimoire.castersIn(run).filter((m) => m === who).map((mage) => {
        const castable = MJ.grimoire.entriesFor(mage, ctx).filter((e) => e.available).length;
        return {
          mage: mage,
          html: nm(mage.identity.handle) + '<span class="dimmed"> — </span>cast a spell',
          meta: castable
            ? num(castable) + '<span class="dimmed"> castable of ' + MJ.spellsFor(mage).length + " known</span>"
            : '<span class="dimmed">nothing in the grimoire answers this</span>',
          dead: !castable,
        };
      });
      const options = shown.map(optionFor).concat(casts.map((c) => ({ html: c.html, meta: c.meta, dead: c.dead })));
      // Stalled asks the MODEL's question (all approaches, spell verbs
      // included) — the funnel changes where spells are clicked, not
      // whether they count as ways through.
      const stalled = !prompt.options.some((o) => o.available);
      MJ.decide.open({
        title: esc(entry.label || run.kind),
        subtitle: '<span class="dimmed">obstacle </span>' + num(prompt.index + 1) +
          '<span class="dimmed"> of </span>' + num(prompt.total),
        site: siteStrip(run),
        future: futurePanel(run),
        present: presentPanel(run, prompt),
        party: partyPanel(run, bodies.indexOf(who)),
        transcript: transcript,
        heading: nm(who.identity.handle) +
          '<div class="ask">' + (stalled
            ? no("Nothing left to try here.")
            : "What do they do?") + "</div>",
        options: options,
        actions: [
          stalled ? { id: "push", label: "press on regardless", tone: "warn-btn" } : null,
          { id: "withdraw", label: "withdraw the crew", tone: "warn-btn" },
        ].filter(Boolean),
        onSelectBody: (i) => { selected = bodies[i] || selected; step(); },
        onChoose: (opt, i) => {
          if (i >= shown.length) {
            const c = casts[i - shown.length];
            return openGrimoire(c.mage, ctx,
              '<span class="dimmed">, against </span>' + nm(prompt.label) + " " + num("T" + prompt.tier),
              step);
          }
          const c = shown[i];
          MJ.missionChoose(run, { skill: c.skill, runner: c.runner, approach: c.approach });
          step();
        },
        onAction: (id) => {
          if (id === "withdraw") { MJ.missionAbort(run); return finish(); }
          if (id === "push") { MJ.missionChoose(run, null); step(); }
        },
      });
    }

    // ── Before you go in ────────────────────────────────────────
    // The moment the whole threat model points at. Armor and
    // Invisibility go up HERE, on open ground with nothing watching,
    // because the same spell cast six feet from a guard reads as a
    // man preparing for violence and moves the whole room. Nothing is
    // in front of the crew yet, so the grimoire greys everything that
    // needs a target and offers exactly the spells worth pre-casting.
    //
    // Skipped silently when nobody can cast — a mundane crew should
    // never see a magic prompt.
    // ── The way in ──────────────────────────────────────────────
    // findPaths has always computed every distinct route to the
    // objective; the run just silently took the shortest. Now the
    // player picks the door. Choosing re-routes the run and repaints,
    // so the graph redraws to the chosen shape before they commit —
    // the shape of a route is free knowledge (the crew cased the
    // building), what is IN the rooms stays earned.
    //
    // Skipped silently when there is only one way in.
    function stepApproach() {
      const apps = MJ.missionApproaches ? MJ.missionApproaches(run) : [];
      if (apps.length <= 1) return stepPrep();
      // Every candidate route DRAWN, red dot at its own door, gold at
      // the shared objective — "the roof is 4 rooms, the window is 2"
      // is seen, not read. Shape only: nothing about a room's
      // contents is knowable from the pavement, and the picker must
      // not pretend otherwise.
      const rows = apps.map((a) => ({
        html: nm(a.label) + '<span class="dimmed"> — </span>' + num(a.rooms) +
          '<span class="dimmed"> room' + (a.rooms === 1 ? "" : "s") + " to the objective</span>" +
          routeGraph(run, { path: a.path, mini: true }),
        meta: a.current ? ok("the current plan") : '<span class="dimmed">reroute</span>',
      }));
      MJ.decide.open({
        title: esc(entry.label || run.kind),
        subtitle: '<span class="dimmed">casing the approaches</span>',
        site: siteStrip(run),
        // The plan as it stands, full size — the thing each candidate
        // in the option list is being compared AGAINST. Shape only:
        // nothing about a room's contents is knowable from the
        // pavement, and the picker must not pretend otherwise.
        future: futurePanel(run, { outside: true }),
        present: presentPanel(run, null, { outside: true }),
        party: partyPanel(run),
        transcript: transcript,
        heading: nm("The way in") + '<div class="ask">Which approach?</div>',
        options: rows,
        actions: [
          { id: "holdOff", label: "hold off — not today" },
          { id: "settled", label: "settled — gear up", tone: "warn-btn" },
        ],
        onChoose: (opt, i) => {
          MJ.missionSetRoute(run, apps[i].path);
          stepApproach(); // repaint: the graph redraws to the chosen route
        },
        onAction: (id) => {
          if (id === "holdOff") { MJ.missionAbort(run, { atDoor: true }); return finish(); }
          stepPrep();
        },
      });
    }

    function stepPrep() {
      const casters = MJ.grimoire.castersIn(run);
      if (!casters.length) return step();
      const ctx = { run: run }; // NO obstacle: they are not at one yet
      const rows = casters.map((mage) => {
        const castable = MJ.grimoire.entriesFor(mage, ctx).filter((e) => e.available).length;
        return {
          mage: mage,
          html: nm(mage.identity.handle) + '<span class="dimmed"> — </span>cast a spell',
          meta: castable
            ? num(castable) + '<span class="dimmed"> to put up before anyone is watching</span>'
            : '<span class="dimmed">nothing worth casting yet</span>',
          dead: !castable,
        };
      });
      const holding = (run.sustaining || []).map((s) =>
        nm((MJ.spellDef(s.spell) || {}).label || s.spell) +
        '<span class="dimmed"> · Force ' + s.force + " · " + esc(s.caster.identity.handle) + "</span>");
      MJ.decide.open({
        title: esc(entry.label || run.kind),
        subtitle: '<span class="dimmed">before you go in</span>',
        site: siteStrip(run),
        future: futurePanel(run, { outside: true }),
        // Outside, so the watcher line has to name what is WAITING
        // rather than what is watching — otherwise it contradicts the
        // heading directly below it.
        present: presentPanel(run, null, { outside: true }),
        party: partyPanel(run),
        transcript: transcript,
        heading: nm("Outside") + '<span class="dimmed"> — nothing is watching yet</span>' +
          (holding.length ? '<div class="dimmed">✦ holding: ' + holding.join(", ") + "</div>" : "") +
          '<div class="ask">Anything to put up first?</div>',
        options: rows.map((r) => ({ html: r.html, meta: r.meta, dead: r.dead })),
        // Standing at the door is still a decision point — the player
        // can look at what is waiting inside and decide not to today.
        // The day is spent for this crew (they went, they came back),
        // the job leg stays open to retry, nothing saw them and
        // nothing ratchets. The rest of the queue plays on.
        actions: [
          { id: "holdOff", label: "hold off — not today" },
          { id: "go", label: "go in", tone: "warn-btn" },
        ],
        onChoose: (opt, i) => {
          const r = rows[i];
          if (r && !r.dead) openGrimoire(r.mage, ctx, "", stepPrep);
        },
        onAction: (id) => {
          if (id === "holdOff") { MJ.missionAbort(run, { atDoor: true }); return finish(); }
          step();
        },
      });
    }

    stepApproach();
  }

  MJ.missionPopup = { play: play };
})();
