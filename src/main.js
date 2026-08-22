import { PlayerCar } from "./entities/PlayerCar.js";
import { TrafficSystem } from "./systems/TrafficSystem.js";
import { ScoringSystem } from "./systems/ScoringSystem.js";
import { assetManager } from "./systems/AssetManager.js";
import { audioManager } from "./systems/AudioManager.js";
import { billboardSystem } from "./systems/BillboardSystem.js";
import {
  COLLISION_SOUND_FILES,
  BILLBOARD_IMAGE_FILES
} from "./asset-lists.js";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d", { alpha: false });
const speedLabel = document.querySelector("#speed");
const touchControlButtons = [
  ...document.querySelectorAll("[data-action]")
];

// ============================================================
// COLLISION SOUND EFFECTS
// Add/remove sound files from this list whenever you want.
// Files should be placed in: public/audio/collisions/
// ============================================================

// Audio files live in public/audio/collisions/ in the repo.
// When Vite processes this module, BASE_URL is injected and the
// public/ directory is served/copied to the root, so sounds are
// at audio/collisions/....
// When the raw source is served without Vite (e.g. GitHub Pages
// serving the repo root directly), import.meta.env is undefined,
// so we fall back to public/audio/collisions/ to match the repo
// layout. This keeps the game working in both cases.
const AUDIO_BASE =
  import.meta.env && typeof import.meta.env.BASE_URL === "string"
    ? `${import.meta.env.BASE_URL}audio/collisions/`
    : "public/audio/collisions/";

// Billboard images follow the same asset convention as collision audio:
// a centralized base path + explicit list. Files live in public/assets/billboards/.
const BILLBOARD_BASE =
  import.meta.env && typeof import.meta.env.BASE_URL === "string"
    ? `${import.meta.env.BASE_URL}assets/billboards/`
    : "public/assets/billboards/";

const BILLBOARD_IMAGES = BILLBOARD_IMAGE_FILES;

// Billboard textures go through the shared AssetManager so every
// billboard reuses the same image instance — never reloaded per frame.
billboardSystem.setBase(BILLBOARD_BASE);

// Full list of currently-present collision files. Built by mapping the
// auto-generated `COLLISION_SOUND_FILES` filenames (read from the actual
// filesystem) onto the AUDIO_BASE prefix.
const COLLISION_SOUNDS = COLLISION_SOUND_FILES.map(
  (file) => `${AUDIO_BASE}${file}`
);

// Collision sounds play through the AudioManager's exclusive channel,
// which stops the previous collision sound before playing the new one
// (only one collision sound is audible at a time) and handles browser
// autoplay unlock on the first user interaction.
function playRandomCollisionSound() {
  if (!COLLISION_SOUNDS.length) return;

  const path =
    COLLISION_SOUNDS[
      Math.floor(Math.random() * COLLISION_SOUNDS.length)
    ];

  // Use the exclusive playback channel. If a previous collision sound
  // is still playing, it is stopped immediately and only the newest
  // collision sound is heard (no overlap, one active collision sound).
  audioManager.playExclusive(path, 1);
}

const TAU = Math.PI * 2;
const keys = new Set();
const touchInput = {
  accelerate: false,
  brake: false,
  left: false,
  right: false
};
const activePointerActions = new Map();

function syncTouchInput() {
  touchInput.accelerate = false;
  touchInput.brake = false;
  touchInput.left = false;
  touchInput.right = false;

  const activeActions = new Set(activePointerActions.values());

  for (const action of activeActions) {
    touchInput[action] = true;
  }

  for (const control of touchControlButtons) {
    control.classList.toggle(
      "is-active",
      activeActions.has(control.dataset.action)
    );
  }
}

function resetInputState() {
  keys.clear();
  activePointerActions.clear();
  syncTouchInput();
}

function clearPointerAction(pointerId, control) {
  if (!activePointerActions.delete(pointerId)) return;

  if (control.hasPointerCapture(pointerId)) {
    control.releasePointerCapture(pointerId);
  }

  syncTouchInput();
}

window.addEventListener("keydown", (e) => {
  if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"].includes(e.code)) {
    e.preventDefault();
    keys.add(e.code);
  }
});

window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", resetInputState);

for (const control of touchControlButtons) {
  control.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    control.setPointerCapture(event.pointerId);
    activePointerActions.set(event.pointerId, control.dataset.action);
    syncTouchInput();
  }, { passive: false });

  for (const eventName of [
    "pointerup",
    "pointercancel",
    "pointerleave",
    "lostpointercapture"
  ]) {
    control.addEventListener(eventName, (event) => {
      clearPointerAction(event.pointerId, control);
    });
  }
}

const state = {
  lane: 1,
  laneTarget: 1,
  lateral: 0,
  forwardSpeed: 0,
  distance: 0,
  roadOffset: 0,
  time: 0
};

const road = {
  laneCount: 4,
  worldWidth: 12,
  shoulder: 1.15,
  horizonY: 0.20,
  bottomY: 1.04,
  nearHalfWidth: 0.43,
  farHalfWidth: 0.055
};

const player = new PlayerCar();

const scoring = new ScoringSystem();

const traffic = new TrafficSystem((car) => {
  const event = scoring.registerMiss(car);
  handleScoreMiss(event);
});

traffic.start();

// ============================================================
// SCORE HUD / POPUP PRESENTATION
// Consumer of ScoringSystem events only. No scoring logic here.
// ============================================================
const scoreHud = document.querySelector("#score-hud");
const scoreValueEl = document.querySelector("#score-value");
const streakLabelEl = document.querySelector("#streak-label");
const streakValueEl = document.querySelector("#streak-value");
const popupLayer = document.querySelector("#score-popups");

const streakReducedMotion =
  window.matchMedia("(prefers-reduced-motion: reduce)");

let streakWasActive = false;

function formatScore(value) {
  return value.toLocaleString("en-US");
}

function setStreakDisplay(active) {
  scoreHud.classList.toggle("is-streak-active", active);
  streakLabelEl.textContent = active ? "🔥 STREAK ACTIVE" : "STREAK";
}

function triggerStreakActivation() {
  // Remove + re-add the class so the CSS pulse animation replays
  // only on the transition into the active state.
  scoreHud.classList.remove("is-streak-activating");
  void scoreHud.offsetWidth; // force reflow so the animation restarts
  scoreHud.classList.add("is-streak-activating");
}

function spawnScorePopup(gain, hasBonus) {
  const el = document.createElement("div");
  el.className = "score-popup" + (hasBonus ? " score-popup--bonus" : "");
  el.textContent = `+${gain}`;
  popupLayer.appendChild(el);

  if (streakReducedMotion.matches) {
    // Reduced motion: CSS animation is disabled, so fade + remove.
    requestAnimationFrame(() => el.classList.add("is-fading"));
    setTimeout(() => el.remove(), 400);
  } else {
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }
}

function handleScoreHit(event) {
  scoreValueEl.textContent = formatScore(event.totalScore);
  streakValueEl.textContent = `x${event.streakCount}`;

  const becameActive = event.streakActive && !streakWasActive;

  setStreakDisplay(event.streakActive);

  if (becameActive) {
    triggerStreakActivation();
  }

  streakWasActive = event.streakActive;

  spawnScorePopup(event.gain, event.bonus > 0);
}

function handleScoreMiss(event) {
  streakWasActive = false;
  setStreakDisplay(false);
  streakValueEl.textContent = "x0";
  // Total score is unchanged; no popup is created for a miss.
}

const scenery = [];
const SCENERY_COUNT = 90;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  canvas.style.width = innerWidth + "px";
  canvas.style.height = innerHeight + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

function rand(min, max) {
  return min + Math.random() * (max - min);
}

// Deterministic pseudo-random value from an integer seed.
// Used so grass blades live in world cells and scroll coherently
// instead of re-randomizing every frame.
function hash01(seed) {
  let n = (seed ^ 0x9e3779b9) | 0;
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

// ============================================================
// INDIAN ROADSIDE COMPOSITIONS
// Each entry is a mini-cluster that gives the roadside an authored
// rhythm (market → dhaba → mechanic → bus stop → petrol → village
// → open highway …) instead of pure random scatter.
// ============================================================
const ROADSIDE_SECTIONS = [
  ["shop", "chaiStall", "motorcycle", "utilityPole", "wall", "auto"],
  ["dhaba", "foodStall", "cart", "motorcycle", "sign", "utilityPole"],
  ["repair", "service", "clutter", "utilityPole", "barrels", "motorcycle"],
  ["busStop", "sign", "kiosk", "auto", "chaiStall"],
  ["petrolPump", "sign", "hoarding"],
  ["bigTree", "tree", "house", "utilityPole", "wall"],
  ["house", "house", "wall", "bigTree", "tree"],
  ["haat", "fruit", "waterKiosk", "cart", "chaiStall"],
  ["tree", "bush", "bigTree", "open", "bush"],
  ["open", "tree", "bush", "open"],
  ["billboard", "hoarding", "open", "tree", "billboard"],
  ["temple", "tree", "wall", "bigTree"],
  ["auto", "truck", "clutter", "barrels", "repair"],
  ["waterKiosk", "chaiStall", "shop", "sign", "kiosk"]
];

let sectionIndex = 0;

// ------------------------------------------------------------
// CONSISTENT WORLD-SPACE CATEGORY SCALE
//
// Each prop's draw function has its own intrinsic proportions. To
// make the roadside read as a coherent world, every category gets a
// scale factor that maps its draw units into a shared world scale
// (relative to the ~100px car body):
//
//   * Small roadside clutter  ~1.0x  (carts, bikes, stalls)
//   * Houses / shops          ~0.85–1.0x
//   * Large buildings/emblems  ~1.0–1.4x (dhaba, bus stop, petrol)
//   * Tall objects (poles/trees) ~1.2–1.4x (height-biased)
//   * Billboards handled by BillboardSystem (kept small here)
//
// The important outcome is *relative* consistency — a shop is never
// bigger than a dhaba, a house is never smaller than a cart, and a
// billboard stays big enough to notice but small enough to believe.
// ------------------------------------------------------------
const PROP_SIZES = {
  // DO NOT TOUCH BILLBOARDS
  billboard: 1.1,
  hoarding: 0.9,

  // Major roadside structures
  dhaba: 1.25,
  petrolPump: 1.25,
  busStop: 1.45,
  repair: 1.2,
  service: 1.2,
  shop: 1.15,
  kiosk: 1.15,
  waterKiosk: 1.15,
  house: 1.2,
  temple: 1.3,

  // Vehicles / roadside objects
  truck: 1.35,
  auto: 1.1,
  motorcycle: 1.0,
  cart: 1.1,
  fruit: 1.1,
  chaiStall: 1.15,
  foodStall: 1.15,
  haat: 1.3,

  // Vegetation
  bigTree: 1.4,
  tree: 1.05,
  bush: 1.0,

  // Infrastructure
  utilityPole: 1.5,
  sign: 1.2,
  wall: 1.1,
  clutter: 1.0,
  barrels: 1.0,
  drain: 1.0,

  // Empty/open scenery
  open: 1.0
};

// ------------------------------------------------------------
// PER-CATEGORY ROADSIDE PLACEMENT BANDS
//
// Distance from the road centre line, in road half-widths (1.0 = road
// edge / shoulder, ~6 m). Small clutter hugs the shoulder; shops and
// kiosks sit just outside it; large buildings and billboards stand
// farther back so they never loom over the lane or overlap the road.
//
// These bands give every prop an intentional relationship with the
// road instead of one shared random band.
// ------------------------------------------------------------
const PROP_PLACEMENT = {
  // Billboards now render significantly larger (300–380 scene units),
  // so they are pushed farther back than any other prop — far enough
  // that the bigger board never reaches toward the road or overlaps
  // the player's lane.
  billboard:   [2.8, 3.6],
  hoarding:    [1.9, 2.7],
  petrolPump:  [1.7, 2.5],
  busStop:     [1.7, 2.5],
  dhaba:       [1.7, 2.5],
  repair:      [1.5, 2.2],
  service:     [1.5, 2.2],
  shop:        [1.5, 2.1],
  kiosk:       [1.35, 1.8],
  waterKiosk:  [1.4, 1.9],
  haat:        [1.5, 2.1],
  fruit:       [1.3, 1.75],
  chaiStall:   [1.4, 1.95],
  foodStall:   [1.4, 1.95],
  temple:      [1.6, 2.2],
  wall:        [1.3, 1.8],
  bigTree:     [1.5, 2.2],
  tree:        [1.4, 2.0],
  bush:        [1.3, 1.75],
  truck:       [1.5, 2.4],
  auto:        [1.3, 1.8],
  motorcycle:  [1.25, 1.7],
  cart:        [1.3, 1.8],
  sign:        [1.15, 1.5],
  utilityPole: [1.15, 1.5],
  clutter:     [1.2, 1.65],
  barrels:     [1.3, 1.8],
  drain:       [1.1, 1.5],
  open:        [1.2, 1.8]
};

function pickSceneryKind() {
  const pool = ROADSIDE_SECTIONS[sectionIndex % ROADSIDE_SECTIONS.length];
  sectionIndex++;
  return pool[Math.floor(Math.random() * pool.length)];
}

function getSceneryOffset(kind) {
  const band = PROP_PLACEMENT[kind];
  return band ? rand(band[0], band[1]) : rand(1.45, 2.05);
}

function makeScenery() {
  scenery.length = 0;
  sectionIndex = 0;

  let clusterSide = 1;

  for (let i = 0; i < SCENERY_COUNT; i++) {
    // Keep a few consecutive props on the same side so the sections
    // read as roadside clusters rather than isolated objects.
    if (i % 4 === 0) {
      clusterSide = Math.random() < 0.5 ? 1 : -1;
    }

    const kind = pickSceneryKind();

    scenery.push({
      side: clusterSide,
      depth: Math.random(),
      offset: getSceneryOffset(kind),
      kind,
      size: PROP_SIZES[kind] || 1,
      phase: Math.random() * TAU,
      // Per-object variation so recycled props don't look identical.
      variant: Math.floor(Math.random() * 4),
      color: Math.random(),
      // Feature flags used by the draw functions.
      water: kind === "house" && Math.random() < 0.5,
      transformer:
        kind === "utilityPole" && Math.random() < 0.35,
      gate: kind === "wall" && Math.random() < 0.45,
      billboard:
        kind === "billboard" && BILLBOARD_IMAGES.length > 0
          ? BILLBOARD_IMAGES[Math.floor(Math.random() * BILLBOARD_IMAGES.length)]
          : null
    });
  }
}

makeScenery();

// ============================================================
// PRELOAD IMPORTANT ASSETS (non-blocking)
// ------------------------------------------------------------
// The game loop starts immediately; these fetches happen in the
// background through the shared AssetManager cache so that:
//   * billboard textures are decoded before the first billboard scrolls
//     into view (high priority — they pop into frame often),
//   * collision sound files are buffered before a collision happens
//     (high priority — the first hit must not stall waiting on audio),
//   * no audio/image is ever fetched twice (the cache dedupes).
// All preloads settle in the background; failures are ignored so a
// missing file can never block the game.
// ============================================================
function preloadCriticalAssets() {
  // High priority: billboard textures (needed immediately on screen).
  billboardSystem.preload(BILLBOARD_IMAGES);

  // High priority: collision sounds — must be ready before contact.
  // audioManager.preload returns a Promise that uses canplaythrough,
  // which is the correct "ready to play" signal. We intentionally do
  // NOT await it: the game should remain responsive immediately.
  //
  // The batched preloader keeps at most a few audio fetches in flight
  // at once so the full set of collision sounds (currently 34 MP3s on
  // disk) doesn't monopolise the browser's connection pool and delay
  // the billboard textures above.
  assetManager.preloadBatched(
    (url) => audioManager.preload([url]),
    COLLISION_SOUNDS,
    3
  );
}

preloadCriticalAssets();

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

// Perspective curve. depth=0 is the horizon, depth=1 is close to the player.
function perspective(depth) {
  const eased = Math.pow(clamp(depth, 0, 1), 1.65);
  return {
    y: lerp(road.horizonY, road.bottomY, eased),
    width: lerp(road.farHalfWidth, road.nearHalfWidth, eased)
  };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function roadX(worldX, depth) {
  const p = perspective(depth);
  return 0.5 + worldX * p.width;
}

function laneWorldX(lane) {
  return ((lane + 0.5) / road.laneCount - 0.5) * road.worldWidth / road.worldWidth;
}

function checkTrafficCollisions() {
  for (const car of traffic.cars) {
    // Already launched cars cannot collide again.
    if (car.hit) continue;

    // Traffic must be close to the player.
    const depthDifference =
      Math.abs(car.depth - 0.98);

    if (depthDifference > 0.075) {
      continue;
    }

    // Check lane overlap.
    const laneDifference =
      Math.abs(car.lane - state.lane);

    if (laneDifference > 0.42) {
      continue;
    }

    // Collision!
    const launchDirection =
      car.lane < state.lane ? -1 : 1;

    car.launch(launchDirection);

    const hitEvent = scoring.registerHit(car);

    handleScoreHit(hitEvent);

    playRandomCollisionSound();

    break;
  }
}

function update(dt) {
  state.time += dt;

  const input = {
    accelerate:
      keys.has("KeyW") ||
      keys.has("ArrowUp") ||
      touchInput.accelerate,
    brake:
      keys.has("KeyS") ||
      keys.has("ArrowDown") ||
      touchInput.brake,
    left:
      keys.has("KeyA") ||
      keys.has("ArrowLeft") ||
      touchInput.left,
    right:
      keys.has("KeyD") ||
      keys.has("ArrowRight") ||
      touchInput.right
  };

  // W accelerates toward cruise speed; S slows down.
  const maxSpeed = 0.34;
  const acceleration = 0.22;
  const deceleration = 0.25;

  if (input.accelerate) {
    state.forwardSpeed = Math.min(maxSpeed, state.forwardSpeed + acceleration * dt);
  } else {
    state.forwardSpeed = Math.max(0.08, state.forwardSpeed - deceleration * 0.22 * dt);
  }

  if (input.brake) {
    state.forwardSpeed = Math.max(0, state.forwardSpeed - deceleration * dt);
  }

  // Lane input changes the target lane, while actual movement is smoothed.
  if (input.left) {
    if (!state._leftLatch) {
      state.laneTarget = Math.max(0, state.laneTarget - 1);
      state._leftLatch = true;
    }
  } else {
    state._leftLatch = false;
  }

  if (input.right) {
    if (!state._rightLatch) {
      state.laneTarget = Math.min(road.laneCount - 1, state.laneTarget + 1);
      state._rightLatch = true;
    }
  } else {
    state._rightLatch = false;
  }

  // Critically damped-ish lane transition: smooth drift instead of teleport.
  const laneError = state.laneTarget - state.lane;
  const laneResponse = 7.5;
  const laneVelocity = laneError * laneResponse;
  state.lane += laneVelocity * dt;

  // Tiny lateral lean makes the drift visually readable.
  player.lean = clamp(laneError * -0.9, -0.18, 0.18);
  player.bob += dt * (5 + state.forwardSpeed * 20);

  state.distance += state.forwardSpeed * dt;

  state.roadOffset = (state.roadOffset + state.forwardSpeed * dt * 0.95) % 1;

  player.update(dt, input, state);
  traffic.update(dt, state.forwardSpeed);

  checkTrafficCollisions();

  // Move scenery toward camera and recycle it.
  for (const obj of scenery) {
    obj.depth += state.forwardSpeed * dt * 0.95;
    if (obj.depth > 1.08) {
      obj.depth -= 1.08;

      obj.side = Math.random() < 0.5 ? -1 : 1;

      // Re-pick from the section compositions.
      obj.kind = pickSceneryKind();
      obj.size = PROP_SIZES[obj.kind] || 1;
      
      // Apply billboard-specific offset for recycled objects.
      obj.offset = getSceneryOffset(obj.kind);
      
      obj.phase = Math.random() * TAU;
      obj.variant = Math.floor(Math.random() * 4);
      obj.color = Math.random();

      obj.water = obj.kind === "house" && Math.random() < 0.5;
      obj.transformer =
        obj.kind === "utilityPole" && Math.random() < 0.35;
      obj.gate = obj.kind === "wall" && Math.random() < 0.45;

      // Assign a billboard texture (or null for empty billboards).
      obj.billboard =
        obj.kind === "billboard" && BILLBOARD_IMAGES.length > 0
          ? BILLBOARD_IMAGES[Math.floor(Math.random() * BILLBOARD_IMAGES.length)]
          : null;
    }
  }

  speedLabel.textContent = `${Math.round(state.forwardSpeed / maxSpeed * 160)} km/h`;
}

function draw() {
  const w = innerWidth;
  const h = innerHeight;

  // World / sky.
  ctx.fillStyle = "#9bc7e6";
  ctx.fillRect(0, 0, w, h);

  // Distant haze.
  const horizon = h * road.horizonY;
  ctx.fillStyle = "#b7d6bd";
  ctx.fillRect(0, horizon, w, h - horizon);

  drawGrass(w, h);
  drawRoad(w, h);
  drawScenery(w, h);
  traffic.draw(
    ctx,
    road,
    roadPoint,
    perspective
  );
  drawPlayer(w, h);
}

function drawGrass(w, h) {
  const horizon = h * road.horizonY;

  // Ground bands scroll at the same rate as the road markings
  // (state.roadOffset), so the roadside flows past the player in sync.
  const bandCount = 18;
  const bandScroll = state.roadOffset * bandCount;

  for (let k = -bandCount; k < bandCount; k++) {
    const d0 = (k + bandScroll) / bandCount;
    const d1 = (k + 1 + bandScroll) / bandCount;
    if (d1 <= 0 || d0 >= 1) continue;

    const s = Math.max(0, d0);
    const e = Math.min(1, d1);
    const y0 = lerp(horizon, h, Math.pow(s, 1.6));
    const y1 = lerp(horizon, h, Math.pow(e, 1.6));
    ctx.fillStyle = k % 2 ? "#76a65b" : "#729e58";
    ctx.fillRect(0, y0, w, y1 - y0 + 1);
  }

  // Grass blades: each lives in a world cell that scrolls with the road,
  // so they flow past the player instead of flickering in place.
  const cellCount = 32;
  const cellScroll = state.roadOffset * cellCount;

  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = "#d7e8b9";
  ctx.lineWidth = 1;

  for (let c = -cellCount; c < cellCount; c++) {
    const d0 = (c + cellScroll) / cellCount;
    const d1 = (c + 1 + cellScroll) / cellCount;
    if (d1 <= 0 || d0 >= 1) continue;

    const s = Math.max(0, d0);
    const e = Math.min(1, d1);
    const y0 = lerp(horizon, h, Math.pow(s, 1.6));
    const y1 = lerp(horizon, h, Math.pow(e, 1.6));

    // World cell identity, stable across scroll wrapping.
    const wc = ((c + Math.floor(cellScroll)) % cellCount + cellCount) % cellCount;

    for (let b = 0; b < 4; b++) {
      const seed = wc * 10 + b;
      const bladeT = hash01(seed);
      const depth = s + (e - s) * bladeT;
      const y = lerp(y0, y1, bladeT);
      const x = w * hash01(seed + 1);
      const growth = Math.pow(depth, 1.3);
      const height = 1 + growth * 7;
      const lean = (hash01(seed + 2) - 0.5) * 6;

      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + lean, y - height);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
}

function drawRoad(w, h) {
  const topY = h * road.horizonY;
  const bottomY = h * road.bottomY;

  // Road edges use the exact same perspective geometry as the lane markers.
  const topHalf = w * road.farHalfWidth;
  const bottomHalf = w * road.nearHalfWidth;

  // Shoulder.
  ctx.beginPath();
  ctx.moveTo(w / 2 - topHalf * 1.18, topY);
  ctx.lineTo(w / 2 + topHalf * 1.18, topY);
  ctx.lineTo(w / 2 + bottomHalf * 1.18, bottomY);
  ctx.lineTo(w / 2 - bottomHalf * 1.18, bottomY);
  ctx.closePath();
  ctx.fillStyle = "#c8b477";
  ctx.fill();

  // Main asphalt.
  ctx.beginPath();
  ctx.moveTo(w / 2 - topHalf, topY);
  ctx.lineTo(w / 2 + topHalf, topY);
  ctx.lineTo(w / 2 + bottomHalf, bottomY);
  ctx.lineTo(w / 2 - bottomHalf, bottomY);
  ctx.closePath();
  ctx.fillStyle = "#44474a";
  ctx.fill();

  // Road edge markings.
  drawRoadBoundary(-1, "#f0e8bd");
  drawRoadBoundary(1, "#f0e8bd");

  // Exactly three lane separators for exactly four lanes.
  // Each separator is calculated from the road width at that depth.
  for (let lane = 1; lane < road.laneCount; lane++) {
    const fraction = lane / road.laneCount;
    drawLaneMarker(fraction);
  }

  // Very subtle asphalt highlight.
  ctx.globalAlpha = 0.055;
  drawRoadBoundary(0, "#ffffff");
  ctx.globalAlpha = 1;
}

function roadPoint(fraction, depth, w, h) {
  const p = perspective(depth);
  // fraction 0 = left road edge, 0.5 = center, 1 = right road edge.
  const world = (fraction - 0.5) * 2;
  return {
    x: w * (0.5 + world * p.width),
    y: h * p.y
  };
}

function drawRoadBoundary(side, color) {
  const w = innerWidth;
  const h = innerHeight;
  const fraction = side < 0 ? 0 : side > 0 ? 1 : 0.5;
  const a = roadPoint(fraction, 0, w, h);
  const b = roadPoint(fraction, 1, w, h);

  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.2, w * 0.0045);
  ctx.stroke();
}

function drawLaneMarker(fraction) {
  const w = innerWidth;
  const h = innerHeight;

  // Number of repeating dash segments.
  const segments = 18;

  // Each segment contains a dash and a gap.
  const cycle = 1 / segments;

  // Dash occupies 45% of each cycle.
  const dashLength = cycle * 0.45;

  for (let i = 0; i < segments; i++) {
    // Continuous depth position.
    let d0 =
      i * cycle + state.roadOffset;

    // Wrap smoothly.
    d0 %= 1;

    const d1 = Math.min(
      d0 + dashLength,
      1
    );

    // If the dash wrapped around the horizon,
    // skip it for this frame.
    if (d0 >= 0 && d0 < 1 && d1 > d0) {

      const a = roadPoint(
        fraction,
        d0,
        w,
        h
      );

      const b = roadPoint(
        fraction,
        d1,
        w,
        h
      );

      // Perspective thickness.
      const perspectiveAmount =
        Math.pow(d0, 1.4);

      ctx.beginPath();

      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);

      ctx.strokeStyle = "#e7e3ce";

      ctx.lineWidth =
        Math.max(
          1,
          w *
          lerp(
            0.0007,
            0.0035,
            perspectiveAmount
          )
        );

      ctx.lineCap = "butt";

      ctx.stroke();
    }
  }
}

function drawPerspectiveLine(worldX, color, widthRatio) {
  const w = innerWidth;
  const h = innerHeight;
  const top = perspective(0);
  const bottom = perspective(1);

  ctx.beginPath();
  ctx.moveTo(w * roadX(worldX, 0), h * top.y);
  ctx.lineTo(w * roadX(worldX, 1), h * bottom.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, w * widthRatio);
  ctx.stroke();
}

function drawDashedPerspectiveLine(worldX, color) {
  const w = innerWidth;
  const h = innerHeight;
  const pieces = 34;

  for (let i = 0; i < pieces; i++) {
    if (i % 2 === 0) continue;

    const d0 = i / pieces;
    const d1 = (i + 0.58) / pieces;
    const p0 = perspective(d0);
    const p1 = perspective(d1);

    ctx.beginPath();
    ctx.moveTo(w * roadX(worldX, d0), h * p0.y);
    ctx.lineTo(w * roadX(worldX, d1), h * p1.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.2, w * 0.004 * (0.35 + d0));
    ctx.stroke();
  }
}

function drawScenery(w, h) {
  const sorted = [...scenery].sort((a, b) => a.depth - b.depth);

  for (const obj of sorted) {
    const p = perspective(obj.depth);

    const x = w * (0.5 + obj.side * p.width * obj.offset);
    const y = h * p.y;

    // Base perspective scale, then a per-prop category multiplier so
    // the whole roadside shares a coherent world scale (see PROP_SIZES).
    const scale = lerp(
      0.18,
      1.15,
      Math.pow(obj.depth, 1.3)
    ) * (obj.size || 1);

    switch (obj.kind) {
      case "tree":
      case "bigTree":
        drawTree(x, y, scale, obj.variant);
        break;
      case "bush":
        drawBush(x, y, scale);
        break;
      case "wall":
        drawWall(x, y, scale, obj.side, obj.color);
        break;
      case "house":
        drawHouse(x, y, scale, obj.side, obj.color, obj.water);
        break;
      case "shop":
        drawShop(x, y, scale, obj.side, obj.color);
        break;
      case "chaiStall":
        drawChaiStall(x, y, scale, obj.side, obj.color);
        break;
      case "foodStall":
        drawFoodStall(x, y, scale, obj.side, obj.color);
        break;
      case "kiosk":
        drawKiosk(x, y, scale, obj.color);
        break;
      case "waterKiosk":
        drawWaterKiosk(x, y, scale, obj.color);
        break;
      case "haat":
        drawHaat(x, y, scale, obj.color);
        break;
      case "fruit":
        drawFruit(x, y, scale, obj.color);
        break;
      case "auto":
        drawAuto(x, y, scale);
        break;
      case "motorcycle":
        drawMotorcycle(x, y, scale);
        break;
      case "truck":
        drawTruck(x, y, scale);
        break;
      case "repair":
        drawRepair(x, y, scale, obj.color);
        break;
      case "service":
        drawService(x, y, scale, obj.color);
        break;
      case "temple":
        drawTemple(x, y, scale, obj.color);
        break;
      case "hoarding":
        drawHoarding(x, y, scale, obj.color);
        break;
      case "clutter":
        drawClutter(x, y, scale, obj.color);
        break;
      case "barrels":
        drawBarrels(x, y, scale, obj.color);
        break;
      case "drain":
        drawDrain(x, y, scale);
        break;
      case "utilityPole":
        drawUtilityPole(x, y, scale, obj.side, obj.transformer);
        break;
      case "sign":
        drawSign(x, y, scale, obj.side, obj.color);
        break;
      case "billboard":
        billboardSystem.draw(ctx, x, y, scale, obj.side, obj.billboard);
        break;
      case "dhaba":
        drawDhaba(x, y, scale, obj.side, obj.color);
        break;
      case "busStop":
        drawBusStop(x, y, scale, obj.side);
        break;
      case "petrolPump":
        drawPetrolPump(x, y, scale, obj.side, obj.color);
        break;
      case "cart":
        drawCart(x, y, scale, obj.side, obj.color);
        break;
      case "open":
      default:
        // Open ground / empty patch — nothing drawn.
        break;
    }
  }
}

function drawHouse(x, y, s, side, color) {
  const width = 55 * s;
  const height = 45 * s;
  const palette = ["#d9c09b", "#c9a97a", "#b8a08a", "#e0c9a0"];
  const body = palette[Math.floor(color * palette.length) % palette.length];

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,.14)";
  ctx.beginPath();
  ctx.ellipse(
    x,
    y + 4 * s,
    width * 0.65,
    8 * s,
    0,
    0,
    TAU
  );
  ctx.fill();

  // Building
  ctx.fillStyle = body;
  ctx.fillRect(
    x - width / 2,
    y - height,
    width,
    height
  );

  // Roof
  ctx.fillStyle = "#9a4f3f";

  ctx.beginPath();
  ctx.moveTo(
    x - width * 0.62,
    y - height
  );

  ctx.lineTo(
    x,
    y - height - 25 * s
  );

  ctx.lineTo(
    x + width * 0.62,
    y - height
  );

  ctx.closePath();
  ctx.fill();

  // Door
  ctx.fillStyle = "#654534";
  ctx.fillRect(
    x - 6 * s,
    y - 25 * s,
    12 * s,
    25 * s
  );

  // Windows
  ctx.fillStyle = "#86b8c7";

  ctx.fillRect(
    x - width * 0.32,
    y - height * 0.72,
    13 * s,
    12 * s
  );

  ctx.fillRect(
    x + width * 0.08,
    y - height * 0.72,
    13 * s,
    12 * s
  );
}


function drawPark(x, y, s) {
  const width = 75 * s;

  // Ground
  ctx.fillStyle = "#648f4d";
  ctx.beginPath();
  ctx.ellipse(
    x,
    y,
    width,
    22 * s,
    0,
    0,
    TAU
  );
  ctx.fill();

  // Path
  ctx.fillStyle = "#c8b58b";
  ctx.beginPath();
  ctx.ellipse(
    x,
    y,
    width * 0.7,
    6 * s,
    0,
    0,
    TAU
  );
  ctx.fill();

  // Small trees inside park
  drawMiniTree(
    x - 28 * s,
    y - 8 * s,
    s
  );

  drawMiniTree(
    x + 25 * s,
    y - 5 * s,
    s
  );
}


function drawMiniTree(x, y, s) {
  ctx.fillStyle = "#6d4c35";
  ctx.fillRect(
    x - 3 * s,
    y - 22 * s,
    6 * s,
    22 * s
  );

  ctx.fillStyle = "#477844";

  ctx.beginPath();
  ctx.arc(
    x,
    y - 27 * s,
    15 * s,
    0,
    TAU
  );

  ctx.fill();
}


function drawWall(x, y, s, side, color) {
  const width = 90 * s;
  const height = 14 * s;
  const palette = ["#b8b0a0", "#a8a090", "#c0b8a8", "#b0a898"];
  const body = palette[Math.floor(color * palette.length) % palette.length];

  ctx.fillStyle = "rgba(0,0,0,.12)";
  ctx.fillRect(
    x - width / 2,
    y + 2 * s,
    width,
    5 * s
  );

  ctx.fillStyle = body;

  ctx.fillRect(
    x - width / 2,
    y - height,
    width,
    height
  );

  // Wall segments
  ctx.strokeStyle = "#8d877b";
  ctx.lineWidth = Math.max(1, 1.5 * s);

  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();

    ctx.moveTo(
      x + i * 13 * s,
      y - height
    );

    ctx.lineTo(
      x + i * 13 * s,
      y
    );

    ctx.stroke();
  }
}

function drawTree(x, y, s, variant) {
  const trunkW = 8 * s;
  const trunkH = 25 * s;
  const canopy = 28 * s;
  const canopyColors = ["#3f713d", "#4f8445", "#2f6a3a", "#5a8a4a"];
  const canopyColor = canopyColors[variant % canopyColors.length];

  ctx.fillStyle = "rgba(0,0,0,.14)";
  ctx.beginPath();
  ctx.ellipse(x, y + 3 * s, canopy * 0.75, 7 * s, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = "#6d4c35";
  ctx.fillRect(x - trunkW / 2, y - trunkH, trunkW, trunkH);

  ctx.fillStyle = canopyColor;
  ctx.beginPath();
  ctx.arc(x, y - trunkH - canopy * 0.35, canopy, 0, TAU);
  ctx.fill();

  ctx.fillStyle = "#4f8445";
  ctx.beginPath();
  ctx.arc(x - canopy * 0.45, y - trunkH - canopy * 0.15, canopy * 0.62, 0, TAU);
  ctx.fill();
}

function drawBush(x, y, s) {
  const r = 14 * s;
  ctx.fillStyle = "rgba(0,0,0,.12)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2 * s, r, r * 0.35, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = "#4c7e3e";
  ctx.beginPath();
  ctx.arc(x - r * .5, y, r * .55, 0, TAU);
  ctx.arc(x + r * .15, y - r * .18, r * .72, 0, TAU);
  ctx.arc(x + r * .55, y, r * .5, 0, TAU);
  ctx.fill();
}

// ============================================================
// INDIAN ROADSIDE PROPS (procedural, lightweight Canvas2D)
// ============================================================







// Auto-rickshaw (parked roadside prop).
function drawAuto(x, y, s) {
  const w = 30 * s;
  const h = 26 * s;

  ctx.fillStyle = "rgba(0,0,0,.14)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2 * s, w * 0.6, 5 * s, 0, 0, TAU);
  ctx.fill();

  // Lower body
  ctx.fillStyle = "#333";
  ctx.fillRect(x - w / 2, y - h / 2, w * 0.62, h / 2);

  // Upper canopy (rounded)
  ctx.fillStyle = "#c93632";
  ctx.beginPath();
  ctx.moveTo(x - w * 0.31, y - h / 2);
  ctx.quadraticCurveTo(x, y - h, x + w * 0.31, y - h / 2);
  ctx.closePath();
  ctx.fill();

  // Windshield
  ctx.fillStyle = "#9bc7e6";
  ctx.fillRect(x - 8 * s, y - h * 0.5, 16 * s, 5 * s);

  // Wheels
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(x - w * 0.25, y - 2 * s, 3.5 * s, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + w * 0.25, y - 2 * s, 3.5 * s, 0, TAU);
  ctx.fill();
}

// Motorcycle / scooter parked roadside.
function drawMotorcycle(x, y, s) {
  const w = 26 * s;
  const h = 18 * s;

  ctx.fillStyle = "rgba(0,0,0,.12)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2 * s, w * 0.5, 4 * s, 0, 0, TAU);
  ctx.fill();

  // Body / seat
  ctx.fillStyle = "#444";
  ctx.fillRect(x - w * 0.2, y - h, w * 0.55, h * 0.75);

  // Handlebar
  ctx.strokeStyle = "#222";
  ctx.lineWidth = Math.max(1, 2 * s);
  ctx.beginPath();
  ctx.moveTo(x - w * 0.2, y - h * 0.9);
  ctx.lineTo(x + w * 0.26, y - h);
  ctx.stroke();

  // Wheels
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(x - w * 0.28, y - 2 * s, 3.5 * s, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + w * 0.28, y - 2 * s, 3.5 * s, 0, TAU);
  ctx.fill();
}

// Truck / mini truck (parked scenery).
function drawTruck(x, y, s) {
  const w = 50 * s;
  const h = 26 * s;

  ctx.fillStyle = "rgba(0,0,0,.14)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2 * s, w * 0.6, 6 * s, 0, 0, TAU);
  ctx.fill();

  // Cargo box
  ctx.fillStyle = "#7a6a5a";
  ctx.fillRect(x - w * 0.1, y - h, w * 0.55, h);

  // Cab
  ctx.fillStyle = "#4a6a8a";
  ctx.fillRect(x - w * 0.45, y - h * 0.85, w * 0.4, h * 0.6);

  // Cab window
  ctx.fillStyle = "#9bc7e6";
  ctx.fillRect(x - w * 0.4, y - h * 0.8, w * 0.16, h * 0.18);

  // Wheels
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(x - w * 0.3, y - 2 * s, 5 * s, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + w * 0.28, y - 2 * s, 5 * s, 0, TAU);
  ctx.fill();
}

// Kiosk (tiny box stall).
function drawKiosk(x, y, s, color) {
  const w = 32 * s;
  const h = 30 * s;
  const palette = ["#c93632", "#2a4a6a", "#6a8a2a", "#8a5a2a"];
  const accent = palette[Math.floor(color * palette.length) % palette.length];

  ctx.fillStyle = "rgba(0,0,0,.14)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2 * s, w * 0.5, 5 * s, 0, 0, TAU);
  ctx.fill();

  // Box body
  ctx.fillStyle = "#d9c09b";
  ctx.fillRect(x - w / 2, y - h, w, h);

  // Open front
  ctx.fillStyle = "#3a2a20";
  ctx.fillRect(x - w * 0.3, y - h * 0.5, w * 0.6, h * 0.5);

  // Corrugated roof
  ctx.fillStyle = "#777";
  ctx.fillRect(x - w / 2 - 3 * s, y - h - 4 * s, w + 6 * s, 5 * s);

  // Colorful sign
  ctx.fillStyle = accent;
  ctx.fillRect(x - w * 0.35, y - h - 1 * s, w * 0.7, 6 * s);
}

// Water / cool-drink kiosk.
function drawWaterKiosk(x, y, s, color) {
  const w = 36 * s;
  const h = 28 * s;

  ctx.fillStyle = "rgba(0,0,0,.14)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2 * s, w * 0.5, 5 * s, 0, 0, TAU);
  ctx.fill();

  // Canopy
  ctx.fillStyle = color < 0.5 ? "#2a6a8a" : "#8a2a3a";
  ctx.fillRect(x - w / 2 - 3 * s, y - h - 5 * s, w + 6 * s, 5 * s);

  // Counter
  ctx.fillStyle = "#5a4a3a";
  ctx.fillRect(x - w / 2, y - h * 0.72, w, 6 * s);

  // Cooler/fridge box
  ctx.fillStyle = "#e8e4d8";
  ctx.fillRect(x - w * 0.2, y - h, w * 0.4, h * 0.5);
  ctx.strokeStyle = "#999";
  ctx.lineWidth = Math.max(1, 1.5 * s);
  ctx.strokeRect(x - w * 0.2, y - h, w * 0.4, h * 0.5);

  // Bottles (tiny colored columns)
  ctx.fillStyle = "#3a7a3a";
  ctx.fillRect(x + w * 0.1, y - h * 0.7, 2.5 * s, 6 * s);
  ctx.fillStyle = "#c9a93a";
  ctx.fillRect(x + w * 0.22, y - h * 0.7, 2.5 * s, 6 * s);
}

// Village haat / local produce stall.
function drawHaat(x, y, s, color) {
  const w = 60 * s;
  const h = 22 * s;

  ctx.fillStyle = "rgba(0,0,0,.14)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2 * s, w * 0.55, 6 * s, 0, 0, TAU);
  ctx.fill();

  // Cloth canopy
  ctx.fillStyle = color < 0.33 ? "#c93632" : color < 0.66 ? "#3a6aa8" : "#c8a83a";
  ctx.fillRect(x - w * 0.52, y - h * 0.85, w * 1.04, 7 * s);

  // Support poles
  ctx.fillStyle = "#5a4a3a";
  ctx.fillRect(x - w * 0.5, y - h * 0.7, 3 * s, h * 0.7);
  ctx.fillRect(x + w * 0.47, y - h * 0.7, 3 * s, h * 0.7);

  // Table
  ctx.fillStyle = "#8a6a4a";
  ctx.fillRect(x - w * 0.5, y - h * 0.6, w, 5 * s);

  // Produce piles
  ctx.fillStyle = "#c8a83a";
  ctx.beginPath();
  ctx.arc(x - w * 0.3, y - h * 0.65, 3 * s, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#3a8a3a";
  ctx.beginPath();
  ctx.arc(x, y - h * 0.68, 3 * s, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#c85a3a";
  ctx.beginPath();
  ctx.arc(x + w * 0.3, y - h * 0.65, 3 * s, 0, TAU);
  ctx.fill();
}

// Fruit/vegetable thela (cart with produce).
function drawFruit(x, y, s, color) {
  const w = 34 * s;
  const h = 22 * s;

  ctx.fillStyle = "rgba(0,0,0,.12)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2 * s, w * 0.55, 5 * s, 0, 0, TAU);
  ctx.fill();

  // Platform
  ctx.fillStyle = "#8a6a4a";
  ctx.fillRect(x - w / 2, y - h * 0.7, w, 4 * s);

  // Produce clusters (colored circles)
  const fruitColors = ["#c85a3a", "#c8a83a", "#3a8a3a", "#c8d83a", "#c8362a"];
  for (let i = -2, ci = 0; i <= 2; i++, ci++) {
    ctx.fillStyle = fruitColors[(ci + Math.floor(color * 3)) % fruitColors.length];
    ctx.beginPath();
    ctx.arc(x + i * 6 * s, y - h * 0.85, 4 * s, 0, TAU);
    ctx.fill();
  }

  // Cloth shade on top
  ctx.fillStyle = "#d8c8a8";
  ctx.fillRect(x - 10 * s, y - h, 20 * s, 3 * s);

  // Wheels
  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.arc(x - w * 0.32, y - 2 * s, 4 * s, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + w * 0.32, y - 2 * s, 4 * s, 0, TAU);
  ctx.fill();
}

// Repair / puncture shop (corrugated shed + tires).
function drawRepair(x, y, s, color) {
  const w = 48 * s;
  const h = 26 * s;

  ctx.fillStyle = "rgba(0,0,0,.14)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2 * s, w * 0.55, 5 * s, 0, 0, TAU);
  ctx.fill();

  // Corrugated roof
  ctx.fillStyle = "#777";
  ctx.fillRect(x - w / 2 - 4 * s, y - h - 5 * s, w + 8 * s, 6 * s);
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = "rgba(255,255,255,.15)";
    ctx.fillRect(x - w / 2 - 4 * s + i * ((w + 8 * s) / 6), y - h - 5 * s, 2 * s, 6 * s);
  }

  // Open front
  ctx.fillStyle = "#3a2f2a";
  ctx.fillRect(x - w / 2, y - h, w, h * 0.8);

  // Tire stack (recognizable)
  ctx.strokeStyle = "#222";
  ctx.lineWidth = Math.max(1, 2 * s);
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(x - w * 0.35, y - h + i * 6 * s, 6 * s, 3 * s, 0, 0, TAU);
    ctx.stroke();
  }

  // Toolbox
  ctx.fillStyle = "#c84a2a";
  ctx.fillRect(x + w * 0.15, y - h + 2 * s, 10 * s, 6 * s);
}

// Service shed (wider, lower).
function drawService(x, y, s, color) {
  const w = 60 * s;
  const h = 20 * s;

  ctx.fillStyle = "rgba(0,0,0,.14)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2 * s, w * 0.55, 5 * s, 0, 0, TAU);
  ctx.fill();

  // Corrugated roof
  ctx.fillStyle = "#8a6a4a";
  ctx.fillRect(x - w / 2 - 4 * s, y - h - 5 * s, w + 8 * s, 6 * s);

  // Open front
  ctx.fillStyle = "#3a2f2a";
  ctx.fillRect(x - w / 2, y - h, w, h * 0.8);

  // Air pump (vertical cylinder)
  ctx.fillStyle = "#c93632";
  ctx.fillRect(x + w * 0.25, y - h * 0.9, 4 * s, 12 * s);
  ctx.fillStyle = "#e8e4d8";
  ctx.fillRect(x + w * 0.25 - 1 * s, y - h * 0.9, 6 * s, 3 * s);
}

// Small temple / roadside shrine (occasional).
function drawTemple(x, y, s, color) {
  const w = 26 * s;
  const h = 22 * s;

  ctx.fillStyle = "rgba(0,0,0,.12)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2 * s, w * 0.5, 4 * s, 0, 0, TAU);
  ctx.fill();

  // Raised platform
  ctx.fillStyle = "#c8b8a0";
  ctx.fillRect(x - w / 2 - 2 * s, y - 4 * s, w + 4 * s, 4 * s);

  // Shrine room
  ctx.fillStyle = "#e8d8c0";
  ctx.fillRect(x - w * 0.35, y - h, w * 0.7, h * 0.8);

  // Pointed shikhara-like roof
  ctx.fillStyle = "#c85a3a";
  ctx.beginPath();
  ctx.moveTo(x - w * 0.45, y - h);
  ctx.lineTo(x, y - h - 8 * s);
  ctx.lineTo(x + w * 0.45, y - h);
  ctx.closePath();
  ctx.fill();

  // Small flag / pole
  ctx.strokeStyle = "#666";
  ctx.lineWidth = Math.max(1, 1.5 * s);
  ctx.beginPath();
  ctx.moveTo(x + w * 0.2, y - h);
  ctx.lineTo(x + w * 0.2, y - h - 14 * s);
  ctx.stroke();
  ctx.fillStyle = "#fff4c7";
  ctx.fillRect(x + w * 0.2, y - h - 14 * s, 5 * s, 3 * s);

  // Bell silhouette
  ctx.fillStyle = "#c8a83a";
  ctx.fillRect(x + w * 0.38, y - h * 0.6, 2 * s, 5 * s);
}

// Hoarding (long low advertising wall).
function drawHoarding(x, y, s, color) {
  const w = 90 * s;
  const h = 28 * s;

  // Support posts
  ctx.fillStyle = "#666";
  ctx.fillRect(x - w * 0.4, y - h - 6 * s, 4 * s, 6 * s);
  ctx.fillRect(x + w * 0.4 - 4 * s, y - h - 6 * s, 4 * s, 6 * s);

  // Board
  ctx.fillStyle = color < 0.5 ? "#3a6aa8" : "#8a3a4a";
  ctx.fillRect(x - w / 2, y - h, w, h);

  // Border
  ctx.strokeStyle = "#fff4c7";
  ctx.lineWidth = Math.max(1, 2 * s);
  ctx.strokeRect(x - w / 2, y - h, w, h);

  // Sub-panels
  ctx.fillStyle = "rgba(255,255,255,.25)";
  ctx.fillRect(x - w * 0.35, y - h + 5 * s, w * 0.3, h * 0.4);
  ctx.fillRect(x + w * 0.05, y - h + 5 * s, w * 0.3, h * 0.4);
}

// Road clutter (bricks, blocks, etc.).
function drawClutter(x, y, s, color) {
  ctx.fillStyle = "rgba(0,0,0,.10)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2 * s, 12 * s, 3 * s, 0, 0, TAU);
  ctx.fill();

  // Brick stack
  ctx.fillStyle = "#c35d3a";
  ctx.fillRect(x - 8 * s, y - 5 * s, 12 * s, 4 * s);
  ctx.fillRect(x - 5 * s, y - 8 * s, 10 * s, 4 * s);

  // Cement bags
  ctx.fillStyle = "#d8d0c0";
  ctx.fillRect(x + 6 * s, y - 6 * s, 9 * s, 6 * s);
  ctx.strokeStyle = "#a89a80";
  ctx.lineWidth = Math.max(1, 1 * s);
  ctx.strokeRect(x + 6 * s, y - 6 * s, 9 * s, 6 * s);
}

// Barrels / drums.
function drawBarrels(x, y, s, color) {
  ctx.fillStyle = "rgba(0,0,0,.10)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2 * s, 12 * s, 3 * s, 0, 0, TAU);
  ctx.fill();

  const barrelColors = ["#3a6aa8", "#c8a83a", "#8a4a3a"];
  for (let i = 0; i < 2; i++) {
    ctx.fillStyle = barrelColors[(i + Math.floor(color * 2)) % barrelColors.length];
    ctx.fillRect(x - 6 * s + i * 12 * s, y - 12 * s, 8 * s, 12 * s);
  }
}

// Drain / culvert (ground blending).
function drawDrain(x, y, s, color) {
  ctx.fillStyle = "rgba(0,0,0,.08)";
  ctx.fillRect(x - 18 * s, y - 2 * s, 36 * s, 4 * s);
  ctx.fillStyle = "rgba(0,0,0,.14)";
  ctx.fillRect(x - 14 * s, y - 1 * s, 28 * s, 2 * s);
  // Concrete slabs
  ctx.fillStyle = "#999";
  ctx.fillRect(x - 22 * s, y - 3 * s, 6 * s, 3 * s);
  ctx.fillRect(x + 16 * s, y - 3 * s, 6 * s, 3 * s);
}
// ============================================================
// INDIAN ROADSIDE PROPS (procedural, lightweight Canvas2D)
// ============================================================

// Small roadside shop: rectangular structure, front opening, sign, awning.
function drawShop(x, y, s, side, color) {
  const w = 60 * s;
  const h = 40 * s;
  const palette = ["#d9c09b", "#c9a97a", "#b8a08a", "#e0c9a0"];
  const body = palette[Math.floor(color * palette.length) % palette.length];

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,.14)";
  ctx.beginPath();
  ctx.ellipse(x, y + 3 * s, w * 0.6, 7 * s, 0, 0, TAU);
  ctx.fill();

  // Body
  ctx.fillStyle = body;
  ctx.fillRect(x - w / 2, y - h, w, h);

  // Awning (striped)
  ctx.fillStyle = "#c93632";
  ctx.fillRect(x - w / 2, y - h, w, 8 * s);
  ctx.fillStyle = "#fff4c7";
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(x - w / 2 + i * (w / 6), y - h, w / 12, 8 * s);
  }

  // Front opening (dark doorway)
  ctx.fillStyle = "#3a2a20";
  ctx.fillRect(x - 10 * s, y - 22 * s, 20 * s, 22 * s);

  // Sign board above opening
  ctx.fillStyle = "#2a4a6a";
  ctx.fillRect(x - 20 * s, y - h - 6 * s, 40 * s, 6 * s);
}

// Chai stall: recognized Indian chai stall.
function drawChaiStall(x, y, s, side, color) {
  const w = 44 * s;
  const h = 26 * s;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,.14)";
  ctx.beginPath();
  ctx.ellipse(x, y + 3 * s, w * 0.6, 6 * s, 0, 0, TAU);
  ctx.fill();

  // Cart body
  ctx.fillStyle = "#8a6a4a";
  ctx.fillRect(x - w / 2, y - h, w, h);

  // Counter top (with kettle)
  ctx.fillStyle = "#5a4a3a";
  ctx.fillRect(x - w / 2, y - h, w, 4 * s);
  // Kettle/pot on top
  ctx.fillStyle = "#c93632";
  ctx.beginPath();
  ctx.arc(x, y - h - 4 * s, 5 * s, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#333";
  ctx.fillRect(x - 2 * s, y - h - 10 * s, 4 * s, 4 * s);
  // Spout
  ctx.strokeStyle = "#333";
  ctx.lineWidth = Math.max(1, 2 * s);
  ctx.beginPath();
  ctx.moveTo(x + 4 * s, y - h - 6 * s);
  ctx.lineTo(x + 10 * s, y - h - 3 * s);
  ctx.stroke();

  // Cups beside kettle
  ctx.fillStyle = "#e8e0d0";
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(x - 8 * s + i * 4 * s, y - h + 2 * s, 2.5 * s, 4 * s);
  }

  // Awning (striped)
  ctx.fillStyle = "#c93632";
  ctx.fillRect(x - w / 2 - 3 * s, y - h - 14 * s, w + 6 * s, 6 * s);
  ctx.fillStyle = "#fff4c7";
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(x - w / 2 - 3 * s + i * ((w + 6 * s) / 5), y - h - 14 * s, (w + 6 * s) / 10, 6 * s);
  }

  // Support pole
  ctx.fillStyle = "#5a4a3a";
  ctx.fillRect(x + w * 0.35, y - h - 14 * s, 2 * s, h - 30 * s + 14 * s);
}

// Street food stall: cart with two wheels, umbrella, cooking surface.
function drawFoodStall(x, y, s, side, color) {
  const w = 50 * s;
  const h = 24 * s;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,.14)";
  ctx.beginPath();
  ctx.ellipse(x, y + 3 * s, w * 0.6, 6 * s, 0, 0, TAU);
  ctx.fill();

  // Cart body
  ctx.fillStyle = "#7a6a5a";
  ctx.fillRect(x - w / 2, y - h, w, h);

  // Counter top
  ctx.fillStyle = "#4a3a2a";
  ctx.fillRect(x - w / 2, y - h, w, 4 * s);

  // Cooking surface (tawa)
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.arc(x - 10 * s, y - h - 3 * s, 5 * s, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "#555";
  ctx.lineWidth = Math.max(1, 1.5 * s);
  ctx.stroke();

  // Cooking pot
  ctx.fillStyle = "#c93632";
  ctx.beginPath();
  ctx.arc(x + 10 * s, y - h - 2 * s, 4 * s, 0, TAU);
  ctx.fill();

  // Umbrella (red dome)
  ctx.fillStyle = "#c93632";
  ctx.beginPath();
  ctx.arc(x, y - h - 18 * s, 14 * s, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = "#fff4c7";
  ctx.fillRect(x - 1 * s, y - h - 18 * s, 2 * s, 8 * s);

  // Wheels (clearly visible)
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(x - w * 0.3, y - 2 * s, 5 * s, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + w * 0.3, y - 2 * s, 5 * s, 0, TAU);
  ctx.fill();
}

// Utility pole: taller, with crossarms and possible transformer.
function drawUtilityPole(x, y, s, side, hasTransformer) {
  const poleH = 60 * s;
  const poleW = 5 * s;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,.12)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2 * s, 10 * s, 3 * s, 0, 0, TAU);
  ctx.fill();

  // Pole (concrete)
  ctx.fillStyle = "#8a8a80";
  ctx.fillRect(x - poleW / 2, y - poleH, poleW, poleH);
  ctx.fillStyle = "#666";
  ctx.fillRect(x - poleW / 2, y - poleH, poleW, 4 * s);

  // Crossarms (2-3)
  ctx.fillStyle = "#777";
  ctx.fillRect(x - 18 * s, y - poleH + 10 * s, 36 * s, 3.5 * s);
  ctx.fillRect(x - 14 * s, y - poleH + 22 * s, 28 * s, 3 * s);
  ctx.fillRect(x - 10 * s, y - poleH + 32 * s, 20 * s, 3 * s);

  // Insulators
  ctx.fillStyle = "#ddd";
  for (let i = -2; i <= 2; i++) {
    ctx.fillRect(x + i * 8 * s - 1.5 * s, y - poleH + 6 * s, 3 * s, 5 * s);
  }

  // Wires sagging
  ctx.strokeStyle = "rgba(20,20,20,.6)";
  ctx.lineWidth = Math.max(1, 1 * s);
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * 8 * s, y - poleH + 8 * s);
    ctx.quadraticCurveTo(x + i * 8 * s + 6 * s, y - poleH + 18 * s, x + i * 8 * s + 12 * s, y - poleH + 20 * s);
    ctx.stroke();
  }

  // Transformer (occasional)
  if (hasTransformer) {
    ctx.fillStyle = "#a0a0a8";
    ctx.fillRect(x - 6 * s, y - poleH + 30 * s, 12 * s, 10 * s);
    ctx.fillStyle = "#555";
    ctx.fillRect(x - 6 * s, y - poleH + 38 * s, 12 * s, 2 * s);
  }
}

// Roadside sign: metal pole + colored signboard.
function drawSign(x, y, s, side, color) {
  const poleH = 34 * s;
  const signW = 34 * s;
  const signH = 16 * s;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,.12)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2 * s, 7 * s, 3 * s, 0, 0, TAU);
  ctx.fill();

  // Pole
  ctx.fillStyle = "#666";
  ctx.fillRect(x - 2 * s, y - poleH, 4 * s, poleH);

  // Sign board (big, colored)
  const colors = ["#2a6a3a", "#2a4a6a", "#8a2a2a", "#6a5a2a"];
  ctx.fillStyle = colors[Math.floor(color * colors.length) % colors.length];
  ctx.fillRect(x - signW / 2, y - poleH - signH, signW, signH);

  // Border + simple glyph
  ctx.strokeStyle = "#fff4c7";
  ctx.lineWidth = Math.max(1.5, 2 * s);
  ctx.strokeRect(x - signW / 2, y - poleH - signH, signW, signH);
  ctx.fillStyle = "#fff4c7";
  ctx.fillRect(x - 6 * s, y - poleH - signH * 0.6, 12 * s, 3 * s);
  ctx.fillRect(x - 3 * s, y - poleH - signH * 0.3, 6 * s, 2 * s);
}

// Dhaba: broad low building with veranda, columns, tables.
function drawDhaba(x, y, s, side, color) {
  const w = 100 * s;
  const h = 55 * s;
  const palette = ["#c9a97a", "#b8a08a", "#d9c09b", "#a89070"];
  const body = palette[Math.floor(color * palette.length) % palette.length];

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,.14)";
  ctx.beginPath();
  ctx.ellipse(x, y + 4 * s, w * 0.6, 9 * s, 0, 0, TAU);
  ctx.fill();

  // Building
  ctx.fillStyle = body;
  ctx.fillRect(x - w / 2, y - h, w, h);

  // Roof
  ctx.fillStyle = "#9a4f3f";
  ctx.fillRect(x - w / 2 - 5 * s, y - h - 8 * s, w + 10 * s, 9 * s);

  // Veranda columns
  ctx.fillStyle = "#8a7a6a";
  for (let i = -2; i <= 2; i++) {
    ctx.fillRect(x + i * w * 0.24 - 2 * s, y - h + 8 * s, 4 * s, h - 8 * s);
  }

  // Large signboard
  ctx.fillStyle = "#c93632";
  ctx.fillRect(x - w * 0.4, y - h + 2 * s, w * 0.8, 10 * s);
  ctx.fillStyle = "#fff4c7";
  for (let i = 0; i < 8; i++) {
    ctx.fillRect(x - w * 0.3 + i * w * 0.08, y - h + 4 * s, w * 0.04, 6 * s);
  }

  // Door
  ctx.fillStyle = "#3a2a20";
  ctx.fillRect(x - 10 * s, y - h + 12 * s, 20 * s, h - 12 * s);

  // Tables under veranda
  ctx.fillStyle = "#7a5a3a";
  ctx.fillRect(x - w * 0.35, y - 12 * s, 22 * s, 4 * s);
  ctx.fillRect(x + w * 0.1, y - 10 * s, 22 * s, 4 * s);

  // Windows
  ctx.fillStyle = "#86b8c7";
  ctx.fillRect(x - w * 0.45, y - h + 18 * s, 8 * s, 8 * s);
  ctx.fillRect(x + w * 0.4, y - h + 18 * s, 8 * s, 8 * s);
}

// Bus stop: large shelter with roof, pillars, bench, sign.
function drawBusStop(x, y, s, side) {
  const w = 70 * s;
  const roofH = 10 * s;
  const poleH = 32 * s;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,.12)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2 * s, w * 0.55, 6 * s, 0, 0, TAU);
  ctx.fill();

  // Support pillars (3)
  ctx.fillStyle = "#666";
  for (let i = -1; i <= 1; i++) {
    ctx.fillRect(x + i * w * 0.4 - 2.5 * s, y - poleH, 5 * s, poleH);
  }

  // Roof slab
  ctx.fillStyle = "#2a6a3a";
  ctx.fillRect(x - w / 2 - 5 * s, y - poleH - roofH, w + 10 * s, roofH);

  // Back panel
  ctx.fillStyle = "rgba(220,220,220,.5)";
  ctx.fillRect(x - w / 2, y - poleH + 12 * s, w, poleH - 12 * s);

  // Bench (long)
  ctx.fillStyle = "#8a6a4a";
  ctx.fillRect(x - 20 * s, y - 10 * s, 40 * s, 5 * s);
  ctx.fillRect(x - 18 * s, y - 5 * s, 4 * s, 5 * s);
  ctx.fillRect(x + 14 * s, y - 5 * s, 4 * s, 5 * s);

  // Sign pole beside shelter
  ctx.fillStyle = "#777";
  ctx.fillRect(x + w * 0.6, y - poleH - 6 * s, 3 * s, poleH + 6 * s);
  ctx.fillStyle = "#2a4a6a";
  ctx.fillRect(x + w * 0.55, y - poleH - 16 * s, 18 * s, 10 * s);
}

// Petrol pump: wide canopy, 2-3 pumps, small building, tall sign.
function drawPetrolPump(x, y, s, side, color) {
  const w = 90 * s;
  const h = 34 * s;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,.14)";
  ctx.beginPath();
  ctx.ellipse(x, y + 3 * s, w * 0.6, 9 * s, 0, 0, TAU);
  ctx.fill();

  // Big canopy roof
  ctx.fillStyle = "#c93632";
  ctx.fillRect(x - w / 2 - 6 * s, y - h - 12 * s, w + 12 * s, 8 * s);
  ctx.fillStyle = "#fff4c7";
  ctx.fillRect(x - w / 2 - 6 * s, y - h - 4 * s, w + 12 * s, 2 * s);

  // Support columns
  ctx.fillStyle = "#777";
  ctx.fillRect(x - w * 0.35, y - h - 4 * s, 6 * s, h + 4 * s);
  ctx.fillRect(x + w * 0.35 - 6 * s, y - h - 4 * s, 6 * s, h + 4 * s);

  // Pump units (2)
  for (let i = -1; i <= 1; i++) {
    ctx.fillStyle = "#2a4a6a";
    ctx.fillRect(x + i * 18 * s - 6 * s, y - h + 8 * s, 12 * s, h - 8 * s);
    ctx.fillStyle = "#e8e4d8";
    ctx.fillRect(x + i * 18 * s - 3 * s, y - h + 12 * s, 6 * s, 7 * s);
  }

  // Tall roadside sign
  ctx.fillStyle = "#777";
  ctx.fillRect(x + w * 0.55, y - h - 26 * s, 4 * s, 26 * s);
  ctx.fillStyle = "#2a4a6a";
  ctx.fillRect(x + w * 0.5, y - h - 36 * s, 18 * s, 10 * s);

  // Price-display panel
  ctx.fillStyle = "#222";
  ctx.fillRect(x - 8 * s, y - 14 * s, 16 * s, 5 * s);
  ctx.fillStyle = "#c8d83a";
  ctx.fillRect(x - 6 * s, y - 13 * s, 12 * s, 3 * s);
}

// Cart: small wheeled cart.
function drawCart(x, y, s, side, color) {
  const w = 34 * s;
  const h = 22 * s;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,.12)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2 * s, w * 0.55, 4 * s, 0, 0, TAU);
  ctx.fill();

  // Cart body
  ctx.fillStyle = "#8a6a4a";
  ctx.fillRect(x - w / 2, y - h, w, h);

  // Goods
  ctx.fillStyle = "#c9a97a";
  ctx.fillRect(x - w / 2 + 2 * s, y - h - 6 * s, w - 4 * s, 6 * s);

  // Wheels
  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.arc(x - w * 0.32, y - 2 * s, 4.5 * s, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + w * 0.32, y - 2 * s, 4.5 * s, 0, TAU);
  ctx.fill();
}

function drawPlayer(w, h) {
  const laneNorm =
    ((state.lane + 0.5) / road.laneCount - 0.5);

  const roadHalfAtPlayer =
    perspective(0.98).width;

  const x =
    w * (
      0.5 +
      laneNorm * roadHalfAtPlayer * 1.85
    );

  const y =
    h * 0.88 +
    Math.sin(player.bob) * 1.2;

  player.draw(ctx, x, y, 1);
}

function roundRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

let last = performance.now();

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.033);
  last = now;

  update(dt);
  draw();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);