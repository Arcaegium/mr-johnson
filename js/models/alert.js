/* ============================================================
   Mr. Johnson — models/alert.js
   Live security in three layers (design bible §09):

     1. THE BAND — Min/Current/Max per axis. Current is "how much
        room are we giving for bullshit today."
     2. THE THREAT READ — normal → awkward → questionable →
        threatening, per site per DAY. What your actions credibly
        reveal, and only if something witnessed them.
     3. ALERT — the response, engaged only at threatening. Three of
        them, one per axis, each bounded [Current, Max]: never
        below the posture already chosen for today, never above
        what that axis can actually field.

   The read is an assessment, not an alarm. Nothing changes
   mechanically below threatening — those tiers are the tripwire's
   bookkeeping (and hooks for behavior later: turrets tracking,
   maglocks sealing, guards talking differently). Three stacking
   awkwards make you questionable; once questionable, security is
   sure enough and waiting for an excuse, so any further witnessed
   awkward OR questionable act tips you over.

   ALERT IS THE RATCHET, played out live. It engages at Current
   because that is what they already committed to, and every step
   it climbs is them deciding to field more than they planned.
   Where it settles becomes the new Current — nobody stands the
   reserves down the next morning and returns to yesterday's
   staffing. So tripping a site and withdrawing immediately
   ratchets nothing (Alert never rose above where it started),
   while fighting through three waves permanently rewrites their
   posture. Max only grows when they pin at the ceiling and the
   pressure keeps coming: that is the budget meeting, and it never
   decays.

   Points, not levels, are what move: an axis engages at
   Current x POINTS_PER_LEVEL and ceilings at Max x
   POINTS_PER_LEVEL, and the level that determines what they field
   is points / POINTS_PER_LEVEL. Without that budget a Current:5
   Max:10 site would deploy every asset it owns within about
   thirty seconds of in-universe time.

   NOT this file's job: deciding what an act's threat class IS
   (site.js's obstacle templates) or what a response challenge
   looks like (models/mission.js).

   Usage:
     MJ.initSecurityState(rng, site);
     MJ.witnessAct(state, day, MJ.THREAT.QUESTIONABLE);
     MJ.alertLevel(state, "physical");
     MJ.addAlertPoints(state, "astral", 3);
     MJ.settleIncident(state);        // alert -> the new Current
     MJ.advanceSiteDay(state);        // nightly reset + cooling
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  const AXES = ["physical", "astral", "matrix"];

  // ── Tuning dials (all placeholder, shape only) ──────────────────
  const POINTS_PER_LEVEL = 10;      // the budget that paces escalation
  const AWKWARD_TO_QUESTIONABLE = 3; // stacking awkwards before it reads as a pattern
  const QUIET_DAYS_PER_COOL_STEP = 5;
  const MAX_GROWTH_PINNED_BEATS = 4; // pressure at the ceiling before budget moves
  const MIN_FRACTION_LOW = 0.4;      // resting-posture roll, as a share of Max
  const MIN_FRACTION_HIGH = 1.0;     // (1.0 = "tough nut": never relaxes at all)

  const BANDS = ["normal", "awkward", "questionable", "threatening"];
  const bandRank = (b) => BANDS.indexOf(b);

  // ── Init: the band, plus an empty read ─────────────────────────
  function initSecurityState(rng, site) {
    const axes = {};
    for (const axis of AXES) {
      const max = site.security[axis];
      const min = Math.max(1, Math.min(max, Math.round(max * rng.range(MIN_FRACTION_LOW, MIN_FRACTION_HIGH))));
      axes[axis] = { min: min, current: min, max: max };
    }
    site.securityState = {
      axes: axes,
      read: { band: "normal", awkward: 0, day: null },
      alert: null,          // null until threatening; then points per axis
      pinnedBeats: 0,       // pressure sustained at the ceiling
      everGrew: false,      // latched on the first capacity expansion
      daysSinceThreat: 0,
      quietDays: 0,
      suppression: null,
    };
    return site.securityState;
  }

  // ── The read ────────────────────────────────────────────────────
  // Day-scoped: you can farm normal at a site that shot at you
  // yesterday. That is balanced by the ratchet starting them higher
  // and by obstacle knowledge resetting with it.
  function ensureRead(state, day) {
    if (state.read.day !== day) {
      state.read = { band: "normal", awkward: 0, day: day };
      state.alert = null;
    }
    return state.read;
  }

  function threatBand(state, day) {
    return ensureRead(state, day).band;
  }

  // Apply what a witnessed act revealed. Unwitnessed acts never get
  // here — an air-gapped box has nobody to form an opinion.
  // Returns { band, tipped } where `tipped` marks the moment the
  // response engages.
  function witnessAct(state, day, threatClass) {
    const read = ensureRead(state, day);
    const before = read.band;
    if (threatClass === "threatening") {
      read.band = "threatening";
    } else if (read.band === "questionable" && (threatClass === "awkward" || threatClass === "questionable")) {
      // Already sure, just waiting for an excuse.
      read.band = "threatening";
    } else if (threatClass === "questionable") {
      if (bandRank("questionable") > bandRank(read.band)) read.band = "questionable";
    } else if (threatClass === "awkward") {
      read.awkward += 1;
      if (read.awkward >= AWKWARD_TO_QUESTIONABLE && bandRank(read.band) < bandRank("questionable")) {
        read.band = "questionable";
        read.awkward = 0;
      }
    }
    const tipped = read.band === "threatening" && before !== "threatening";
    if (tipped) engageAlert(state, day);
    return { band: read.band, tipped: tipped };
  }

  // Exceptional success buys headroom back — the thoroughly
  // bamboozled guard who hands over his ID.
  function grantHeadroom(state, day, steps) {
    const read = ensureRead(state, day);
    if (read.band === "threatening") return read.band; // too late for charm
    read.awkward = Math.max(0, read.awkward - (steps || 1));
    if (read.band === "questionable" && (steps || 1) >= 2) read.band = "awkward";
    return read.band;
  }

  // ── Alert: the response ─────────────────────────────────────────
  // Engages at Current — they answer with the posture they already
  // chose — and ceilings at Max, because nobody fields what they
  // do not have. All three axes commit at once: a site meets an
  // intrusion with everything it owns, each asset only as good as
  // that axis really is.
  function engageAlert(state, day) {
    if (state.alert && state.alert.day === day) return state.alert;
    const alert = { day: day };
    for (const axis of AXES) alert[axis] = state.axes[axis].current * POINTS_PER_LEVEL;
    state.alert = alert;
    return alert;
  }

  function alertLevel(state, axis) {
    if (!state.alert) return 0;
    return Math.floor(state.alert[axis] / POINTS_PER_LEVEL);
  }

  function alertEngaged(state) {
    return !!state.alert;
  }

  // Surviving what they sent, dropping one of theirs, or committing
  // another threatening act — the beats that buy escalation.
  function addAlertPoints(state, axis, points) {
    if (!state.alert) return 0;
    const ceiling = state.axes[axis].max * POINTS_PER_LEVEL;
    const before = state.alert[axis];
    state.alert[axis] = Math.min(ceiling, before + points);
    if (state.alert[axis] >= ceiling && before >= ceiling) state.pinnedBeats += 1;
    return alertLevel(state, axis);
  }

  function addAlertPointsAll(state, points) {
    const levels = {};
    for (const axis of AXES) levels[axis] = addAlertPoints(state, axis, points);
    return levels;
  }

  // ── Settling: where the response ended is the new posture ───────
  // Called when an incident closes. Current rises to whatever they
  // had to field; it never falls here (that is the nightly cooling
  // job). Sustained pressure at the ceiling is what finally moves
  // Max — permanently.
  function settleIncident(state) {
    if (!state.alert) return { ratcheted: false, maxGrew: false };
    let ratcheted = false;
    let maxGrew = false;
    for (const axis of AXES) {
      const a = state.axes[axis];
      const level = alertLevel(state, axis);
      if (level > a.current) {
        a.current = Math.min(a.max, level);
        ratcheted = true;
      }
    }
    if (state.pinnedBeats >= MAX_GROWTH_PINNED_BEATS) {
      for (const axis of AXES) {
        const a = state.axes[axis];
        if (a.current >= a.max) {
          a.max += 1;
          a.current = a.max;
          maxGrew = true;
        }
      }
      state.pinnedBeats = 0;
      if (maxGrew) state.everGrew = true;
    }
    state.daysSinceThreat = 0;
    state.quietDays = 0;
    return { ratcheted: ratcheted, maxGrew: maxGrew };
  }

  // ── The nightly tick ────────────────────────────────────────────
  // The read and the response both reset — an assessment is not a
  // thing you stay in — and suppression dies with the night. Current
  // cools toward Min only after real quiet: days on which nobody
  // forced a response. A week of being merely awkward at the front
  // desk neither stops that clock nor resets it. They were handled.
  function advanceSiteDay(state) {
    const hadIncident = !!state.alert;
    state.suppression = null;
    state.alert = null;
    state.read = { band: "normal", awkward: 0, day: null };

    if (hadIncident) {
      state.daysSinceThreat = 0;
      state.quietDays = 0;
      return;
    }
    state.daysSinceThreat += 1;
    state.quietDays += 1;
    if (state.quietDays >= QUIET_DAYS_PER_COOL_STEP) {
      for (const axis of AXES) {
        const a = state.axes[axis];
        a.current = Math.max(a.min, a.current - 1);
      }
      state.quietDays = 0;
    }
  }

  MJ.SECURITY_AXES = AXES;
  MJ.POINTS_PER_LEVEL = POINTS_PER_LEVEL;
  MJ.initSecurityState = initSecurityState;
  MJ.threatBand = threatBand;
  MJ.witnessAct = witnessAct;
  MJ.grantHeadroom = grantHeadroom;
  MJ.engageAlert = engageAlert;
  MJ.alertLevel = alertLevel;
  MJ.alertEngaged = alertEngaged;
  MJ.addAlertPoints = addAlertPoints;
  MJ.addAlertPointsAll = addAlertPointsAll;
  MJ.settleIncident = settleIncident;
  MJ.advanceSiteDay = advanceSiteDay;
})();
