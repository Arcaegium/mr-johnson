/* ============================================================
   Mr. Johnson — core/save.js
   Save/load per current understanding §09 ("Save model: seeds and deltas,
   never content"). IndexedDB for the browser target, schema
   version stamped from day one so future shape changes have
   something to migrate from.

   This file is the store: open the database, write one record,
   read it back, stamp a schema version so a future shape change
   has something to migrate from. It knows nothing about what a
   session contains.

   The record itself is built and rebuilt by game.js
   (`serializeSession` / `deserializeSession`), which round-trips
   the whole live session — roster, market, known sites, accepted
   jobs, the board, the armory, and the two-way gear references
   between items and the runners holding them. Sites travel as
   names, per §09: the name is the complete seed, so a known site
   costs one string and mints back identical.

   Usage:
     const state = MJ.defaultSave(rootSeed);
     MJ.advanceDay(state.meta, 1);
     await MJ.saveGame(state);
     const loaded = await MJ.loadGame();   // null if nothing saved
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  const DB_NAME = "mr-johnson-save";
  const DB_VERSION = 1;
  const STORE_NAME = "save";
  const SAVE_KEY = "current";
  const SCHEMA_VERSION = 1;

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE_NAME);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // ── Default save shape (current understanding §09) ───────────────────────
  function defaultSave(rootSeed) {
    return {
      meta: { schemaVersion: SCHEMA_VERSION, currentDay: 1, rootSeed: rootSeed },
      johnson: { money: 0, reputation: 0, hubUpgrades: [], boardCapacity: 4 },
      roster: { watchedRunners: [], contracts: [] },
      armory: { items: [], craftQueue: [], materials: {} }, // materials: harvested stock, keyed "resource:kind"
      market: { unwatchedSlots: [] },     // seeds only — §03/§09
      world: { sitePool: [], activeJobs: [] },
    };
  }

  // ── TWO SLOTS, AND WHY ──────────────────────────────────────────
  // `current` is the live save. `previous` is the state as it stood at
  // the START of the day now being played, written by game.js's
  // beginDay before anything is resolved.
  //
  // This exists because of one rule: a runner can DIE, and the player
  // must never be shut out of that decision. With a single slot,
  // settleDay's autosave committed the day — deaths included — the
  // instant the last result was dismissed, over the only copy. The
  // window to walk away existed (nothing is written mid-day) but it
  // was invisible and it shut permanently.
  //
  // Two slots make the window durable and nameable: whatever today
  // did, the morning is still on disk until tomorrow morning
  // overwrites it.
  const PREVIOUS_KEY = "previous";

  function put(key, state) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(state, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }));
  }

  function get(key) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result === undefined ? null : req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  function drop(key) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }));
  }

  function saveGame(state) { return put(SAVE_KEY, state); }
  function loadGame() { return get(SAVE_KEY); }
  function deleteSave() {
    return Promise.all([drop(SAVE_KEY), drop(PREVIOUS_KEY)]).then(() => undefined);
  }

  // The morning of the day being played.
  function saveRewindPoint(state) { return put(PREVIOUS_KEY, state); }
  function loadRewindPoint() { return get(PREVIOUS_KEY); }
  function clearRewindPoint() { return drop(PREVIOUS_KEY); }

  MJ.SCHEMA_VERSION = SCHEMA_VERSION;
  MJ.defaultSave = defaultSave;
  MJ.saveGame = saveGame;
  MJ.loadGame = loadGame;
  MJ.deleteSave = deleteSave;
  MJ.saveRewindPoint = saveRewindPoint;
  MJ.loadRewindPoint = loadRewindPoint;
  MJ.clearRewindPoint = clearRewindPoint;
})();
