/**
 * Система переводов для игры «Охота за жемчужинами».
 *
 * Живёт в `window.i18n` и подключается до `game.js`. Работает вместе с
 * `AppSettings` (`settings.js`) — язык пользователя хранится в настройках.
 *
 * Основные функции:
 *   t(key, params?)       — вернуть перевод по ключу с подстановкой {param}.
 *   setLang(code)         — сменить язык (ru / en), уведомить слушателей,
 *                           перерисовать все элементы с `data-i18n`.
 *   getLang()             — текущий код языка.
 *   onChange(fn)          — подписка на смену языка (fn(code)).
 *   applyToDom(root?)     — вручную пробежаться по DOM и обновить тексты.
 *
 * Чтобы автоматически перевелось — поставь на элемент `data-i18n="ключ"`.
 * Для атрибутов: `data-i18n-attr="placeholder:ключ,aria-label:другой.ключ"`.
 */
(function (global) {
  "use strict";

  // ─────────────────────────────────────────────────────────────
  // Словарь переводов. Правая колонка — английский перевод,
  // аккуратно подобранный к тональности русского оригинала.
  // ─────────────────────────────────────────────────────────────

  const DICT = {
    ru: {
      // Обложка
      "meta.title": "Охота за жемчужинами",
      "meta.canvas": "Игровое поле",
      "start.title": "Охота за жемчужинами",
      "start.rules.1":
        "Погрузись в океан и собирай жемчужины, следи за запасом воздуха — лови пузырьки, они продлевают дыхание.",
      "start.rules.2.before": "Собери ",
      "start.rules.2.bold": "10 жемчужин",
      "start.rules.2.middle": " — и отправишься на поиски легендарной ",
      "start.rules.2.accent": "Чёрной жемчужины",
      "start.rules.2.after": ".",
      "start.keys.move": "WASD / стрелки — движение",
      "start.keys.boost": "Пробел — ускорение",
      "start.keys.pause": "Esc — пауза",
      "start.keys.mobile.move": "Джойстик — движение",
      "start.keys.mobile.boost": "Жемчужина — ускорение",
      "start.keys.mobile.pause": "▐▐ — пауза",
      "start.button": "Погрузиться",
      "start.volume": "Звук океана",
      "start.volume.aria": "Громкость",
      "start.settings": "Настройки",

      // Панель настроек
      "settings.title": "Настрой игру под себя",
      "settings.section.sound": "Звук",
      "settings.volume": "Громкость",
      "settings.section.language": "Язык",
      "settings.section.controls": "Управление",
      "settings.section.display": "Отображение",
      "settings.handedness": "Ведущая рука",
      "settings.handedness.right": "Правша",
      "settings.handedness.left": "Левша",
      "settings.uiScale": "Размер кнопок",
      "settings.uiScale.normal": "Обычный",
      "settings.uiScale.large": "Крупный",
      "settings.vibration": "Вибрация",
      "settings.vibration.on": "Вкл",
      "settings.vibration.off": "Выкл",
      "settings.graphics": "Графика",
      "settings.graphics.high": "Красиво",
      "settings.graphics.eco": "Экономно",
      "settings.rotateHint": "Подсказка поворота",
      "settings.rotateHint.on": "Показывать",
      "settings.rotateHint.off": "Не показывать",
      "settings.lang.ru": "Русский",
      "settings.lang.en": "English",
      "settings.close": "Закрыть",
      "settings.close.aria": "Закрыть настройки",
      "settings.exit": "Выйти в меню",
      "settings.quit": "Закрыть приложение",
      "settings.quit.hint": "Если приложение не закрылось автоматически — закройте его жестом ОС (на Android: кнопкой «Назад» или из списка недавних приложений; на iPhone: жестом «наверх»).",

      // Подсказка поворота экрана (для мобильных)
      "rotate.title": "Поверни экран",
      "rotate.text": "В горизонтальном режиме играть удобнее.",
      "rotate.continue": "Продолжить",

      // Мобильные кнопки
      "touch.boost.aria": "Ускорение",
      "touch.pause.aria": "Пауза",
      "touch.joystick.aria": "Джойстик движения",
      "touch.joystick.hint": "Коснись и тяни",

      // Переходы между этапами
      "stage.offer.title": "Ты готов нырнуть глубже?",
      "stage.offer.next": "Перейти дальше",
      "stage.offer.continue": "Продолжить сбор",

      // Победа (эпический финал)
      "win.epic.1": "Ты прошёл путь глубины...",
      "win.epic.2": "Ты нашёл Чёрную жемчужину...",
      "win.epic.3": "Ты победитель.",
      // Победа (классика)
      "win.classic.title": "Отличный результат!",
      "win.classic.line": "Ты собрал: {n} жемчужин",
      "win.again": "Играть снова",
      "win.menu": "В меню",
      "win.again.final": "Погрузиться снова",
      "win.menu.final": "Вернуться позже",

      // Заглушка «Глубокое погружение»
      "nextStage.title": "Глубокое погружение скоро...",
      "nextStage.back": "В меню",

      // Акулы
      "shark.title": "Появились акулы!",
      "shark.back": "Вернуться назад",
      "shark.hide": "Спрятаться",

      // Укрытие
      "shelter.title": "Ты нашёл укрытие...",
      "shelter.text": "Скоро здесь будет продолжение истории.",
      "shelter.continue": "Продолжить",

      // После пещеры: выбор
      "caveChoice.title": "Ты выбрался из пещеры...",
      "caveChoice.open": "Перед тобой открывается океан...",
      "caveChoice.prompt": "Что ты сделаешь дальше?",
      "caveChoice.pearls": "Собрать ещё 15 жемчужин",
      "caveChoice.ship": "Найти затонувший корабль",

      // Проигрыш в погоне
      "caveLose.title": "Ты не успел спрятаться...",
      "caveLose.line": "Акулы оказались быстрее...",
      "caveLose.pearl": "Чёрная жемчужина всё ещё ждёт тебя в глубине...",
      "caveLose.try": "Попробовать ещё",
      "caveLose.end": "Закончить",

      // Поражение по кислороду
      "lose.title": "Воздух закончился...",
      "lose.line": "Ты собрал: {n} жемчужин",
      "lose.best": "Лучший результат: {n}",
      "lose.retry": "Попробовать ещё",

      // HUD статусы
      "hud.status.playing": "В пути",
      "hud.status.intro": "В пути…",
      "hud.status.choice": "Выбор",
      "hud.status.shelter": "Укрытие",
      "hud.status.caveChase": "К пещере!",
      "hud.status.shipHunt": "Поиск обломков",
      "hud.status.caveLose": "Погоня",
      "hud.status.caveInside": "В пещере",
      "hud.status.paused": "Пауза",

      // HUD подсказки
      "hud.hint.caveChase": "Плыви к бирюзовой метке «Пещера»",
      "hud.hint.boostSpace": "Пробел — ускорение",
      "hud.hint.caveMazeGoal": "Цель: другой выход из пещеры",
      "hud.hint.caveMazeExit":
        "Свет и пузырьки — намёк. Enter — у настоящего выхода",
      "hud.hint.caveExit": "Enter — дальше в океан",
      "hud.hint.surfaceBoost": "Пробел — ускорить подъём к поверхности",

      // HUD нижняя строка (подсказка управления) — десктоп
      "hud.footer.caveInside":
        "WASD — осторожно · Пробел — чуть быстрее · Esc — пауза",
      "hud.footer.caveChase": "Esc — пауза",
      "hud.footer.default": "WASD / стрелки · Esc — пауза",
      // Мобильные версии той же строки
      "hud.footer.caveInside.mobile":
        "Джойстик — осторожно · Жемчужина — чуть быстрее",
      "hud.footer.caveChase.mobile": "▐▐ — пауза",
      "hud.footer.default.mobile": "Джойстик · Жемчужина · ▐▐ — пауза",

      // HUD этап
      "hud.stage2": "Этап 2: Поиски Чёрной жемчужины",

      // Пауза (на канве)
      "pause.title": "Пауза",
      "pause.hint": "Нажмите Esc, чтобы продолжить",
      "pause.hint.touch": "Коснитесь ▐▐ в углу, чтобы продолжить",

      // Вступительная сцена второго этапа
      "stageTwo.intro.1": "Вы ныряете глубже вместе с друзьями...",
      "stageTwo.intro.2": "Майя сбилась с пути...",
      "stageTwo.intro.3": "Дельфин уплыл ей на помощь",
      "stageTwo.intro.4": "Один друг плывёт зигзагом к свету воды...",

      // Метка пещеры
      "caveLabel": "Пещера · укрытие",

      // Баннер погони к пещере
      "caveChase.banner.1": "Беги к пещере!",
      "caveChase.banner.2": "Стрелки / WASD — плыть",
      "caveChase.banner.3": "Пробел — ускориться",
      "caveChase.hint": "Бирюзовое свечение — вход в пещеру",

      // Цели в охоте за Чёрной жемчужиной
      "shipHunt.found": "Чёрная жемчужина найдена",
      "shipHunt.missed":
        "Вернись к следу: столб света покажет, где настоящая жемчужина",
      "shipHunt.mirage": "Вспышка на дне… плыви проверить, но это может быть обман",
      "shipHunt.search":
        "Ищи по следу обломков: вспыхнут ложные огни, затем появится настоящее свечение",
      "shipHunt.pickup": "Ты у тайника — жемчужина твоя!",
      "shipHunt.fake":
        "Ложный огонь… это не тайник. Жди устойчивое свечение в зарослях",
      "shipHunt.beam":
        "Плыви к мягкому столбу света из зарослей — подойди ближе, и находка откликнется",
      "shipHunt.trail":
        "След обломков привёл к тайнику. Ищи яркое свечение в зарослях",
      "shipHunt.toLeft": "Пустое дно... сместись левее к следам",
      "shipHunt.toRight": "Пустое дно... сместись правее к следам",
      "shipHunt.more": "Ищи больше обломков корабля: доски, ящики, штурвал",

      // Сцены победы/нашедший
      "victory.winner": "Ты — победитель!",
      "victory.found": "НАШЕЛ!!!!",

      // Внутри пещеры (цель)
      "caveInside.goal.1": "Вы спрятались от акул...",
      "caveInside.goal.2": "Но оставаться здесь нельзя.",
      "caveInside.goal.3": "Найдите другой выход из пещеры.",

      // Выход из пещеры (переход)
      "caveExit.phase0": "Вы выбрались из пещеры...",
      "caveExit.phase1": "Я поднимусь на поверхность...",
    },

    en: {
      // Cover
      "meta.title": "The Pearl Hunt",
      "meta.canvas": "Game field",
      "start.title": "The Pearl Hunt",
      "start.rules.1":
        "Dive into the ocean and collect pearls — watch your air supply and catch bubbles to breathe longer.",
      "start.rules.2.before": "Collect ",
      "start.rules.2.bold": "10 pearls",
      "start.rules.2.middle":
        " — and set off in search of the legendary ",
      "start.rules.2.accent": "Black Pearl",
      "start.rules.2.after": ".",
      "start.keys.move": "WASD / arrows — move",
      "start.keys.boost": "Space — boost",
      "start.keys.pause": "Esc — pause",
      "start.keys.mobile.move": "Joystick — move",
      "start.keys.mobile.boost": "Pearl — boost",
      "start.keys.mobile.pause": "▐▐ — pause",
      "start.button": "Dive in",
      "start.volume": "Ocean volume",
      "start.volume.aria": "Volume",
      "start.settings": "Settings",

      // Settings panel
      "settings.title": "Customise your game",
      "settings.section.sound": "Sound",
      "settings.volume": "Volume",
      "settings.section.language": "Language",
      "settings.section.controls": "Controls",
      "settings.section.display": "Display",
      "settings.handedness": "Dominant hand",
      "settings.handedness.right": "Right",
      "settings.handedness.left": "Left",
      "settings.uiScale": "Button size",
      "settings.uiScale.normal": "Normal",
      "settings.uiScale.large": "Large",
      "settings.vibration": "Vibration",
      "settings.vibration.on": "On",
      "settings.vibration.off": "Off",
      "settings.graphics": "Graphics",
      "settings.graphics.high": "Beautiful",
      "settings.graphics.eco": "Eco",
      "settings.rotateHint": "Rotate hint",
      "settings.rotateHint.on": "Show",
      "settings.rotateHint.off": "Hide",
      "settings.lang.ru": "Русский",
      "settings.lang.en": "English",
      "settings.close": "Close",
      "settings.close.aria": "Close settings",
      "settings.exit": "Back to menu",
      "settings.quit": "Close app",
      "settings.quit.hint": "If the app did not close automatically, please close it with an OS gesture (Android: Back button or Recents; iPhone: swipe up).",

      // Rotate screen hint (mobile)
      "rotate.title": "Rotate your screen",
      "rotate.text": "Landscape mode is more comfortable.",
      "rotate.continue": "Continue",

      // Touch buttons
      "touch.boost.aria": "Boost",
      "touch.pause.aria": "Pause",
      "touch.joystick.aria": "Movement joystick",
      "touch.joystick.hint": "Touch and drag",

      // Stage offer
      "stage.offer.title": "Ready to dive deeper?",
      "stage.offer.next": "Go deeper",
      "stage.offer.continue": "Keep collecting",

      // Epic win
      "win.epic.1": "You walked the path of the deep...",
      "win.epic.2": "You found the Black Pearl...",
      "win.epic.3": "You are the winner.",
      // Classic win
      "win.classic.title": "Great job!",
      "win.classic.line": "You collected: {n} pearls",
      "win.again": "Play again",
      "win.menu": "Main menu",
      "win.again.final": "Dive again",
      "win.menu.final": "Return later",

      // Next stage stub
      "nextStage.title": "A deeper dive is coming...",
      "nextStage.back": "Main menu",

      // Sharks
      "shark.title": "Sharks incoming!",
      "shark.back": "Turn back",
      "shark.hide": "Take cover",

      // Shelter
      "shelter.title": "You found shelter...",
      "shelter.text": "The story will continue here soon.",
      "shelter.continue": "Continue",

      // Cave choice
      "caveChoice.title": "You made it out of the cave...",
      "caveChoice.open": "The ocean opens before you...",
      "caveChoice.prompt": "What will you do next?",
      "caveChoice.pearls": "Collect 15 more pearls",
      "caveChoice.ship": "Find the sunken ship",

      // Cave lose
      "caveLose.title": "You didn't reach shelter in time...",
      "caveLose.line": "The sharks were faster...",
      "caveLose.pearl": "The Black Pearl still awaits you in the deep...",
      "caveLose.try": "Try again",
      "caveLose.end": "Quit",

      // Air lose
      "lose.title": "Out of air...",
      "lose.line": "You collected: {n} pearls",
      "lose.best": "Best: {n}",
      "lose.retry": "Try again",

      // HUD status
      "hud.status.playing": "On the way",
      "hud.status.intro": "On the way…",
      "hud.status.choice": "Choice",
      "hud.status.shelter": "Shelter",
      "hud.status.caveChase": "To the cave!",
      "hud.status.shipHunt": "Searching wreckage",
      "hud.status.caveLose": "Chase",
      "hud.status.caveInside": "In the cave",
      "hud.status.paused": "Paused",

      // HUD hints
      "hud.hint.caveChase": "Swim to the turquoise «Cave» marker",
      "hud.hint.boostSpace": "Space — boost",
      "hud.hint.caveMazeGoal": "Goal: find another way out",
      "hud.hint.caveMazeExit":
        "Light and bubbles are hints. Press Enter at the real exit",
      "hud.hint.caveExit": "Enter — onward to the ocean",
      "hud.hint.surfaceBoost": "Space — speed up the ascent",

      // HUD footer
      "hud.footer.caveInside":
        "WASD — carefully · Space — a bit faster · Esc — pause",
      "hud.footer.caveChase": "Esc — pause",
      "hud.footer.default": "WASD / arrows · Esc — pause",
      "hud.footer.caveInside.mobile":
        "Joystick — carefully · Pearl — a bit faster",
      "hud.footer.caveChase.mobile": "▐▐ — pause",
      "hud.footer.default.mobile": "Joystick · Pearl · ▐▐ — pause",

      // HUD stage marker
      "hud.stage2": "Stage 2: Search for the Black Pearl",

      // Pause
      "pause.title": "Paused",
      "pause.hint": "Press Esc to continue",
      "pause.hint.touch": "Tap ▐▐ in the corner to continue",

      // Stage two intro
      "stageTwo.intro.1": "You dive deeper with your friends...",
      "stageTwo.intro.2": "Maya got lost...",
      "stageTwo.intro.3": "The dolphin swam to help her",
      "stageTwo.intro.4": "One friend zigzags toward the surface light...",

      // Cave label
      "caveLabel": "Cave · shelter",

      // Cave chase banner
      "caveChase.banner.1": "Run to the cave!",
      "caveChase.banner.2": "Arrows / WASD — swim",
      "caveChase.banner.3": "Space — boost",
      "caveChase.hint": "The turquoise glow marks the cave entrance",

      // Ship hunt objectives
      "shipHunt.found": "The Black Pearl is found",
      "shipHunt.missed":
        "Back to the trail — a pillar of light will show the real pearl",
      "shipHunt.mirage": "A flash on the floor… swim to check, but it may be a trick",
      "shipHunt.search":
        "Follow the wreckage trail: false lights will flash, then the real glow will appear",
      "shipHunt.pickup": "You reached the cache — the pearl is yours!",
      "shipHunt.fake":
        "A false glow… not the cache. Wait for a steady glow in the weeds",
      "shipHunt.beam":
        "Swim toward the soft light from the weeds — get closer and the find will answer",
      "shipHunt.trail":
        "The wreckage trail led to the cache. Look for a bright glow in the weeds",
      "shipHunt.toLeft": "Empty floor... move left toward the trail",
      "shipHunt.toRight": "Empty floor... move right toward the trail",
      "shipHunt.more": "Look for more ship wreckage: planks, crates, the wheel",

      // Victory
      "victory.winner": "You are the winner!",
      "victory.found": "FOUND IT!!!!",

      // Cave inside goal
      "caveInside.goal.1": "You hid from the sharks...",
      "caveInside.goal.2": "But you can't stay here.",
      "caveInside.goal.3": "Find another way out of the cave.",

      // Cave exit transition
      "caveExit.phase0": "You made it out of the cave...",
      "caveExit.phase1": "I will rise to the surface...",
    },
  };

  const SUPPORTED = ["ru", "en"];
  const FALLBACK = "ru";

  /** @type {Set<(code: string) => void>} */
  const listeners = new Set();

  // Текущий язык определяется из AppSettings (если есть) или авто.
  let currentLang = FALLBACK;

  function _normalize(code) {
    if (!code) return FALLBACK;
    const c = String(code).toLowerCase().split("-")[0];
    return SUPPORTED.indexOf(c) >= 0 ? c : FALLBACK;
  }

  function _initialLang() {
    try {
      if (global.AppSettings && global.AppSettings.get) {
        const fromSettings = global.AppSettings.get("lang");
        if (fromSettings) return _normalize(fromSettings);
      }
    } catch (_err) {
      // игнорируем, пойдём на fallback
    }
    const nav =
      (global.navigator && (global.navigator.language || global.navigator.userLanguage)) || "";
    return _normalize(nav);
  }

  function _format(tmpl, params) {
    if (!params) return tmpl;
    return tmpl.replace(/\{(\w+)\}/g, function (_, key) {
      return Object.prototype.hasOwnProperty.call(params, key)
        ? String(params[key])
        : "{" + key + "}";
    });
  }

  function t(key, params) {
    const lang = currentLang;
    const bundle = DICT[lang] || DICT[FALLBACK];
    const raw =
      (bundle && bundle[key]) ||
      (DICT[FALLBACK] && DICT[FALLBACK][key]) ||
      key;
    return _format(raw, params);
  }

  /**
   * Применить переводы ко всем элементам под `root`:
   *   data-i18n="ключ"                 — заменяет textContent
   *   data-i18n-attr="attr:key[,...]"  — ставит значение атрибута
   *   data-i18n-html="ключ"            — вставляет как HTML (использовать редко)
   */
  function applyToDom(root) {
    const scope = root || (global.document && global.document);
    if (!scope || !scope.querySelectorAll) return;

    scope.querySelectorAll("[data-i18n]").forEach(function (el) {
      const key = el.getAttribute("data-i18n");
      if (!key) return;
      el.textContent = t(key);
    });

    scope.querySelectorAll("[data-i18n-html]").forEach(function (el) {
      const key = el.getAttribute("data-i18n-html");
      if (!key) return;
      el.innerHTML = t(key);
    });

    scope.querySelectorAll("[data-i18n-attr]").forEach(function (el) {
      const spec = el.getAttribute("data-i18n-attr");
      if (!spec) return;
      spec.split(",").forEach(function (pair) {
        const [attr, key] = pair.split(":").map(function (s) {
          return (s || "").trim();
        });
        if (!attr || !key) return;
        el.setAttribute(attr, t(key));
      });
    });

    // Обновим язык корня — важно для правильных правил CSS (шрифт для EN и т.п.).
    if (global.document && global.document.documentElement) {
      global.document.documentElement.setAttribute("lang", currentLang);
    }
    // Обновим title документа.
    if (global.document) {
      global.document.title = t("meta.title");
    }
  }

  function setLang(code) {
    const next = _normalize(code);
    if (next === currentLang) {
      applyToDom();
      return;
    }
    currentLang = next;
    try {
      if (global.AppSettings && global.AppSettings.set) {
        global.AppSettings.set("lang", currentLang);
      }
    } catch (_err) {
      // ок
    }
    applyToDom();
    listeners.forEach(function (fn) {
      try {
        fn(currentLang);
      } catch (err) {
        if (global.console && global.console.warn) {
          global.console.warn("[i18n] listener error:", err);
        }
      }
    });
  }

  function getLang() {
    return currentLang;
  }

  function onChange(fn) {
    if (typeof fn !== "function") return function () {};
    listeners.add(fn);
    return function () {
      listeners.delete(fn);
    };
  }

  // Инициализация: определяем язык и сразу применяем переводы к DOM,
  // как только он готов.
  currentLang = _initialLang();

  function _domReady(cb) {
    if (!global.document) return;
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", cb, { once: true });
    } else {
      cb();
    }
  }

  _domReady(function () {
    applyToDom();
  });

  // Синхронизация с настройками: если кто-то снаружи поменяет `lang` в AppSettings,
  // i18n подхватит. Важно: подписка может быть до инициализации — проверим.
  if (global.AppSettings && typeof global.AppSettings.onChange === "function") {
    global.AppSettings.onChange(function (key, value) {
      if (key === "lang") setLang(value);
    });
  }

  global.i18n = {
    t,
    setLang,
    getLang,
    onChange,
    applyToDom,
    SUPPORTED,
  };
})(typeof window !== "undefined" ? window : globalThis);
