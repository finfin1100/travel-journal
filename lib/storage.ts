import { createTrip, parseBackup, type Journal } from "./travel";
export const STORAGE_KEY = "travel-journal.v2";
type StorageReader = Pick<Storage, "getItem">;
export function readJournal(storage: StorageReader): Journal {
  const current = storage.getItem(STORAGE_KEY);
  if (current !== null) return parseBackup(JSON.parse(current));
  const legacyTrips = storage.getItem("trips");
  if (legacyTrips !== null) {
    return parseBackup({
      trips: JSON.parse(legacyTrips),
      activeTripId: JSON.parse(storage.getItem("activeTripId") || "null"),
      isDarkMode: JSON.parse(storage.getItem("isDarkMode") || "false"),
    });
  }
  const oldDays = storage.getItem("days"),
    oldSchedules = storage.getItem("schedules");
  if (oldDays || oldSchedules) {
    const initial = createTrip(storage.getItem("tripTitle") || "我的旅行");
    return parseBackup({
      trips: [
        {
          ...initial,
          days: oldDays ? JSON.parse(oldDays) : initial.days,
          schedules: oldSchedules ? JSON.parse(oldSchedules) : [],
        },
      ],
      activeTripId: initial.id,
      isDarkMode: JSON.parse(storage.getItem("isDarkMode") || "false"),
    });
  }
  const first = createTrip("台灣三日遊 🇹🇼");
  return {
    version: 2,
    trips: [first],
    activeTripId: first.id,
    isDarkMode: false,
  };
}
export function writeJournal(storage: Pick<Storage, "setItem">, data: Journal) {
  // A single atomic key avoids partially saving a trip and its active ID separately.
  // Original legacy keys are intentionally left untouched for recovery.
  storage.setItem(STORAGE_KEY, JSON.stringify(data));
}
