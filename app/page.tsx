"use client";


import { useEffect, useRef, useState } from "react";

export default function Home() {
  const [newStartTime, setNewStartTime] = useState("");
  const [newEndTime, setNewEndTime] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newImage, setNewImage] = useState("");
  const [newTag, setNewTag] = useState("景點");

  const [selectedDay, setSelectedDay] = useState(1);
  const [activeTab, setActiveTab] = useState("行程");
  const [travelMode, setTravelMode] = useState("driving");
  const [tripTitle, setTripTitle] = useState("台灣三日遊 🇹🇼");
  const [weatherLocation, setWeatherLocation] = useState("新竹");
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  //const [tripDate, setTripDate] = useState("07/13 - 07/17");

  const [days, setDays] = useState([
    { day: 1, date: "2026-05-21", weather: "", temperature: "" },
    { day: 2, date: "2026-05-22", weather: "", temperature: "" },
    { day: 3, date: "2026-05-23", weather: "", temperature: "" },
  ]);
  const formatDate = (dateString: string) => {
    return `${Number(dateString.slice(5, 7))}/${Number(dateString.slice(8, 10))}`;
  };

  const tripDate =
    days.length > 0
      ? `${formatDate(days[0].date)} - ${formatDate(days[days.length - 1].date)}`
      : "";

  const [schedules, setSchedules] = useState<
    {
      id: number;
      day: number;
      startTime: string;
      endTime: string;
      title: string;
      note: string;
      image: string;
      tag: string;
      travelTimeToNext: string;
    }[]
  >([]);

  useEffect(() => {
    setTimeout(() => {
      const savedDays = localStorage.getItem("days");
      const savedSchedules = localStorage.getItem("schedules");
      const savedTripTitle = localStorage.getItem("tripTitle");
      const savedDarkMode = localStorage.getItem("isDarkMode");

      if (savedDays) {
        setDays(JSON.parse(savedDays));
      }

      if (savedSchedules) {
        setSchedules(JSON.parse(savedSchedules));
      }

      if (savedTripTitle) {
        setTripTitle(savedTripTitle);
      }

      if (savedDarkMode) {
        setIsDarkMode(JSON.parse(savedDarkMode));
      }

      setIsLoaded(true);
    }, 0);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;

    localStorage.setItem("days", JSON.stringify(days));
  }, [days, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;

    localStorage.setItem("schedules", JSON.stringify(schedules));
  }, [schedules, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;

    localStorage.setItem("tripTitle", tripTitle);
  }, [tripTitle, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;

    localStorage.setItem("isDarkMode", JSON.stringify(isDarkMode));
  }, [isDarkMode, isLoaded]);
  
  useEffect(() => {
    const currentDay = dayRefs.current[selectedDay - 1];

    if (currentDay) {
      currentDay.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }
  }, [selectedDay]);

  useEffect(() => {
    setTimeout(() => {
      const currentDaySchedules = schedules
        .filter((item) => item.day === selectedDay)
        .sort((a, b) => a.endTime.localeCompare(b.endTime));

      const lastSchedule = currentDaySchedules[currentDaySchedules.length - 1];

      if (lastSchedule) {
        setNewStartTime(lastSchedule.endTime);

        const [hour, minute] = lastSchedule.endTime.split(":").map(Number);

        const endDate = new Date();
        endDate.setHours(hour + 1);
        endDate.setMinutes(minute);

        const endHour = String(endDate.getHours()).padStart(2, "0");
        const endMinute = String(endDate.getMinutes()).padStart(2, "0");

        setNewEndTime(`${endHour}:${endMinute}`);
      } else {
        setNewStartTime("08:00");
        setNewEndTime("09:00");
      }
    }, 0);
  }, [selectedDay, schedules]);




  const [isLoadingWeather, setIsLoadingWeather] = useState(false);
  const dayRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dateInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const timelineEndRef = useRef<HTMLDivElement | null>(null);
  const [draggingScheduleId, setDraggingScheduleId] = useState<number | null>(null);
  const [openScheduleIds, setOpenScheduleIds] = useState<number[]>([]);

  function toggleScheduleOpen(id: number) {
    setOpenScheduleIds((prev) =>
      prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [...prev, id]
    );
  }



  function isTimeOverlapping(
    day: number,
    startTime: string,
    endTime: string,
    excludeId?: number
  ) {
    return schedules.some((item) => {
      if (item.day !== day) return false;
      if (excludeId && item.id === excludeId) return false;

      return startTime < item.endTime && endTime > item.startTime;
    });
  }
  function addSchedule() {
    if (!newStartTime || !newEndTime || !newTitle) {
      alert("請輸入開始時間、結束時間與行程名稱");
      return;
    }

    if (newEndTime <= newStartTime) {
      alert("結束時間一定要晚於開始時間");
      return;
    }

    if (isTimeOverlapping(selectedDay, newStartTime, newEndTime)) {
      alert("這個時間跟其他行程重疊了");
      return;
    }

    setSchedules([
      ...schedules,
      {
        id: Date.now(),
        day: selectedDay,
        startTime: newStartTime,
        endTime: newEndTime,
        title: newTitle,
        note: newNote,
        image: newImage,
        tag: newTag,
        travelTimeToNext: "",
      },
    ]);

    setNewStartTime(newEndTime);
    setNewEndTime("");
    setNewTitle("");
    setNewNote("");
    setNewImage("");
    setNewTag("景點");
    setTimeout(() => {
      timelineEndRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    }, 100);    
  }

  function deleteSchedule(id: number) {
    setSchedules(schedules.filter((item) => item.id !== id));
  }

  function getWeatherIcon(code: number) {
    if (code === 0) return "☀️";
    if ([1, 2, 3].includes(code)) return "⛅";
    if ([45, 48].includes(code)) return "🌫️";
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "🌧️";
    if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄️";
    if ([95, 96, 99].includes(code)) return "⛈️";
    return "☁️";
  }

  async function fetchTaiwanWeather(targetDays = days) {
    if (!weatherLocation.trim()) {
      alert("請先輸入台灣地區名稱");
      return;
    }

    setIsLoadingWeather(true);

    try {
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          weatherLocation
        )}&count=5&language=zh&format=json&countryCode=TW`
      );

      const geoData = await geoRes.json();
      const location = geoData.results?.find(
        (item: { country_code?: string }) => item.country_code === "TW"
      ) || geoData.results?.[0];

      if (!location) {
        alert("找不到這個台灣地區，請改輸入英文，例如 Hsinchu、Taipei、Taichung、Kaohsiung");
        return;
      }

      const today = new Date();

      const weatherRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&daily=weather_code,temperature_2m_max&forecast_days=16&timezone=Asia%2FTaipei`
      );

      const weatherData = await weatherRes.json();

      setDays(
        targetDays.map((day) => {
          const targetDate = new Date(day.date);

          const diffDays = Math.floor(
            (targetDate.getTime() - today.getTime()) /
            (1000 * 60 * 60 * 24)
          );

          const weatherIndex = weatherData.daily.time.findIndex(
            (date: string) => date === day.date
          );

          if (diffDays > 15 || weatherIndex === -1) {
            return {
              ...day,
              weather: "🕒",
              temperature: "尚無預報",
            };
          }

          return {
            ...day,
            weather: getWeatherIcon(weatherData.daily.weather_code[weatherIndex]),
            temperature: `${Math.round(
              weatherData.daily.temperature_2m_max[weatherIndex]
            )}°`,
          };
        })
      );
    } catch (error) {
      alert("天氣抓取失敗，請稍後再試");
    } finally {
      setIsLoadingWeather(false);
    }
  }

  async function optimizeTodayRoute() {
    const daySchedules = schedules.filter(
      (item) => item.day === selectedDay
    );

    if (daySchedules.length < 3) {
      alert("至少需要三個行程才能最佳化");
      return;
    }

    try {
      const locations = await Promise.all(
        daySchedules.map(async (item) => {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=tw&q=${encodeURIComponent(
              item.title
            )}`
          );

          const data = await response.json();

          if (!data[0]) {
            throw new Error(`${item.title} 找不到位置`);
          }

          return {
            ...item,
            lat: Number(data[0].lat),
            lon: Number(data[0].lon),
          };
        })
      );

      const sortedByTime = [...daySchedules].sort((a, b) =>
        a.startTime.localeCompare(b.startTime)
      );

      const route = [locations[0]];
      const remaining = locations.slice(1);

      while (remaining.length > 0) {
        const current = route[route.length - 1];

        let nearestIndex = 0;
        let nearestDistance = Infinity;

        remaining.forEach((place, index) => {
          const distance =
            Math.pow(current.lat - place.lat, 2) +
            Math.pow(current.lon - place.lon, 2);

          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = index;
          }
        });

        route.push(remaining[nearestIndex]);
        remaining.splice(nearestIndex, 1);
      }

      const updatedDaySchedules = route.map((item, index) => ({
        ...item,
        startTime: sortedByTime[index].startTime,
        endTime: sortedByTime[index].endTime,
      }));

      const updatedSchedules = schedules.map((schedule) => {
        const matched = updatedDaySchedules.find(
          (item) => item.id === schedule.id
        );

        return matched || schedule;
      });

      setSchedules(updatedSchedules);
      alert("已完成最佳路線排序 😎");
    } catch (error) {
      alert("最佳化失敗，請確認行程名稱是台灣可搜尋的地點");
    }
  }

  function openTodayRoute() {
    const daySchedules = schedules
      .filter((item) => item.day === selectedDay)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    if (daySchedules.length < 2) {
      alert("至少要有兩個行程才能產生路線");
      return;
    }

    const origin = daySchedules[0].title;
    const destination = daySchedules[daySchedules.length - 1].title;
    const waypoints = daySchedules
      .slice(1, -1)
      .map((item) => item.title)
      .join("|");

    const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
      origin
    )}&destination=${encodeURIComponent(destination)}${
      waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ""
    }&travelmode=${travelMode}`;

    window.open(url, "_blank");
  }

  function swapScheduleTime(dragId: number, dropId: number) {
    if (dragId === dropId) return;

    const dragItem = schedules.find((item) => item.id === dragId);
    const dropItem = schedules.find((item) => item.id === dropId);

    if (!dragItem || !dropItem) return;

    const updatedSchedules = schedules.map((item) => {
      if (item.id === dragItem.id) {
        return {
          ...item,
          startTime: dropItem.startTime,
          endTime: dropItem.endTime,
        };
      }

      if (item.id === dropItem.id) {
        return {
          ...item,
          startTime: dragItem.startTime,
          endTime: dragItem.endTime,
        };
      }

      return item;
    });

    setSchedules(updatedSchedules);
    setDraggingScheduleId(null);
  }

  function addDays(dateString: string, daysToAdd: number) {
    const date = new Date(dateString);
    date.setDate(date.getDate() + daysToAdd);
    return date.toISOString().split("T")[0];
  }

  function addDay() {
    const nextDay = days.length + 1;
    const firstDate = days[0].date;

    const updatedDays = [
      ...days,
      {
        day: nextDay,
        date: addDays(firstDate, days.length),
        weather: "",
        temperature: "",
      },
    ];

    setDays(updatedDays);
    setSelectedDay(nextDay);

    fetchTaiwanWeather(updatedDays);
  }
  function deleteDay(dayNumber: number) {
    const remainingDays = days.filter((day) => day.day !== dayNumber);
    const firstDate = remainingDays[0]?.date || days[0].date;

    const updatedDays = remainingDays.map((day, index) => ({
      ...day,
      day: index + 1,
      date: addDays(firstDate, index),
    }));

    const updatedSchedules = schedules
      .filter((item) => item.day !== dayNumber)
      .map((item) => {
        if (item.day > dayNumber) {
          return {
            ...item,
            day: item.day - 1,
          };
        }

        return item;
      });

    setDays(updatedDays);
    setSchedules(updatedSchedules);

    if (selectedDay > updatedDays.length) {
      setSelectedDay(updatedDays.length);
    } else {
      setSelectedDay(selectedDay);
    }
  }
  return (
    <main className={`min-h-screen p-4 pb-28 ${isDarkMode ? "bg-gray-950" : "bg-[#f5f7fb]"}`}>
      {/* Header */}
      <div className={`relative rounded-3xl p-5 shadow-sm ${isDarkMode ? "bg-gray-900" : "bg-white"}`}>
        <input
          value={tripTitle}
          onChange={(e) => setTripTitle(e.target.value)}
          className={`text-2xl font-bold bg-transparent outline-none w-full ${isDarkMode ? "text-white" : "text-black"}`}
        />

        <div className={`mt-1 flex items-center gap-2 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
          <span>{tripDate}</span>

          <span className="text-gray-300">|</span>

          <span className="text-blue-500 font-medium">
            {weatherLocation} 天氣
          </span>
        </div>

        <div className="flex gap-2 mt-4">
          <input
            value={weatherLocation}
            onChange={(e) => setWeatherLocation(e.target.value)}
            placeholder="輸入台灣地區，例如 新竹"
            className={`flex-1 p-3 rounded-2xl border ${isDarkMode ? "bg-gray-800 text-white border-gray-700" : "text-black"}`}
          />

          <button
            onClick={() => fetchTaiwanWeather()}
            disabled={isLoadingWeather}
            className="bg-blue-500 text-white px-4 rounded-2xl font-bold"
          >
            {isLoadingWeather ? "抓取中" : "抓天氣"}
          </button>
        </div>

        <div className="absolute top-4 right-4">
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`px-4 py-2 rounded-full text-sm font-bold shadow-sm ${
              isDarkMode
                ? "bg-white text-black"
                : "bg-black text-white"
            }`}
          >
            {isDarkMode ? "☀️ 淺色" : "🌙 深色"}
          </button>
        </div>

        {/* Day Tabs */}
        <div className="flex gap-3 mt-5 overflow-x-auto overflow-y-visible pb-3">
          {days.map((item) => (
            <div
              className="relative"
              key={item.day}
              ref={(el) => {
                dayRefs.current[item.day - 1] = el;
              }}
            >
              <div
                onClick={() => setSelectedDay(item.day)}
                className={`px-4 py-3 rounded-3xl min-w-[100px] shrink-0 cursor-pointer transition-all ${
                  selectedDay === item.day
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 text-black"
                }`}
              >
                <div className="relative w-full h-[86px]">
                  <div className="absolute top-0 left-0 font-bold text-xs">
                    Day {item.day}
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      dateInputRefs.current[item.day - 1]?.showPicker();
                    }}
                    className="absolute top-[28px] left-1/2 -translate-x-1/2 text-lg font-bold cursor-pointer"
                  >
                    {`${Number(item.date.slice(5, 7))}/${Number(item.date.slice(8, 10))}`}
                  </button>

                  <div className="absolute top-[58px] left-1/2 -translate-x-1/2 flex items-center gap-1">
                    <span className="text-lg">
                      {item.weather || "☀️"}
                    </span>

                    <span className="text-sm font-medium">
                      {item.temperature || "--"}
                    </span>
                  </div>
                </div>
                <input
                  ref={(el) => {
                    dateInputRefs.current[item.day - 1] = el;
                  }}
                  type="date"
                  value={item.date}
                  onChange={(e) => {
                    if (!e.target.value) return;

                    const updatedDays = days.map((day) => {
                      const date = new Date(e.target.value);
                      date.setDate(date.getDate() + (day.day - item.day));

                      return {
                        ...day,
                        date: date.toISOString().split("T")[0],
                      };
                    });

                    setDays(updatedDays);
                    fetchTaiwanWeather(updatedDays);
                  }}
                  className="absolute opacity-0 pointer-events-none"
                />
              </div>

              {days.length > 1 && (
                <button
                  onClick={() => deleteDay(item.day)}
                  className="absolute top-1 right-1 bg-red-400 text-white w-5 h-5 rounded-full text-xs"
                >
                  ×
                </button>
              )}
            </div>
          ))}

          <button
            onClick={addDay}
            className="px-5 py-3 rounded-2xl min-w-[90px] bg-black text-white"
          >
            ＋ Day
          </button>
        </div>
      </div>

  {activeTab === "行程" && (
    <>
      {/* Add Schedule Form */}
      <div className="bg-white rounded-3xl p-5 shadow-sm mt-6">
        <h2 className="text-lg font-bold text-black mb-4">
          新增 Day {selectedDay} 行程
        </h2>

        <div className="flex gap-1 mb-3">
          <div className="w-[160px]">
            <p className="text-sm text-gray-400 mb-2">
              開始時間
            </p>

            <input
              type="time"
              value={newStartTime}
              onChange={(e) => setNewStartTime(e.target.value)}
              className="flex-1 p-3 rounded-2xl border text-black"
            />
          </div>

          <div className="w-[160px]">
            <p className="text-sm text-gray-400 mb-2">
              結束時間
            </p>

            <input
              type="time"
              value={newEndTime}
              onChange={(e) => setNewEndTime(e.target.value)}
              className="flex-1 p-3 rounded-2xl border text-black"
            />
          </div>
        </div>

        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="行程名稱，例如 大阪城 🏯"
          className="w-full p-3 rounded-2xl border mb-3 text-black"
        />

        <select
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          className="w-full p-3 rounded-2xl border mb-3 text-black"
        >
          <option value="景點">🏯 景點</option>
          <option value="美食">🍖 美食</option>
          <option value="交通">🚆 交通</option>
          <option value="飯店">🏨 飯店</option>
          <option value="購物">🛍️ 購物</option>
          <option value="其他">📍 其他</option>
        </select>

        <input
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="備註，例如 門票 ¥600"
          className="w-full p-3 rounded-2xl border mb-3 text-black"
        />
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];

            if (file) {
              const reader = new FileReader();

              reader.onloadend = () => {
                setNewImage(reader.result as string);
              };

              reader.readAsDataURL(file);
            }
          }}
          className="w-full p-3 rounded-2xl border mb-4 text-black"
        />

        <button
          onClick={addSchedule}
          className="w-full bg-blue-500 text-white py-3 rounded-2xl font-bold"
        >
          ＋ 新增行程
        </button>
      </div>

      {/* Timeline */}
      <div className="mt-8 relative border-l-4 border-blue-400 ml-5 pl-8 space-y-8">

        {schedules.filter((item) => item.day === selectedDay).length === 0 && (
          <div className="bg-white rounded-3xl p-5 text-gray-400 text-center">
            這一天還沒有行程
          </div>
        )}

        {schedules
          .filter((item) => item.day === selectedDay)
          .sort((a, b) =>
            a.startTime.localeCompare(b.startTime)
          )
          .map((item, index, daySchedules) => (
            <div
              className={`relative cursor-grab active:cursor-grabbing ${
                draggingScheduleId === item.id ? "opacity-50" : ""
              }`}
              key={item.id}
              draggable
              onDragStart={() => setDraggingScheduleId(item.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (draggingScheduleId !== null) {
                  swapScheduleTime(draggingScheduleId, item.id);
                }
              }}
              onDragEnd={() => setDraggingScheduleId(null)}
            >
              <select
                value={item.tag || "景點"}
                onChange={(e) => {
                  setSchedules(
                    schedules.map((schedule) =>
                      schedule.id === item.id
                        ? { ...schedule, tag: e.target.value }
                        : schedule
                    )
                  );
                }}
                className="absolute -left-[52px] top-1/2 -translate-y-1/2 text-3xl bg-transparent outline-none cursor-pointer appearance-none w-[40px] text-center"
              >
                <option value="景點">🏯</option>
                <option value="美食">🍖</option>
                <option value="交通">🚆</option>
                <option value="飯店">🏨</option>
                <option value="購物">🛍️</option>
                <option value="其他">📍</option>
              </select>

              <div className="bg-white rounded-3xl p-5 shadow-sm">
                <div
                  onClick={() => toggleScheduleOpen(item.id)}
                  className="w-full text-left flex justify-between items-center mb-3"
                >
                  <div className="flex items-center gap-2">
                    <input
                      value={item.title}
                      onChange={(e) => {
                        setSchedules(
                          schedules.map((schedule) =>
                            schedule.id === item.id
                              ? { ...schedule, title: e.target.value }
                              : schedule
                          )
                        );
                      }}
                      className="text-xl font-bold text-black bg-transparent outline-none min-w-[80px]"
                    />

                    {!openScheduleIds.includes(item.id) && (
                      <span className="text-sm text-gray-400 whitespace-nowrap">
                        {item.startTime} - {item.endTime}
                      </span>
                    )}

                    <span className="text-xs bg-blue-100 text-blue-500 px-2 py-1 rounded-full whitespace-nowrap">
                      {item.tag || "景點"}
                    </span>
                  </div>

                  <span className="text-gray-400">
                    {openScheduleIds.includes(item.id) ? "▲" : "▼"}
                  </span>
                </div>

                {openScheduleIds.includes(item.id) && (
                  <>
                  <div className="flex gap-2 items-center text-sm text-gray-400 flex-wrap">
                  <input
                    type="time"
                    value={item.startTime}
                    onChange={(e) => {
                      if (e.target.value >= item.endTime) {
                        alert("開始時間一定要早於結束時間");
                        return;
                      }

                      if (isTimeOverlapping(item.day, e.target.value, item.endTime, item.id)) {
                        alert("這個時間跟其他行程重疊了");
                        return;
                      }                     
                      const updatedSchedules = schedules.map((schedule) =>
                        schedule.id === item.id
                          ? { ...schedule, startTime: e.target.value }
                          : schedule
                      );

                      updatedSchedules.sort((a, b) =>
                        a.startTime.localeCompare(b.startTime)
                      );

                      setSchedules(updatedSchedules);
                    }}
                    className="bg-transparent outline-none"
                  />

                  <span>-</span>

                  <input
                    type="time"
                    value={item.endTime}
                    onChange={(e) => {
                      if (e.target.value <= item.startTime) {
                        alert("結束時間一定要晚於開始時間");
                        return;
                      }

                      if (isTimeOverlapping(item.day, item.startTime, e.target.value, item.id)) {
                        alert("這個時間跟其他行程重疊了");
                        return;
                      }

                      const updatedSchedules = schedules.map((schedule) =>
                        schedule.id === item.id
                          ? { ...schedule, endTime: e.target.value }
                          : schedule
                      );

                      updatedSchedules.sort((a, b) =>
                        a.startTime.localeCompare(b.startTime)
                      );

                      setSchedules(updatedSchedules);
                    }}
                    className="bg-transparent outline-none"
                  />
                  <span className="text-blue-500 text-xs">
                    {(() => {
                      const [startHour, startMinute] = item.startTime.split(":").map(Number);
                      const [endHour, endMinute] = item.endTime.split(":").map(Number);

                      const start = startHour * 60 + startMinute;
                      const end = endHour * 60 + endMinute;

                      const diff = end - start;

                      if (diff <= 0) {
                        return "時間錯誤";
                      }

                      const hours = Math.floor(diff / 60);
                      const minutes = diff % 60;

                      return `${hours} 小時 ${minutes} 分`;
                    })()}
                  </span>
                </div>



                <input
                  value={item.note}
                  onChange={(e) => {
                    setSchedules(
                      schedules.map((schedule) =>
                        schedule.id === item.id
                          ? { ...schedule, note: e.target.value }
                          : schedule
                      )
                    );
                  }}
                  placeholder="備註"
                  className="text-gray-500 mt-3 bg-transparent outline-none w-full"
                />

                <div className="flex gap-3 mt-5">
                  <button
                    onClick={() => {
                      window.open(
                        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          item.title
                        )}`,
                        "_blank"
                      );
                    }}
                    className="bg-black text-white px-4 py-2 rounded-full"
                  >
                    Google Maps
                  </button>

                  <button
                    onClick={() => {
                      const daySchedules = schedules
                        .filter((schedule) => schedule.day === selectedDay)
                        .sort((a, b) =>
                          a.startTime.localeCompare(b.startTime)
                        );

                      const currentIndex = daySchedules.findIndex(
                        (schedule) => schedule.id === item.id
                      );

                      if (currentIndex <= 0) return;

                      const currentItem = daySchedules[currentIndex];
                      const previousItem = daySchedules[currentIndex - 1];

                      const updatedSchedules = schedules.map((schedule) => {
                        if (schedule.id === currentItem.id) {
                          return {
                            ...schedule,
                            startTime: previousItem.startTime,
                            endTime: previousItem.endTime,
                          };
                        }

                        if (schedule.id === previousItem.id) {
                          return {
                            ...schedule,
                            startTime: currentItem.startTime,
                            endTime: currentItem.endTime,
                          };
                        }

                        return schedule;
                      });

                      setSchedules(updatedSchedules);
                    }}
                    className="bg-gray-100 text-black px-4 py-2 rounded-full"
                  >
                    ↑
                  </button>

                  <button
                    onClick={() => {
                      const daySchedules = schedules
                        .filter((schedule) => schedule.day === selectedDay)
                        .sort((a, b) =>
                          a.startTime.localeCompare(b.startTime)
                        );

                      const currentIndex = daySchedules.findIndex(
                        (schedule) => schedule.id === item.id
                      );

                      if (currentIndex >= daySchedules.length - 1) return;

                      const currentItem = daySchedules[currentIndex];
                      const nextItem = daySchedules[currentIndex + 1];

                      const updatedSchedules = schedules.map((schedule) => {
                        if (schedule.id === currentItem.id) {
                          return {
                            ...schedule,
                            startTime: nextItem.startTime,
                            endTime: nextItem.endTime,
                          };
                        }

                        if (schedule.id === nextItem.id) {
                          return {
                            ...schedule,
                            startTime: currentItem.startTime,
                            endTime: currentItem.endTime,
                          };
                        }

                        return schedule;
                      });

                      setSchedules(updatedSchedules);
                    }}
                    className="bg-gray-100 text-black px-4 py-2 rounded-full"
                  >
                    ↓
                  </button>

                  <button
                    onClick={() => deleteSchedule(item.id)}
                    className="bg-red-100 text-red-500 px-4 py-2 rounded-full"
                  >
                    刪除
                  </button>
                </div>

                {item.image && (
                  <img
                    src={item.image}
                    alt={item.title}
                    className="w-full h-48 object-cover rounded-2xl mt-5"
                  />
                )}

                {index < daySchedules.length - 1 && (
                  <div className="mt-5 bg-blue-50 rounded-2xl p-3">
                    <div className="text-sm text-blue-500 font-bold mb-2">
                      到下一站移動時間
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        value={item.travelTimeToNext || ""}
                        onChange={(e) => {
                          setSchedules(
                            schedules.map((schedule) =>
                              schedule.id === item.id
                                ? { ...schedule, travelTimeToNext: e.target.value }
                                : schedule
                            )
                          );
                        }}
                        placeholder="例如 18"
                        className="w-[90px] p-2 rounded-xl border text-black"
                      />

                      <span className="text-gray-500 text-sm">分鐘</span>
                    </div>
                  </div>
                )}

                    </>
                  )}
                </div>

                                {index < daySchedules.length - 1 && (
                                  <div className="text-center text-sm text-blue-500 font-bold">
                                    ↓ 移動 {item.travelTimeToNext || "?"} 分鐘
                                  </div>
                                )}
                            </div>
                          ))}
                      <div ref={timelineEndRef}></div>
      </div>

        </>
      )}

      {activeTab === "地圖" && (
        <div className="bg-white rounded-3xl p-5 shadow-sm mt-6">
          <h2 className="text-lg font-bold text-black mb-4">
            Day {selectedDay} 地圖清單
          </h2>

          <div className="flex gap-3 mb-5">
            <select
              value={travelMode}
              onChange={(e) => setTravelMode(e.target.value)}
              className="w-[180px] p-2 rounded-xl border text-black text-sm"
            >
              <option value="driving">🚗 開車</option>
              <option value="walking">🚶 走路</option>
              <option value="transit">🚆 大眾運輸</option>
              <option value="bicycling">🚲 腳踏車</option>
            </select>

            <div className="flex gap-3">
              <button
                onClick={openTodayRoute}
                className="w-[180px] bg-blue-500 text-white py-2 rounded-xl font-bold text-sm"
              >
                開啟今日路線
              </button>

              <button
                onClick={optimizeTodayRoute}
                className="w-[180px] bg-green-500 text-white py-2 rounded-xl font-bold text-sm"
              >
                最佳化路線
              </button>
            </div>
          </div>

          {schedules.filter((item) => item.day === selectedDay).length === 0 && (
            <div className="text-gray-400 text-center py-8">
              這一天還沒有行程
            </div>
          )}

          <div className="space-y-4">
            {schedules
              .filter((item) => item.day === selectedDay)
              .sort((a, b) => a.startTime.localeCompare(b.startTime))
              .map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between border rounded-2xl p-4"
                >
                  <div>
                    <div className="font-bold text-black">
                      {item.tag === "景點" && "🏯 "}
                      {item.tag === "美食" && "🍖 "}
                      {item.tag === "交通" && "🚆 "}
                      {item.tag === "飯店" && "🏨 "}
                      {item.tag === "購物" && "🛍️ "}
                      {item.tag === "其他" && "📍 "}
                      {item.title}
                    </div>

                    <div className="text-sm text-gray-400 mt-1">
                      {item.startTime} - {item.endTime}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      window.open(
                        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          item.title
                        )}`,
                        "_blank"
                      );
                    }}
                    className="bg-black text-white px-4 py-2 rounded-full text-sm"
                  >
                    地圖
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 flex justify-around">
        <button
          onClick={() => setActiveTab("行程")}
          className={activeTab === "行程" ? "text-blue-500 font-bold" : "text-gray-400"}
        >
          行程
        </button>

        <button
          onClick={() => setActiveTab("地圖")}
          className={activeTab === "地圖" ? "text-blue-500 font-bold" : "text-gray-400"}
        >
          地圖
        </button>

        <button className="text-gray-400">收藏</button>
        <button className="text-gray-400">我的</button>
      </div>
    </main>
  );
}