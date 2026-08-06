# MAGE SHAPES — the presentations inside each class

**Status: design table, not yet built.** This exists to tell the birth allocator
what shapes it should be capable of producing. Nothing here is implemented.

---

## Why there are shapes inside a class at all

Our four magic skills each collapse an entire SR5 skill **group**:

| our skill | SR5 group it collapses |
|---|---|
| `sorcery` | Spellcasting, **Counterspelling**, Ritual Spellcasting |
| `conjuring` | Summoning, **Binding**, **Banishing** |
| `enchanting` | Alchemy, Artificing, **Disenchanting** |
| `assensing` | Assensing (astral perception) |

So a class is not one job. `conjuringMage` covers the runner who *calls* spirits
and the runner who *strips* them off a warded site — SR5 treats those as
different skills, and we merged them. The presentations below are largely those
sub-skills coming back as archetypes, crossed with **which attribute pays for
the work**.

That crossing is the load-bearing part. Two mages can hold identical magic
skills and be different professions because one bought Charisma and the other
bought Willpower.

### The three attributes that decide a mage's profession

- **Willpower** — resists Drain, and sets the stun track. Every caster who wants
  *Force* needs it. This is the closest thing to a universal caster floor, and
  it is role-relative, not absolute: an artillery mage without it kills himself,
  a telekinetic nudging a latch at Force 2 barely notices.
- **Charisma** — the social presentations (Puppeteer, Impersonator, Showman,
  Interrogator). These mages are Faces who happen to cast.
- **Intelligence** — the reading presentations (Scout, Analyst, Artificer).
  Also drives Perception, which is how a detection mage stays useful when the
  spell is already up.

Magic itself is the ceiling on Force and on how deep a grimoire goes. It is
necessary for all of them and distinguishes none of them.

---

## 1. `combatMage` — sorcery, pointed outward

| presentation | the fantasy | lead | supporting skills | attributes | signature spells | lane | fails when |
|---|---|---|---|---|---|---|---|
| **Artillery** | levels the room, is heard doing it | sorcery | athletics, perception | **Magic, Willpower**, Body | Fireball, Manaball, Ball Lightning, Toxic Wave | Attack | Drain drops him before the guards do; nothing he owns is quiet |
| **Assassin** | one clean kill, no report | sorcery | **stealth**, perception | Magic, **Intelligence**, Willpower | Manabolt, Death Touch, Powerbolt | Attack (quiet) | direct mana does nothing to drones, wards, or anything not alive |
| **Counterspeller** | the reason the enemy mage accomplished nothing | sorcery | assensing, perception | **Willpower**, Magic | *(defensive use of sorcery; Counterspelling has no spell entries)* | **Defense** | contributes nothing at all to a site with no magical opposition |
| **Sandman** | takes people off the board without bodies | sorcery | stealth, medicine | Magic, Willpower, Intelligence | Stunbolt, Stunball, Knockout | Attack (nonlethal) | stun overflow still kills; "nonlethal" is a plan, not a guarantee |

**Note on Counterspeller.** We have no counterspell *spells* because SR5 makes it
a skill use, not a formula. It is the one presentation here that a grimoire
cannot express — worth deciding whether it becomes a sorcery-skill defensive
contribution to the Defense lane, or stays unbuilt.

## 2. `detectionMage` — assensing, pointed at what is hidden

| presentation | the fantasy | lead | supporting skills | attributes | signature spells | lane | fails when |
|---|---|---|---|---|---|---|---|
| **Astral Scout** | walks the site before the crew does | **assensing** | stealth, perception | **Intelligence**, Magic | Clairvoyance, Clairaudience, Detect Life | Awareness, intel | knows everything and can do nothing about any of it |
| **Interrogator** | the reason the guard's story fell apart | assensing | **con**, leadership | **Charisma**, Intelligence | Mind Probe, Analyze Truth | Face | needs somebody to be talking; useless against a locked door |
| **Analyst** | reads the lock instead of picking it | assensing | **electronics**, computer | **Intelligence**, Magic | Analyze Device, Detect Magic | Tech | reading a maglock is not opening it — pairs or is decorative |
| **Sentry** | nobody gets the drop on this crew | assensing | **perception** | Intelligence, Willpower | Detect Enemies, Combat Sense, Detect Life | **Awareness**, Defense | pure force multiplier — alone, contributes no verb |

## 3. `healthMage` — the economics of a persistent wound track

| presentation | the fantasy | lead | supporting skills | attributes | signature spells | lane | fails when |
|---|---|---|---|---|---|---|---|
| **Field Medic** | the reason the operation still has that runner | sorcery | **medicine** | **Intelligence**, Magic, Willpower | Heal, Stabilize | survivability | nothing to offer while everyone is healthy |
| **Force Multiplier** | makes the samurai better than the samurai is | sorcery | leadership | **Willpower**, Magic | Increase Reflexes, Increase [Attribute], Resist Pain | every lane, indirectly | sustaining is −2 dice each; over-buffing cripples the caster |
| **Saboteur** | the enemy gets worse instead | sorcery | assensing | Magic, Willpower | Decrease [Attribute], Agony | Attack (soft) | debuff on a mook is wasted; needs a target worth degrading |

**Why this class is worth more than it looks.** Wounds persist across missions
and heal ~1 box per four days. A Field Medic is not a combat contribution, it is
a *tempo* contribution — the crew that goes back out tomorrow instead of next
week. Nothing in the current lane model can see that.

## 4. `illusionMage` — the two opposite jobs

| presentation | the fantasy | lead | supporting skills | attributes | signature spells | lane | fails when |
|---|---|---|---|---|---|---|---|
| **Infiltrator** | nobody was ever here | sorcery | **stealth**, athletics | **Agility**, Magic, Intelligence | Invisibility, Improved Invisibility, Silence, Stealth | **Sneak** | sustaining while sneaking is −2 on the sneaking |
| **Showman** | everyone is looking at the wrong thing | sorcery | **con**, intimidation | **Charisma**, Magic | Confusion, Mass Confusion, Chaos, Chaotic World | Face, Sneak (for others) | he is the distraction — the plan needs somebody else to act |
| **Impersonator** | walks in wearing someone else's face | sorcery | **con**, leadership | **Charisma**, Intelligence | Mask, Physical Mask | **Face** | the face holds, the credentials don't; needs a decker or a forger |
| **Tormentor** | wins by making it unbearable | sorcery | intimidation | Magic, Willpower | Agony, Mass Agony | Attack (soft) | does no damage — degrades, never resolves |

Your two examples are the first two rows, and they are worth noting as genuine
opposites: the Infiltrator spends Magic on *not being perceived*, the Showman
spends it on *being the only thing perceived*. Same class, inverse goals,
different attributes (Agility vs Charisma).

## 5. `manipulationMage` — the widest class we have

| presentation | the fantasy | lead | supporting skills | attributes | signature spells | lane | fails when |
|---|---|---|---|---|---|---|---|
| **Puppeteer** | the guard opens the door himself | sorcery | **con**, leadership | **Charisma**, Willpower, Magic | Influence, Control Thoughts, Control Actions, Mob Mind | **Face** | only works on minds — a drone or a lock is immune |
| **Telekinetic** | never touches anything | sorcery | **larceny**, electronics | **Intelligence**, Magic | Magic Fingers, Levitate, Fling | Tech, Sneak | fine motor work at range is slow and loud in the astral |
| **Warder** | the crew survives the exchange | sorcery | assensing | **Willpower**, Magic, Body | Mana Barrier, Physical Barrier, Armor | **Defense** | barriers buy time, never a result |
| **Controller** | shapes the fight before it starts | sorcery | perception, athletics | Magic, Willpower, Intelligence | Physical Barrier + Fling + Levitate | Defense, Attack | needs a *fight* — worthless on a quiet job |

## 6. `conjuringMage` — the class the collapsed skill hides most

| presentation | the fantasy | lead | supporting skills | attributes | signature spells | lane | fails when |
|---|---|---|---|---|---|---|---|
| **Summoner** | brings more bodies than the crew has | **conjuring** | assensing, leadership | **Magic, Willpower**, Charisma | *(spirits, not spells)* | **Attack**, labour | spirits have services and a temper; Drain from summoning is real |
| **Banisher** | strips the site of what is bound to it | **conjuring** | **assensing**, perception | **Willpower**, Magic | *(banishing, not spells)* | **Banish** | pure counter-magic — a mundane site offers him nothing |
| **Binder** | shows up already having help | conjuring | assensing, leadership | Magic, Charisma, Willpower | *(bound services)* | logistics | pays up front in time and Drain for a later payoff |
| **Astral Intruder** | goes in without a body | assensing | conjuring, stealth | **Intelligence**, Magic, Willpower | Detect Magic, Clairvoyance | Awareness, Banish | leaves a body slumped somewhere for the crew to guard |

Your example is rows 1 and 2. Note they want the **same skill** and **different
attributes** — the Summoner leans Charisma (spirits are negotiated with), the
Banisher leans Willpower (spirits are overpowered). That is the clearest case in
the whole table for why presentation must drive attribute priority.

## 7. `enchantingMage` — the class that supplies the others

| presentation | the fantasy | lead | supporting skills | attributes | signature spells | lane | fails when |
|---|---|---|---|---|---|---|---|
| **Artificer** | writes the formulas other mages learn from | **enchanting** | computer, electronics | **Intelligence**, Magic | *(crafts `fml_*`, foci)* | economy | contributes nothing on site; this is a bench job |
| **Alchemist** | the spell goes off without him there | enchanting | sorcery, larceny | Intelligence, Magic, Willpower | *(preparations of any spell)* | Sneak, Attack | a stored spell is a spell cast at a time you guessed |
| **Disenchanter** | takes the enemy's magic apart | enchanting | **assensing** | Willpower, Intelligence, Magic | *(strips foci, wards)* | Banish, Tech | narrow — needs enemy enchantment to exist |

**The Artificer is structurally important.** Formulas are crafted with
`enchanting`, and `enchantingMage` files `enchanting` as primary. The mage most
likely to start with a thin grimoire is precisely the one who can write his own
and everyone else's. That closes the bootstrap loop without any auto-unlock.

---

## What this table says about the shape system

1. **Presentation must drive attribute priority.** `attributePriority` is
   currently derived from *skills*, and every magic skill maps to Magic. That
   cannot tell a Puppeteer (Charisma) from a Banisher (Willpower) from an
   Analyst (Intelligence) — they hold identical skills. Presentation has to be a
   generated trait that carries its own attribute order.

2. **Willpower is the caster's playable minimum, and it is role-relative.**
   Artillery and Summoner need it or they self-destruct; a Telekinetic working
   at Force 2 does not. This is exactly the "playable, not survival" rule — the
   floor comes from *what this runner is going to be asked to do*, not from a
   universal table.

3. **Some presentations have no spells at all.** Counterspeller, Summoner,
   Banisher, Binder, Artificer, Disenchanter are *skill* professions. A
   grimoire-shaped magic system renders them invisible. Either they get
   non-spell verbs or they are not really implemented.

4. **Several presentations are force multipliers with no verb of their own**
   (Sentry, Force Multiplier, Warder, Showman). The lane model reads what a
   runner can *do*, so it currently scores these near zero. They are not weak;
   they are unreadable.

5. **The tails are the point.** A Puppeteer who rolled low Charisma is a rubber
   band — all the spells, none of the delivery. An Artillery mage who rolled
   high Magic and low Willpower is a glass cannon that hurts itself. Both should
   be *possible outcomes*, findable on the market, and priced accordingly.

---

## Open questions

- **Counterspelling** has no formula entries by design. Does defensive sorcery
  become a Defense-lane contribution off the skill alone?
- **Presentation as a market signal.** Does the board show "Conjuring Mage," or
  does it show "Summoner" — and is the presentation another place the visible
  claim can differ from the hidden truth, like `disciplineLabel`?
- **Do adepts belong in this table?** They carry Magic without the four magic
  skills, so none of these shapes fit them. They may need their own.
- This table covers mages only. Fighters, deckers, riggers and faces need the
  same treatment before the allocator's bands can be written.
