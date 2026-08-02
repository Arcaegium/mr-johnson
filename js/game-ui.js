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
    return `<span class="muted">${m.phase || "unwatched"}</span>`;
  }

  // ── Objective encoding for the dispatch builder ─────────────────
  function objectiveOptions() {
    const opts = [];
    for (const o of MJ.game.availableJobObjectives(S)) {
      const verb = MJ.OBJECTIVE_VERBS[o.mission.objectiveVerb].label;
      const where = o.mission.site.identity.district;
      opts.push({
        key: `job:${o.jobIndex}:${o.legIndex}`,
        label: `${verb} (${o.mission.payloadDomain}) @ ${where} — ${o.job.hiringFaction} leg ${o.legIndex + 1}${o.gated ? " [GATED]" : ""}`,
        disabled: o.gated,
      });
    }
    S.knownSites.forEach((site, i) => {
      for (const lens of MJ.RECON_LENSES) {
        opts.push({ key: `recon:${i}:${lens}`, label: `recon ${lens} @ #${site.identity.universeIndex} ${site.identity.district}` });
      }
      if (site.tags.some((t) => String(t.tag).indexOf("resource:") === 0)) {
        opts.push({ key: `harvest:${i}`, label: `harvest @ #${site.identity.universeIndex} ${site.identity.district}` });
      }
    });
    opts.push({ key: "craft", label: "craft at the hub (item T3)" });
    S.roster.forEach((r, i) => {
      if (r.wounds > 0) opts.push({ key: `med:${i}`, label: `Medicae: treat ${r.identity.handle} (${r.wounds} wound(s))` });
    });
    return opts;
  }

  function buildMissionFromKey(key) {
    const p = key.split(":");
    if (p[0] === "job") {
      const job = S.jobs[+p[1]];
      const mission = job.missions[+p[2]];
      const verb = MJ.OBJECTIVE_VERBS[mission.objectiveVerb].label;
      return { mission: mission, label: `${verb} @ ${mission.site.identity.district} (${job.hiringFaction} leg ${+p[2] + 1})` };
    }
    if (p[0] === "recon") {
      const site = S.knownSites[+p[1]];
      return { mission: MJ.createReconMission(site, p[2]), label: `recon ${p[2]} @ #${site.identity.universeIndex}` };
    }
    if (p[0] === "harvest") {
      const site = S.knownSites[+p[1]];
      return { mission: MJ.createResourceMission(site), label: `harvest @ #${site.identity.universeIndex}` };
    }
    if (p[0] === "med") {
      const patient = S.roster[+p[1]];
      return { mission: MJ.createMedicalMission(patient), label: `treat ${patient.identity.handle}` };
    }
    return { mission: MJ.createCraftingMission(3), label: "craft (T3)" };
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
        return `<div class="muted">leg ${k + 1}: ${MJ.OBJECTIVE_VERBS[m.objectiveVerb].label} (${m.payloadDomain}) vs ${m.targetFaction} @ ${m.site.identity.district}${gated}<br>&nbsp;&nbsp;est P:${fmtAxis(v.physical)} A:${fmtAxis(v.astral)} M:${fmtAxis(v.matrix)}</div>`;
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
    const skills = Object.entries(r.skills)
      .filter(([, v]) => v > 0)
      .sort((x, y) => y[1] - x[1])
      .map(([k, v]) => `${k}:${Math.floor(v)}`)
      .join("  ");
    return `<b>${r.identity.handle}</b> — <span class="good">${MJ.describeDiscipline(r)}</span> <span class="muted">· ${c.focusLabel} ${c.family} · ${r.identity.metatypeLabel}, ${c.origin}${c.deckerAffinity ? " · " + c.deckerAffinity : ""}</span><br>` +
      `<span class="muted">B${a.body} A${a.agility} W${a.willpower} I${a.intelligence} C${a.charisma}${a.magic ? " M" + a.magic : ""} · ess ${a.magic || c.origin === "cyber" ? r.essence.current + "/" + r.essence.max : r.essence.current}</span><br>` +
      `<span class="muted">${skills || "no visible skills"}</span>`;
  }

  function renderRoster() {
    if (S.roster.length === 0) { $("panel-roster").innerHTML = '<span class="muted">Nobody yet — watch someone from the market below.</span>'; return; }
    $("panel-roster").innerHTML = S.roster.map((r, i) => {
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
    }).join("");
  }

  function renderMarket() {
    $("panel-market").innerHTML = S.market.map((r, i) =>
      `<div class="row">${runnerCard(r)}<br>` +
      `<span class="muted">asking price ${MJ.computePrice(r)} (freelance ¥${MJ.hireCost(r, "freelance")})</span> ` +
      `<button class="sm" data-act="watch-market" data-idx="${i}">watch</button></div>`
    ).join("") || '<span class="muted">Market is empty (impossible — report this).</span>';
  }

  function renderSites() {
    if (S.knownSites.length === 0) { $("panel-sites").innerHTML = '<span class="muted">No known sites — accept a job or discover one.</span>'; return; }
    const feedHits = new Set(MJ.jobsAtWatchedSites(S.board.map((e) => e.job), S.knownSites).map((h) => h.site));
    $("panel-sites").innerHTML = MJ.siteListView(S.knownSites, S.day).map((row, i) => {
      const site = S.knownSites[i];
      const feed = feedHits.has(site) ? ' <span class="warn">⚑ CONTRACT ON BOARD</span>' : "";
      return `<div class="row">#${row.universeIndex} <b>${row.district}</b> (${row.owningFaction}) v:${row.value} ${row.orientation} <span class="muted">via ${row.source} d${row.dayKnown}</span>${feed}<br>` +
        `P:${fmtAxis(row.security.physical)} A:${fmtAxis(row.security.astral)} M:${fmtAxis(row.security.matrix)}` +
        (row.tags.length ? ` <span class="muted">[${row.tags.join(", ")}]</span>` : "") +
        ` <button class="sm" data-act="watch-site" data-idx="${i}">${row.watched ? "unwatch" : "watch"}</button></div>`;
    }).join("");
  }

  function renderDispatch() {
    const prevKey = $("objective-select") ? $("objective-select").value : null;
    const prevCrew = new Set(Array.from(document.querySelectorAll(".crew-check:checked")).map((c) => c.dataset.ridx));
    const opts = objectiveOptions();
    const optHtml = opts.map((o) => `<option value="${o.key}"${o.disabled ? " disabled" : ""}${o.key === prevKey ? " selected" : ""}>${o.label}</option>`).join("");
    const dispatchable = S.roster.map((r, i) => ({ r, i })).filter((x) => MJ.isDispatchable(x.r));
    const checks = dispatchable.map((x) =>
      `<label><input type="checkbox" class="crew-check" data-ridx="${x.i}"${prevCrew.has(String(x.i)) ? " checked" : ""}> ${x.r.identity.handle}</label>`).join("");
    const queue = S.queue.map((q, i) =>
      `<div class="queue-item"><span class="muted">${i + 1}.</span> ${q.label} <span class="muted">[${q.runners.map((r) => r.identity.handle).join(", ")}]</span>` +
      ` <button class="sm" data-act="queue-up" data-idx="${i}">↑</button><button class="sm" data-act="queue-down" data-idx="${i}">↓</button><button class="sm" data-act="queue-del" data-idx="${i}">✕</button></div>`).join("");
    $("panel-dispatch").innerHTML =
      `<div><select id="objective-select">${optHtml || "<option disabled>no objectives yet</option>"}</select></div>` +
      `<div class="checks" style="margin:8px 0">${checks || '<span class="muted">no dispatchable runners — hire someone (a dispatch is what a contract buys)</span>'}</div>` +
      `<button class="sm" data-act="queue-add">Add to Queue</button>` +
      `<div style="margin-top:10px">${queue || '<span class="muted">Queue is empty — End Day will just tick the world.</span>'}</div>` +
      `<div class="muted" style="margin-top:6px">Queue resolves top-to-bottom, one action per runner per day. Recon first pays: fresh intel = +1 die at that site.</div>`;
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
    renderRoster();
    renderMarket();
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
      render();
      return;
    }
    if (!S) { $("statline").textContent = "Start a New Game first."; return; }
    const idx = el && el.dataset.idx !== undefined ? +el.dataset.idx : -1;
    if (action === "refresh-board") MJ.game.refreshBoard(S);
    else if (action === "expand-capacity") MJ.game.expandCapacity(S);
    else if (action === "discover") MJ.game.discoverResource(S, $("discover-kind").value);
    else if (action === "end-day") MJ.game.endDay(S);
    else if (action === "accept") MJ.game.acceptJob(S, idx);
    else if (action === "watch-market") MJ.game.watchFromMarket(S, idx);
    else if (action === "hire") MJ.game.hire(S, S.roster[+el.dataset.ridx], el.dataset.tier);
    else if (action === "release") MJ.game.release(S, S.roster[+el.dataset.ridx]);
    else if (action === "unwatch") MJ.game.unwatch(S, S.roster[+el.dataset.ridx]);
    else if (action === "watch-site") MJ.game.toggleWatchSite(S, S.knownSites[idx]);
    else if (action === "queue-up") MJ.game.moveQueued(S, idx, -1);
    else if (action === "queue-down") MJ.game.moveQueued(S, idx, 1);
    else if (action === "queue-del") MJ.game.unqueue(S, idx);
    else if (action === "queue-add") {
      const sel = $("objective-select");
      if (!sel || !sel.value) return;
      const crew = Array.from(document.querySelectorAll(".crew-check:checked")).map((c) => S.roster[+c.dataset.ridx]);
      const built = buildMissionFromKey(sel.value);
      const res = MJ.game.queueDispatch(S, built.mission, crew, built.label);
      if (!res.ok) S.log.push("day " + S.day + ": can't queue — " + res.error);
    }
    render();
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (el) act(el.dataset.act, el);
  });

  window.addEventListener("DOMContentLoaded", render);
})();
