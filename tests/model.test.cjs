/* Pure domain tests, compiled in memory with the project's TypeScript dependency. */
/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => {
  const result = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  mod._compile(result.outputText, filename);
};
const m = require("../lib/travel.ts");
const storage = require("../lib/storage.ts");
const services = require("../lib/services.ts");
const schedule = (id, startTime, endTime, extra = {}) => ({
  id,
  startTime,
  endTime,
  day: 1,
  title: `地點 ${id}`,
  note: "",
  image: "",
  tag: "景點",
  travelTimeToNext: "",
  location: "",
  cost: 0,
  favorite: false,
  ...extra,
});
const legacy = () => ({
  id: 100,
  title: "舊版旅行",
  days: m.makeDays("2026-05-21"),
  schedules: [
    {
      id: 101,
      day: 1,
      startTime: "09:00",
      endTime: "10:00",
      title: "舊版景點",
      note: "保留備註",
      image: "",
      tag: "景點",
      travelTimeToNext: "15",
    },
  ],
});
const memory = (entries = {}) => {
  const map = new Map(Object.entries(entries));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
  };
};
test("calendar arithmetic handles leap days and rejects impossible dates", () => {
  assert.equal(m.addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(m.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(m.nights("2026-03-07", "2026-03-10"), 3);
  assert.throws(() => m.dateNumber("2026-02-29"));
  assert.throws(() => m.makeDays("2026-01-01", 0));
  assert.throws(() => m.makeDays("2026-01-01", 91));
});
test("legacy multi-trip migration preserves every original field and adds defaults", () => {
  const original = legacy(),
    second = { ...legacy(), id: 200, title: "第二趟旅行" };
  const mem = memory({
    trips: JSON.stringify([original, second]),
    activeTripId: "200",
    isDarkMode: "true",
  });
  const data = storage.readJournal(mem);
  assert.equal(data.activeTripId, 200);
  assert.equal(data.isDarkMode, true);
  for (const [key, value] of Object.entries(original.schedules[0]))
    assert.deepEqual(data.trips[0].schedules[0][key], value);
  assert.equal(data.trips[0].schedules[0].cost, 0);
  assert.deepEqual(data.trips[0].stays, []);
  storage.writeJournal(mem, data);
  assert.equal(mem.getItem("trips"), JSON.stringify([original, second]));
  assert.deepEqual(storage.readJournal(mem), data);
});
test("old single-trip storage is migrated without losing events", () => {
  const t = legacy();
  const data = storage.readJournal(
    memory({
      days: JSON.stringify(t.days),
      schedules: JSON.stringify(t.schedules),
      tripTitle: "更早的旅行",
    }),
  );
  assert.equal(data.trips[0].title, "更早的旅行");
  assert.equal(data.trips[0].schedules[0].note, "保留備註");
});
test("corrupt canonical data never silently falls back to old data", () => {
  const mem = memory({
    [storage.STORAGE_KEY]: "{broken",
    trips: JSON.stringify([legacy()]),
  });
  assert.throws(() => storage.readJournal(mem));
  assert.equal(mem.getItem(storage.STORAGE_KEY), "{broken");
});
test("invalid backups are rejected: empty, duplicate IDs, dangling day, unsafe image, negative budget", () => {
  assert.throws(() => m.parseBackup([]));
  assert.throws(() => m.parseBackup([legacy(), legacy()]));
  assert.throws(() => m.parseBackup({ version: 99, trips: [legacy()] }));
  assert.throws(() => m.parseBackup([{ ...legacy(), budget: -1 }]));
  assert.throws(() =>
    m.parseBackup([
      { ...legacy(), schedules: [schedule(1, "09:00", "10:00", { day: 9 })] },
    ]),
  );
  assert.throws(() =>
    m.parseBackup([
      {
        ...legacy(),
        schedules: [
          schedule(1, "09:00", "10:00", { image: "javascript:alert(1)" }),
        ],
      },
    ]),
  );
});
test("schedule validation rejects overlaps but allows adjacent slots and editing itself", () => {
  const a = schedule(1, "09:00", "10:00");
  assert.equal(m.scheduleError([a], { ...a, title: "改名" }), "");
  assert.equal(m.scheduleError([a], schedule(2, "10:00", "11:00")), "");
  assert.notEqual(m.scheduleError([a], schedule(2, "09:30", "10:30")), "");
  assert.notEqual(m.scheduleError([], schedule(2, "23:00", "00:30")), "");
});
test("reordering keeps activity durations, positional gaps and other days, clears stale transfer time", () => {
  const items = [
    schedule(1, "09:00", "10:00", { travelTimeToNext: "15" }),
    schedule(2, "10:30", "12:30"),
    schedule(3, "09:00", "10:00", { day: 2 }),
  ];
  const next = m.reorderDay(items, 1, [2, 1]);
  assert.equal(next.find((x) => x.id === 2).startTime, "09:00");
  assert.equal(next.find((x) => x.id === 2).endTime, "11:00");
  assert.equal(next.find((x) => x.id === 1).startTime, "11:30");
  assert.equal(next.find((x) => x.id === 1).endTime, "12:30");
  assert.equal(next.find((x) => x.id === 1).travelTimeToNext, "");
  assert.deepEqual(next[2], items[2]);
  assert.equal(items[0].startTime, "09:00");
  assert.throws(() => m.reorderDay(items, 1, [1, 1]));
});
test("money totals use cents, accommodation total is not multiplied by nights", () => {
  const trip = m.createTrip("預算", "2026-05-21");
  trip.people = 2;
  trip.schedules = [schedule(1, "09:00", "10:00", { cost: 0.1 })];
  trip.expenses = [{ id: 3, title: "額外", category: "其他", amount: 0.2 }];
  trip.stays = [
    {
      id: 2,
      name: "飯店",
      address: "",
      checkIn: "2026-05-21",
      checkOut: "2026-05-23",
      cost: 3000,
      booked: true,
      note: "",
    },
  ];
  const sum = m.budgetSummary(trip);
  assert.equal(sum.total, 3000.3);
  assert.equal(sum.perPerson, 1500.15);
  assert.equal(sum.categories["飯店"], 3000);
});
test("stays reject reversed or out-of-trip dates and accept last-day checkout+1", () => {
  const trip = m.createTrip("住宿", "2026-05-21");
  const stay = {
    id: 3,
    name: "住宿",
    checkIn: "2026-05-23",
    checkOut: "2026-05-24",
  };
  assert.equal(
    m.parseBackup([{ ...trip, stays: [stay] }]).trips[0].stays.length,
    1,
  );
  assert.throws(() =>
    m.parseBackup([{ ...trip, stays: [{ ...stay, checkOut: "2026-05-23" }] }]),
  );
  assert.throws(() =>
    m.parseBackup([{ ...trip, stays: [{ ...stay, checkOut: "2026-05-25" }] }]),
  );
});
test("map routes encode locations and enforce mobile waypoint limit", () => {
  const items = [
    schedule(1, "09:00", "10:00", { location: "台北 & 市府" }),
    schedule(2, "10:00", "11:00"),
    schedule(3, "11:00", "12:00"),
  ];
  const url = new URL(m.routeUrl(items, "walking"));
  assert.equal(url.searchParams.get("origin"), "台北 & 市府");
  assert.equal(url.searchParams.get("waypoints"), "地點 2");
  assert.throws(() => m.routeUrl([...items, ...items], "driving"));
});
test("storage quota errors are surfaced, never reported as successful writes", () => {
  assert.throws(() =>
    storage.writeJournal(
      {
        setItem() {
          throw new Error("quota");
        },
      },
      m.parseBackup([legacy()]),
    ),
  );
});
test("weather matches ISO dates rather than index offsets, missing forecast stays honest", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () =>
      ++calls === 1
        ? { results: [{ country_code: "TW", latitude: 25, longitude: 121 }] }
        : {
            daily: {
              time: ["2026-05-22"],
              weather_code: [0],
              temperature_2m_max: [28.4],
            },
          },
  }));
  const days = await services.getWeather(
    "台北",
    m.makeDays("2026-05-21"),
    new AbortController().signal,
  );
  assert.equal(days[0].temperature, "尚無預報");
  assert.equal(days[1].temperature, "28°");
  assert.equal(days[1].weather, "☀️");
  assert.equal(days[2].temperature, "尚無預報");
});
test("weather HTTP failure is visible", async (t) => {
  t.mock.method(globalThis, "fetch", async () => ({ ok: false }));
  await assert.rejects(
    services.getWeather(
      "台北",
      m.makeDays("2026-05-21"),
      new AbortController().signal,
    ),
  );
});
