/* ============================================================
   Mr. Johnson — character-creation.js

   The player's own runner, built by the SAME birth allocator that
   builds everyone they will ever hire. That is the entire point of
   the screen: it is not a separate power-fantasy budget bolted onto
   the front of the game, it is the generator with the questions
   handed over. What a player learns making one is TRUE of the eight
   faces on the market tomorrow.

   So this file has NO game rules in it. It asks MJ.creationMenu what
   is legal, collects answers, and hands them to MJ.createRunner —
   which is MJ.generateRunner with the rolls replaced by choices.
   Every constraint the player runs into here (a Marksman's primary
   is marksmanship; a Street Doc is mundane; a mage's book is capped
   at min(Magic, Sorcery+1)) is a constraint the model already
   enforced on everybody else.

   WHAT IS NOT A CHOICE, and why:
     - The primary skill. It IS the focus's key skill, and picking
       the focus is picking it. A Marksman whose primary was hacking
       would make the class identifier lie.
     - disciplineLabel. It is a SELF-ASSESSMENT and the one visible
       claim allowed to be wrong. Letting the player set it turns the
       game's only piece of unreliable narration into a form field.
     - The karma pool, and the band rolls inside it. Two runners built
       to the same spec are not the same runner — the variance is the
       design (glass cannons, rubber bands, occasional gems), and it
       is seeded off the universe so it cannot be fished for. Change
       the picks and you change the outcome; press the button again
       and you get the same person back.

   Built on MJ.decide, like the mission popup and the grimoire —
   "here are your variables, here is what each costs you" is one
   shape of question and it gets one component.
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  const esc = MJ.text.esc, nm = MJ.text.nm, num = MJ.text.num;
  const dim = (s) => '<span class="dimmed">' + s + "</span>";

  // Skill ids are camelCase in the model and want spaces on a screen.
  const words = (id) => String(id).replace(/([A-Z])/g, " $1").toLowerCase();

  const FAMILY_LABEL = {
    fighter: "Fighter", face: "Face", decker: "Decker",
    rigger: "Rigger", mage: "Mage",
  };
  const FAMILY_BLURB = {
    fighter: "guns, blades, and the medicine that follows them",
    face: "talk, command, and threat — the three social verbs",
    decker: "the Matrix: hosts, ICE, and every device on the grid",
    rigger: "drones, vehicles, and the electronics behind them",
    mage: "the astral, and what can be done to the physical from it",
  };
  const ORIGIN_BLURB = {
    mundane: "no chrome, no spark — cheap to run and nothing to lose",
    cyber: "implanted. Essence spent, and it does not come back",
    magic: "Awakened — the spark, and everything it can be spent on",
    infected: "something else now, and the street knows it",
  };

  // ── The sheet, before it is committed ──────────────────────────
  // The player sees the ACTUAL runner the allocator produced, not a
  // promise about one. Nothing is behind the confirm button.
  function sheet(runner) {
    const c = runner.classification;
    const chip = (k, v, tone) =>
      `<div class="vchip${tone ? " " + tone : ""}"><span class="vk">${esc(k)}</span><span class="vv">${v}</span></div>`;
    // READ OFF THE RUNNER, never a list written here. This started as
    // a hardcoded SR5 attribute line and silently dropped three of
    // them, because the model carries a smaller set than the rulebook
    // does — a sheet that names its own columns is a sheet that goes
    // quietly wrong the day the model changes.
    // Zero is an ABSENCE, not a score: a mundane runner's Magic 0 is
    // "no spark", and printing it in the row reads as a dumped stat.
    const attrRow = Object.keys(runner.attributes)
      .filter((a) => (runner.attributes[a] || 0) > 0)
      .map((a) => chip(a.slice(0, 3), num(runner.attributes[a]))).join("");
    // Trained skills only — a wall of zeroes teaches nothing.
    const trained = Object.keys(runner.skills || {})
      .filter((s) => runner.skills[s] > 0)
      .sort((a, b) => runner.skills[b] - runner.skills[a]);
    const primary = c.skillTiers ? c.skillTiers.primary : null;
    const secondary = (c.skillTiers && c.skillTiers.secondary) || [];
    const skillRow = trained.map((s) => chip(words(s), num(runner.skills[s]),
      s === primary ? "v-sure" : secondary.indexOf(s) !== -1 ? "v-warn" : "")).join("");
    const book = (c.spellsKnown || []).map((id) =>
      nm((MJ.spellDef && MJ.spellDef(id) ? MJ.spellDef(id).label : id)));
    const powers = (c.powersKnown || []).map((id) =>
      nm((MJ.powerDef && MJ.powerDef(id) ? MJ.powerDef(id).label : id)));
    return (
      `<div class="res-verdict">${nm(runner.identity.handle)} ` +
      dim("· " + esc(c.presentationLabel || c.focusLabel)) + "</div>" +
      `<div class="cc-line">${dim(esc(runner.identity.metatype) + " · " +
        esc(c.focusLabel) + " · " + esc(c.origin) + " · claims " + esc(c.disciplineLabel))}</div>` +
      `<div class="cc-k">attributes</div><div class="vrow">${attrRow}</div>` +
      `<div class="cc-k">skills ${dim("— primary teal, secondary amber")}</div>` +
      `<div class="vrow">${skillRow || dim("none trained")}</div>` +
      (book.length ? `<div class="cc-k">grimoire</div><div class="cc-line">${book.join(dim(" · "))}</div>` : "") +
      (powers.length ? `<div class="cc-k">powers</div><div class="cc-line">${powers.join(dim(" · "))}</div>` : "") +
      `<div class="cc-k">kit</div><div class="cc-line">` +
      ((runner.gear || []).map((g) => esc(g.label)).join(dim(" · ")) || dim("nothing but the clothes")) + "</div>"
    );
  }

  // What has been decided so far, always on screen — a creation flow
  // that hides its own answers makes the player hold the sheet in
  // their head while they read the next question.
  function picksPanel(picks, menu) {
    const rows = [];
    const line = (k, v) => rows.push(
      `<div class="cc-pick"><span class="cc-pk">${esc(k)}</span>${v}</div>`);
    if (picks.family) line("class", nm(FAMILY_LABEL[picks.family] || picks.family));
    if (picks.focusId) {
      const f = MJ.focusById(picks.focusId);
      line("focus", nm(f.label) + dim(" — primary " + words(f.keySkill)));
    }
    if (picks.trueArchetype) {
      line("breadth", nm(picks.trueArchetype) +
        dim(" — " + menu.secondaryCount + " secondar" + (menu.secondaryCount === 1 ? "y" : "ies")));
    }
    if (picks.secondaries && picks.secondaries.length) {
      line("secondaries", picks.secondaries.map((s) => nm(words(s))).join(dim(", ")));
      // CHOOSING THE SECONDARIES IS WHAT DEFINES THE TERTIARY TIER.
      // Showing the remainder the moment it exists is half of what
      // building the first runner is supposed to teach: the class list
      // is finite, you decide which parts of it you are good at, and
      // everything you did not pick is still yours, just shallower.
      if (menu.tertiary && menu.tertiary.length) {
        line("tertiary", dim(menu.tertiary.map(words).join(", ")));
      }
    }
    if (picks.origin) line("origin", nm(picks.origin));
    if (picks.metatype) line("metatype", nm(picks.metatype));
    if (picks.presentationId) {
      const p = (menu.presentations || []).find((x) => x.id === picks.presentationId);
      line("presents as", nm(p ? p.label : picks.presentationId));
    }
    if (picks.spells && picks.spells.length) {
      line("chose to study", picks.spells.map((id) =>
        nm(MJ.spellDef && MJ.spellDef(id) ? MJ.spellDef(id).label : id)).join(dim(", ")));
    }
    if (!rows.length) return "";
    return '<div class="pane-k">so far</div>' + rows.join("");
  }

  // ── The flow ───────────────────────────────────────────────────
  // A queue of steps, each one a question with a list of answers.
  // Steps are recomputed from the menu every repaint, so changing an
  // earlier answer genuinely re-asks the later ones rather than
  // leaving a stale pick behind (pick Decker, back up, pick Mage —
  // the presentations must be a mage's).
  function open(opts) {
    opts = opts || {};
    const seed = opts.seed || "founder";
    const picks = {};
    const history = [];   // step ids already answered, for "back"

    const STARTER = MJ.STARTER;
    // Where every purchase lands. Two ledgers because the two purses
    // buy different units: attribute POINTS are +1 rating each, skill
    // ranks are a rank each.
    const buy = { attributes: {}, skills: {} };

    function menuNow() { return MJ.creationMenu(picks); }

    // The metatype's own floor, before a single point is spent — what
    // a rating is counted UP FROM, and the number the cap is measured
    // against. Read off a throwaway build of the current picks so the
    // screen can never disagree with the model about where a body
    // starts.
    function shellAttributes() {
      if (!picks.metatype || !picks.focusId) return {};
      const probe = MJ.createRunner("cc-floor|" + picks.metatype + "|" + picks.focusId + "|" + (picks.origin || ""),
        Object.assign({}, picks, { starter: { attributes: {}, skills: {} } }));
      return probe.attributes;
    }

    // ── A SPEND STEP ───────────────────────────────────────────────
    // One purse, a list of rows, click to buy and click again to sell
    // back. Nothing here is committed until the sheet is signed, so a
    // misspent point is never a trap.
    function spend(id, ask, sub, when, budget, rows, ledger) {
      return {
        id: id, ask: ask, sub: sub, when: when, spendStep: true,
        budget: budget, ledger: ledger,
        rowsFor: rows,
        left: () => {
          const put = buy[ledger] || {};
          const mine = rows().map((r) => r.value);
          return budget - mine.reduce((a, s) => a + (put[s] || 0), 0);
        },
      };
    }

    // The ordered questions. `when` decides whether a step is asked at
    // all — a focus with one legal origin does not get an origin
    // question, because a choice of one is not a choice.
    function steps() {
      const m = menuNow();
      const list = [
        {
          id: "family", ask: "What do they do?",
          sub: "the class — everything after this is a kind of this",
          options: m.families.map((f) => ({
            value: f, html: nm(FAMILY_LABEL[f] || f), meta: dim(FAMILY_BLURB[f] || ""),
          })),
          set: (v) => { picks.family = v; delete picks.focusId; delete picks.presentationId;
                        delete picks.secondaries; delete picks.origin; delete picks.spells; },
        },
        {
          id: "focusId", ask: "What kind?",
          sub: "the focus — and with it, the one skill they are built around",
          when: () => !!picks.family,
          options: m.focuses.map((f) => ({
            value: f.id, html: nm(f.label),
            meta: dim("primary: ") + num(words(f.keySkill)),
          })),
          set: (v) => { picks.focusId = v; delete picks.presentationId;
                        delete picks.secondaries; delete picks.origin; delete picks.spells; },
        },
        {
          id: "trueArchetype", ask: "Deep, or wide?",
          sub: "how many skills the karma has to cover — fewer means further",
          when: () => !!picks.focusId,
          options: m.archetypes.map((a) => ({
            value: a.id, html: nm(a.label),
            meta: dim(a.secondaries + " secondar" + (a.secondaries === 1 ? "y" : "ies") +
              " beside the primary" + (a.id === "specialist" ? " — the rest run deeper" : " — spread thinner")),
          })),
          set: (v) => { picks.trueArchetype = v; delete picks.secondaries; },
        },
        {
          id: "secondaries", ask: "What else are they good at?",
          sub: "pick " + m.secondaryCount + " — the rest of the list stays tertiary",
          when: () => !!picks.trueArchetype,
          multi: m.secondaryCount,
          options: m.secondaryPool.map((s) => ({ value: s, html: nm(words(s)) })),
          set: (v) => { picks.secondaries = v; },
        },
        {
          id: "origin", ask: "Where does the edge come from?",
          sub: "chrome, a spark, neither, or something worse",
          when: () => !!picks.focusId && m.origins.length > 1,
          options: m.origins.map((o) => ({
            value: o, html: nm(o), meta: dim(ORIGIN_BLURB[o] || ""),
          })),
          set: (v) => { picks.origin = v; delete picks.spells; },
        },
        {
          id: "metatype", ask: "What are they?",
          sub: "metatype moves the attribute floors and ceilings",
          when: () => !!picks.focusId,
          options: m.metatypes.map((id) => {
            const t = MJ.METATYPES[id] || {};
            const mods = Object.keys(t.modifiers || {})
              .map((k) => k.slice(0, 3) + " " + (t.modifiers[k] > 0 ? "+" : "") + t.modifiers[k]);
            return { value: id, html: nm(id), meta: dim(mods.join(", ") || "the baseline") };
          }),
          set: (v) => { picks.metatype = v; },
        },
        {
          id: "presentationId", ask: "How do they present?",
          sub: "the part of the sheet that is always true — nobody misreports this",
          when: () => !!picks.focusId && m.presentations.length > 0,
          options: m.presentations.map((p) => ({
            value: p.id, html: nm(p.label), meta: dim(p.blurb || ""),
          })),
          set: (v) => { picks.presentationId = v; },
        },
        // ── THE POINT BUY ──────────────────────────────────────────
        // Four purses, fixed sizes, nothing rolled. Each of these is a
        // SPEND step: clicking a row buys a rank (or a point), and the
        // subtitle counts down what is left. Building the first runner
        // is meant to show where a sheet's numbers come from, and a
        // screen that rolled them would show the opposite.
        spend("attributes", "Where does the body go?",
          "attribute points — one per rating, inside what the metatype allows",
          () => !!picks.metatype,
          STARTER.attributePoints,
          () => {
            const base = shellAttributes();
            const meta = MJ.METATYPES[picks.metatype];
            return Object.keys(base)
              // Magic 0 means no spark, and a spark is not for sale.
              // The model refuses it too; this keeps it off the menu
              // so the refusal is never something the player discovers
              // by spending points into a hole.
              .filter((a) => a !== "magic" || base.magic > 0)
              .map((a) => ({
                value: a, label: a,
                cap: a === "magic" ? 6 : (meta && meta.max ? meta.max[a] : 6),
                base: base[a],
              }));
          }, "attributes"),
        spend("secondarySpend", "How good are they at those?",
          "ranks across the secondaries they picked",
          () => !!(picks.secondaries && picks.secondaries.length),
          STARTER.secondaryPool,
          () => (picks.secondaries || []).map((s) => ({ value: s, label: words(s), cap: STARTER.skillCap, base: 0 })),
          "skills"),
        spend("tertiarySpend", "And the rest of the trade?",
          "ranks across what the class list left over — this tier IS the remainder",
          () => !!(picks.secondaries && picks.secondaries.length) && m.tertiary.length > 0,
          STARTER.tertiaryPool,
          () => m.tertiary.map((s) => ({ value: s, label: words(s), cap: STARTER.skillCap, base: 0 })),
          "skills"),
        spend("universalSpend", "What else can they do?",
          "ranks on skills that belong to nobody's class — always on offer, whatever they are",
          () => !!picks.focusId && m.universal.length > 0,
          STARTER.universalPool,
          () => m.universal.map((s) => ({ value: s, label: words(s), cap: STARTER.skillCap, base: 0 })),
          "skills"),
        {
          id: "spells", ask: "What did they study?",
          sub: m.signatureSpell
            ? "beyond " + (MJ.spellDef(m.signatureSpell) || {}).label +
              ", which their focus already guarantees — the book fills to min(Magic, Sorcery+1)"
            : "the book",
          when: () => picks.family === "mage" && m.spellPool.length > 0,
          multi: -1,   // as many as they like; the allocator caps it
          options: m.spellPool
            .filter((id) => id !== m.signatureSpell)
            .map((id) => {
              const d = MJ.spellDef(id) || {};
              return { value: id, html: nm(d.label || id),
                meta: dim([d.category, d.shape].filter(Boolean).join(" · ")) };
            }),
          set: (v) => { picks.spells = v; },
        },
      ];
      return list.filter((s) => !s.when || s.when());
    }

    function nextStep() {
      for (const s of steps()) {
        // A SPEND STEP IS DONE WHEN THE PURSE IS EMPTY. It cannot be
        // "answered" like a choice, and leaving points unspent is not
        // a thing a player should be able to do by accident — the
        // build is fixed-size and every point is theirs.
        if (s.spendStep) { if (s.left() > 0) return s; continue; }
        const v = picks[s.id];
        if (v === undefined || (Array.isArray(v) && s.multi > 0 && v.length !== s.multi)) return s;
      }
      return null;
    }

    function paint() {
      const m = menuNow();
      const step = nextStep();
      if (!step) return confirmStep();
      if (step.spendStep) return paintSpend(step, m);
      const chosen = Array.isArray(picks[step.id]) ? picks[step.id] : [];
      // A multi-pick step marks what is already taken and counts down,
      // so "pick 3" is a visible three rather than a remembered one.
      const options = step.options.map((o) => {
        const taken = chosen.indexOf(o.value) !== -1;
        return {
          html: (taken ? '<span class="w-ok">✓ </span>' : "") + o.html,
          meta: o.meta,
          tone: taken ? "opt-on" : "",
        };
      });
      const remaining = step.multi > 0 ? step.multi - chosen.length : null;
      MJ.decide.open({
        title: "BUILD YOUR RUNNER",
        subtitle: dim(step.sub) +
          (remaining !== null ? " " + num(remaining) + dim(" left to pick") : ""),
        present: picksPanel(picks, m),
        transcript: [],
        heading: nm(step.ask) +
          '<div class="ask">' +
          (step.multi === -1
            ? "As many as you like — their spark and their training decide how many stick."
            : step.multi > 0 ? "Choose " + step.multi + "."
            : "Choose one.") + "</div>",
        options: options,
        actions: [
          history.length ? { id: "back", label: "back" } : null,
          step.multi === -1 ? { id: "doneMulti", label: "that's the book", tone: "warn-btn" } : null,
          { id: "cancel", label: "cancel" },
        ].filter(Boolean),
        onChoose: (opt, i) => {
          const value = step.options[i].value;
          if (step.multi) {
            const cur = Array.isArray(picks[step.id]) ? picks[step.id].slice() : [];
            const at = cur.indexOf(value);
            if (at !== -1) cur.splice(at, 1);
            else if (step.multi === -1 || cur.length < step.multi) cur.push(value);
            step.set(cur);
          } else {
            history.push(step.id);
            step.set(value);
          }
          paint();
        },
        onAction: (id) => {
          if (id === "cancel") return cancel();
          if (id === "doneMulti") { if (!picks[step.id]) step.set([]); return paint(); }
          if (id === "back") {
            const last = history.pop();
            if (last) delete picks[last];
            paint();
          }
        },
      });
    }

    // ── Spending a purse ───────────────────────────────────────────
    // Left-click buys one, and a bought row can be sold back from the
    // action bar. Rows show base → bought so the player can see the
    // metatype's own floor underneath what they are adding, which is
    // the whole reason the ork and the elf are different characters.
    function paintSpend(step, m) {
      const put = buy[step.ledger];
      const rows = step.rowsFor();
      const left = step.left();
      const options = rows.map((r) => {
        const bought = put[r.value] || 0;
        const at = r.base + bought;
        const full = at >= r.cap;
        return {
          html: nm(r.label) + " " + num(at) +
            (r.base ? dim(" (" + r.base + " + " + bought + ")") : bought ? dim(" (+" + bought + ")") : ""),
          meta: full ? dim("at the cap for this build")
            : left <= 0 ? dim("nothing left to spend")
            : dim("costs 1 · cap " + r.cap),
          tone: bought ? "opt-on" : "",
          dead: full || left <= 0,
        };
      });
      MJ.decide.open({
        title: "BUILD YOUR RUNNER",
        subtitle: dim(step.sub) + " · " + num(left) + dim(" of " + step.budget + " left"),
        present: picksPanel(picks, m),
        transcript: [],
        heading: nm(step.ask) +
          '<div class="ask">' + num(left) + " to spend. " +
          dim("Nothing is committed until you sign — take points back with “undo a point”.") + "</div>",
        options: options,
        actions: [
          Object.keys(put).some((k) => put[k]) ? { id: "undo", label: "undo a point" } : null,
          history.length ? { id: "back", label: "back" } : null,
          { id: "cancel", label: "cancel" },
        ].filter(Boolean),
        onChoose: (opt, i) => {
          const r = rows[i];
          if (!r || step.left() <= 0) return;
          if (r.base + (put[r.value] || 0) >= r.cap) return;
          put[r.value] = (put[r.value] || 0) + 1;
          paint();
        },
        onAction: (id) => {
          if (id === "cancel") return cancel();
          if (id === "back") {
            const last = history.pop();
            if (last) delete picks[last];
            return paint();
          }
          if (id === "undo") {
            // Hand back the last thing bought in THIS purse.
            const mine = rows.map((x) => x.value).filter((v) => put[v]);
            const giveBack = mine[mine.length - 1];
            if (giveBack) { put[giveBack] -= 1; if (!put[giveBack]) delete put[giveBack]; }
            return paint();
          }
        },
      });
    }

    // ── The sheet, and the last chance to change it ───────────────
    // NO RE-ROLL BUTTON, on purpose. The pool and the band rolls are
    // seeded off the universe, so this runner IS this universe's
    // answer to these picks — pressing the button again hands back the
    // same person. Fishing for a good pool would make creation a slot
    // machine, which is the same reason a market refresh costs money.
    // THE SPEC IS THE PICKS PLUS THE PURSES. Assembled in one place so
    // the preview and the signed runner cannot be built from different
    // inputs — the sheet on screen IS the runner.
    function spec() {
      return Object.assign({}, picks, {
        starter: { attributes: buy.attributes, skills: buy.skills },
      });
    }

    function confirmStep() {
      const runner = MJ.createRunner(seed, spec());
      MJ.decide.open({
        title: "BUILD YOUR RUNNER",
        subtitle: dim("this is who that makes — nothing is hidden behind the button"),
        present: picksPanel(picks, menuNow()),
        result: sheet(runner),
        transcript: [],
        heading: nm("Sign them?") +
          '<div class="ask">Permanent, no fee, and as killable as anyone else.</div>',
        options: [],
        side: false,
        actions: [
          { id: "back", label: "change something" },
          { id: "cancel", label: "cancel" },
          { id: "sign", label: "sign the contract", tone: "warn-btn" },
        ],
        onAction: (id) => {
          if (id === "cancel") return cancel();
          if (id === "back") {
            const last = history.pop();
            if (last) delete picks[last];
            return paint();
          }
          MJ.decide.close();
          opts.onDone && opts.onDone(runner, spec());
        },
      });
    }

    function cancel() {
      MJ.decide.close();
      opts.onCancel && opts.onCancel();
    }

    paint();
  }

  MJ.characterCreation = { open: open };
})();
