/* ============================================================
   Mr. Johnson — game-ui.js
   THE HUB CONSOLE, per UNDERSTANDING.md §10.

   ONE WINDOW, three levels of zoom: TAB -> WIDGET -> ITEM. The
   page used to splay every panel down an endless scroll; it now
   opens exactly as far as you ask it to.

     FRAME    compact state you MONITOR — day, nuyen, rep, capacity
              anchored left; today's plan anchored right, collapsed,
              clicking opens a card. Never a place you operate.
     WIDGET   a subsystem you OPERATE, or something too voluminous
              to fit the frame. Collapsed to a name, a count and a
              one-line read.
     ITEM     one entry's own dossier, opened in place.

   WIDGETS ARE ROWS, NOT RENDERERS. Every one is a record in
   WIDGETS with the same five keys, so a new subsystem is a row —
   "systems are expensive, rows are cheap" applied to the console
   itself. That is also what lets the Phase 3 CRT terminal be a
   second consumer of this same description rather than a rewrite.

   ACTIONS ARE QUEUED FROM THE WIDGET THAT OWNS THEM. You manage
   runners on the Runners tab and commit a crew to a site from the
   Locations tab. The central dispatcher survives in the frame's
   plan card for the activities that have no home tab (crafting,
   searching) — see §10 "Deploy is a flow".

   All game logic lives in game.js. This file only reads session
   state and calls MJ.game commands.
   ============================================================ */
(function () {
  let S = null; // the running session

  // Expansion lives HERE, never read back out of the DOM. The old
  // shell scraped checked boxes mid-render, which meant the model's
  // idea of the crew and the screen's idea could differ for a frame.
  const UI = {
    tab: "runners",
    open: new Set(["w-hired", "w-active", "w-sites"]), // sensible landing state
    entry: new Set(),
    crew: new Set(),   // roster indices selected for the next dispatch
    plan: false,       // is the day's-plan card open
  };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const isOpen = (k) => UI.entry.has(k);
  const chev = (open) => `<span class="chev">${open ? "▾" : "▸"}</span>`;

  // ── Formatting helpers ──────────────────────────────────────────
  function fmtAxis(v) {
    return v.confirmed
      ? `<span class="good">${v.confirmed.value}✓${v.confirmed.fresh ? "" : '<span class="warn">stale</span>'}</span>`
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

  function siteTag(site) {
    const idx = site.identity.universeIndex !== undefined ? `#${site.identity.universeIndex} ` : "";
    const cond = site.identity.conditionLabel ? `${site.identity.conditionLabel} ` : "";
    return `${idx}${cond}${site.identity.district} (${site.identity.owningFaction})`;
  }

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

  function woundRead(r) {
    if (!r.wounds) return "";
    const max = MJ.physicalTrack(r);
    const dice = Math.floor(r.wounds / 3);
    const cls = r.wounds >= max || dice > 0 ? "warn" : "muted";
    return `<span class="${cls}">${r.wounds}/${max} boxes${dice > 0 ? ` (−${dice}d)` : ""}</span>`;
  }

  // ── The runner dossier ──────────────────────────────────────────
  // Rendered from an EXPLICIT ALLOWLIST of player-visible fields.
  // `trueArchetype` is hidden truth and the Discipline mispricing
  // system depends on it staying that way, so nothing here iterates
  // the runner object generically.
  function runnerLine(r) {
    const c = r.classification;
    const famNoun = c.family.charAt(0).toUpperCase() + c.family.slice(1);
    const trade = c.focusLabel.toLowerCase() === c.family.toLowerCase()
      ? famNoun : `${c.focusLabel} ${famNoun}`;
    return `<b>${esc(r.identity.handle)}</b> <span class="good">${esc(trade)}</span>`;
  }

  // Level 3: the whole sheet. The FULL skill list including zeros —
  // what a runner cannot do is as much of the hire decision as what
  // they can, so the gaps are shown rather than filtered out.
  function runnerDetail(r) {
    const a = r.attributes;
    const c = r.classification;
    const eff = MJ.getEffectiveSkills(r);
    const skills = MJ.SKILLS.map((k) => {
      const v = eff[k] || 0;
      return `<span class="${v > 0 ? "" : "z"}">${k}:${v}</span>`;
    }).join("");
    const kit = [
      ...(r.gear || []).map((g) => `${esc(g.label)} T${g.tier}`),
      ...(r.implants || []).map((im) => `⟨${esc(im.label)}⟩`),
    ];
    const track = MJ.physicalTrack(r);
    const stun = MJ.stunTrack(r);
    return `<div class="det"><span class="dk">discipline</span>` +
        `${esc(MJ.describeDiscipline(r))} <span class="muted">· ${esc(r.identity.metatypeLabel)}, ${esc(c.origin)}` +
        `${c.deckerAffinity ? " · affinity: " + esc(c.deckerAffinity) : ""}</span></div>` +
      `<div class="det"><span class="dk">attributes</span>` +
        `B${a.body} A${a.agility} S${a.strength} W${a.willpower} I${a.intelligence} C${a.charisma}` +
        `${a.magic ? " M" + a.magic : ""} <span class="muted">· essence ${r.essence.current}/${r.essence.max}` +
        ` · init ${MJ.initiativeScore({ attributes: a, effects: [] })}` +
        ` · tracks ${track}P/${stun}S</span></div>` +
      `<div class="det"><span class="dk">skills</span><div class="skillgrid">${skills}</div></div>` +
      `<div class="det"><span class="dk">condition</span>karma ${r.karma}` +
        `${r.wounds ? " · " + woundRead(r) : ' · <span class="muted">unhurt</span>'}` +
        ` · ${fmtContract(r)}</div>` +
      (kit.length ? `<div class="det"><span class="dk">kit</span>${kit.join(", ")}</div>`
        : `<div class="det"><span class="dk">kit</span><span class="muted">nothing issued</span></div>`);
  }

  function runnerActions(r, i) {
    const btns = [];
    if (MJ.isHireable(r)) {
      for (const t of ["freelance", "retainer", "permanent"]) {
        btns.push(`<button class="sm" data-act="hire" data-ridx="${i}" data-tier="${t}">${t} ¥${MJ.hireCost(r, t)}</button>`);
      }
    }
    if (r.market.hired) {
      const order = ["freelance", "retainer", "permanent"];
      for (const t of ["retainer", "permanent"]) {
        if (order.indexOf(t) > order.indexOf(r.market.hired.tier)) {
          btns.push(`<button class="sm" data-act="upgrade" data-ridx="${i}" data-tier="${t}">upgrade→${t} ¥${MJ.upgradeCost(r, t)}</button>`);
        }
      }
      btns.push(`<button class="sm" data-act="release" data-ridx="${i}">release</button>`);
    } else {
      btns.push(`<button class="sm" data-act="unwatch" data-ridx="${i}">${r.market.phase === "kia" ? "strike from list" : "unwatch"}</button>`);
    }
    return `<div class="actionbar">${btns.join(" ")}</div>`;
  }

  // ── Generic entry shell: head always, body only when open ───────
  function entry(key, title, tag, body) {
    const open = isOpen(key);
    return `<div class="entry${open ? " open" : ""}">` +
      `<div class="entry-head" data-entry="${esc(key)}">${chev(open)}` +
        `<span class="etitle">${title}</span><span class="etag">${tag || ""}</span></div>` +
      (open ? `<div class="entry-body">${body()}</div>` : "") + "</div>";
  }

  const emptyNote = (s) => `<span class="empty">${esc(s)}</span>`;

  // ── Runner widgets ──────────────────────────────────────────────
  function runnerList(list, keyPrefix) {
    if (!list.length) return null;
    return list.map(({ r, i }) =>
      entry(`${keyPrefix}:${i}`, runnerLine(r),
        `${fmtContract(r)}${r.wounds ? " · " + woundRead(r) : ""}`,
        () => runnerDetail(r) + runnerActions(r, i))).join("");
  }

  function splitRoster() {
    const crew = [], watch = [];
    S.roster.forEach((r, i) => (r.market.hired ? crew : watch).push({ r, i }));
    return { crew, watch };
  }

  // ── Contracts ───────────────────────────────────────────────────
  function jobDetail(job, withStatus) {
    const daysLeft = job.expiryDay - S.day;
    return `<div class="det"><span class="dk">terms</span>` +
        `¥${job.pay} <span class="muted">· rush x${job.rushMultiplier.toFixed(2)} · ${job.daysPerMission}d per leg` +
        ` · <span class="${daysLeft <= 1 ? "warn" : "muted"}">expires day ${job.expiryDay} (${daysLeft}d left)</span>` +
        `${job.chained ? ' · <span class="warn">CHAINED</span>' : ""}</span></div>` +
      `<div class="det"><span class="dk">legs</span>` +
        job.missions.map((m, k) => legLineFull(job, m, k, withStatus)).join("") + "</div>";
  }

  // ── Armory ──────────────────────────────────────────────────────
  function itemEffectText(t) {
    if (t.category === "cyberware") return Object.entries(t.skillMods).map(([k, v]) => `+${v} ${k}`).join(", ") + ` · −${t.essenceCost} ess (implant)`;
    if (t.category === "armor") return `guards ${MJ.gearBonusForTier(t.tier)} wound(s)/mission`;
    if (t.category === "consumable") {
      return t.effect === "absorbWound" ? "absorbs a wound · single use"
        : `+${MJ.gearBonusForTier(t.tier)}d ${t.skill}, one roll · single use`;
    }
    if (t.category === "program") return `+${MJ.gearBonusForTier(t.tier)}d ${t.skill} (needs a deck)`;
    if (t.category === "formula") return `teaches ${t.spellCategory} spell (casting pending)`;
    return `+${MJ.gearBonusForTier(t.tier)}d ${t.skill}`;
  }

  const crewOptions = (filter) => S.roster.map((r, i) => ({ r, i }))
    .filter((x) => x.r.market.hired && (!filter || filter(x.r)))
    .map((x) => `<option value="${x.i}">${esc(x.r.identity.handle)}</option>`).join("");

  function itemDetail(item, i) {
    const t = MJ.ITEM_TEMPLATES[item.templateId];
    const opts = crewOptions();
    const mageOpts = crewOptions((r) => r.classification.family === "mage");
    let controls;
    if (!opts) controls = '<span class="muted">hire someone first</span>';
    else if (t.category === "cyberware") controls = `<select class="armory-sel" data-item="${i}">${opts}</select> <button class="sm" data-act="implant-item" data-idx="${i}">implant</button>`;
    else if (t.category === "formula") controls = mageOpts
      ? `<select class="armory-sel" data-item="${i}">${mageOpts}</select> <button class="sm" data-act="teach-item" data-idx="${i}">teach</button>`
      : '<span class="muted">needs a mage on the crew</span>';
    else controls = `<select class="armory-sel" data-item="${i}">${opts}</select> <button class="sm" data-act="issue-item" data-idx="${i}">issue</button>` +
      (item.issuedTo ? ` <button class="sm" data-act="reclaim-item" data-idx="${i}">reclaim</button>` : "");
    const sell = !item.issuedTo ? ` <button class="sm" data-act="sell-item" data-idx="${i}">sell ¥${Math.round(MJ.itemCost(item.templateId) * 0.4)}</button>` : "";
    return `<div class="det"><span class="dk">effect</span>${esc(itemEffectText(t))}` +
        `${item.crafted ? ` <span class="good">· crafted q${item.quality}${item.mark ? " “" + esc(item.mark) + "”" : ""}</span>` : ""}</div>` +
      `<div class="det"><span class="dk">held by</span>${item.issuedTo
        ? `<span class="good">${esc(item.issuedTo.identity.handle)}</span>` : '<span class="muted">storage</span>'}</div>` +
      `<div class="actionbar">${controls}${sell}</div>`;
  }

  // The shop, grouped by category — buying is always open (§10).
  function shopFor(cats) {
    return cats.map((cat) => {
      const ids = Object.keys(MJ.ITEM_TEMPLATES).filter((id) => MJ.ITEM_TEMPLATES[id].category === cat);
      if (!ids.length) return "";
      return `<div class="det"><span class="dk">buy ${cat}</span>` + ids.map((id) => {
        const t = MJ.ITEM_TEMPLATES[id];
        return `<button class="sm" data-act="buy-item" data-tpl="${id}" title="${esc(itemEffectText(t))}">${esc(t.label)} ¥${MJ.itemCost(id)}</button>`;
      }).join(" ") + "</div>";
    }).join("");
  }

  function armoryWidget(cats) {
    const items = S.save.armory.items
      .map((it, i) => ({ it, i }))
      .filter((x) => !x.it.consumed && cats.indexOf(MJ.ITEM_TEMPLATES[x.it.templateId].category) !== -1);
    const rows = items.map(({ it, i }) =>
      entry(`item:${i}`, `${esc(it.label)} <span class="muted">T${MJ.effectiveTier(it)}</span>`,
        it.issuedTo ? esc(it.issuedTo.identity.handle) : "storage",
        () => itemDetail(it, i))).join("");
    return (rows || emptyNote("nothing on the racks")) + shopFor(cats);
  }

  // ── Locations: site -> intent -> crew -> queue ───────────────────
  function targetMarks(site) {
    const nums = S.jobs
      .filter((j) => !j.paid && !j.expired && j.missions.some((m) => m.site === site))
      .map((j) => "[" + j.contractNumber + "]");
    return nums.length ? ` <span class="warn">target ${nums.join("")}</span>` : "";
  }

  function crewPicker() {
    const committed = new Set();
    for (const q of S.queue) {
      for (const r of q.runners) committed.add(r);
      if (q.mission.patient) committed.add(q.mission.patient);
    }
    const rows = S.roster.map((r, i) => ({ r, i })).filter((x) => MJ.isDispatchable(x.r)).map((x) =>
      committed.has(x.r)
        ? `<label class="out"><input type="checkbox" checked disabled> ${esc(x.r.identity.handle)} (queued)</label>`
        : `<label><input type="checkbox" class="crew-check" data-ridx="${x.i}"${UI.crew.has(x.i) ? " checked" : ""}> ${esc(x.r.identity.handle)}</label>`).join("");
    if (!rows) return `<div class="crewpick">${emptyNote("no dispatchable runners — a contract is what buys a dispatch")}</div>`;
    return `<div class="crewpick">${rows}</div><div class="crewread">${crewRead()}</div>`;
  }

  // What the ticked crew actually brings, per axis. Their own crew,
  // so it is exact — the site's number stays an estimate.
  function crewRead() {
    const picked = [...UI.crew].map((i) => S.roster[i]).filter(Boolean);
    if (!picked.length) return '<span class="muted">tick a crew to see what they bring</span>';
    const cap = MJ.crewCapability(picked);
    return `<span class="muted">this crew brings — P:</span><b class="w-num">${cap.physical}d</b>` +
      `<span class="muted"> A:</span><b class="w-num">${cap.astral}d</b>` +
      `<span class="muted"> M:</span><b class="w-num">${cap.matrix}d</b>`;
  }

  // The three intents a site accepts (user spec). Anything the site
  // cannot support is still SHOWN, with the reason — the same ruling
  // the mission menu runs on: never silently delete an option.
  function siteIntents(site, si) {
    const legs = [];
    S.jobs.forEach((job, jI) => {
      if (job.paid || job.expired) return;
      job.missions.forEach((m, k) => {
        if (m.resolved || m.site !== site) return;
        const gated = !!(m.requiresMission && !m.requiresMission.resolved);
        legs.push(`<button class="sm" data-act="queue-site" data-si="${si}" data-plan="run:${jI}:${k}"${gated ? " disabled" : ""}>` +
          `Job #${job.contractNumber} leg ${k + 1} — ${MJ.OBJECTIVE_VERBS[m.objectiveVerb].label} (${m.payloadDomain})${gated ? " [GATED]" : ""}</button>`);
      });
    });
    const hasHost = !!(site.host && site.host.nodes.length > 1);
    const hasResource = site.tags.some((t) => String(t.tag).indexOf("resource:") === 0);

    const run = `<div class="intent"><span class="ik">Run — complete a contract objective</span>` +
      (legs.join(" ") || emptyNote("no accepted contract points here — take a job on the Contracts tab")) +
      `<div class="actionbar">` +
        `<button class="sm" data-act="queue-site" data-si="${si}" data-plan="astral">Astral run — project in</button>` +
        `<button class="sm" data-act="queue-site" data-si="${si}" data-plan="matrix:quiet"${hasHost ? "" : " disabled"}>` +
          `Matrix run — crawl the host${hasHost ? ` (${site.host.nodes.length} nodes)` : " — no host here"}</button>` +
      `</div></div>`;

    const recon = `<div class="intent"><span class="ik">Recon — go and look</span><div class="actionbar">` +
      MJ.RECON_LENSES.map((l) =>
        `<button class="sm" data-act="queue-site" data-si="${si}" data-plan="recon:${l}">${l}</button>`).join(" ") +
      `</div></div>`;

    const scav = `<div class="intent"><span class="ik">Scavenge — take what is lying about</span><div class="actionbar">` +
      `<button class="sm" data-act="queue-site" data-si="${si}" data-plan="harvest"${hasResource ? "" : " disabled"}>` +
        `scrap / reagents${hasResource ? "" : " — nothing to harvest here"}</button>` +
      `<button class="sm" data-act="queue-site" data-si="${si}" data-plan="matrix:data"${hasHost ? "" : " disabled"}>` +
        `data haul${hasHost ? "" : " — no host here"}</button>` +
      `</div></div>`;

    return run + recon + scav +
      `<div class="det" style="margin-top:8px"><span class="dk">crew for this dispatch</span>${crewPicker()}</div>`;
  }

  function siteDetail(row, site, si) {
    return `<div class="det"><span class="dk">address</span>` +
        (row.name ? `<span class="ink">"${esc(row.name)}"</span>${row.theme ? ` <span class="muted">· ${esc(row.theme)}</span>` : ""}`
          : '<span class="muted">no key on file</span>') + `</div>` +
      `<div class="det"><span class="dk">read</span>` +
        `value ${row.value} · ${esc(row.orientation)} · <span class="muted">via ${esc(row.source)} day ${row.dayKnown}</span><br>` +
        `P:${fmtAxis(row.security.physical)} A:${fmtAxis(row.security.astral)} M:${fmtAxis(row.security.matrix)}` +
        (row.suppression ? ` <span class="warn">softened today</span>` : "") +
        (row.tags.length ? ` <span class="muted">[${esc(row.tags.join(", "))}]</span>` : "") + `</div>` +
      siteIntents(site, si);
  }

  // ── THE WIDGET REGISTRY ─────────────────────────────────────────
  // id / label / summary line / body. `dark` gates a widget that
  // exists but has no staff to work it (§10: the console grows with
  // the operation).
  const WIDGETS = {
    runners: [
      { id: "w-hired", label: "Hired", count: () => splitRoster().crew.length,
        sum: () => `${splitRoster().crew.length}/${S.save.johnson.boardCapacity} under contract`,
        body: () => runnerList(splitRoster().crew, "hired") || emptyNote("nobody under contract") },
      { id: "w-watch", label: "Watchlist", count: () => splitRoster().watch.length,
        sum: () => `${S.roster.length}/${MJ.game.watchCapacity(S)} watched`,
        body: () => runnerList(splitRoster().watch, "watch") || emptyNote("nobody on watch") },
      { id: "w-market", label: "Market", count: () => S.market.length,
        sum: () => "the pool refreshes as the days turn",
        body: () => `<div class="actionbar"><button class="sm" data-act="refresh-market">refresh the pool</button></div>` +
          (S.market.map((r, i) =>
            entry(`mkt:${i}`, runnerLine(r),
              `¥${MJ.hireCost(r, "freelance")}/mission · <span class="warn">leaves in ${r.market.shelfDaysRemaining}d</span>`,
              () => runnerDetail(r) +
                `<div class="det"><span class="dk">asking</span>freelance ¥${MJ.hireCost(r, "freelance")}` +
                ` · retainer ¥${MJ.hireCost(r, "retainer")} · permanent ¥${MJ.hireCost(r, "permanent")}</div>` +
                `<div class="actionbar"><button class="sm" data-act="watch-market" data-idx="${i}">add to watchlist</button></div>`
            )).join("") || emptyNote("market is empty")) },
    ],
    contracts: [
      { id: "w-active", label: "Active", count: () => S.jobs.filter((j) => !j.paid && !j.expired).length,
        sum: () => "accepted, unfinished",
        body: () => S.jobs.map((job, i) => ({ job, i })).filter((x) => !x.job.paid && !x.job.expired)
          .map(({ job, i }) => entry(`job:${i}`,
            `Job #${job.contractNumber} <span class="muted">${esc(job.hiringFaction)}</span>`,
            `¥${job.pay} · ${job.expiryDay - S.day}d left`,
            () => jobDetail(job, true))).join("") || emptyNote("no active contracts") },
      { id: "w-available", label: "Available", count: () => S.board.length,
        sum: () => "the job board",
        body: () => `<div class="actionbar"><button class="sm" data-act="refresh-board">refresh the board</button></div>` +
          (S.board.map((e, i) => entry(`board:${i}`,
            `${esc(e.job.hiringFaction)}`, `¥${e.job.pay} · ${e.job.missions.length} leg(s)`,
            () => jobDetail(e.job, false) +
              `<div class="actionbar"><button class="sm" data-act="accept" data-idx="${i}">accept this contract</button></div>`
          )).join("") || emptyNote("no offers — refresh the board")) },
      { id: "w-completed", label: "Completed", count: () => S.jobs.filter((j) => j.paid || j.expired).length,
        sum: () => "paid and lapsed",
        body: () => S.jobs.filter((j) => j.paid || j.expired).map((job) =>
          `<div class="entry"><div class="entry-head"><span class="chev"></span><span class="etitle">` +
          (job.paid ? `<span class="good">✓</span> Job #${job.contractNumber} — ${esc(job.hiringFaction)}`
            : `<span class="warn">✗</span> Job #${job.contractNumber} — ${esc(job.hiringFaction)}`) +
          `</span><span class="etag">${job.paid ? "paid ¥" + job.pay : "window closed"}</span></div></div>`
        ).join("") || emptyNote("nothing finished yet") },
    ],
    armory: [
      { id: "w-gear", label: "Gear", cats: ["weapon", "armor", "gear", "consumable", "cyberware"] },
      { id: "w-decks", label: "Decks", cats: ["deck", "program"] },
      { id: "w-drones", label: "Drones", cats: ["drone"] },
      { id: "w-grimoire", label: "Grimoire", cats: ["focus", "formula"] },
      { id: "w-medicae", label: "Medicae", medicae: true },
    ],
    locations: [
      { id: "w-sites", label: "Locations", wide: true,
        count: () => S.knownSites.length,
        sum: () => "everywhere you have been, and anywhere you can name",
        body: () => {
          const lookup = `<div class="det"><span class="dk">call in a site by key</span>` +
            `<input type="text" class="sm" id="site-lookup" placeholder="Boldly-Quiet-Crimson-Bicycle-0417" /> ` +
            `<button class="sm" data-act="discover-name">look it up</button></div>`;
          if (!S.knownSites.length) return lookup + emptyNote("no known sites — accept a job, search, or call one in");
          const rows = MJ.siteListView(S.knownSites, S.day).map((row, i) => {
            const site = S.knownSites[i];
            return entry(`site:${i}`,
              `${row.universeIndex !== null ? "#" + row.universeIndex + " " : ""}<b>${esc(row.district)}</b> ` +
              `<span class="muted">(${esc(row.owningFaction)})</span>${targetMarks(site)}`,
              `v${row.value} ${esc(row.orientation)}`,
              () => siteDetail(row, site, i));
          }).join("");
          return lookup + rows;
        } },
    ],
  };

  // Armory widgets share one body shape, so fill them in rather than
  // writing the same five rows out longhand.
  for (const w of WIDGETS.armory) {
    if (w.medicae) {
      w.count = () => S.roster.filter((r) => r.market.hired && r.wounds > 0).length;
      w.sum = () => "wounds always; surgery needs a Street Doc";
      w.body = () => {
        const hurt = S.roster.map((r, i) => ({ r, i })).filter((x) => x.r.market.hired && x.r.wounds > 0);
        if (!hurt.length) return emptyNote("nobody is carrying anything");
        return hurt.map(({ r, i }) =>
          entry(`med:${i}`, runnerLine(r), woundRead(r), () =>
            `<div class="det"><span class="dk">case</span>${r.wounds} box(es)` +
            ` · <span class="muted">essence spent ${(r.essence.max - r.essence.current).toFixed(1)} — chrome complicates surgery</span></div>` +
            `<div class="det"><span class="dk">crew to treat them</span>${crewPicker()}</div>` +
            `<div class="actionbar"><button class="sm" data-act="queue-treat" data-ridx="${i}">queue treatment</button></div>`
          )).join("");
      };
    } else {
      const cats = w.cats;
      w.count = () => S.save.armory.items.filter((it) =>
        !it.consumed && cats.indexOf(MJ.ITEM_TEMPLATES[it.templateId].category) !== -1).length;
      w.sum = () => cats.join(" · ");
      w.body = () => armoryWidget(cats);
    }
  }

  const TABS = [
    { id: "runners", label: "Runners", count: () => S.roster.length },
    { id: "contracts", label: "Contracts", count: () => S.jobs.filter((j) => !j.paid && !j.expired).length },
    { id: "armory", label: "Armory", count: () => S.save.armory.items.filter((i) => !i.consumed).length },
    { id: "locations", label: "Locations", count: () => S.knownSites.length },
  ];

  // ── The frame ───────────────────────────────────────────────────
  function renderFrame() {
    const j = S.save.johnson;
    const queued = S.queue.length;
    const stat = (k, v, alarm) =>
      `<div class="frame-stat${alarm ? " alarm" : ""}"><span class="k">${k}</span><span class="v">${v}</span></div>`;
    $("frame").innerHTML =
      `<div class="frame-stats">` +
        stat("Day", S.day) + stat("Nuyen", "¥" + j.money) +
        stat("Rep", j.reputation) + stat("Capacity", j.boardCapacity) +
      `</div>` +
      `<div class="frame-plan">` +
        `<button class="plan-toggle" data-act="toggle-plan">` +
          `today's plan <span class="n">${queued}</span> queued ${UI.plan ? "▾" : "▸"}</button>` +
      `</div>`;
    $("plancard").innerHTML = UI.plan ? `<div class="plan-card">${planCard()}</div>` : "";
  }

  // The central dispatcher, kept for the activities with no home tab
  // — crafting and searching are not done AT a site, so they cannot
  // be queued from Locations.
  function planCard() {
    const queue = S.queue.map((q, i) =>
      `<div class="queue-item"><span class="muted">${i + 1}.</span> ${esc(q.label)} ` +
      `<span class="muted">[${q.runners.map((r) => esc(r.identity.handle)).join(", ")}]</span> ` +
      `<button class="sm" data-act="queue-up" data-idx="${i}">↑</button>` +
      `<button class="sm" data-act="queue-down" data-idx="${i}">↓</button>` +
      `<button class="sm" data-act="queue-del" data-idx="${i}">✕</button></div>`).join("");
    const crafts = Object.keys(MJ.ITEM_TEMPLATES)
      .filter((id) => MJ.ITEM_TEMPLATES[id].category !== "cyberware" && MJ.ITEM_TEMPLATES[id].craftSkill)
      .map((id) => `<option value="${id}">${esc(MJ.ITEM_TEMPLATES[id].label)} (T${MJ.ITEM_TEMPLATES[id].tier})</option>`).join("");
    const yesterday = (S.lastPlan || []).map((p, i) =>
      `<div class="queue-item muted">${esc(p.label)} <button class="sm" data-act="repeat-one" data-idx="${i}">requeue</button></div>`).join("");
    return `<div class="det"><span class="dk">queued for today</span>` +
        (queue || emptyNote("nothing queued — Play Day will just tick the world")) + `</div>` +
      `<div class="det"><span class="dk">bench work — not done at a site</span>` +
        `<select id="craft-select">${crafts}</select> ` +
        `<button class="sm" data-act="queue-craft">queue craft</button> ` +
        `<button class="sm" data-act="queue-search" data-kind="scrap">search: scrap yard</button> ` +
        `<button class="sm" data-act="queue-search" data-kind="reagents">search: reagent grove</button>` +
        `<div style="margin-top:6px">${crewPicker()}</div></div>` +
      (yesterday ? `<div class="det"><span class="dk">yesterday</span>${yesterday}` +
        `<button class="sm" data-act="repeat-plan">requeue all</button></div>` : "") +
      `<div class="actionbar"><button class="sm" data-act="expand-capacity">expand capacity</button></div>` +
      `<span class="empty">Queue resolves top-to-bottom, one action per runner per day. ` +
      `Recon first pays: fresh intel is +1 die at that site.</span>`;
  }

  // ── Tabs and widgets ────────────────────────────────────────────
  function renderTabs() {
    $("tabbar").innerHTML = TABS.map((t) =>
      `<button class="tab${UI.tab === t.id ? " active" : ""}" data-act="tab" data-tab="${t.id}">` +
      `${esc(t.label)}<span class="badge">${t.count()}</span></button>`).join("");
  }

  function renderBody() {
    $("tabbody").innerHTML = (WIDGETS[UI.tab] || []).map((w) => {
      const open = UI.open.has(w.id);
      const n = w.count();
      return `<div class="widget${w.wide ? " wide" : ""}${n === 0 ? " dark" : ""}">` +
        `<div class="widget-head" data-act="widget" data-wid="${w.id}">${chev(open)}` +
          `<span class="wname">${esc(w.label)}</span><span class="wcount">${n}</span>` +
          `<span class="wsum">${esc(w.sum())}</span></div>` +
        (open ? `<div class="widget-body">${w.body()}</div>` : "") + `</div>`;
    }).join("");
  }

  function renderLog() {
    const el = $("panel-log");
    el.textContent = S.log.slice(-80).map(MJ.logText).join("\n");
    el.scrollTop = el.scrollHeight;
  }

  function render() {
    if (!S) {
      $("statline").textContent = "No game running — enter a seed (or leave blank) and hit New Game.";
      $("frame").innerHTML = ""; $("plancard").innerHTML = "";
      $("tabbar").innerHTML = ""; $("tabbody").innerHTML = "";
      return;
    }
    $("statline").textContent = `Universe "${S.universeSeed}"`;
    renderFrame();
    renderTabs();
    renderBody();
    renderLog();
  }

  // ── Dispatch built from a site widget ───────────────────────────
  function pickedCrew() {
    return [...UI.crew].map((i) => S.roster[i]).filter((r) => r && MJ.isDispatchable(r));
  }

  function queueBuilt(mission, label) {
    const res = MJ.game.queueDispatch(S, mission, pickedCrew(), label);
    if (!res.ok) MJ.game.note(S, "can't queue — " + res.error, "dispatch", { refused: true });
    else UI.crew.clear();
    return res;
  }

  function queueForSite(si, plan) {
    const site = S.knownSites[si];
    if (!site) return;
    const tag = siteTag(site);
    if (plan.indexOf("run:") === 0) {
      const p = plan.split(":");
      const job = S.jobs[+p[1]];
      const m = job.missions[+p[2]];
      return queueBuilt(m, `Job #${job.contractNumber} leg ${+p[2] + 1} @ ${tag}`);
    }
    if (plan.indexOf("recon:") === 0) {
      const lens = plan.split(":")[1];
      return queueBuilt(MJ.createReconMission(site, lens), `recon ${lens} @ ${tag}`);
    }
    if (plan === "astral") return queueBuilt(MJ.createAstralMission(site), `astral run @ ${tag}`);
    if (plan.indexOf("matrix:") === 0) {
      const greedy = plan.split(":")[1] === "data";
      return queueBuilt(MJ.createMatrixMission(site, { wantData: greedy }),
        `matrix run${greedy ? " (data haul)" : ""} @ ${tag}`);
    }
    if (plan === "harvest") return queueBuilt(MJ.createResourceMission(site), `harvest @ ${tag}`);
  }

  // ── Playing the day, one mission at a time ──────────────────────
  function playDay() {
    const day = MJ.game.beginDay(S);
    const pending = day.entries.slice();
    step();
    function step() {
      while (pending.length && pending[0].done) MJ.game.resolveEntry(S, day, pending.shift());
      if (!pending.length) {
        MJ.game.settleDay(S, day);
        UI.crew.clear();
        render();
        return;
      }
      MJ.missionPopup.play(S, day, pending.shift(), () => { render(); step(); });
    }
  }

  // ── Actions ─────────────────────────────────────────────────────
  function act(action, el) {
    if (action === "new-game") {
      S = MJ.game.newGame($("universe-seed").value.trim() || undefined);
      MJ.game.refreshBoard(S);
      UI.crew.clear(); UI.entry.clear();
      render();
      return;
    }
    if (action === "load-game") {
      MJ.game.loadSession().then((loaded) => {
        if (loaded) { S = loaded; UI.crew.clear(); UI.entry.clear(); }
        else $("statline").textContent = "No save found — start a New Game.";
        render();
      });
      return;
    }
    if (action === "save-game") { if (S) MJ.game.saveSession(S).then(render); return; }

    // Pure view state — no session needed, and no reason to re-derive
    // anything but the body.
    if (action === "tab") { UI.tab = el.dataset.tab; render(); return; }
    if (action === "widget") {
      const id = el.dataset.wid;
      UI.open.has(id) ? UI.open.delete(id) : UI.open.add(id);
      render(); return;
    }
    if (action === "toggle-plan") { UI.plan = !UI.plan; render(); return; }

    if (!S) { $("statline").textContent = "Start a New Game first."; return; }
    const idx = el && el.dataset.idx !== undefined ? +el.dataset.idx : -1;

    if (action === "refresh-board") MJ.game.refreshBoard(S);
    else if (action === "refresh-market") MJ.game.refreshMarket(S);
    else if (action === "expand-capacity") MJ.game.expandCapacity(S);
    else if (action === "end-day") { playDay(); return; }
    else if (action === "quick-day") { MJ.game.endDay(S); UI.crew.clear(); }
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
    else if (action === "queue-site") queueForSite(+el.dataset.si, el.dataset.plan);
    else if (action === "queue-treat") {
      const p = S.roster[+el.dataset.ridx];
      queueBuilt(MJ.createMedicalMission(p), "treat " + p.identity.handle);
    }
    else if (action === "queue-craft") {
      const sel = $("craft-select");
      if (sel && sel.value) queueBuilt(MJ.createCraftingMission(sel.value), "craft " + MJ.ITEM_TEMPLATES[sel.value].label);
    }
    else if (action === "queue-search") {
      queueBuilt(MJ.game.makeSearchMission(S, el.dataset.kind), "search: " + el.dataset.kind);
    }
    render();
  }

  // Dev handle on the live session — the widgets are a lossy view of
  // it, and "what does the model actually think right now" is the
  // first question worth asking when they disagree.
  MJ.ui = { session: () => S, play: playDay, state: UI };

  document.addEventListener("click", (e) => {
    const ent = e.target.closest("[data-entry]");
    const btn = e.target.closest("[data-act]");
    // A button inside an opened entry acts; the head itself toggles.
    if (btn) { act(btn.dataset.act, btn); return; }
    if (ent) {
      const k = ent.dataset.entry;
      isOpen(k) ? UI.entry.delete(k) : UI.entry.add(k);
      render();
    }
  });

  // Ticking a runner must NOT re-render the window. A full render
  // replaces the very checkbox that was just clicked, which loses the
  // click, loses scroll position, and made picking a crew of three
  // silently queue a crew of one. Update the state and repaint only
  // the read-out — every copy of it, since the picker appears in more
  // than one open widget at a time.
  document.addEventListener("change", (e) => {
    if (!e.target || !e.target.classList || !e.target.classList.contains("crew-check")) return;
    const i = +e.target.dataset.ridx;
    e.target.checked ? UI.crew.add(i) : UI.crew.delete(i);
    for (const box of document.querySelectorAll('.crew-check[data-ridx="' + i + '"]')) {
      box.checked = e.target.checked;
    }
    const read = crewRead();
    for (const el of document.querySelectorAll(".crewread")) el.innerHTML = read;
  });

  window.addEventListener("DOMContentLoaded", render);
})();
