/**
 * Мобильный ввод для «Охоты за жемчужинами».
 *
 * Что делает:
 *  - Реализует динамический джойстик-«капля воды»: появляется там, где игрок
 *    впервые коснулся своей стороны экрана, и тянется за пальцем в радиусе.
 *  - Кнопка ускорения «жемчужина» с противоположной стороны (фиксированная).
 *  - Маленькая кнопка паузы в углу.
 *  - Показ/скрытие оверлея поворота экрана (если в настройках включено).
 *
 * Как интегрируется:
 *  - Живёт в `window.TouchControls`.
 *  - Подключается ПОСЛЕ `settings.js`, `i18n.js`, но до `game.js` (чтобы
 *    `game.js` мог вызвать `TouchControls.attach(input)` в main()).
 *  - В `Input` добавлены методы `setVirtualAxes(x,y,active)` и
 *    `setVirtualBoost(bool)` — именно их мы и дёргаем.
 *
 * Приниципы:
 *  - Ни одного касания клавиатурных флагов напрямую — всё через Input.
 *  - Если `(pointer: coarse)` не выполняется (классический ПК) — DOM
 *    прячется через CSS, а все обработчики остаются «тихими».
 */
(function (global) {
  "use strict";

  const STATE = {
    input: null,
    onPause: null,
    handedness: "right",
    uiScale: "normal",
    active: false, // true, когда тач-UI показан
    joystick: {
      el: null,
      knob: null,
      touchId: null,
      cx: 0,
      cy: 0,
      maxR: 64,
    },
    boost: {
      el: null,
      touchId: null,
    },
    pauseEl: null,
    rootEl: null,
    rotateEl: null,
    vibrate: true,
  };

  function _isCoarsePointer() {
    try {
      return !!(
        global.matchMedia && global.matchMedia("(pointer: coarse)").matches
      );
    } catch (_err) {
      return false;
    }
  }

  function _readSettings() {
    const s = global.AppSettings;
    if (!s) return;
    STATE.handedness = s.get("handedness") || "right";
    STATE.uiScale = s.get("uiScale") || "normal";
    STATE.vibrate = !!s.get("vibration");
  }

  function _applySettingsToDom() {
    if (!STATE.rootEl) return;
    STATE.rootEl.setAttribute("data-handedness", STATE.handedness);
    STATE.rootEl.setAttribute("data-ui-scale", STATE.uiScale);
  }

  function _vibrateShort(ms) {
    if (!STATE.vibrate) return;
    try {
      if (global.navigator && typeof global.navigator.vibrate === "function") {
        global.navigator.vibrate(ms);
      }
    } catch (_err) {
      // На iOS Web API вибрации нет — просто молча пропускаем.
    }
  }

  function _placeJoystickAt(cx, cy) {
    const j = STATE.joystick;
    if (!j.el) return;
    j.el.style.left = cx + "px";
    j.el.style.top = cy + "px";
    j.cx = cx;
    j.cy = cy;
    _placeKnob(0, 0);
  }

  function _placeKnob(dx, dy) {
    const k = STATE.joystick.knob;
    if (!k) return;
    k.style.transform = "translate(-50%, -50%) translate(" + dx + "px, " + dy + "px)";
  }

  /**
   * Проверка: в какой зоне находится точка касания?
   * Возвращает "joystick" | "boost" | null.
   *
   * Джойстик — сторона, зависящая от handedness; кнопка ускорения — зона
   * вокруг элемента boost. HUD сверху (top 14%) — не реагируем, чтобы
   * случайный тап в статус-панель не активировал джойстик.
   */
  function _hitTest(clientX, clientY, touch) {
    // Кнопки паузы и буста проверяем по DOM-попаданию (у них pointer-events: auto).
    const target = touch && touch.target ? touch.target : null;
    if (STATE.boost.el && target && (target === STATE.boost.el || STATE.boost.el.contains(target))) {
      return "boost";
    }
    if (STATE.pauseEl && target && (target === STATE.pauseEl || STATE.pauseEl.contains(target))) {
      return "pause";
    }
    const w = global.innerWidth || 1;
    const h = global.innerHeight || 1;
    if (clientY < h * 0.12) return null; // HUD-зона наверху
    const joystickOnRight = STATE.handedness === "right";
    const isRight = clientX > w * 0.5;
    if (joystickOnRight ? isRight : !isRight) return "joystick";
    return null;
  }

  function _onTouchStart(ev) {
    if (!STATE.active) return;
    const touches = ev.changedTouches;
    for (let i = 0; i < touches.length; i++) {
      const t = touches[i];
      const hit = _hitTest(t.clientX, t.clientY, t);
      if (hit === "boost") {
        if (STATE.boost.touchId == null) {
          STATE.boost.touchId = t.identifier;
          STATE.boost.el.classList.add("is-active");
          if (STATE.input && typeof STATE.input.setVirtualBoost === "function") {
            STATE.input.setVirtualBoost(true);
          }
          _vibrateShort(12);
        }
        ev.preventDefault();
        continue;
      }
      if (hit === "pause") {
        if (typeof STATE.onPause === "function") STATE.onPause();
        _vibrateShort(8);
        ev.preventDefault();
        continue;
      }
      if (hit === "joystick" && STATE.joystick.touchId == null) {
        STATE.joystick.touchId = t.identifier;
        _placeJoystickAt(t.clientX, t.clientY);
        STATE.joystick.el.classList.add("is-visible");
        if (STATE.input && typeof STATE.input.setVirtualAxes === "function") {
          STATE.input.setVirtualAxes(0, 0, true);
        }
        ev.preventDefault();
      }
    }
  }

  function _onTouchMove(ev) {
    if (!STATE.active) return;
    const touches = ev.changedTouches;
    const j = STATE.joystick;
    for (let i = 0; i < touches.length; i++) {
      const t = touches[i];
      if (t.identifier === j.touchId) {
        let dx = t.clientX - j.cx;
        let dy = t.clientY - j.cy;
        const len = Math.hypot(dx, dy);
        const mr = j.maxR;
        if (len > mr) {
          dx = (dx / len) * mr;
          dy = (dy / len) * mr;
        }
        _placeKnob(dx, dy);
        if (STATE.input && typeof STATE.input.setVirtualAxes === "function") {
          STATE.input.setVirtualAxes(dx / mr, dy / mr, true);
        }
        ev.preventDefault();
      }
    }
  }

  function _onTouchEnd(ev) {
    if (!STATE.active) return;
    const touches = ev.changedTouches;
    for (let i = 0; i < touches.length; i++) {
      const t = touches[i];
      if (t.identifier === STATE.joystick.touchId) {
        STATE.joystick.touchId = null;
        STATE.joystick.el.classList.remove("is-visible");
        _placeKnob(0, 0);
        if (STATE.input && typeof STATE.input.setVirtualAxes === "function") {
          STATE.input.setVirtualAxes(0, 0, false);
        }
      }
      if (t.identifier === STATE.boost.touchId) {
        STATE.boost.touchId = null;
        if (STATE.boost.el) STATE.boost.el.classList.remove("is-active");
        if (STATE.input && typeof STATE.input.setVirtualBoost === "function") {
          STATE.input.setVirtualBoost(false);
        }
      }
    }
  }

  function _wireDom() {
    STATE.rootEl = global.document.getElementById("touch-controls");
    STATE.joystick.el = global.document.getElementById("touch-joystick");
    STATE.joystick.knob = global.document.getElementById("touch-joystick-knob");
    STATE.boost.el = global.document.getElementById("touch-boost");
    STATE.pauseEl = global.document.getElementById("touch-pause");
    STATE.rotateEl = global.document.getElementById("rotate-overlay");
    if (!STATE.rootEl) return;

    _applySettingsToDom();

    // Подпиcка на глобальный тач — слушаем на root, т.к. он покрывает экран.
    const opt = { passive: false };
    STATE.rootEl.addEventListener("touchstart", _onTouchStart, opt);
    STATE.rootEl.addEventListener("touchmove", _onTouchMove, opt);
    STATE.rootEl.addEventListener("touchend", _onTouchEnd, opt);
    STATE.rootEl.addEventListener("touchcancel", _onTouchEnd, opt);

    if (global.AppSettings && typeof global.AppSettings.onChange === "function") {
      global.AppSettings.onChange(function (key) {
        if (key === "handedness" || key === "uiScale") {
          _readSettings();
          _applySettingsToDom();
        } else if (key === "vibration") {
          STATE.vibrate = !!global.AppSettings.get("vibration");
        }
      });
    }
  }

  function attach(input, handlers) {
    STATE.input = input || null;
    STATE.onPause = (handlers && handlers.onPause) || null;
    _readSettings();
    if (global.document && global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", _wireDom, { once: true });
    } else {
      _wireDom();
    }
  }

  /**
   * Включить/выключить показ тач-UI. Обычно:
   *   game.start() → setVisible(true), game.end() / pause → setVisible(false).
   * На ПК (pointer: fine) CSS просто прячет элементы — вызывать безопасно.
   */
  function setVisible(on) {
    STATE.active = !!on && _isCoarsePointer();
    if (STATE.rootEl) {
      if (STATE.active) STATE.rootEl.classList.add("is-visible");
      else STATE.rootEl.classList.remove("is-visible");
    }
    // На всякий случай сбросим виртуальные оси и boost при скрытии.
    if (!STATE.active && STATE.input) {
      try {
        STATE.input.setVirtualAxes && STATE.input.setVirtualAxes(0, 0, false);
        STATE.input.setVirtualBoost && STATE.input.setVirtualBoost(false);
      } catch (_err) {}
      STATE.joystick.touchId = null;
      STATE.boost.touchId = null;
      if (STATE.joystick.el) STATE.joystick.el.classList.remove("is-visible");
      if (STATE.boost.el) STATE.boost.el.classList.remove("is-active");
      _placeKnob(0, 0);
    }
  }

  function isCoarse() {
    return _isCoarsePointer();
  }

  function vibrate(ms) {
    _vibrateShort(ms);
  }

  global.TouchControls = {
    attach,
    setVisible,
    isCoarse,
    vibrate,
  };
})(typeof window !== "undefined" ? window : globalThis);
