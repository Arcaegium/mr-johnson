/* ============================================================
   Mr. Johnson — core/save.js
   Save/load per current understanding §09 ("Save model: seeds and deltas,
   never content"). IndexedDB for the browser target, schema
   version stamped from day one so future shape changes have
   something to migrate from.

   Only `meta` is genuinely wired up to IndexedDB right now. The
   integration layer (game.js) holds a live session — roster,
   market, known sites, jobs, and a real armory (game.js writes
   crafted items and harvested materials into `armory` below) —
   but full session serialization to disk is still the flagged
   v0.5 follow-up: site/mission object graphs need their
   compressSite-style record forms first. The shape is the current understanding's
   own §09 spec either way, so finishing persistence populates
   fields that already exist rather than changing the schema.

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

  function saveGame(state) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(state, SAVE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }));
  }

  function loadGame() {
    return openDb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(SAVE_KEY);
      req.onsuccess = () => resolve(req.result === undefined ? null : req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  function deleteSave() {
    return openDb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(SAVE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }));
  }

  MJ.SCHEMA_VERSION = SCHEMA_VERSION;
  MJ.defaultSave = defaultSave;
  MJ.saveGame = saveGame;
  MJ.loadGame = loadGame;
  MJ.deleteSave = deleteSave;
})();
