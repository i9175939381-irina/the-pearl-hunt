/**
 * Модуль пользовательских настроек игры «Охота за жемчужинами».
 *
 * Живёт в `window.AppSettings`, чтобы не тянуть сборку модулей — файл подключается
 * обычным `<script src="settings.js">` до `game.js`. Сохранение — в `localStorage`.
 *
 * Архитектурная идея простая: один общий объект, к нему подписываются слушатели
 * (`onChange`), и при изменении любого ключа они получают уведомление. Это позволит
 * другим подсистемам (i18n, touch-управление, звук) реагировать сами, не ломая
 * существующую логику в `game.js`.
 */
(function (global) {
  "use strict";

  const STORAGE_KEY = "pearlHunt.settings.v1";

  /**
   * Значения по умолчанию. ВНИМАНИЕ: не удаляй поля просто так — старые значения
   * из localStorage могут ссылаться на них. Лучше добавляй новые и аккуратно
   * мигрируй при необходимости.
   */
  const DEFAULTS = {
    // Язык интерфейса: автоопределение при первом запуске (см. _detectLang).
    lang: null,
    // Громкость мастера (0..1). Управляется ползунком на обложке и в настройках.
    masterVolume: 0.55,
    // Управление (пригодится во 2-й фазе — touch).
    handedness: "right", // "right" | "left"
    uiScale: "normal", // "normal" | "large"
    // Отображение (пригодится в 3-й фазе).
    graphicsQuality: "high", // "high" | "eco"
    vibration: true,
    showRotateHint: true,
  };

  function _detectLang() {
    try {
      const raw =
        (global.navigator && (global.navigator.language || global.navigator.userLanguage)) || "";
      const code = String(raw).toLowerCase().split("-")[0];
      if (code === "ru" || code === "be" || code === "uk") return "ru";
      return "en";
    } catch (_err) {
      return "ru";
    }
  }

  function _load() {
    try {
      const raw = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_err) {
      return {};
    }
  }

  function _save(state) {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    } catch (_err) {
      // localStorage может быть недоступен (приватный режим) — молча игнорируем.
    }
  }

  /** @type {Set<(key: string, value: unknown, all: Record<string, unknown>) => void>} */
  const listeners = new Set();

  // Состояние — слияние дефолтов и сохранённого.
  const state = Object.assign({}, DEFAULTS, _load());
  if (!state.lang) state.lang = _detectLang();

  function get(key) {
    return state[key];
  }

  function getAll() {
    return Object.assign({}, state);
  }

  function set(key, value) {
    if (state[key] === value) return;
    state[key] = value;
    _save(state);
    listeners.forEach((fn) => {
      try {
        fn(key, value, state);
      } catch (err) {
        // Один кривой слушатель не должен ломать остальных.
        if (global.console && global.console.warn) {
          global.console.warn("[AppSettings] listener error:", err);
        }
      }
    });
  }

  function onChange(fn) {
    if (typeof fn !== "function") return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  global.AppSettings = {
    get,
    set,
    getAll,
    onChange,
    DEFAULTS,
  };
})(typeof window !== "undefined" ? window : globalThis);
