/* ============================================================
   Mr. Johnson — game-ui.js
   THE HUB CONSOLE, per UNDERSTANDING.md §10.

   ONE WINDOW, three levels of zoom: TAB -> WIDGET -> ITEM.

     FRAME    compact state you MONITOR — pinned to the bottom of the
              viewport so it never scrolls away. Today's plan opens
              upward out of it. Never a place you operate.
     WIDGET   a subsystem you OPERATE, collapsed to a name, a count
              and a one-line read.
     ITEM     one entry's own dossier, opened in place. ONE AT A TIME:
              opening a card closes whatever was open, leaving a tab
              closes everything, and a page load starts closed.

   WIDGETS ARE ROWS, NOT RENDERERS — a new subsystem is a record in
   WIDGETS, which is "systems are expensive, rows are cheap" applied
   to the console itself.

   ENTRY KEYS ARE OBJECT IDENTITIES, NEVER POSITIONS. The same rule
   the run layer learned the hard way: a list keyed by index starts
   describing a different thing the moment something is removed from
   it, so unwatching a runner used to drop you into the NEXT runner's
   open dossier. Keys come from a WeakMap, so a removed entry simply
   stops existing and the console highlights where it was instead.

   All game logic lives in game.js. This file only reads session
   state and calls MJ.game commands.
   ============================================================ */
(function () {
  let S = null;

  const UI = {
    tab: "runners",
    open: new Set(["w-hired", "w-active", "w-sites"]),
    entry: null,        // the ONE open card, by identity key
    focus: null,        // a card to highlight without opening
    crew: new Set(),    // runners picked in the dispatch dialog
    counts: {},         // widget -> last seen count, for the empty->populated open
    led: {},            // tab -> teaching widget last auto-opened
    pending: null,      // { mission, label } awaiting a crew
    crewTab: "hired",   // section of the dispatch dialog
    scout: "",          // market class filter
  };

  // A dispatch is four runners, whatever the roster holds. The design
  // says every job is runnable by a crew of 1-4 and that composition,
  // not headcount, is the real decision — so the cap is a rule of the
  // world rather than a UI convenience.
  const MAX_CREW = 4;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const chev = (open) => `<span class="chev">${open ? "▾" : "▸"}</span>`;
  const ok = (res) => !res || res.ok !== false;

  // ── Identity keys ───────────────────────────────────────────────
  const KEYS = new WeakMap();
  let keySeq = 0;
  function keyFor(obj, prefix) {
    if (!KEYS.has(obj)) KEYS.set(obj, ++keySeq);
    return prefix + ":" + KEYS.get(obj);
  }

  // ── Formatting ──────────────────────────────────────────────────
  function fmtAxis(v) {
    return v.confirmed
      ? `<span class="good">${v.confirmed.value}✓${v.confirmed.fresh ? "" : '<span class="warn">stale</span>'}</span>`
      : `<span class="muted">~${v.estimated}</span>`;
  }

  function fmtContract(r) {
    const m = r.market;
    if (m.phase === "kia") return '<span class="warn">KIA</span>';
    if (m.hired) {
      const left = m.hired.missionsRemaining === Infinity ? "∞" : m.hired.missionsRemaining;
      return `<span class="good">${m.hired.tier} (${left} left)</span>`;
    }
    if (m.phase === "available") return `<span class="muted">available — ${m.shelfDaysRemaining}d</span>`;
    if (m.phase === "working" || m.phase === "outOfTown") return `<span class="muted">${m.phase} — ~${m.shelfDaysRemaining}d</span>`;
    return `<span class="muted">${m.phase || "unwatched"}</span>`;
  }

  const siteTag = (site) => {
    const idx = site.identity.universeIndex !== undefined ? `#${site.identity.universeIndex} ` : "";
    const cond = site.identity.conditionLabel ? `${site.identity.conditionLabel} ` : "";
    return `${idx}${cond}${site.identity.district} (${site.identity.owningFaction})`;
  };

  function legLineFull(job, m, k, withStatus) {
    const v = MJ.siteIntelView(m.site, S.day);
    const gated = m.requiresMission && !m.requiresMission.resolved
      ? ` <span class="gated">[gated by leg ${job.missions.indexOf(m.requiresMission) + 1}]</span>` : "";
    const status = !withStatus ? "" : m.resolved ? ' — <span class="ink">✓ done</span>'
      : (m.requiresMission && !m.requiresMission.resolved) ? "" : ' — <span class="warn">open</span>';
    return `<div class="good">leg ${k + 1}: ${MJ.OBJECTIVE_VERBS[m.objectiveVerb].label} (${m.payloadDomain}) @ ${siteTag(m.site)}${gated}${status}<br>` +
      // The address is a way IN, not a label: accepting a job and then
      // hunting for the site on another tab is a decision unwound for
      // no reason. Click it and you are standing at that location with
      // its card open, choosing what to do there.
      (m.site.identity.name ? `&nbsp;&nbsp;<a class="sitelink" data-act="goto-site" data-sk="${keyFor(m.site, "s")}">"${esc(m.site.identity.name)}"</a>${m.site.identity.theme ? ` <span class="muted">· ${esc(m.site.identity.theme)}</span>` : ""}<br>` : "") +
      `&nbsp;&nbsp;<span class="muted">est P:${fmtAxis(v.physical)} A:${fmtAxis(v.astral)} M:${fmtAxis(v.matrix)}</span></div>`;
  }

  function woundRead(r) {
    if (!r.wounds) return "";
    const max = MJ.physicalTrack(r);
    const dice = Math.floor(r.wounds / 3);
    return `<span class="${r.wounds >= max || dice > 0 ? "warn" : "muted"}">${r.wounds}/${max} boxes${dice > 0 ? ` (−${dice}d)` : ""}</span>`;
  }

  // ── The runner dossier ──────────────────────────────────────────
  // EXPLICIT ALLOWLIST of player-visible fields. `trueArchetype` is
  // hidden truth and the Discipline mispricing system depends on it
  // staying that way, so nothing here iterates the runner generically.
  function runnerLine(r) {
    const c = r.classification;
    const fam = c.family.charAt(0).toUpperCase() + c.family.slice(1);
    const trade = c.focusLabel.toLowerCase() === c.family.toLowerCase() ? fam : `${c.focusLabel} ${fam}`;
    return `<b>${esc(r.identity.handle)}</b> <span class="good">${esc(trade)}</span>`;
  }

  function runnerDetail(r) {
    const a = r.attributes;
    const c = r.classification;
    const eff = MJ.getEffectiveSkills(r);
    // The FULL list including zeros: what a runner cannot do is half
    // the hire decision, so the gaps are greyed rather than filtered.
    const skills = MJ.SKILLS.map((k) => {
      const v = eff[k] || 0;
      return `<span class="${v > 0 ? "" : "z"}">${k}:${v}</span>`;
    }).join("");
    const kit = [
      ...(r.gear || []).map((g) => `${esc(g.label)} T${g.tier}`),
      ...(r.implants || []).map((im) => `⟨${esc(im.label)}⟩`),
    ];
    return `<div class="det"><span class="dk">discipline</span>${esc(MJ.describeDiscipline(r))} ` +
        `<span class="muted">· ${esc(r.identity.metatypeLabel)}, ${esc(c.origin)}${c.deckerAffinity ? " · affinity: " + esc(c.deckerAffinity) : ""}</span></div>` +
      `<div class="det"><span class="dk">attributes</span>B${a.body} A${a.agility} S${a.strength} W${a.willpower} I${a.intelligence} C${a.charisma}` +
        `${a.magic ? " M" + a.magic : ""} <span class="muted">· essence ${r.essence.current}/${r.essence.max} · tracks ${MJ.physicalTrack(r)}P/${MJ.stunTrack(r)}S</span></div>` +
      `<div class="det"><span class="dk">skills</span><div class="skillgrid">${skills}</div></div>` +
      `<div class="det"><span class="dk">condition</span>karma ${r.karma}${r.wounds ? " · " + woundRead(r) : ' · <span class="muted">unhurt</span>'} · ${fmtContract(r)}</div>` +
      `<div class="det"><span class="dk">kit</span>${kit.length ? kit.join(", ") : '<span class="muted">nothing issued</span>'}</div>`;
  }

  function runnerActions(r) {
    const btns = [];
    const h = keyFor(r, "r");
    if (MJ.isHireable(r)) {
      for (const t of ["freelance", "retainer", "permanent"]) {
        btns.push(`<button class="sm" data-act="hire" data-rk="${h}" data-tier="${t}">${t} ¥${MJ.hireCost(r, t)}</button>`);
      }
    }
    if (r.market.hired) {
      const order = ["freelance", "retainer", "permanent"];
      for (const t of ["retainer", "permanent"]) {
        if (order.indexOf(t) > order.indexOf(r.market.hired.tier)) {
          btns.push(`<button class="sm" data-act="upgrade" data-rk="${h}" data-tier="${t}">upgrade→${t} ¥${MJ.upgradeCost(r, t)}</button>`);
        }
      }
      btns.push(`<button class="sm" data-act="release" data-rk="${h}">release</button>`);
    } else if (S.roster.indexOf(r) !== -1) {
      btns.push(`<button class="sm" data-act="unwatch" data-rk="${h}">${r.market.phase === "kia" ? "strike from list" : "unwatch"}</button>`);
    } else {
      btns.push(`<button class="sm" data-act="watch-market" data-rk="${h}">add to watchlist</button>`);
    }
    return `<div class="actionbar">${btns.join(" ")}</div>`;
  }

  const runnerByKey = (k) => S.roster.find((r) => keyFor(r, "r") === k) || S.market.find((r) => keyFor(r, "r") === k);

  // ── Entry shell ─────────────────────────────────────────────────
  function entry(key, title, tag, body) {
    const open = UI.entry === key;
    const focus = !open && UI.focus === key;
    return `<div class="entry${open ? " open" : ""}${focus ? " focus" : ""}">` +
      `<div class="entry-head" data-entry="${esc(key)}">${chev(open)}` +
        `<span class="etitle">${title}</span><span class="etag">${tag || ""}</span></div>` +
      (open ? `<div class="entry-body">${body()}</div>` : "") + "</div>";
  }

  const emptyNote = (s) => `<span class="empty">${esc(s)}</span>`;

  function splitRoster() {
    const crew = [], watch = [];
    for (const r of S.roster) (r.market.hired ? crew : watch).push(r);
    return { crew, watch };
  }

  // In the market EVERY row is unwatched, so saying so tells the
  // player nothing. What they are actually shopping for is the
  // Discipline line — Generalist, or Specialist and at what — since
  // that is the label price is set against and the label that can be
  // WRONG. Reading it against the skills is how bargains get spotted.
  const runnerRows = (list, market) => list.map((r) =>
    entry(keyFor(r, "r"), runnerLine(r),
      market ? esc(MJ.describeDiscipline(r))
             : `${fmtContract(r)}${r.wounds ? " · " + woundRead(r) : ""}`,
      () => runnerDetail(r) + runnerActions(r))).join("");

  // ── Contracts ───────────────────────────────────────────────────
  // The title carries what the decision turns on: the money, how many
  // legs, and WHICH PILLAR each leg is — a two-leg data-then-astral
  // job needs a different bench than two physical smash-and-grabs.
  const DOMAIN_LABEL = { physical: "Physical", data: "Data", astral: "Astral" };
  function jobTitle(job) {
    const pillars = job.missions.map((m) => DOMAIN_LABEL[m.payloadDomain] || m.payloadDomain).join("/");
    const n = job.missions.length;
    // Price, legs, what each leg is, and how long you have — the four
    // things a contract is judged on, in that order. The clock comes
    // last and in amber because it is the one that is running.
    const left = job.expiryDay - S.day;
    const clock = left <= 0 ? "expired" : left === 1 ? "today" : left + "d left";
    return `<b class="w-num">¥${job.pay}</b> <span class="muted">·</span> ${n} Leg${n === 1 ? "" : "s"} ` +
      `<span class="muted">·</span> <span class="good">${esc(pillars)}</span> ` +
      `<span class="muted">·</span> <span class="w-warn">${clock}</span>`;
  }

  function jobDetail(job, withStatus) {
    const left = job.expiryDay - S.day;
    return `<div class="det"><span class="dk">terms</span>¥${job.pay} <span class="muted">· rush x${job.rushMultiplier.toFixed(2)} · ${job.daysPerMission}d per leg · ` +
        `<span class="${left <= 1 ? "warn" : "muted"}">expires day ${job.expiryDay} (${left}d left)</span>${job.chained ? ' · <span class="warn">CHAINED</span>' : ""}</span></div>` +
      `<div class="det"><span class="dk">legs</span>${job.missions.map((m, k) => legLineFull(job, m, k, withStatus)).join("")}</div>`;
  }

  // ── Armory: buy, MAKE, and assign, all in one place ─────────────
  function itemEffectText(t) {
    if (t.category === "cyberware") return Object.entries(t.skillMods).map(([k, v]) => `+${v} ${k}`).join(", ") + ` · −${t.essenceCost} ess (implant)`;
    if (t.category === "armor") return `guards ${MJ.gearBonusForTier(t.tier)} wound(s)/mission`;
    if (t.category === "consumable") return t.effect === "absorbWound" ? "absorbs a wound · single use"
      : `+${MJ.gearBonusForTier(t.tier)}d ${t.skill}, one roll · single use`;
    if (t.category === "program") return `+${MJ.gearBonusForTier(t.tier)}d ${t.skill} (needs a deck)`;
    if (t.category === "formula") return `teaches ${t.spellCategory} spell (casting pending)`;
    return `+${MJ.gearBonusForTier(t.tier)}d ${t.skill}`;
  }

  const crewOptions = (filter) => S.roster.filter((r) => r.market.hired && (!filter || filter(r)))
    .map((r) => `<option value="${keyFor(r, "r")}">${esc(r.identity.handle)}</option>`).join("");

  function itemDetail(item) {
    const t = MJ.ITEM_TEMPLATES[item.templateId];
    const k = keyFor(item, "i");
    const opts = crewOptions();
    const mageOpts = crewOptions((r) => r.classification.family === "mage");
    let controls;
    if (!opts) controls = '<span class="muted">hire someone first</span>';
    else if (t.category === "cyberware") controls = `<select class="armory-sel" data-item="${k}">${opts}</select> <button class="sm" data-act="implant-item" data-ik="${k}">implant</button>`;
    else if (t.category === "formula") controls = mageOpts
      ? `<select class="armory-sel" data-item="${k}">${mageOpts}</select> <button class="sm" data-act="teach-item" data-ik="${k}">teach</button>`
      : '<span class="muted">needs a mage on the crew</span>';
    else controls = `<select class="armory-sel" data-item="${k}">${opts}</select> <button class="sm" data-act="issue-item" data-ik="${k}">issue</button>` +
      (item.issuedTo ? ` <button class="sm" data-act="reclaim-item" data-ik="${k}">reclaim</button>` : "");
    const sell = !item.issuedTo ? ` <button class="sm" data-act="sell-item" data-ik="${k}">sell ¥${Math.round(MJ.itemCost(item.templateId) * 0.4)}</button>` : "";
    return `<div class="det"><span class="dk">effect</span>${esc(itemEffectText(t))}${item.crafted ? ` <span class="good">· crafted q${item.quality}${item.mark ? " “" + esc(item.mark) + "”" : ""}</span>` : ""}</div>` +
      `<div class="det"><span class="dk">held by</span>${item.issuedTo ? `<span class="good">${esc(item.issuedTo.identity.handle)}</span>` : '<span class="muted">storage</span>'}</div>` +
      `<div class="actionbar">${controls}${sell}</div>`;
  }

  // Buying is immediate; CRAFTING occupies a runner for days, which is
  // why both live here — the Armory IS where gear is bought, made and
  // assigned, and a crafted item is always better than the shop's.
  function armoryWidget(cats) {
    const held = S.save.armory.items.filter((it) => !it.consumed &&
      cats.indexOf(MJ.ITEM_TEMPLATES[it.templateId].category) !== -1);
    const rows = held.map((it) => entry(keyFor(it, "i"),
      `${esc(it.label)} <span class="muted">T${MJ.effectiveTier(it)}</span>`,
      it.issuedTo ? esc(it.issuedTo.identity.handle) : "storage",
      () => itemDetail(it))).join("");
    const shop = cats.map((cat) => {
      const ids = Object.keys(MJ.ITEM_TEMPLATES).filter((id) => MJ.ITEM_TEMPLATES[id].category === cat);
      if (!ids.length) return "";
      return `<div class="det"><span class="dk">${cat}</span>` + ids.map((id) => {
        const t = MJ.ITEM_TEMPLATES[id];
        const craftable = t.category !== "cyberware" && t.craftSkill;
        return `<button class="sm" data-act="buy-item" data-tpl="${id}" title="${esc(itemEffectText(t))}">${esc(t.label)} ¥${MJ.itemCost(id)}</button>` +
          (craftable ? `<button class="sm" data-act="craft-item" data-tpl="${id}" title="build it — better than the shop's, and it costs days">⚒</button>` : "");
      }).join(" ") + "</div>";
    }).join("");
    return (rows || emptyNote("nothing on the racks")) +
      `<div class="det" style="margin-top:8px"><span class="dk">buy · ⚒ build</span></div>` + shop;
  }

  // ── Locations ───────────────────────────────────────────────────
  const targetMarks = (site) => {
    const nums = S.jobs.filter((j) => !j.paid && !j.expired && j.missions.some((m) => m.site === site))
      .map((j) => "[" + j.contractNumber + "]");
    return nums.length ? ` <span class="warn">target ${nums.join("")}</span>` : "";
  };

  // RUN IS CONTRACTS ONLY. An astral projection or a host crawl is how
  // you scout or scavenge a place, not a thing you "run" — a Run is an
  // attempt at a contracted objective and nothing else.
  function siteIntents(site) {
    const sk = keyFor(site, "s");
    const legs = [];
    S.jobs.forEach((job) => {
      if (job.paid || job.expired) return;
      job.missions.forEach((m, k) => {
        if (m.resolved || m.site !== site) return;
        const gated = !!(m.requiresMission && !m.requiresMission.resolved);
        legs.push(`<button class="sm" data-act="dispatch" data-sk="${sk}" data-plan="run:${keyFor(job, "j")}:${k}"${gated ? " disabled" : ""}>` +
          `Job #${job.contractNumber} leg ${k + 1} — ${MJ.OBJECTIVE_VERBS[m.objectiveVerb].label} (${m.payloadDomain})${gated ? " [GATED]" : ""}</button>`);
      });
    });
    const hasHost = !!(site.host && site.host.nodes.length > 1);
    const hasResource = site.tags.some((t) => String(t.tag).indexOf("resource:") === 0);
    const btn = (plan, label, on, why) =>
      `<button class="sm" data-act="dispatch" data-sk="${sk}" data-plan="${plan}"${on ? "" : " disabled"}>${label}${on ? "" : " — " + why}</button>`;

    return `<div class="intent"><span class="ik">Run — a contracted objective</span>` +
        (legs.join(" ") || emptyNote("no accepted contract points here — take a job on the Contracts tab")) + `</div>` +
      `<div class="intent"><span class="ik">Recon — go and look</span><div class="actionbar">` +
        MJ.RECON_LENSES.map((l) => btn("recon:" + l, l, true)).join(" ") + `</div></div>` +
      // You go looking for one thing. Scrap and reagents are both a
      // crew walking the place — what differs is the ground: a reagent
      // grove is astrally secured, a scrap yard physically. Paydata is
      // the one that is genuinely a different night, because a decker
      // hits the host without ever going there.
      `<div class="intent"><span class="ik">Scavenge — take what is lying about</span><div class="actionbar">` +
        btn("scav:scrap", "scrap", hasResource, "nothing to harvest here") + " " +
        btn("scav:reagents", "reagents", hasResource, "nothing to harvest here") + " " +
        btn("scav:data", "paydata — hack the host", hasHost, "no host here") +
      `</div></div>`;
  }

  function siteDetail(row, site) {
    return `<div class="det"><span class="dk">address</span>` +
        (row.name ? `<span class="ink">"${esc(row.name)}"</span>${row.theme ? ` <span class="muted">· ${esc(row.theme)}</span>` : ""}` : '<span class="muted">no key on file</span>') + `</div>` +
      `<div class="det"><span class="dk">read</span>value ${row.value} · ${esc(row.orientation)} <span class="muted">· via ${esc(row.source)} day ${row.dayKnown}</span><br>` +
        `P:${fmtAxis(row.security.physical)} A:${fmtAxis(row.security.astral)} M:${fmtAxis(row.security.matrix)}` +
        (row.suppression ? ' <span class="warn">softened today</span>' : "") +
        (row.tags.length ? ` <span class="muted">[${esc(row.tags.join(", "))}]</span>` : "") + `</div>` +
      siteIntents(site);
  }

  // ── The widget registry ─────────────────────────────────────────
  const FAMILIES = ["fighter", "face", "decker", "rigger", "mage"];

  const WIDGETS = {
    runners: [
      { id: "w-hired", label: "Hired", count: () => splitRoster().crew.length,
        sum: () => `${splitRoster().crew.length}/${S.save.johnson.boardCapacity} under contract`,
        body: () => (runnerRows(splitRoster().crew) || emptyNote("nobody under contract")) +
          `<div class="actionbar"><button class="sm" data-act="expand-capacity">expand capacity — more crew slots</button></div>` },
      { id: "w-watch", label: "Watchlist", count: () => splitRoster().watch.length,
        sum: () => `${S.roster.length}/${MJ.game.watchCapacity(S)} watched`,
        body: () => runnerRows(splitRoster().watch) || emptyNote("nobody on watch") },
      { id: "w-market", label: "Market", count: () => S.market.length,
        sum: () => "scout a class, or take the street as it comes",
        body: () => `<div class="scout"><select id="scout-select">` +
            `<option value="">any class</option>` +
            FAMILIES.map((f) => `<option value="${f}"${UI.scout === f ? " selected" : ""}>${f}</option>`).join("") +
          `</select><button class="sm" data-act="refresh-market">sweep the circuit ¥100</button>` +
          `<span class="muted">a sweep costs, so the draw is a decision</span></div>` +
          (runnerRows(S.market, true) || emptyNote("market is empty")) },
    ],
    contracts: [
      { id: "w-active", label: "Active", count: () => S.jobs.filter((j) => !j.paid && !j.expired).length,
        sum: () => "accepted, unfinished",
        body: () => S.jobs.filter((j) => !j.paid && !j.expired).map((job) =>
          entry(keyFor(job, "j"), jobTitle(job), esc(job.hiringFaction), () => jobDetail(job, true))).join("")
          || emptyNote("no active contracts") },
      { id: "w-available", label: "Available", count: () => S.board.length,
        sum: () => "the job board",
        body: () => `<div class="actionbar"><button class="sm" data-act="refresh-board">refresh the board</button></div>` +
          (S.board.map((e) => entry(keyFor(e.job, "j"), jobTitle(e.job), esc(e.job.hiringFaction),
            () => jobDetail(e.job, false) +
              `<div class="actionbar"><button class="sm" data-act="accept" data-jk="${keyFor(e.job, "j")}">accept this contract</button></div>`
          )).join("") || emptyNote("no offers — refresh the board")) },
      // A LOG, not a subsystem. Pinned to the bottom, never floated up
      // by the teaching order, never opened for you.
      { id: "w-completed", label: "Completed", pinLast: true,
        count: () => S.jobs.filter((j) => j.paid || j.expired).length,
        sum: () => "a record — no in-game function",
        body: () => S.jobs.filter((j) => j.paid || j.expired).map((job) =>
          `<div class="entry"><div class="entry-head"><span class="chev"></span><span class="etitle">` +
          (job.paid ? `<span class="good">✓</span> #${job.contractNumber} ${esc(job.hiringFaction)}`
            : `<span class="warn">✗</span> #${job.contractNumber} ${esc(job.hiringFaction)}`) +
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
      { id: "w-sites", label: "Locations", wide: true, count: () => S.knownSites.length,
        sum: () => "everywhere you have been, and anywhere you can name",
        body: () => {
          const lookup = `<div class="det"><span class="dk">call in a site by key</span>` +
            `<input type="text" class="sm" id="site-lookup" placeholder="Boldly-Quiet-Crimson-Bicycle-0417" /> ` +
            `<button class="sm" data-act="discover-name">look it up</button></div>` +
            `<div class="det"><span class="dk">or send someone to find one</span>` +
            `<button class="sm" data-act="dispatch" data-plan="search:scrap">search out a scrap yard</button> ` +
            `<button class="sm" data-act="dispatch" data-plan="search:reagents">search out a reagent grove</button></div>`;
          if (!S.knownSites.length) return lookup + emptyNote("no known sites — accept a job, search, or call one in");
          return lookup + MJ.siteListView(S.knownSites, S.day).map((row, i) => {
            const site = S.knownSites[i];
            return entry(keyFor(site, "s"),
              `${row.universeIndex !== null ? "#" + row.universeIndex + " " : ""}<b>${esc(row.district)}</b> <span class="muted">(${esc(row.owningFaction)})</span>${targetMarks(site)}`,
              `v${row.value} ${esc(row.orientation)}`, () => siteDetail(row, site));
          }).join("");
        } },
    ],
  };

  for (const w of WIDGETS.armory) {
    if (w.medicae) {
      w.count = () => S.roster.filter((r) => r.market.hired && r.wounds > 0).length;
      w.sum = () => "wounds always; surgery needs a Street Doc";
      w.body = () => {
        const hurt = S.roster.filter((r) => r.market.hired && r.wounds > 0);
        if (!hurt.length) return emptyNote("nobody is carrying anything");
        return hurt.map((r) => entry(keyFor(r, "r"), runnerLine(r), woundRead(r), () =>
          `<div class="det"><span class="dk">case</span>${r.wounds} box(es) <span class="muted">· essence spent ${(r.essence.max - r.essence.current).toFixed(1)} — chrome complicates surgery</span></div>` +
          `<div class="actionbar"><button class="sm" data-act="dispatch" data-plan="treat:${keyFor(r, "r")}">assign a medic</button></div>`)).join("");
      };
    } else {
      const cats = w.cats;
      w.count = () => S.save.armory.items.filter((it) => !it.consumed && cats.indexOf(MJ.ITEM_TEMPLATES[it.templateId].category) !== -1).length;
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

  // ── Teaching order ──────────────────────────────────────────────
  // LATCHED, NOT DERIVED: a motion performed once is remembered
  // forever, so this retires itself instead of dragging the beginner
  // layout back the day a veteran releases their last runner.
  // No words — the border lighting up and the widget floating to the
  // top of the tab is the whole instruction.
  const TEACHING = {
    runners: [{ motion: "watched", lead: "w-market" }, { motion: "hired", lead: "w-watch" }],
    contracts: [{ motion: "accepted", lead: "w-available" }],
  };
  const learned = () => (S.save.johnson.learned = S.save.johnson.learned || {});
  const learn = (m) => { learned()[m] = true; };
  function healLearned() {
    const L = learned();
    if (S.roster.length) L.watched = true;
    if (S.roster.some((r) => r.market.hired)) L.hired = true;
    if (S.jobs.length) L.accepted = true;
  }
  const teachingFor = (tab) => (TEACHING[tab] || []).find((t) => !learned()[t.motion]) || null;

  // ── Render ──────────────────────────────────────────────────────
  function renderFrame() {
    const j = S.save.johnson;
    const stat = (k, v) => `<div class="frame-stat"><span class="k">${k}</span><span class="v">${v}</span></div>`;
    $("frame").innerHTML =
      `<div class="frame-stats">${stat("Day", S.day)}${stat("Nuyen", "¥" + j.money)}${stat("Rep", j.reputation)}${stat("Capacity", j.boardCapacity)}</div>`;
  }

  // ── The plan rail ───────────────────────────────────────────────
  // Not a panel you visit — the thing you build all day. Each queued
  // dispatch shows what the player needs to judge the SHAPE of the
  // day at a glance: where it is, what is guarding it, who is going,
  // and what that crew actually brings on each axis. Comparing those
  // last two against each other IS the decision.
  function crewShape(runners) {
    if (!runners.length) return '<span class="muted">nobody assigned</span>';
    const cap = MJ.crewCapability(runners);
    return runners.map((r) => `${esc(r.identity.handle)} <span class="muted">${esc(r.classification.focusLabel)}</span>`).join("<br>") +
      `<div style="margin-top:3px"><span class="muted">brings P:</span><b class="w-num">${cap.physical}d</b>` +
      `<span class="muted"> A:</span><b class="w-num">${cap.astral}d</b>` +
      `<span class="muted"> M:</span><b class="w-num">${cap.matrix}d</b></div>`;
  }

  function siteSecurityLine(site) {
    if (!site) return '<span class="muted">not at a site</span>';
    const v = MJ.siteIntelView(site, S.day);
    return `P:${fmtAxis(v.physical)} A:${fmtAxis(v.astral)} M:${fmtAxis(v.matrix)}`;
  }

  function renderPlanRail() {
    document.body.classList.add("railed");
    const cards = S.queue.map((q, i) => {
      const site = q.mission && q.mission.site;
      return `<div class="qcard">` +
        `<div class="qcard-head"><span class="qn">${i + 1}</span><span class="qlabel">${esc(q.label)}</span>` +
          `<span class="qcard-ops">` +
            `<button class="sm" data-act="queue-up" data-idx="${i}">↑</button>` +
            `<button class="sm" data-act="queue-down" data-idx="${i}">↓</button>` +
            `<button class="sm" data-act="queue-del" data-idx="${i}">✕</button>` +
          `</span></div>` +
        `<div class="qcard-body">` +
          `<div class="qrow"><span class="qk">guarding it</span>${siteSecurityLine(site)}</div>` +
          `<div class="qrow"><span class="qk">going</span>${crewShape(q.runners)}</div>` +
        `</div></div>`;
    }).join("");
    $("planrail").innerHTML =
      `<div class="planrail-head"><span class="pt">today's plan</span><span class="pn">${S.queue.length}</span>` +
        `<span class="muted" style="font-size:0.74rem">queued</span></div>` +
      `<div class="planrail-body">${cards || emptyNote("nothing queued yet — pick a location and choose what to do there")}</div>` +
      ((S.lastPlan || []).length
        ? `<div class="planrail-foot"><button class="sm" data-act="repeat-plan">requeue yesterday</button></div>` : "");
  }

  function renderTabs() {
    $("tabbar").innerHTML = TABS.map((t) =>
      `<button class="tab${UI.tab === t.id ? " active" : ""}" data-act="tab" data-tab="${t.id}">${esc(t.label)}<span class="badge">${t.count()}</span></button>`).join("");
  }

  function renderBody() {
    const teach = teachingFor(UI.tab);
    let list = (WIDGETS[UI.tab] || []).slice();
    const pinned = list.filter((w) => w.pinLast);
    list = list.filter((w) => !w.pinLast);
    if (teach) {
      const i = list.findIndex((w) => w.id === teach.lead);
      if (i > 0) list.unshift(list.splice(i, 1)[0]);
      if (UI.led[UI.tab] !== teach.lead) { UI.led[UI.tab] = teach.lead; UI.open.add(teach.lead); }
    }
    list = list.concat(pinned);
    // A widget that just stopped being empty opens itself, so the
    // thing the player put there is visibly THERE. The widget only —
    // never the card, which would throw a dossier at somebody who
    // asked for a list.
    $("tabbody").innerHTML = list.map((w) => {
      const open = UI.open.has(w.id);
      const n = w.count();
      const leading = teach && teach.lead === w.id;
      return `<div class="widget${w.wide ? " wide" : ""}${n === 0 && !leading ? " dark" : ""}${leading ? " teach" : ""}" data-widget="${w.id}">` +
        `<div class="widget-head" data-act="widget" data-wid="${w.id}">${chev(open)}` +
          `<span class="wname">${esc(w.label)}</span><span class="wcount">${n}</span><span class="wsum">${esc(w.sum())}</span></div>` +
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
      ["frame", "planrail", "tabbar", "tabbody"].forEach((id) => { $(id).innerHTML = ""; });
      document.body.classList.remove("railed");
      return;
    }
    $("statline").textContent = `Universe "${S.universeSeed}"`;
    healLearned();
    for (const tab of Object.keys(WIDGETS)) {
      for (const w of WIDGETS[tab]) {
        const n = w.count();
        if (UI.counts[w.id] === undefined) UI.counts[w.id] = n;
        else if (UI.counts[w.id] === 0 && n > 0) { UI.open.add(w.id); UI.counts[w.id] = n; }
        else UI.counts[w.id] = n;
      }
    }
    renderFrame();
    renderPlanRail();
    renderTabs();
    renderBody();
    renderLog();
    renderCrewDialog();
  }

  // ── The dispatch dialog ─────────────────────────────────────────
  // The checkbox row broke past four runners, and worse, it made you
  // unwind a decision to go hire the specialist you just realised you
  // were missing. This is the whole roster, in front of the job:
  // look at anyone, hire on the spot, then commit.
  function renderCrewDialog() {
    let host = $("crew-host");
    if (!UI.pending) { if (host) host.remove(); return; }
    if (!host) {
      host = document.createElement("div");
      host.id = "crew-host";
      document.body.appendChild(host);
    }
    const picked = [...UI.crew].filter((r) => S.roster.indexOf(r) !== -1 && MJ.isDispatchable(r));
    const full = picked.length >= MAX_CREW;
    const site = UI.pending.mission && UI.pending.mission.site;
    const cap = MJ.crewCapability(picked);
    const sections = { hired: splitRoster().crew, watchlist: splitRoster().watch, market: S.market };
    const rows = (sections[UI.crewTab] || []).map((r) => {
      const k = keyFor(r, "r");
      const on = UI.crew.has(r);
      const usable = UI.crewTab === "hired" && MJ.isDispatchable(r) && (on || !full);
      const open = UI.entry === "pick:" + k;
      return `<div class="pick${on ? " on" : ""}${usable || UI.crewTab !== "hired" ? "" : " out"}">` +
        `<div class="pick-head" data-entry="pick:${k}">` +
          `<span class="box">${UI.crewTab === "hired" ? (on ? "◼" : usable ? "◻" : "·") : "·"}</span>` +
          `<span class="who">${runnerLine(r)}</span>` +
          `<span class="cost">${UI.crewTab === "market" ? "¥" + MJ.hireCost(r, "freelance") + "/mission" : fmtContract(r)}</span>` +
          (usable ? ` <button class="sm" data-act="crew-toggle" data-rk="${k}">${on ? "drop" : "assign"}</button>` : "") +
        `</div>` +
        (open ? `<div class="pick-body">${runnerDetail(r)}${runnerActions(r)}</div>` : "") + `</div>`;
    }).join("") || emptyNote("nobody here");
    host.innerHTML =
      `<div class="crew-scrim"><div class="crew-modal">` +
        `<div class="crew-head">` +
          `<div class="cwhat"><div class="ct">assign a crew</div><div class="cs">${esc(UI.pending.label)}</div></div>` +
          // What is waiting, opposite what you are bringing — the
          // comparison IS the decision, so it should not need a tab
          // change to make.
          `<div class="csec"><span class="sk">what is guarding it</span>${siteSecurityLine(site)}</div>` +
        `</div>` +
        `<div class="crew-tabs">` +
          ["hired", "watchlist", "market"].map((t) =>
            `<button class="tab${UI.crewTab === t ? " active" : ""}" data-act="crew-tab" data-ct="${t}">${t}<span class="badge">${(sections[t] || []).length}</span></button>`).join("") +
        `</div>` +
        `<div class="crew-body">${rows}</div>` +
        `<div class="crew-foot">` +
          `<span class="slots${full ? " full" : ""}">${picked.length}/${MAX_CREW} slots</span>` +
          (picked.length
            ? `<span class="muted"> — brings P:</span><b class="w-num">${cap.physical}d</b><span class="muted"> A:</span><b class="w-num">${cap.astral}d</b><span class="muted"> M:</span><b class="w-num">${cap.matrix}d</b>`
            : '<span class="muted"> — nobody assigned yet</span>') +
          `<span class="spacer"></span>` +
          `<button class="sm" data-act="crew-cancel">cancel</button>` +
          `<button class="sm" data-act="crew-confirm"${picked.length ? "" : " disabled"} style="border-color:var(--accent);color:var(--accent)">queue it</button>` +
        `</div>` +
      `</div></div>`;
  }

  // ── Building the dispatch a plan string names ───────────────────
  function buildPlan(plan, site) {
    const tag = site ? siteTag(site) : "";
    if (plan.indexOf("run:") === 0) {
      // run:<jobKey>:<legIndex>, and the job key itself contains a
      // colon — so split from the END rather than the front.
      const cut = plan.lastIndexOf(":");
      const job = S.jobs.find((j) => keyFor(j, "j") === plan.slice(4, cut));
      const k = +plan.slice(cut + 1);
      if (!job || !job.missions[k]) return null;
      return { mission: job.missions[k], label: `Job #${job.contractNumber} leg ${k + 1} @ ${tag}` };
    }
    if (plan.indexOf("recon:") === 0) {
      const lens = plan.split(":")[1];
      return { mission: MJ.createReconMission(site, lens), label: `recon ${lens} @ ${tag}` };
    }
    if (plan === "scav:scrap") return { mission: MJ.createResourceMission(site, "scrap"), label: `scrap harvest @ ${tag}` };
    if (plan === "scav:reagents") return { mission: MJ.createResourceMission(site, "reagents"), label: `reagent harvest @ ${tag}` };
    if (plan === "scav:data") return { mission: MJ.createMatrixMission(site, { wantData: true }), label: `paydata run @ ${tag}` };
    if (plan.indexOf("search:") === 0) {
      const kind = plan.split(":")[1];
      return { mission: MJ.game.makeSearchMission(S, kind), label: "search: " + kind };
    }
    if (plan.indexOf("treat:") === 0) {
      const r = runnerByKey(plan.slice(6));
      return r ? { mission: MJ.createMedicalMission(r), label: "treat " + r.identity.handle } : null;
    }
    if (plan.indexOf("craft:") === 0) {
      const tpl = plan.slice(6);
      return { mission: MJ.createCraftingMission(tpl), label: "craft " + MJ.ITEM_TEMPLATES[tpl].label };
    }
    return null;
  }

  // ── Playing the day ─────────────────────────────────────────────
  function playDay() {
    const day = MJ.game.beginDay(S);
    const pending = day.entries.slice();
    step();
    function step() {
      while (pending.length && pending[0].done) MJ.game.resolveEntry(S, day, pending.shift());
      if (!pending.length) { MJ.game.settleDay(S, day); UI.crew.clear(); render(); return; }
      MJ.missionPopup.play(S, day, pending.shift(), () => { render(); step(); });
    }
  }

  // ── Actions ─────────────────────────────────────────────────────
  // An expanded card that gets REMOVED must not hand you the next
  // dossier wide open. Note where it sat, then highlight whatever
  // slid into that slot — highlighted, never expanded.
  function entrySlot(key) {
    const el = document.querySelector(`[data-entry="${CSS.escape(key)}"]`);
    if (!el) return null;
    const widget = el.closest("[data-widget]");
    if (!widget) return null;
    const all = [...widget.querySelectorAll("[data-entry]")];
    return { wid: widget.dataset.widget, idx: all.indexOf(el) };
  }

  function focusSlot(slot) {
    if (!slot) return;
    const widget = document.querySelector(`[data-widget="${slot.wid}"]`);
    if (!widget) return;
    const all = [...widget.querySelectorAll("[data-entry]")];
    if (!all.length) return;
    const next = all[Math.min(slot.idx, all.length - 1)];
    UI.focus = next.dataset.entry;
  }

  function act(action, el) {
    if (action === "new-game") {
      S = MJ.game.newGame($("universe-seed").value.trim() || undefined);
      MJ.game.refreshBoard(S);
      UI.crew.clear(); UI.entry = null; UI.focus = null; UI.pending = null;
      render(); return;
    }
    if (action === "load-game") {
      MJ.game.loadSession().then((loaded) => {
        if (loaded) { S = loaded; UI.crew.clear(); UI.entry = null; UI.focus = null; UI.pending = null; }
        else $("statline").textContent = "No save found — start a New Game.";
        render();
      });
      return;
    }
    if (action === "save-game") { if (S) MJ.game.saveSession(S).then(render); return; }

    // View state — leaving a tab closes every card.
    if (action === "tab") { UI.tab = el.dataset.tab; UI.entry = null; UI.focus = null; render(); return; }
    if (action === "widget") {
      const id = el.dataset.wid;
      UI.open.has(id) ? UI.open.delete(id) : UI.open.add(id);
      render(); return;
    }

    if (!S) { $("statline").textContent = "Start a New Game first."; return; }
    const idx = el && el.dataset.idx !== undefined ? +el.dataset.idx : -1;

    // Opening the dispatch dialog.
    if (action === "dispatch") {
      const site = el.dataset.sk ? S.knownSites.find((x) => keyFor(x, "s") === el.dataset.sk) : null;
      const built = buildPlan(el.dataset.plan, site);
      if (!built || !built.mission) return;
      UI.pending = built; UI.crew.clear(); UI.crewTab = "hired"; UI.entry = null;
      render(); return;
    }
    // A site link is navigation, not a command: land on Locations with
    // that address already open and its intents in front of you.
    if (action === "goto-site") {
      const site = S.knownSites.find((x) => keyFor(x, "s") === el.dataset.sk);
      if (site) {
        UI.tab = "locations";
        UI.open.add("w-sites");
        UI.entry = keyFor(site, "s");
        UI.focus = null;
      }
      render(); return;
    }
    if (action === "crew-tab") { UI.crewTab = el.dataset.ct; UI.entry = null; render(); return; }
    if (action === "crew-cancel") { UI.pending = null; UI.crew.clear(); render(); return; }
    if (action === "crew-toggle") {
      const r = runnerByKey(el.dataset.rk);
      if (r) {
        if (UI.crew.has(r)) UI.crew.delete(r);
        else if (UI.crew.size < MAX_CREW) UI.crew.add(r);
      }
      render(); return;
    }
    if (action === "crew-confirm") {
      const crew = [...UI.crew].filter((r) => MJ.isDispatchable(r)).slice(0, MAX_CREW);
      const res = MJ.game.queueDispatch(S, UI.pending.mission, crew, UI.pending.label);
      if (!res.ok) MJ.game.note(S, "can't queue — " + res.error, "dispatch", { refused: true });
      else { UI.pending = null; UI.crew.clear(); }
      render(); return;
    }

    const openBefore = UI.entry;
    const slot = openBefore ? entrySlot(openBefore) : null;

    if (action === "refresh-board") MJ.game.refreshBoard(S);
    else if (action === "refresh-market") {
      const sel = $("scout-select");
      UI.scout = sel ? sel.value : "";
      const res = MJ.game.refreshMarket(S, UI.scout || undefined);
      if (res && res.ok === false) MJ.game.note(S, res.error, "money", { refused: true });
    }
    else if (action === "expand-capacity") MJ.game.expandCapacity(S);
    else if (action === "end-day") { playDay(); return; }
    else if (action === "quick-day") { MJ.game.endDay(S); UI.crew.clear(); }
    else if (action === "accept") {
      const job = S.board.map((e) => e.job).find((j) => keyFor(j, "j") === el.dataset.jk);
      const i = S.board.findIndex((e) => e.job === job);
      if (i >= 0 && ok(MJ.game.acceptJob(S, i))) learn("accepted");
    }
    else if (action === "watch-market") {
      const r = runnerByKey(el.dataset.rk);
      const i = S.market.indexOf(r);
      if (i >= 0 && ok(MJ.game.watchFromMarket(S, i))) learn("watched");
    }
    else if (action === "hire") { if (ok(MJ.game.hire(S, runnerByKey(el.dataset.rk), el.dataset.tier))) learn("hired"); }
    else if (action === "upgrade") MJ.game.upgrade(S, runnerByKey(el.dataset.rk), el.dataset.tier);
    else if (action === "release") MJ.game.release(S, runnerByKey(el.dataset.rk));
    else if (action === "unwatch") MJ.game.unwatch(S, runnerByKey(el.dataset.rk));
    else if (action === "repeat-plan") MJ.game.repeatLastPlan(S);
    else if (action === "repeat-one") MJ.game.repeatOne(S, idx);
    else if (action === "buy-item") MJ.game.buyGear(S, el.dataset.tpl);
    else if (action === "craft-item") {
      const built = buildPlan("craft:" + el.dataset.tpl, null);
      if (built) { UI.pending = built; UI.crew.clear(); UI.crewTab = "hired"; UI.entry = null; render(); return; }
    }
    else if (action === "sell-item") MJ.game.sellGear(S, itemByKey(el.dataset.ik));
    else if (action === "reclaim-item") MJ.game.issueGear(S, itemByKey(el.dataset.ik), null);
    else if (action === "issue-item" || action === "implant-item" || action === "teach-item") {
      const sel = document.querySelector(`.armory-sel[data-item="${CSS.escape(el.dataset.ik)}"]`);
      const runner = sel && sel.value ? runnerByKey(sel.value) : null;
      const item = itemByKey(el.dataset.ik);
      if (runner && item) {
        if (action === "issue-item") MJ.game.issueGear(S, item, runner);
        else if (action === "implant-item") MJ.game.implantGear(S, item, runner);
        else MJ.game.teachGear(S, item, runner);
      }
    }
    else if (action === "discover-name") {
      const box = $("site-lookup");
      if (box && box.value.trim()) MJ.game.discoverByName(S, box.value);
    }
    else if (action === "queue-up") MJ.game.moveQueued(S, idx, -1);
    else if (action === "queue-down") MJ.game.moveQueued(S, idx, 1);
    else if (action === "queue-del") MJ.game.unqueue(S, idx);

    render();
    // Did the open card just leave the widget it was open in? Scoped
    // to THAT WIDGET on purpose: unwatching does not destroy a runner,
    // it hands them back to the market, so a document-wide check would
    // see the card still existing somewhere and leave it hanging open
    // in a list the player was not looking at.
    if (openBefore && UI.entry === openBefore && slot && !stillIn(slot.wid, openBefore)) {
      UI.entry = null;
      focusSlot(slot);
      render();
    }
  }

  function stillIn(wid, key) {
    const widget = document.querySelector(`[data-widget="${wid}"]`);
    return !!(widget && widget.querySelector(`[data-entry="${CSS.escape(key)}"]`));
  }

  const itemByKey = (k) => S.save.armory.items.find((it) => keyFor(it, "i") === k);

  MJ.ui = { session: () => S, play: playDay, state: UI };

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (btn) { act(btn.dataset.act, btn); return; }
    const ent = e.target.closest("[data-entry]");
    if (ent && S) {
      const k = ent.dataset.entry;
      // ONE CARD AT A TIME: opening one closes whatever was open.
      UI.entry = UI.entry === k ? null : k;
      UI.focus = null;
      render();
    }
  });

  window.addEventListener("DOMContentLoaded", render);
})();
