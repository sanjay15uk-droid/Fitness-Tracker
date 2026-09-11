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
  if (raw) return JSON.parse(raw);
  return {
    settings: { weightKg: null, heightCm: null, age: null, sex: "male", phase: "reacclimation", deficitKcal: 300 },
    log: {},
    weightLog: [],
  };
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
    state.log[key] = { cardio: [], gym: { completedExerciseIds: [], weights: {}, sessionComplete: false } };
  }
  return state.log[key];
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

  const baselineTDEE = bmr * 1.3; // daily-life activity, training handled below
  const gymBurn = tmpl.type !== "rest" && entry.gym.sessionComplete ? 280 : tmpl.type !== "rest" ? 220 : 0;
  const cardioBurn = entry.cardio.reduce((sum, c) => sum + (CARDIO[c.type]?.kcalPerMin || 9) * c.minutes, 0);

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
function adjustedSessionFor(key) {
  const tmpl = templateForDate(new Date(key));
  if (tmpl.type === "rest") return null;
  const session = SESSIONS[tmpl.type];
  const entry = dayEntry(key);
  const cardioMinutes = entry.cardio.reduce((sum, c) => sum + c.minutes, 0);
  const { dropExercises, note } = cardioAdjustmentLevel(cardioMinutes);

  const core = session.exercises.filter((e) => !e.cutFirst);
  let accessory = session.exercises.filter((e) => e.cutFirst);
  if (dropExercises > 0) {
    const keep = Math.max(1, accessory.length - dropExercises);
    accessory = accessory.slice(0, keep);
  }
  const reacclimating = state.settings.phase === "reacclimation";
  const exercises = [...core, ...accessory].map((e) => ({
    ...e,
    sets: reacclimating ? Math.max(2, e.sets - 1) : e.sets,
  }));

  return {
    type: tmpl.type,
    label: session.label,
    focus: session.focus,
    warmup: session.warmup,
    exercises,
    adjustedNote: dropExercises > 0 ? note : null,
    reacclimating,
  };
}

// ---------- SHOPPING LIST ----------
const DEFAULT_WEEK_PLAN = [
  { breakfast: "b1", lunch: "l1", dinner: "d1", snack: "s1" },
  { breakfast: "b1", lunch: "l1", dinner: "d2", snack: "s2" },
  { breakfast: "b3", lunch: "l2", dinner: "d1", snack: "s3" },
  { breakfast: "b1", lunch: "l3", dinner: "d2", snack: "s4" },
  { breakfast: "b1", lunch: "l1", dinner: "d1", snack: "s1" },
  { breakfast: "b2", lunch: "l2", dinner: "d3", snack: "s2" },
  { breakfast: "b3", lunch: "l3", dinner: "d3", snack: "s3" },
];
const BATCH_YIELD = 5;

function findMeal(id) {
  for (const cat of Object.keys(MEALS)) {
    const m = MEALS[cat].find((x) => x.id === id);
    if (m) return { meal: m, cat };
  }
  return null;
}

function generateShoppingList() {
  const counts = {};
  DEFAULT_WEEK_PLAN.forEach((day) => {
    ["breakfast", "lunch", "dinner", "snack"].forEach((slot) => {
      const id = day[slot];
      counts[id] = (counts[id] || 0) + 1;
    });
  });

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
  const key = todayKey();
  const tmpl = templateForDate();
  const targets = calcTargetsForDay(key);
  const entry = dayEntry(key);

  let html = `<div class="stat-row">
    <div class="stat-block">
      <span class="stat-label">Today</span>
      <span class="stat-value">${tmpl.type === "rest" ? "Rest day" : SESSIONS[tmpl.type].label}</span>
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
    </div>`;
  }

  const wl = state.weightLog;
  const latest = wl[wl.length - 1];
  const weekAgo = [...wl].reverse().find((w) => (Date.now() - new Date(w.date)) / 86400000 >= 6);
  html += `<div class="card">
    <h3>Weight</h3>
    ${latest ? `<div class="stat-row"><div class="stat-block"><span class="stat-label">Latest</span><span class="stat-value">${latest.kg}kg</span></div>
      <div class="stat-block"><span class="stat-label">Vs ~7 days ago</span><span class="stat-value">${weekAgo ? (latest.kg - weekAgo.kg > 0 ? "+" : "") + fmt(latest.kg - weekAgo.kg) + "kg" : "—"}</span></div></div>`
      : `<p class="hint">Log your weight from the Settings tab to start tracking trend.</p>`}
  </div>`;

  const adj = suggestDeficitAdjustment();
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
    <h3>Log extra cardio</h3>
    <form id="cardioForm" class="inline-form">
      <select id="cardioType"><option value="run">Run</option><option value="padel">Padel</option></select>
      <input id="cardioMinutes" type="number" min="1" placeholder="minutes" required />
      <button type="submit">Log session</button>
    </form>
    <ul class="log-list">
      ${entry.cardio.map((c, i) => `<li>${CARDIO[c.type].label} — ${c.minutes} min <button data-remove-cardio="${i}" class="link-btn">remove</button></li>`).join("") || "<li class='muted'>Nothing logged today</li>"}
    </ul>
  </div>`;

  el("dashboard").innerHTML = html;
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
    if (!minutes) return;
    dayEntry(key).cardio.push({ type, minutes });
    saveState();
    renderDashboard();
    renderWorkout();
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
  const key = todayKey();
  const session = adjustedSessionFor(key);
  const entry = dayEntry(key);

  if (!session) {
    el("workout").innerHTML = `<div class="card"><h3>Rest day</h3><p>No gym session programmed. Log any cardio from the Dashboard tab.</p></div>`;
    return;
  }

  let html = `<div class="card">
    <h3>${session.label}${session.reacclimating ? " · Reacclimation" : ""}</h3>
    <p class="hint">${session.focus}</p>
    ${session.adjustedNote ? `<p class="notice">Adjusted for today's cardio: ${session.adjustedNote}</p>` : ""}
    <details>
      <summary>Warm-up</summary>
      <ul>${session.warmup.map((w) => `<li>${w}</li>`).join("")}</ul>
    </details>
  </div>`;

  html += `<div class="card"><h3>Exercises</h3><div class="exercise-list">`;
  session.exercises.forEach((ex) => {
    const done = entry.gym.completedExerciseIds.includes(ex.id);
    const weight = entry.gym.weights[ex.id] || "";
    html += `<div class="exercise ${done ? "done" : ""}">
      <label class="exercise-check">
        <input type="checkbox" data-ex="${ex.id}" ${done ? "checked" : ""} />
        <span class="ex-name">${ex.name}</span>
      </label>
      <div class="ex-meta">${ex.sets} sets × ${ex.reps} · rest ${ex.rest}</div>
      <div class="ex-cue">${ex.cue}</div>
      <div class="ex-weight">
        <label>Weight used (kg)</label>
        <input type="number" data-weight="${ex.id}" value="${weight}" placeholder="kg" step="0.5" />
      </div>
    </div>`;
  });
  html += `</div>
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
    });
  });
  document.getElementById("completeSessionBtn").addEventListener("click", () => {
    entry.gym.sessionComplete = true;
    saveState();
    renderWorkout();
    renderDashboard();
  });
}

function renderMeals() {
  let html = `<div class="card">
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
    <h3>Default 7-day plan</h3>
    <p class="hint">Rotated from the meal bank below. Swap any day for another meal of the same type if you like — the shopping list already covers extra variety.</p>
    <table class="plan-table">
      <thead><tr><th>Day</th><th>Breakfast</th><th>Lunch</th><th>Dinner</th><th>Snack</th></tr></thead>
      <tbody>
        ${DEFAULT_WEEK_PLAN.map((d, i) => `<tr>
          <td>${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i]}</td>
          <td>${findMeal(d.breakfast).meal.name}</td>
          <td>${findMeal(d.lunch).meal.name}</td>
          <td>${findMeal(d.dinner).meal.name}</td>
          <td>${findMeal(d.snack).meal.name}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>`;

  html += `<div class="card"><h3>Shopping list — full week</h3><ul class="shopping-list">`;
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
      <label>Daily calorie deficit (kcal below maintenance)
        <input type="number" id="deficitKcal" value="${s.deficitKcal ?? 300}" step="50" min="0" />
      </label>
      <button type="submit" class="primary-btn">Save</button>
    </form>
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
  </div>`;

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
    saveState();
    renderAll();
    switchTab("dashboard");
  });
}

function el(id) {
  return document.getElementById(id);
}

function renderAll() {
  renderDashboard();
  renderWorkout();
  renderMeals();
  renderSettings();
}

function switchTab(name) {
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  el(name).classList.add("active");
  document.querySelector(`[data-tab="${name}"]`).classList.add("active");
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
  renderAll();
});
