/* ============================================================
   Mr. Johnson — models/sitelist.js
   The site list: known sites are watchable, like runners (§09).

   Core rules this file implements (current understanding §09 "The site
   list" + the retention asymmetry established in §09's save
   model):
     - A site becomes KNOWN when a job the player accepted
       introduces it, or when the player discovers it (resource
       gathering). Known sites join a persistent list the player
       can revisit — go back and farm a place without waiting for
       a contract to point at it.
     - A known site can be WATCHED: a watched site surfaces a
       match whenever a new contract's mission targets it
       (jobsAtWatchedSites — the notification feed), mirroring
       watched runners.
     - The list view (siteListView) shows only player-legal
       information: identity, the handed estimate, recon-confirmed
       staleness-flagged actuals (mission.js's siteIntelView),
       tags, and how/when the site became known.
     - COMPRESSION is the runner asymmetry applied to sites: a
       known site with no watch, no tags, no intel, and no
       security history compresses to a bare universe index + its
       handed estimate (compressSite), and revives byte-identical
       (reviveSite) — the seeds+deltas promise, provable live. A
       site that is currently HOT — elevated Alert, raised
       posture, grown Max — refuses to compress until it has
       genuinely cooled. The save grows with attachment, not time.

   Not this file's job: WHEN sites become known (that's the
   integration layer accepting jobs / the discovery flow calling
   addKnownSite), pruning schedules, or persisting the list into
   save.world.sitePool (integration work — compressSite's records
   are exactly what that field's schema expects).

   Usage:
     const list = [];
     MJ.addKnownSite(list, site, day, "job" | "discovery");
     MJ.watchSite(site); MJ.unwatchSite(site);
     MJ.siteListView(list, day);
     MJ.jobsAtWatchedSites(jobs, list);
     const rec = MJ.compressSite(site);      // null if not compressible
     const back = MJ.reviveSite(universeSeed, rec);
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  const AXES = ["physical", "astral", "matrix"];

  // ── Known-site management ───────────────────────────────────────
  function addKnownSite(list, site, day, source) {
    const existing = list.find(
      (s) => s === site ||
        (s.identity.universeIndex !== undefined && s.identity.universeIndex === site.identity.universeIndex) ||
        (s.identity.name && s.identity.name === site.identity.name)
    );
    if (existing) return existing;
    site.knownMeta = { dayKnown: day, source: source || "job", watched: false };
    list.push(site);
    return site;
  }

  function watchSite(site) {
    if (site.knownMeta) site.knownMeta.watched = true;
    return site;
  }

  function unwatchSite(site) {
    if (site.knownMeta) site.knownMeta.watched = false;
    return site;
  }

  // ── The player-facing list view ─────────────────────────────────
  function siteListView(list, day) {
    return list.map((site) => ({
      universeIndex: site.identity.universeIndex !== undefined ? site.identity.universeIndex : null,
      name: site.identity.name || null,
      theme: site.identity.theme || null,
      district: site.identity.district,
      owningFaction: site.identity.owningFaction,
      value: site.identity.value,
      orientation: site.identity.orientation,
      watched: !!(site.knownMeta && site.knownMeta.watched),
      dayKnown: site.knownMeta ? site.knownMeta.dayKnown : null,
      source: site.knownMeta ? site.knownMeta.source : null,
      security: MJ.siteIntelView(site, day),
      suppression: (() => {
        const s = site.securityState && site.securityState.suppression;
        return s && s.day === day && ((s.physical || 0) + (s.astral || 0) > 0)
          ? { physical: s.physical || 0, astral: s.astral || 0 }
          : null;
      })(),
      tags: site.tags.map((t) => t.tag),
    }));
  }

  // ── The watch feed: contracts touching watched sites ────────────
  function jobsAtWatchedSites(jobs, list) {
    const watched = new Set(list.filter((s) => s.knownMeta && s.knownMeta.watched));
    const hits = [];
    for (const job of jobs) {
      job.missions.forEach((mission, legIndex) => {
        if (watched.has(mission.site)) hits.push({ job: job, mission: mission, legIndex: legIndex, site: mission.site });
      });
    }
    return hits;
  }

  // ── Compression: the runner asymmetry, applied to sites ─────────
  function isSiteCompressible(site) {
    // The name alone recreates any minted site (it's the complete
    // seed); a bench site without one has nothing to re-mint from.
    if (!site.identity.name) return false;
    if (site.knownMeta && site.knownMeta.watched) return false;
    if (site.tags.length > 0) return false;
    if (Object.keys(site.intel || {}).length > 0) return false;
    const st = site.securityState;
    if (st) {
      if (st.alert) return false;        // mid-incident sites don't compress
      if (st.everGrew) return false;     // permanent history is history
      for (const axis of AXES) {
        if (st.axes[axis].current !== st.axes[axis].min) return false; // still escalated
      }
    }
    return true;
  }

  function compressSite(site) {
    if (!isSiteCompressible(site)) return null;
    return {
      // The name IS the complete seed — the record is just the name
      // plus what the reveal layer handed the player.
      siteName: site.identity.name,
      universeIndex: site.identity.universeIndex, // provenance only
      estimatedSecurity: site.estimatedSecurity ? Object.assign({}, site.estimatedSecurity) : null,
      knownMeta: site.knownMeta ? Object.assign({}, site.knownMeta) : null,
    };
  }

  function reviveSite(universeSeed, record) {
    const site = MJ.mintSiteByName(record.siteName);
    if (record.universeIndex !== undefined) site.identity.universeIndex = record.universeIndex;
    if (record.estimatedSecurity) site.estimatedSecurity = Object.assign({}, record.estimatedSecurity);
    if (record.knownMeta) site.knownMeta = Object.assign({}, record.knownMeta);
    return site;
  }

  MJ.addKnownSite = addKnownSite;
  MJ.watchSite = watchSite;
  MJ.unwatchSite = unwatchSite;
  MJ.siteListView = siteListView;
  MJ.jobsAtWatchedSites = jobsAtWatchedSites;
  MJ.isSiteCompressible = isSiteCompressible;
  MJ.compressSite = compressSite;
  MJ.reviveSite = reviveSite;
})();
