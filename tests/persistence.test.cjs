/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const { IDBFactory } = require("fake-indexeddb");
require.extensions[".ts"] = (mod, file) =>
  mod._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    file,
  );
const { createTrip, parseBackup } = require("../lib/travel.ts");
const { STORAGE_KEY } = require("../lib/storage.ts");
const {
  DATABASE_NAME,
  savePersistentJournal,
  loadPersistentJournal,
} = require("../lib/persistence.ts");
const journal = (title) => {
  const t = createTrip(title, "2026-10-15");
  t.schedules = [
    {
      id: t.id + 1,
      day: 1,
      title: "保留照片與筆記",
      startTime: "09:00",
      endTime: "10:00",
      image: "data:image/png;base64,aGVsbG8=",
      note: "下次開機要看得到",
      tag: "景點",
      travelTimeToNext: "",
      location: "新竹",
      cost: 250,
      favorite: true,
    },
  ];
  return parseBackup({
    version: 2,
    trips: [t],
    activeTripId: t.id,
    isDarkMode: true,
  });
};
function memory() {
  const disk = new Map();
  return {
    disk,
    reopen: () => ({
      getItem: (key) => disk.get(key) ?? null,
      setItem: (key, data) => disk.set(key, data),
    }),
  };
}
async function rawBackup(factory, data) {
  return new Promise((resolve, reject) => {
    const opening = factory.open(DATABASE_NAME, 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore("journal");
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const tx = db.transaction("journal", "readwrite");
      tx.objectStore("journal").put(data, "current");
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}
test("reopening storage restores all trips, photos, notes, costs and theme", async () => {
  const db = new IDBFactory(),
    disk = memory(),
    original = journal("關機前的旅行");
  const saved = savePersistentJournal(original, disk.reopen(), db);
  assert.equal(saved.localSaved, true);
  assert.equal(await saved.backup, true);
  const reopened = await loadPersistentJournal(disk.reopen(), db);
  assert.deepEqual(reopened.journal, original);
  assert.equal(reopened.recovered, false);
});
test("IndexedDB restores data on reopening when localStorage writes exceed quota", async () => {
  const db = new IDBFactory(),
    disk = memory(),
    original = journal("備援旅程");
  const full = {
    getItem: (key) => disk.disk.get(key) ?? null,
    setItem() {
      throw new Error("quota");
    },
  };
  const saved = savePersistentJournal(original, full, db);
  assert.equal(saved.localSaved, false);
  assert.equal(await saved.backup, true);
  const reopened = await loadPersistentJournal(disk.reopen(), db);
  assert.deepEqual(reopened.journal, original);
  assert.equal(reopened.recovered, true);
});
test("newer backup wins over an older successful localStorage save", async () => {
  const db = new IDBFactory(),
    disk = memory();
  await savePersistentJournal(journal("舊內容"), disk.reopen(), db).backup;
  const newer = journal("新內容已存到備援");
  await savePersistentJournal(
    newer,
    {
      getItem: (key) => disk.disk.get(key) ?? null,
      setItem() {
        throw new Error("quota");
      },
    },
    db,
  ).backup;
  const result = await loadPersistentJournal(disk.reopen(), db);
  assert.deepEqual(result.journal, newer);
  assert.equal(result.recovered, true);
});
test("corrupt primary data recovers from backup without overwriting the corrupt original", async () => {
  const db = new IDBFactory(),
    disk = memory(),
    original = journal("可還原的旅行");
  await savePersistentJournal(original, disk.reopen(), db).backup;
  disk.disk.set(STORAGE_KEY, "{corrupted");
  const result = await loadPersistentJournal(disk.reopen(), db);
  assert.deepEqual(result.journal, original);
  assert.equal(result.recovered, true);
  assert.equal(disk.disk.get(STORAGE_KEY), "{corrupted");
});
test("invalid backup does not prevent loading a valid primary copy", async () => {
  const db = new IDBFactory(),
    disk = memory(),
    original = journal("完整主檔");
  await savePersistentJournal(original, disk.reopen(), db).backup;
  await rawBackup(db, { revision: -1, journal: { version: 99, trips: [] } });
  assert.deepEqual(
    (await loadPersistentJournal(disk.reopen(), db)).journal,
    original,
  );
});
test("a failed backup never loses a successfully saved primary copy", async () => {
  const disk = memory(),
    original = journal("只用正常儲存");
  const saved = savePersistentJournal(original, disk.reopen(), undefined);
  assert.equal(saved.localSaved, true);
  assert.equal(await saved.backup, false);
  assert.deepEqual(
    (await loadPersistentJournal(disk.reopen(), undefined)).journal,
    original,
  );
});
test("failure of both stores is reported instead of pretending to persist", async () => {
  const blocked = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  const saved = savePersistentJournal(journal("未存成功"), blocked, undefined);
  assert.equal(saved.localSaved, false);
  assert.equal(await saved.backup, false);
  await assert.rejects(loadPersistentJournal(blocked, undefined));
});
test("legacy migration preserves source keys and saves stable trip identifiers", async () => {
  const db = new IDBFactory(),
    disk = memory(),
    old = journal("舊版旅行");
  const raw = JSON.stringify(old.trips);
  disk.disk.set("trips", raw);
  disk.disk.set("activeTripId", JSON.stringify(old.activeTripId));
  const loaded = await loadPersistentJournal(disk.reopen(), db);
  assert.equal(loaded.needsInitialSave, true);
  await savePersistentJournal(loaded.journal, disk.reopen(), db).backup;
  assert.equal(disk.disk.get("trips"), raw);
  assert.deepEqual(
    (await loadPersistentJournal(disk.reopen(), db)).journal,
    loaded.journal,
  );
});
test("initial default trip stays the same across reopening after initial save", async () => {
  const db = new IDBFactory(),
    disk = memory();
  const first = await loadPersistentJournal(disk.reopen(), db);
  assert.equal(first.needsInitialSave, true);
  await savePersistentJournal(first.journal, disk.reopen(), db).backup;
  assert.equal(
    (await loadPersistentJournal(disk.reopen(), db)).journal.activeTripId,
    first.journal.activeTripId,
  );
});
test("unversioned primary written by an older app is not replaced with stale backup", async () => {
  const db = new IDBFactory(),
    disk = memory();
  await savePersistentJournal(journal("上一次"), disk.reopen(), db).backup;
  const changedByOlderApp = journal("舊程式最新修改");
  disk.disk.set(STORAGE_KEY, JSON.stringify(changedByOlderApp));
  assert.deepEqual(
    (await loadPersistentJournal(disk.reopen(), db)).journal,
    changedByOlderApp,
  );
});
test("rapid asynchronous writes retain the latest complete journal", async () => {
  const db = new IDBFactory(),
    disk = memory();
  const snapshots = Array.from({ length: 5 }, (_, i) =>
    journal("連續修改 " + i),
  );
  await Promise.all(
    snapshots.map(
      (data) => savePersistentJournal(data, disk.reopen(), db).backup,
    ),
  );
  assert.deepEqual(
    (await loadPersistentJournal(disk.reopen(), db)).journal,
    snapshots[4],
  );
});
test("late older write cannot replace a newer backup revision", async () => {
  const db = new IDBFactory(),
    disk = memory();
  const newer = journal("不可覆寫的新資料");
  await rawBackup(db, { journal: newer, revision: Date.now() * 1000 + 1e9 });
  const old = savePersistentJournal(journal("過時寫入"), disk.reopen(), db);
  assert.equal(await old.backup, false);
  assert.deepEqual(
    (await loadPersistentJournal(disk.reopen(), db)).journal,
    newer,
  );
});
