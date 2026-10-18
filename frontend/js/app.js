/* 迷宫挑战 —— 前端逻辑（通过 TauriCPP Bridge 与 C++ 后端通信） */
'use strict';

const CELL = 22;           // 单格逻辑像素
const WALL = '#';
const TAU = Math.PI * 2;

/* ---------------- 主题 ---------------- */

const THEMES = {
    aurora: {
        label: '深空紫', a: '#4dd0e1', b: '#7c5cff',
        c: { board: '#0d0c26', wall1: '#4b4795', wall2: '#35327a', floor: '#100f2b', wallEdge: 'rgba(196, 196, 255, 0.26)',
             trail: 'rgba(77, 208, 225, 0.24)', player: '#4ade80', goal: '#ffd166',
             coin: '#ffd166', chest: '#8b6cff', hint: 'rgba(255, 209, 102, 0.55)' }
    },
    cyber: {
        label: '赛博朋克', a: '#00e5ff', b: '#ff4ecd',
        c: { board: '#0a0518', wall1: '#552072', wall2: '#3a114f', floor: '#130826', wallEdge: 'rgba(255, 130, 225, 0.30)',
             trail: 'rgba(0, 229, 255, 0.24)', player: '#00ffa3', goal: '#ffe066',
             coin: '#ffe066', chest: '#ff4ecd', hint: 'rgba(0, 229, 255, 0.55)' }
    },
    ocean: {
        label: '深海', a: '#38bdf8', b: '#0ea5e9',
        c: { board: '#04121f', wall1: '#1d5583', wall2: '#11405f', floor: '#071b2e', wallEdge: 'rgba(150, 215, 255, 0.28)',
             trail: 'rgba(56, 189, 248, 0.26)', player: '#7dd3fc', goal: '#fbbf24',
             coin: '#fbbf24', chest: '#4cc6ff', hint: 'rgba(125, 211, 252, 0.55)' }
    },
    forest: {
        label: '森林', a: '#34d399', b: '#a3e635',
        c: { board: '#071710', wall1: '#2c6650', wall2: '#1d4a39', floor: '#0c231b', wallEdge: 'rgba(175, 240, 195, 0.26)',
             trail: 'rgba(163, 230, 53, 0.24)', player: '#a3e635', goal: '#fbbf24',
             coin: '#fbbf24', chest: '#4ade80', hint: 'rgba(163, 230, 53, 0.55)' }
    },
    sunset: {
        label: '日落', a: '#fb923c', b: '#f43f5e',
        c: { board: '#170811', wall1: '#6b3055', wall2: '#4c1f3b', floor: '#1c0d18', wallEdge: 'rgba(255, 185, 175, 0.28)',
             trail: 'rgba(251, 146, 60, 0.26)', player: '#fbbf24', goal: '#fde047',
             coin: '#fde047', chest: '#fb7185', hint: 'rgba(253, 224, 71, 0.55)' }
    },
    amber: {
        label: '琥珀金', a: '#fcd34d', b: '#f59e0b',
        c: { board: '#130c04', wall1: '#6d4f2b', wall2: '#503716', floor: '#1c1308', wallEdge: 'rgba(255, 228, 165, 0.30)',
             trail: 'rgba(252, 211, 77, 0.26)', player: '#bbf451', goal: '#ffe08a',
             coin: '#ffe08a', chest: '#f59e0b', hint: 'rgba(252, 211, 77, 0.55)' }
    },
    rose: {
        label: '玫瑰金', a: '#f9a8d4', b: '#f472b6',
        c: { board: '#150912', wall1: '#6b3357', wall2: '#4d2040', floor: '#1a0d17', wallEdge: 'rgba(255, 208, 230, 0.28)',
             trail: 'rgba(249, 168, 212, 0.24)', player: '#fda4af', goal: '#fcd34d',
             coin: '#fcd34d', chest: '#f472b6', hint: 'rgba(249, 168, 212, 0.55)' }
    }
};

let currentTheme = 'aurora';

/* ---------------- 音频（Web Audio 程序化合成，无需音频文件） ---------------- */

const Sound = {
    ctx: null,
    master: null,
    musicBus: null,
    sfxBus: null,
    musicOn: true,
    sfxOn: true,
    bar: 0,
    nextBarTime: 0,
    timer: null,
    _noise: null,

    mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); },

    ensure() {
        if (this.ctx) return;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.9;
        this.master.connect(this.ctx.destination);

        this.musicBus = this.ctx.createGain();
        this.musicBus.gain.value = this.musicOn ? 0.17 : 0;
        this.musicBus.connect(this.master);

        this.sfxBus = this.ctx.createGain();
        this.sfxBus.gain.value = this.sfxOn ? 0.45 : 0;
        this.sfxBus.connect(this.master);
    },

    /// 首次用户交互后调用：解锁音频并启动伴奏
    unlock() {
        this.ensure();
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();
        if (this.musicOn) this.startMusic();
    },

    tone(freq, at, dur, gain, type, bus) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = type || 'triangle';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.linearRampToValueAtTime(gain, at + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
        osc.connect(g);
        g.connect(bus || this.sfxBus);
        osc.start(at);
        osc.stop(at + dur + 0.03);
    },

    noise(at, gain, bus) {
        if (!this.ctx) return;
        if (!this._noise) {
            const sr = this.ctx.sampleRate;
            const buf = this.ctx.createBuffer(1, Math.floor(sr * 0.08), sr);
            const data = buf.getChannelData(0);
            for (let i = 0; i < data.length; i++) {
                data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
            }
            this._noise = buf;
        }
        const src = this.ctx.createBufferSource();
        src.buffer = this._noise;
        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 7000;
        const g = this.ctx.createGain();
        g.gain.value = gain;
        src.connect(hp);
        hp.connect(g);
        g.connect(bus || this.musicBus);
        src.start(at);
    },

    /* ---- 音效 ---- */

    coin() {
        if (!this.sfxOn) return;
        this.ensure();
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        this.tone(this.mtof(88), t, 0.09, 0.5, 'triangle');
        this.tone(this.mtof(95), t + 0.06, 0.18, 0.42, 'triangle');
    },

    chest() {
        if (!this.sfxOn) return;
        this.ensure();
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        [72, 76, 79, 84, 88].forEach((m, i) => {
            this.tone(this.mtof(m), t + i * 0.07, 0.3, 0.36, 'triangle');
        });
        this.tone(this.mtof(36), t, 0.45, 0.3, 'sine');
    },

    bump() {
        if (!this.sfxOn) return;
        this.ensure();
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        this.tone(96, t, 0.08, 0.16, 'sine');
    },

    win() {
        if (!this.sfxOn) return;
        this.ensure();
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        [72, 76, 79, 84, 88].forEach((m, i) => {
            this.tone(this.mtof(m), t + i * 0.1, 0.55, 0.34, 'triangle');
        });
        this.tone(this.mtof(48), t, 1.2, 0.2, 'sine');
    },

    /* ---- 炸弹人音效 ---- */

    sweep(from, to, at, dur, gain, type) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(from, at);
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + dur);
        g.gain.setValueAtTime(gain, at);
        g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.02);
        osc.connect(g);
        g.connect(this.sfxBus);
        osc.start(at);
        osc.stop(at + dur + 0.05);
    },

    placeBomb() {
        if (!this.sfxOn) return;
        this.ensure();
        if (!this.ctx) return;
        this.sweep(900, 280, this.ctx.currentTime, 0.16, 0.22, 'square');
    },

    deny() {
        if (!this.sfxOn) return;
        this.ensure();
        if (!this.ctx) return;
        this.tone(130, this.ctx.currentTime, 0.16, 0.2, 'square');
    },

    explode() {
        if (!this.sfxOn) return;
        this.ensure();
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        this.sweep(200, 35, t, 0.5, 0.55, 'sine');
        this.noise(t, 0.5);
        this.noise(t + 0.04, 0.35);
    },

    monsterDie() {
        if (!this.sfxOn) return;
        this.ensure();
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        this.noise(t, 0.4);
        this.sweep(520, 110, t + 0.03, 0.22, 0.22, 'triangle');
    },

    die() {
        if (!this.sfxOn) return;
        this.ensure();
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        [440, 330, 220, 165].forEach((m, i) => {
            this.tone(m, t + i * 0.16, 0.26, 0.28, 'triangle');
        });
    },

    powerUp() {
        if (!this.sfxOn) return;
        this.ensure();
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        [72, 79, 84, 88].forEach((m, i) => {
            this.tone(this.mtof(m), t + i * 0.06, 0.22, 0.3, 'triangle');
        });
    },

    /* ---- 背景伴奏：Am - F - C - G 循环 ---- */

    startMusic() {
        this.ensure();
        if (!this.ctx || this.timer) return;
        if (this.musicBus) this.musicBus.gain.value = 0.17;
        this.bar = 0;
        this.nextBarTime = this.ctx.currentTime + 0.25;
        this.timer = setInterval(() => this.pump(), 120);
    },

    stopMusic() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        if (this.musicBus) this.musicBus.gain.value = 0;
    },

    pump() {
        if (!this.ctx) return;
        const BAR = 3.2;   // 75 BPM，每小节 4 拍
        while (this.nextBarTime < this.ctx.currentTime + 0.9) {
            this.scheduleBar(this.nextBarTime, this.bar);
            this.nextBarTime += BAR;
            this.bar++;
        }
    },

    scheduleBar(t, bar) {
        const chords = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 52, 55, 60], [55, 59, 62, 67]];
        const ch = chords[bar % 4];

        // 低音
        this.tone(this.mtof(ch[0] - 24), t, 2.4, 0.14, 'sine', this.musicBus);
        this.tone(this.mtof(ch[0] - 12), t + 1.6, 1.3, 0.07, 'sine', this.musicBus);

        // 八分音符琶音
        for (let i = 0; i < 8; i++) {
            const m = ch[i % 4] + (i >= 4 ? 12 : 0);
            this.tone(this.mtof(m), t + i * 0.4, 0.42, 0.07, 'triangle', this.musicBus);
        }

        // 轻打击
        this.noise(t + 0.4, 0.035);
        this.noise(t + 1.2, 0.025);
        this.noise(t + 2.0, 0.035);
        this.noise(t + 2.8, 0.025);
    }
};

/* ---------------- DOM ---------------- */

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

const el = {
    panel: document.getElementById('panel'),
    btnCollapse: document.getElementById('btnCollapse'),
    levels: document.getElementById('levels'),
    themes: document.getElementById('themes'),
    scoreChip: document.getElementById('scoreChip'),
    steps: document.getElementById('statSteps'),
    time: document.getElementById('statTime'),
    coins: document.getElementById('statCoins'),
    chests: document.getElementById('statChests'),
    kills: document.getElementById('statKills'),
    blast: document.getElementById('statBlast'),
    status: document.getElementById('statusText'),
    overlay: document.getElementById('winOverlay'),
    winSteps: document.getElementById('winSteps'),
    winTime: document.getElementById('winTime'),
    winScore: document.getElementById('winScore'),
    winExtra: document.getElementById('winExtra'),
    winSub: document.getElementById('winSub'),
    deadOverlay: document.getElementById('deadOverlay'),
    deadTitle: document.getElementById('deadTitle'),
    deadSub: document.getElementById('deadSub'),
    deadKills: document.getElementById('deadKills'),
    deadScore: document.getElementById('deadScore'),
    deadTime: document.getElementById('deadTime'),
    btnNew: document.getElementById('btnNew'),
    btnRestart: document.getElementById('btnRestart'),
    btnHint: document.getElementById('btnHint'),
    btnWinAgain: document.getElementById('btnWinAgain'),
    btnRevive: document.getElementById('btnRevive'),
    btnBomb: document.getElementById('btnBomb'),
    btnMusic: document.getElementById('btnMusic'),
    btnSfx: document.getElementById('btnSfx')
};

const state = {
    w: 0, h: 0, grid: [],
    player: { x: 1, y: 1 },
    goal: { x: 1, y: 1 },
    steps: 0, ms: 0, best: 0, hints: 0,
    level: 1, levelName: '普通',
    finished: false,
    coins: [], chests: [],
    coinsTotal: 0, chestsTotal: 0, coinsGot: 0, chestsGot: 0, score: 0,
    visited: new Set(),
    hintPath: [],
    bombs: [], explosions: [], explosionLife: 0,
    monsters: [], monsterTotal: 0,
    alive: true, kills: 0, hasBomb: false, blast: 1
};

const view = { w: 0, h: 0 };
let flash = null;   // 拾取特效

// 渲染插值：逻辑坐标（state）→ 渲染坐标（anim）平滑过渡，消除瞬移感
const anim = {
    player: { x: 1, y: 1 },
    monsters: new Map()   // id -> {x, y, dx, dy}
};
let lastFrameTime = 0;

window.anim = anim;   // 暴露给 CDP 调试

function syncEntities(s) {
    const targets = s.monsters || [];
    for (const m of targets) {
        if (!anim.monsters.has(m.id)) {
            anim.monsters.set(m.id, { x: m.x, y: m.y, dx: 0, dy: 0 });
        }
    }
    for (const id of Array.from(anim.monsters.keys())) {
        if (!targets.some(m => m.id === id)) anim.monsters.delete(id);
    }
}

/// 每帧推进插值（dt 毫秒）
function stepAnim(dt) {
    const k = 1 - Math.exp(-dt / 70);   // 约 70ms 时间常数，跟手且平滑
    anim.player.x += (state.player.x - anim.player.x) * k;
    anim.player.y += (state.player.y - anim.player.y) * k;
    for (const m of state.monsters) {
        const a = anim.monsters.get(m.id);
        if (!a) continue;
        a.dx = m.x - a.x;
        a.dy = m.y - a.y;
        a.x += (m.x - a.x) * k;
        a.y += (m.y - a.y) * k;
    }
}

/* ---------------- Bridge ---------------- */

async function ensureBridge() {
    while (!window.__tauricpp__) {
        await new Promise(r => setTimeout(r, 30));
    }
}

async function invoke(cmd, args) {
    await ensureBridge();
    return window.__tauricpp__.invoke(cmd, args || {});
}

/* ---------------- 状态同步 ---------------- */

const key = p => p.x + ',' + p.y;
const theme = () => (THEMES[currentTheme] || THEMES.aurora).c;

/* 全局诊断：任何未捕获错误/拒绝都显示出来（帮助定位渲染中断） */
window.addEventListener('error', e => {
    const msg = 'ERR: ' + ((e.error && e.error.stack) || e.message);
    if (el.status) el.status.textContent = msg.slice(0, 120);
    document.title = msg.slice(0, 80);
    invoke('log_error', { message: msg.slice(0, 500) }).catch(() => {});
});
window.addEventListener('unhandledrejection', e => {
    const r = e.reason;
    const msg = 'REJ: ' + ((r && r.message) || r);
    if (el.status) el.status.textContent = msg.slice(0, 120);
    invoke('log_error', { message: msg.slice(0, 500) }).catch(() => {});
});

function applyState(s, resetTrail) {
    state.w = s.width;
    state.h = s.height;
    state.grid = s.grid;
    state.player = s.player;
    state.goal = s.goal;
    state.steps = s.steps;
    state.ms = s.ms;
    state.best = s.best;
    state.hints = s.hints;
    state.level = s.level;
    state.levelName = s.levelName;
    state.finished = s.finished;
    state.coins = s.coins || [];
    state.chests = s.chests || [];
    state.coinsTotal = s.coinsTotal || 0;
    state.chestsTotal = s.chestsTotal || 0;
    state.coinsGot = s.coinsGot || 0;
    state.chestsGot = s.chestsGot || 0;
    state.score = s.score || 0;
    state.bombs = s.bombs || [];
    state.monsters = s.monsters || [];
    state.monsterTotal = s.monsterTotal || 0;
    state.explosions = s.explosions || [];
    state.explosionLife = s.explosionLife || 0;
    state.alive = s.alive !== false;
    state.kills = s.kills || 0;
    state.hasBomb = !!s.hasBomb;
    state.blast = s.blast || 1;

    if (resetTrail || s.steps === 0) {
        state.visited = new Set([key(s.player)]);
        anim.player.x = s.player.x;   // 新局瞬移，不从旧位置滑过来
        anim.player.y = s.player.y;
    }
    state.hintPath = [];
    syncEntities(s);

    layout();
    updateHud();
    if (state.finished) showWin();
    else hideWin();
    if (state.alive) hideDead();
}

function updateHud() {
    el.steps.textContent = state.steps;
    el.time.textContent = formatTime(state.ms);
    el.coins.textContent = `${state.coinsGot}/${state.coinsTotal}`;
    el.chests.textContent = `${state.chestsGot}/${state.chestsTotal}`;
    el.kills.textContent = `${state.kills}/${state.monsterTotal}`;
    el.blast.textContent = `×${state.blast}`;
    el.scoreChip.textContent = `得分 ${state.score}`;
    el.btnBomb.disabled = !state.hasBomb || !state.alive;
    el.status.textContent = state.alive
        ? `难度：${state.levelName} · ${state.w} × ${state.h} · 怪物 ${state.monsterTotal} 只`
        : '你已阵亡，点击“复活重来”';
}

function formatTime(ms) {
    const total = Math.floor(ms / 1000);
    const m = String(Math.floor(total / 60)).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    return `${m}:${s}`;
}

/* ---------------- 命令 ---------------- */

async function newGame(level) {
    const s = await invoke('new_game', { level });
    setActiveLevel(level);
    applyState(s, true);
}

async function restart() {
    const s = await invoke('restart', {});
    applyState(s, true);
}

async function move(dx, dy) {
    if (state.finished || !state.w || !state.alive) return;
    const res = await invoke('move', { dx, dy });
    if (res.ok) {
        state.visited.add(key(res.state.player));
        if (res.pick === 'coin') Sound.coin();
        else if (res.pick === 'chest_bomb') Sound.chest();
        else if (res.pick === 'chest_power') Sound.powerUp();
        if (res.pick) onPickup(res.pick, res.state.player);
    } else if (res.death) {
        onDeath(res.death, res.state);
    } else {
        Sound.bump();
    }
    applyState(res.state, false);
}

async function placeBomb() {
    if (!state.alive || !state.w) return;
    const res = await invoke('place_bomb', {});
    if (res.ok) {
        Sound.placeBomb();
        el.status.textContent = '炸弹已放置，快躲开！';
        setTimeout(() => updateHud(), 1000);
    } else {
        Sound.deny();
        const msg = {
            no_bomb: '还没有炸弹——先去找宝箱！',
            limit: '场上炸弹已达上限',
            occupied: '这里已经有炸弹了',
            dead: '你已阵亡'
        };
        el.status.textContent = msg[res.reason] || '暂时不能放炸弹';
        setTimeout(() => updateHud(), 1400);
    }
}

async function hint() {
    const res = await invoke('hint', {});
    const path = res.path || [];
    applyState(res.state, false);
    state.hintPath = path;
}

function onPickup(type, pos) {
    flash = { x: pos.x, y: pos.y, type, at: performance.now() };
    el.scoreChip.classList.remove('is-bump');
    void el.scoreChip.offsetWidth;
    el.scoreChip.classList.add('is-bump');

    const text = {
        coin: '拾取金币 +10 分',
        chest_power: '宝箱升级，爆炸范围 +1！'
    };
    el.status.textContent = text[type] || '获得奖励';
    setTimeout(() => updateHud(), 1200);
}

/* ---------------- 死亡 ---------------- */

function onDeath(reason, s) {
    if (s) applyState(s, false);
    state.alive = false;
    el.deadTitle.textContent = reason === 'player_boom' ? '被自己的炸弹炸死' : '被怪物抓住了';
    el.deadSub.textContent = reason === 'player_boom'
        ? '引信只有两秒，放下就跑'
        : '怪物游动缓慢，但也很危险';
    el.deadKills.textContent = `${state.kills}/${state.monsterTotal}`;
    el.deadScore.textContent = state.score;
    el.deadTime.textContent = formatTime(state.ms);
    el.deadOverlay.classList.add('is-visible');
    Sound.die();
    updateHud();
}

function hideDead() {
    el.deadOverlay.classList.remove('is-visible');
}

/* 防御：arc 半径不允许为负（负半径在部分 WebView2 上会抛异常） */
function safeArc(cx, cy, r, a0, a1) {
    ctx.beginPath();
    if (r > 0) ctx.arc(cx, cy, r, a0, a1);
}

/* ---------------- 面板：难度 / 主题 / 折叠 ---------------- */

function setActiveLevel(level) {
    el.levels.querySelectorAll('.level').forEach(btn => {
        btn.classList.toggle('is-active', Number(btn.dataset.level) === level);
    });
}

function buildThemes() {
    Object.keys(THEMES).forEach(name => {
        const t = THEMES[name];
        const btn = document.createElement('button');
        btn.className = 'swatch';
        btn.dataset.theme = name;
        btn.title = t.label;
        btn.style.background = `linear-gradient(135deg, ${t.a}, ${t.b})`;
        btn.addEventListener('click', () => {
            setTheme(name);
            setCollapsed(true);   // 选好主题后收起面板，直接看效果
        });
        el.themes.appendChild(btn);
    });
}

function setTheme(name) {
    if (!THEMES[name]) name = 'aurora';
    currentTheme = name;
    document.body.dataset.theme = name;
    el.themes.querySelectorAll('.swatch').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.theme === name);
    });
    wallGradient = null;
    try { localStorage.setItem('maze.theme', name); } catch (e) { /* 忽略 */ }
}

function setCollapsed(on) {
    el.panel.classList.toggle('is-collapsed', on);
    el.btnCollapse.textContent = on ? '⟨' : '⟩';
    layout();
    // 面板宽度有 .25s 过渡动画，期间容器尺寸持续变化，过渡结束再算一次
    clearTimeout(setCollapsed._t);
    setCollapsed._t = setTimeout(layout, 320);
    try { localStorage.setItem('maze.collapsed', on ? '1' : '0'); } catch (e) { /* 忽略 */ }
}

function togglePanel() {
    setCollapsed(!el.panel.classList.contains('is-collapsed'));
}

function setMusic(on) {
    Sound.musicOn = on;
    el.btnMusic.classList.toggle('is-active', on);
    if (on) Sound.unlock();
    else Sound.stopMusic();
    try { localStorage.setItem('maze.music', on ? '1' : '0'); } catch (e) { /* 忽略 */ }
}

function setSfx(on) {
    Sound.sfxOn = on;
    el.btnSfx.classList.toggle('is-active', on);
    if (Sound.sfxBus) Sound.sfxBus.gain.value = on ? 0.45 : 0;
    try { localStorage.setItem('maze.sfx', on ? '1' : '0'); } catch (e) { /* 忽略 */ }
}

function restorePrefs() {
    let saved = null, collapsed = false, music = '1', sfx = '1';
    try {
        saved = localStorage.getItem('maze.theme');
        collapsed = localStorage.getItem('maze.collapsed') === '1';
        music = localStorage.getItem('maze.music') || '1';
        sfx = localStorage.getItem('maze.sfx') || '1';
    } catch (e) { /* 忽略 */ }

    setTheme(saved && THEMES[saved] ? saved : 'aurora');

    Sound.musicOn = music !== '0';
    Sound.sfxOn = sfx !== '0';
    el.btnMusic.classList.toggle('is-active', Sound.musicOn);
    el.btnSfx.classList.toggle('is-active', Sound.sfxOn);

    setCollapsed(collapsed);
}

/* ---------------- 胜利面板 ---------------- */

function showWin() {
    el.winSteps.textContent = state.steps;
    el.winTime.textContent = formatTime(state.ms);
    el.winScore.textContent = state.score;
    el.winExtra.textContent =
        `金币 ${state.coinsGot}/${state.coinsTotal} · 宝箱 ${state.chestsGot}/${state.chestsTotal} · 最短 ${state.best} 步`;
    el.winSub.textContent = state.steps <= state.best ? '完美路线，一步不多！' : `比最短路线多走了 ${state.steps - state.best} 步`;
    el.overlay.classList.add('is-visible');
    Sound.win();
}

function hideWin() {
    el.overlay.classList.remove('is-visible');
}

/* ---------------- 绘制 ---------------- */

function roundRectPath(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

let wallGradient = null;

function layout() {
    if (!state.w || !state.h) return;

    const w = state.w * CELL;
    const h = state.h * CELL;
    const dpr = window.devicePixelRatio || 1;

    // 内部分辨率：始终按格大小全分辨率渲染，保证清晰
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 显示尺寸：按容器可用空间等比缩放，避免超出容器被 CSS 拉变形
    const wrap = canvas.parentElement;
    const style = getComputedStyle(wrap);
    const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    const padY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    const availW = Math.max(64, wrap.clientWidth - padX);
    const availH = Math.max(64, wrap.clientHeight - padY);
    const scale = Math.min(1, availW / w, availH / h);

    canvas.style.width = Math.floor(w * scale) + 'px';
    canvas.style.height = Math.floor(h * scale) + 'px';

    view.w = w;
    view.h = h;
    wallGradient = null;
}

/* ---- 炸弹：引信越短闪得越快、跳得越急 ---- */
function drawBombs(t) {
    for (const b of state.bombs) {
        const fuse = typeof b.fuse === 'number' ? b.fuse : 1;
        const k = Math.max(0, Math.min(1, fuse / 2.0));          // 1 → 0 即将爆炸
        const cx = b.x * CELL + CELL / 2;
        const cy = b.y * CELL + CELL / 2;
        const scale = 1 + 0.16 * Math.sin(t / (60 + 320 * (1 - k))) * (0.3 + k);

        // 危险光圈
        ctx.fillStyle = `rgba(255, 90, 60, ${0.08 + 0.14 * (1 - k)})`;
        safeArc(cx, cy, CELL * 0.42, 0, TAU);
        ctx.fill();

        // 弹体
        ctx.fillStyle = '#15152b';
        safeArc(cx, cy, CELL * 0.24 * scale, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#3a3a66';
        safeArc(cx - CELL * 0.05, cy - CELL * 0.07, CELL * 0.09 * scale, 0, TAU);
        ctx.fill();

        // 引信
        ctx.strokeStyle = '#8b7355';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(cx + CELL * 0.02, cy - CELL * 0.22);
        ctx.quadraticCurveTo(cx + CELL * 0.22, cy - CELL * 0.36, cx + CELL * 0.14, cy - CELL * 0.48);
        ctx.stroke();

        // 火花（越接近爆炸闪得越频繁）
        if (k < 0.8 && Math.sin(t / (40 + 90 * k)) > 0) {
            ctx.fillStyle = '#ffd166';
            safeArc(cx + CELL * 0.14, cy - CELL * 0.5, CELL * 0.07, 0, TAU);
            ctx.fill();
        }
    }
}

/* ---- 爆炸火焰 ---- */
function drawExplosions() {
    if (!state.explosions.length) return;
    const life = Math.max(0, Math.min(1, (state.explosionLife || 0) / 0.55));
    for (const e of state.explosions) {
        const cx = e.x * CELL + CELL / 2;
        const cy = e.y * CELL + CELL / 2;
        const r = Math.max(1, CELL * (0.35 + 0.4 * (1 - life)));
        const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, r);
        grad.addColorStop(0, `rgba(255, 255, 230, ${0.7 * life + 0.25})`);
        grad.addColorStop(0.45, `rgba(255, 170, 60, ${0.7 * life + 0.2})`);
        grad.addColorStop(1, 'rgba(255, 80, 30, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, TAU);
        ctx.fill();
    }
}

/* ---- 怪物：平滑游动的小幽灵（插值坐标 + 瞳孔朝向） ---- */
function drawMonsters(t) {
    for (const m of state.monsters) {
        const a = anim.monsters.get(m.id) || { x: m.x, y: m.y, dx: 0, dy: 0 };
        const bob = Math.sin(t / 300 + (m.x * 3 + m.y) * 0.8) * 1.6;
        const cx = a.x * CELL + CELL / 2;
        const cy = a.y * CELL + CELL / 2 + bob;
        const ex = Math.max(-2.2, Math.min(2.2, a.dx * 2.0));
        const ey = Math.max(-2.2, Math.min(2.2, a.dy * 2.0));

        // 身体
        ctx.fillStyle = '#e05e78';
        ctx.beginPath();
        ctx.arc(cx, cy - CELL * 0.04, CELL * 0.26, Math.PI, 0);
        ctx.lineTo(cx + CELL * 0.26, cy + CELL * 0.2);
        ctx.lineTo(cx + CELL * 0.13, cy + CELL * 0.1);
        ctx.lineTo(cx, cy + CELL * 0.22);
        ctx.lineTo(cx - CELL * 0.13, cy + CELL * 0.1);
        ctx.lineTo(cx - CELL * 0.26, cy + CELL * 0.2);
        ctx.closePath();
        ctx.fill();

        // 高光
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.beginPath();
        ctx.ellipse(cx, cy - CELL * 0.16, CELL * 0.14, CELL * 0.07, 0, 0, TAU);
        ctx.fill();

        // 眼睛（瞳孔朝移动方向偏移）
        ctx.fillStyle = '#fff';
        safeArc(cx - CELL * 0.09, cy - CELL * 0.05, CELL * 0.07, 0, TAU);
        ctx.fill();
        safeArc(cx + CELL * 0.09, cy - CELL * 0.05, CELL * 0.07, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#2b0f18';
        safeArc(cx - CELL * 0.09 + ex, cy - CELL * 0.04 + ey, CELL * 0.032, 0, TAU);
        ctx.fill();
        safeArc(cx + CELL * 0.09 + ex, cy - CELL * 0.04 + ey, CELL * 0.032, 0, TAU);
        ctx.fill();
    }
}

function drawCoins(t) {
    const c = theme();
    for (const coin of state.coins) {
        const cx = coin.x * CELL + CELL / 2;
        const cy = coin.y * CELL + CELL / 2 + Math.sin(t / 380 + coin.x * 0.8) * 1.6;

        ctx.fillStyle = 'rgba(255, 220, 120, 0.16)';
        ctx.beginPath();
        safeArc(cx, cy, CELL * 0.3, 0, TAU);
        ctx.fill();

        ctx.fillStyle = c.coin;
        ctx.beginPath();
        safeArc(cx, cy, CELL * 0.15, 0, TAU);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.beginPath();
        safeArc(cx - 1.3, cy - 1.3, CELL * 0.05, 0, TAU);
        ctx.fill();
    }
}

function drawChests(t) {
    const c = theme();
    for (const chest of state.chests) {
        const bob = Math.sin(t / 460 + chest.y * 0.7) * 1.4;
        const x = chest.x * CELL + 4;
        const y = chest.y * CELL + 4 + bob;
        const s = CELL - 8;

        ctx.fillStyle = c.chest;
        roundRectPath(x, y + 1, s, s - 1, 3);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fillRect(x, y + s * 0.42, s, 1.8);
        ctx.fillRect(x + s / 2 - 1.6, y + s * 0.3, 3.2, 4);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        roundRectPath(x, y + 1, s, (s - 1) * 0.42, 3);
        ctx.fill();
    }
}

function drawPickupFlash(t) {
    if (!flash) return;
    let age = t - flash.at;
    if (age > 520) {
        flash = null;
        return;
    }
    if (age < 0) age = 0;
    const p = age / 520;
    const cx = flash.x * CELL + CELL / 2;
    const cy = flash.y * CELL + CELL / 2;
    const color = flash.type === 'chest' ? '255, 180, 240' : '255, 209, 102';

    ctx.strokeStyle = `rgba(${color}, ${1 - p})`;
    ctx.lineWidth = 2 * (1 - p) + 0.5;
    ctx.beginPath();
    safeArc(cx, cy, CELL * (0.2 + p * 0.9), 0, TAU);
    ctx.stroke();
}

function draw(t) {
    if (!state.w) return;
    const { w, h } = view;
    const c = theme();

    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = c.board;
    roundRectPath(0, 0, w, h, 10);
    ctx.fill();

    if (!wallGradient) {
        wallGradient = ctx.createLinearGradient(0, 0, 0, h);
        wallGradient.addColorStop(0, c.wall1);
        wallGradient.addColorStop(1, c.wall2);
    }

    for (let y = 0; y < state.h; y++) {
        const row = state.grid[y] || '';
        for (let x = 0; x < state.w; x++) {
            const px = x * CELL;
            const py = y * CELL;

            if (row[x] === WALL) {
                ctx.fillStyle = wallGradient;
                roundRectPath(px + 0.5, py + 0.5, CELL - 1, CELL - 1, 4);
                ctx.fill();
                // 墙体亮边，与地面形成清晰边界
                ctx.strokeStyle = c.wallEdge;
                ctx.lineWidth = 1;
                ctx.stroke();
            } else {
                ctx.fillStyle = c.floor;
                roundRectPath(px + 1, py + 1, CELL - 2, CELL - 2, 3);
                ctx.fill();

                if (state.visited.has(x + ',' + y)) {
                    ctx.fillStyle = c.trail;
                    roundRectPath(px + 3, py + 3, CELL - 6, CELL - 6, 2);
                    ctx.fill();
                }
            }
        }
    }

    drawCoins(t);
    drawChests(t);
    drawMonsters(t);
    drawBombs(t);

    // 提示路径
    if (state.hintPath.length > 1) {
        ctx.fillStyle = c.hint;
        for (let i = 1; i < state.hintPath.length - 1; i++) {
            const p = state.hintPath[i];
            ctx.beginPath();
            safeArc(p.x * CELL + CELL / 2, p.y * CELL + CELL / 2, 2.6, 0, TAU);
            ctx.fill();
        }
    }

    // 终点（脉冲）
    const gx = state.goal.x * CELL + CELL / 2;
    const gy = state.goal.y * CELL + CELL / 2;
    const pulse = 0.5 + 0.5 * Math.sin(t / 320);
    ctx.fillStyle = `rgba(255, 209, 102, ${0.18 + 0.22 * pulse})`;
    ctx.beginPath();
    safeArc(gx, gy, CELL * (0.34 + 0.08 * pulse), 0, TAU);
    ctx.fill();
    ctx.fillStyle = c.goal;
    ctx.beginPath();
    safeArc(gx, gy, CELL * 0.24, 0, TAU);
    ctx.fill();

    // 玩家（呼吸发光 / 阵亡灰化）—— 使用插值坐标，移动丝滑
    const px = anim.player.x * CELL + CELL / 2;
    const py = anim.player.y * CELL + CELL / 2;

    if (state.alive) {
        const breathe = 0.5 + 0.5 * Math.sin(t / 260);

        const glow = ctx.createRadialGradient(px, py, 1, px, py, CELL * 0.75);
        glow.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
        glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        safeArc(px, py, CELL * 0.75, 0, TAU);
        ctx.fill();

        ctx.fillStyle = c.player;
        ctx.beginPath();
        safeArc(px, py, CELL * (0.24 + 0.03 * breathe), 0, TAU);
        ctx.fill();

        ctx.fillStyle = 'rgba(11, 10, 31, 0.85)';
        ctx.beginPath();
        safeArc(px, py, CELL * 0.09, 0, TAU);
        ctx.fill();
    } else {
        // 阵亡：灰色 + ×眼
        ctx.fillStyle = 'rgba(107, 111, 128, 0.9)';
        safeArc(px, py, CELL * 0.24, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(20, 20, 30, 0.9)';
        ctx.lineWidth = 2;
        for (const sx of [-1, 1]) {
            const ex = px + sx * CELL * 0.09;
            ctx.beginPath();
            ctx.moveTo(ex - 2.4, py - CELL * 0.09 - 2.4);
            ctx.lineTo(ex + 2.4, py - CELL * 0.09 + 2.4);
            ctx.moveTo(ex + 2.4, py - CELL * 0.09 - 2.4);
            ctx.lineTo(ex - 2.4, py - CELL * 0.09 + 2.4);
            ctx.stroke();
        }
    }

    drawExplosions();
    drawPickupFlash(t);
}

// 快照兜底：draw 万一抛异常，恢复上一帧，避免画布只剩背景色
const snapshot = document.createElement('canvas');
const snapCtx = snapshot.getContext('2d');

function render(t) {
    try {
        draw(t);   // t 为 rAF 绝对时间戳，与 flash.at(performance.now()) 同基准
        snapshot.width = canvas.width;
        snapshot.height = canvas.height;
        snapCtx.setTransform(1, 0, 0, 1, 0, 0);
        snapCtx.drawImage(canvas, 0, 0);
    } catch (err) {
        if (snapshot.width > 0) {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(snapshot, 0, 0);
        }
        const msg = 'DRAW ERR: ' + (err && err.message);
        if (el.status) el.status.textContent = msg.slice(0, 120);
        document.title = msg.slice(0, 80);
        invoke('log_error', { message: msg.slice(0, 500) }).catch(() => {});
    }
}

function loop(t) {
    const dt = lastFrameTime ? Math.min(60, t - lastFrameTime) : 16;
    lastFrameTime = t;
    stepAnim(dt);
    render(t);
    requestAnimationFrame(loop);
}

/* ---------------- 事件 ---------------- */

const KEYS = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
    W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0]
};

const BOMB_KEYS = [' ', 'Spacebar', 'j', 'J'];

// 后端游戏主循环（120ms）推送的全量快照
function onTick(data) {
    if (!data) return;
    if (typeof data.ms === 'number' && !state.finished) state.ms = data.ms;

    if (data.bombs) state.bombs = data.bombs;
    if (data.explosions) state.explosions = data.explosions;
    if (typeof data.explosionLife === 'number') state.explosionLife = data.explosionLife;
    if (data.monsters) state.monsters = data.monsters;
    syncEntities(data);
    if (typeof data.monsterTotal === 'number') state.monsterTotal = data.monsterTotal;
    if (typeof data.kills === 'number') state.kills = data.kills;
    if (typeof data.score === 'number') state.score = data.score;
    if (typeof data.alive !== 'undefined') state.alive = data.alive !== false;

    el.time.textContent = formatTime(state.ms);
    el.kills.textContent = `${state.kills}/${state.monsterTotal}`;
    el.scoreChip.textContent = `得分 ${state.score}`;
    el.btnBomb.disabled = !state.hasBomb || !state.alive;
}

function bindEvents() {
    document.addEventListener('keydown', e => {
        // 空格 / J 放炸弹
        if (BOMB_KEYS.indexOf(e.key) >= 0) {
            e.preventDefault();
            placeBomb();
            return;
        }
        const dir = KEYS[e.key];
        if (dir) {
            e.preventDefault();
            move(dir[0], dir[1]);
            return;
        }
        const k = e.key.toLowerCase();
        if (k === 'r') {
            if (!state.alive) restart();      // 阵亡时 R = 复活
            else newGame(state.level);
        } else if (k === 'h') hint();
    });

    el.levels.querySelectorAll('.level').forEach(btn => {
        btn.addEventListener('click', () => newGame(Number(btn.dataset.level)));
    });

    document.querySelectorAll('.pad').forEach(btn => {
        btn.addEventListener('click', () => move(Number(btn.dataset.dx), Number(btn.dataset.dy)));
    });

    el.btnNew.addEventListener('click', () => newGame(state.level));
    el.btnRestart.addEventListener('click', restart);
    el.btnHint.addEventListener('click', hint);
    el.btnBomb.addEventListener('click', placeBomb);
    el.btnWinAgain.addEventListener('click', () => newGame(state.level));
    el.btnRevive.addEventListener('click', restart);
    el.btnCollapse.addEventListener('click', togglePanel);
    el.btnMusic.addEventListener('click', () => setMusic(!Sound.musicOn));
    el.btnSfx.addEventListener('click', () => setSfx(!Sound.sfxOn));

    // 浏览器策略：音频需在用户交互后解锁
    const unlockAudio = () => {
        Sound.unlock();
        window.removeEventListener('pointerdown', unlockAudio);
        document.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio);
    document.addEventListener('keydown', unlockAudio);

    window.addEventListener('resize', layout);
}

async function init() {
    buildThemes();
    restorePrefs();
    bindEvents();
    await ensureBridge();

    const bridge = window.__tauricpp__;
    bridge.listen('tick', onTick);
    bridge.listen('explode', () => Sound.explode());
    bridge.listen('monster_kill', () => Sound.monsterDie());
    bridge.listen('player_boom', () => onDeath('player_boom'));
    bridge.listen('monster_catch', () => onDeath('monster_catch'));

    await newGame(1);
    requestAnimationFrame(loop);
}

init();
