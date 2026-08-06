# RUNNER SHAPES — fighters, faces, deckers, riggers, adepts

**Status: design table, not yet built.** Companion to `docs/MAGE-SHAPES.md`.
Together these are Phase A of `docs/OVERHAUL-PLAN.md`. Nothing here is
implemented.

---

## The generative principle, restated for mundanes

For mages the presentations were the hidden SR5 sub-skills inside our collapsed
magic skills. For everyone else the generator is different and simpler:

> **A presentation is a focus crossed with the attribute that pays for it.**

The same skill points in different attribute company make a different
profession. A Melee fighter on Strength+Body is a brawler who wins by absorbing;
the same Melee rank on Agility+Stealth is a knife in the dark. Neither is a
different skill list — they are a different *person*.

Three structural notes before the tables:

1. **`tank` is secretly a Charisma archetype.** Its keySkill is `intimidation`,
   which is Charisma-linked. A Tank who rolled low Charisma is bad at the one
   thing their focus is named for. This is the single most mis-shaped focus we
   have and the bands must account for it.
2. **`streetDoc` is a fighter-family focus with no combat skill in its list**
   (`medicine, electronics, leadership, con`). It is a bench profession filed
   under fighters. Either it moves families or we accept that "fighter" is a
   billing category, not a role.
3. **Deckers already carry a presentation seed** — `deckerAffinity` is generated
   today as `masking | attack | search` and is currently decorative. It should
   become the presentation.

---

## A2. FIGHTERS

Eight focuses. The family is broad enough that some focuses barely overlap.

### `heavyWeapons` — list: heavyWeapons, firearms, demolitions, marksmanship, athletics

| presentation | the fantasy | attributes | supporting | lane | fails when |
|---|---|---|---|---|---|
| **Suppressor** | nobody crosses that hallway | **Strength, Body** | athletics | Attack, Defense | loud by construction; no quiet job wants him |
| **Breacher** | the wall becomes a door | **Strength**, Intelligence | demolitions, electronics | Attack, Tech | destroys what the job may have needed intact |
| **Cannoneer** | precision, at a calibre that shouldn't have it | **Agility**, Strength | marksmanship, perception | Attack | expensive per shot; ammunition is a real constraint |

### `demolitions` — list: demolitions, firearms, electronics, athletics, heavyWeapons

| presentation | the fantasy | attributes | supporting | lane | fails when |
|---|---|---|---|---|---|
| **Breacher** | opens anything, on a timer | **Intelligence** | electronics | **Tech**, Attack | noise is the whole method |
| **Trapper** | the room was ready before they arrived | **Intelligence**, Agility | perception, stealth | Defense | needs to know where they'll be — dead without intel |
| **Wrecker** | removes the objective's building | Strength, Intelligence | heavyWeapons | Attack | very few contracts want this |

### `stealth` — list: stealth, perception, firearms, larceny, athletics

| presentation | the fantasy | attributes | supporting | lane | fails when |
|---|---|---|---|---|---|
| **Infiltrator** | in and out, no record | **Agility**, Intelligence | perception, athletics | **Sneak** | one bad roll and none of the rest of the sheet helps |
| **Second-Storey** | locks are a formality | **Agility** | larceny, perception | **Sneak, Tech** | electronic locks want a decker, not a jimmy |
| **Scout** | the crew knew before they walked in | **Intelligence** | perception | **Awareness**, intel | gathers; does not act |
| **Ghostshooter** | one shot, from somewhere nobody looked | Agility, Intelligence | marksmanship, firearms | Attack (quiet) | committing to the shot ends the stealth |

### `melee` — list: melee, athletics, firearms, intimidation, stealth

| presentation | the fantasy | attributes | supporting | lane | fails when |
|---|---|---|---|---|---|
| **Brawler** | wins by still standing | **Strength, Body** | athletics, intimidation | Attack, Defense | has to cross the room first, under fire |
| **Blade** | quiet, close, finished | **Agility** | stealth | Attack (quiet) | fragile — built to not be hit, not to survive being hit |
| **Bodyguard** | the client is untouched | **Body**, Strength | intimidation, perception | **Defense** | protects; rarely resolves |

### `marksman` — list: marksmanship, perception, firearms, stealth

| presentation | the fantasy | attributes | supporting | lane | fails when |
|---|---|---|---|---|---|
| **Overwatch** | sees it coming and ends it | **Intelligence**, Agility | perception | Attack, **Awareness** | needs sightlines; useless indoors and in the dark |
| **Assassin** | one shot, one contract | **Agility**, Intelligence | stealth | Attack (quiet) | one shot is all he gets |
| **Designated Shooter** | reliable damage, every exchange | **Agility** | firearms | Attack | nothing but damage |

### `tank` — list: intimidation, melee, firearms, athletics, heavyWeapons

| presentation | the fantasy | attributes | supporting | lane | fails when |
|---|---|---|---|---|---|
| **Wall** | the crew's damage goes here | **Body, Strength** | athletics | **Defense** | contributes nothing on a job with no violence |
| **Enforcer** | the room does what he says | **Charisma**, Body | intimidation, melee | **Face**, Defense | intimidation closes doors a Grifter would have opened |
| **Frontline** | goes first, on purpose | Body, Strength, Agility | melee, firearms | Attack, Defense | jack of the family, master of none |

**The Enforcer is the important row.** `intimidation` is Charisma-linked, so a
Tank's own key skill is paid for by a Face attribute. This focus can generate a
runner who is bad at their nameplate, which is a legitimate outcome (D5) but
must be *visible* in the price.

### `combatMedic` — list: medicine, firearms, melee, athletics, stealth

| presentation | the fantasy | attributes | supporting | lane | fails when |
|---|---|---|---|---|---|
| **Field Medic** | the operation keeps its people | **Intelligence**, Body | medicine, athletics | survivability | not a combat contribution — the card can't see him |
| **Trauma Shooter** | fights, then patches | Agility, Intelligence | firearms, medicine | Attack, survivability | mediocre at both by design |

### `streetDoc` — list: medicine, electronics, leadership, con

| presentation | the fantasy | attributes | supporting | lane | fails when |
|---|---|---|---|---|---|
| **Surgeon** | the reason that chrome went in cleanly | **Intelligence** | medicine, electronics | **bench** | no field skills at all; a liability on site |
| **Clinic** | knows who to call and what it costs | **Charisma**, Intelligence | con, leadership | Face, economy | soft everywhere it matters tactically |

**The Surgeon is D9's tension made concrete** — best on the bench, must be
fielded to earn the karma that makes them better on the bench.

---

## A3. DECKERS

One focus, three affinities already generated and currently decorative. They
become the presentations, plus a fourth the current model can't express.

| presentation | affinity | the fantasy | attributes | supporting | lane | fails when |
|---|---|---|---|---|---|---|
| **Ghost** | `masking` | was never in the host | **Intelligence**, Agility | hacking, stealth | **Sneak** (matrix) | slow — sleaze takes passes the crew may not have |
| **Icebreaker** | `attack` | the ICE is gone, everyone knows | **Intelligence** | hacking, computer | **Attack** (matrix) | loud in the host = alarms in meatspace |
| **Datamancer** | `search` | comes out knowing everything | **Intelligence** | computer, hacking | **Awareness**, intel | finds the door, cannot open it |
| **Coder** | — | writes what the others run | **Intelligence**, low Body/Agility | **computer**, electronics | **bench** | physically fragile; the field is genuinely dangerous for him |

**The Coder is the decker's Artificer.** Programs craft off `computer`, not
`hacking`, so the bench decker supplies the whole team's software — and is
exactly the "low Body & Agility Computer specialist" you named. Same D9 tension
as the Surgeon and the mage's Artificer: three professions, one shape.

**Note:** all four want Intelligence. Deckers are the least attribute-diverse
family we have — their presentations separate on *skills* (hacking vs computer)
and on *physical* stats, not on the mental one. That is the opposite of mages.

---

## A4. RIGGERS

**Blocked on Phase D.** The focus comment says "drone class defines the verb
elsewhere," and that elsewhere does not exist: drones are currently gear that
grants dice to `rigging`, with jump-in marked Phase 2 in armory.js.

Provisional presentations, to be confirmed once extra-bodies exists:

| presentation | the fantasy | attributes | supporting | lane | depends on |
|---|---|---|---|---|---|
| **Combat Rigger** | brings bodies that aren't people | **Intelligence**, Agility | rigging, firearms | **Attack** | Phase D |
| **Recon Rigger** | eyes everywhere, none of them his | **Intelligence** | rigging, perception | **Awareness**, intel | Phase D |
| **Jumped-In** | *is* the drone | **Agility**, Intelligence | rigging | Attack, Sneak | Phase D + meat body left slumped |
| **Mechanic** | keeps the fleet flying | **Intelligence** | electronics, computer | **bench** | buildable now |

The Mechanic is the fourth instance of the bench profession, and the only rigger
presentation that can be built before Phase D.

**Jumped-In leaves an unattended body**, which is the same problem as the mage's
Astral Intruder and the decker going slump. The docs already note plane/turn
ratios for exactly this. One system, three customers.

---

## A5. FACES

Two focuses. The family is small and the presentations carry most of the weight.

### `face` — list: con, leadership, intimidation, larceny

| presentation | the fantasy | attributes | supporting | lane | fails when |
|---|---|---|---|---|---|
| **Grifter** | they wanted to believe him | **Charisma** | con | **Face** | one story, one chance; a blown con is worse than no con |
| **Fixer** | knew a guy before the job started | **Charisma**, Intelligence | leadership, con | Face, **economy** | value is between missions, invisible on the card |
| **Badge** | walked in through the front door | **Charisma**, Agility | con, larceny | **Face, Sneak** | the face holds, the credentials don't — needs a forger |

### `leader` — list: leadership, con, intimidation, firearms

| presentation | the fantasy | attributes | supporting | lane | fails when |
|---|---|---|---|---|---|
| **Commander** | the crew is better than its parts | **Charisma** | leadership | **every lane** (teamwork) | pure multiplier — alone he is one gun |
| **Negotiator** | the price moved | **Charisma**, Intelligence | con, leadership | Face, economy | nothing to do once talking stops |
| **Sergeant** | leads from the front | Charisma, Body | firearms, intimidation | Face, Attack | split investment; good at neither end |

**The Commander has a real mechanical hook already.** `lanes.js` implements
teamwork stacking (lead + ⌊pool/3⌋ each, capped at the lead's rank). A
leadership presentation is the only shape in the game that makes *other
runners'* numbers move, and the lane model can already see it — unlike the
mage's force multipliers.

---

## A6. ADEPTS — and a finding

Adepts are not a family. They are `origin: "magic"` on a non-mage focus, at
**9.3% of the generated market** (measured over 600 runners).

### The finding: an adept's Magic attribute is completely inert

Measured directly — same runner, Magic 4 versus Magic 0:

- identical dice pools on every skill
- identical values in every lane
- **identical price** (`attributePriority` is skill-derived, adepts have no
  magic-linked skills, so Magic is never counted)

The runner.js comment states the intent plainly: adepts "get a smaller Magic
score powering their abilities (Killing Hands, Improved Reflexes) without
casting." Those abilities were never built. So ~9% of the market is generated
carrying a defining trait that changes nothing at all.

This is the mute mage again, in a different costume, and it should be fixed the
same way — at the source, not patched.

### What adepts need

SR5 gives adepts **Power Points equal to their Magic rating**, spent on powers.
That is structurally the same shape as the grimoire: a per-runner list, bounded
by an attribute, that the verb layer reads. The grimoire machinery
(`spellsFor`, the `carries` gate, `bestCombatSpell`) is the working model.

Proposed presentations, each named for the power constellation that defines it:

| presentation | the fantasy | powers (SR5) | attributes | lane |
|---|---|---|---|---|
| **Striker** | unarmed, and worse for it | Killing Hands, Critical Strike | **Strength, Body** | Attack |
| **Quickened** | moves before anyone decides to | Improved Reflexes | **Agility** | Attack, Defense |
| **Marksman-adept** | the shot does not miss | Improved Ability (firearms/marksmanship) | **Agility** | Attack |
| **Traceless** | leaves nothing, not even sound | Traceless Walk, Improved Ability (stealth) | **Agility**, Intelligence | **Sneak** |
| **Read** | knows what you are about to do | Combat Sense, Enhanced Perception | **Intelligence** | **Awareness**, Defense |
| **Presence** | is simply believed | Kinesics, Commanding Voice | **Charisma** | **Face** |

Note these cross focus lines: a Presence adept could be a `face` or a `tank`, a
Striker could be `melee` or `tank`. **Adept presentation is a second axis, not a
replacement for focus** — which is a genuine modelling question for Phase B.

---

## WHAT THESE TABLES ADD TO THE PLAN

1. **The bench profession is a pattern, not a special case.** Artificer
   (mage), Surgeon (fighter/streetDoc), Coder (decker), Mechanic (rigger) are
   the same shape four times: best in the workshop, must be fielded to earn the
   karma that improves the workshop. D9's tension deserves one systemic answer,
   not four.

2. **The unattended body is a pattern too.** Astral Intruder, Jumped-In rigger,
   and a decker going slump all leave a meat body for the crew to guard. The
   plane/turn ratio note in the docs is the system all three need.

3. **`tank` and `streetDoc` are mis-shaped** and should be reviewed before the
   bands are written — an intimidation-lead fighter paid for in Charisma, and a
   fighter-family focus with no combat skills.

4. **Adepts need powers or they need removing.** 9.3% of the market currently
   generates a trait that does nothing. Given the grimoire is a working model
   for exactly this shape, building them is cheaper than it looks.

5. **Families differ in what separates their presentations.** Mages separate on
   *attributes* (same skills, different profession). Deckers separate on
   *skills* and *physical stats* (everyone wants Intelligence). Fighters
   separate on both. The band table cannot be one shape for all five families.
