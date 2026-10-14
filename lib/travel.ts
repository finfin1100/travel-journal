export const TAGS = ["景點", "美食", "交通", "飯店", "購物", "其他"] as const;
export const CURRENCIES = ["TWD", "JPY", "USD", "EUR", "KRW"] as const;
export type Day = {
  day: number;
  date: string;
  weather: string;
  temperature: string;
};
export type Schedule = {
  id: number;
  day: number;
  startTime: string;
  endTime: string;
  title: string;
  note: string;
  image: string;
  tag: string;
  travelTimeToNext: string;
  location: string;
  cost: number;
  favorite: boolean;
};
export type Stay = {
  id: number;
  name: string;
  address: string;
  checkIn: string;
  checkOut: string;
  cost: number;
  booked: boolean;
  note: string;
};
export type Expense = {
  id: number;
  title: string;
  category: string;
  amount: number;
};
export type Trip = {
  id: number;
  title: string;
  days: Day[];
  schedules: Schedule[];
  weatherLocation: string;
  travelMode: string;
  budget: number;
  currency: string;
  people: number;
  stays: Stay[];
  expenses: Expense[];
  note: string;
};
export type Journal = {
  version: 2;
  trips: Trip[];
  activeTripId: number;
  isDarkMode: boolean;
};
const DAY = 86400000;
export function newId() {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}
export function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function dateNumber(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("日期格式不正確。");
  const date = new Date(value + "T12:00:00Z");
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    throw new Error("日期不存在。");
  return date.getTime();
}
export function addDays(value: string, amount: number) {
  const result = new Date(dateNumber(value) + amount * DAY)
    .toISOString()
    .slice(0, 10);
  dateNumber(result);
  return result;
}
export function nights(start: string, end: string) {
  return Math.round((dateNumber(end) - dateNumber(start)) / DAY);
}
export function makeDays(start: string, count = 3): Day[] {
  if (!Number.isInteger(count) || count < 1 || count > 90)
    throw new Error("旅行天數必須是 1 至 90 天。");
  return Array.from({ length: count }, (_, i) => ({
    day: i + 1,
    date: addDays(start, i),
    weather: "",
    temperature: "",
  }));
}
export function createTrip(title = "新的旅行", start = localDate()): Trip {
  return {
    id: newId(),
    title,
    days: makeDays(start),
    schedules: [],
    weatherLocation: "新竹",
    travelMode: "driving",
    budget: 10000,
    currency: "TWD",
    people: 1,
    stays: [],
    expenses: [],
    note: "",
  };
}
export function toMinutes(time: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new Error("請輸入有效時間。");
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
export function toTime(minutes: number) {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1439)
    throw new Error("重排後行程超過午夜，請先縮短活動或移動時間。");
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
export function scheduleError(items: Schedule[], item: Schedule) {
  if (!item.title.trim()) return "請輸入行程名稱。";
  try {
    if (toMinutes(item.endTime) <= toMinutes(item.startTime))
      return "結束時間必須晚於開始時間（跨日活動請拆成兩筆）。";
  } catch {
    return "請輸入有效的開始與結束時間。";
  }
  if (
    items.some(
      (x) =>
        x.id !== item.id &&
        x.day === item.day &&
        item.startTime < x.endTime &&
        item.endTime > x.startTime,
    )
  )
    return "這段時間與另一個行程重疊，請調整時間。";
  return "";
}
export function reorderDay(items: Schedule[], day: number, ids: number[]) {
  const original = items
    .filter((x) => x.day === day)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  if (
    ids.length !== original.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !original.some((x) => x.id === id))
  )
    throw new Error("重排資料已變更，請再試一次。");
  const gaps = original
    .slice(1)
    .map((x, i) =>
      Math.max(0, toMinutes(x.startTime) - toMinutes(original[i].endTime)),
    );
  let cursor = original.length ? toMinutes(original[0].startTime) : 0;
  const reordered = ids.map((id, i) => {
    const item = original.find((x) => x.id === id)!;
    const duration = toMinutes(item.endTime) - toMinutes(item.startTime);
    const next = {
      ...item,
      startTime: toTime(cursor),
      endTime: toTime(cursor + duration),
      travelTimeToNext: "",
    };
    cursor += duration + (gaps[i] || 0);
    return next;
  });
  return items.map((item) => reordered.find((x) => x.id === item.id) || item);
}
export function budgetSummary(trip: Trip) {
  const categoryCents: Record<string, number> = Object.fromEntries(
    TAGS.map((t) => [t, 0]),
  );
  const add = (key: string, amount: number) => {
    categoryCents[key] = (categoryCents[key] || 0) + Math.round(amount * 100);
  };
  trip.schedules.forEach((x) => add(x.tag, x.cost));
  trip.stays.forEach((x) => add("飯店", x.cost));
  trip.expenses.forEach((x) => add(x.category, x.amount));
  const totalCents = Object.values(categoryCents).reduce((a, b) => a + b, 0);
  return {
    total: totalCents / 100,
    remaining: (Math.round(trip.budget * 100) - totalCents) / 100,
    perPerson: Math.round(totalCents / trip.people) / 100,
    categories: Object.fromEntries(
      Object.entries(categoryCents).map(([key, value]) => [key, value / 100]),
    ),
  };
}
type Obj = Record<string, unknown>;
function object(value: unknown): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("備份資料格式不正確。");
  return value as Obj;
}
function text(value: unknown, fallback = "", max = 10000) {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || value.length > max)
    throw new Error("資料文字格式或長度不正確。");
  return value;
}
function number(value: unknown, fallback = 0, max = 1000000000) {
  if (value === undefined) return fallback;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > max
  )
    throw new Error("金額或數字不正確。");
  return value;
}
function identifier(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0)
    throw new Error("旅行或項目 ID 不正確。");
  return value;
}
function boolean(value: unknown, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new Error("勾選狀態不正確。");
  return value;
}
function list(value: unknown, max = 1000): Obj[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max)
    throw new Error("資料清單格式或數量不正確。");
  return value.map(object);
}
function unique<T extends { id: number }>(items: T[]) {
  if (new Set(items.map((x) => x.id)).size !== items.length)
    throw new Error("資料含有重複 ID，無法安全匯入。");
  return items;
}
function tag(value: unknown) {
  const result = text(value, "其他");
  if (!(TAGS as readonly string[]).includes(result))
    throw new Error("費用類別不正確。");
  return result;
}
export function parseTrips(raw: unknown): Trip[] {
  const trips = unique(
    list(raw, 50).map((t) => {
      const days = list(t.days, 90).map((d, i) => {
        const date = text(d.date);
        dateNumber(date);
        if (d.day !== i + 1) throw new Error("旅行天數編號不連續。");
        return {
          day: i + 1,
          date,
          weather: text(d.weather, "", 50),
          temperature: text(d.temperature, "", 100),
        };
      });
      if (!days.length || new Set(days.map((d) => d.date)).size !== days.length)
        throw new Error("每趟旅行需要至少一天，日期不可重複。");
      if (days.some((d, i) => i > 0 && d.date <= days[i - 1].date))
        throw new Error("旅行日期必須依序排列。");
      const people = number(t.people, 1, 50);
      if (!Number.isInteger(people) || people < 1)
        throw new Error("旅伴人數必須為 1 至 50。");
      const currency = text(t.currency, "TWD");
      if (!(CURRENCIES as readonly string[]).includes(currency))
        throw new Error("不支援的幣別。");
      const schedules = unique(
        list(t.schedules).map((s) => {
          const day = number(s.day);
          if (!days.some((d) => d.day === day))
            throw new Error("行程所屬日期不存在。");
          const startTime = text(s.startTime),
            endTime = text(s.endTime);
          if (toMinutes(endTime) <= toMinutes(startTime))
            throw new Error("行程結束時間必須晚於開始時間。");
          const image = text(s.image, "", 8000000);
          if (
            image &&
            !/^data:image\/(png|jpe?g|webp|gif|avif|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(
              image,
            ) &&
            !/^https?:\/\//i.test(image)
          )
            throw new Error("圖片格式不受支援。");
          return {
            id: identifier(s.id),
            day,
            startTime,
            endTime,
            title: text(s.title, "未命名行程", 200),
            note: text(s.note),
            image,
            tag: tag(s.tag === undefined ? "景點" : s.tag),
            travelTimeToNext: text(s.travelTimeToNext, "", 30),
            location: text(s.location, "", 500),
            cost: number(s.cost),
            favorite: boolean(s.favorite),
          };
        }),
      );
      const stays = unique(
        list(t.stays).map((s) => {
          const checkIn = text(s.checkIn),
            checkOut = text(s.checkOut);
          if (
            nights(checkIn, checkOut) < 1 ||
            checkIn < days[0].date ||
            checkIn > days.at(-1)!.date ||
            checkOut > addDays(days.at(-1)!.date, 1)
          )
            throw new Error("住宿日期必須在旅行範圍內，退房日晚於入住日。");
          return {
            id: identifier(s.id),
            name: text(s.name, "", 200),
            address: text(s.address, "", 500),
            checkIn,
            checkOut,
            cost: number(s.cost),
            booked: boolean(s.booked),
            note: text(s.note),
          };
        }),
      );
      const expenses = unique(
        list(t.expenses).map((e) => ({
          id: identifier(e.id),
          title: text(e.title, "", 200),
          category: tag(e.category),
          amount: number(e.amount),
        })),
      );
      const travelMode = text(t.travelMode, "driving");
      if (!["driving", "walking", "transit", "bicycling"].includes(travelMode))
        throw new Error("交通方式不正確。");
      return {
        id: identifier(t.id),
        title: text(t.title, "未命名旅行", 200),
        days,
        schedules,
        weatherLocation: text(t.weatherLocation, "新竹", 100),
        travelMode,
        budget: number(t.budget, 10000),
        currency,
        people,
        stays,
        expenses,
        note: text(t.note),
      };
    }),
  );
  if (!trips.length) throw new Error("備份中沒有旅行，未變更現有資料。");
  return trips;
}
export function parseBackup(raw: unknown): Journal {
  if (Array.isArray(raw)) {
    const trips = parseTrips(raw);
    return { version: 2, trips, activeTripId: trips[0].id, isDarkMode: false };
  }
  const data = object(raw);
  if (data.version !== undefined && data.version !== 1 && data.version !== 2)
    throw new Error("不支援此備份版本。");
  const trips = parseTrips(data.trips);
  return {
    version: 2,
    trips,
    activeTripId: trips.some((t) => t.id === data.activeTripId)
      ? (data.activeTripId as number)
      : trips[0].id,
    isDarkMode: boolean(data.isDarkMode),
  };
}
export function mapUrl(location: string) {
  return (
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(location)
  );
}
export function routeUrl(items: Schedule[], mode: string) {
  if (items.length < 2) throw new Error("至少需要兩個行程。");
  // Google Maps mobile browsers support up to three intermediate waypoints.
  if (items.length > 5)
    throw new Error("為了相容手機地圖，每段最多 5 站；請使用分段路線按鈕。");
  const query = new URLSearchParams({
    api: "1",
    origin: items[0].location || items[0].title,
    destination: items.at(-1)!.location || items.at(-1)!.title,
    travelmode: mode,
  });
  if (items.length > 2)
    query.set(
      "waypoints",
      items
        .slice(1, -1)
        .map((x) => x.location || x.title)
        .join("|"),
    );
  return "https://www.google.com/maps/dir/?" + query.toString();
}
