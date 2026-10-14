import { parseBackup, type Journal } from "./travel";
import { readJournal, STORAGE_KEY } from "./storage";

// Both stores belong to this browser profile and origin, not to a tab/session.
export const DATABASE_NAME = "travel-journal-backup";
const STORE = "journal";
const RECORD = "current";
const TIMEOUT = 5000;
type Snapshot = { journal: Journal; revision: number };
type LocalStorage = Pick<Storage, "getItem" | "setItem">;
let lastRevision = 0;

export function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
function browserDatabase(): IDBFactory | undefined {
  try {
    return window.indexedDB;
  } catch {
    return undefined;
  }
}
function snapshot(raw: unknown): Snapshot {
  if (!raw || typeof raw !== "object") throw new Error("本機備援格式不正確。");
  const record = raw as Record<string, unknown>;
  if (
    typeof record.revision !== "number" ||
    !Number.isSafeInteger(record.revision) ||
    record.revision < 0
  )
    throw new Error("本機備援版本不正確。");
  return { journal: parseBackup(record.journal), revision: record.revision };
}

// Resolve writes only after the transaction completes, never on put.onsuccess.
// Close every connection so reopening the browser can use the same database.
function databaseOperation<T>(
  factory: IDBFactory | undefined,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore, result: (value: T) => void) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!factory) {
      reject(new Error("瀏覽器不支援本機備援。"));
      return;
    }
    let db: IDBDatabase | undefined;
    let transaction: IDBTransaction | undefined;
    let finished = false;
    let value: T;
    const finish = (error?: unknown) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      db?.close();
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => {
      finish(new Error("本機備援暫時無法使用。"));
      try {
        transaction?.abort();
      } catch {
        /* Already completed. */
      }
    }, TIMEOUT);
    try {
      const opening = factory.open(DATABASE_NAME, 1);
      opening.onerror = () =>
        finish(opening.error || new Error("無法開啟本機備援。"));
      opening.onblocked = () =>
        finish(new Error("另一個頁面正在更新本機備援，請稍後重試。"));
      opening.onupgradeneeded = () => {
        if (!opening.result.objectStoreNames.contains(STORE))
          opening.result.createObjectStore(STORE);
      };
      opening.onsuccess = () => {
        db = opening.result;
        if (finished) {
          db.close();
          return;
        }
        db.onversionchange = () => db?.close();
        try {
          // Strict durability asks supported browsers to flush before completion.
          try {
            transaction = db.transaction(STORE, mode, { durability: "strict" });
          } catch {
            transaction = db.transaction(STORE, mode);
          }
          transaction.oncomplete = () => finish();
          transaction.onabort = () =>
            finish(transaction?.error || new Error("本機備援未完成。"));
          transaction.onerror = () =>
            finish(transaction?.error || new Error("本機備援儲存失敗。"));
          action(transaction.objectStore(STORE), (result) => {
            value = result;
          });
        } catch (error) {
          finish(error);
        }
      };
    } catch (error) {
      finish(error);
    }
  });
}
async function readBackup(
  factory: IDBFactory | undefined,
): Promise<Snapshot | null> {
  const raw = await databaseOperation<unknown>(
    factory,
    "readonly",
    (store, result) => {
      const request = store.get(RECORD);
      request.onsuccess = () => result(request.result);
    },
  );
  return raw === undefined ? null : snapshot(raw);
}
function saveBackup(
  factory: IDBFactory | undefined,
  data: Snapshot,
): Promise<boolean> {
  return databaseOperation<boolean>(factory, "readwrite", (store, result) => {
    const request = store.get(RECORD);
    request.onsuccess = () => {
      const previous = request.result as Snapshot | undefined;
      // An older asynchronous save must not replace a newer saved revision.
      if (
        previous &&
        Number.isSafeInteger(previous.revision) &&
        previous.revision > data.revision
      ) {
        result(false);
        return;
      }
      store.put(data, RECORD);
      result(true);
    };
  }).catch(() => false);
}

export function savePersistentJournal(
  journal: Journal,
  storage = browserStorage(),
  factory = browserDatabase(),
) {
  const checked = parseBackup(journal);
  const revision = Math.max(Date.now() * 1000, lastRevision + 1);
  lastRevision = revision;
  const record = { journal: checked, revision };
  let localSaved = false;
  try {
    if (storage) {
      // Metadata and all travel data use one atomic localStorage write.
      storage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...checked, _savedRevision: revision }),
      );
      localSaved = true;
    }
  } catch {
    /* IndexedDB can still save when localStorage has reached its quota. */
  }
  return { localSaved, revision, backup: saveBackup(factory, record) };
}

export async function loadPersistentJournal(
  storage: LocalStorage | undefined = browserStorage(),
  factory: IDBFactory | undefined = browserDatabase(),
) {
  let local: Journal | undefined;
  let revision = 0;
  let hasCurrent = false;
  let localError: unknown;
  try {
    if (!storage)
      throw new Error(
        "瀏覽器禁止讀取本機資料，請使用一般瀏覽模式並允許網站儲存。",
      );
    const raw = storage.getItem(STORAGE_KEY);
    hasCurrent = raw !== null;
    local = readJournal(storage);
    if (raw !== null) {
      const metadata = JSON.parse(raw) as { _savedRevision?: unknown };
      if (
        typeof metadata._savedRevision === "number" &&
        Number.isSafeInteger(metadata._savedRevision) &&
        metadata._savedRevision >= 0
      )
        revision = metadata._savedRevision;
    }
  } catch (error) {
    localError = error;
  }
  const backup = await readBackup(factory).catch(() => null);
  lastRevision = Math.max(lastRevision, revision, backup?.revision || 0);
  // An existing unversioned v2 key may be written by a previous app version.
  // Honor that valid key; don't silently restore stale data after a rollback.
  const preferBackup =
    backup &&
    (!local || !hasCurrent || (revision > 0 && backup.revision > revision));
  if (preferBackup)
    return {
      journal: backup.journal,
      recovered: true,
      needsInitialSave: false,
    };
  if (!local) throw localError || new Error("沒有可以還原的旅行資料。");
  if (hasCurrent) void saveBackup(factory, { journal: local, revision });
  return { journal: local, recovered: false, needsInitialSave: !hasCurrent };
}

export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}
