/**
 * Web Audio: фон океана, редкие пузырьки, SFX (жемчужина, дельфин), лёгкая тревога у акул.
 * Запуск после resume() — вызывать из жеста пользователя (старт игры).
 */
class GameAudio {
  constructor() {
    // _baseMaster — потолок общего уровня при 100% ползунка.
    // Подняли с 0.46 → 0.92: эффекты звучат значительно громче,
    // при пиковых миксах всё равно остаёмся ниже цифрового клиппинга.
    this._baseMaster = 0.92;
    this._ctx = null;
    this.master = null;
    this.ambient = null;
    this.sfx = null;
    this._sharkGain = null;
    this._noiseSrc = null;
    this._ambFilter = null;
    this._ambWet = null;
    this._ambShimmer = null;
    this._lfo = null;
    this._swellLfo = null;
    this._sharkOsc = null;
    this._bubbleAcc = 0;
    this._swimSplashAcc = 0;
    this._scene = "idle";
    this._ascent = 0;
    this._masterMul = 0.55;
    this._mixAmbient = 1;
    this._mixSfx = 1;
    this._mixShark = 1;
    this._fxMul = {
      bubble: 1,
      pop: 1,
      air: 1,
      splash: 1,
      dolphin: 1,
      pearl: 1,
    };
  }

  setMasterVolume(v) {
    this._masterMul = Math.max(0, Math.min(1, v));
    if (this.master) {
      this.master.gain.setTargetAtTime(this._baseMaster * this._masterMul, this._now(), 0.08);
    }
  }

  setMixLevels(mix = {}) {
    const clamp = (x) => Math.max(0, Math.min(2, Number(x) || 0));
    if (mix.ambient !== undefined) this._mixAmbient = clamp(mix.ambient);
    if (mix.sfx !== undefined) this._mixSfx = clamp(mix.sfx);
    if (mix.shark !== undefined) this._mixShark = clamp(mix.shark);
  }

  getMixLevels() {
    return {
      ambient: this._mixAmbient,
      sfx: this._mixSfx,
      shark: this._mixShark,
    };
  }

  setFxLevel(kind, value) {
    if (!this._fxMul || !Object.prototype.hasOwnProperty.call(this._fxMul, kind)) return;
    const v = Math.max(0, Math.min(3, Number(value) || 0));
    this._fxMul[kind] = v;
  }

  _now() {
    return this._ctx ? this._ctx.currentTime : 0;
  }

  resume() {
    if (this._ctx) {
      if (this._ctx.state === "suspended") void this._ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this._ctx = new AC();
    this.master = this._ctx.createGain();
    this.master.gain.value = this._baseMaster * this._masterMul;
    this.ambient = this._ctx.createGain();
    this.ambient.gain.value = 0.86;
    this.sfx = this._ctx.createGain();
    this.sfx.gain.value = 2.1;
    this._sharkGain = this._ctx.createGain();
    this._sharkGain.gain.value = 0;
    this.ambient.connect(this.master);
    this.sfx.connect(this.master);
    this._sharkGain.connect(this.master);
    this.master.connect(this._ctx.destination);
    this._startAmbientNoise();
    this._startSharkDrone();
    void this._ctx.resume();
  }

  _startAmbientNoise() {
    const ctx = this._ctx;
    const rate = ctx.sampleRate;

    // ── Базовый «корпус» океана: мягкий коричневатый шум ──
    // Используем интегрированный белый шум (random walk → brown-like),
    // чтобы убрать «шипение» и получить более низкочастотный, «глубокий» тон.
    const n = Math.floor(4 * rate);
    const buf = ctx.createBuffer(1, n, rate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) * 0.995;
      d[i] = Math.max(-1, Math.min(1, last * 3.5));
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    // Глубокий lowpass — «под водой». Частота дышит LFO.
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 440;
    lp.Q.value = 0.7;

    // Громкость корпуса. Фоновый шум намеренно тише, чем раньше (0.11 → 0.06),
    // чтобы он не забивал короткие SFX (пузыри, щелчки дельфина).
    const wet = ctx.createGain();
    wet.gain.value = 0.06;
    src.connect(lp);
    lp.connect(wet);
    wet.connect(this.ambient);
    src.start();
    this._noiseSrc = src;
    this._ambFilter = lp;
    this._ambWet = wet;

    // ── Лёгкая «пена» сверху: отдельный шум с узким bandpass ~1.3 кГц.
    // Очень тихо, но добавляет океанскую шипуче-пенистую текстуру.
    const buf2 = ctx.createBuffer(1, n, rate);
    const d2 = buf2.getChannelData(0);
    for (let i = 0; i < n; i++) d2[i] = (Math.random() * 2 - 1) * 0.4;
    const src2 = ctx.createBufferSource();
    src2.buffer = buf2;
    src2.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1350;
    bp.Q.value = 0.9;
    const foamGain = ctx.createGain();
    foamGain.gain.value = 0.018;
    src2.connect(bp);
    bp.connect(foamGain);
    foamGain.connect(this.ambient);
    src2.start();
    this._ambShimmer = foamGain;

    // ── Волны: медленный LFO на частоту lowpass (0.09 Гц) + медленный
    // амплитудный LFO на громкость «корпуса» (0.15 Гц). Даёт чувство
    // прилива/отлива вместо ровного шипения.
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.09;
    const lg = ctx.createGain();
    lg.gain.value = 160;
    lfo.connect(lg);
    lg.connect(lp.frequency);
    lfo.start(0);
    this._lfo = lfo;

    const swell = ctx.createOscillator();
    swell.type = "sine";
    swell.frequency.value = 0.15;
    const sg = ctx.createGain();
    sg.gain.value = 0.035;
    swell.connect(sg);
    sg.connect(wet.gain);
    swell.start(0);
    this._swellLfo = swell;
  }

  _startSharkDrone() {
    const ctx = this._ctx;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = 58;
    const g = ctx.createGain();
    g.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 220;
    o.connect(lp);
    lp.connect(g);
    g.connect(this._sharkGain);
    o.start(0);
    this._sharkOsc = o;
  }

  setAmbientScene(scene, ascent01 = 0) {
    if (!this._ctx || !this._ambFilter) return;
    this._scene = scene;
    this._ascent = ascent01;
    const t = this._now();
    let fq = 520;
    let ambMul = 1;
    if (scene === "cave") {
      fq = 340;
    } else if (scene === "ascent") {
      fq = 620 + ascent01 * 180;
    } else if (scene === "win") {
      fq = 480;
      ambMul = 0.55;
    } else if (scene === "emerge") {
      fq = 680;
      ambMul = 1.05;
    }
    this._ambFilter.frequency.setTargetAtTime(fq, t, 0.35);
    this.ambient.gain.setTargetAtTime(0.7 * ambMul * this._mixAmbient, t, 0.25);
  }

  setSharkTension(level) {
    if (!this._ctx || !this._sharkGain) return;
    const v = Math.max(0, Math.min(1, level)) * 0.06 * this._mixShark;
    this._sharkGain.gain.setTargetAtTime(v, this._now(), 0.4);
  }

  tick(dt, game) {
    if (!this._ctx) return;
    this._bubbleAcc += dt;
    const interval = 1.7 + Math.random() * 2.2;
    if (this._bubbleAcc > interval) {
      this._bubbleAcc = 0;
      if (game.state !== "start" && Math.random() < 0.85) this._playBubble();
    }
    this._tickSwimSplash(dt, game);
    this._syncScene(game);
  }

  _syncScene(game) {
    const st = game.state;
    const sh = game._shipHunt;
    if (st === "caveInside" || st === "caveChase") {
      this.setAmbientScene("cave", 0);
    } else if (st === "caveExitTransition") {
      this.setAmbientScene("emerge", 0);
    } else if (st === "shipHunt" && sh && sh.active && sh.phase === 2) {
      this.setAmbientScene("ascent", sh.surfLight || 0);
    } else if (st === "win") {
      this.setAmbientScene("win", 0);
    } else {
      this.setAmbientScene("open", 0);
    }
    const sharks =
      game._sharks &&
      game._sharks.length > 0 &&
      !game._sharksFleeing &&
      (st === "stageTwo" || st === "caveChase" || st === "sharkChoice");
    this.setSharkTension(sharks ? 0.85 : 0);
    const t = this._now();
    // При акулах «мир замирает»: фон и SFX приглушаются.
    this.ambient.gain.setTargetAtTime(
      (sharks ? 0.44 : 0.7) * (st === "win" ? 0.55 : 1) * this._mixAmbient,
      t,
      0.25
    );
    this.sfx.gain.setTargetAtTime((sharks ? 1.25 : 2.1) * this._mixSfx, t, 0.2);
  }

  _playBubble() {
    const ctx = this._ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(380 + Math.random() * 220, t0);
    o.frequency.exponentialRampToValueAtTime(120, t0 + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime((0.26 + Math.random() * 0.06) * this._fxMul.bubble, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 520;
    bp.Q.value = 1.2;
    o.connect(bp);
    bp.connect(g);
    g.connect(this.sfx);
    o.start(t0);
    o.stop(t0 + 0.18);
    if (Math.random() < 0.85) this._playBubblePop(t0 + 0.055 + Math.random() * 0.05);
  }

  _playBubblePop(t0) {
    const ctx = this._ctx;
    if (!ctx) return;
    const n = Math.floor(ctx.sampleRate * 0.018);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) * 0.85;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1200 + Math.random() * 400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime((0.2 + Math.random() * 0.05) * this._fxMul.pop, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.sfx);
    src.start(t0);
    src.stop(t0 + 0.055);
  }

  playPearlChime() {
    const ctx = this._ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.02;
    const freqs = [523.25, 659.25, 783.99, 987.77];
    for (let i = 0; i < freqs.length; i++) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freqs[i];
      const g = ctx.createGain();
      const del = i * 0.055;
      g.gain.setValueAtTime(0.0001, t0 + del);
      g.gain.exponentialRampToValueAtTime(0.28 * this._fxMul.pearl, t0 + del + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + del + 2.0);
      o.connect(g);
      g.connect(this.sfx);
      o.start(t0 + del);
      o.stop(t0 + del + 2.1);
    }
  }

  playDolphinClick() {
    const ctx = this._ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime;
    // Двойной «кик-клик» — частая схема реальных дельфиньих сигналов.
    // Первый щелчок выше, второй на 30 мс позже и чуть ниже: вместе читаются
    // куда ярче одиночного «тик».
    const mk = (delay, f1, f2, amp) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(f1, t0 + delay);
      o.frequency.exponentialRampToValueAtTime(f2, t0 + delay + 0.06);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0 + delay);
      g.gain.exponentialRampToValueAtTime(amp * this._fxMul.dolphin, t0 + delay + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + 0.12);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = f1 * 0.8;
      bp.Q.value = 2.2;
      o.connect(bp);
      bp.connect(g);
      g.connect(this.sfx);
      o.start(t0 + delay);
      o.stop(t0 + delay + 0.13);
    };
    mk(0, 1050, 420, 0.42);
    mk(0.032, 820, 320, 0.32);
  }

  playPearlTick() {
    const ctx = this._ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = 990;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.2 * this._fxMul.pearl, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
    o.connect(g);
    g.connect(this.sfx);
    o.start(t0);
    o.stop(t0 + 0.06);
  }

  playSharksArrive() {
    const ctx = this._ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(62, t0);
    o.frequency.linearRampToValueAtTime(48, t0 + 0.55);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 220;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.0);
    o.connect(lp);
    lp.connect(g);
    g.connect(this.sfx);
    o.start(t0);
    o.stop(t0 + 1.05);
  }

  playCaveEmergence() {
    const ctx = this._ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const scale = [392, 493.88, 587.33, 659.25];
    for (let i = 0; i < scale.length; i++) {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = scale[i];
      const g = ctx.createGain();
      const t1 = t0 + i * 0.07;
      g.gain.setValueAtTime(0.0001, t1);
      g.gain.exponentialRampToValueAtTime(0.2, t1 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.5);
      o.connect(g);
      g.connect(this.sfx);
      o.start(t1);
      o.stop(t1 + 0.48);
    }
  }

  playVictory(epic) {
    const ctx = this._ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.015;
    const freqs = epic ? [392, 493.88, 587.33, 783.99] : [523.25, 659.25, 783.99];
    for (let i = 0; i < freqs.length; i++) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freqs[i];
      const g = ctx.createGain();
      const t1 = t0 + i * 0.09;
      g.gain.setValueAtTime(0.0001, t1);
      g.gain.exponentialRampToValueAtTime(0.24, t1 + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t1 + 1.1);
      o.connect(g);
      g.connect(this.sfx);
      o.start(t1);
      o.stop(t1 + 1.1);
    }
  }

  _tickSwimSplash(dt, game) {
    if (!game || !game.player) return;
    const st = game.state;
    if (st === "start" || st === "paused" || st === "lose" || st === "win") return;
    const sp = Math.hypot(game.player.vx || 0, game.player.vy || 0);
    if (sp < 55) return;
    this._swimSplashAcc += dt * (sp / 150);
    if (this._swimSplashAcc > 0.82 + Math.random() * 0.35) {
      this._swimSplashAcc = 0;
      this._playSwimSplash(Math.min(1, sp / 260));
    }
  }

  _playSwimSplash(power) {
    const ctx = this._ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const n = Math.floor(ctx.sampleRate * (0.03 + power * 0.025));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) * 0.8;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 700 + power * 420 + Math.random() * 180;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime((0.15 + power * 0.11) * this._fxMul.splash, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.sfx);
    src.start(t0);
    src.stop(t0 + 0.08);
  }

  // "Ууух": ощущение наполнения воздухом при подборе кислорода.
  playAirRefill() {
    const ctx = this._ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(170, t0);
    o.frequency.exponentialRampToValueAtTime(310, t0 + 0.24);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.24 * this._fxMul.air, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.36);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 380;
    bp.Q.value = 0.65;
    o.connect(bp);
    bp.connect(g);
    g.connect(this.sfx);
    o.start(t0);
    o.stop(t0 + 0.36);
  }

  playDebugSample(kind) {
    if (kind === "bubble") this._playBubble();
    else if (kind === "pop") this._playBubblePop(this._now() + 0.01);
    else if (kind === "air") this.playAirRefill();
    else if (kind === "splash") this._playSwimSplash(0.9);
    else if (kind === "dolphin") this.playDolphinClick();
    else if (kind === "pearl") this.playPearlTick();
  }
}

window.GameAudio = GameAudio;
