/* =========================================================
 *  audio.js — 程序化音效模块
 *  全部声音由 WebAudio 实时合成（振荡器 / 噪声缓冲 / 滤波器），
 *  不加载任何外部音频文件，兼容 file:// 离线运行。
 *
 *  对外 API：
 *    MC.audio.init()                         懒初始化 AudioContext（用户点击开始时调用）
 *    MC.audio.play(name, opts)               播放音效，opts = { volume, pitch, pan }
 *    MC.audio.playAt(name, pos, listener)    按方位播放（pan + 距离衰减）
 *    MC.audio.setVolume(v) / getVolume()     主音量 0..1（localStorage mc_audio_volume，默认 0.8）
 *    MC.audio.setAmbient(mode)               环境音：'day' | 'night' | 'rain' | 'cave' | 'none'
 *    MC.audio.setRain(on)                    雨声循环（噪声 + 滤波，带淡入淡出）
 *    MC.audio.setWind(on)                    风声循环
 *    MC.audio.setUnderwater(bool)            水下低通（闷声）
 *    MC.audio.stopAll()                      停止所有声音
 *    MC.audio.enabled                        是否开启（默认读取 localStorage mc_audio_muted）
 *    MC.audio.setEnabled(bool)               设置开关并同步 localStorage
 *    MC.audio.toggleMuted()                  切换静音
 * =======================================================*/
window.MC = window.MC || {};
(function () {
  'use strict';

  const MASTER_VOLUME = 0.3;      // 基准总音量（实际输出 = MASTER_VOLUME × volume）
  const DEFAULT_VOLUME = 0.8;     // 主音量默认值
  const VOLUME_KEY = 'mc_audio_volume';
  const MAX_VOICES = 64;          // 同时发声的源上限，避免卡顿
  const STORAGE_KEY = 'mc_audio_muted';
  const AMBIENT_FADE = 1.5;       // 环境音交叉淡入淡出时长（秒）
  const AMBIENT_MODES = ['day', 'night', 'rain', 'cave', 'none'];

  const clamp = function (v, a, b) {
    v = Number(v);
    if (!isFinite(v)) return a;
    return Math.max(a, Math.min(b, v));
  };

  function parseCoord(v, key, index) {
    if (v == null) return NaN;
    if (Array.isArray(v)) {
      const n = Number(v[index]);
      return isFinite(n) ? n : NaN;
    }
    const n = Number(v[key]);
    return isFinite(n) ? n : NaN;
  }

  // ---------------- 静音状态（localStorage 记忆） ----------------
  let _enabled = true;
  try {
    const saved = window.localStorage ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (saved === '1' || saved === 'true') _enabled = false;
  } catch (e) { /* 隐私模式 / file:// 限制时忽略 */ }

  // ---------------- 主音量（与静音独立叠加） ----------------
  let _volume = DEFAULT_VOLUME;
  try {
    const savedVol = window.localStorage ? window.localStorage.getItem(VOLUME_KEY) : null;
    if (savedVol !== null && savedVol !== '') {
      const parsed = Number(savedVol);
      if (isFinite(parsed)) _volume = Math.max(0, Math.min(1, parsed));
    }
  } catch (e) { /* 忽略 */ }

  // ---------------- 运行时状态 ----------------
  let ctx = null;          // AudioContext
  let master = null;       // 总音量
  let comp = null;         // 压缩限幅，防雷声等削波
  let uwFilter = null;     // 水下低通
  let sfxBus = null;       // 一次性音效总线
  let noiseBuf = null;     // 复用的噪声缓冲
  let rain = null;         // 雨声循环对象
  let wind = null;         // 风声循环对象
  let wantRain = false;    // setRain 期望状态（与天气联动）
  let wantWind = false;
  let underwater = false;
  let gestureBound = false;
  let _voiceBus = null;    // 当前这次发声的输出总线（playAt / 环境音临时覆盖）
  let _voicePan = null;    // 当前这次发声的声像节点
  let ambience = 'none';   // 当前环境音模式
  let ambientGroup = null; // 当前环境音交叉淡化组
  let ambientTimers = [];  // 环境音随机事件定时器
  let ambientToken = 0;    // 环境音代次，切换后旧回调自动失效
  const active = new Set(); // 正在播放的源节点

  function persist() {
    try {
      if (!window.localStorage) return;
      window.localStorage.setItem(STORAGE_KEY, _enabled ? '0' : '1');
    } catch (e) { /* 忽略 */ }
  }

  function persistVolume() {
    try {
      if (!window.localStorage) return;
      window.localStorage.setItem(VOLUME_KEY, String(_volume));
    } catch (e) { /* 忽略 */ }
  }

  function volumeTarget() {
    return _enabled ? MASTER_VOLUME * _volume : 0.0001;
  }

  // ---------------- 基础工具 ----------------
  function makeNoiseBuffer(seconds) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  function register(src) {
    active.add(src);
    src.addEventListener('ended', function () {
      active.delete(src);
      try { src.disconnect(); } catch (e) { /* 忽略 */ }
    });
  }

  function stopVoice(src, when) {
    try { src.stop(when || 0); } catch (e) { /* 忽略 */ }
  }

  // 振荡器：从 freq 滑到 endFreq，自动 stop
  function startOsc(t, type, freq, endFreq, dur, detune) {
    const o = ctx.createOscillator();
    o.type = type || 'sine';
    const f0 = Math.max(8, freq);
    o.frequency.setValueAtTime(f0, t);
    const d = Math.max(0.03, dur);
    if (endFreq && endFreq !== freq) {
      o.frequency.exponentialRampToValueAtTime(Math.max(8, endFreq), t + d);
    }
    if (detune) {
      try { o.detune.setValueAtTime(detune, t); } catch (e) { /* 忽略 */ }
    }
    o.start(t);
    o.stop(t + d + 0.05);
    register(o);
    return o;
  }

  // 噪声源：循环噪声，自动 stop
  function noise(t, dur, rate) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    s.playbackRate.value = clamp(rate || 1, 0.3, 3);
    const d = Math.max(0.03, dur);
    s.start(t);
    s.stop(t + d + 0.05);
    register(s);
    return s;
  }

  // 指数衰减包络：返回未连接的 GainNode
  function envGain(t, peak, attack, decay) {
    const g = ctx.createGain();
    const p = Math.max(0.0002, peak);
    const a = Math.max(0.003, attack);
    const d = Math.max(0.02, decay);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(p, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    return g;
  }

  function bq(type, freq, q, again) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(clamp(freq, 20, 20000), ctx.currentTime);
    if (q) f.Q.value = q;
    if (again) f.gain.value = again;
    return f;
  }

  // 叮咚 / 钟琴
  function bell(t, freq, dur, peak, type) {
    const o = startOsc(t, type || 'sine', freq, null, dur);
    const g = envGain(t, peak, 0.005, dur);
    o.connect(g);
    connectBus(g);

    const o2 = startOsc(t, 'sine', freq * 2.005, null, dur * 0.75);
    const g2 = envGain(t, peak * 0.22, 0.005, dur * 0.7);
    o2.connect(g2);
    connectBus(g2);
  }

  // 短促敲击（木质 / 石块）
  function knock(t, freq, peak, pitch) {
    const p = pitch || 1;
    const n = noise(t, 0.09, p);
    const f = bq('bandpass', freq, 1.8);
    const g = envGain(t, peak, 0.003, 0.08);
    n.connect(f);
    f.connect(g);
    connectBus(g);

    const o = startOsc(t, 'triangle', freq * 0.35, freq * 0.22, 0.09);
    const og = envGain(t, peak * 0.5, 0.003, 0.08);
    o.connect(og);
    connectBus(og);
  }

  // 所有合成层统一从这里出：支持临时声像（playAt / pan）与临时总线（环境音）
  function connectBus(node, dest) {
    node.connect(dest || _voicePan || _voiceBus || sfxBus);
    return node;
  }

  // 为一次发声建立输出（可选 StereoPannerNode），并保证同步结束后恢复现场
  function withOutput(bus, pan, run) {
    _voiceBus = bus || sfxBus;
    _voicePan = null;
    if (pan && Math.abs(pan) > 0.01 && typeof ctx.createStereoPanner === 'function') {
      try {
        const p = ctx.createStereoPanner();
        p.pan.value = clamp(pan, -1, 1);
        p.connect(_voiceBus);
        _voicePan = p;
        window.setTimeout(function () {
          try { p.disconnect(); } catch (e) { /* 忽略 */ }
        }, 5000);
      } catch (e) {
        _voicePan = null;
      }
    }
    try {
      run();
    } finally {
      _voicePan = null;
      _voiceBus = null;
    }
  }

  // ---------------- 各类音效 ----------------
  const SOUNDS = {
    // 挖石头：短噪声 + 低频闷响
    break_stone: function (t, v, p) {
      const n = noise(t, 0.16, p);
      const f = bq('bandpass', 1500 * p, 0.9);
      const g = envGain(t, 0.78 * v, 0.004, 0.14);
      n.connect(f); f.connect(g); connectBus(g);

      const o = startOsc(t, 'triangle', 155 * p, 68 * p, 0.13);
      const og = envGain(t, 0.5 * v, 0.004, 0.12);
      o.connect(og); connectBus(og);
    },

    // 挖木头：木质“咚”，两层敲击
    break_wood: function (t, v, p) {
      const n = noise(t, 0.18, p);
      const f = bq('bandpass', 850 * p, 1.4);
      const g = envGain(t, 0.72 * v, 0.004, 0.16);
      n.connect(f); f.connect(g); connectBus(g);

      const n2 = noise(t + 0.055, 0.1, p * 1.15);
      const f2 = bq('bandpass', 1400 * p, 2);
      const g2 = envGain(t + 0.055, 0.38 * v, 0.004, 0.08);
      n2.connect(f2); f2.connect(g2); connectBus(g2);

      const o = startOsc(t, 'triangle', 215 * p, 120 * p, 0.12);
      const og = envGain(t, 0.38 * v, 0.004, 0.1);
      o.connect(og); connectBus(og);
    },

    // 挖泥土 / 沙砾：沉闷的“扑”
    break_dirt: function (t, v, p) {
      const n = noise(t, 0.2, p);
      const f = bq('lowpass', 520 * p, 0.7);
      const g = envGain(t, 0.6 * v, 0.008, 0.17);
      n.connect(f); f.connect(g); connectBus(g);

      const o = startOsc(t, 'sine', 95 * p, 65 * p, 0.15);
      const og = envGain(t, 0.32 * v, 0.006, 0.14);
      o.connect(og); connectBus(og);
    },

    // 树叶：沙沙声
    break_leaves: function (t, v, p) {
      const n = noise(t, 0.12, p);
      const f = bq('highpass', 2600 * p, 0.7);
      const g = envGain(t, 0.4 * v, 0.004, 0.1);
      n.connect(f); f.connect(g); connectBus(g);

      const n2 = noise(t + 0.07, 0.1, p * 1.2);
      const f2 = bq('bandpass', 3800 * p, 1.2);
      const g2 = envGain(t + 0.07, 0.3 * v, 0.004, 0.08);
      n2.connect(f2); f2.connect(g2); connectBus(g2);
    },

    // 玻璃破碎
    break_glass: function (t, v, p) {
      const n = noise(t, 0.22, p);
      const f = bq('highpass', 3200 * p, 0.8);
      const g = envGain(t, 0.62 * v, 0.002, 0.2);
      n.connect(f); f.connect(g); connectBus(g);

      bell(t, 2350 * p, 0.18, 0.18 * v, 'triangle');
      bell(t + 0.05, 3100 * p, 0.22, 0.13 * v, 'sine');
      bell(t + 0.11, 2700 * p, 0.18, 0.1 * v, 'sine');
    },

    // 放置方块
    place: function (t, v, p) {
      const n = noise(t, 0.1, p);
      const f = bq('bandpass', 1100 * p, 1.5);
      const g = envGain(t, 0.55 * v, 0.003, 0.09);
      n.connect(f); f.connect(g); connectBus(g);

      const o = startOsc(t, 'triangle', 180 * p, 92 * p, 0.1);
      const og = envGain(t, 0.42 * v, 0.003, 0.09);
      o.connect(og); connectBus(og);
    },

    // 脚步（很轻）
    step: function (t, v, p) {
      const n = noise(t, 0.09, p);
      const f = bq('lowpass', 420 * p, 0.8);
      const g = envGain(t, 0.3 * v, 0.006, 0.08);
      n.connect(f); f.connect(g); connectBus(g);

      const o = startOsc(t, 'sine', 120 * p, 78 * p, 0.08);
      const og = envGain(t, 0.16 * v, 0.004, 0.07);
      o.connect(og); connectBus(og);
    },

    // 跳跃：短促气声
    jump: function (t, v, p) {
      const n = noise(t, 0.12, p);
      const f = bq('lowpass', 650 * p, 0.8);
      const g = envGain(t, 0.2 * v, 0.01, 0.11);
      n.connect(f); f.connect(g); connectBus(g);

      const o = startOsc(t, 'sine', 170 * p, 260 * p, 0.12);
      const og = envGain(t, 0.12 * v, 0.01, 0.11);
      o.connect(og); connectBus(og);
    },

    // 受伤：低哑的“呃”
    hurt: function (t, v, p) {
      const o = startOsc(t, 'sawtooth', 330 * p, 150 * p, 0.24);
      const f = bq('lowpass', 1150 * p, 1.2);
      const g = envGain(t, 0.34 * v, 0.01, 0.22);
      o.connect(f); f.connect(g); connectBus(g);

      const n = noise(t, 0.16, p);
      const nf = bq('bandpass', 520 * p, 1.5);
      const ng = envGain(t, 0.3 * v, 0.006, 0.15);
      n.connect(nf); nf.connect(ng); connectBus(ng);
    },

    // 吃东西：三段咀嚼
    eat: function (t, v, p) {
      for (let i = 0; i < 3; i++) {
        const tt = t + i * 0.12;
        const n = noise(tt, 0.07, p * (1 + i * 0.08));
        const f = bq('bandpass', (900 + i * 220) * p, 2.5);
        const g = envGain(tt, 0.36 * v, 0.003, 0.06);
        n.connect(f); f.connect(g); connectBus(g);
      }
      const o = startOsc(t + 0.02, 'sine', 130 * p, 90 * p, 0.18);
      const og = envGain(t + 0.02, 0.16 * v, 0.01, 0.16);
      o.connect(og); connectBus(og);
    },

    // 交易：叮咚
    trade: function (t, v, p) {
      bell(t, 784 * p, 0.4, 0.3 * v, 'triangle');
      bell(t + 0.17, 587 * p, 0.55, 0.26 * v, 'triangle');
    },

    // 绿宝石：明亮双音
    emerald: function (t, v, p) {
      bell(t, 1046 * p, 0.32, 0.28 * v, 'sine');
      bell(t + 0.1, 1568 * p, 0.42, 0.2 * v, 'sine');
    },

    // UI 点击
    click: function (t, v, p) {
      const o = startOsc(t, 'triangle', 900 * p, 700 * p, 0.05);
      const g = envGain(t, 0.24 * v, 0.002, 0.045);
      o.connect(g); connectBus(g);

      const n = noise(t, 0.03, p);
      const f = bq('highpass', 3000 * p, 0.7);
      const ng = envGain(t, 0.16 * v, 0.002, 0.025);
      n.connect(f); f.connect(ng); connectBus(ng);
    },

    // 合成：两下木质敲击
    craft: function (t, v, p) {
      knock(t, 900 * p, 0.45 * v, p);
      knock(t + 0.11, 1150 * p, 0.34 * v, p * 1.05);
    },

    // 开门：低哑吱呀 + 门闩
    door: function (t, v, p) {
      const o = startOsc(t, 'sawtooth', 185 * p, 82 * p, 0.5);
      const f = bq('lowpass', 900 * p, 5);
      const g = envGain(t, 0.15 * v, 0.08, 0.38);
      o.connect(f); f.connect(g); connectBus(g);

      const n = noise(t + 0.44, 0.06, p);
      const nf = bq('highpass', 2400 * p, 0.8);
      const ng = envGain(t + 0.44, 0.18 * v, 0.002, 0.05);
      n.connect(nf); nf.connect(ng); connectBus(ng);
    },

    // 睡觉：柔和下行音
    sleep: function (t, v, p) {
      bell(t, 523 * p, 0.65, 0.16 * v, 'sine');
      bell(t + 0.22, 392 * p, 0.8, 0.13 * v, 'sine');
      const n = noise(t + 0.1, 0.5, p);
      const f = bq('lowpass', 700 * p, 0.7);
      const g = envGain(t + 0.1, 0.07 * v, 0.15, 0.35);
      n.connect(f); f.connect(g); connectBus(g);
    },

    // 村民哼声（鼻音“嗯”）
    villager_hmm: function (t, v, p) {
      const o = startOsc(t, 'sawtooth', 168 * p, null, 0.52);
      o.frequency.setValueAtTime(165 * p, t);
      o.frequency.linearRampToValueAtTime(208 * p, t + 0.16);
      o.frequency.linearRampToValueAtTime(150 * p, t + 0.5);

      const o2 = startOsc(t, 'sawtooth', 169 * p, null, 0.52);
      o2.frequency.setValueAtTime(171 * p, t);
      o2.frequency.linearRampToValueAtTime(212 * p, t + 0.16);
      o2.frequency.linearRampToValueAtTime(154 * p, t + 0.5);

      const f = bq('bandpass', 620 * p, 2.6);
      const lp = bq('lowpass', 1600 * p, 0.8);
      const g = envGain(t, 0.3 * v, 0.05, 0.46);
      o.connect(f); o2.connect(f); f.connect(lp); lp.connect(g); connectBus(g);
    },

    // 村民受伤
    villager_hurt: function (t, v, p) {
      const o = startOsc(t, 'sawtooth', 310 * p, 205 * p, 0.3);
      const f = bq('bandpass', 900 * p, 1.8);
      const g = envGain(t, 0.3 * v, 0.01, 0.27);
      o.connect(f); f.connect(g); connectBus(g);

      const n = noise(t, 0.12, p);
      const nf = bq('bandpass', 1400 * p, 1.2);
      const ng = envGain(t, 0.18 * v, 0.004, 0.11);
      n.connect(nf); nf.connect(ng); connectBus(ng);
    },

    // 僵尸低吟
    zombie: function (t, v, p) {
      const o = startOsc(t, 'sawtooth', 92 * p, 62 * p, 1.0);
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 5.2;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 4;
      lfo.connect(lfoGain);
      lfoGain.connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + 1.05);
      register(lfo);

      const f = bq('lowpass', 340 * p, 2.5);
      const g = envGain(t, 0.4 * v, 0.12, 0.85);
      o.connect(f); f.connect(g); connectBus(g);

      const n = noise(t, 0.7, p * 0.7);
      const nf = bq('lowpass', 190 * p, 1.2);
      const ng = envGain(t, 0.18 * v, 0.1, 0.58);
      n.connect(nf); nf.connect(ng); connectBus(ng);
    },

    // 羊：颤音咩
    sheep: function (t, v, p) {
      const o = startOsc(t, 'sawtooth', 300 * p, 255 * p, 0.55);
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 9;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 32;
      lfo.connect(lfoGain);
      lfoGain.connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + 0.6);
      register(lfo);

      const f = bq('bandpass', 1200 * p, 1.4);
      const g = envGain(t, 0.28 * v, 0.04, 0.5);
      o.connect(f); f.connect(g); connectBus(g);
    },

    // 猪：两声呼噜
    pig: function (t, v, p) {
      for (let i = 0; i < 2; i++) {
        const tt = t + i * 0.24;
        const o = startOsc(tt, 'sawtooth', 240 * p, 165 * p, 0.2);
        const f = bq('bandpass', 750 * p, 2);
        const g = envGain(tt, 0.3 * v, 0.015, 0.17);
        o.connect(f); f.connect(g); connectBus(g);

        const n = noise(tt, 0.1, p);
        const nf = bq('lowpass', 500 * p, 0.8);
        const ng = envGain(tt, 0.12 * v, 0.01, 0.09);
        n.connect(nf); nf.connect(ng); connectBus(ng);
      }
    },

    // 鸡：短促咯咯
    chicken: function (t, v, p) {
      for (let i = 0; i < 2; i++) {
        const tt = t + i * 0.13;
        const o = startOsc(tt, 'square', (880 + i * 140) * p, 620 * p, 0.08);
        const f = bq('bandpass', 2400 * p, 3);
        const g = envGain(tt, 0.17 * v, 0.004, 0.07);
        o.connect(f); f.connect(g); connectBus(g);
      }
    },

    // 牛：低沉哞
    cow: function (t, v, p) {
      const o = startOsc(t, 'sawtooth', 150 * p, 104 * p, 0.95);
      const o2 = startOsc(t, 'sawtooth', 152 * p, 106 * p, 0.95, 6);
      const f = bq('lowpass', 680 * p, 1.2);
      const g = envGain(t, 0.36 * v, 0.1, 0.82);
      o.connect(f); o2.connect(f); f.connect(g); connectBus(g);

      const n = noise(t + 0.05, 0.5, p * 0.6);
      const nf = bq('lowpass', 320 * p, 0.8);
      const ng = envGain(t + 0.05, 0.12 * v, 0.08, 0.42);
      n.connect(nf); nf.connect(ng); connectBus(ng);
    },

    // 雷声：低频隆隆（长衰减 + 缓慢起伏）
    thunder: function (t, v, p) {
      const n1 = noise(t, 2.4, p * 0.8);
      const f1 = bq('lowpass', 130 * p, 0.8);
      const wob = ctx.createGain();
      wob.gain.value = 1;
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 2.1;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.22;
      lfo.connect(lfoGain);
      lfoGain.connect(wob.gain);
      lfo.start(t);
      lfo.stop(t + 2.3);
      register(lfo);

      const g1 = envGain(t, 0.95 * v, 0.18, 2.15);
      n1.connect(f1); f1.connect(wob); wob.connect(g1); connectBus(g1);

      const n2 = noise(t + 0.05, 1.6, p * 0.65);
      const f2 = bq('bandpass', 420 * p, 0.6);
      const g2 = envGain(t + 0.05, 0.32 * v, 0.06, 1.4);
      n2.connect(f2); f2.connect(g2); connectBus(g2);

      const sub = startOsc(t, 'sine', 52 * p, 30 * p, 1.8);
      const sg = envGain(t, 0.46 * v, 0.1, 1.7);
      sub.connect(sg); connectBus(sg);
    },

    // 闪电：高频炸裂 + 雷尾
    lightning: function (t, v, p) {
      const n = noise(t, 0.28, p);
      const f = bq('highpass', 1800 * p, 0.7);
      const g = envGain(t, 0.85 * v, 0.002, 0.24);
      n.connect(f); f.connect(g); connectBus(g);

      const n2 = noise(t + 0.01, 0.4, p * 0.9);
      const f2 = bq('bandpass', 700 * p, 0.7);
      const g2 = envGain(t + 0.01, 0.45 * v, 0.004, 0.36);
      n2.connect(f2); f2.connect(g2); connectBus(g2);

      const n3 = noise(t + 0.12, 1.5, p * 0.6);
      const f3 = bq('lowpass', 220 * p, 0.8);
      const g3 = envGain(t + 0.12, 0.4 * v, 0.08, 1.3);
      n3.connect(f3); f3.connect(g3); connectBus(g3);
    },

    // 入水 / 水花
    splash: function (t, v, p) {
      const n = noise(t, 0.5, p);
      const f = bq('bandpass', 1400 * p, 0.9);
      f.frequency.setValueAtTime(1400 * p, t);
      f.frequency.exponentialRampToValueAtTime(420 * p, t + 0.35);
      const g = envGain(t, 0.52 * v, 0.008, 0.42);
      n.connect(f); f.connect(g); connectBus(g);

      const n2 = noise(t + 0.1, 0.16, p * 1.2);
      const f2 = bq('highpass', 2400 * p, 0.8);
      const g2 = envGain(t + 0.1, 0.22 * v, 0.004, 0.14);
      n2.connect(f2); f2.connect(g2); connectBus(g2);

      const o = startOsc(t, 'sine', 125 * p, 78 * p, 0.18);
      const og = envGain(t, 0.18 * v, 0.006, 0.16);
      o.connect(og); connectBus(og);
    },

    // 升级 / 成就：上行琶音
    levelup: function (t, v, p) {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      for (let i = 0; i < notes.length; i++) {
        bell(t + i * 0.1, notes[i] * p, 0.45, 0.2 * v, 'triangle');
      }
    },

    // ---------------- 材质脚步（短促 + 内部随机音高） ----------------
    step_grass: function (t, v, p) {
      p *= 0.9 + Math.random() * 0.2;
      const n = noise(t, 0.08, p);
      const f = bq('lowpass', 720 * p, 0.8);
      const g = envGain(t, 0.3 * v, 0.005, 0.07);
      n.connect(f); f.connect(g); connectBus(g);

      const n2 = noise(t, 0.04, p * 1.2);
      const f2 = bq('highpass', 2600 * p, 0.7);
      const g2 = envGain(t, 0.1 * v, 0.003, 0.035);
      n2.connect(f2); f2.connect(g2); connectBus(g2);
    },

    step_stone: function (t, v, p) {
      p *= 0.92 + Math.random() * 0.16;
      const n = noise(t, 0.07, p);
      const f = bq('bandpass', 1700 * p, 1.3);
      const g = envGain(t, 0.34 * v, 0.003, 0.065);
      n.connect(f); f.connect(g); connectBus(g);

      const o = startOsc(t, 'triangle', 230 * p, 130 * p, 0.07);
      const og = envGain(t, 0.2 * v, 0.003, 0.065);
      o.connect(og); connectBus(og);
    },

    step_sand: function (t, v, p) {
      p *= 0.9 + Math.random() * 0.2;
      const n = noise(t, 0.09, p);
      const f = bq('lowpass', 900 * p, 0.7);
      const g = envGain(t, 0.28 * v, 0.006, 0.08);
      n.connect(f); f.connect(g); connectBus(g);

      const n2 = noise(t, 0.04, p * 1.15);
      const f2 = bq('highpass', 3200 * p, 0.7);
      const g2 = envGain(t, 0.08 * v, 0.003, 0.035);
      n2.connect(f2); f2.connect(g2); connectBus(g2);
    },

    step_wood: function (t, v, p) {
      p *= 0.92 + Math.random() * 0.16;
      const n = noise(t, 0.08, p);
      const f = bq('bandpass', 900 * p, 1.8);
      const g = envGain(t, 0.3 * v, 0.003, 0.07);
      n.connect(f); f.connect(g); connectBus(g);

      const o = startOsc(t, 'triangle', 190 * p, 120 * p, 0.07);
      const og = envGain(t, 0.22 * v, 0.003, 0.065);
      o.connect(og); connectBus(og);
    },

    step_dirt: function (t, v, p) {
      p *= 0.9 + Math.random() * 0.2;
      const n = noise(t, 0.09, p);
      const f = bq('lowpass', 520 * p, 0.8);
      const g = envGain(t, 0.3 * v, 0.005, 0.08);
      n.connect(f); f.connect(g); connectBus(g);

      const o = startOsc(t, 'triangle', 120 * p, 80 * p, 0.07);
      const og = envGain(t, 0.12 * v, 0.003, 0.065);
      o.connect(og); connectBus(og);
    },

    step_gravel: function (t, v, p) {
      p *= 0.92 + Math.random() * 0.16;
      const n = noise(t, 0.08, p);
      const f = bq('bandpass', 2100 * p, 1.1);
      const g = envGain(t, 0.3 * v, 0.003, 0.07);
      n.connect(f); f.connect(g); connectBus(g);

      const n2 = noise(t + 0.02, 0.055, p * 0.9);
      const f2 = bq('bandpass', 750 * p, 1.2);
      const g2 = envGain(t + 0.02, 0.16 * v, 0.003, 0.05);
      n2.connect(f2); f2.connect(g2); connectBus(g2);
    },

    step_water: function (t, v, p) {
      p *= 0.9 + Math.random() * 0.2;
      const n = noise(t, 0.2, p);
      const f = bq('bandpass', 1300 * p, 0.9);
      f.frequency.setValueAtTime(1300 * p, t);
      f.frequency.exponentialRampToValueAtTime(520 * p, t + 0.16);
      const g = envGain(t, 0.3 * v, 0.005, 0.17);
      n.connect(f); f.connect(g); connectBus(g);

      const n2 = noise(t + 0.02, 0.1, p * 1.2);
      const f2 = bq('highpass', 2800 * p, 0.8);
      const g2 = envGain(t + 0.02, 0.12 * v, 0.003, 0.09);
      n2.connect(f2); f2.connect(g2); connectBus(g2);

      const o = startOsc(t, 'sine', 135 * p, 80 * p, 0.12);
      const og = envGain(t, 0.12 * v, 0.004, 0.1);
      o.connect(og); connectBus(og);
    },

    // ---------------- 新增音效 ----------------
    // 鸟鸣：2-4 声短促滑音
    bird: function (t, v, p) {
      const count = 2 + Math.floor(Math.random() * 3);
      const base = (1900 + Math.random() * 1300) * p;
      for (let i = 0; i < count; i++) {
        const tt = t + i * (0.07 + Math.random() * 0.04);
        const f0 = base * (0.9 + Math.random() * 0.25);
        const dur = 0.06 + Math.random() * 0.05;
        const o = startOsc(tt, 'sine', f0, null, dur);
        o.frequency.setValueAtTime(f0, tt);
        o.frequency.exponentialRampToValueAtTime(f0 * 1.3, tt + dur * 0.4);
        o.frequency.exponentialRampToValueAtTime(f0 * 0.85, tt + dur);
        const g = envGain(tt, 0.14 * v, 0.003, dur);
        o.connect(g); connectBus(g);
      }
    },

    // 虫鸣：3-5 个高频短脉冲
    cricket: function (t, v, p) {
      const pulses = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < pulses; i++) {
        const tt = t + i * 0.045;
        const n = noise(tt, 0.03, p * 1.2);
        const f = bq('bandpass', 4400 * p, 9);
        const g = envGain(tt, 0.13 * v, 0.002, 0.024);
        n.connect(f); f.connect(g); connectBus(g);
      }
    },

    // 洞穴滴水
    drip: function (t, v, p) {
      const o = startOsc(t, 'sine', 1500 * p, 620 * p, 0.14);
      const g = envGain(t, 0.22 * v, 0.002, 0.13);
      o.connect(g); connectBus(g);

      const n = noise(t, 0.04, p * 1.3);
      const nf = bq('highpass', 3500 * p, 0.8);
      const ng = envGain(t, 0.08 * v, 0.002, 0.03);
      n.connect(nf); nf.connect(ng); connectBus(ng);
    },

    // 打开箱子：木头吱呀 + 一声扣响
    chest_open: function (t, v, p) {
      const o = startOsc(t, 'sawtooth', 165 * p, 88 * p, 0.4);
      const f = bq('lowpass', 900 * p, 4);
      const g = envGain(t, 0.14 * v, 0.06, 0.34);
      o.connect(f); f.connect(g); connectBus(g);
      knock(t + 0.28, 950 * p, 0.3 * v, p);
    },

    // 关闭箱子：两声闷扣
    chest_close: function (t, v, p) {
      knock(t, 900 * p, 0.34 * v, p);
      knock(t + 0.09, 700 * p, 0.28 * v, p * 0.95);

      const o = startOsc(t, 'sine', 110 * p, 72 * p, 0.16);
      const g = envGain(t, 0.2 * v, 0.004, 0.14);
      o.connect(g); connectBus(g);
    },

    // 熔炉：火焰低频 + 随机噼啪
    furnace: function (t, v, p) {
      const n = noise(t, 1.2, p * 0.8);
      const f = bq('lowpass', 720 * p, 0.8);
      const g = envGain(t, 0.16 * v, 0.1, 1.0);
      n.connect(f); f.connect(g); connectBus(g);

      for (let i = 0; i < 6; i++) {
        const tt = t + Math.random() * 1.0;
        const cn = noise(tt, 0.03, p * (0.8 + Math.random() * 0.8));
        const cf = bq('highpass', 1700 * p, 0.8);
        const cg = envGain(tt, 0.08 * v, 0.002, 0.025);
        cn.connect(cf); cf.connect(cg); connectBus(cg);
      }
    },

    // 锄头：短促刮擦 + 闷响
    hoe: function (t, v, p) {
      const n = noise(t, 0.16, p);
      const f = bq('bandpass', 1800 * p, 2);
      f.frequency.setValueAtTime(1800 * p, t);
      f.frequency.exponentialRampToValueAtTime(900 * p, t + 0.12);
      const g = envGain(t, 0.26 * v, 0.003, 0.14);
      n.connect(f); f.connect(g); connectBus(g);

      const o = startOsc(t, 'triangle', 150 * p, 95 * p, 0.1);
      const og = envGain(t, 0.16 * v, 0.003, 0.09);
      o.connect(og); connectBus(og);
    },

    // 敲击木头
    hit_wood: function (t, v, p) {
      const n = noise(t, 0.08, p);
      const f = bq('bandpass', 700 * p, 2);
      const g = envGain(t, 0.4 * v, 0.003, 0.07);
      n.connect(f); f.connect(g); connectBus(g);

      const o = startOsc(t, 'triangle', 180 * p, 105 * p, 0.08);
      const og = envGain(t, 0.25 * v, 0.003, 0.07);
      o.connect(og); connectBus(og);
    },

    // 村民拒绝：两声下行的“嗯嗯”
    villager_no: function (t, v, p) {
      for (let i = 0; i < 2; i++) {
        const tt = t + i * 0.16;
        const o = startOsc(tt, 'sawtooth', (230 - i * 40) * p, (175 - i * 35) * p, 0.14);
        const f = bq('bandpass', 700 * p, 2);
        const g = envGain(tt, 0.2 * v, 0.012, 0.12);
        o.connect(f); f.connect(g); connectBus(g);
      }
    },

    // 收到礼物：明亮小音阶
    gift: function (t, v, p) {
      bell(t, 880 * p, 0.35, 0.22 * v, 'triangle');
      bell(t + 0.12, 1174 * p, 0.4, 0.18 * v, 'sine');

      const n = noise(t, 0.2, p);
      const f = bq('highpass', 2200 * p, 0.7);
      const g = envGain(t, 0.06 * v, 0.01, 0.18);
      n.connect(f); f.connect(g); connectBus(g);
    }
  };

  // 材质 / 常见别名（未知名称仍然静默）
  const ALIASES = {
    break_cobble: 'break_stone',
    break_ore: 'break_stone',
    break_brick: 'break_stone',
    break_log: 'break_wood',
    break_planks: 'break_wood',
    break_grass: 'break_dirt',
    break_sand: 'break_dirt',
    break_gravel: 'break_dirt',
    break_farmland: 'break_dirt',
    break_leaf: 'break_leaves',
    break_sapling: 'break_leaves',
    place_block: 'place',
    block_place: 'place',
    footstep: 'step',
    walk: 'step',
    damage: 'hurt',
    player_hurt: 'hurt',
    hit: 'hurt',
    trade_ok: 'trade',
    coin: 'emerald',
    ui_click: 'click',
    button: 'click',
    crafting: 'craft',
    door_open: 'door',
    door_close: 'door',
    bed: 'sleep',
    villager: 'villager_hmm',
    hmm: 'villager_hmm',
    villager_attack: 'villager_hurt',
    zombie_groan: 'zombie',
    zombie_ambient: 'zombie',
    sheep_baa: 'sheep',
    pig_oink: 'pig',
    chicken_cluck: 'chicken',
    cow_moo: 'cow',
    thunder_rumble: 'thunder',
    lightning_strike: 'lightning',
    water_splash: 'splash',
    swim: 'splash',
    level_up: 'levelup',
    achievement: 'levelup'
  };

  // ---------------- 主链路 ----------------
  function bindGestureResume() {
    if (gestureBound) return;
    gestureBound = true;
    const resumeOnce = function () { resume(); };
    ['pointerdown', 'mousedown', 'keydown', 'touchstart'].forEach(function (ev) {
      try {
        window.addEventListener(ev, resumeOnce, { passive: true });
      } catch (e) {
        try { window.addEventListener(ev, resumeOnce, false); } catch (e2) { /* 忽略 */ }
      }
    });
  }

  function resume() {
    try {
      if (!ctx) return;
      if (ctx.state === 'suspended' && ctx.resume) {
        const p = ctx.resume();
        if (p && p.catch) p.catch(function () { /* 未获得用户手势时忽略 */ });
      }
    } catch (e) { /* 忽略 */ }
  }

  function init() {
    try {
      if (ctx) {
        resume();
        updateRain();
        if (wantWind) startWind();
        if (ambience !== 'none' && !ambientGroup) startAmbient(ambience);
        return true;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;

      ctx = new AC();

      master = ctx.createGain();
      master.gain.value = volumeTarget();

      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.knee.value = 24;
      comp.ratio.value = 4;
      comp.attack.value = 0.004;
      comp.release.value = 0.25;

      uwFilter = ctx.createBiquadFilter();
      uwFilter.type = 'lowpass';
      uwFilter.frequency.value = underwater ? 420 : 18000;
      uwFilter.Q.value = 0.7;

      master.connect(comp);
      comp.connect(uwFilter);
      uwFilter.connect(ctx.destination);

      sfxBus = ctx.createGain();
      sfxBus.gain.value = 1;
      sfxBus.connect(master);

      noiseBuf = makeNoiseBuffer(2);

      bindGestureResume();
      resume();

      updateRain();
      if (wantWind) startWind();
      if (ambience !== 'none') startAmbient(ambience);
      return true;
    } catch (e) {
      ctx = null;
      master = null;
      comp = null;
      uwFilter = null;
      sfxBus = null;
      noiseBuf = null;
      rain = null;
      wind = null;
      ambientGroup = null;
      ambientToken++;
      for (let i = 0; i < ambientTimers.length; i++) {
        try { window.clearTimeout(ambientTimers[i]); } catch (e2) { /* 忽略 */ }
      }
      ambientTimers = [];
      return false;
    }
  }

  function ensureContext() {
    if (ctx) {
      resume();
      return true;
    }
    return init();
  }

  // 真正发声：检查名称 / 上下文 / 并发上限，然后按指定总线与声像合成
  function emit(name, volume, pitch, pan, bus) {
    try {
      if (!_enabled) return false;
      if (!name || typeof name !== 'string') return false;

      const key = ALIASES[name] || name;
      const fn = SOUNDS[key];
      if (!fn) return false; // 未知音效：静默忽略

      if (!ensureContext()) return false;
      if (active.size > MAX_VOICES) return false;
      if (ctx.state === 'closed') return false;
      if (!(volume > 0)) return false;

      withOutput(bus || sfxBus, pan, function () {
        fn(ctx.currentTime + 0.02, volume, pitch);
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  function play(name, opts) {
    try {
      if (!name || typeof name !== 'string') return false;
      const volume = clamp(opts && opts.volume != null ? opts.volume : 1, 0, 2);
      if (volume <= 0) return false;
      const pitch = clamp(opts && opts.pitch != null ? opts.pitch : 1, 0.5, 2);
      const pan = opts && opts.pan != null ? clamp(opts.pan, -1, 1) : 0;
      return emit(name, volume, pitch, pan, sfxBus);
    } catch (e) {
      return false;
    }
  }

  /* 按方位播放。
   * 参数：
   *   name     音效名
   *   pos      声源位置 { x, y, z }（也接受 [x, y, z]）
   *   listener 听者 { pos: { x, y, z }, yaw: 弧度 }；pos 可省略（默认原点）。
   *            yaw 采用 three.js 惯例：yaw=0 时朝 -Z，右方为 +X。
   * 距离衰减：8 格内满音量，32 格外静音，中间线性衰减。
   * 返回：是否实际发声（被静音 / 距离过远 / 未知音效时为 false）。
   */
  function playAt(name, pos, listener) {
    try {
      if (!pos) return play(name);

      const px = parseCoord(pos, 'x', 0);
      const py = parseCoord(pos, 'y', 1);
      const pz = parseCoord(pos, 'z', 2);
      if (!isFinite(px) || !isFinite(pz)) return play(name);

      const lp = listener && listener.pos ? listener.pos : (listener || {});
      const lx = parseCoord(lp, 'x', 0);
      const ly = parseCoord(lp, 'y', 1);
      const lz = parseCoord(lp, 'z', 2);
      const ox = isFinite(lx) ? lx : 0;
      const oy = isFinite(ly) ? ly : 0;
      const oz = isFinite(lz) ? lz : 0;

      const dx = px - ox;
      const dz = pz - oz;
      const dy = (isFinite(py) && isFinite(ly)) ? py - oy : 0;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (!isFinite(dist) || dist >= 32) return false; // 32 格外静音

      const volume = dist <= 8 ? 1 : 1 - (dist - 8) / 24;

      let pan = 0;
      if (dist > 0.001) {
        const yawRaw = Number(listener && listener.yaw);
        const yaw = isFinite(yawRaw) ? yawRaw : 0;
        // 听者右向量 = (cos yaw, 0, -sin yaw)
        pan = (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / dist;
        pan = clamp(pan, -1, 1);
      }

      return play(name, { volume: volume, pan: pan });
    } catch (e) {
      return false;
    }
  }

  // ---------------- 循环环境声 ----------------
  function startRain() {
    try {
      if (!ctx || rain) return;
      const now = ctx.currentTime;

      const bus = ctx.createGain();
      bus.gain.setValueAtTime(0.0001, now);
      bus.gain.linearRampToValueAtTime(0.55, now + 1.4); // 淡入
      bus.connect(master);

      const mod = ctx.createGain();
      mod.gain.value = 1;
      mod.connect(bus);

      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.11;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.06; // 缓慢音量起伏，听感更自然
      lfo.connect(lfoGain);
      lfoGain.connect(mod.gain);
      lfo.start(now);

      const sources = [];
      function layer(type, freq, q, level, rate) {
        const s = ctx.createBufferSource();
        s.buffer = noiseBuf;
        s.loop = true;
        s.playbackRate.value = rate || 1;
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        f.Q.value = q || 0.7;
        const g = ctx.createGain();
        g.gain.value = level;
        s.connect(f);
        f.connect(g);
        g.connect(mod);
        s.start(now);
        sources.push(s);
      }
      layer('highpass', 1600, 0.6, 0.42);
      layer('bandpass', 4600, 0.8, 0.28);
      layer('lowpass', 420, 0.9, 0.2);

      rain = { bus: bus, mod: mod, lfo: lfo, lfoGain: lfoGain, sources: sources };
    } catch (e) { /* 忽略 */ }
  }

  function stopRain(fast) {
    try {
      if (!ctx || !rain) return;
      const r = rain;
      rain = null;
      const now = ctx.currentTime;
      const fade = fast ? 0.12 : 1.1;

      r.bus.gain.cancelScheduledValues(now);
      r.bus.gain.setValueAtTime(Math.max(0.0001, r.bus.gain.value), now);
      r.bus.gain.linearRampToValueAtTime(0.0001, now + fade);

      try { r.lfo.stop(now + fade + 0.05); } catch (e) { /* 忽略 */ }
      for (let i = 0; i < r.sources.length; i++) {
        try { r.sources[i].stop(now + fade + 0.05); } catch (e) { /* 忽略 */ }
      }
      window.setTimeout(function () {
        try { r.bus.disconnect(); } catch (e) { /* 忽略 */ }
        try { r.mod.disconnect(); } catch (e) { /* 忽略 */ }
      }, (fade + 0.3) * 1000);
    } catch (e) { /* 忽略 */ }
  }

  function startWind() {
    try {
      if (!ctx || wind) return;
      const now = ctx.currentTime;

      const bus = ctx.createGain();
      bus.gain.setValueAtTime(0.0001, now);
      bus.gain.linearRampToValueAtTime(0.16, now + 2.2); // 缓慢淡入
      bus.connect(master);

      const mod = ctx.createGain();
      mod.gain.value = 1;
      mod.connect(bus);

      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.07;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.4;
      lfo.connect(lfoGain);
      lfoGain.connect(mod.gain);
      lfo.start(now);

      const sources = [];
      function layer(type, freq, q, level, rate) {
        const s = ctx.createBufferSource();
        s.buffer = noiseBuf;
        s.loop = true;
        s.playbackRate.value = rate || 1;
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        f.Q.value = q || 0.7;
        const g = ctx.createGain();
        g.gain.value = level;
        s.connect(f);
        f.connect(g);
        g.connect(mod);
        s.start(now);
        sources.push(s);
      }
      layer('bandpass', 620, 0.7, 0.6);
      layer('lowpass', 320, 0.8, 0.3);

      wind = { bus: bus, mod: mod, lfo: lfo, lfoGain: lfoGain, sources: sources };
    } catch (e) { /* 忽略 */ }
  }

  function stopWind(fast) {
    try {
      if (!ctx || !wind) return;
      const w = wind;
      wind = null;
      const now = ctx.currentTime;
      const fade = fast ? 0.12 : 1.8;

      w.bus.gain.cancelScheduledValues(now);
      w.bus.gain.setValueAtTime(Math.max(0.0001, w.bus.gain.value), now);
      w.bus.gain.linearRampToValueAtTime(0.0001, now + fade);

      try { w.lfo.stop(now + fade + 0.05); } catch (e) { /* 忽略 */ }
      for (let i = 0; i < w.sources.length; i++) {
        try { w.sources[i].stop(now + fade + 0.05); } catch (e) { /* 忽略 */ }
      }
      window.setTimeout(function () {
        try { w.bus.disconnect(); } catch (e) { /* 忽略 */ }
        try { w.mod.disconnect(); } catch (e) { /* 忽略 */ }
      }, (fade + 0.3) * 1000);
    } catch (e) { /* 忽略 */ }
  }

  function setRain(on) {
    try {
      wantRain = !!on;
      updateRain();
      return wantRain;
    } catch (e) {
      return !!on;
    }
  }

  // 雨声实际开关：天气（setRain）或环境音 'rain' 任一需要即播放；
  // 两者共用同一个雨声循环，不会重复叠加。
  function updateRain() {
    try {
      if (!ctx) return;
      if (wantRain || ambience === 'rain') startRain();
      else stopRain(false);
    } catch (e) { /* 忽略 */ }
  }

  function setWind(on) {
    try {
      wantWind = !!on;
      if (!ctx) return wantWind;
      if (wantWind) startWind();
      else stopWind(false);
      return wantWind;
    } catch (e) {
      return !!on;
    }
  }

  function setUnderwater(on) {
    try {
      underwater = !!on;
      if (!ctx || !uwFilter) return underwater;
      const now = ctx.currentTime;
      const target = underwater ? 420 : 18000;
      uwFilter.frequency.cancelScheduledValues(now);
      uwFilter.frequency.setTargetAtTime(target, now, 0.15);
      return underwater;
    } catch (e) {
      return !!on;
    }
  }

  function setEnabled(on) {
    try {
      _enabled = !!on;
      persist();
      if (!ctx || !master) return _enabled;
      const now = ctx.currentTime;
      const target = volumeTarget();
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
      master.gain.linearRampToValueAtTime(target, now + 0.12);
      if (_enabled) resume();
      return _enabled;
    } catch (e) {
      return _enabled;
    }
  }

  function toggleMuted() {
    try {
      return setEnabled(!_enabled);
    } catch (e) {
      return _enabled;
    }
  }

  // ---------------- 主音量（0..1，独立于静音） ----------------
  function setVolume(v) {
    try {
      const n = Number(v);
      if (!isFinite(n)) return _volume;
      _volume = Math.max(0, Math.min(1, n));
      persistVolume();
      if (ctx && master) {
        const now = ctx.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
        master.gain.linearRampToValueAtTime(volumeTarget(), now + 0.1);
      }
      return _volume;
    } catch (e) {
      return _volume;
    }
  }

  function getVolume() {
    try {
      return _volume;
    } catch (e) {
      return DEFAULT_VOLUME;
    }
  }

  // ---------------- 环境音（day / night / rain / cave） ----------------
  // 切换模式时新建一个 GainNode 组：1.5s 淡入；旧组 1.5s 淡出，形成交叉淡化。
  function createAmbientGroup() {
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(1, now + AMBIENT_FADE);
    g.connect(master);
    g._sources = [];
    return g;
  }

  function fadeOutAmbientGroup(group, fade) {
    if (!ctx || !group) return;
    const now = ctx.currentTime;
    try {
      group.gain.cancelScheduledValues(now);
      group.gain.setValueAtTime(Math.max(0.0001, group.gain.value), now);
      group.gain.linearRampToValueAtTime(0.0001, now + fade);
    } catch (e) { /* 忽略 */ }
    const sources = group._sources || [];
    for (let i = 0; i < sources.length; i++) {
      try { sources[i].stop(now + fade + 0.1); } catch (e) { /* 忽略 */ }
    }
    window.setTimeout(function () {
      try { group.disconnect(); } catch (e) { /* 忽略 */ }
    }, (fade + 0.4) * 1000);
  }

  function stopAmbient(fast) {
    const group = ambientGroup;
    ambientGroup = null;
    ambientToken++;
    for (let i = 0; i < ambientTimers.length; i++) {
      try { window.clearTimeout(ambientTimers[i]); } catch (e) { /* 忽略 */ }
    }
    ambientTimers = [];
    fadeOutAmbientGroup(group, fast ? 0.15 : AMBIENT_FADE);
  }

  // 循环噪声层（挂在环境音组上，由组的淡出统一回收）
  function ambientNoiseLayer(group, type, freq, q, level, rate) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    src.playbackRate.value = clamp(rate || 1, 0.3, 3);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = clamp(freq, 20, 20000);
    f.Q.value = q || 0.7;
    const g = ctx.createGain();
    g.gain.value = level;
    src.connect(f);
    f.connect(g);
    g.connect(group);
    src.start(ctx.currentTime);
    group._sources.push(src);
    return { src: src, filter: f, gain: g };
  }

  // 循环振荡器层（可带缓慢 LFO）
  function ambientTone(group, type, freq, level, lfoFreq, lfoDepth) {
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = level;
    o.connect(g);
    g.connect(group);
    o.start(now);
    group._sources.push(o);
    if (lfoFreq) {
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = lfoFreq;
      const lg = ctx.createGain();
      lg.gain.value = lfoDepth != null ? lfoDepth : 0;
      lfo.connect(lg);
      lg.connect(g.gain);
      lfo.start(now);
      group._sources.push(lfo);
    }
  }

  // 随机间隔调度；切换环境音后代次 token 变化，旧定时器自动失效
  function ambientSchedule(token, group, minMs, maxMs, fn) {
    if (!ctx || token !== ambientToken) return;
    const delay = minMs + Math.random() * Math.max(0, maxMs - minMs);
    const timer = window.setTimeout(function () {
      const idx = ambientTimers.indexOf(timer);
      if (idx >= 0) ambientTimers.splice(idx, 1);
      if (token !== ambientToken || !ambientGroup) return;
      try { fn(); } catch (e) { /* 忽略 */ }
      ambientSchedule(token, group, minMs, maxMs, fn);
    }, delay);
    ambientTimers.push(timer);
  }

  // 环境音里的单次音效：走当前环境音组（随交叉淡化），可带声像
  function playAmbient(name, group, volume, pitch, pan) {
    try {
      if (!_enabled || !ctx || !group || !ambientGroup) return false;
      const fn = SOUNDS[name];
      if (!fn) return false;
      if (active.size > MAX_VOICES) return false;
      withOutput(group, pan, function () {
        fn(ctx.currentTime + 0.02, clamp(volume, 0, 1), clamp(pitch || 1, 0.5, 2));
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  function startDayAmbient(group, token) {
    // 轻微的风
    const wind = ambientNoiseLayer(group, 'lowpass', 520, 0.8, 0.055, 0.8);
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.09;
    const lg = ctx.createGain();
    lg.gain.value = 0.02;
    lfo.connect(lg);
    lg.connect(wind.gain.gain);
    lfo.start(ctx.currentTime);
    group._sources.push(lfo);

    // 远处鸟鸣：3-8s 随机
    ambientSchedule(token, group, 3000, 8000, function () {
      playAmbient('bird', group, 0.09 + Math.random() * 0.07, 0.82 + Math.random() * 0.35, Math.random() * 1.6 - 0.8);
    });
  }

  function startNightAmbient(group, token) {
    const now = ctx.currentTime;
    // 持续虫鸣：高频带通噪声 + 快速颤音
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    src.playbackRate.value = 1.3;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 4600;
    f.Q.value = 7;
    const trem = ctx.createGain();
    trem.gain.value = 0.5;
    const level = ctx.createGain();
    level.gain.value = 0.075;
    src.connect(f);
    f.connect(trem);
    trem.connect(level);
    level.connect(group);
    src.start(now);
    group._sources.push(src);

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 11;
    const lg = ctx.createGain();
    lg.gain.value = 0.42;
    lfo.connect(lg);
    lg.connect(trem.gain);
    lfo.start(now);
    group._sources.push(lfo);

    // 偶尔的猫头鹰：9-20s
    ambientSchedule(token, group, 9000, 20000, function () {
      playOwl(group);
    });
  }

  // 猫头鹰：两声低沉的“咕—咕”
  function playOwl(group) {
    if (!_enabled || !ctx || !group || !ambientGroup) return false;
    try {
      withOutput(group, Math.random() * 1.2 - 0.6, function () {
        const t = ctx.currentTime + 0.02;
        for (let i = 0; i < 2; i++) {
          const tt = t + i * 0.55;
          const o = startOsc(tt, 'sine', 420, null, 0.42);
          o.frequency.setValueAtTime(420, tt);
          o.frequency.linearRampToValueAtTime(325, tt + 0.32);
          const f = bq('lowpass', 900, 1.2);
          const g = envGain(tt, 0.12, 0.06, 0.34);
          o.connect(f);
          f.connect(g);
          connectBus(g);
        }
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  function startCaveAmbient(group, token) {
    // 低频嗡鸣（两个略微失谐的正弦）+ 洞穴底噪
    ambientTone(group, 'sine', 54, 0.045, 0.13, 0.015);
    ambientTone(group, 'sine', 81, 0.02, 0.17, 0.01);
    ambientNoiseLayer(group, 'lowpass', 130, 0.8, 0.045, 0.7);

    // 滴水：2-6s 随机
    ambientSchedule(token, group, 2000, 6000, function () {
      playAmbient('drip', group, 0.12 + Math.random() * 0.08, 0.9 + Math.random() * 0.25, Math.random() * 1.4 - 0.7);
    });
  }

  function startAmbient(mode) {
    if (!ctx) return;
    stopAmbient(false); // 旧组 1.5s 淡出，与新组淡入形成交叉淡化
    if (!mode || mode === 'none') return;

    const group = createAmbientGroup(); // 新组 1.5s 淡入
    ambientGroup = group;
    const token = ambientToken;

    if (mode === 'day') startDayAmbient(group, token);
    else if (mode === 'night') startNightAmbient(group, token);
    else if (mode === 'cave') startCaveAmbient(group, token);
    // mode === 'rain'：复用 setRain 的雨声循环，由 updateRain() 控制，不重复叠加
  }

  function setAmbient(mode) {
    try {
      const m = typeof mode === 'string' ? mode.toLowerCase() : 'none';
      const next = AMBIENT_MODES.indexOf(m) >= 0 ? m : 'none';
      if (next === ambience) return ambience; // 重复同一模式：不重启、不叠层
      ambience = next;
      if (ctx) startAmbient(next);
      updateRain();
      return ambience;
    } catch (e) {
      return ambience;
    }
  }

  function stopAll() {
    try {
      wantRain = false;
      wantWind = false;
      ambience = 'none';
      stopAmbient(true);
      stopRain(true);
      stopWind(true);

      if (!ctx || !master) return true;
      const now = ctx.currentTime;

      // 总音量快速下沉再恢复，避免硬切的爆音
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
      master.gain.linearRampToValueAtTime(0.0001, now + 0.03);
      master.gain.setValueAtTime(0.0001, now + 0.05);
      master.gain.linearRampToValueAtTime(volumeTarget(), now + 0.16);

      active.forEach(function (src) {
        stopVoice(src, now + 0.04);
      });
      active.clear();
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------------- 导出 ----------------
  MC.audio = MC.audio || {};
  MC.audio.init = init;
  MC.audio.play = play;
  MC.audio.playAt = playAt;
  MC.audio.setVolume = setVolume;
  MC.audio.getVolume = getVolume;
  MC.audio.setAmbient = setAmbient;
  MC.audio.setRain = setRain;
  MC.audio.setWind = setWind;
  MC.audio.setUnderwater = setUnderwater;
  MC.audio.stopAll = stopAll;
  MC.audio.setEnabled = setEnabled;
  MC.audio.toggleMuted = toggleMuted;

  try {
    Object.defineProperty(MC.audio, 'enabled', {
      enumerable: true,
      configurable: true,
      get: function () { return _enabled; },
      set: function (v) { setEnabled(v); }
    });
  } catch (e) {
    MC.audio.enabled = _enabled;
  }
})();