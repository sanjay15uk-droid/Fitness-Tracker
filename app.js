/* ============================================================
   APP LOGIC
   Everything here reads/writes localStorage on your phone's
   browser, so it works instantly with no backend. The data.js
   file (programme, meals, shopping) is what you'd edit on GitHub
   if you want to change the plan itself.
   ============================================================ */

const STORAGE_KEY = "fitTracker.v1";
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ---------- STATE ----------
function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const defaults = {
    settings: { weightKg: null, heightCm: null, age: null, sex: "male", phase: "reacclimation", deficitKcal: 300 },
    log: {},
    weightLog: [],
    overrides: {
      exercises: {}, // exId -> { sets, reps, cue, removed }
      customExercises: { push: [], pull: [], legs: [] },
      customMeals: { breakfast: [], lunch: [], dinner: [], snacks: [] },
    },
    lastDeloadSessionCount: 0,
    deloadUntil: null,
  };
  if (!raw) return defaults;
  const parsed = JSON.parse(raw);
  // merge in overrides for anyone upgrading from a version without them
  if (!parsed.overrides) parsed.overrides = defaults.overrides;
  if (parsed.lastDeloadSessionCount === undefined) parsed.lastDeloadSessionCount = 0;
  if (parsed.deloadUntil === undefined) parsed.deloadUntil = null;
  return parsed;
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
let state = loadState();

function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
function dayEntry(key) {
  if (!state.log[key]) {
    state.log[key] = { cardio: [], gym: { completedExerciseIds: [], weights: {}, reps: {}, sessionComplete: false, skipped: false }, meals: { breakfast: false, lunch: false, dinner: false, snack: false }, customFood: [], steps: null };
  }
  if (!state.log[key].meals) {
    state.log[key].meals = { breakfast: false, lunch: false, dinner: false, snack: false };
  }
  if (!state.log[key].customFood) {
    state.log[key].customFood = [];
  }
  if (state.log[key].steps === undefined) {
    state.log[key].steps = null;
  }
  if (state.log[key].gym.skipped === undefined) {
    state.log[key].gym.skipped = false;
  }
  if (!state.log[key].gym.reps) {
    state.log[key].gym.reps = {};
  }
  if (!state.log[key].mealOverrides) {
    state.log[key].mealOverrides = {};
  }
  if (state.log[key].gym.rpe === undefined) {
    state.log[key].gym.rpe = null;
  }
  if (state.log[key].gym.notes === undefined) {
    state.log[key].gym.notes = "";
  }
  return state.log[key];
}

// ---------- ACTIVITY LEVEL ----------
const ACTIVITY_LEVELS = {
  sedentary: { label: "Desk-bound (mostly sitting)", multiplier: 1.2, stepRange: [0, 6000] },
  moderate: { label: "Some walking", multiplier: 1.3, stepRange: [6000, 10000] },
  active: { label: "On my feet a lot", multiplier: 1.45, stepRange: [10000, Infinity] },
};
function averageSteps(days = 7) {
  const entries = Object.values(state.log).filter((e) => typeof e.steps === "number").slice(-days);
  if (!entries.length) return null;
  return Math.round(entries.reduce((sum, e) => sum + e.steps, 0) / entries.length);
}

// ---------- DATE NAVIGATION ----------
let selectedDate = new Date();
function selectedKey() {
  return todayKey(selectedDate);
}
function isViewingToday() {
  return selectedKey() === todayKey();
}
function changeSelectedDate(deltaDays) {
  const d = new Date(selectedDate);
  d.setDate(d.getDate() + deltaDays);
  selectedDate = d;
  renderAll();
}
function jumpToToday() {
  selectedDate = new Date();
  renderAll();
}
function slotMealId(entry, slot, dateForPlan) {
  if (entry.mealOverrides[slot]) return entry.mealOverrides[slot];
  const dayPlan = PLAN_CYCLE[cycleIndex(dateForPlan)];
  return dayPlan[slot];
}
function slotsEatenKcal(entry, dateForPlan = selectedDate) {
  const slotNames = ["breakfast", "lunch", "dinner", "snack"];
  const planned = slotNames.reduce((sum, slot) => {
    const id = slotMealId(entry, slot, dateForPlan);
    return sum + (entry.meals[slot] ? findMeal(id).meal.kcal : 0);
  }, 0);
  const custom = entry.customFood.reduce((sum, f) => sum + f.kcal, 0);
  return planned + custom;
}
function renderDateNav() {
  const d = selectedDate;
  const label = `${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()]} ${d.getDate()} ${d.toLocaleString("en-GB",{month:"short"})}`;
  el("dateNav").innerHTML = `
    <button id="prevDayBtn" class="nav-arrow" aria-label="Previous day">‹</button>
    <button id="dateLabelBtn" class="date-label">${label}${isViewingToday() ? "" : " <span class=\"not-today\">(not today)</span>"}</button>
    <button id="nextDayBtn" class="nav-arrow" aria-label="Next day">›</button>
  `;
  document.getElementById("prevDayBtn").addEventListener("click", () => changeSelectedDate(-1));
  document.getElementById("nextDayBtn").addEventListener("click", () => changeSelectedDate(1));
  document.getElementById("dateLabelBtn").addEventListener("click", () => jumpToToday());
}

// ---------- PROGRAMME LOOKUP ----------
function templateForDate(d = new Date()) {
  const dow = DAY_NAMES[d.getDay()];
  return WEEK_TEMPLATE.find((t) => t.day === dow);
}

// ---------- CALORIE / MACRO ENGINE ----------
function calcBMR({ weightKg, heightCm, age, sex }) {
  if (!weightKg || !heightCm || !age) return null;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "female" ? base - 161 : base + 5;
}

function calcTargetsForDay(key) {
  const s = state.settings;
  const bmr = calcBMR(s);
  const entry = dayEntry(key);
  const tmpl = templateForDate(new Date(key));

  if (!bmr) return null;

  const baselineTDEE = bmr * (ACTIVITY_LEVELS[s.activityLevel || "moderate"].multiplier);
  const gymBurn = tmpl.type !== "rest" && entry.gym.skipped ? 0 : tmpl.type !== "rest" && entry.gym.sessionComplete ? 280 : tmpl.type !== "rest" ? 220 : 0;
  const cardioBurn = entry.cardio.reduce((sum, c) => sum + (c.kcal ?? (CARDIO[c.type]?.kcalPerMin || 9) * c.minutes), 0);

  const maintenance = baselineTDEE + gymBurn + cardioBurn;
  const deficit = s.deficitKcal ?? 300;
  const target = Math.round(maintenance - deficit); // flat deficit — set in Settings

  const protein = Math.round(s.weightKg * 2.2);
  const fat = Math.round(s.weightKg * 0.8);
  const proteinKcal = protein * 4;
  const fatKcal = fat * 9;
  const carbs = Math.max(0, Math.round((target - proteinKcal - fatKcal) / 4));

  let mealPlan;
  if (target > 2600) mealPlan = "3 meals + 2 snacks";
  else if (target > 2200) mealPlan = "3 meals + 1 snack";
  else mealPlan = "3 meals";

  return { bmr: Math.round(bmr), maintenance: Math.round(maintenance), target, protein, fat, carbs, mealPlan, gymBurn, cardioBurn };
}

// ---------- ADAPTIVE GYM SESSION ----------
function lastWeightFor(exId, beforeKey) {
  const keys = Object.keys(state.log)
    .filter((k) => k < beforeKey && state.log[k].gym.weights[exId])
    .sort()
    .reverse();
  if (!keys.length) return null;
  const k = keys[0];
  return { weight: state.log[k].gym.weights[exId], reps: state.log[k].gym.reps[exId] || null, date: k };
}
function bestWeightFor(exId, excludeKey) {
  let best = null;
  Object.keys(state.log).forEach((k) => {
    if (k === excludeKey) return;
    const w = state.log[k].gym.weights[exId];
    if (w && (!best || parseFloat(w) > best)) best = parseFloat(w);
  });
  return best;
}
function parseRepRange(repsStr) {
  const match = repsStr.match(/(\d+)(?:-(\d+))?/);
  if (!match) return null;
  const lo = parseInt(match[1], 10);
  const hi = match[2] ? parseInt(match[2], 10) : lo;
  return [lo, hi];
}
function suggestNext(ex, last) {
  if (!last) return null;
  const range = parseRepRange(ex.reps);
  const increment = ex.cutFirst ? 1 : 2.5; // main lifts jump more than accessories
  if (!range || !last.reps) {
    return { text: `Try ${last.weight}kg again, or +${increment}kg if it felt easy` };
  }
  const [lo, hi] = range;
  if (last.reps >= hi) {
    return { text: `Try ${fmt(last.weight + increment)}kg for ${lo} reps — you hit the top of the range last time` };
  }
  return { text: `Try ${last.weight}kg for ${last.reps + 1} reps — same weight, one more rep than last time` };
}
function baseExercisesFor(type) {
  const withOverrides = SESSIONS[type].exercises
    .filter((e) => !(state.overrides.exercises[e.id] && state.overrides.exercises[e.id].removed))
    .map((e) => {
      const o = state.overrides.exercises[e.id];
      return o ? { ...e, sets: o.sets ?? e.sets, reps: o.reps ?? e.reps, cue: o.cue ?? e.cue } : e;
    });
  const custom = (state.overrides.customExercises[type] || []);
  return [...withOverrides, ...custom];
}

function isDeloadActive(key) {
  return !!(state.deloadUntil && key <= state.deloadUntil);
}
function sessionsSinceDeload() {
  return totalSessionsCompleted() - (state.lastDeloadSessionCount || 0);
}
function adjustedSessionFor(key) {
  const tmpl = templateForDate(new Date(key));
  if (tmpl.type === "rest") return null;
  const session = SESSIONS[tmpl.type];
  const entry = dayEntry(key);
  const cardioMinutes = entry.cardio.reduce((sum, c) => sum + c.minutes, 0);
  const { dropExercises, note } = cardioAdjustmentLevel(cardioMinutes);

  const allExercises = baseExercisesFor(tmpl.type);
  const core = allExercises.filter((e) => !e.cutFirst);
  let accessory = allExercises.filter((e) => e.cutFirst);
  if (dropExercises > 0) {
    const keep = Math.max(1, accessory.length - dropExercises);
    accessory = accessory.slice(0, keep);
  }
  const reacclimating = state.settings.phase === "reacclimation";
  const deloading = isDeloadActive(key);
  const exercises = [...core, ...accessory].map((e) => {
    let sets = e.sets;
    if (reacclimating) sets = Math.max(2, sets - 1);
    if (deloading) sets = Math.max(2, Math.ceil(sets * 0.6));
    return { ...e, sets };
  });

  return {
    type: tmpl.type,
    label: session.label,
    focus: session.focus,
    warmup: session.warmup,
    exercises,
    deloading,
    adjustedNote: dropExercises > 0 ? note : null,
    reacclimating,
  };
}

// ---------- SHOPPING LIST / MEAL PLAN CYCLE ----------
// Decoupled from day-of-week so it doesn't repeat the same meal on
// the same weekday every time — a 21-day (3-week) rotation instead.
const BREAKFAST_IDS = ["b1", "b2", "b3", "b4", "b5", "b6"];
const LUNCH_IDS = ["l1", "l2", "l3", "l4", "l5", "l6"];
const DINNER_IDS = ["d1", "d2", "d3", "d4", "d5", "d6"];
const SNACK_IDS = ["s1", "s2", "s3", "s4", "s5", "s6"];
const PLAN_CYCLE = Array.from({ length: 21 }, (_, i) => ({
  breakfast: BREAKFAST_IDS[i % 6],
  lunch: LUNCH_IDS[(i + 2) % 6],
  dinner: DINNER_IDS[(i + 4) % 6],
  snack: SNACK_IDS[(i + 1) % 6],
}));
function daysSinceEpoch(d) {
  return Math.floor(d.getTime() / 86400000);
}
function cycleIndex(d) {
  const n = PLAN_CYCLE.length;
  return ((daysSinceEpoch(d) % n) + n) % n;
}
const BATCH_YIELD = 5;

function findMeal(id) {
  for (const cat of Object.keys(MEALS)) {
    const m = MEALS[cat].find((x) => x.id === id);
    if (m) return { meal: m, cat };
  }
  for (const cat of Object.keys(state.overrides.customMeals)) {
    const m = state.overrides.customMeals[cat].find((x) => x.id === id);
    if (m) return { meal: m, cat, custom: true };
  }
  return null;
}
function mealsInCategory(cat) {
  return [...MEALS[cat], ...state.overrides.customMeals[cat]];
}

function generateShoppingList(days = 7, startDate = selectedDate) {
  const counts = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const entry = dayEntry(todayKey(d));
    ["breakfast", "lunch", "dinner", "snack"].forEach((slot) => {
      const id = slotMealId(entry, slot, d);
      counts[id] = (counts[id] || 0) + 1;
    });
  }

  const totals = {};
  Object.entries(counts).forEach(([id, count]) => {
    const found = findMeal(id);
    if (!found) return;
    const { meal, cat } = found;
    const isBatch = cat === "lunch" || cat === "dinner";
    const multiplier = isBatch ? Math.ceil(count / BATCH_YIELD) : count;
    meal.ingredients.forEach((ing) => {
      const cleanUnit = ing.unit.replace(/\s*\(batch\)\s*/, "").trim();
      const key = `${ing.item}__${cleanUnit}`;
      if (!totals[key]) totals[key] = { item: ing.item, unit: cleanUnit, qty: 0 };
      totals[key].qty += ing.qty * multiplier;
    });
  });


  return Object.values(totals).sort((a, b) => a.item.localeCompare(b.item));
}

// ---------- ADAPTIVE DEFICIT (based on actual weight trend) ----------
// Target rate tuned for your goal: slow, muscle-sparing loss, not a big cut.
const TARGET_WEEKLY_LOSS_MIN = 0.15; // kg/week
const TARGET_WEEKLY_LOSS_MAX = 0.4; // kg/week
const DEFICIT_STEP = 150; // kcal adjustment per nudge
const DEFICIT_FLOOR = 0;
const DEFICIT_CEIL = 600;

function suggestDeficitAdjustment() {
  const wl = [...state.weightLog].sort((a, b) => new Date(a.date) - new Date(b.date));
  if (wl.length < 2) return null;
  const latest = wl[wl.length - 1];
  // find the earliest entry at least 5 days before latest, to get a stable weekly rate
  const anchor = [...wl].reverse().find((w) => w !== latest && (new Date(latest.date) - new Date(w.date)) / 86400000 >= 5);
  if (!anchor) return null;

  const days = (new Date(latest.date) - new Date(anchor.date)) / 86400000;
  const weeklyRate = ((latest.kg - anchor.kg) / days) * 7; // negative = losing
  const currentDeficit = state.settings.deficitKcal ?? 300;

  let suggestion = null;
  if (weeklyRate > -TARGET_WEEKLY_LOSS_MIN) {
    // not losing enough (or gaining) — need a bit more deficit
    suggestion = { direction: "increase", newDeficit: Math.min(DEFICIT_CEIL, currentDeficit + DEFICIT_STEP) };
  } else if (weeklyRate < -TARGET_WEEKLY_LOSS_MAX) {
    // losing too fast for a controlled, muscle-sparing cut — ease off
    suggestion = { direction: "decrease", newDeficit: Math.max(DEFICIT_FLOOR, currentDeficit - DEFICIT_STEP) };
  }

  return { weeklyRate, days: Math.round(days), currentDeficit, suggestion };
}

// ---------- RENDERING ----------
function fmt(n) {
  return Math.round(n * 10) / 10;
}

function renderDashboard() {
  const key = selectedKey();
  const tmpl = templateForDate(selectedDate);
  const targets = calcTargetsForDay(key);
  const entry = dayEntry(key);

  let html = "";
  if (isViewingToday()) {
    const lastActive = lastActivityDate();
    const gap = lastActive ? daysSince(lastActive) : null;
    if (gap !== null && gap >= 4) {
      html += `<div class="notice" style="margin-bottom:14px;">Nothing logged in ${gap} days — no pressure, just pick up whenever suits. Everything's still here.</div>`;
    }
    if (isDeloadActive(key)) {
      html += `<div class="notice" style="margin-bottom:14px;">Deload week — sets trimmed back automatically until ${state.deloadUntil}. Go lighter, let things recover.</div>`;
    } else if (sessionsSinceDeload() >= 20) {
      html += `<div class="card" style="margin-bottom:14px;">
        <h3>Worth a deload week?</h3>
        <p class="hint">${sessionsSinceDeload()} sessions since your last one — a lighter week roughly every 5-6 weeks lets joints and connective tissue catch up, especially coming back from time off.</p>
        <button id="startDeloadBtn" class="primary-btn">Start a deload week (7 days, lighter sets)</button>
      </div>`;
    }
  }

  html += `<div class="stat-row">
    <div class="stat-block">
      <span class="stat-label">${isViewingToday() ? "Today" : "Session"}</span>
      <span class="stat-value">${tmpl.type === "rest" ? "Rest day" : entry.gym.skipped ? "Swapped" : SESSIONS[tmpl.type].label}</span>
    </div>
    <div class="stat-block">
      <span class="stat-label">Phase</span>
      <span class="stat-value">${state.settings.phase === "reacclimation" ? "Reacclimation" : "Standard"}</span>
    </div>
  </div>`;

  if (!targets) {
    html += `<p class="notice">Add your stats in <strong>Settings</strong> to see your daily calorie and macro targets.</p>`;
  } else {
    html += `<div class="card">
      <h3>Today's targets</h3>
      <div class="macro-grid">
        <div><span class="macro-num">${targets.target}</span><span class="macro-lbl">kcal</span></div>
        <div><span class="macro-num">${targets.protein}g</span><span class="macro-lbl">protein</span></div>
        <div><span class="macro-num">${targets.carbs}g</span><span class="macro-lbl">carbs</span></div>
        <div><span class="macro-num">${targets.fat}g</span><span class="macro-lbl">fat</span></div>
      </div>
      <p class="hint">Meal structure: ${targets.mealPlan}${targets.cardioBurn > 0 ? ` — includes +${targets.cardioBurn} kcal from today's cardio` : ""}</p>
      <p class="hint">Eaten so far: <strong>${(slotsEatenKcal(entry))} kcal</strong> — log meals on the Meals tab</p>
    </div>`;
  }

  const wl = state.weightLog;
  const latest = wl[wl.length - 1];
  const weekAgo = [...wl].reverse().find((w) => (Date.now() - new Date(w.date)) / 86400000 >= 6);
  if (isViewingToday()) {
    html += `<div class="card">
      <h3>Weight</h3>
      ${latest ? `<div class="stat-row"><div class="stat-block"><span class="stat-label">Latest</span><span class="stat-value">${latest.kg}kg</span></div>
        <div class="stat-block"><span class="stat-label">Vs ~7 days ago</span><span class="stat-value">${weekAgo ? (latest.kg - weekAgo.kg > 0 ? "+" : "") + fmt(latest.kg - weekAgo.kg) + "kg" : "—"}</span></div></div>`
        : `<p class="hint">Log your weight from the Settings tab to start tracking trend.</p>`}
    </div>`;
  }

  const adj = isViewingToday() ? suggestDeficitAdjustment() : null;
  if (adj) {
    const rateTxt = `${adj.weeklyRate <= 0 ? "" : "+"}${fmt(adj.weeklyRate)}kg/week (over ${adj.days} days)`;
    if (adj.suggestion) {
      const dirTxt = adj.suggestion.direction === "increase"
        ? "Not much is shifting — worth eating a little less."
        : "That's coming off faster than the slow, muscle-sparing pace you wanted — worth eating a little more.";
      html += `<div class="card">
        <h3>Weekly check-in</h3>
        <p class="hint">Trend: ${rateTxt}</p>
        <p class="notice">${dirTxt} Suggested deficit: ${adj.currentDeficit} → <strong>${adj.suggestion.newDeficit} kcal</strong>.</p>
        <button id="applyDeficitBtn" class="primary-btn">Apply ${adj.suggestion.newDeficit} kcal deficit</button>
      </div>`;
    } else {
      html += `<div class="card">
        <h3>Weekly check-in</h3>
        <p class="hint">Trend: ${rateTxt} — right in the target range. Current deficit (${adj.currentDeficit} kcal) is working, no change needed.</p>
      </div>`;
    }
  }

  html += `<div class="card">
    <h3>Log cardio for ${isViewingToday() ? "today" : "this day"}</h3>
    <form id="cardioForm" class="inline-form">
      <select id="cardioType"><option value="run">Run</option><option value="padel">Padel</option></select>
      <input id="cardioMinutes" type="number" min="1" placeholder="minutes" required />
      <input id="cardioKcal" type="number" min="0" placeholder="kcal (Watch, optional)" />
      <button type="submit">Log session</button>
    </form>
    <ul class="log-list">
      ${entry.cardio.map((c, i) => `<li>${CARDIO[c.type].label} — ${c.minutes} min · ${c.kcal ?? Math.round((CARDIO[c.type]?.kcalPerMin || 9) * c.minutes)} kcal${c.kcal != null ? " (Watch)" : " (estimated)"} <button data-remove-cardio="${i}" class="link-btn">remove</button></li>`).join("") || "<li class='muted'>Nothing logged today</li>"}
    </ul>
  </div>`;

  html += `<div class="card">
    <h3>Log steps</h3>
    <p class="hint">Log this once you know it — usually end of day. Used to check your activity-level setting is realistic, not to change today's target retroactively.</p>
    <form id="stepsForm" class="inline-form">
      <input id="stepsEntry" type="number" min="0" placeholder="steps" value="${entry.steps ?? ""}" required />
      <button type="submit">Save</button>
    </form>
  </div>`;

  el("dashboard").innerHTML = html;
  const deloadBtn = document.getElementById("startDeloadBtn");
  if (deloadBtn) {
    deloadBtn.addEventListener("click", () => {
      const until = new Date();
      until.setDate(until.getDate() + 7);
      state.deloadUntil = todayKey(until);
      state.lastDeloadSessionCount = totalSessionsCompleted();
      saveState();
      renderDashboard();
      renderWorkout();
    });
  }
  const applyBtn = document.getElementById("applyDeficitBtn");
  if (applyBtn) {
    applyBtn.addEventListener("click", () => {
      state.settings.deficitKcal = adj.suggestion.newDeficit;
      saveState();
      renderDashboard();
      renderSettings();
    });
  }
  document.getElementById("cardioForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const type = document.getElementById("cardioType").value;
    const minutes = parseInt(document.getElementById("cardioMinutes").value, 10);
    const kcalRaw = document.getElementById("cardioKcal").value;
    const kcal = kcalRaw !== "" ? parseInt(kcalRaw, 10) : undefined;
    if (!minutes) return;
    const entryToLog = { type, minutes };
    if (kcal !== undefined) entryToLog.kcal = kcal;
    dayEntry(key).cardio.push(entryToLog);
    saveState();
    renderDashboard();
    renderWorkout();
  });
  document.getElementById("stepsForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const steps = parseInt(document.getElementById("stepsEntry").value, 10);
    if (isNaN(steps)) return;
    dayEntry(key).steps = steps;
    saveState();
    renderDashboard();
    renderSettings();
  });
  document.querySelectorAll("[data-remove-cardio]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = parseInt(btn.dataset.removeCardio, 10);
      dayEntry(key).cardio.splice(i, 1);
      saveState();
      renderDashboard();
      renderWorkout();
    });
  });
}

function renderWorkout() {
  const key = selectedKey();
  const session = adjustedSessionFor(key);
  const entry = dayEntry(key);

  if (!session) {
    el("workout").innerHTML = `<div class="card"><h3>Rest day</h3><p>No gym session programmed. Log any cardio from the Dashboard tab.</p></div>`;
    return;
  }

  if (entry.gym.skipped) {
    el("workout").innerHTML = `<div class="card">
      <h3>${session.label} — swapped</h3>
      <p class="hint">You've swapped this session out (padel, run, or just a rest). It won't count as missed, and today's calories have been adjusted down to reflect no gym session.</p>
      <button id="undoSkipBtn" class="primary-btn">Undo — I'll do the session after all</button>
    </div>`;
    document.getElementById("undoSkipBtn").addEventListener("click", () => {
      entry.gym.skipped = false;
      saveState();
      renderWorkout();
      renderDashboard();
    });
    return;
  }

  let html = `<div class="card">
    <h3>${session.label}${session.reacclimating ? " · Reacclimation" : ""}${session.deloading ? " · Deload" : ""}</h3>
    <p class="hint">${session.focus}</p>
    ${session.adjustedNote ? `<p class="notice">Adjusted for today's cardio: ${session.adjustedNote}</p>` : ""}
    <button id="skipSessionBtn" class="link-btn" style="margin-top:6px;">Not doing this session today (played padel / going for a run instead) →</button>
    <details>
      <summary>Warm-up</summary>
      <ul>${session.warmup.map((w) => `<li>${w}</li>`).join("")}</ul>
      ${session.exercises.filter((e) => !e.cutFirst).map((e) => {
        const ref = entry.gym.weights[e.id] ? parseFloat(entry.gym.weights[e.id]) : (lastWeightFor(e.id, key) || {}).weight;
        if (!ref) return "";
        const w = parseFloat(ref);
        const steps = [[0.5, 8], [0.7, 5], [0.85, 3]].map(([pct, reps]) => `${Math.round(w * pct / 2.5) * 2.5}kg × ${reps}`);
        return `<p class="hint" style="margin-top:6px;"><strong>${e.name} ramp-up</strong> (based on ${w}kg): ${steps.join(" → ")} → working weight</p>`;
      }).join("")}
    </details>
  </div>`;

  html += `<div class="card"><h3>Exercises</h3><div class="exercise-list">`;
  session.exercises.forEach((ex) => {
    const done = entry.gym.completedExerciseIds.includes(ex.id);
    const weight = entry.gym.weights[ex.id] || "";
    const repsAchieved = entry.gym.reps[ex.id] || "";
    const last = lastWeightFor(ex.id, key);
    const suggestion = suggestNext(ex, last);
    const currentWeight = entry.gym.weights[ex.id];
    const prevBest = bestWeightFor(ex.id, key);
    const isPR = currentWeight && prevBest && parseFloat(currentWeight) > prevBest;
    html += `<div class="exercise ${done ? "done" : ""}">
      <label class="exercise-check">
        <input type="checkbox" data-ex="${ex.id}" ${done ? "checked" : ""} />
        <span class="ex-name">${ex.name}${isPR ? ` <span class="pr-badge">🏆 new best</span>` : ""}</span>
      </label>
      <div class="ex-meta">${ex.sets} sets × ${ex.reps} · rest ${ex.rest}${last ? ` · <span class="last-weight">last time: ${last.weight}kg${last.reps ? ` × ${last.reps}` : ""} (${last.date})</span>` : ""}</div>
      <div class="ex-cue">${ex.cue}</div>
      ${suggestion ? `<div class="ex-suggestion">${suggestion.text}</div>` : ""}
      <div class="ex-weight">
        <label>Weight (kg)</label>
        <input type="number" data-weight="${ex.id}" value="${weight}" placeholder="kg" step="0.5" />
        <label>Reps (top set)</label>
        <input type="number" data-reps="${ex.id}" value="${repsAchieved}" placeholder="reps" min="0" />
      </div>
    </div>`;
  });
  html += `</div>
    <label class="rpe-label">How hard did that feel? (RPE 1-10)
      <input type="number" id="rpeInput" min="1" max="10" value="${entry.gym.rpe ?? ""}" placeholder="e.g. 7" />
    </label>
    <label class="rpe-label">Session notes <span class="hint" style="display:inline;">(how it felt, anything niggling, etc.)</span>
      <textarea id="sessionNotes" rows="2" class="notes-textarea">${entry.gym.notes || ""}</textarea>
    </label>
    <button id="completeSessionBtn" class="primary-btn">${entry.gym.sessionComplete ? "Session marked complete ✓" : "Mark session complete"}</button>
  </div>`;

  el("workout").innerHTML = html;

  document.querySelectorAll("[data-ex]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const id = cb.dataset.ex;
      const list = entry.gym.completedExerciseIds;
      const idx = list.indexOf(id);
      if (cb.checked && idx === -1) list.push(id);
      if (!cb.checked && idx !== -1) list.splice(idx, 1);
      saveState();
    });
  });
  document.querySelectorAll("[data-weight]").forEach((inp) => {
    inp.addEventListener("change", () => {
      entry.gym.weights[inp.dataset.weight] = inp.value;
      saveState();
      renderWorkout();
    });
  });
  document.querySelectorAll("[data-reps]").forEach((inp) => {
    inp.addEventListener("change", () => {
      entry.gym.reps[inp.dataset.reps] = parseInt(inp.value, 10) || null;
      saveState();
    });
  });
  document.getElementById("completeSessionBtn").addEventListener("click", () => {
    entry.gym.sessionComplete = true;
    saveState();
    renderWorkout();
    renderDashboard();
  });
  document.getElementById("rpeInput").addEventListener("change", (e) => {
    entry.gym.rpe = e.target.value ? parseInt(e.target.value, 10) : null;
    saveState();
  });
  document.getElementById("sessionNotes").addEventListener("change", (e) => {
    entry.gym.notes = e.target.value;
    saveState();
  });
  document.getElementById("skipSessionBtn").addEventListener("click", () => {
    entry.gym.skipped = true;
    saveState();
    renderWorkout();
    renderDashboard();
  });
}

function renderMeals() {
  const key = selectedKey();
  const entry = dayEntry(key);
  const targets = calcTargetsForDay(key);
  const slots = [
    { slot: "breakfast", id: slotMealId(entry, "breakfast", selectedDate) },
    { slot: "lunch", id: slotMealId(entry, "lunch", selectedDate) },
    { slot: "dinner", id: slotMealId(entry, "dinner", selectedDate) },
    { slot: "snack", id: slotMealId(entry, "snack", selectedDate) },
  ];
  const eatenKcal = slotsEatenKcal(entry, selectedDate);

  let html = `<div class="card">
    <h3>Food diary — ${isViewingToday() ? "today" : selectedDate.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"short"})}</h3>
    <p class="hint">Tick off each meal as you eat it, or swap it for something else from the dropdown first.</p>
    <div class="exercise-list">
      ${slots.map((s) => {
        const m = findMeal(s.id).meal;
        const done = entry.meals[s.slot];
        const catForSlot = s.slot === "snack" ? "snacks" : s.slot;
        return `<div class="exercise ${done ? "done" : ""}">
          <label class="exercise-check">
            <input type="checkbox" data-meal-slot="${s.slot}" ${done ? "checked" : ""} />
            <span class="ex-name">${s.slot[0].toUpperCase() + s.slot.slice(1)}: ${m.name}</span>
          </label>
          <div class="ex-meta">${m.kcal} kcal · P${m.protein} C${m.carbs} F${m.fat}</div>
          <select data-swap-slot="${s.slot}" class="swap-select">
            ${mealsInCategory(catForSlot).map((opt) => `<option value="${opt.id}" ${opt.id === s.id ? "selected" : ""}>${opt.name}</option>`).join("")}
          </select>
        </div>`;
      }).join("")}
    </div>

    <h3 style="margin-top:18px;">Off-plan? Log it here</h3>
    <p class="hint">Anything you ate that isn't on the plan — takeaway, snack, a different meal entirely. Only calories are required.</p>
    <form id="customFoodForm" class="settings-form">
      <label>What was it <input type="text" id="foodName" placeholder="e.g. chicken kebab" required /></label>
      <div class="stat-row">
        <label style="flex:1;">Calories <input type="number" id="foodKcal" min="0" required /></label>
        <label style="flex:1;">Protein g <input type="number" id="foodProtein" min="0" /></label>
      </div>
      <button type="submit" class="primary-btn">Add to diary</button>
    </form>
    <ul class="log-list" style="margin-top:10px;">
      ${entry.customFood.map((f, i) => `<li>${f.name} — ${f.kcal} kcal${f.protein ? ` · P${f.protein}` : ""} <button data-remove-food="${i}" class="link-btn">remove</button></li>`).join("") || "<li class='muted'>Nothing off-plan logged</li>"}
    </ul>

    ${targets ? `<p class="hint" style="margin-top:10px;">Eaten so far: <strong>${eatenKcal} kcal</strong> of ${targets.target} kcal target</p>` : ""}
  </div>`;

  html += `<div class="card">
    <h3>Kitchen basics — read this first</h3>
    <p class="hint">Every recipe below is written assuming zero prior cooking knowledge. If a term trips you up, it's explained here.</p>
    <details class="recipe" open>
      <summary>What you'll need</summary>
      <ul>${KITCHEN_BASICS.equipment.map((e) => `<li>${e}</li>`).join("")}</ul>
    </details>
    <details class="recipe">
      <summary>Terms used in the recipes</summary>
      <ul>${KITCHEN_BASICS.terms.map((t) => `<li><strong>${t.term}:</strong> ${t.meaning}</li>`).join("")}</ul>
    </details>
    <details class="recipe">
      <summary>Storing, freezing & reheating</summary>
      <ul>${KITCHEN_BASICS.storage.map((s) => `<li>${s}</li>`).join("")}</ul>
    </details>
  </div>`;

  html += `<div class="card">
    <h3>Upcoming 7 days</h3>
    <p class="hint">Rotates over 3 weeks before repeating, so it shouldn't feel like the same few meals on loop. Swap any day for another meal of the same type if you like — the shopping list below already covers what's coming up.</p>
    <table class="plan-table">
      <thead><tr><th>Day</th><th>Breakfast</th><th>Lunch</th><th>Dinner</th><th>Snack</th></tr></thead>
      <tbody>
        ${Array.from({ length: 7 }, (_, i) => {
          const d = new Date(selectedDate);
          d.setDate(d.getDate() + i);
          const p = PLAN_CYCLE[cycleIndex(d)];
          const label = i === 0 ? (isViewingToday() ? "Today" : "This day") : d.toLocaleDateString("en-GB", { weekday: "short" });
          return `<tr>
            <td>${label}</td>
            <td>${findMeal(p.breakfast).meal.name}</td>
            <td>${findMeal(p.lunch).meal.name}</td>
            <td>${findMeal(p.dinner).meal.name}</td>
            <td>${findMeal(p.snack).meal.name}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  </div>`;

  html += `<div class="card"><h3>Shopping list — next 7 days</h3><ul class="shopping-list">`;
  generateShoppingList().forEach((item) => {
    html += `<li><span>${item.item}</span><span class="qty">${fmt(item.qty)} ${item.unit}</span></li>`;
  });
  html += `</ul></div>`;

  ["breakfast", "lunch", "dinner", "snacks"].forEach((cat) => {
    html += `<div class="card"><h3>${cat[0].toUpperCase() + cat.slice(1)} — recipes</h3>`;
    MEALS[cat].forEach((m) => {
      html += `<details class="recipe">
        <summary>${m.name} <span class="kcal-tag">${m.kcal} kcal · P${m.protein} C${m.carbs} F${m.fat}</span></summary>
        ${m.batchNote ? `<p class="hint">${m.batchNote}</p>` : ""}
        <p class="ingredients-label">Ingredients</p>
        <ul>${m.ingredients.map((i) => `<li>${i.qty}${i.unit} ${i.item}</li>`).join("")}</ul>
        <p class="ingredients-label">Method</p>
        <ol>${m.method.map((s) => `<li>${s}</li>`).join("")}</ol>
      </details>`;
    });
    html += `</div>`;
  });

  el("meals").innerHTML = html;
  document.querySelectorAll("[data-meal-slot]").forEach((cb) => {
    cb.addEventListener("change", () => {
      entry.meals[cb.dataset.mealSlot] = cb.checked;
      saveState();
      renderMeals();
      renderDashboard();
    });
  });
  document.querySelectorAll("[data-swap-slot]").forEach((sel) => {
    sel.addEventListener("change", () => {
      const defaultId = PLAN_CYCLE[cycleIndex(selectedDate)][sel.dataset.swapSlot];
      if (sel.value === defaultId) delete entry.mealOverrides[sel.dataset.swapSlot];
      else entry.mealOverrides[sel.dataset.swapSlot] = sel.value;
      saveState();
      renderMeals();
      renderDashboard();
    });
  });
  document.getElementById("customFoodForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("foodName").value.trim();
    const kcal = parseInt(document.getElementById("foodKcal").value, 10);
    const proteinRaw = document.getElementById("foodProtein").value;
    if (!name || !kcal) return;
    const food = { name, kcal };
    if (proteinRaw !== "") food.protein = parseInt(proteinRaw, 10);
    entry.customFood.push(food);
    saveState();
    renderMeals();
    renderDashboard();
  });
  document.querySelectorAll("[data-remove-food]").forEach((btn) => {
    btn.addEventListener("click", () => {
      entry.customFood.splice(parseInt(btn.dataset.removeFood, 10), 1);
      saveState();
      renderMeals();
      renderDashboard();
    });
  });
}

// ---------- PROGRESS PHOTOS (IndexedDB — too large for localStorage) ----------
const PHOTO_DB_NAME = "matchdayPhotos";
const PHOTO_STORE = "photos";
function openPhotoDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PHOTO_DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(PHOTO_STORE, { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function addPhoto(dataUrl, date) {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).add({ date, dataUrl });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
async function getAllPhotos() {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readonly");
    const req = tx.objectStore(PHOTO_STORE).getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => (a.date < b.date ? 1 : -1)));
    req.onerror = () => reject(req.error);
  });
}
async function deletePhoto(id) {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- WEIGHT CHART (hand-rolled SVG, no dependencies) ----------
function weightChartSVG() {
  const wl = [...state.weightLog].sort((a, b) => new Date(a.date) - new Date(b.date));
  if (wl.length < 2) return null;
  const w = 600, h = 200, padX = 30, padY = 20;
  const weights = wl.map((p) => p.kg);
  const min = Math.min(...weights) - 0.5;
  const max = Math.max(...weights) + 0.5;
  const xStep = (w - padX * 2) / (wl.length - 1);
  const yFor = (kg) => h - padY - ((kg - min) / (max - min || 1)) * (h - padY * 2);
  const points = wl.map((p, i) => `${padX + i * xStep},${yFor(p.kg)}`).join(" ");
  const first = wl[0], last = wl[wl.length - 1];
  return `<svg viewBox="0 0 ${w} ${h}" class="weight-chart">
    <line x1="${padX}" y1="${h - padY}" x2="${w - padX}" y2="${h - padY}" stroke="#2E2F33" />
    <polyline points="${points}" fill="none" stroke="#D62828" stroke-width="3" />
    ${wl.map((p, i) => `<circle cx="${padX + i * xStep}" cy="${yFor(p.kg)}" r="3.5" fill="#D62828" />`).join("")}
    <text x="${padX}" y="${h - 4}" fill="#8B8D91" font-size="11">${first.date}</text>
    <text x="${w - padX}" y="${h - 4}" fill="#8B8D91" font-size="11" text-anchor="end">${last.date}</text>
    <text x="${padX}" y="14" fill="#ECEDEE" font-size="12">${max.toFixed(1)}kg</text>
    <text x="${padX}" y="${h - padY - 4}" fill="#ECEDEE" font-size="12">${min.toFixed(1)}kg</text>
  </svg>`;
}

// ---------- CONSISTENCY ----------
function weekConsistency(refDate = new Date()) {
  const monday = new Date(refDate);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const today = todayKey();
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    const k = todayKey(d);
    const tmpl = templateForDate(d);
    const entry = dayEntry(k);
    let status;
    if (tmpl.type === "rest") status = "rest";
    else if (entry.gym.skipped) status = "swapped";
    else if (entry.gym.sessionComplete) status = "done";
    else if (k < today) status = "missed";
    else status = "pending";
    days.push({ label: d.toLocaleDateString("en-GB", { weekday: "narrow" }), status });
  }
  return days;
}
function totalSessionsCompleted() {
  return Object.values(state.log).filter((e) => e.gym && e.gym.sessionComplete).length;
}
function lastActivityDate() {
  const logDates = Object.keys(state.log).filter((k) => {
    const e = state.log[k];
    return e.gym.sessionComplete || e.gym.skipped || e.cardio.length || Object.values(e.meals).some(Boolean) || e.customFood.length;
  });
  const weightDates = state.weightLog.map((w) => w.date);
  const all = [...logDates, ...weightDates].sort();
  return all.length ? all[all.length - 1] : null;
}
function daysSince(dateStr) {
  return Math.round((new Date(todayKey()) - new Date(dateStr)) / 86400000);
}

async function renderProgress() {
  const week = weekConsistency();
  const statusIcon = { done: "●", swapped: "◐", missed: "✕", rest: "–", pending: "○" };
  const statusClass = { done: "dot-done", swapped: "dot-swapped", missed: "dot-missed", rest: "dot-rest", pending: "dot-pending" };
  let html = `<div class="card">
    <h3>Consistency</h3>
    <div class="week-dots">
      ${week.map((d) => `<div class="week-dot"><span class="dot ${statusClass[d.status]}">${statusIcon[d.status]}</span><span class="dot-label">${d.label}</span></div>`).join("")}
    </div>
    <p class="hint" style="margin-top:8px;">● done · ◐ swapped for cardio · ✕ missed · – rest day</p>
    <p class="hint">${totalSessionsCompleted()} sessions completed since you started.</p>
  </div>`;

  const chart = weightChartSVG();
  html += `<div class="card">
    <h3>Weight trend</h3>
    ${chart ? chart : `<p class="hint">Log weight a couple of times from Settings to see a trend line here.</p>`}
  </div>`;

  html += `<div class="card">
    <h3>Progress photos</h3>
    <p class="hint">Stored on this device only — these are not backed up automatically, use Export backup in Settings to include them.</p>
    <input type="file" id="photoInput" accept="image/*" capture="environment" style="margin-bottom:12px;" />
    <div id="photoGallery" class="photo-gallery"><p class="hint">Loading…</p></div>
  </div>`;

  el("progress").innerHTML = html;

  document.getElementById("photoInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      await addPhoto(reader.result, todayKey());
      e.target.value = "";
      renderProgress();
    };
    reader.readAsDataURL(file);
  });

  try {
    const photos = await getAllPhotos();
    const gallery = document.getElementById("photoGallery");
    if (!photos.length) {
      gallery.innerHTML = `<p class="hint">No photos yet.</p>`;
    } else {
      gallery.innerHTML = photos.map((p) => `
        <div class="photo-card">
          <img src="${p.dataUrl}" alt="Progress photo ${p.date}" />
          <div class="photo-meta"><span>${p.date}</span><button data-delete-photo="${p.id}" class="link-btn">remove</button></div>
        </div>`).join("");
      document.querySelectorAll("[data-delete-photo]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          await deletePhoto(parseInt(btn.dataset.deletePhoto, 10));
          renderProgress();
        });
      });
    }
  } catch (err) {
    document.getElementById("photoGallery").innerHTML = `<p class="hint">Couldn't load photos on this device/browser.</p>`;
  }
}

function renderSettings() {
  const s = state.settings;
  el("settings").innerHTML = `<div class="card">
    <h3>Your stats</h3>
    <form id="settingsForm" class="settings-form">
      <label>Weight (kg) <input type="number" id="weightKg" value="${s.weightKg || ""}" step="0.1" required /></label>
      <label>Height (cm) <input type="number" id="heightCm" value="${s.heightCm || ""}" required /></label>
      <label>Age <input type="number" id="age" value="${s.age || ""}" required /></label>
      <label>Sex
        <select id="sex">
          <option value="male" ${s.sex === "male" ? "selected" : ""}>Male</option>
          <option value="female" ${s.sex === "female" ? "selected" : ""}>Female</option>
        </select>
      </label>
      <label>Phase
        <select id="phase">
          <option value="reacclimation" ${s.phase === "reacclimation" ? "selected" : ""}>Reacclimation (first 2 weeks back)</option>
          <option value="standard" ${s.phase === "standard" ? "selected" : ""}>Standard</option>
        </select>
      </label>
      <label>Daily activity outside training
        <select id="activityLevel">
          ${Object.entries(ACTIVITY_LEVELS).map(([key, lvl]) => `<option value="${key}" ${s.activityLevel === key || (!s.activityLevel && key === "moderate") ? "selected" : ""}>${lvl.label}</option>`).join("")}
        </select>
      </label>
      <label>Daily calorie deficit (kcal below maintenance)
        <input type="number" id="deficitKcal" value="${s.deficitKcal ?? 300}" step="50" min="0" />
      </label>
      <button type="submit" class="primary-btn">Save</button>
    </form>
    ${(() => {
      const avg = averageSteps();
      if (!avg) return "";
      const lvl = ACTIVITY_LEVELS[s.activityLevel || "moderate"];
      const [lo, hi] = lvl.stepRange;
      if (avg >= lo && avg < hi) return `<p class="hint" style="margin-top:10px;">7-day step average: ${avg.toLocaleString()} — matches your "${lvl.label}" setting.</p>`;
      return `<p class="notice" style="margin-top:10px;">7-day step average: ${avg.toLocaleString()} — that doesn't match "${lvl.label}". Your real maintenance is probably ${avg < lo ? "lower" : "higher"} than the app is showing — consider changing the activity setting above.</p>`;
    })()}
  </div>
  <div class="card">
    <h3>Log today's weight</h3>
    <form id="weightForm" class="inline-form">
      <input id="weightEntry" type="number" step="0.1" placeholder="kg" required />
      <button type="submit">Log</button>
    </form>
    <ul class="log-list">
      ${[...state.weightLog].reverse().slice(0, 8).map((w) => `<li>${w.date} <span>${w.kg}kg</span></li>`).join("") || "<li class='muted'>No entries yet</li>"}
    </ul>
  </div>
  <div class="card">
    <h3>How targets are calculated</h3>
    <p class="hint">BMR via Mifflin-St Jeor, +30% for daily activity, plus an estimated burn for today's gym session and any cardio you log. Calories are then set at your chosen deficit below that total (default 300 kcal — a slow, muscle-sparing cut suited to spot-thinning over the stomach/chest rather than fast overall weight loss). Protein is fixed at 2.2g/kg, fat at 0.8g/kg, carbs fill the rest and shift higher on cardio days.</p>
  </div>
  <div class="card">
    <h3>Edit programme</h3>
    <p class="hint">Change sets/reps/cues, remove an exercise, or add your own — all saved on this device, no GitHub needed.</p>
    ${["push", "pull", "legs"].map((type) => `
      <h4 class="edit-group-title">${SESSIONS[type].label}</h4>
      ${baseExercisesFor(type).map((ex) => `
        <div class="edit-row">
          <span class="edit-row-name">${ex.name}</span>
          <div class="edit-row-fields">
            <input type="number" data-editset="${ex.id}" value="${ex.sets}" min="1" style="width:44px;" />
            <input type="text" data-editreps="${ex.id}" value="${ex.reps}" style="width:60px;" />
            <label class="edit-remove"><input type="checkbox" data-editremove="${ex.id}" /> remove</label>
          </div>
        </div>
      `).join("")}
    `).join("")}
    <button id="saveProgrammeBtn" class="primary-btn">Save changes</button>

    <h4 class="edit-group-title" style="margin-top:20px;">Add a custom exercise</h4>
    <form id="addExerciseForm" class="settings-form">
      <label>Session
        <select id="newExType"><option value="push">Push</option><option value="pull">Pull</option><option value="legs">Legs</option></select>
      </label>
      <label>Name <input type="text" id="newExName" required /></label>
      <div class="stat-row">
        <label style="flex:1;">Sets <input type="number" id="newExSets" value="3" min="1" required /></label>
        <label style="flex:1;">Reps <input type="text" id="newExReps" value="10-12" required /></label>
      </div>
      <label>Rest <input type="text" id="newExRest" value="60 sec" /></label>
      <label>Cue / form tip <input type="text" id="newExCue" /></label>
      <button type="submit" class="primary-btn">Add exercise</button>
    </form>

    <h4 class="edit-group-title" style="margin-top:20px;">Add a custom meal</h4>
    <p class="hint">Shows up in the swap dropdown on the Meals tab. Ingredients: one per line, e.g. "200 g chicken breast".</p>
    <form id="addMealForm" class="settings-form">
      <label>Category
        <select id="newMealCat"><option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Dinner</option><option value="snacks">Snack</option></select>
      </label>
      <label>Name <input type="text" id="newMealName" required /></label>
      <div class="stat-row">
        <label style="flex:1;">Kcal <input type="number" id="newMealKcal" min="0" required /></label>
        <label style="flex:1;">Protein g <input type="number" id="newMealProtein" min="0" /></label>
      </div>
      <div class="stat-row">
        <label style="flex:1;">Carbs g <input type="number" id="newMealCarbs" min="0" /></label>
        <label style="flex:1;">Fat g <input type="number" id="newMealFat" min="0" /></label>
      </div>
      <label>Ingredients (one per line)<textarea id="newMealIngredients" rows="3" style="background:var(--panel-2);border:1px solid var(--border);color:var(--text);border-radius:4px;padding:8px;"></textarea></label>
      <label>Method (one step per line)<textarea id="newMealMethod" rows="3" style="background:var(--panel-2);border:1px solid var(--border);color:var(--text);border-radius:4px;padding:8px;"></textarea></label>
      <button type="submit" class="primary-btn">Add meal</button>
    </form>
  </div>
  <div class="card">
    <h3>Backup</h3>
    <p class="hint">Downloads a file to this device — it does not touch GitHub or any account. Keep it somewhere safe (e.g. set Safari's download location to iCloud Drive) and use Import if you ever switch phones or clear browser data.</p>
    <button id="exportBtn" class="primary-btn">Export backup</button>
    <label style="display:block; margin-top:10px;">Import backup file
      <input type="file" id="importInput" accept="application/json" style="margin-top:6px;" />
    </label>
    <p id="importStatus" class="hint"></p>
  </div>`;

  document.getElementById("exportBtn").addEventListener("click", async () => {
    let photos = [];
    try { photos = await getAllPhotos(); } catch (err) { /* no photos yet, fine */ }
    const backup = { exportedAt: new Date().toISOString(), state, photos };
    const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `paincave-backup-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("importInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const status = document.getElementById("importStatus");
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const backup = JSON.parse(reader.result);
        if (!backup.state) throw new Error("Not a valid backup file");
        state = backup.state;
        saveState();
        if (Array.isArray(backup.photos) && backup.photos.length) {
          for (const p of backup.photos) {
            await addPhoto(p.dataUrl, p.date);
          }
        }
        status.textContent = "Backup restored.";
        renderAll();
      } catch (err) {
        status.textContent = "Couldn't read that file — is it a Pain Cave backup?";
      }
    };
    reader.readAsText(file);
  });
  document.getElementById("weightForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const kg = parseFloat(document.getElementById("weightEntry").value);
    if (!kg) return;
    const date = todayKey();
    const existing = state.weightLog.find((w) => w.date === date);
    if (existing) existing.kg = kg;
    else state.weightLog.push({ date, kg });
    state.settings.weightKg = kg;
    saveState();
    document.getElementById("weightEntry").value = "";
    renderSettings();
    renderDashboard();
  });

  document.getElementById("settingsForm").addEventListener("submit", (e) => {
    e.preventDefault();
    state.settings.weightKg = parseFloat(document.getElementById("weightKg").value);
    state.settings.heightCm = parseFloat(document.getElementById("heightCm").value);
    state.settings.age = parseInt(document.getElementById("age").value, 10);
    state.settings.sex = document.getElementById("sex").value;
    state.settings.phase = document.getElementById("phase").value;
    state.settings.deficitKcal = parseFloat(document.getElementById("deficitKcal").value) || 0;
    state.settings.activityLevel = document.getElementById("activityLevel").value;
    saveState();
    renderAll();
    switchTab("dashboard");
  });

  document.getElementById("saveProgrammeBtn").addEventListener("click", () => {
    document.querySelectorAll("[data-editset]").forEach((inp) => {
      const id = inp.dataset.editset;
      state.overrides.exercises[id] = state.overrides.exercises[id] || {};
      state.overrides.exercises[id].sets = parseInt(inp.value, 10);
    });
    document.querySelectorAll("[data-editreps]").forEach((inp) => {
      const id = inp.dataset.editreps;
      state.overrides.exercises[id] = state.overrides.exercises[id] || {};
      state.overrides.exercises[id].reps = inp.value;
    });
    document.querySelectorAll("[data-editremove]").forEach((cb) => {
      const id = cb.dataset.editremove;
      state.overrides.exercises[id] = state.overrides.exercises[id] || {};
      state.overrides.exercises[id].removed = cb.checked;
    });
    saveState();
    renderAll();
  });

  document.getElementById("addExerciseForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const type = document.getElementById("newExType").value;
    const newEx = {
      id: `custom_${Date.now()}`,
      name: document.getElementById("newExName").value,
      sets: parseInt(document.getElementById("newExSets").value, 10),
      reps: document.getElementById("newExReps").value,
      rest: document.getElementById("newExRest").value || "60 sec",
      cue: document.getElementById("newExCue").value || "",
      cutFirst: true,
    };
    state.overrides.customExercises[type].push(newEx);
    saveState();
    e.target.reset();
    renderAll();
  });

  document.getElementById("addMealForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const cat = document.getElementById("newMealCat").value;
    const parseLine = (line) => {
      const m = line.trim().match(/^([\d.]+)\s*([a-zA-Z]*)\s+(.+)$/);
      if (m) return { qty: parseFloat(m[1]), unit: m[2], item: m[3] };
      return { qty: 1, unit: "", item: line.trim() };
    };
    const ingredientsRaw = document.getElementById("newMealIngredients").value.split("\n").map((l) => l.trim()).filter(Boolean);
    const methodRaw = document.getElementById("newMealMethod").value.split("\n").map((l) => l.trim()).filter(Boolean);
    const newMeal = {
      id: `customm_${Date.now()}`,
      name: document.getElementById("newMealName").value,
      kcal: parseInt(document.getElementById("newMealKcal").value, 10) || 0,
      protein: parseInt(document.getElementById("newMealProtein").value, 10) || 0,
      carbs: parseInt(document.getElementById("newMealCarbs").value, 10) || 0,
      fat: parseInt(document.getElementById("newMealFat").value, 10) || 0,
      ingredients: ingredientsRaw.length ? ingredientsRaw.map(parseLine) : [],
      method: methodRaw.length ? methodRaw : ["No method added."],
    };
    state.overrides.customMeals[cat].push(newMeal);
    saveState();
    e.target.reset();
    renderAll();
  });
}

function el(id) {
  return document.getElementById(id);
}

function renderAll() {
  renderDateNav();
  renderDashboard();
  renderWorkout();
  renderMeals();
  renderProgress();
  renderSettings();
}

function switchTab(name) {
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  el(name).classList.add("active");
  document.querySelector(`[data-tab="${name}"]`).classList.add("active");
}

function handleShortcutLogging() {
  const params = new URLSearchParams(window.location.search);
  const type = params.get("logcardio");
  if (!type || !CARDIO[type]) return null;
  const minutes = parseInt(params.get("minutes"), 10);
  if (!minutes) return null;
  const kcalRaw = params.get("kcal");
  const entryToLog = { type, minutes };
  if (kcalRaw) entryToLog.kcal = parseInt(kcalRaw, 10);
  dayEntry(todayKey()).cardio.push(entryToLog);
  saveState();
  // clean the URL so a refresh doesn't log it again
  window.history.replaceState({}, "", window.location.pathname);
  return entryToLog;
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
  const logged = handleShortcutLogging();
  renderAll();
  if (logged) {
    const banner = document.createElement("div");
    banner.className = "notice";
    banner.style.cssText = "position:fixed;top:60px;left:16px;right:16px;z-index:20;text-align:center;";
    banner.textContent = `Logged: ${CARDIO[logged.type].label} — ${logged.minutes} min`;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 3500);
  }
});
