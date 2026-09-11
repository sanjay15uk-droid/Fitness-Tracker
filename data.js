/* ============================================================
   DATA MODULE
   Edit this file (on GitHub, from your phone, or locally) to
   change the gym programme, meals, or shopping list. Everything
   the app displays is generated from here — you never need to
   touch app.js or index.html to update the plan itself.
   ============================================================ */

// ---------- WEEKLY GYM TEMPLATE ----------
// type: push | pull | legs | rest
const WEEK_TEMPLATE = [
  { day: "Mon", type: "push" },
  { day: "Tue", type: "pull" },
  { day: "Wed", type: "legs" },
  { day: "Thu", type: "rest" },
  { day: "Fri", type: "push" },
  { day: "Sat", type: "rest" },
  { day: "Sun", type: "rest" },
];

// ---------- SESSIONS ----------
// sets/reps = standard working load once reacclimated.
// During "Reacclimation" phase (Settings toggle, recommended for
// your first 2 weeks back after 4 months out) the app automatically
// shows reduced sets and caps effort at RPE 7.
// cutFirst: true = first exercises dropped/reduced when the app
// auto-adjusts a session because you've logged extra cardio.
const SESSIONS = {
  push: {
    label: "Push",
    focus: "Chest, shoulders, triceps",
    warmup: [
      "5 min easy bike/row to raise heart rate",
      "Band pull-aparts x 15",
      "Arm circles + shoulder dislocates x 10 each way",
      "2 light ramp-up sets on exercise 1 before working sets",
    ],
    exercises: [
      { id: "p1", name: "Barbell bench press", sets: 4, reps: "6-8", rest: "2-3 min",
        cue: "Feet flat, slight arch, bar to lower chest, drive feet into the floor as you press.", cutFirst: false },
      { id: "p2", name: "Seated dumbbell shoulder press", sets: 3, reps: "8-10", rest: "90 sec",
        cue: "Ribs down, don't flare elbows past parallel at the bottom.", cutFirst: false },
      { id: "p3", name: "Incline dumbbell press", sets: 3, reps: "8-10", rest: "90 sec",
        cue: "30-45° bench, control the negative, press up and slightly in.", cutFirst: true },
      { id: "p4", name: "Cable lateral raise", sets: 3, reps: "12-15", rest: "60 sec",
        cue: "Slight forward lean, lead with the elbow, no swinging.", cutFirst: true },
      { id: "p5", name: "Triceps rope pushdown", sets: 3, reps: "10-12", rest: "60 sec",
        cue: "Elbows pinned to your sides, full lockout, split the rope at the bottom.", cutFirst: true },
      { id: "p6", name: "Cable crunch", sets: 3, reps: "12-15", rest: "45 sec",
        cue: "Round the spine, crunch down from the ribs, hips stay still.", cutFirst: true },
    ],
  },
  pull: {
    label: "Pull",
    focus: "Back, biceps, rear delts",
    warmup: [
      "5 min easy bike/row",
      "Scap pull-ups x 10 or band lat pulldown x 15",
      "Cat-cow x 10",
      "2 light ramp-up sets on exercise 1 before working sets",
    ],
    exercises: [
      { id: "l1", name: "Deadlift", sets: 3, reps: "5", rest: "3 min",
        cue: "Bar over mid-foot, brace hard, push the floor away — don't yank.", cutFirst: false },
      { id: "l2", name: "Lat pulldown or pull-up", sets: 3, reps: "8-10", rest: "90 sec",
        cue: "Lead with the elbows, squeeze the bar/handle to your chest, control the stretch.", cutFirst: false },
      { id: "l3", name: "Seated cable row", sets: 3, reps: "10-12", rest: "90 sec",
        cue: "Chest up, pull to your stomach, pause and squeeze the shoulder blades.", cutFirst: true },
      { id: "l4", name: "Rear delt fly (cable or dumbbell)", sets: 3, reps: "12-15", rest: "60 sec",
        cue: "Slight bend in elbows, lead with the hands wide, squeeze shoulder blades together.", cutFirst: true },
      { id: "l5", name: "EZ bar or dumbbell curl", sets: 3, reps: "10-12", rest: "60 sec",
        cue: "Elbows pinned, no swinging, squeeze at the top.", cutFirst: true },
      { id: "l6", name: "Hanging knee raise", sets: 3, reps: "12-15", rest: "45 sec",
        cue: "Curl the pelvis, avoid swinging, control the lowering.", cutFirst: true },
    ],
  },
  legs: {
    label: "Legs",
    focus: "Quads, hamstrings, glutes, calves",
    warmup: [
      "5 min easy bike",
      "Bodyweight squats x 15, leg swings x 10 each way",
      "Glute bridges x 15",
      "2 light ramp-up sets on exercise 1 before working sets",
    ],
    exercises: [
      { id: "g1", name: "Back squat", sets: 4, reps: "6-8", rest: "2-3 min",
        cue: "Brace, sit between your hips, knees track over toes, drive up through mid-foot.", cutFirst: false },
      { id: "g2", name: "Romanian deadlift", sets: 3, reps: "8-10", rest: "2 min",
        cue: "Soft knees, hinge at the hips, bar stays close to the legs, feel the hamstring stretch.", cutFirst: false },
      { id: "g3", name: "Leg press", sets: 3, reps: "10-12", rest: "90 sec",
        cue: "Feet shoulder width, don't let your lower back round off the pad at the bottom.", cutFirst: true },
      { id: "g4", name: "Walking lunges", sets: 3, reps: "10 each leg", rest: "90 sec",
        cue: "Long stride, back knee taps down softly, drive through the front heel.", cutFirst: true },
      { id: "g5", name: "Leg curl", sets: 3, reps: "10-12", rest: "60 sec",
        cue: "Control the negative, don't let hips rise off the pad.", cutFirst: true },
      { id: "g6", name: "Standing calf raise", sets: 4, reps: "12-15", rest: "45 sec",
        cue: "Full stretch at the bottom, pause at the top, don't bounce.", cutFirst: true },
    ],
  },
};

// ---------- CARDIO ADAPTATION RULES ----------
// Applied automatically when you log a run or padel session.
const CARDIO = {
  run: { label: "Run", kcalPerMin: 11, carbBiasPct: 60 },
  padel: { label: "Padel", kcalPerMin: 8, carbBiasPct: 45 },
};

// How many exercises get cut/reduced from a gym session logged on
// the same day as a cardio session, by cardio duration (minutes).
function cardioAdjustmentLevel(minutes) {
  if (minutes >= 60) return { dropExercises: 3, note: "Long session — accessories cut to the essentials. Keep the two main lifts, drop the rest to 2 sets." };
  if (minutes >= 30) return { dropExercises: 2, note: "Moderate session — accessory work trimmed, main lifts unchanged." };
  if (minutes > 0) return { dropExercises: 1, note: "Short session — one accessory dropped, everything else as programmed." };
  return { dropExercises: 0, note: "" };
}

// ---------- KITCHEN BASICS (for beginner cooks) ----------
const KITCHEN_BASICS = {
  equipment: [
    "A large non-stick frying pan",
    "A medium saucepan with a lid",
    "A large pot (for pasta, chilli, rice)",
    "A baking tray",
    "A decent kitchen knife + chopping board",
    "A digital meat thermometer (cheap, removes all the guesswork on chicken/beef)",
    "4-6 plastic meal-prep containers with lids",
  ],
  terms: [
    { term: "Sear", meaning: "Cook on fairly high heat for a couple of minutes a side to brown the outside. You're listening for a sizzle, not a quiet pan — if it's silent, the pan's not hot enough yet." },
    { term: "Simmer", meaning: "Small, gentle bubbles — not a rolling boil. Turn the heat down until the bubbles are lazy, not aggressive." },
    { term: "Brown the mince", meaning: "Cook it in a hot pan, breaking it up with a wooden spoon as it goes, until there's no pink left and it's gone slightly crispy in places." },
    { term: "Rest the meat", meaning: "Leave cooked meat sitting for 5 minutes off the heat before cutting — the juices redistribute instead of running out onto the board." },
    { term: "Check it's cooked (chicken)", meaning: "Cut into the thickest part — it should be white all the way through with clear juices, no pink. A meat thermometer reading 74°C+ is the reliable way to check." },
    { term: "Fork-tender", meaning: "A fork slides in with almost no resistance, e.g. for boiled potato or sweet potato." },
  ],
  storage: [
    "Cool cooked food fully (uncovered, out of the fridge) before putting the lid on and refrigerating — trapping steam makes food go off faster.",
    "Fridge: most batch meals keep 3-4 days.",
    "Freezer: portion into containers, freeze flat, use within 2-3 months. Label with the date — everything looks the same once frozen.",
    "Reheating: microwave until piping hot all the way through (stir halfway), or in a pan with a splash of water on medium heat, stirring occasionally.",
  ],
};

// ---------- MEALS ----------
// No fish anywhere except tinned tuna (per your preference).
// protein/carbs/fat in grams, kcal per SINGLE portion.
const MEALS = {
  breakfast: [
    {
      id: "b1", name: "Greek yogurt, oats & berry pot", kcal: 420, protein: 34, carbs: 48, fat: 10,
      batchNote: "Layers keep 4 days in the fridge — assemble in jars.",
      ingredients: [
        { item: "Greek yogurt (0%)", qty: 250, unit: "g" },
        { item: "Rolled oats", qty: 50, unit: "g" },
        { item: "Frozen mixed berries", qty: 80, unit: "g" },
        { item: "Whey protein (vanilla)", qty: 15, unit: "g" },
        { item: "Honey", qty: 10, unit: "g" },
      ],
      method: [
        "Mix the whey protein into the Greek yogurt until smooth.",
        "Spoon a layer of yogurt into a jar or container.",
        "Add a layer of oats, then a layer of frozen berries.",
        "Repeat the layers once more and finish with a drizzle of honey.",
        "Lid on, into the fridge — the oats soften overnight (works fine eaten same-day too).",
      ],
    },
    {
      id: "b2", name: "Scrambled eggs & tinned tuna on toast", kcal: 480, protein: 42, carbs: 34, fat: 18,
      batchNote: "Cook eggs fresh each morning (2 min) — everything else preps ahead.",
      ingredients: [
        { item: "Whole eggs", qty: 3, unit: "" },
        { item: "Tinned tuna in spring water", qty: 1, unit: "tins" },
        { item: "Wholemeal bread", qty: 2, unit: "slices" },
        { item: "Butter or spray oil", qty: 5, unit: "g" },
        { item: "Black pepper & chilli flakes", qty: 1, unit: "pinch" },
      ],
      method: [
        "Drain the tinned tuna well and flake it with a fork.",
        "Crack the eggs into a bowl, season, and whisk.",
        "Warm a non-stick pan on low-medium, add butter/spray.",
        "Pour in the eggs, fold gently with a spatula until just set (don't overcook).",
        "Fold the flaked tuna through the eggs in the last 20 seconds to warm through.",
        "Toast the bread and pile the eggs and tuna on top. Pepper and chilli flakes to finish.",
      ],
    },
    {
      id: "b3", name: "Protein porridge with peanut butter", kcal: 510, protein: 38, carbs: 55, fat: 15,
      batchNote: "Portion dry oats + protein into bags for the week — just add water/milk each morning.",
      ingredients: [
        { item: "Rolled oats", qty: 60, unit: "g" },
        { item: "Whey protein (vanilla)", qty: 30, unit: "g" },
        { item: "Semi-skimmed milk", qty: 200, unit: "ml" },
        { item: "Peanut butter", qty: 15, unit: "g" },
        { item: "Banana", qty: 1, unit: "" },
      ],
      method: [
        "Add oats and milk to a pan (or microwave bowl).",
        "Cook on low, stirring, for 3-4 minutes (or microwave 2 min, stir, 1 more min) until thick.",
        "Take off the heat and stir the whey protein through — don't boil it, it clumps.",
        "Top with sliced banana and a spoon of peanut butter.",
      ],
    },
    {
      id: "b4", name: "Baked egg & turkey bacon muffins", kcal: 400, protein: 36, carbs: 12, fat: 22,
      batchNote: "Bake a tray of 6 on Sunday — grab 2-3 straight from the fridge, no cooking needed on the day.",
      ingredients: [
        { item: "Eggs", qty: 8, unit: "(batch)" },
        { item: "Turkey bacon", qty: 6, unit: "rashers (batch)" },
        { item: "Spinach", qty: 60, unit: "g (batch)" },
        { item: "Cherry tomatoes", qty: 100, unit: "g (batch)" },
      ],
      method: [
        "Preheat oven to 180°C. Grease a 6-hole muffin tin well (or use silicone cups).",
        "Chop the turkey bacon and spinach roughly. Halve the cherry tomatoes.",
        "Whisk the eggs in a jug, season with pepper.",
        "Divide the bacon, spinach and tomatoes evenly between the muffin holes, then pour the egg mixture over each until nearly full.",
        "Bake 18-20 min until set and lightly golden on top — a knife poked in should come out clean.",
        "Cool fully, then fridge in a container. Eat cold or microwave 30 sec to warm through.",
      ],
    },
    {
      id: "b5", name: "Overnight chia & berry pot", kcal: 390, protein: 28, carbs: 40, fat: 12,
      batchNote: "Make 4-5 in one go — they only get better sitting in the fridge.",
      ingredients: [
        { item: "Chia seeds", qty: 30, unit: "g" },
        { item: "Semi-skimmed milk", qty: 200, unit: "ml" },
        { item: "Whey protein (vanilla)", qty: 20, unit: "g" },
        { item: "Frozen mixed berries", qty: 60, unit: "g" },
      ],
      method: [
        "Whisk the whey protein into the milk until fully dissolved (no lumps).",
        "Stir in the chia seeds well, then leave for 5 minutes and stir again to stop them clumping.",
        "Spoon into a jar, top with frozen berries (they'll defrost by morning), lid on.",
        "Fridge overnight — ready to eat straight from the jar the next morning.",
      ],
    },
    {
      id: "b6", name: "Protein pancakes", kcal: 460, protein: 34, carbs: 46, fat: 14,
      batchNote: "Cook a big stack and freeze between sheets of baking paper — toast to reheat.",
      ingredients: [
        { item: "Eggs", qty: 2, unit: "" },
        { item: "Rolled oats", qty: 50, unit: "g" },
        { item: "Whey protein (vanilla)", qty: 25, unit: "g" },
        { item: "Banana", qty: 1, unit: "" },
        { item: "Spray oil", qty: 1, unit: "spray" },
      ],
      method: [
        "Blitz oats, eggs, whey protein and banana together in a blender until smooth (or mash the banana well and whisk everything by hand).",
        "Heat a non-stick pan on medium with a spray of oil.",
        "Pour small rounds of batter into the pan, cook 2 min until bubbles appear on top, then flip and cook 1-2 min more.",
        "Repeat until the batter's used up — makes about 6-8 small pancakes.",
      ],
    },
  ],
  lunch: [
    {
      id: "l1", name: "Chicken, rice & veg bowl", kcal: 560, protein: 48, carbs: 62, fat: 12,
      batchNote: "Core bulk-prep meal — cook a big batch Sunday, box into 4-5 portions.",
      ingredients: [
        { item: "Chicken breast", qty: 800, unit: "g (batch)" },
        { item: "Basmati rice (uncooked)", qty: 400, unit: "g (batch)" },
        { item: "Broccoli", qty: 300, unit: "g (batch)" },
        { item: "Red peppers", qty: 2, unit: "(batch)" },
        { item: "Soy sauce", qty: 40, unit: "ml (batch)" },
        { item: "Garlic", qty: 4, unit: "cloves (batch)" },
        { item: "Olive oil", qty: 20, unit: "ml (batch)" },
      ],
      method: [
        "Cook the rice according to packet instructions; set aside.",
        "Season chicken breasts with salt, pepper and a little garlic; sear in a hot pan with 1 tbsp oil, 5-6 min per side until cooked through (74°C internal). Rest 5 min, then slice.",
        "Steam or stir-fry the broccoli and sliced peppers for 4-5 min until just tender.",
        "In the same pan, add crushed garlic and soy sauce, bubble for 30 sec, toss the veg through it.",
        "Divide rice, chicken and veg evenly across your containers (4-5 portions). Cool fully before lidding and refrigerating/freezing.",
      ],
    },
    {
      id: "l2", name: "Tuna, bean & pasta salad", kcal: 540, protein: 40, carbs: 65, fat: 12,
      batchNote: "Keeps 4 days cold — good grab-and-go lunch, no reheating needed.",
      ingredients: [
        { item: "Tinned tuna in spring water", qty: 4, unit: "tins (batch)" },
        { item: "Wholewheat pasta (uncooked)", qty: 350, unit: "g (batch)" },
        { item: "Tinned mixed beans", qty: 2, unit: "tins (batch)" },
        { item: "Cherry tomatoes", qty: 300, unit: "g (batch)" },
        { item: "Cucumber", qty: 1, unit: "(batch)" },
        { item: "Olive oil & balsamic", qty: 40, unit: "ml (batch)" },
        { item: "Red onion", qty: 1, unit: "(batch)" },
      ],
      method: [
        "Cook the pasta according to packet instructions, drain and rinse under cold water to stop it sticking.",
        "Drain the tuna and beans well.",
        "Halve the cherry tomatoes, dice the cucumber and finely slice the red onion.",
        "Combine pasta, tuna, beans and vegetables in a large bowl.",
        "Dress with olive oil and balsamic, season with salt and pepper, toss well.",
        "Portion into 4-5 containers and refrigerate.",
      ],
    },
    {
      id: "l3", name: "Turkey mince chilli with rice", kcal: 580, protein: 46, carbs: 58, fat: 14,
      batchNote: "Freezes well — make a double batch and freeze half in portions.",
      ingredients: [
        { item: "Turkey mince (5% fat)", qty: 800, unit: "g (batch)" },
        { item: "Tinned chopped tomatoes", qty: 2, unit: "tins (batch)" },
        { item: "Tinned kidney beans", qty: 2, unit: "tins (batch)" },
        { item: "Onion", qty: 2, unit: "(batch)" },
        { item: "Garlic", qty: 4, unit: "cloves (batch)" },
        { item: "Chilli powder & cumin", qty: 2, unit: "tbsp each (batch)" },
        { item: "Basmati rice (uncooked)", qty: 400, unit: "g (batch)" },
      ],
      method: [
        "Dice the onion and garlic. Brown the turkey mince in a large pot over medium-high heat, breaking it up as it cooks.",
        "Add onion and garlic, cook 3-4 min until softened.",
        "Stir in chilli powder and cumin, cook 1 min until fragrant.",
        "Add chopped tomatoes and drained kidney beans, simmer uncovered 20-25 min, stirring occasionally, until thickened.",
        "Cook rice separately according to packet instructions.",
        "Portion chilli and rice into 4-5 containers; cool fully before fridging or freezing.",
      ],
    },
    {
      id: "l4", name: "Chicken Caesar-style wrap", kcal: 550, protein: 44, carbs: 50, fat: 16,
      batchNote: "Cook the chicken in a batch, keep everything else separate, assemble fresh each day so the wrap doesn't go soggy.",
      ingredients: [
        { item: "Chicken breast", qty: 800, unit: "g (batch)" },
        { item: "Wholemeal wraps", qty: 5, unit: "(batch)" },
        { item: "Romaine lettuce", qty: 1, unit: "(batch)" },
        { item: "Fat-free Greek yogurt", qty: 150, unit: "g (batch)" },
        { item: "Lemon", qty: 1, unit: "(batch)" },
        { item: "Parmesan (small amount, for flavour)", qty: 30, unit: "g (batch)" },
      ],
      method: [
        "Season chicken breasts, sear in a hot pan with a little oil 5-6 min per side until cooked through. Rest 5 min, slice.",
        "Mix Greek yogurt with a squeeze of lemon, grated parmesan, salt and pepper for a lighter Caesar-style dressing.",
        "Shred the lettuce.",
        "To assemble: lay a wrap flat, add lettuce, sliced chicken, a drizzle of the dressing, roll tightly.",
        "Store sliced chicken, lettuce and dressing separately in the fridge; assemble each wrap fresh before eating.",
      ],
    },
    {
      id: "l5", name: "Chicken & lentil soup", kcal: 480, protein: 42, carbs: 48, fat: 10,
      batchNote: "Makes a big pot — freezes brilliantly in individual portions for weeks you're short on time.",
      ingredients: [
        { item: "Chicken breast", qty: 600, unit: "g (batch)" },
        { item: "Red lentils (dried)", qty: 250, unit: "g (batch)" },
        { item: "Carrots", qty: 3, unit: "(batch)" },
        { item: "Onion", qty: 2, unit: "(batch)" },
        { item: "Chicken stock", qty: 1.5, unit: "l (batch)" },
        { item: "Garlic", qty: 3, unit: "cloves (batch)" },
      ],
      method: [
        "Dice the onion and carrots, crush the garlic. Soften in a large pot with a little oil over medium heat, 5 min.",
        "Add the lentils and stock, bring to a boil, then simmer 20 min until the lentils have broken down.",
        "Meanwhile, poach the chicken breasts in a separate pan of simmering water 12-15 min until cooked through (74°C+), then shred with two forks.",
        "Stir the shredded chicken into the soup, season well, simmer 5 more minutes.",
        "Cool fully, portion into 5 containers, fridge or freeze.",
      ],
    },
    {
      id: "l6", name: "Beef & noodle stir-fry", kcal: 570, protein: 42, carbs: 60, fat: 16,
      batchNote: "Best stir-fried fresh in portions rather than one giant batch — noodles go claggy reheated in bulk. Prep the components ahead, cook each portion in 5 minutes.",
      ingredients: [
        { item: "Lean beef strips", qty: 700, unit: "g (batch)" },
        { item: "Straight-to-wok noodles", qty: 5, unit: "packs (batch)" },
        { item: "Mixed stir-fry vegetables", qty: 500, unit: "g (batch)" },
        { item: "Soy sauce", qty: 60, unit: "ml (batch)" },
        { item: "Garlic & ginger", qty: 3, unit: "cloves + thumb each (batch)" },
      ],
      method: [
        "Portion the beef, noodles and vegetables into 5 meal-sized bags/containers ready to cook fresh each time.",
        "When ready to eat: heat a wok or large frying pan until very hot, add a splash of oil.",
        "Stir-fry the beef strips 2-3 min until browned, push to one side.",
        "Add garlic, ginger and vegetables, stir-fry 3-4 min until just tender.",
        "Add the noodles and soy sauce, toss everything together for 1-2 min until piping hot throughout.",
      ],
    },
  ],
  dinner: [
    {
      id: "d1", name: "Beef mince & sweet potato mash", kcal: 600, protein: 44, carbs: 55, fat: 20,
      batchNote: "Great post-training meal, carb-heavy for recovery — batch cook and portion.",
      ingredients: [
        { item: "Lean beef mince (5%)", qty: 800, unit: "g (batch)" },
        { item: "Sweet potato", qty: 1.2, unit: "kg (batch)" },
        { item: "Beef stock", qty: 300, unit: "ml (batch)" },
        { item: "Onion", qty: 2, unit: "(batch)" },
        { item: "Worcestershire sauce", qty: 2, unit: "tbsp (batch)" },
        { item: "Green beans", qty: 300, unit: "g (batch)" },
      ],
      method: [
        "Peel and chop sweet potato into chunks, boil 15-18 min until fork-tender, then mash with a little salt and pepper (no butter needed to keep it lean).",
        "Dice the onion and brown the beef mince in a large pan, breaking it up, 6-8 min.",
        "Add onion, cook 3 min, then stir in stock and Worcestershire sauce, simmer 10 min until thickened.",
        "Steam the green beans 4-5 min until just tender.",
        "Portion mince, mash and green beans across 4-5 containers.",
      ],
    },
    {
      id: "d2", name: "Chicken fajita bowl", kcal: 540, protein: 46, carbs: 52, fat: 14,
      batchNote: "Prep components separately and combine fresh for better texture.",
      ingredients: [
        { item: "Chicken breast", qty: 800, unit: "g (batch)" },
        { item: "Peppers (mixed colours)", qty: 4, unit: "(batch)" },
        { item: "Onion", qty: 2, unit: "(batch)" },
        { item: "Fajita seasoning", qty: 2, unit: "tbsp (batch)" },
        { item: "Basmati rice (uncooked)", qty: 350, unit: "g (batch)" },
        { item: "Lime", qty: 2, unit: "(batch)" },
      ],
      method: [
        "Slice chicken into strips, toss with fajita seasoning.",
        "Slice peppers and onion into strips.",
        "Sear chicken in a hot pan with a little oil, 6-7 min until cooked through, set aside.",
        "In the same pan, stir-fry peppers and onion 5-6 min until slightly charred at the edges.",
        "Cook rice according to packet instructions, squeeze lime through it.",
        "Combine chicken, veg and rice; portion into 4-5 containers.",
      ],
    },
    {
      id: "d3", name: "Tinned tuna & sweetcorn jacket potato", kcal: 460, protein: 38, carbs: 58, fat: 8,
      batchNote: "Bake a batch of jackets and reheat — mix the tuna fresh each time (2 min).",
      ingredients: [
        { item: "Baking potatoes", qty: 4, unit: "(batch)" },
        { item: "Tinned tuna in spring water", qty: 4, unit: "tins (batch)" },
        { item: "Sweetcorn", qty: 200, unit: "g (batch)" },
        { item: "Fat-free Greek yogurt", qty: 150, unit: "g (batch)" },
        { item: "Spring onion", qty: 4, unit: "(batch)" },
      ],
      method: [
        "Prick potatoes with a fork, bake at 200°C for 60-75 min until the skin is crisp and the inside is soft (or microwave 10-12 min then finish 15 min in the oven for crisp skin).",
        "Drain the tuna and mix with sweetcorn and Greek yogurt (instead of mayo, to keep it lean).",
        "Slice spring onion and stir through.",
        "Once potatoes are cooked, cool fully, wrap and fridge/freeze.",
        "To serve: reheat the potato until piping hot, split open and top with the tuna mix.",
      ],
    },
    {
      id: "d4", name: "Turkey meatballs with wholewheat spaghetti", kcal: 590, protein: 44, carbs: 60, fat: 16,
      batchNote: "Meatballs and sauce freeze really well — batch cook a double portion and freeze half.",
      ingredients: [
        { item: "Turkey mince (5% fat)", qty: 800, unit: "g (batch)" },
        { item: "Breadcrumbs", qty: 60, unit: "g (batch)" },
        { item: "Egg", qty: 1, unit: "(batch)" },
        { item: "Tinned chopped tomatoes", qty: 2, unit: "tins (batch)" },
        { item: "Garlic", qty: 3, unit: "cloves (batch)" },
        { item: "Wholewheat spaghetti (uncooked)", qty: 350, unit: "g (batch)" },
        { item: "Dried basil & oregano", qty: 2, unit: "tsp each (batch)" },
      ],
      method: [
        "Mix turkey mince, breadcrumbs, egg, half the garlic and a pinch of salt in a bowl. Roll into ~20 meatballs.",
        "Brown the meatballs in a large pan with a little oil, 5-6 min, turning to colour all sides (they don't need to be fully cooked yet).",
        "Add the remaining garlic, chopped tomatoes, basil and oregano to the pan, bring to a simmer.",
        "Cover and simmer 15-20 min until the meatballs are cooked through and the sauce has thickened.",
        "Cook spaghetti according to packet instructions separately.",
        "Portion spaghetti and meatball sauce into 5 containers; cool before fridging/freezing.",
      ],
    },
    {
      id: "d5", name: "Chicken & vegetable stir-fry with rice", kcal: 520, protein: 46, carbs: 52, fat: 12,
      batchNote: "Cook components ahead, combine fresh in 5 minutes — keeps the vegetables crisp rather than soggy.",
      ingredients: [
        { item: "Chicken breast", qty: 800, unit: "g (batch)" },
        { item: "Mixed stir-fry vegetables", qty: 500, unit: "g (batch)" },
        { item: "Basmati rice (uncooked)", qty: 400, unit: "g (batch)" },
        { item: "Soy sauce", qty: 50, unit: "ml (batch)" },
        { item: "Garlic & ginger", qty: 3, unit: "cloves + thumb each (batch)" },
      ],
      method: [
        "Slice chicken into thin strips.",
        "Cook rice according to packet instructions; set aside.",
        "Heat a wok or large pan until hot with a little oil, stir-fry the chicken 4-5 min until cooked through, set aside.",
        "Add garlic, ginger and vegetables to the same pan, stir-fry 3-4 min until just tender.",
        "Return the chicken to the pan, add soy sauce, toss everything together 1-2 min.",
        "Portion chicken stir-fry and rice into 5 containers.",
      ],
    },
    {
      id: "d6", name: "Chicken curry with rice", kcal: 560, protein: 48, carbs: 54, fat: 14,
      batchNote: "Tastes even better the next day — a good one to cook the night before you need it.",
      ingredients: [
        { item: "Chicken breast", qty: 800, unit: "g (batch)" },
        { item: "Onion", qty: 2, unit: "(batch)" },
        { item: "Tinned chopped tomatoes", qty: 1, unit: "tin (batch)" },
        { item: "Light coconut milk", qty: 200, unit: "ml (batch)" },
        { item: "Curry powder", qty: 3, unit: "tbsp (batch)" },
        { item: "Garlic & ginger", qty: 4, unit: "cloves + thumb (batch)" },
        { item: "Basmati rice (uncooked)", qty: 400, unit: "g (batch)" },
      ],
      method: [
        "Dice the chicken and onion. Brown the chicken in a large pot with a little oil, 5 min, set aside.",
        "In the same pot, soften the onion, garlic and ginger, 4-5 min.",
        "Stir in curry powder, cook 1 min until fragrant.",
        "Add chopped tomatoes and coconut milk, bring to a simmer.",
        "Return the chicken to the pot, simmer uncovered 15-18 min until the chicken is cooked through and the sauce has thickened.",
        "Cook rice separately according to packet instructions.",
        "Portion curry and rice into 5 containers; cool before fridging/freezing.",
      ],
    },
  ],
  snacks: [
    { id: "s1", name: "Cottage cheese & pineapple", kcal: 220, protein: 22, carbs: 18, fat: 4,
      ingredients: [{ item: "Cottage cheese", qty: 200, unit: "g" }, { item: "Tinned pineapple in juice", qty: 100, unit: "g" }],
      method: ["Drain the pineapple.", "Mix through the cottage cheese and eat straight from the pot."] },
    { id: "s2", name: "Protein shake & banana", kcal: 260, protein: 30, carbs: 30, fat: 3,
      ingredients: [{ item: "Whey protein (vanilla)", qty: 30, unit: "g" }, { item: "Banana", qty: 1, unit: "" }, { item: "Water or milk", qty: 300, unit: "ml" }],
      method: ["Blend or shake all ingredients until smooth."] },
    { id: "s3", name: "Rice cakes & peanut butter", kcal: 230, protein: 9, carbs: 26, fat: 11,
      ingredients: [{ item: "Rice cakes", qty: 3, unit: "" }, { item: "Peanut butter", qty: 20, unit: "g" }],
      method: ["Spread peanut butter over the rice cakes."] },
    { id: "s4", name: "Boiled eggs & carrot sticks", kcal: 200, protein: 15, carbs: 8, fat: 12,
      ingredients: [{ item: "Eggs", qty: 3, unit: "" }, { item: "Carrots", qty: 2, unit: "" }],
      method: ["Boil eggs 7-8 min for a just-set yolk, cool in cold water, peel.", "Slice carrots into sticks and eat alongside."] },
    { id: "s5", name: "Apple & peanut butter", kcal: 210, protein: 6, carbs: 24, fat: 11,
      ingredients: [{ item: "Apple", qty: 1, unit: "" }, { item: "Peanut butter", qty: 20, unit: "g" }],
      method: ["Slice the apple and dip in the peanut butter."] },
    { id: "s6", name: "Turkey slices & cucumber", kcal: 150, protein: 20, carbs: 4, fat: 5,
      ingredients: [{ item: "Turkey breast slices", qty: 100, unit: "g" }, { item: "Cucumber", qty: 0.5, unit: "" }],
      method: ["Roll the turkey slices up, slice the cucumber into sticks, eat together."] },
  ],
};
