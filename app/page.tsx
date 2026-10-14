"use client";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import Image from "next/image";
import {
  TAGS,
  CURRENCIES,
  addDays,
  budgetSummary,
  createTrip,
  localDate,
  makeDays,
  mapUrl,
  newId,
  nights,
  parseBackup,
  reorderDay,
  routeUrl,
  scheduleError,
  toMinutes,
  toTime,
  type Journal,
  type Trip,
  type Schedule,
  type Stay,
  type Expense,
} from "../lib/travel";
import { STORAGE_KEY } from "../lib/storage";
import {
  browserStorage,
  loadPersistentJournal,
  requestPersistentStorage,
  savePersistentJournal,
} from "../lib/persistence";
import { compressPhoto, getWeather, nearestOrder } from "../lib/services";

type Tab = "行程" | "地圖" | "住宿" | "預算" | "收藏" | "我的";
type Editor =
  | { kind: "trip"; item?: Trip }
  | { kind: "schedule"; item?: Schedule }
  | { kind: "stay"; item?: Stay }
  | { kind: "expense"; item?: Expense };
const icons = ["◷", "↗", "⌂", "＄", "♡", "⚙"];
const message = (e: unknown) =>
  e instanceof Error ? e.message : "操作失敗，請再試一次。";
function download(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "field wide" : "field"}>
      <span>{label}</span>
      {children}
    </label>
  );
}
function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">✧</span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} onCancel={close} aria-labelledby="editor-title">
      <div className="dialog-head">
        <h2 id="editor-title">{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="關閉視窗"
          onClick={close}
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}

export default function Home() {
  const [journal, setJournal] = useState<Journal | null>(null);
  const current = useRef<Journal | null>(null);
  const unsaved = useRef(false);
  const latestSave = useRef(0);
  const mounted = useRef(false);
  const syncChannel = useRef<BroadcastChannel | null>(null);
  const [persistentStorage, setPersistentStorage] = useState<string>("");
  const [fatal, setFatal] = useState("");
  const [notice, setNotice] = useState("");
  const [saveState, setSaveState] = useState("讀取中");
  const [conflict, setConflict] = useState(false);
  const conflictRef = useRef(false);
  const [tab, setTab] = useState<Tab>("行程");
  const [day, setDay] = useState(1);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [formError, setFormError] = useState("");
  const [photo, setPhoto] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoVersion = useRef(0);
  const [busy, setBusy] = useState("");
  const request = useRef<AbortController | null>(null);
  const dragId = useRef<number | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    mounted.current = true;
    const timer = setTimeout(async () => {
      try {
        const loaded = await loadPersistentJournal();
        if (!mounted.current) return;
        const data = loaded.journal;
        current.current = data;
        setJournal(data);
        setSaveState(
          loaded.recovered ? "已從本機備援還原資料" : "已讀取上次保存的資料",
        );
        if (loaded.recovered)
          setNotice(
            "已找回本機備援中的旅行資料。你可以繼續使用，也建議匯出一份備份。",
          );
        if (loaded.needsInitialSave) storeJournal(data);
      } catch (e) {
        if (mounted.current) setFatal(message(e));
      }
    }, 0);
    const flagConflict = () => {
      conflictRef.current = true;
      setConflict(true);
    };
    try {
      if (typeof BroadcastChannel !== "undefined") {
        syncChannel.current = new BroadcastChannel("travel-journal-saves");
        syncChannel.current.onmessage = flagConflict;
      }
    } catch {
      /* The storage event still protects normal localStorage writes. */
    }
    const onStorage = (e: StorageEvent) => {
      if (
        e.storageArea === browserStorage() &&
        (e.key === STORAGE_KEY || e.key === null)
      ) {
        flagConflict();
      }
    };
    window.addEventListener("storage", onStorage);
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (unsaved.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      mounted.current = false;
      syncChannel.current?.close();
      syncChannel.current = null;
      clearTimeout(timer);
      request.current?.abort();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);
  function storeJournal(data: Journal) {
    const saved = savePersistentJournal(data);
    latestSave.current = saved.revision;
    unsaved.current = !saved.localSaved;
    setSaveState(
      saved.localSaved
        ? "已儲存，下次開啟會保留（正在建立備援）"
        : "正在儲存到本機備援，請暫勿關閉頁面…",
    );
    if (saved.localSaved) syncChannel.current?.postMessage(saved.revision);
    void saved.backup.then((backupSaved) => {
      if (!mounted.current || latestSave.current !== saved.revision) return;
      unsaved.current = !saved.localSaved && !backupSaved;
      setSaveState(
        saved.localSaved && backupSaved
          ? "已儲存並備援，下次開啟會保留"
          : saved.localSaved
            ? "已儲存，下次開啟會保留（備援暫不可用）"
            : backupSaved
              ? "已儲存到本機備援，下次開啟會還原"
              : "尚未儲存：瀏覽器無法保存資料。請立即匯出備份。",
      );
      if (!saved.localSaved && backupSaved)
        syncChannel.current?.postMessage(saved.revision);
    });
  }
  function commit(next: Journal) {
    if (conflictRef.current)
      throw new Error("另一個分頁已更新資料。請先備份目前畫面，再重新載入。");
    const checked = parseBackup(next);
    current.current = checked;
    setJournal(checked);
    storeJournal(checked);
  }
  function change(id: number, update: (trip: Trip) => Trip) {
    const data = current.current;
    if (!data) return;
    commit({
      ...data,
      trips: data.trips.map((t) => (t.id === id ? update(t) : t)),
    });
  }
  function safely(action: () => void) {
    try {
      action();
    } catch (e) {
      setNotice(message(e));
    }
  }
  function stopRequest() {
    request.current?.abort();
    request.current = null;
    setBusy("");
  }
  function openEditor(value: Editor) {
    stopRequest();
    photoVersion.current++;
    setPhotoBusy(false);
    setFormError("");
    setPhoto(value.kind === "schedule" ? value.item?.image || "" : "");
    setEditor(value);
  }
  function closeEditor() {
    photoVersion.current++;
    setPhotoBusy(false);
    setEditor(null);
    setFormError("");
  }
  async function importBackup(file?: File) {
    if (!file) return;
    try {
      if (file.size > 30000000) throw new Error("備份檔不可超過 30 MB。");
      const data = parseBackup(JSON.parse(await file.text()));
      if (
        !window.confirm(
          `匯入 ${data.trips.length} 趟旅行，並取代目前全部旅行？建議先匯出現有備份。`,
        )
      )
        return;
      commit(data);
      setFatal("");
      setDay(1);
      closeEditor();
      stopRequest();
      setNotice("備份已匯入。請留意上方儲存狀態。");
    } catch (e) {
      setNotice("無法匯入：" + message(e));
    }
  }
  function rawBackup() {
    safely(() =>
      download(
        "travel-journal-recovery.json",
        Object.fromEntries(
          [
            STORAGE_KEY,
            "trips",
            "activeTripId",
            "days",
            "schedules",
            "tripTitle",
            "isDarkMode",
          ].map((key) => [key, localStorage.getItem(key)]),
        ),
      ),
    );
  }
  const importControl = (
    <input
      ref={importInput}
      aria-label="匯入旅行備份"
      type="file"
      accept=".json,application/json"
      hidden
      onChange={(e) => {
        void importBackup(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );
  if (!journal)
    return (
      <main className="loading">
        <div className="brand-mark">旅</div>
        <h1>旅行手記</h1>
        {fatal ? (
          <>
            <p role="alert">無法安全讀取原有資料：{fatal}</p>
            <p>原始資料沒有被覆蓋。請先下載救援檔，再匯入有效備份。</p>
            <div className="actions">
              <button onClick={rawBackup}>下載原始救援檔</button>
              <button onClick={() => importInput.current?.click()}>
                匯入備份
              </button>
              <button
                className="danger"
                onClick={() =>
                  safely(() => {
                    if (
                      confirm(
                        "確定建立新資料？這會取代新版儲存內容。請先下載救援檔。",
                      )
                    ) {
                      const t = createTrip();
                      commit({
                        version: 2,
                        trips: [t],
                        activeTripId: t.id,
                        isDarkMode: false,
                      });
                      setFatal("");
                    }
                  })
                }
              >
                建立新資料
              </button>
            </div>
          </>
        ) : (
          <p>正在打開你的旅行手記…</p>
        )}
        {notice && <p role="alert">{notice}</p>}
        {importControl}
      </main>
    );
  const trip = journal.trips.find((t) => t.id === journal.activeTripId)!;
  const selected = trip.days.find((d) => d.day === day) || trip.days[0];
  const daily = trip.schedules
    .filter((s) => s.day === selected.day)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const summary = budgetSummary(trip);
  const money = (value: number) =>
    new Intl.NumberFormat("zh-TW", {
      style: "currency",
      currency: trip.currency,
      maximumFractionDigits: 2,
    }).format(value);
  const formatDate = (date: string) =>
    new Date(date + "T12:00:00").toLocaleDateString("zh-TW", {
      month: "short",
      day: "numeric",
      weekday: "short",
    });
  const addSchedule = () => openEditor({ kind: "schedule" });
  function move(id: number, direction: number) {
    const ids = daily.map((s) => s.id);
    const i = ids.indexOf(id),
      j = i + direction;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    safely(() =>
      change(trip.id, (t) => ({
        ...t,
        schedules: reorderDay(t.schedules, selected.day, ids),
      })),
    );
  }
  function removeSchedule(item: Schedule) {
    if (confirm(`刪除「${item.title}」？照片與備註也會一併刪除。`))
      safely(() =>
        change(trip.id, (t) => ({
          ...t,
          schedules: t.schedules.filter((s) => s.id !== item.id),
        })),
      );
  }
  async function weather() {
    stopRequest();
    const controller = new AbortController();
    request.current = controller;
    setBusy("更新天氣中…");
    const snapshot = trip.days.map((d) => d.date).join();
    try {
      const days = await getWeather(
        trip.weatherLocation,
        trip.days,
        controller.signal,
      );
      controller.signal.throwIfAborted();
      const latest = current.current?.trips.find((t) => t.id === trip.id);
      if (
        !latest ||
        latest.days.map((d) => d.date).join() !== snapshot ||
        latest.weatherLocation !== trip.weatherLocation
      )
        return;
      change(trip.id, (t) => ({ ...t, days }));
      setNotice(
        "天氣已更新。僅提供台灣地區未來約 16 天預報，其他日期顯示尚無預報。",
      );
    } catch (e) {
      if (!controller.signal.aborted) setNotice(message(e));
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy("");
      }
    }
  }
  async function optimize() {
    if (
      !confirm(
        "將把行程地點送至 OpenStreetMap 查詢，以第一站為起點做近距離排序。這是直線距離建議，不含路況或營業時間；完成後會再請你確認。繼續嗎？",
      )
    )
      return;
    stopRequest();
    const controller = new AbortController();
    request.current = controller;
    setBusy("查詢地點中…");
    const snapshot = JSON.stringify(daily);
    try {
      const ids = await nearestOrder(daily, controller.signal, setBusy);
      controller.signal.throwIfAborted();
      const latest = current.current?.trips.find((t) => t.id === trip.id);
      if (
        !latest ||
        JSON.stringify(
          latest.schedules
            .filter((s) => s.day === selected.day)
            .sort((a, b) => a.startTime.localeCompare(b.startTime)),
        ) !== snapshot
      )
        throw new Error("行程已變更，請重新排序。");
      const names = ids
        .map((id, i) => `${i + 1}. ${daily.find((s) => s.id === id)!.title}`)
        .join("\n");
      if (
        confirm(
          `建議順序：\n${names}\n\n套用後保留各活動時長與時段間隔，並清除原本的交通分鐘數。套用嗎？`,
        )
      )
        change(trip.id, (t) => ({
          ...t,
          schedules: reorderDay(t.schedules, selected.day, ids),
        }));
    } catch (e) {
      if (!controller.signal.aborted) setNotice(message(e));
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy("");
      }
    }
  }
  function saveForm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editor) return;
    const data = new FormData(e.currentTarget);
    const str = (key: string) => String(data.get(key) || "").trim();
    const num = (key: string) => Number(str(key));
    try {
      if (!str("title")) throw new Error("名稱不能只有空白。");
      if (editor.kind === "trip") {
        const start = str("start"),
          count = num("count"),
          old = editor.item;
        const base = old || createTrip(str("title"), start);
        const delta = nights(base.days[0].date, start);
        const sameDates =
          start === base.days[0].date && count === base.days.length;
        const days = sameDates
          ? base.days.map((d) =>
              str("city") === base.weatherLocation
                ? d
                : { ...d, weather: "", temperature: "" },
            )
          : makeDays(start, count);
        if (old && old.schedules.some((s) => s.day > count))
          throw new Error("縮短天數前，請先移除超出天數的行程。");
        const updated = {
          ...base,
          title: str("title"),
          days,
          weatherLocation: str("city"),
          currency: str("currency"),
          people: num("people"),
          budget: num("budget"),
          note: str("note"),
          stays: base.stays.map((s) => ({
            ...s,
            checkIn: addDays(s.checkIn, delta),
            checkOut: addDays(s.checkOut, delta),
          })),
        };
        const latest = current.current!;
        commit({
          ...latest,
          trips: old
            ? latest.trips.map((t) => (t.id === old.id ? updated : t))
            : [...latest.trips, updated],
          activeTripId: updated.id,
        });
        setDay(1);
      } else if (editor.kind === "schedule") {
        const item: Schedule = {
          id: editor.item?.id || newId(),
          day: num("day"),
          title: str("title"),
          startTime: str("startTime"),
          endTime: str("endTime"),
          location: str("location"),
          tag: str("tag"),
          cost: num("cost"),
          note: str("note"),
          image: photo,
          favorite: editor.item?.favorite || false,
          travelTimeToNext: str("transfer"),
        };
        change(trip.id, (t) => {
          const error = scheduleError(t.schedules, item);
          if (error) throw new Error(error);
          return {
            ...t,
            schedules: editor.item
              ? t.schedules.map((s) => (s.id === item.id ? item : s))
              : [...t.schedules, item],
          };
        });
        setDay(item.day);
      } else if (editor.kind === "stay") {
        const item: Stay = {
          id: editor.item?.id || newId(),
          name: str("title"),
          address: str("address"),
          checkIn: str("checkIn"),
          checkOut: str("checkOut"),
          cost: num("cost"),
          booked: data.has("booked"),
          note: str("note"),
        };
        change(trip.id, (t) => ({
          ...t,
          stays: editor.item
            ? t.stays.map((s) => (s.id === item.id ? item : s))
            : [...t.stays, item],
        }));
      } else {
        const item: Expense = {
          id: editor.item?.id || newId(),
          title: str("title"),
          category: str("tag"),
          amount: num("cost"),
        };
        change(trip.id, (t) => ({
          ...t,
          expenses: editor.item
            ? t.expenses.map((s) => (s.id === item.id ? item : s))
            : [...t.expenses, item],
        }));
      }
      closeEditor();
    } catch (error) {
      setFormError(message(error));
    }
  }
  const scheduleCard = (s: Schedule, index: number, favoriteView = false) => (
    <article
      className="schedule-card"
      key={s.id}
      draggable={!favoriteView && !busy}
      onDragStart={(e) => {
        if ((e.target as HTMLElement).closest("button,a,input")) {
          e.preventDefault();
          return;
        }
        dragId.current = s.id;
      }}
      onDragEnd={() => {
        dragId.current = null;
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (favoriteView || dragId.current === null || dragId.current === s.id)
          return;
        const ids = daily.map((x) => x.id),
          from = ids.indexOf(dragId.current),
          to = ids.indexOf(s.id);
        if (from < 0) return;
        ids.splice(to, 0, ids.splice(from, 1)[0]);
        dragId.current = null;
        safely(() =>
          change(trip.id, (t) => ({
            ...t,
            schedules: reorderDay(t.schedules, selected.day, ids),
          })),
        );
      }}
    >
      <div className="time-block">
        <strong>{s.startTime}</strong>
        <span>{s.endTime}</span>
        {favoriteView && <small>DAY {s.day}</small>}
      </div>
      <div className="activity">
        <div className="card-heading">
          <span className="tag">{s.tag}</span>
          <button
            className={`icon-button heart ${s.favorite ? "active" : ""}`}
            aria-label={s.favorite ? `取消收藏 ${s.title}` : `收藏 ${s.title}`}
            onClick={() =>
              safely(() =>
                change(trip.id, (t) => ({
                  ...t,
                  schedules: t.schedules.map((x) =>
                    x.id === s.id ? { ...x, favorite: !x.favorite } : x,
                  ),
                })),
              )
            }
          >
            {s.favorite ? "♥" : "♡"}
          </button>
        </div>
        <h3>{s.title}</h3>
        {s.location && <p className="location">⌖ {s.location}</p>}
        {s.image && (
          <Image
            className="activity-photo"
            src={s.image}
            alt={`${s.title}的旅行照片`}
            width={960}
            height={560}
            unoptimized
          />
        )}
        {s.note && <p className="note">{s.note}</p>}
        <div className="card-footer">
          <span className="cost">{s.cost ? money(s.cost) : "未填費用"}</span>
          <div className="actions">
            <a
              className="text-link"
              href={mapUrl(s.location || s.title)}
              target="_blank"
              rel="noreferrer"
            >
              地圖 ↗
            </a>
            <button
              className="text-button"
              onClick={() => openEditor({ kind: "schedule", item: s })}
            >
              編輯
            </button>
            {!favoriteView && (
              <>
                <button
                  className="icon-button"
                  aria-label={`向上移動 ${s.title}`}
                  disabled={index === 0 || !!busy}
                  onClick={() => move(s.id, -1)}
                >
                  ↑
                </button>
                <button
                  className="icon-button"
                  aria-label={`向下移動 ${s.title}`}
                  disabled={index === daily.length - 1 || !!busy}
                  onClick={() => move(s.id, 1)}
                >
                  ↓
                </button>
              </>
            )}
            <button
              className="text-button danger"
              onClick={() => removeSchedule(s)}
            >
              刪除
            </button>
          </div>
        </div>
        {s.travelTimeToNext && (
          <p className="transfer">
            ↓ 前往下一站約 {s.travelTimeToNext} 分鐘（自行估算）
          </p>
        )}
      </div>
    </article>
  );
  const routes: Schedule[][] = [];
  const step = trip.travelMode === "transit" ? 1 : 4;
  for (let i = 0; i < daily.length - 1; i += step)
    routes.push(daily.slice(i, i + step + 1));
  const sEdit = editor?.kind === "schedule" ? editor.item : undefined;
  const tEdit = editor?.kind === "trip" ? editor.item : undefined;
  const hEdit = editor?.kind === "stay" ? editor.item : undefined;
  const eEdit = editor?.kind === "expense" ? editor.item : undefined;
  const lastEnd = daily.at(-1)?.endTime || "09:00";
  const defaultStart = toMinutes(lastEnd) > 1379 ? "09:00" : lastEnd;

  return (
    <div className="app" data-theme={journal.isDarkMode ? "dark" : "light"}>
      <header className="topbar">
        <a href="#main" className="brand">
          <span className="brand-mark">旅</span>
          <span>
            旅行手記<small>TRAVEL JOURNAL</small>
          </span>
        </a>
        <div className="trip-controls">
          <label className="sr-only" htmlFor="trip-select">
            切換旅行
          </label>
          <select
            id="trip-select"
            value={trip.id}
            onChange={(e) =>
              safely(() => {
                stopRequest();
                commit({
                  ...current.current!,
                  activeTripId: Number(e.target.value),
                });
                setDay(1);
              })
            }
          >
            {journal.trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <button
            className="icon-button"
            aria-label="新增旅行"
            onClick={() => openEditor({ kind: "trip" })}
          >
            ＋
          </button>
          <button
            className="icon-button"
            aria-label={journal.isDarkMode ? "切換淺色模式" : "切換深色模式"}
            onClick={() =>
              safely(() =>
                commit({
                  ...current.current!,
                  isDarkMode: !journal.isDarkMode,
                }),
              )
            }
          >
            {journal.isDarkMode ? "☀" : "☾"}
          </button>
        </div>
      </header>
      <div className="shell">
        <aside className="sidebar">
          <span className="nav-caption">你的旅行空間</span>
          <nav aria-label="主要導覽">
            {(["行程", "地圖", "住宿", "預算", "收藏", "我的"] as Tab[]).map(
              (name, i) => (
                <button
                  key={name}
                  className={tab === name ? "nav-item selected" : "nav-item"}
                  aria-current={tab === name ? "page" : undefined}
                  onClick={() => setTab(name)}
                >
                  <span>{icons[i]}</span>
                  {name}
                </button>
              ),
            )}
          </nav>
          <div className="sidebar-tip">
            <span>✧</span>
            <p>
              把想去的地方，
              <br />
              慢慢變成回憶。
            </p>
            <small>
              資料儲存在目前瀏覽器
              <br />
              記得定期匯出備份
            </small>
          </div>
        </aside>
        <main id="main" className="main">
          <div className="save-status" role="status">
            <span
              className={
                saveState.startsWith("尚未") ? "status-dot error" : "status-dot"
              }
            />
            {saveState}
          </div>
          {conflict && (
            <div className="alert" role="alert">
              另一個分頁已更新資料，暫停寫入以避免覆蓋。
              <button
                onClick={() =>
                  download("travel-journal-unsaved.json", current.current)
                }
              >
                先匯出此頁備份
              </button>
              <button onClick={() => location.reload()}>重新載入</button>
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              <span>{notice}</span>
              <button
                aria-label="關閉通知"
                className="icon-button"
                onClick={() => setNotice("")}
              >
                ×
              </button>
            </div>
          )}
          <section className="hero">
            <div>
              <span className="eyebrow">LET’S MAKE MEMORIES</span>
              <h1>{trip.title}</h1>
              <p>
                {trip.days[0].date.replaceAll("-", ".")} —{" "}
                {trip.days.at(-1)!.date.replaceAll("-", ".")}
                <span className="separator"> / </span>
                {trip.days.length} 天・{trip.people} 人同行
              </p>
              <button
                className="hero-edit"
                onClick={() => openEditor({ kind: "trip", item: trip })}
              >
                編輯旅行資訊 ↗
              </button>
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="sun" />
              <div className="mountain back" />
              <div className="mountain front" />
              <span className="airplane">✈</span>
              <span className="art-label">YOUR NEXT CHAPTER</span>
            </div>
          </section>
          <div className="stats">
            <div>
              <span>旅行安排</span>
              <strong>
                {trip.schedules.length}
                <small> 個行程</small>
              </strong>
            </div>
            <div>
              <span>住宿計畫</span>
              <strong>
                {trip.stays.length}
                <small> 筆住宿</small>
              </strong>
            </div>
            <div>
              <span>已規劃費用</span>
              <strong>{money(summary.total)}</strong>
            </div>
            <div>
              <span>{summary.remaining < 0 ? "超出預算" : "剩餘預算"}</span>
              <strong className={summary.remaining < 0 ? "danger" : ""}>
                {money(Math.abs(summary.remaining))}
              </strong>
            </div>
          </div>
          {(tab === "行程" || tab === "地圖") && (
            <>
              <div className="days-row">
                <div className="days" role="group" aria-label="選擇日期">
                  {trip.days.map((d) => (
                    <button
                      key={d.day}
                      className={`day-chip ${selected.day === d.day ? "chosen" : ""}`}
                      aria-pressed={selected.day === d.day}
                      onClick={() => {
                        stopRequest();
                        setDay(d.day);
                      }}
                    >
                      <strong>DAY {String(d.day).padStart(2, "0")}</strong>
                      <span>{formatDate(d.date)}</span>
                      <small>
                        {d.weather || "○"} {d.temperature || "尚未查詢天氣"}
                      </small>
                    </button>
                  ))}
                </div>
                <button
                  className="add-day"
                  aria-label="增加一天"
                  onClick={() =>
                    safely(() => {
                      stopRequest();
                      change(trip.id, (t) => ({
                        ...t,
                        days: [
                          ...t.days,
                          {
                            day: t.days.length + 1,
                            date: addDays(t.days.at(-1)!.date, 1),
                            weather: "",
                            temperature: "",
                          },
                        ],
                      }));
                      setDay(trip.days.length + 1);
                    })
                  }
                >
                  ＋
                </button>
              </div>
              <div className="day-tools">
                <span>⌖ {trip.weatherLocation} · 台灣天氣</span>
                <button
                  className="text-button"
                  disabled={!!busy}
                  onClick={() => void weather()}
                >
                  更新預報
                </button>
                <a
                  href="https://open-meteo.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open-Meteo ↗
                </a>
                <button
                  className="text-button danger push-right"
                  disabled={trip.days.length === 1}
                  onClick={() => {
                    if (
                      !confirm(
                        `刪除第 ${selected.day} 天與當天 ${daily.length} 個行程？其他日期不變，天數會重新編號。`,
                      )
                    )
                      return;
                    safely(() => {
                      stopRequest();
                      change(trip.id, (t) => ({
                        ...t,
                        days: t.days
                          .filter((d) => d.day !== selected.day)
                          .map((d, i) => ({ ...d, day: i + 1 })),
                        schedules: t.schedules
                          .filter((s) => s.day !== selected.day)
                          .map((s) => ({
                            ...s,
                            day: s.day > selected.day ? s.day - 1 : s.day,
                          })),
                      }));
                      setDay(1);
                    });
                  }}
                >
                  刪除此日
                </button>
              </div>
            </>
          )}
          {busy && (
            <div className="notice" role="status">
              <span>{busy}</span>
              <button onClick={stopRequest}>取消</button>
            </div>
          )}
          {tab === "行程" && (
            <section>
              <div className="section-title">
                <div>
                  <span className="eyebrow">DAILY ITINERARY</span>
                  <h2>第 {selected.day} 天，出發吧</h2>
                  <p>安排喜歡的節奏，為偶遇留一點空白。</p>
                </div>
                <button className="primary" onClick={addSchedule}>
                  ＋ 新增行程
                </button>
              </div>
              {daily.length ? (
                <>
                  <p className="hint">
                    拖曳卡片或使用 ↑ ↓ 排序；保留活動時長，重新計算時間。
                  </p>
                  <div className="schedule-list">
                    {daily.map((s, i) => scheduleCard(s, i))}
                  </div>
                </>
              ) : (
                <Empty
                  title="今天的故事，還沒開始"
                  action={
                    <button className="primary" onClick={addSchedule}>
                      ＋ 加入第一個行程
                    </button>
                  }
                >
                  從一間想吃的餐廳，或一個想去的地方開始。
                </Empty>
              )}
            </section>
          )}
          {tab === "地圖" && (
            <section>
              <div className="section-title">
                <div>
                  <span className="eyebrow">EXPLORE THE WAY</span>
                  <h2>把每一站串起來</h2>
                  <p>依照當日行程，開啟 Google 地圖查看實際路線。</p>
                </div>
              </div>
              <div className="panel">
                <div className="actions">
                  <label>
                    交通方式{" "}
                    <select
                      aria-label="交通方式"
                      value={trip.travelMode}
                      onChange={(e) =>
                        safely(() =>
                          change(trip.id, (t) => ({
                            ...t,
                            travelMode: e.target.value,
                          })),
                        )
                      }
                    >
                      <option value="driving">開車</option>
                      <option value="walking">步行</option>
                      <option value="transit">大眾運輸</option>
                      <option value="bicycling">自行車</option>
                    </select>
                  </label>
                  <button
                    disabled={daily.length < 3 || daily.length > 12 || !!busy}
                    onClick={() => void optimize()}
                  >
                    依近距離建議排序
                  </button>
                </div>
                <p className="hint">
                  距離排序限台灣 3–12
                  站，以第一站為起點，不代表最快路線。填寫完整地址會更準確。
                </p>
                {daily.length ? (
                  <ol className="route-list">
                    {daily.map((s) => (
                      <li key={s.id}>
                        <span>{s.startTime}</span>
                        <a
                          href={mapUrl(s.location || s.title)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {s.title} ↗
                          <small>{s.location || "使用行程名稱搜尋"}</small>
                        </a>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <Empty title="先加入想去的地方">
                    新增當日行程後，就能查看路線。
                  </Empty>
                )}
                <div className="actions">
                  {routes.map((r, i) => (
                    <a
                      className="button primary"
                      key={i}
                      href={routeUrl(r, trip.travelMode)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      開啟{routes.length > 1 ? `第 ${i + 1} 段` : "當日"}路線 ↗
                    </a>
                  ))}
                </div>
                <p className="hint">
                  為相容手機，每段最多 5 站；大眾運輸以兩站分段。地點查詢：©{" "}
                  <a
                    href="https://www.openstreetmap.org/copyright"
                    target="_blank"
                    rel="noreferrer"
                  >
                    OpenStreetMap contributors
                  </a>
                  。
                </p>
              </div>
            </section>
          )}
          {tab === "住宿" && (
            <section>
              <div className="section-title">
                <div>
                  <span className="eyebrow">A PLACE TO REST</span>
                  <h2>旅行中的小小歸屬</h2>
                  <p>入住、退房與訂房狀態，都放在這裡。</p>
                </div>
                <button
                  className="primary"
                  onClick={() => openEditor({ kind: "stay" })}
                >
                  ＋ 新增住宿
                </button>
              </div>
              {trip.stays.length ? (
                <div className="stay-grid">
                  {trip.stays.map((s) => (
                    <article className="panel stay-card" key={s.id}>
                      <div className="card-heading">
                        <span className="stay-icon">⌂</span>
                        <span className={s.booked ? "tag booked" : "tag"}>
                          {s.booked ? "已訂房" : "待預訂"}
                        </span>
                      </div>
                      <h3>{s.name}</h3>
                      <p>
                        {s.checkIn} → {s.checkOut} ·{" "}
                        {nights(s.checkIn, s.checkOut)} 晚
                      </p>
                      <p>{s.address || "尚未填寫地址"}</p>
                      {s.note && <p className="note">{s.note}</p>}
                      <strong>
                        {money(s.cost)} <small>整筆住宿總額</small>
                      </strong>
                      <div className="actions">
                        <a
                          className="text-link"
                          href={mapUrl(s.address || s.name)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          地圖 ↗
                        </a>
                        <button
                          onClick={() => openEditor({ kind: "stay", item: s })}
                        >
                          編輯
                        </button>
                        <button
                          className="danger"
                          onClick={() => {
                            if (confirm(`刪除住宿「${s.name}」？`))
                              safely(() =>
                                change(trip.id, (t) => ({
                                  ...t,
                                  stays: t.stays.filter((x) => x.id !== s.id),
                                })),
                              );
                          }}
                        >
                          刪除
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty
                  title="下一站，住在哪裡？"
                  action={
                    <button onClick={() => openEditor({ kind: "stay" })}>
                      新增住宿
                    </button>
                  }
                >
                  記下喜歡的旅宿，讓每天都有舒服的終點。
                </Empty>
              )}
            </section>
          )}
          {tab === "預算" && (
            <section>
              <div className="section-title">
                <div>
                  <span className="eyebrow">SPEND WITH A PLAN</span>
                  <h2>讓預算也剛剛好</h2>
                  <p>
                    以 {trip.currency} 記帳，每人預估 {money(summary.perPerson)}
                    。
                  </p>
                </div>
                <button
                  className="primary"
                  onClick={() => openEditor({ kind: "expense" })}
                >
                  ＋ 其他費用
                </button>
              </div>
              <div className="panel">
                <div className="budget-heading">
                  <strong>{money(summary.total)}</strong>
                  <span>／總預算 {money(trip.budget)}</span>
                  <button
                    className="text-button"
                    onClick={() => openEditor({ kind: "trip", item: trip })}
                  >
                    調整預算
                  </button>
                </div>
                <div
                  className="budget-track"
                  role="meter"
                  aria-label="預算使用比例"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.min(
                    100,
                    trip.budget
                      ? (summary.total / trip.budget) * 100
                      : summary.total
                        ? 100
                        : 0,
                  )}
                >
                  <div
                    className={summary.remaining < 0 ? "over" : ""}
                    style={{
                      width: `${Math.min(100, trip.budget ? (summary.total / trip.budget) * 100 : summary.total ? 100 : 0)}%`,
                    }}
                  />
                </div>
                <div className="categories">
                  {Object.entries(summary.categories).map(([name, value]) => (
                    <div key={name}>
                      <span>{name}</span>
                      <strong>{money(value)}</strong>
                    </div>
                  ))}
                </div>
                <p className="hint">
                  包含行程費用＋住宿總額＋下方其他費用。住宿已在住宿頁記帳時，請勿在行程重複填寫。切換幣別不會自動換匯。
                </p>
              </div>
              <h3 className="subheading">其他費用</h3>
              {trip.expenses.length ? (
                <div className="panel">
                  {trip.expenses.map((e) => (
                    <div className="expense-row" key={e.id}>
                      <span className="tag">{e.category}</span>
                      <span>{e.title}</span>
                      <strong>{money(e.amount)}</strong>
                      <button
                        onClick={() => openEditor({ kind: "expense", item: e })}
                      >
                        編輯
                      </button>
                      <button
                        className="text-button danger"
                        onClick={() => {
                          if (confirm(`刪除費用「${e.title}」？`))
                            safely(() =>
                              change(trip.id, (t) => ({
                                ...t,
                                expenses: t.expenses.filter(
                                  (x) => x.id !== e.id,
                                ),
                              })),
                            );
                        }}
                      >
                        刪除
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty title="沒有額外費用">
                  車票、保險或伴手禮，可從「其他費用」加入。
                </Empty>
              )}
            </section>
          )}
          {tab === "收藏" && (
            <section>
              <div className="section-title">
                <div>
                  <span className="eyebrow">SAVED MOMENTS</span>
                  <h2>那些不想錯過的地方</h2>
                  <p>這趟旅行裡，按下愛心收藏的行程。</p>
                </div>
              </div>
              {trip.schedules.some((s) => s.favorite) ? (
                <div className="schedule-list">
                  {trip.schedules
                    .filter((s) => s.favorite)
                    .map((s, i) => scheduleCard(s, i, true))}
                </div>
              ) : (
                <Empty title="把喜歡的地方留下來">
                  在行程卡片按下 ♡，就能在這裡快速找到。
                </Empty>
              )}
            </section>
          )}
          {tab === "我的" && (
            <section>
              <div className="section-title">
                <div>
                  <span className="eyebrow">YOUR TRAVEL SPACE</span>
                  <h2>旅行資料與設定</h2>
                  <p>你的手記，由你保管。</p>
                </div>
              </div>
              <div className="settings-grid">
                <div className="panel">
                  <h3>備份與還原</h3>
                  <p>
                    按下儲存後，正常關閉瀏覽器或重新開機，下次用同一個瀏覽器、同一個網址打開，旅行資料仍會保留，並有本機備援。資料尚未同步到雲端；無痕模式、清除網站資料或更換瀏覽器不適用。
                  </p>
                  <div className="actions">
                    <button
                      className="primary"
                      onClick={() =>
                        download(
                          `travel-journal-${localDate()}.json`,
                          current.current,
                        )
                      }
                    >
                      匯出全部旅行
                    </button>
                    <button onClick={() => importInput.current?.click()}>
                      匯入備份
                    </button>
                    <button
                      onClick={() => safely(() => commit(current.current!))}
                    >
                      重新嘗試儲存
                    </button>
                    <button
                      onClick={async () => {
                        setPersistentStorage("正在確認資料保留設定…");
                        const granted = await requestPersistentStorage();
                        setPersistentStorage(
                          granted === true
                            ? "已開啟長期保留，降低瀏覽器自動清理資料的機會。"
                            : granted === false
                              ? "瀏覽器未批准額外保留。一般本機儲存仍可跨次開啟使用，建議定期匯出備份。"
                              : "此瀏覽器未提供額外保留設定；一般本機儲存仍會保留已保存資料。",
                        );
                      }}
                    >
                      加強資料保留
                    </button>
                  </div>
                  {persistentStorage && (
                    <p className="hint" role="status">
                      {persistentStorage}
                    </p>
                  )}
                  <p className="hint">
                    備份包含照片與備註，請妥善保管。匯入會取代全部旅行，先驗證再確認，不會在驗證失敗時清空資料。
                  </p>
                </div>
                <div className="panel">
                  <h3>這趟旅行</h3>
                  <p className="note">
                    {trip.note ||
                      "還沒有旅行備忘，記下訂位提醒或出發前要做的事吧。"}
                  </p>
                  <div className="actions">
                    <button
                      onClick={() => openEditor({ kind: "trip", item: trip })}
                    >
                      編輯旅行資訊
                    </button>
                    <button
                      className="danger"
                      disabled={journal.trips.length === 1}
                      onClick={() => {
                        if (
                          confirm(
                            `永久刪除「${trip.title}」及其全部行程、住宿、照片和費用？`,
                          )
                        )
                          safely(() => {
                            stopRequest();
                            const trips = current.current!.trips.filter(
                              (t) => t.id !== trip.id,
                            );
                            commit({
                              ...current.current!,
                              trips,
                              activeTripId: trips[0].id,
                            });
                            setDay(1);
                          });
                      }}
                    >
                      刪除這趟旅行
                    </button>
                  </div>
                  <p className="hint">至少保留一趟旅行。刪除前建議匯出備份。</p>
                </div>
              </div>
            </section>
          )}
          <footer>
            旅行不必完美，值得記得就好。
            <span>TRAVEL JOURNAL · MADE FOR YOUR JOURNEY</span>
          </footer>
        </main>
      </div>
      {importControl}
      {editor && (
        <Modal
          title={
            editor.kind === "trip"
              ? editor.item
                ? "編輯旅行"
                : "新的旅行"
              : editor.kind === "schedule"
                ? editor.item
                  ? "編輯行程"
                  : "新增行程"
                : editor.kind === "stay"
                  ? "住宿安排"
                  : "其他費用"
          }
          close={closeEditor}
        >
          <form onSubmit={saveForm}>
            <div className="form-grid">
              <Field label={editor.kind === "stay" ? "住宿名稱" : "名稱"} wide>
                <input
                  name="title"
                  required
                  maxLength={200}
                  autoFocus
                  defaultValue={
                    tEdit?.title ||
                    sEdit?.title ||
                    hEdit?.name ||
                    eEdit?.title ||
                    ""
                  }
                  placeholder={
                    editor.kind === "schedule"
                      ? "例如：在海邊喝一杯咖啡"
                      : "為這份計畫取個名字"
                  }
                />
              </Field>
              {editor.kind === "trip" && (
                <>
                  <Field label="出發日期">
                    <input
                      type="date"
                      name="start"
                      required
                      defaultValue={tEdit?.days[0].date || localDate()}
                    />
                  </Field>
                  <Field label="旅行天數">
                    <input
                      type="number"
                      name="count"
                      min={1}
                      max={90}
                      required
                      defaultValue={tEdit?.days.length || 3}
                    />
                  </Field>
                  <Field label="同行人數">
                    <input
                      name="people"
                      type="number"
                      min={1}
                      max={50}
                      required
                      defaultValue={tEdit?.people || 1}
                    />
                  </Field>
                  <Field label="台灣天氣城市">
                    <input
                      name="city"
                      maxLength={100}
                      required
                      defaultValue={tEdit?.weatherLocation || "新竹"}
                    />
                  </Field>
                  <Field label="記帳幣別">
                    <select
                      name="currency"
                      defaultValue={tEdit?.currency || "TWD"}
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="整趟旅行預算">
                    <input
                      type="number"
                      name="budget"
                      min={0}
                      max={1000000000}
                      step="0.01"
                      required
                      defaultValue={tEdit?.budget ?? 10000}
                    />
                  </Field>
                  <p className="hint wide">
                    更改日期或天數會重新連續排列旅行日期，並平移住宿日期；只修改其他資訊會保留原日期。縮短行程不可超出既有住宿範圍。幣別不會自動換算。
                  </p>
                </>
              )}
              {editor.kind === "schedule" && (
                <>
                  <Field label="所屬日期">
                    <select
                      name="day"
                      defaultValue={sEdit?.day || selected.day}
                    >
                      {trip.days.map((d) => (
                        <option key={d.day} value={d.day}>
                          第 {d.day} 天 · {d.date}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="類別">
                    <select name="tag" defaultValue={sEdit?.tag || "景點"}>
                      {TAGS.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="開始時間">
                    <input
                      type="time"
                      name="startTime"
                      required
                      defaultValue={sEdit?.startTime || defaultStart}
                    />
                  </Field>
                  <Field label="結束時間">
                    <input
                      type="time"
                      name="endTime"
                      required
                      defaultValue={
                        sEdit?.endTime || toTime(toMinutes(defaultStart) + 60)
                      }
                    />
                  </Field>
                  <Field label="地點／完整地址" wide>
                    <input
                      name="location"
                      maxLength={500}
                      defaultValue={sEdit?.location}
                      placeholder="可與名稱不同，用於地圖導航"
                    />
                  </Field>
                  <Field label={`預估費用（${trip.currency}）`}>
                    <input
                      name="cost"
                      type="number"
                      min={0}
                      max={1000000000}
                      step="0.01"
                      required
                      defaultValue={sEdit?.cost || 0}
                    />
                  </Field>
                  <Field label="前往下一站（分鐘）">
                    <input
                      name="transfer"
                      type="number"
                      min={0}
                      max={1440}
                      defaultValue={sEdit?.travelTimeToNext}
                      placeholder="選填，自行估算"
                    />
                  </Field>
                  <Field label="旅行照片（最大 12 MB，自動壓縮）" wide>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      disabled={photoBusy}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const version = photoVersion.current;
                        setPhotoBusy(true);
                        try {
                          const result = await compressPhoto(file);
                          if (version !== photoVersion.current) return;
                          setPhoto(result);
                          setFormError("");
                        } catch (error) {
                          if (version === photoVersion.current)
                            setFormError(message(error));
                        } finally {
                          if (version === photoVersion.current)
                            setPhotoBusy(false);
                        }
                      }}
                    />
                  </Field>
                  {photo && (
                    <div className="wide photo-preview">
                      <Image
                        src={photo}
                        alt="行程照片預覽"
                        width={400}
                        height={240}
                        unoptimized
                      />
                      <button type="button" onClick={() => setPhoto("")}>
                        移除照片
                      </button>
                    </div>
                  )}
                </>
              )}
              {editor.kind === "stay" && (
                <>
                  <Field label="入住日期">
                    <input
                      type="date"
                      name="checkIn"
                      min={trip.days[0].date}
                      max={trip.days.at(-1)!.date}
                      required
                      defaultValue={hEdit?.checkIn || selected.date}
                    />
                  </Field>
                  <Field label="退房日期">
                    <input
                      type="date"
                      name="checkOut"
                      min={addDays(trip.days[0].date, 1)}
                      max={addDays(trip.days.at(-1)!.date, 1)}
                      required
                      defaultValue={
                        hEdit?.checkOut || addDays(selected.date, 1)
                      }
                    />
                  </Field>
                  <Field label="地址" wide>
                    <input
                      name="address"
                      maxLength={500}
                      defaultValue={hEdit?.address}
                    />
                  </Field>
                  <Field
                    label={`整筆住宿總額（${trip.currency}，非每晚）`}
                    wide
                  >
                    <input
                      type="number"
                      name="cost"
                      min={0}
                      max={1000000000}
                      step="0.01"
                      required
                      defaultValue={hEdit?.cost || 0}
                    />
                  </Field>
                  <label className="checkbox wide">
                    <input
                      name="booked"
                      type="checkbox"
                      defaultChecked={hEdit?.booked}
                    />
                    已完成訂房
                  </label>
                </>
              )}
              {editor.kind === "expense" && (
                <>
                  <Field label="類別">
                    <select name="tag" defaultValue={eEdit?.category || "其他"}>
                      {TAGS.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={`金額（${trip.currency}）`}>
                    <input
                      type="number"
                      name="cost"
                      min={0}
                      max={1000000000}
                      step="0.01"
                      required
                      defaultValue={eEdit?.amount || 0}
                    />
                  </Field>
                </>
              )}
              {editor.kind !== "expense" && (
                <Field label="備註" wide>
                  <textarea
                    name="note"
                    rows={3}
                    maxLength={10000}
                    defaultValue={
                      tEdit?.note || sEdit?.note || hEdit?.note || ""
                    }
                    placeholder="訂位資訊、想吃的餐點，或一點小提醒…"
                  />
                </Field>
              )}
              {formError && (
                <p className="form-error wide" role="alert">
                  {formError}
                </p>
              )}
            </div>
            <div className="dialog-footer">
              <button type="button" onClick={closeEditor}>
                取消
              </button>
              <button type="submit" className="primary" disabled={photoBusy}>
                {photoBusy ? "處理照片中…" : "儲存"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
