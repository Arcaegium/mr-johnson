/* ============================================================
   Mr. Johnson — models/mission-witness.js
   WHO SAW IT, AND WHAT IT LOOKED LIKE.

   Split out of mission.js, which had grown to nearly three thousand
   lines owning three pillars' routes, resolution, combat, drain,
   intel and the dispatch lifecycle at once — and nearly every bug
   this month landed somewhere in its blast radius.

   This half is genuinely separable and now stands on its own: it
   answers two questions and answers nothing else.

     DID ANYTHING SEE IT?   perceiversNear / noticedBy / caughtBy /
                            castNoticedBy / wasWitnessed
     WHAT DID IT LOOK LIKE? threatClassFor, plus the repeat counters
                            (triesOn / countTry) that escalate it

   It reads a run and returns verdicts. It never resolves an act,
   never rolls a skill, never touches the alert state — the caller
   takes the verdict to alert.js. That one-way flow is what makes
   the file safe to reason about alone.

   The two rules worth stating out loud, because both were bugs:

     A CAST ASKS A WIDER QUESTION THAN AN ACT. wasWitnessed excludes
     the obstacle being acted ON — take down the one guard and
     nobody is left to have an opinion. That is right for an act
     against the thing and wrong for a spell not aimed at it, so
     castNoticedBy includes the thing standing in front of the crew.

     ONE NOTICE CONTEST, TWO GUEST LISTS. The dice live in caughtBy
     exactly once; the callers differ only in WHO is watching. Two
     copies of the roll would drift apart the first time either was
     tuned.
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  // ── Witnessing (§09) ────────────────────────────────────────────
  // An act only reveals anything if something perceived it. The
  // obstacle you are touching decides that below questionable; once
  // the site reads you as questionable it is watching you generally,
  // which is how a camera catches you working a lock it isn't part
  // of. Loud is always witnessed — not because loud means dangerous
  // (a taunt is neither), but because it is heard.
  // A quiet action only registers if it FAILED. Switch a camera off
  // properly and it has nothing left to report; read a spirit
  // correctly and it never knew you were there. Security reacts to
  // the fumble, not the deed — so a clean quiet approach is silence,
  // and an affordance's threat class is the price of getting it
  // WRONG, not the cost of doing it.
  //
  // Loud is the exception, and the only one: a gunshot is a gunshot
  // whether or not it hits.
  // Anything else on this ground that still has eyes. A guard you
  // already put down is not one; a camera you looped is not one; a
  // maglock never was. Patrols and spirit zones count anywhere along
  // their circuit, which is what makes a wide patrol route genuinely
  // worse to work under than a stationary post.
  const sensesPlane = (o, plane) => (o.senses || []).indexOf(plane) !== -1;

  function perceiversNear(run, target, plane) {
    const here = target.rooms;
    if (!here) return [];
    return run.obstacles.filter((o) =>
      o !== target && sensesPlane(o, plane) && !run.neutralized.has(o) &&
      o.rooms && o.rooms.some((r) => here.indexOf(r) !== -1));
  }

  // ── Being present is not the same as being aware ───────────────
  // A guard ten feet away CAN respond, but only if he actually
  // noticed. Working a lock under an invisibility spell, or in the
  // dark, or while he is looking the other way, is exactly the
  // fiction where a crew picks it three times over and he never
  // turns round. So a nearby watcher gets a CHANCE to notice, not an
  // automatic one.
  //
  // Opposed: the watcher's attention against how well the act was
  // covered. `run.concealment` is the hook everything that hides a
  // crew plugs into — a spell, darkness, a distraction, and later the
  // simple fact of standing outside a camera's arc.
  // A watcher's attention is built the same way its competence is in
  // a fight — skill plus the attribute behind it — so the same tier
  // means the same calibre of opposition whether it is shooting at
  // the crew or just looking at them. Anything less made a posted
  // guard easier to fool than the man he is modelled on.
  function noticePool(watcher) {
    const t = watcher.tier || 1;
    const skill = 1 + Math.ceil(t / 2);      // T1 -> 2, T10 -> 6
    const attribute = 2 + Math.floor(t / 3); // T1 -> 2, T10 -> 5
    return skill + attribute;
  }

  // Per WATCHER, because who a spell fools is the spell's own M/P
  // split doing real work: mana Invisibility fools MINDS, so a
  // camera — which has none — stares straight through it and only
  // Improved Invisibility (bent light) beats the lens. And nothing
  // cast on the physical plane hides an AURA: a watcher with astral
  // senses sees the crew blazing whatever the light is doing.
  function concealmentPool(run, runner, watcher) {
    const own = runner ? MJ.dicePoolFor(runner, "stealth", MJ.gearBonusFor(runner, "stealth")) : 0;
    let bonus = run.concealment || 0; // the generic hook, watcher-blind
    const astralEyes = watcher && (watcher.senses || []).indexOf("astral") !== -1;
    if (!astralEyes) {
      for (const c of run.spellConcealment || []) {
        if (c.vsTech || !watcher || watcher.living) bonus += c.amount;
      }
    }
    return Math.max(0, own + bonus);
  }

  // ── One notice contest, two guest lists ────────────────────────
  // Roll the crew's concealment against each watcher's attention and
  // return the first that catches them. WHO is watching is the only
  // thing that varies, so it is the only thing the callers differ on
  // — the dice live here once, or the two lists drift apart.
  function caughtBy(run, watchers, runner) {
    for (const w of watchers) {
      const hidden = MJ.countHits(MJ.rollDicePool(run.rng, concealmentPool(run, runner, w)));
      const saw = MJ.countHits(MJ.rollDicePool(run.rng, noticePool(w)));
      if (saw > hidden) return w;
    }
    return null;
  }

  // Did anything ELSE on this ground both perceive this plane AND
  // actually catch it? Returns the watcher that did, or null.
  function noticedBy(run, target, plane, runner) {
    return caughtBy(run, perceiversNear(run, target, plane), runner);
  }

  // ── Who sees a cast — INCLUDING the thing standing in front of you
  // `wasWitnessed` deliberately excludes the obstacle being acted ON:
  // take down the one guard in the room and there is nobody left to
  // have an opinion about it. That rule is right for an act AGAINST
  // the thing, and wrong for a spell that is not aimed at it at all.
  // A mage who armours up six feet from a guard has not handled the
  // guard — the guard is a bystander with eyes, and he is looking
  // straight at them.
  //
  // So a cast asks the wider question: does ANYTHING here perceive
  // this plane, the thing in front of the crew included.
  function castNoticedBy(run, here, runner) {
    const watchers = perceiversNear(run, here, "physical").slice();
    if (here && sensesPlane(here, "physical") && !run.neutralized.has(here)) watchers.push(here);
    return caughtBy(run, watchers, runner);
  }

  // Is this act's SOUND covered? Hush and Silence blanket the crew's
  // ground; Stealth quiets one runner. A silenced gunshot is not
  // automatically heard — but it still has to survive being SEEN,
  // which is why the check falls through to the normal witness rules
  // rather than returning quiet.
  function actSilenced(run, runner) {
    if (run.silenced) return true;
    return !!(runner && run.silencedRunners && run.silencedRunners.has(runner));
  }

  function wasWitnessed(run, obstacle, act, succeeded, runner) {
    // Gunfire carries regardless — unless a silence spell is holding
    // the sound down, in which case the shot still has to be SEEN.
    if (act && act.loud && !actSilenced(run, runner)) return true;

    // WHICH WORLD did this happen in? Only things that perceive on
    // that plane can have seen it. A guard has eyes in meatspace
    // only, so a decker working a host from a terminal out of his
    // sight is invisible to him — and the camera he kills does not
    // phone anyone about it. A materialised spirit is dual-natured
    // and catches both.
    //
    // The plane is the VERB'S PILLAR, not a lookup on the skill.
    // Reading it off the skill filed spoofed credentials (`computer`)
    // as a physical act, so a guard in the corridor got a vote on
    // something that happened inside a host.
    const plane = (act && act.plane) || runPlane(run);

    // A clean quiet act is seen only by something OTHER than what you
    // just handled. Take down the one guard in the room and there is
    // nobody left to have an opinion; do it in front of a camera, or
    // his partner, and "silent" was never on the table.
    if (succeeded) return !!noticedBy(run, obstacle, plane, runner);
    // It failed. The thing you fumbled registers it if it has eyes ON
    // THIS PLANE — fumbling a hack is witnessed by the host's
    // watchers, not by the guard leaning on the door outside. It
    // gets no notice roll: you fumbled it, in its face.
    if (sensesPlane(obstacle, plane)) return true;
    // The obstacle itself perceives nothing — a lock forms no
    // opinions. So this only registers if something ELSE here both
    // can respond AND actually caught it.
    if (noticedBy(run, obstacle, plane, runner)) return true;
    // Nothing here perceives — but if they are already suspicious
    // they are sweeping the place, not watching the equipment.
    const band = MJ.threatBand(run.state, run.day);
    return band === "questionable" || band === "threatening";
  }

  // Repetition is what costs you, and it costs you in what the act
  // REVEALS rather than in a budget running out. A ward keeps you out
  // on its own, so a first press is merely offputting; leaning on it
  // a fourth time is a person with a purpose. Same for a lock, a
  // credential, a story told to a guard.
  //
  // This is the whole replacement for attempt limits. An approach
  // never becomes unavailable through use — you can always try again
  // — but each repeat reads one band worse, so persistence is priced
  // in exposure. What removes an option is discovering it cannot work
  // here (a Watsonian immunity), which is a fact about the obstacle,
  // not a counter about you.
  const THREAT_LADDER = [MJ.THREAT.NORMAL, MJ.THREAT.AWKWARD, MJ.THREAT.QUESTIONABLE, MJ.THREAT.THREATENING];
  const REPEATS_PER_STEP = 2; // tries at one approach before it reads a band worse

  function threatClassFor(verb, tries) {
    if (!verb) return MJ.THREAT.NORMAL;
    const declared = MJ.verbThreat(verb);
    const base = THREAT_LADDER.indexOf(declared);
    if (base < 0) return declared;
    // `escalates` marks approaches whose own safeguard handled the
    // first try, so they step up immediately rather than on the
    // usual cadence.
    const repeats = Math.max(0, (tries || 1) - 1);
    const steps = verb.escalates
      ? repeats
      : Math.floor(repeats / REPEATS_PER_STEP);
    return THREAT_LADDER[Math.min(THREAT_LADDER.length - 1, base + steps)];
  }

  // ── Tries ───────────────────────────────────────────────────────
  // Counted per VERB, not per skill: a guard can be slipped past or
  // put down quietly, and though both are stealth they are not the
  // same swing. The count no longer spends a budget; it drives
  // escalation, so trying the same thing over and over is what makes
  // you look like someone with a purpose. The key is the verb's own
  // id — stable across a route that shifts under the crew, and
  // readable in a save.
  // ── Keyed by the OBSTACLE, never by its position ───────────────
  // Responders splice into the route ahead of the crew, which shifts
  // the index of everything after them. Anything filed under a route
  // index therefore ends up describing a different obstacle the
  // moment a guard turns up — a freshly-spawned responder inheriting
  // the tries and discoveries its predecessor earned, so its very
  // first attempt reads as a fourth and an approach it never blocked
  // shows as useless. `run.neutralized` already avoided this by
  // holding obstacle objects; these now do the same.
  function triesOn(run, obstacle, approach) {
    const perObstacle = run.attempts.get(obstacle);
    return (perObstacle && perObstacle[approach]) || 0;
  }

  function countTry(run, obstacle, approach) {
    let perObstacle = run.attempts.get(obstacle);
    if (!perObstacle) { perObstacle = {}; run.attempts.set(obstacle, perObstacle); }
    perObstacle[approach] = (perObstacle[approach] || 0) + 1;
    return perObstacle[approach];
  }

  function knownUseless(run, obstacle, skill) {
    const perObstacle = run.discovered.get(obstacle);
    return (perObstacle && perObstacle[skill]) || null;
  }

  function markUseless(run, obstacle, skill, reason) {
    let perObstacle = run.discovered.get(obstacle);
    if (!perObstacle) { perObstacle = {}; run.discovered.set(obstacle, perObstacle); }
    perObstacle[skill] = reason;
  }

  // What you LEARNED is about the obstacle and the SKILL: finding out
  // he is sensor-equipped rules out sneaking generally, however you
  // found it out — so discoveries are per skill, per obstacle.

  // NOTHING RUNS OUT THROUGH USE. A crew can always try again; what
  // changes is what trying again says about them (threatClassFor) and
  // what the delay costs them while something else closes in. The one
  // thing that genuinely removes an approach is learning it cannot
  // work here — a fact about the obstacle, discovered by trying, not
  // a counter about the crew.

  MJ.perceiversNear = perceiversNear;
  MJ.noticePool = noticePool;
  MJ.concealmentPool = concealmentPool;
  MJ.caughtBy = caughtBy;
  MJ.noticedBy = noticedBy;
  MJ.castNoticedBy = castNoticedBy;
  MJ.actSilenced = actSilenced;
  MJ.wasWitnessed = wasWitnessed;
  MJ.threatClassFor = threatClassFor;
  MJ.triesOn = triesOn;
  MJ.countTry = countTry;
  MJ.knownUseless = knownUseless;
  MJ.markUseless = markUseless;
  MJ.sensesPlane = sensesPlane;
})();
