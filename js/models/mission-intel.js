/* ============================================================
   Mr. Johnson - models/mission-intel.js
   WHAT THE CREW HONESTLY KNOWS, AND WHAT THEY SOFTENED.

   Split out of mission.js. Three small systems that share one
   subject - the player's INFORMATION about a site, as opposed to the
   site's truth - and are otherwise unrelated to resolving anything:

     THE LIVE READ   axisTally / axisProven. Whether a leg has met
                     enough of an axis to confirm what it really is.
                     A LEG IS THE SAMPLE: walk the route, meet what is
                     on it, and by the end you have seen what there
                     was to see. Nothing accumulates across visits,
                     because everything at a site resets nightly and
                     the ratchet is what carries change forward.
     RECON           which obstacles a scouting pass examines.
     SUPPRESSION     what a successful mission leaves behind - a
                     looped camera, a cracked ward - as dice against
                     that axis for the rest of the DAY, never longer.

   THE RULE THIS FILE EXISTS TO PROTECT: a responder raises what an
   axis can be PROVEN to reach, but never joins the census of what
   was faced. Noise calls out what the building could already do; it
   does not manufacture evidence about the building.

   It reads runs and sites and returns verdicts. It resolves nothing,
   rolls nothing, and writes nothing but the day's suppression mark.
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  const INTEL_FRESH_DAYS = 5;        // the staleness horizon
  const RECON_SAMPLE = 3;            // obstacles a recon pass examines

  // ── The live read, during a run ─────────────────────────────────
  // Everything at a site resets nightly, and the ratchet is what
  // carries change forward — so there is nothing to accumulate across
  // visits. A leg IS the sample: the crew walks the route, meets what
  // is on it, and by the time they leave they have seen what there
  // was to see. Confirmation at the end of a leg is not in question.
  //
  // What this is for is the READOUT WHILE THEY ARE IN THERE. Ticking
  // an axis over on first contact was the thing worth fixing: one
  // camera cannot tell level 1 from level 5. So the tick waits until
  // they have met everything of that kind the route holds.
  //
  // RESPONDERS PROVE CAPABILITY, BUT ARE NOT PART OF THE CENSUS.
  // A response team's tier is drawn from the alert level, which is
  // bounded by the site's own [Current, Max] — so a building that
  // fields a tier-8 squad is DEMONSTRABLY a place with tier-8 in it.
  // Noise only calls out what it was already capable of; it does not
  // manufacture a threat the site did not have. So a responder raises
  // the FLOOR: the estimate corrects upward the moment one turns up.
  //
  // It does not count toward the CENSUS, though. "Have I met
  // everything of this kind on this route" is a question about the
  // standing security the crew walked in on, and a squad that arrived
  // because of them is not part of that route — counting it would
  // move the goalposts every time somebody made a noise.
  const isStanding = (o) => !o.responder;

  function axisTally(run, axis) {
    let faced = 0, total = 0, maxTier = 0;
    run.obstacles.forEach((o, i) => {
      if (o.projection !== axis) return;
      const standing = isStanding(o);
      if (standing) total += 1;
      if (i >= run.index) return;
      if (standing) faced += 1;
      // Met is met, whoever sent them.
      if (o.tier > maxTier) maxTier = o.tier;
    });
    return { faced: faced, total: total, maxTier: maxTier };
  }

  function axisProven(run, axis) {
    const t = axisTally(run, axis);
    return {
      axis: axis, faced: t.faced, total: t.total, maxTier: t.maxTier,
      // Everything of that kind on this route has been met.
      proven: t.total > 0 && t.faced >= t.total,
    };
  }

  function reconObstacles(site, lens) {
    const all = MJ.allObstacles(site);
    // A Matrix scout reports on whatever is ON THE GRID, which is a
    // question about presence rather than about which skills somebody
    // once wrote into a list. A maglock and a camera are devices on
    // the host wherever they happen to be bolted.
    const pool = lens === "matrix"
      ? all.filter((o) => (o.presence || []).indexOf("matrix") !== -1)
      : all.filter((o) => o.projection === lens);
    return pool.slice(0, RECON_SAMPLE);
  }

  // ── Suppression: tenderizing that lasts the rest of the day ─────
  // Every successful site mission leaves its mark on the defenses
  // it beat — a looped camera, a cracked ward — as per-axis
  // suppression granting bonus dice against MATCHING-projection
  // obstacles for later missions at that site the SAME DAY. Stacks
  // to a cap, vanishes overnight (alert.js clears it). Earned axis:
  // recon suppresses its lens (a MATRIX sweep suppresses the
  // PHYSICAL grid — it's the cameras and maglocks it looped);
  // astral work cracks astral; physical strikes and data payloads
  // degrade the physical grid. Applied AFTER a mission resolves, so
  // nothing self-benefits. Karma stays keyed to the unsuppressed
  // posture — softening lowers the risk, never the books.
  const SUPPRESSION_PER_SUCCESS = 1;
  const SUPPRESSION_CAP = 3;

  function suppressionAxisFor(kind, mission) {
    if (kind === "recon") return mission.lens === "matrix" ? "physical" : mission.lens;
    if (mission.payloadDomain === "astral") return "astral";
    return "physical";
  }

  function suppressionBonus(site, projection, day) {
    const s = site.securityState && site.securityState.suppression;
    if (!s || s.day !== day) return 0;
    return s[projection] || 0;
  }

  function applySuppression(site, axis, day) {
    const st = site.securityState;
    if (!st.suppression || st.suppression.day !== day) {
      st.suppression = { physical: 0, astral: 0, day: day };
    }
    st.suppression[axis] = Math.min(SUPPRESSION_CAP, (st.suppression[axis] || 0) + SUPPRESSION_PER_SUCCESS);
    return st.suppression[axis];
  }

  function hasFreshIntel(site, day) {
    return Object.values(site.intel || {}).some(
      (x) => day >= x.dayTaken && day - x.dayTaken <= INTEL_FRESH_DAYS
    );
  }

  // ── THE SECURITY EVALUATION ────────────────────────────────────
  // What the crew has WORKED OUT about this place by being in it.
  //
  // The obvious build is a readout of the site: "60% guards, 25%
  // doors, 15% cameras". That is a lie dressed as a statistic — it
  // reports obstacles nobody has stood in front of, on a route the
  // crew has not walked, and it hands over for free the one thing
  // this game makes you buy. It would also break the green light: a
  // card that can be right about rooms you have never entered means
  // the player is never wrong for a reason they earned.
  //
  // So the census counts WHAT HAS BEEN MET, and nothing else. Every
  // number in it is a number the crew could have kept on a notepad.
  // It divides by what the knowledge cost:
  //
  //   SEEN     type, tier, armed, what it watches. Free — you looked.
  //   LEARNED  immunities, out of run.discovered. One attempt each.
  //
  // Counts while the sample is small, shares once it is big enough to
  // mean anything: "100% of guards" off one guard is a lie with a
  // number on it, and SHARE_FLOOR is where it stops being one.
  const SHARE_FLOOR = 5;

  // Everything the crew can already see: what they have got past, what
  // is in front of them, and whatever shares that ground. `leg` is
  // where they actually are — a door met on the way out of leg N is
  // leg N, and what is behind it stays behind it.
  function metObstacles(run) {
    const here = run.obstacles && run.obstacles[run.index];
    const leg = here && here.leg !== undefined ? here.leg : Infinity;
    return (run.obstacles || []).filter((o, i) =>
      i <= run.index || (o.leg !== undefined && o.leg <= leg));
  }

  function securityCensus(run) {
    const met = metObstacles(run);
    const kinds = new Map();
    let floor = 0;
    for (const o of met) {
      const type = o.type || "obstacle";
      if (!kinds.has(type)) {
        kinds.set(type, {
          type: type, n: 0, hardest: 0, armed: 0, watching: 0,
          gone: 0, tried: 0, immune: new Map(), planes: new Set(),
        });
      }
      const k = kinds.get(type);
      k.n += 1;
      k.hardest = Math.max(k.hardest, o.tier || 0);
      if (o.fights) k.armed += 1;
      if ((o.senses || []).length) k.watching += 1;
      if (run.neutralized && run.neutralized.has(o)) k.gone += 1;
      k.planes.add(o.projection || "physical");
      floor = Math.max(floor, o.tier || 0);
      // What an attempt bought. Counted against the number of this
      // type actually TRIED, so "2 of 2" reads as the small sample it
      // is rather than as a fact about every guard in the building.
      const tries = run.attempts && run.attempts.get(o);
      if (tries && Object.keys(tries).length) k.tried += 1;
      const disc = run.discovered && run.discovered.get(o);
      if (disc) {
        for (const skill of Object.keys(disc)) {
          k.immune.set(skill, (k.immune.get(skill) || 0) + 1);
        }
      }
    }
    const list = [...kinds.values()].sort((a, b) => b.n - a.n || b.hardest - a.hardest);
    for (const k of list) {
      k.share = met.length >= SHARE_FLOOR ? Math.round((k.n / met.length) * 100) : null;
      k.planes = [...k.planes];
      k.immune = [...k.immune.entries()].map(([skill, n]) => ({ skill: skill, n: n }));
    }
    return { met: met.length, floor: floor, kinds: list, sampled: met.length >= SHARE_FLOOR };
  }

  // WHAT SURVIVES THE NIGHT. The census is a live tally; this is the
  // note the crew keeps. Stamped with the day it was taken, because
  // the only honest reason for a green light to be wrong is that the
  // intel went stale (see the green light invariant) — a report that
  // never ages could never be wrong for a reason the player earned.
  //
  // Merged, not replaced: a second run on the same building adds what
  // it saw to what was already known. The high-water mark is kept for
  // the floor, because meeting a T5 once proves the place fields one.
  function recordSecurityReport(site, run, day) {
    if (!site || !run) return null;
    const census = securityCensus(run);
    if (!census.met) return site.securityReport || null;
    const prior = site.securityReport;
    const kinds = {};
    if (prior) {
      for (const k of prior.kinds || []) kinds[k.type] = Object.assign({}, k);
    }
    for (const k of census.kinds) {
      const at = kinds[k.type] || (kinds[k.type] = { type: k.type, n: 0, hardest: 0, armed: 0, watching: 0, immune: [] });
      at.n += k.n;
      at.hardest = Math.max(at.hardest, k.hardest);
      at.armed += k.armed;
      at.watching += k.watching;
      const bySkill = {};
      for (const im of at.immune) bySkill[im.skill] = im.n;
      for (const im of k.immune) bySkill[im.skill] = (bySkill[im.skill] || 0) + im.n;
      at.immune = Object.keys(bySkill).map((s) => ({ skill: s, n: bySkill[s] }));
    }
    const list = Object.values(kinds).sort((a, b) => b.n - a.n);
    const seen = list.reduce((a, k) => a + k.n, 0);
    for (const k of list) k.share = seen >= SHARE_FLOOR ? Math.round((k.n / seen) * 100) : null;
    site.securityReport = {
      dayTaken: day,
      firstSeen: (prior && prior.firstSeen !== undefined) ? prior.firstSeen : day,
      visits: ((prior && prior.visits) || 0) + 1,
      met: seen,
      floor: Math.max((prior && prior.floor) || 0, census.floor),
      kinds: list,
    };
    return site.securityReport;
  }

  MJ.SECURITY_SHARE_FLOOR = SHARE_FLOOR;
  MJ.metObstacles = metObstacles;
  MJ.securityCensus = securityCensus;
  MJ.recordSecurityReport = recordSecurityReport;
  MJ.isStanding = isStanding;
  MJ.INTEL_FRESH_DAYS = INTEL_FRESH_DAYS;
  MJ.RECON_SAMPLE = RECON_SAMPLE;
  MJ.axisTally = axisTally;
  MJ.axisProven = axisProven;
  MJ.reconObstacles = reconObstacles;
  MJ.suppressionAxisFor = suppressionAxisFor;
  MJ.suppressionBonus = suppressionBonus;
  MJ.applySuppression = applySuppression;
  MJ.hasFreshIntel = hasFreshIntel;
})();
