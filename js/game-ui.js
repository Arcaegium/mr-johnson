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
    const idx = site.identity.universeIndex !== undefined ? `#${site.identity.universeIndex} ` : "";
    return `${idx}${site.identity.district} (${site.identity.owningFaction})`;
  }

  // The full leg line, board and contracts alike (user ruling: the
  // leg itself reads in teal, the location's NAME in white; no
  // information is lost moving from the board to an active job).
  function legLineFull(job, m, k, withStatus) {
    const v = MJ.siteIntelView(m.site, S.day);
    const gated = m.requiresMission && !m.requiresMission.resolved
      ? ` <span class="gated">[gated by leg ${job.missions.indexOf(m.requiresMission) + 1}]</span>` : "";
    const status = !withStatus ? "" : m.resolved ? ' — <span class="ink">✓ done</span>'
      : (m.requiresMission && !m.requiresMission.resolved) ? "" : ' — <span class="warn">open</span>';
    return `<div class="good">leg ${k + 1}: ${MJ.OBJECTIVE_VERBS[m.objectiveVerb].label} (${m.payloadDomain}) @ ${siteTag(m.site)}${gated}${status}<br>` +
      (m.site.identity.name ? `&nbsp;&nbsp;<span class="ink">"${m.site.identity.name}"</span>${m.site.identity.theme ? ` <span class="muted">· ${m.site.identity.theme}</span>` : ""}<br>` : "") +
      `&nbsp;&nbsp;<span class="muted">est P:${fmtAxis(v.physical)} A:${fmtAxis(v.astral)} M:${fmtAxis(v.matrix)}</span></div>`;
  }

  function siteHasOpenJob(site) {
    return S.jobs.some((j) => !j.paid && !j.expired && j.missions.some((m) => !m.resolved && m.site === site));
  }

  // Three-stage builder (user spec): choose the ACTIVITY (Craft /
  // Medicae / Search / a known site), then the discipline or action,
  // then — for crafting — the item within that discipline. Programs
  // and spells with player-tuned creation variables are a future
  // category of their own (flagged).
  function activityOptions() {
    const opts = [
      { v: "craft", label: "Craft" },
      { v: "medicae", label: "Medicae" },
      { v: "search", label: "Search" },
    ];
    S.knownSites.forEach((site, i) => {
      opts.push({ v: "site:" + i, label: siteTag(site), job: siteHasOpenJob(site) });
    });
    return opts;
  }

  function craftDisciplines() {
    const skills = [];
    for (const id of Object.keys(MJ.ITEM_TEMPLATES)) {
      const t = MJ.ITEM_TEMPLATES[id];
      if (t.category === "cyberware" || !t.craftSkill) continue;
      if (skills.indexOf(t.craftSkill) === -1) skills.push(t.craftSkill);
    }
    return skills;
  }

  function actionOptions(activity) {
    const acts = [];
    if (activity === "craft") {
      for (const skill of craftDisciplines()) acts.push({ v: skill, label: skill });
    } else if (activity === "medicae") {
      S.roster.forEach((r, i) => {
        if (r.wounds > 0 && r.market.hired) acts.push({ v: "treat:" + i, label: `treat ${r.identity.handle} (${r.wounds} wound${r.wounds > 1 ? "s" : ""})` });
      });
    } else if (activity === "search") {
      acts.push({ v: "search:scrap", label: "scrap yard" });
      acts.push({ v: "search:reagents", label: "reagent grove" });
    } else {
      const site = S.knownSites[+activity.split(":")[1]];
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

  function itemOptions(activity, action) {
    if (activity !== "craft" || !action) return [];
    return Object.keys(MJ.ITEM_TEMPLATES)
      .filter((id) => {
        const t = MJ.ITEM_TEMPLATES[id];
        return t.category !== "cyberware" && t.craftSkill === action;
      })
      .map((id) => ({ v: id, label: `${MJ.ITEM_TEMPLATES[id].label} (T${MJ.ITEM_TEMPLATES[id].tier})` }));
  }

  function buildFromSelectors() {
    const activity = $("site-select") ? $("site-select").value : null;
    const act = $("action-select") ? $("action-select").value : null;
    if (!activity || !act) return null;
    if (activity === "craft") {
      const itemSel = $("item-select");
      const tpl = itemSel ? itemSel.value : null;
      if (!tpl || !MJ.ITEM_TEMPLATES[tpl]) return null;
      return { mission: MJ.createCraftingMission(tpl), label: "craft " + MJ.ITEM_TEMPLATES[tpl].label };
    }
    if (activity === "medicae") {
      if (act.indexOf("treat:") !== 0) return null;
      const p = S.roster[+act.split(":")[1]];
      return { mission: MJ.createMedicalMission(p), label: "treat " + p.identity.handle };
    }
    if (activity === "search") {
      const kind = act.split(":")[1];
      return { mission: MJ.game.makeSearchMission(S, kind), label: "search: " + kind };
    }
    const site = S.knownSites[+activity.split(":")[1]];
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
  // The statline stays in the header for messages; the HUD is the
  // same four numbers pinned to the right rail, so the day's money
  // and capacity stay readable while you scroll a long log.
  function renderStat() {
    const hud = $("hud");
    if (!S) {
      $("statline").textContent = "No game running — enter a seed (or leave blank) and hit New Game.";
      if (hud) hud.innerHTML = "";
      return;
    }
    const j = S.save.johnson;
    $("statline").textContent = `Universe "${S.universeSeed}"`;
    if (!hud) return;
    hud.innerHTML =
      `<div class="hud-row"><span class="hud-k">Day</span><b class="w-num">${S.day}</b></div>` +
      `<div class="hud-row"><span class="hud-k">Nuyen</span><b class="w-num">¥${j.money}</b></div>` +
      `<div class="hud-row"><span class="hud-k">Rep</span><b class="w-num">${j.reputation}</b></div>` +
      `<div class="hud-row"><span class="hud-k">Capacity</span><b class="w-num">${j.boardCapacity}</b></div>`;
  }

  function renderBoard() {
    if (S.board.length === 0) { $("panel-board").innerHTML = '<span class="muted">No offers — refresh the board.</span>'; return; }
    $("panel-board").innerHTML = S.board.map((entry, i) => {
      const job = entry.job;
      const legs = job.missions.map((m, k) => legLineFull(job, m, k)).join("");
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
    return `<b>${r.identity.handle}</b> — <span class="good">${trade}</span> <span class="muted">· ${MJ.describeDiscipline(r)} · ${r.identity.metatypeLabel}, ${c.origin}${c.deckerAffinity ? " · affinity: " + c.deckerAffinity : ""}</span><br>` +
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
    if (r.market.hired) {
      // Upgrades credit the unused block against today's price.
      for (const t of ["retainer", "permanent"]) {
        if (["freelance", "retainer", "permanent"].indexOf(t) > ["freelance", "retainer", "permanent"].indexOf(r.market.hired.tier)) {
          btns.push(`<button class="sm" data-act="upgrade" data-ridx="${i}" data-tier="${t}">upgrade→${t} ¥${MJ.upgradeCost(r, t)}</button>`);
        }
      }
      btns.push(`<button class="sm" data-act="release" data-ridx="${i}">release</button>`);
    }
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
    const activeHtml = active.map((job) => {
      const daysLeft = job.expiryDay - S.day;
      return `<div class="card"><div class="head">Job #${job.contractNumber} — ${job.hiringFaction} — ¥${job.pay} <span class="muted">(rush x${job.rushMultiplier.toFixed(2)}, ${job.daysPerMission}d/leg)</span> <span class="${daysLeft <= 1 ? "warn" : "muted"}">(expires day ${job.expiryDay} — ${daysLeft} day${daysLeft === 1 ? "" : "s"} left)</span>${job.chained ? ' <span class="warn">CHAINED</span>' : ""}</div>` +
        job.missions.map((m, k) => legLineFull(job, m, k, true)).join("") + `</div>`;
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
    const prevLookup = $("site-lookup") ? $("site-lookup").value : "";
    const lookup = `<div style="margin-bottom:8px"><input type="text" class="sm" id="site-lookup" placeholder="call in by key: Boldly-Crimson-Quiet-Bicycle-0417" value="${prevLookup.replace(/"/g, "")}" /> <button class="sm" data-act="discover-name">look up</button></div>`;
    if (S.knownSites.length === 0) { $("panel-sites").innerHTML = lookup + '<span class="muted">No known sites — accept a job, search, or call one in by name.</span>'; return; }
    $("panel-sites").innerHTML = lookup + MJ.siteListView(S.knownSites, S.day).map((row, i) => {
      const site = S.knownSites[i];
      return `<div class="row">${row.universeIndex !== null ? "#" + row.universeIndex + " " : ""}<b>${row.district}</b> (${row.owningFaction}) v:${row.value} ${row.orientation} <span class="muted">via ${row.source} d${row.dayKnown}</span>${targetMarks(site)}<br>` +
        (row.name ? `<span class="ink">"${row.name}"</span>${row.theme ? ` <span class="muted">· ${row.theme}</span>` : ""}<br>` : "") +
        `P:${fmtAxis(row.security.physical)} A:${fmtAxis(row.security.astral)} M:${fmtAxis(row.security.matrix)}` +
        (row.suppression ? ` <span class="warn">softened today${row.suppression.physical ? " P+" + row.suppression.physical : ""}${row.suppression.astral ? " A+" + row.suppression.astral : ""}</span>` : "") +
        (row.tags.length ? ` <span class="muted">[${row.tags.join(", ")}]</span>` : "") + `</div>`;
    }).join("");
  }

  function renderDispatch() {
    const prevLoc = $("site-select") ? $("site-select").value : null;
    const prevAct = $("action-select") ? $("action-select").value : null;
    const prevItem = $("item-select") ? $("item-select").value : null;
    const prevCrew = wipeChecks
      ? new Set()
      : new Set(Array.from(document.querySelectorAll(".crew-check:checked")).map((c) => c.dataset.ridx));
    wipeChecks = false;

    const locs = activityOptions();
    const locSel = prevLoc && locs.some((o) => o.v === prevLoc) ? prevLoc : locs[0].v;
    const locHtml = locs.map((o) =>
      `<option value="${o.v}"${o.v === locSel ? " selected" : ""}${o.job ? ' class="jobopt"' : ""}>${o.job ? "⚑ " : ""}${o.label}</option>`).join("");

    const acts = actionOptions(locSel);
    const usable = acts.filter((a) => !a.disabled);
    const actSel = prevAct && usable.some((a) => a.v === prevAct) ? prevAct : (usable[0] || {}).v;
    const actHtml = acts.map((a) =>
      `<option value="${a.v}"${a.v === actSel ? " selected" : ""}${a.disabled ? " disabled" : ""}>${a.label}</option>`).join("");

    const items = itemOptions(locSel, actSel);
    const itemSel = prevItem && items.some((o) => o.v === prevItem) ? prevItem : (items[0] || {}).v;
    const itemHtml = items.map((o) =>
      `<option value="${o.v}"${o.v === itemSel ? " selected" : ""}>${o.label}</option>`).join("");

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
      (items.length ? `<div style="margin-top:6px"><select id="item-select">${itemHtml}</select></div>` : "") +
      `<div class="checks" style="margin:8px 0">${checks || '<span class="muted">no dispatchable runners — hire someone (a dispatch is what a contract buys)</span>'}</div>` +
      `<button class="sm" data-act="queue-add">Add to Queue</button>` +
      `<div style="margin-top:10px">${queue || '<span class="muted">Queue is empty — End Day will just tick the world.</span>'}</div>` +
      (yesterday ? `<div class="good" style="margin-top:10px">YESTERDAY'S PLAN</div>${yesterday}<button class="sm" data-act="repeat-plan">requeue all</button>` : "") +
      `<div class="muted" style="margin-top:6px">Queue resolves top-to-bottom, one action per runner per day. Recon first pays: fresh intel = +1 die at that site.</div>`;
  }

  // ── The armory: the operation's second roster ───────────────────
  function itemEffectText(t) {
    if (t.category === "cyberware") return Object.entries(t.skillMods).map(([k, v]) => `+${v} ${k}`).join(", ") + ` · −${t.essenceCost} ess (implant)`;
    if (t.category === "armor") return `guards ${MJ.gearBonusForTier(t.tier)} wound(s)/mission`;
    if (t.category === "consumable") {
      return t.effect === "absorbWound"
        ? "absorbs a wound · single use"
        : `+${MJ.gearBonusForTier(t.tier)}d ${t.skill}, one roll · single use`;
    }
    if (t.category === "program") return `+${MJ.gearBonusForTier(t.tier)}d ${t.skill} (needs a deck)`;
    if (t.category === "formula") return `teaches ${t.spellCategory} spell (casting pending)`;
    return `+${MJ.gearBonusForTier(t.tier)}d ${t.skill}`;
  }

  function renderArmory() {
    const items = S.save.armory.items.filter((it) => !it.consumed);
    const crew = S.roster.map((r, i) => ({ r: r, i: i })).filter((x) => x.r.market.hired);
    const crewOpts = crew.map((x) => `<option value="${x.i}">${x.r.identity.handle}</option>`).join("");
    const mageOpts = crew.filter((x) => x.r.classification.family === "mage").map((x) => `<option value="${x.i}">${x.r.identity.handle}</option>`).join("");
    const rows = items.map((item) => {
      const i = S.save.armory.items.indexOf(item);
      const t = MJ.ITEM_TEMPLATES[item.templateId];
      const holder = item.issuedTo ? ` — <span class="good">with ${item.issuedTo.identity.handle}</span>` : ' — <span class="muted">in storage</span>';
      let controls;
      if (!crew.length) controls = '<span class="muted">hire someone first</span>';
      else if (t.category === "cyberware") controls = `<select class="armory-sel" data-item="${i}">${crewOpts}</select> <button class="sm" data-act="implant-item" data-idx="${i}">implant</button>`;
      else if (t.category === "formula") controls = mageOpts
        ? `<select class="armory-sel" data-item="${i}">${mageOpts}</select> <button class="sm" data-act="teach-item" data-idx="${i}">teach</button>`
        : '<span class="muted">needs a mage on the crew</span>';
      else controls = `<select class="armory-sel" data-item="${i}">${crewOpts}</select> <button class="sm" data-act="issue-item" data-idx="${i}">issue</button>` +
        (item.issuedTo ? ` <button class="sm" data-act="reclaim-item" data-idx="${i}">reclaim</button>` : "");
      const sell = !item.issuedTo ? ` <button class="sm" data-act="sell-item" data-idx="${i}">sell ¥${Math.round(MJ.itemCost(item.templateId) * 0.4)}</button>` : "";
      return `<div class="row">${item.label} (T${item.tier}) <span class="muted">${itemEffectText(t)}</span>${holder}<br>${controls}${sell}</div>`;
    }).join("") || '<span class="muted">The racks are empty — buy below, or craft at the Hub.</span>';
    const mats = Object.entries(S.save.armory.materials || {}).filter(([, n]) => n > 0).map(([k, n]) =>
      `<div class="row">${k.replace("resource:", "")} x${n} <button class="sm" data-act="sell-mats" data-kind="${k}">sell all</button></div>`).join("");
    const CATEGORY_ORDER = ["weapon", "armor", "deck", "program", "drone", "focus", "gear", "consumable", "formula", "cyberware"];
    // Collapsible category groups (user: the flat list ate the page;
    // real tabs are a later UI pass).
    const shop = CATEGORY_ORDER.map((cat) => {
      const ids = Object.keys(MJ.ITEM_TEMPLATES).filter((id) => MJ.ITEM_TEMPLATES[id].category === cat);
      if (!ids.length) return "";
      const btns = ids.map((id) => {
        const t = MJ.ITEM_TEMPLATES[id];
        return `<button class="sm" data-act="buy-item" data-tpl="${id}" title="${itemEffectText(t)}">${t.label} ¥${MJ.itemCost(id)}</button>`;
      }).join(" ");
      return `<details class="shopcat"><summary>${cat.toUpperCase()} (${ids.length})</summary><div style="line-height:2.4">${btns}</div></details>`;
    }).join("");
    $("panel-armory").innerHTML = rows +
      (mats ? `<div class="good" style="margin-top:8px">MATERIALS</div>${mats}` : "") +
      `<div class="good" style="margin-top:8px">GEAR SHOP <span class="muted" style="text-transform:none;letter-spacing:0">(hover for effect)</span></div>${shop}`;
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

  // ── Playing the day, one mission at a time ──────────────────────
  // Dispatches resolve in queue order. Anything with a decision in
  // it gets the popup; a craft or a treatment has nothing to ask, so
  // it just lands in the log as the queue passes over it.
  function playDay() {
    const day = MJ.game.beginDay(S);
    const pending = day.entries.slice();
    step();

    function step() {
      while (pending.length && pending[0].done) MJ.game.resolveEntry(S, day, pending.shift());
      if (!pending.length) {
        MJ.game.settleDay(S, day);
        wipeChecks = true;
        render();
        return;
      }
      MJ.missionPopup.play(S, day, pending.shift(), () => { render(); step(); });
    }
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
    if (action === "load-game") {
      MJ.game.loadSession().then((loaded) => {
        if (loaded) {
          S = loaded;
          wipeChecks = true;
        } else {
          $("statline").textContent = "No save found — start a New Game.";
        }
        render();
      });
      return;
    }
    if (action === "save-game") {
      if (S) MJ.game.saveSession(S).then(() => render());
      return;
    }
    if (!S) { $("statline").textContent = "Start a New Game first."; return; }
    const idx = el && el.dataset.idx !== undefined ? +el.dataset.idx : -1;
    if (action === "refresh-board") MJ.game.refreshBoard(S);
    else if (action === "refresh-market") MJ.game.refreshMarket(S);
    else if (action === "expand-capacity") MJ.game.expandCapacity(S);
    else if (action === "end-day") { playDay(); return; }
    else if (action === "quick-day") { MJ.game.endDay(S); wipeChecks = true; }
    else if (action === "accept") MJ.game.acceptJob(S, idx);
    else if (action === "watch-market") MJ.game.watchFromMarket(S, idx);
    else if (action === "hire") MJ.game.hire(S, S.roster[+el.dataset.ridx], el.dataset.tier);
    else if (action === "upgrade") MJ.game.upgrade(S, S.roster[+el.dataset.ridx], el.dataset.tier);
    else if (action === "release") MJ.game.release(S, S.roster[+el.dataset.ridx]);
    else if (action === "unwatch") MJ.game.unwatch(S, S.roster[+el.dataset.ridx]);
    else if (action === "repeat-plan") MJ.game.repeatLastPlan(S);
    else if (action === "repeat-one") MJ.game.repeatOne(S, idx);
    else if (action === "buy-item") MJ.game.buyGear(S, el.dataset.tpl);
    else if (action === "sell-item") MJ.game.sellGear(S, S.save.armory.items[idx]);
    else if (action === "reclaim-item") MJ.game.issueGear(S, S.save.armory.items[idx], null);
    else if (action === "issue-item" || action === "implant-item" || action === "teach-item") {
      const sel = document.querySelector('.armory-sel[data-item="' + idx + '"]');
      const runner = sel && sel.value !== "" ? S.roster[+sel.value] : null;
      if (runner) {
        if (action === "issue-item") MJ.game.issueGear(S, S.save.armory.items[idx], runner);
        else if (action === "implant-item") MJ.game.implantGear(S, S.save.armory.items[idx], runner);
        else MJ.game.teachGear(S, S.save.armory.items[idx], runner);
      }
    }
    else if (action === "sell-mats") MJ.game.sellStock(S, el.dataset.kind);
    else if (action === "discover-name") {
      const box = $("site-lookup");
      if (box && box.value.trim()) MJ.game.discoverByName(S, box.value);
    }
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

  // Dev handle on the live session — the panels are a lossy view of
  // it, and "what does the model actually think right now" is the
  // first question worth asking when they disagree.
  MJ.ui = { session: () => S, play: playDay };

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (el) act(el.dataset.act, el);
  });

  // Changing the activity re-derives the action list; changing the
  // craft discipline re-derives the item list.
  document.addEventListener("change", (e) => {
    if (e.target && (e.target.id === "site-select" || e.target.id === "action-select")) render();
  });

  window.addEventListener("DOMContentLoaded", render);
})();
