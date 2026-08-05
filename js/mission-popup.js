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

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // The four word types, one helper each.
  const nm = (s) => '<span class="w-name">' + esc(s) + "</span>";
  const num = (s) => '<span class="w-num">' + esc(s) + "</span>";
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
      const el = e.target.closest("[data-pick],[data-side]");
      if (!el || !current) return;
      if (el.dataset.pick !== undefined) {
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
    host.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true">' +
        '<div class="modal-head">' +
          `<div class="modal-title">${s.title || ""}</div>` +
          (s.subtitle ? `<div class="modal-sub">${s.subtitle}</div>` : "") +
        "</div>" +
        (s.context && s.context.length ? `<div class="modal-context">${s.context.join("<br>")}</div>` : "") +
        (s.transcript && s.transcript.length
          ? `<div class="modal-transcript">${s.transcript.join("<br>")}</div>` : "") +
        (s.heading ? `<div class="modal-heading">${s.heading}</div>` : "") +
        (opts ? `<div class="modal-options">${opts}</div>` : "") +
        (acts ? `<div class="modal-actions">${acts}</div>` : "") +
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
    if (!t.runner) return '<span class="dimmed">' + esc(t.obstacle) + " " + num("T" + t.tier) + " — " + esc(t.result) + "</span>";
    if (t.rejected) return nm(t.runner) + " tried " + esc(t.skill) + " on " + nm(t.obstacle) + " — " + no(t.rejected);
    if (t.combat) {
      const head = (t.surprise ? no("AMBUSH") : no("FIREFIGHT")) + " — " +
        nm(t.enemies.join(", ")) + " — " + num(t.rounds) +
        '<span class="dimmed"> round' + (t.rounds === 1 ? "" : "s") + "</span>: " +
        (t.success ? ok("crew held the ground") : t.stalemate ? no("broke off — could not finish them") : no("THE CREW WENT DOWN")) + readNote(t.read);
      const fallen = (t.casualties || []).map((c) => "<br>&nbsp;&nbsp;" + nm(c.runner) +
        (c.died ? " " + no("was KILLED") : " went down — carried out with " + num(c.wounds) + " box" + (c.wounds === 1 ? "" : "es"))).join("");
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
    return nm(t.runner) + " (" + bits + ") vs " + nm(t.obstacle) + " " + num("T" + t.tier) + " — " +
      num(t.hits) + " hits: " + (t.success ? ok("through") : no("MISSED")) +
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

  function contextLines(run) {
    const id = run.site ? run.site.identity : null;
    const lines = [];
    if (id) {
      lines.push(nm(id.name || ("site #" + id.universeIndex)) +
        ' <span class="dimmed">· ' + esc(id.owningFaction) + " · " + esc(id.district) +
        (id.theme ? " · " + esc(id.theme) : "") + "</span>");
    }
    // WHAT THEY EXPECTED, and what they have now actually SEEN.
    // An axis ticks over from estimate to confirmed the moment the
    // crew has proof — either they met something rated at the top of
    // what the place can field, or they faced enough of it that the
    // density says so on its own. Standing in the building and
    // watching your guess get confirmed is the payoff for going.
    if (run.site && run.state) {
      const axes = ["physical", "astral", "matrix"].map((a) => {
        const p = MJ.axisProven(run, a);
        const est = run.site.estimatedSecurity ? run.site.estimatedSecurity[a] : null;
        const letter = a[0].toUpperCase();
        // TWO STATES ONLY: a guess, or a fact. `~4` while it is still
        // an estimate, `4` with a tick once the crew has earned it.
        //
        // Nothing about "how much more looking" belongs on screen —
        // knowing what counts as a big enough sample requires knowing
        // the size of the population you are sampling, and the crew
        // has no more access to that than they do to the number
        // itself. The math decides WHEN the tick appears; it is not
        // something to narrate at the player.
        if (p && p.proven) return letter + ":" + ok(run.state.axes[a].current + "✓");
        // Still guessing — but contact corrects the guess upward as it
        // happens. Meet a tier-5 on a place pencilled at ~3 and it
        // reads ~5, because you have MET a five. Only the site's own
        // security counts; a response squad's rating is a fact about
        // the noise you made.
        const shown = Math.max(est === null ? 0 : est, (p && p.maxTier) || 0);
        return letter + ':<span class="dimmed">~' + (shown || "?") + "</span>";
      }).join(" ");
      lines.push('<span class="dimmed">security </span>' + axes);
    }
    // WHERE they are. A street run walks the building room by room,
    // so the obstacle in front of the crew has a place, and the
    // route has a length they are some way along. The placeholder
    // prints it as a sentence; a drawn top-down puts the crew on
    // that room and animates the crossing. Same data either way.
    const here = whereLine(run);
    if (here) lines.push(here);
    if (run.walkedIntoResponse && run.walkedIntoResponse.length) {
      lines.push(no("Already up from earlier: ") + run.walkedIntoResponse.map(esc).join(", ") + no(" — waiting at the door"));
    }
    // The tether only exists on an astral run, and when it does it
    // is the most urgent number on the screen — it is how long until
    // they are ripped back into their body.
    if (run.tether !== null && run.tether !== undefined) {
      lines.push('<span class="dimmed">tether </span>' + num(run.tether) +
        '<span class="dimmed"> of </span>' + num(run.tetherMax) +
        '<span class="dimmed"> turns left</span>' +
        // Warn on the last quarter rather than a flat 2 — the budget
        // scales with Magic now, so a fixed number would shout at a
        // weak projector and never reach a strong one.
        (run.tether <= Math.max(2, Math.ceil(run.tetherMax / 4))
          ? " " + no("— the pull is getting hard") : ""));
    }
    const meter = awarenessMeter(run);
    if (meter) lines.push(meter);
    return lines;
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
  const BAND_TONE = { normal: "w-ok", awkward: "w-warn", questionable: "w-warn", threatening: "w-no" };

  function awarenessMeter(run) {
    if (!run.site || !run.site.securityState || !MJ.awarenessRead) return null;
    const a = MJ.awarenessRead(run.site.securityState, run.day);
    const ladder = a.bands.map((b, i) => {
      if (i === a.rank) return '<span class="' + (BAND_TONE[b] || "w-warn") + '">[' + esc(b.toUpperCase()) + "]</span>";
      return '<span class="dimmed">' + esc(b) + "</span>";
    }).join('<span class="dimmed"> › </span>');

    let room = "";
    if (a.band === "threatening") {
      room = " " + no("— they are responding in force");
    } else if (a.band === "questionable") {
      room = ' <span class="w-warn">— one more odd moment tips it</span>';
    } else if (a.toNext !== null) {
      room = '<span class="dimmed"> — room for </span>' + num(a.toNext) +
        '<span class="dimmed"> more odd moment' + (a.toNext === 1 ? "" : "s") + "</span>";
    }

    const watchers = watcherLine(run);
    return ladder + room + (watchers ? "<br>" + watchers : "");
  }

  // What can actually perceive the crew on this ground, right now.
  // Witnessing is per-plane and co-located (§07), so this is the list
  // a vision arc eventually draws: the things whose attention is the
  // reason time costs anything.
  function watcherLine(run) {
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
    if (!here.length) return '<span class="dimmed">nothing else here has eyes on this</span>';
    return '<span class="dimmed">watching from the same ground: </span>' +
      here.map((h) => '<span class="w-warn">' + esc(h) + "</span>").join('<span class="dimmed">, </span>');
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
    else meta = esc(o.skill) + " " + num(o.pool + "d") + readsAsNote(o);
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
        const st = site.securityState;
        const axes = st ? ["physical", "astral", "matrix"]
          .map((a) => a[0].toUpperCase() + ":" + num(st.axes[a].current)).join(" ") : "—";
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

      MJ.decide.open({
        title: esc(entry.label || run.kind),
        subtitle: '<span class="dimmed">debrief</span>',
        context: contextLines(run),
        transcript: transcript,
        heading: '<div class="res-verdict">' + verdict + '</div>' +
          '<span class="dimmed">' + num(res.obstaclesFaced || 0) + " obstacle" +
          ((res.obstaclesFaced || 0) === 1 ? "" : "s") + " faced</span>" +
          '<div class="res-grid">' + cells.join("") + "</div>",
        options: [],
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
        context: contextLines(run),
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
      const shown = prompt.options.filter((o) => o.available || o.discovered);
      const options = shown.map(optionFor);
      const stalled = !shown.some((o) => o.available);
      MJ.decide.open({
        title: esc(entry.label || run.kind),
        subtitle: '<span class="dimmed">obstacle </span>' + num(prompt.index + 1) +
          '<span class="dimmed"> of </span>' + num(prompt.total),
        context: contextLines(run),
        transcript: transcript,
        heading: nm(prompt.label) + " " + num("T" + prompt.tier) +
          (prompt.projection ? ' <span class="dimmed">(' + esc(prompt.projection) + ")</span>" : "") +
          '<div class="ask">' + (stalled
            ? no("Nothing left to try here.")
            : "How do you want to handle this?") + "</div>",
        options: options,
        actions: [
          stalled ? { id: "push", label: "press on regardless", tone: "warn-btn" } : null,
          { id: "withdraw", label: "withdraw the crew", tone: "warn-btn" },
        ].filter(Boolean),
        onChoose: (opt, i) => {
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

    step();
  }

  MJ.missionPopup = { play: play };
})();
