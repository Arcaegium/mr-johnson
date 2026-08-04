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
      `<button class="opt${o.dead ? " dead" : ""}${o.tone ? " " + o.tone : ""}" data-pick="${i}">` +
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

  function describeTask(t) {
    if (!t.runner) return '<span class="dimmed">' + esc(t.obstacle) + " " + num("T" + t.tier) + " — " + esc(t.result) + "</span>";
    if (t.rejected) return nm(t.runner) + " tried " + esc(t.skill) + " on " + nm(t.obstacle) + " — " + no(t.rejected);
    if (t.extended) {
      const outcome = t.abandoned ? no("backed off")
        : t.success ? ok("through")
        : t.glitch ? no("FUMBLED IT") : no("ran dry");
      return nm(t.runner) + " worked " + nm(t.obstacle) + " " + num("T" + t.tier) +
        " (" + esc(t.skill) + ") — " + num(t.hits) + '<span class="dimmed">/</span>' + num(t.threshold) +
        " over " + num(t.intervals) + '<span class="dimmed"> interval' + (t.intervals === 1 ? "" : "s") + "</span>: " + outcome +
        (t.criticalGlitch ? " " + no("CRITICAL GLITCH") : "") + readNote(t.read) +
        (t.responders && t.responders.length
          ? "<br>" + no("&nbsp;&nbsp;RESPONSE: " + t.responders.join(", ") + " — they are coming") : "");
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
        ? "<br>" + no("&nbsp;&nbsp;RESPONSE: " + t.responders.join(", ") + " — they are coming") : "");
  }

  // Everything the crew can see about where they are standing.
  function contextLines(run) {
    const id = run.site ? run.site.identity : null;
    const lines = [];
    if (id) {
      lines.push(nm(id.name || ("site #" + id.universeIndex)) +
        ' <span class="dimmed">· ' + esc(id.owningFaction) + " · " + esc(id.district) +
        (id.theme ? " · " + esc(id.theme) : "") + "</span>");
    }
    if (run.walkedIntoResponse && run.walkedIntoResponse.length) {
      lines.push(no("Already up from earlier: ") + run.walkedIntoResponse.map(esc).join(", ") + no(" — waiting at the door"));
    }
    const band = run.site && run.site.securityState ? MJ.threatBand(run.site.securityState, run.day) : "normal";
    if (band !== "normal") {
      lines.push('<span class="dimmed">they are reading you as </span>' +
        (band === "threatening" ? no(band.toUpperCase()) : '<span class="w-warn">' + esc(band) + "</span>"));
    }
    return lines;
  }

  function optionFor(o) {
    // Whoever has the deepest pool fronts the approach; with nobody
    // trained the approach still shows, it just has no name on it.
    const named = !!o.runner || o.noRoll;
    const main = (o.runner ? nm(o.runner.identity.handle) + " — " : "") +
      (named ? esc(o.verb) : '<span class="dimmed">' + esc(o.verb) + "</span>") +
      (o.loud ? " " + no("(LOUD)") : "");
    // Pool is theirs to know. Threshold is not.
    let meta;
    if (o.discovered) meta = no(o.discovered);
    else if (o.noRoll) meta = '<span class="dimmed">no roll — costs the time</span>';
    else if (!o.runner) meta = '<span class="dimmed">no ' + esc(o.skill) + " on this crew</span>";
    else if (o.attemptsLeft <= 0) meta = '<span class="dimmed">out of attempts here</span>';
    else meta = esc(o.skill) + " " + num(o.pool + "d") +
      (o.attemptsLeft > 1 ? ' <span class="dimmed">· ' + o.attemptsLeft + " tries left</span>" : "");
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

    function finish() {
      absorb();
      MJ.decide.close();
      const res = MJ.game.resolveEntry(session, day, entry);
      done(res);
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
      const options = prompt.options.map(optionFor);
      const stalled = prompt.options.every((o) => !o.available);
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
          const c = prompt.options[i];
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
