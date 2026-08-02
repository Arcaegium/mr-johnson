/* ============================================================
   Mr. Johnson — game-ui.js
   The v0 shell's renderer: draws a session, forwards clicks to
   MJ.game commands, re-renders. Deliberately ugly, text-first —
   this exists to answer "is the roster loop fun," not to be the
   §10 hub console. All game logic lives in game.js; this file
   only reads session state and calls commands.
   ============================================================ */
(function () {
  let S = null; // the running session
  let wipeChecks = false; // set when a new day (or game) starts — crew selections reset to a clean slate

  const $ = (id) => document.getElementById(id);

  // ── Formatting helpers ──────────────────────────────────────────
  function fmtAxis(v) {
    return v.confirmed
      ? `<span class="good">${v.confirmed.value}✓${v.confirmed.fresh ? "" : "<span class=\"warn\">stale</span>"}</span>`
      : `<span class="muted">~${v.estimated}</span>`;
  }

  function fmtContract(runner) {
    const m = runner.market;
    if (m.phase === "kia") return '<span class="warn">KIA</span>';
    if (m.hired) {
      const left = m.hired.missionsRemaining === Infinity ? "∞" : m.hired.missionsRemaining;
      return `<span class="good">${m.hired.tier} (${left} left)</span>`;
    }
    // The clock is visible by design (user ruling): pick-or-pass is
    // only a decision if you can see how long you have to decide.
    if (m.phase === "available") return `<span class="muted">available — ${m.shelfDaysRemaining}d before the cycle rolls</span>`;
    if (m.phase === "working" || m.phase === "outOfTown") return `<span class="muted">${m.phase} — back in ~${m.shelfDaysRemaining}d</span>`;
    return `<span class="muted">${m.phase || "unwatched"}</span>`;
  }

  // ── The dispatch builder: Location -> Action (user spec) ────────
  function siteTag(site) {
    return `#${site.identity.universeIndex} ${site.identity.district} (${site.identity.owningFaction})`;
  }

  function siteHasOpenJob(site) {
    return S.jobs.some((j) => !j.paid && !j.expired && j.missions.some((m) => !m.resolved && m.site === site));
  }

  function locationOptions() {
    const opts = [
      { v: "hub", label: "The Hub — craft & Medicae" },
      { v: "streets", label: "The Streets — search for sites" },
    ];
    S.knownSites.forEach((site, i) => {
      opts.push({ v: "site:" + i, label: siteTag(site), job: siteHasOpenJob(site) });
    });
    return opts;
  }

  function actionOptions(locValue) {
    const acts = [];
    if (locValue === "hub") {
      for (const id of Object.keys(MJ.ITEM_TEMPLATES)) {
        const t = MJ.ITEM_TEMPLATES[id];
        if (t.category === "cyberware") continue; // buy-only in v1
        acts.push({ v: "craft:" + id, label: `Craft — ${t.label} (T${t.tier}, ${t.craftSkill})` });
      }
      S.roster.forEach((r, i) => {
        if (r.wounds > 0 && r.market.hired) acts.push({ v: "treat:" + i, label: `Medicae — treat ${r.identity.handle} (${r.wounds} wound${r.wounds > 1 ? "s" : ""})` });
      });
    } else if (locValue === "streets") {
      acts.push({ v: "search:scrap", label: "Search — scrap yard" });
      acts.push({ v: "search:reagents", label: "Search — reagent grove" });
    } else {
      const site = S.knownSites[+locValue.split(":")[1]];
      S.jobs.forEach((job, jI) => {
        if (job.paid || job.expired) return;
        job.missions.forEach((m, k) => {
          if (m.resolved || m.site !== site) return;
          const gated = !!(m.requiresMission && !m.requiresMission.resolved);
          acts.push({
            v: `run:${jI}:${k}`,
            label: `Run — Job #${job.contractNumber} leg ${k + 1}: ${MJ.OBJECTIVE_VERBS[m.objectiveVerb].label} (${m.payloadDomain})${gated ? " [GATED]" : ""}`,
            disabled: gated,
          });
        });
      });
      for (const lens of MJ.RECON_LENSES) acts.push({ v: "recon:" + lens, label: "Recon — " + lens });
      if (site.tags.some((t) => String(t.tag).indexOf("resource:") === 0)) acts.push({ v: "harvest", label: "Harvest resources" });
    }
    return acts;
  }

  function buildFromSelectors() {
    const loc = $("site-select") ? $("site-select").value : null;
    const act = $("action-select") ? $("action-select").value : null;
    if (!loc || !act) return null;
    if (loc === "hub") {
      if (act.indexOf("craft:") === 0) {
        const tpl = act.split(":")[1];
        return { mission: MJ.createCraftingMission(tpl), label: "craft " + MJ.ITEM_TEMPLATES[tpl].label };
      }
      if (act.indexOf("treat:") === 0) {
        const p = S.roster[+act.split(":")[1]];
        return { mission: MJ.createMedicalMission(p), label: "treat " + p.identity.handle };
      }
      return null;
    }
    if (loc === "streets" && act.indexOf("search:") === 0) {
      const kind = act.split(":")[1];
      return { mission: MJ.game.makeSearchMission(S, kind), label: "search: " + kind };
    }
    const site = S.knownSites[+loc.split(":")[1]];
    if (!site) return null;
    if (act.indexOf("run:") === 0) {
      const parts = act.split(":");
      const job = S.jobs[+parts[1]];
      const m = job.missions[+parts[2]];
      return { mission: m, label: `Job #${job.contractNumber} leg ${+parts[2] + 1} @ ${siteTag(site)}` };
    }
    if (act.indexOf("recon:") === 0) {
      const lens = act.split(":")[1];
      return { mission: MJ.createReconMission(site, lens), label: `recon ${lens} @ ${siteTag(site)}` };
    }
    if (act === "harvest") return { mission: MJ.createResourceMission(site), label: `harvest @ ${siteTag(site)}` };
    return null;
  }

  // ── Panel renderers ─────────────────────────────────────────────
  function renderStat() {
    if (!S) { $("statline").textContent = "No game running — enter a seed (or leave blank) and hit New Game."; return; }
    const j = S.save.johnson;
    $("statline").textContent =
      `Day ${S.day}   ¥${j.money}   Reputation ${j.reputation}   Capacity ${j.boardCapacity}   Universe "${S.universeSeed}"`;
  }

  function renderBoard() {
    if (S.board.length === 0) { $("panel-board").innerHTML = '<span class="muted">No offers — refresh the board.</span>'; return; }
    $("panel-board").innerHTML = S.board.map((entry, i) => {
      const job = entry.job;
      const legs = job.missions.map((m, k) => {
        const v = MJ.siteIntelView(m.site, S.day);
        const gated = m.requiresMission ? ` <span class="gated">[gated by leg ${job.missions.indexOf(m.requiresMission) + 1}]</span>` : "";
        return `<div class="muted">leg ${k + 1}: ${MJ.OBJECTIVE_VERBS[m.objectiveVerb].label} (${m.payloadDomain}) @ ${siteTag(m.site)}${gated}<br>&nbsp;&nbsp;est P:${fmtAxis(v.physical)} A:${fmtAxis(v.astral)} M:${fmtAxis(v.matrix)}</div>`;
      }).join("");
      return `<div class="card"><div class="head">${job.hiringFaction} — ¥${job.pay} <span class="muted">(rush x${job.rushMultiplier.toFixed(2)}, ${job.daysPerMission}d/leg, expires day ${job.expiryDay})</span>${job.chained ? ' <span class="warn">CHAINED</span>' : ""}</div>${legs}<button class="sm" data-act="accept" data-idx="${i}">Accept</button></div>`;
    }).join("");
  }

  // The full VISIBLE dossier — design-legal by §04's own pricing
  // rule: skills are always visible and true; only the Discipline
  // label (the market's claim) can be wrong. Reading the spread
  // against the label is how hype and hidden gems get spotted.
  function runnerCard(r) {
    const a = r.attributes;
    const c = r.classification;
    // Effective at read time (§09): base + implants − wounds — the
    // dossier shows what they can actually do today.
    const eff = MJ.getEffectiveSkills(r);
    const skills = Object.entries(eff)
      .filter(([, v]) => v > 0)
      .sort((x, y) => y[1] - x[1])
      .map(([k, v]) => `${k}:${v}`)
      .join("  ");
    // Class first, in teal ("Enchanting Mage"); the market's
    // Generalist/Specialist claim follows in gray (user ruling).
    // "Rigger rigger" / "Face face" guard: when the focus label IS
    // the family, say it once.
    const famNoun = c.family.charAt(0).toUpperCase() + c.family.slice(1);
    const trade = c.focusLabel.toLowerCase() === c.family.toLowerCase()
      ? famNoun
      : `${c.focusLabel} ${famNoun}`;
    const kit = [
      ...(r.gear || []).map((g) => g.label + " T" + g.tier),
      ...(r.implants || []).map((im) => "⟨" + im.label + "⟩"),
    ];
    return `<b>${r.identity.handle}</b> — <span class="good">${trade}</span> <span class="muted">· ${MJ.describeDiscipline(r)} · ${r.identity.metatypeLabel}, ${c.origin}${c.deckerAffinity ? " · " + c.deckerAffinity : ""}</span><br>` +
      `<span class="muted">B${a.body} A${a.agility} W${a.willpower} I${a.intelligence} C${a.charisma}${a.magic ? " M" + a.magic : ""} · ess ${a.magic || c.origin === "cyber" ? r.essence.current + "/" + r.essence.max : r.essence.current}</span><br>` +
      `<span class="muted">${skills || "no visible skills"}</span>` +
      (kit.length ? `<br><span class="muted">kit: ${kit.join(", ")}</span>` : "");
  }

  function rosterRow(r, i) {
    const btns = [];
    if (MJ.isHireable(r)) {
      for (const t of ["freelance", "retainer", "permanent"]) {
        btns.push(`<button class="sm" data-act="hire" data-ridx="${i}" data-tier="${t}">${t} ¥${MJ.hireCost(r, t)}</button>`);
      }
    }
    if (r.market.hired) btns.push(`<button class="sm" data-act="release" data-ridx="${i}">release</button>`);
    else btns.push(`<button class="sm" data-act="unwatch" data-ridx="${i}">${r.market.phase === "kia" ? "strike from list" : "unwatch"}</button>`);
    return `<div class="row">${runnerCard(r)}<br>` +
      `<span class="muted">karma ${r.karma}  wounds ${r.wounds}  </span>${fmtContract(r)}<br>${btns.join(" ")}</div>`;
  }

  // Crew and watch list are different groups with different caps
  // (user ruling): hiring is commitment, watching is scouting.
  function renderRoster() {
    const cap = S.save.johnson.boardCapacity;
    const crew = [];
    const watchOnly = [];
    S.roster.forEach((r, i) => (r.market.hired ? crew : watchOnly).push({ r: r, i: i }));
    $("panel-roster").innerHTML =
      `<div class="good">CREW — ${crew.length}/${cap} hired</div>` +
      (crew.map((x) => rosterRow(x.r, x.i)).join("") || '<div class="row muted">nobody under contract</div>') +
      `<div class="good" style="margin-top:10px">WATCH LIST — ${S.roster.length}/${MJ.game.watchCapacity(S)} watched in total</div>` +
      (watchOnly.map((x) => rosterRow(x.r, x.i)).join("") || '<div class="row muted">nobody on watch</div>');
  }

  function renderContracts() {
    const active = S.jobs.filter((j) => !j.paid && !j.expired);
    const done = S.jobs.filter((j) => j.paid || j.expired);
    const legLine = (job, m, k) => {
      const status = m.resolved ? '<span class="good">✓ done</span>'
        : (m.requiresMission && !m.requiresMission.resolved) ? `<span class="gated">gated by leg ${job.missions.indexOf(m.requiresMission) + 1}</span>`
        : '<span class="warn">open</span>';
      return `<div class="muted">leg ${k + 1}: ${MJ.OBJECTIVE_VERBS[m.objectiveVerb].label} (${m.payloadDomain}) @ ${siteTag(m.site)} — ${status}</div>`;
    };
    const activeHtml = active.map((job) => {
      const daysLeft = job.expiryDay - S.day;
      return `<div class="card"><div class="head">Job #${job.contractNumber} — ${job.hiringFaction} — ¥${job.pay} <span class="${daysLeft <= 1 ? "warn" : "muted"}">(expires day ${job.expiryDay} — ${daysLeft} day${daysLeft === 1 ? "" : "s"} left)</span>${job.chained ? ' <span class="warn">CHAINED</span>' : ""}</div>` +
        job.missions.map((m, k) => legLine(job, m, k)).join("") + `</div>`;
    }).join("");
    const doneHtml = done.map((job) =>
      `<div class="muted">${job.paid ? '<span class="good">✓</span> Job #' + job.contractNumber + " — " + job.hiringFaction + " paid ¥" + job.pay : '<span class="warn">✗</span> Job #' + job.contractNumber + " — " + job.hiringFaction + " — window closed unfinished"}</div>`
    ).join("");
    $("panel-contracts").innerHTML =
      (activeHtml || '<span class="muted">No active contracts — accept something off the board.</span>') +
      (doneHtml ? `<div style="margin-top:8px">${doneHtml}</div>` : "");
  }

  function renderMarket() {
    $("panel-market").innerHTML = S.market.map((r, i) =>
      `<div class="row">${runnerCard(r)}<br>` +
      `<span class="muted">asking ¥${MJ.hireCost(r, "freelance")}/mission (retainer ¥${MJ.hireCost(r, "retainer")}, permanent ¥${MJ.hireCost(r, "permanent")}) · <span class="warn">leaves in ${r.market.shelfDaysRemaining}d</span></span> ` +
      `<button class="sm" data-act="watch-market" data-idx="${i}">watch</button></div>`
    ).join("") || '<span class="muted">Market is empty (impossible — report this).</span>';
  }

  // A permanent reference list (user ruling — no watch/unwatch
  // here): once you've been, it exists and can be gone back to.
  // Sites related to an accepted contract show "target [N]" so a
  // job's sites self-identify as a set (user ruling).
  function targetMarks(site) {
    const nums = S.jobs
      .filter((j) => !j.paid && !j.expired && j.missions.some((m) => m.site === site))
      .map((j) => "[" + j.contractNumber + "]");
    return nums.length ? ` <span class="warn">target ${nums.join("")}</span>` : "";
  }

  function renderSites() {
    if (S.knownSites.length === 0) { $("panel-sites").innerHTML = '<span class="muted">No known sites — accept a job or search for one.</span>'; return; }
    $("panel-sites").innerHTML = MJ.siteListView(S.knownSites, S.day).map((row, i) => {
      const site = S.knownSites[i];
      return `<div class="row">#${row.universeIndex} <b>${row.district}</b> (${row.owningFaction}) v:${row.value} ${row.orientation} <span class="muted">via ${row.source} d${row.dayKnown}</span>${targetMarks(site)}<br>` +
        `P:${fmtAxis(row.security.physical)} A:${fmtAxis(row.security.astral)} M:${fmtAxis(row.security.matrix)}` +
        (row.tags.length ? ` <span class="muted">[${row.tags.join(", ")}]</span>` : "") + `</div>`;
    }).join("");
  }

  function renderDispatch() {
    const prevLoc = $("site-select") ? $("site-select").value : null;
    const prevAct = $("action-select") ? $("action-select").value : null;
    const prevCrew = wipeChecks
      ? new Set()
      : new Set(Array.from(document.querySelectorAll(".crew-check:checked")).map((c) => c.dataset.ridx));
    wipeChecks = false;

    const locs = locationOptions();
    const locSel = prevLoc && locs.some((o) => o.v === prevLoc) ? prevLoc : locs[0].v;
    const locHtml = locs.map((o) =>
      `<option value="${o.v}"${o.v === locSel ? " selected" : ""}${o.job ? ' class="jobopt"' : ""}>${o.job ? "⚑ " : ""}${o.label}</option>`).join("");

    const acts = actionOptions(locSel);
    const usable = acts.filter((a) => !a.disabled);
    const actSel = prevAct && usable.some((a) => a.v === prevAct) ? prevAct : (usable[0] || {}).v;
    const actHtml = acts.map((a) =>
      `<option value="${a.v}"${a.v === actSel ? " selected" : ""}${a.disabled ? " disabled" : ""}>${a.label}</option>`).join("");

    const committed = new Set();
    for (const q of S.queue) {
      for (const r of q.runners) committed.add(r);
      if (q.mission.patient) committed.add(q.mission.patient);
    }
    const dispatchable = S.roster.map((r, i) => ({ r, i })).filter((x) => MJ.isDispatchable(x.r));
    // Assigned runners stay visibly checked but "turned off" until
    // their dispatch is canceled or the day ends (user spec).
    const checks = dispatchable.map((x) =>
      committed.has(x.r)
        ? `<label class="muted"><input type="checkbox" checked disabled> ${x.r.identity.handle} (queued)</label>`
        : `<label><input type="checkbox" class="crew-check" data-ridx="${x.i}"${prevCrew.has(String(x.i)) ? " checked" : ""}> ${x.r.identity.handle}</label>`).join("");
    const queue = S.queue.map((q, i) =>
      `<div class="queue-item"><span class="muted">${i + 1}.</span> ${q.label} <span class="muted">[${q.runners.map((r) => r.identity.handle).join(", ")}]</span>` +
      ` <button class="sm" data-act="queue-up" data-idx="${i}">↑</button><button class="sm" data-act="queue-down" data-idx="${i}">↓</button><button class="sm" data-act="queue-del" data-idx="${i}">✕</button></div>`).join("");
    // Yesterday's plays, each individually requeue-able — the repeat
    // unit is the single dispatch once operations run in parallel.
    const yesterday = (S.lastPlan || []).map((p, i) =>
      `<div class="queue-item muted">${p.label} [${p.runners.map((r) => r.identity.handle).join(", ")}] <button class="sm" data-act="repeat-one" data-idx="${i}">requeue</button></div>`).join("");
    $("panel-dispatch").innerHTML =
      `<div><select id="site-select">${locHtml}</select></div>` +
      `<div style="margin-top:6px"><select id="action-select">${actHtml || "<option disabled>nothing to do here</option>"}</select></div>` +
      `<div class="checks" style="margin:8px 0">${checks || '<span class="muted">no dispatchable runners — hire someone (a dispatch is what a contract buys)</span>'}</div>` +
      `<button class="sm" data-act="queue-add">Add to Queue</button>` +
      `<div style="margin-top:10px">${queue || '<span class="muted">Queue is empty — End Day will just tick the world.</span>'}</div>` +
      (yesterday ? `<div class="good" style="margin-top:10px">YESTERDAY'S PLAN</div>${yesterday}<button class="sm" data-act="repeat-plan">requeue all</button>` : "") +
      `<div class="muted" style="margin-top:6px">Queue resolves top-to-bottom, one action per runner per day. Recon first pays: fresh intel = +1 die at that site.</div>`;
  }

  // ── The armory: the operation's second roster ───────────────────
  function renderArmory() {
    const items = S.save.armory.items;
    const crew = S.roster.map((r, i) => ({ r: r, i: i })).filter((x) => x.r.market.hired);
    const crewOpts = crew.map((x) => `<option value="${x.i}">${x.r.identity.handle}</option>`).join("");
    const rows = items.map((item, i) => {
      const t = MJ.ITEM_TEMPLATES[item.templateId];
      const isCyber = t.category === "cyberware";
      const effect = isCyber
        ? Object.entries(t.skillMods).map(([k, v]) => `+${v} ${k}`).join(", ") + ` · −${t.essenceCost} ess`
        : `+${MJ.gearBonusForTier(item.tier)}d ${t.skill}`;
      const holder = item.issuedTo ? ` — <span class="good">with ${item.issuedTo.identity.handle}</span>` : ' — <span class="muted">in storage</span>';
      const controls = crew.length
        ? (isCyber
            ? `<select class="armory-sel" data-item="${i}">${crewOpts}</select> <button class="sm" data-act="implant-item" data-idx="${i}">implant</button>`
            : `<select class="armory-sel" data-item="${i}">${crewOpts}</select> <button class="sm" data-act="issue-item" data-idx="${i}">issue</button>` +
              (item.issuedTo ? ` <button class="sm" data-act="reclaim-item" data-idx="${i}">reclaim</button>` : ""))
        : '<span class="muted">hire someone first</span>';
      const sell = !item.issuedTo ? ` <button class="sm" data-act="sell-item" data-idx="${i}">sell ¥${Math.round(MJ.itemCost(item.templateId) * 0.4)}</button>` : "";
      return `<div class="row">${item.label} (T${item.tier}) <span class="muted">${effect}</span>${holder}<br>${controls}${sell}</div>`;
    }).join("") || '<span class="muted">The racks are empty — buy below, or craft at the Hub.</span>';
    const mats = Object.entries(S.save.armory.materials || {}).filter(([, n]) => n > 0).map(([k, n]) =>
      `<div class="row">${k.replace("resource:", "")} x${n} <button class="sm" data-act="sell-mats" data-kind="${k}">sell all</button></div>`).join("");
    const shop = Object.keys(MJ.ITEM_TEMPLATES).map((id) => {
      const t = MJ.ITEM_TEMPLATES[id];
      const effect = t.category === "cyberware"
        ? Object.entries(t.skillMods).map(([k, v]) => `+${v} ${k}`).join(", ") + `, −${t.essenceCost} ess (implant)`
        : `+${MJ.gearBonusForTier(t.tier)}d ${t.skill}`;
      return `<button class="sm" data-act="buy-item" data-tpl="${id}" title="${effect}">${t.label} ¥${MJ.itemCost(id)}</button>`;
    }).join(" ");
    $("panel-armory").innerHTML = rows +
      (mats ? `<div class="good" style="margin-top:8px">MATERIALS</div>${mats}` : "") +
      `<div class="good" style="margin-top:8px">GEAR SHOP <span class="muted" style="text-transform:none;letter-spacing:0">(hover for effect)</span></div><div style="line-height:2.4">${shop}</div>`;
  }

  function renderLog() {
    const el = $("panel-log");
    el.textContent = S.log.slice(-80).join("\n");
    el.scrollTop = el.scrollHeight;
  }

  function render() {
    renderStat();
    if (!S) return;
    renderBoard();
    renderContracts();
    renderRoster();
    renderMarket();
    renderArmory();
    renderSites();
    renderDispatch();
    renderLog();
  }

  // ── Actions ─────────────────────────────────────────────────────
  function act(action, el) {
    if (action === "new-game") {
      const seed = $("universe-seed").value.trim();
      S = MJ.game.newGame(seed || undefined);
      MJ.game.refreshBoard(S);
      wipeChecks = true;
      render();
      return;
    }
    if (!S) { $("statline").textContent = "Start a New Game first."; return; }
    const idx = el && el.dataset.idx !== undefined ? +el.dataset.idx : -1;
    if (action === "refresh-board") MJ.game.refreshBoard(S);
    else if (action === "refresh-market") MJ.game.refreshMarket(S);
    else if (action === "expand-capacity") MJ.game.expandCapacity(S);
    else if (action === "end-day") { MJ.game.endDay(S); wipeChecks = true; }
    else if (action === "accept") MJ.game.acceptJob(S, idx);
    else if (action === "watch-market") MJ.game.watchFromMarket(S, idx);
    else if (action === "hire") MJ.game.hire(S, S.roster[+el.dataset.ridx], el.dataset.tier);
    else if (action === "release") MJ.game.release(S, S.roster[+el.dataset.ridx]);
    else if (action === "unwatch") MJ.game.unwatch(S, S.roster[+el.dataset.ridx]);
    else if (action === "repeat-plan") MJ.game.repeatLastPlan(S);
    else if (action === "repeat-one") MJ.game.repeatOne(S, idx);
    else if (action === "buy-item") MJ.game.buyGear(S, el.dataset.tpl);
    else if (action === "sell-item") MJ.game.sellGear(S, S.save.armory.items[idx]);
    else if (action === "reclaim-item") MJ.game.issueGear(S, S.save.armory.items[idx], null);
    else if (action === "issue-item" || action === "implant-item") {
      const sel = document.querySelector('.armory-sel[data-item="' + idx + '"]');
      const runner = sel && sel.value !== "" ? S.roster[+sel.value] : null;
      if (runner) {
        if (action === "issue-item") MJ.game.issueGear(S, S.save.armory.items[idx], runner);
        else MJ.game.implantGear(S, S.save.armory.items[idx], runner);
      }
    }
    else if (action === "sell-mats") MJ.game.sellStock(S, el.dataset.kind);
    else if (action === "queue-up") MJ.game.moveQueued(S, idx, -1);
    else if (action === "queue-down") MJ.game.moveQueued(S, idx, 1);
    else if (action === "queue-del") MJ.game.unqueue(S, idx);
    else if (action === "queue-add") {
      const built = buildFromSelectors();
      if (!built) return;
      const crew = Array.from(document.querySelectorAll(".crew-check:checked")).map((c) => S.roster[+c.dataset.ridx]);
      const res = MJ.game.queueDispatch(S, built.mission, crew, built.label);
      if (!res.ok) S.log.push("day " + S.day + ": can't queue — " + res.error);
    }
    render();
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (el) act(el.dataset.act, el);
  });

  // Changing the location re-derives the action list for it.
  document.addEventListener("change", (e) => {
    if (e.target && e.target.id === "site-select") render();
  });

  window.addEventListener("DOMContentLoaded", render);
})();
