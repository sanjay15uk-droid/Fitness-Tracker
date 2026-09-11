# Matchday — Training Tracker

A simple, phone-friendly training and nutrition tracker. Runs entirely
in the browser — no backend, no build step, nothing to install.

## What it does

- **Today tab** — shows your gym session type for the day, today's calorie/protein/carb/fat targets, and lets you log a run or padel session on the spot.
- **Session tab** — your Push/Pull/Legs session with sets, reps, form cues and a weight field per exercise, tick-box style. If you've logged extra cardio today, the accessory work automatically trims itself (fewer sets/exercises) so you don't overreach.
- **Meals tab** — a default 7-day meal plan, a full shopping list totalled for the week, and step-by-step cooking instructions for every recipe (batch-prep style for lunch/dinner).
- **Settings tab** — enter your weight, height, age and sex once; everything else calculates itself (Mifflin-St Jeor BMR → daily target → macros).

## How the adaptive logic works

- Calories: BMR × 1.3 (daily activity) + today's gym session (~220–280 kcal) + any cardio you log (run ≈ 11 kcal/min, padel ≈ 8 kcal/min), then cut by ~20% for fat loss.
- Protein is fixed at 2.2g per kg bodyweight to protect muscle while cutting; fat at 0.8g/kg; carbs fill the rest and rise on cardio days.
- Meal structure (3 meals / +1 snack / +2 snacks) is chosen automatically based on your calorie target for the day.
- Log a run or padel session and the gym page re-renders: short session (<30 min) drops one accessory exercise, 30–60 min drops two, 60+ min strips the session back to just the two main lifts.
- A **Reacclimation** toggle in Settings (recommended for your first couple of weeks back after time off) automatically knocks a set off every exercise and is meant to be switched to **Standard** once things feel normal again.

All your daily logging (ticked exercises, weights, cardio sessions) saves straight to your phone's browser (localStorage) — it updates the moment you tap something, nothing to commit or push for day-to-day use.

## Editing the plan itself

Change the actual programme, meals or shopping list by editing `data.js` — everything else is generated from it. To change:
- the gym split or exercises → edit `SESSIONS` and `WEEK_TEMPLATE`
- the meal bank or recipes → edit `MEALS`
- the default weekly plan used for the shopping list → edit `DEFAULT_WEEK_PLAN` in `app.js`

You can do this straight from your phone: open the file on github.com (or in the GitHub app), tap the pencil/edit icon, make your change, and commit directly to `main`. If Pages is enabled (below), the live site updates within a minute or two of the commit.

## Deploying it (GitHub Pages — free, works on your phone)

1. Create a new repository on GitHub (e.g. `training-tracker`), public or private both work.
2. Upload the files to the repo root, **keeping the `assets` folder structure** (drag the whole unzipped folder's contents in, don't flatten it): `index.html`, `style.css`, `app.js`, `data.js`, `manifest.json`, `README.md`, plus the `assets` folder (containing the app icon PNGs). Easiest from a phone or laptop: on the repo page tap/click **Add file → Upload files**, then drag the whole `fitness-tracker` folder's contents in — GitHub preserves the `assets/` subfolder automatically — and commit.
3. Go to the repo's **Settings → Pages**.
4. Under **Build and deployment**, set **Source** to "Deploy from a branch", branch `main`, folder `/ (root)`. Save.
5. After a minute, GitHub shows your live URL — something like `https://yourusername.github.io/training-tracker/`. Open that on your phone and add it to your home screen (Share → Add to Home Screen) so it opens like an app.

That's it — no accounts, no server, no cost.

## Updating an existing install

If you already have this added to your phone's home screen and are updating the icon/theme, **delete the old home screen icon and re-add it** (Share → Add to Home Screen) after the new files are live — iOS caches the icon at the point you first added it and won't pick up a new one on the same shortcut.

## Notes

- No fish anywhere in the meal plan except tinned tuna, per your preference.
- All recipes and portions are a sensible starting point — swap ingredients or quantities in `data.js` freely, the app doesn't care what's in there as long as the structure (`id`, `kcal`, `ingredients`, `method`, etc.) stays the same.
- This isn't medical or dietetic advice — the calorie/macro maths is a standard estimate. If anything feels off for your body, adjust the numbers in Settings or the deficit logic in `app.js` (`calcTargetsForDay`).
