import { type Day, type Schedule } from "./travel";
type Forecast = {
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: (number | null)[];
  };
};
export function weatherIcon(code: number) {
  if (code === 0) return "☀️";
  if ([1, 2, 3].includes(code)) return "⛅";
  if ([45, 48].includes(code)) return "🌫️";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  return "🌧️";
}
const cities: Record<string, string> = {
  新竹: "Hsinchu",
  台北: "Taipei",
  臺北: "Taipei",
  台中: "Taichung",
  臺中: "Taichung",
  台南: "Tainan",
  臺南: "Tainan",
  高雄: "Kaohsiung",
  宜蘭: "Yilan",
  花蓮: "Hualien",
  台東: "Taitung",
  臺東: "Taitung",
  嘉義: "Chiayi",
  桃園: "Taoyuan",
  基隆: "Keelung",
  南投: "Nantou",
  屏東: "Pingtung",
};
export async function getWeather(
  city: string,
  days: Day[],
  signal: AbortSignal,
): Promise<Day[]> {
  if (!city.trim()) throw new Error("請先輸入台灣城市。");
  const query = new URLSearchParams({
    name: cities[city.trim()] || city.trim(),
    count: "5",
    language: "zh",
    format: "json",
    countryCode: "TW",
  });
  const geo = await fetch(
    "https://geocoding-api.open-meteo.com/v1/search?" + query,
    { signal },
  );
  if (!geo.ok) throw new Error("地區查詢暫時無法使用，請稍後再試。");
  const data = (await geo.json()) as {
    results?: { country_code: string; latitude: number; longitude: number }[];
  };
  const found = data.results?.find((x) => x.country_code === "TW");
  if (!found) throw new Error("找不到台灣地區，請試試完整城市名稱或英文名稱。");
  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${found.latitude}&longitude=${found.longitude}&daily=weather_code,temperature_2m_max&forecast_days=16&timezone=Asia%2FTaipei`,
    { signal },
  );
  if (!response.ok) throw new Error("天氣服務暫時無法使用，請稍後再試。");
  const weather = (await response.json()) as Forecast;
  if (
    !weather.daily ||
    !Array.isArray(weather.daily.time) ||
    !Array.isArray(weather.daily.weather_code) ||
    !Array.isArray(weather.daily.temperature_2m_max)
  )
    throw new Error("天氣資料不完整。");
  return days.map((day) => {
    const i = weather.daily!.time.indexOf(day.date);
    const max = weather.daily!.temperature_2m_max[i];
    const code = weather.daily!.weather_code[i];
    return i < 0 || !Number.isFinite(max) || !Number.isFinite(code)
      ? { ...day, weather: "🕒", temperature: "尚無預報" }
      : {
          ...day,
          weather: weatherIcon(code),
          temperature: `${Math.round(max!)}°`,
        };
  });
}
const geoCache = new Map<string, { lat: number; lon: number }>();
let nextRequestAt = 0;
export async function nearestOrder(
  items: Schedule[],
  signal: AbortSignal,
  progress: (text: string) => void,
) {
  if (items.length < 3 || items.length > 12)
    throw new Error("距離排序支援同一天 3 至 12 個台灣地點。");
  const located: { item: Schedule; lat: number; lon: number }[] = [];
  for (const item of items) {
    signal.throwIfAborted();
    const query = (item.location || item.title).trim();
    progress(`查詢地點 ${located.length + 1}/${items.length}`);
    let coords = geoCache.get(query);
    if (!coords) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(0, nextRequestAt - Date.now())),
      );
      signal.throwIfAborted();
      nextRequestAt = Date.now() + 1100;
      const response = await fetch(
        "https://nominatim.openstreetmap.org/search?" +
          new URLSearchParams({
            format: "json",
            limit: "1",
            countrycodes: "tw",
            q: query,
          }),
        { signal, headers: { Accept: "application/json" } },
      );
      if (!response.ok)
        throw new Error("地點搜尋暫時受限，請稍後重試或手動排序。");
      const data = (await response.json()) as { lat: string; lon: string }[];
      if (!data[0])
        throw new Error(`找不到「${query}」，請填寫更完整的地點或地址。`);
      coords = { lat: Number(data[0].lat), lon: Number(data[0].lon) };
      if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lon))
        throw new Error("地點座標不正確。");
      geoCache.set(query, coords);
    }
    located.push({ item, ...coords });
  }
  const route = [located[0]],
    remaining = located.slice(1);
  while (remaining.length) {
    const current = route.at(-1)!;
    let best = 0,
      distance = Infinity;
    remaining.forEach((p, i) => {
      const d =
        (current.lat - p.lat) ** 2 +
        ((current.lon - p.lon) * Math.cos((current.lat * Math.PI) / 180)) ** 2;
      if (d < distance) {
        distance = d;
        best = i;
      }
    });
    route.push(remaining.splice(best, 1)[0]);
  }
  return route.map((x) => x.item.id);
}
export async function compressPhoto(file: File): Promise<string> {
  if (
    !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)
  )
    throw new Error("請選擇 JPG、PNG、WebP 或 GIF 圖片。");
  if (file.size > 12000000) throw new Error("圖片不可超過 12 MB。");
  const bitmap = await createImageBitmap(file);
  try {
    const ratio = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("瀏覽器無法處理圖片。");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL("image/webp", 0.78);
    if (result.length > 1000000)
      throw new Error("圖片壓縮後仍過大，請選擇較小的圖片。");
    return result;
  } finally {
    bitmap.close();
  }
}
