import { PlayerCar } from "./entities/PlayerCar.js";
import { TrafficSystem } from "./systems/TrafficSystem.js";
import { ScoringSystem } from "./systems/ScoringSystem.js";

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

const BILLBOARD_IMAGES = [
  // Add PNG filenames here, e.g. "billboard-01.png".
  // Files go in: public/assets/billboards/
];

// Billboard texture cache: each image is loaded once and reused across
// all billboards that reference it. Never reloaded per frame.
const billboardTextureCache = new Map();

function getBillboardTexture(filename) {
  if (!filename) return null;

  if (billboardTextureCache.has(filename)) {
    return billboardTextureCache.get(filename);
  }

  const img = new Image();
  img.src = `${BILLBOARD_BASE}${filename}`;
  billboardTextureCache.set(filename, img);
  return img;
}

const COLLISION_SOUNDS = [
  `${AUDIO_BASE}atmkbfjg-echo.mp3`,
  `${AUDIO_BASE}chicken-on-tree-screaming.mp3`,
  `${AUDIO_BASE}cid.mp3`,
  `${AUDIO_BASE}cid-acp-behn-choo.mp3`,
  `${AUDIO_BASE}cid-chut.mp3`,
  `${AUDIO_BASE}cid-le-mdc.mp3`,
  `${AUDIO_BASE}cid-tum-bl-k-f.mp3`,
  `${AUDIO_BASE}contesta-punetas.mp3`,
  `${AUDIO_BASE}dil-na-diya.mp3`,
  `${AUDIO_BASE}fe-n-travis-scott.mp3`,
  `${AUDIO_BASE}f-you-baltimore.mp3`,
  `${AUDIO_BASE}gta-san-andreas-ah-shit-here-we-go-again.mp3`,
  `${AUDIO_BASE}hello-moto-estourado.mp3`,
  `${AUDIO_BASE}i-sh-t-my-pants-aldi.mp3`,
  `${AUDIO_BASE}kyu-re-madarchod-cid.mp3`,
  `${AUDIO_BASE}miguel-miguel_BwNUGvA.mp3`,
  `${AUDIO_BASE}mr-beast-phonk-meme-mp3.mp3`,
  `${AUDIO_BASE}naam-ya-daam-naam-ravi-kishan.mp3`,
  `${AUDIO_BASE}nahi-nahi-salec-yaha-kuchh-to-gadbad-hai.mp3`,
  `${AUDIO_BASE}oi-oi-oe-oi-a-eye-eye.mp3`,
  `${AUDIO_BASE}phir-teri-maiya-chodta-hu-cid.mp3`,
  `${AUDIO_BASE}really-nig.mp3`,
  `${AUDIO_BASE}tralalero-funk.mp3`,
  `${AUDIO_BASE}what-the-hell-omg-no-wayyyyy.mp3`,
  `${AUDIO_BASE}yes-yes-yes-kibidi.mp3`,
];

let currentCollisionAudio = null;

function playRandomCollisionSound() {
  if (!COLLISION_SOUNDS.length) return;

  if (currentCollisionAudio) {
    currentCollisionAudio.pause();
    currentCollisionAudio.currentTime = 0;
  }

  const path =
    COLLISION_SOUNDS[
      Math.floor(Math.random() * COLLISION_SOUNDS.length)
    ];

  const audio = new Audio(path);

  audio.volume = 1;
  audio.loop = false;

  currentCollisionAudio = audio;

  audio.play().catch(error => {
    console.error("Collision sound failed:", error);
  });
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

// Weighted pool of Indian roadside prop types. Higher weight = more common.
// Keeps the roadside varied: empty patches, trees, shops, stalls, walls,
// poles, signs, billboards, buildings, and occasional larger structures.
const SCENERY_TYPES = [
  { kind: "tree", weight: 14 },
  { kind: "tree", weight: 14 },
  { kind: "bush", weight: 10 },
  { kind: "wall", weight: 10 },
  { kind: "shop", weight: 8 },
  { kind: "chaiStall", weight: 6 },
  { kind: "foodStall", weight: 5 },
  { kind: "house", weight: 8 },
  { kind: "utilityPole", weight: 8 },
  { kind: "sign", weight: 5 },
  { kind: "billboard", weight: 5 },
  { kind: "dhaba", weight: 3 },
  { kind: "busStop", weight: 3 },
  { kind: "petrolPump", weight: 2 },
  { kind: "cart", weight: 4 },
  { kind: "empty", weight: 8 }
];

function pickSceneryKind() {
  let total = 0;
  for (const t of SCENERY_TYPES) total += t.weight;
  let r = Math.random() * total;
  for (const t of SCENERY_TYPES) {
    r -= t.weight;
    if (r <= 0) return t.kind;
  }
  return "tree";
}

function makeScenery() {
  scenery.length = 0;

  for (let i = 0; i < SCENERY_COUNT; i++) {
    scenery.push({
      side: Math.random() < 0.5 ? -1 : 1,
      depth: Math.random(),
      offset: rand(1.45, 2.45),
      kind: pickSceneryKind(),
      phase: Math.random() * TAU,
      // Per-object variation so recycled props don't look identical.
      variant: Math.floor(Math.random() * 4),
      color: Math.random(),
      billboard: null
    });
  }
}

makeScenery();

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

      // Keep every object safely away from the road.
      obj.offset = rand(1.45, 2.45);

      // Re-pick a weighted Indian roadside prop type.
      obj.kind = pickSceneryKind();
      obj.phase = Math.random() * TAU;
      obj.variant = Math.floor(Math.random() * 4);
      obj.color = Math.random();

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

    const scale = lerp(
      0.18,
      1.15,
      Math.pow(obj.depth, 1.3)
    );

    switch (obj.kind) {
      case "tree":
        drawTree(x, y, scale, obj.variant);
        break;
      case "bush":
        drawBush(x, y, scale);
        break;
      case "wall":
        drawWall(x, y, scale, obj.side, obj.color);
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
      case "house":
        drawHouse(x, y, scale, obj.side, obj.color);
        break;
      case "utilityPole":
        drawUtilityPole(x, y, scale, obj.side);
        break;
      case "sign":
        drawSign(x, y, scale, obj.side, obj.color);
        break;
      case "billboard":
        drawBillboard(x, y, scale, obj.side, obj.billboard);
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
      case "empty":
      default:
        // Empty patch — nothing drawn.
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

// Chai stall: small cart with counter, kettle, awning, cups.
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

  // Counter top
  ctx.fillStyle = "#5a4a3a";
  ctx.fillRect(x - w / 2, y - h, w, 4 * s);

  // Kettle (pot)
  ctx.fillStyle = "#555";
  ctx.beginPath();
  ctx.arc(x, y - h - 8 * s, 6 * s, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#333";
  ctx.fillRect(x - 2 * s, y - h - 14 * s, 4 * s, 4 * s);

  // Awning (striped)
  ctx.fillStyle = "#c93632";
  ctx.fillRect(x - w / 2, y - h - 16 * s, w, 6 * s);
  ctx.fillStyle = "#fff4c7";
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(x - w / 2 + i * (w / 5), y - h - 16 * s, w / 10, 6 * s);
  }

  // Cups on counter
  ctx.fillStyle = "#e8e0d0";
  for (let i = -1; i <= 1; i++) {
    ctx.fillRect(x + i * 8 * s - 2 * s, y - h + 2 * s, 4 * s, 4 * s);
  }
}

// Street food stall: cart, counter, umbrella/awning, cooking area.
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

  // Counter
  ctx.fillStyle = "#4a3a2a";
  ctx.fillRect(x - w / 2, y - h, w, 4 * s);

  // Cooking area (dark circle)
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.arc(x - 10 * s, y - h - 4 * s, 5 * s, 0, TAU);
  ctx.fill();

  // Umbrella (red dome)
  ctx.fillStyle = "#c93632";
  ctx.beginPath();
  ctx.arc(x, y - h - 18 * s, 14 * s, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = "#fff4c7";
  ctx.fillRect(x - 1 * s, y - h - 18 * s, 2 * s, 8 * s);
}

// Utility/electric pole with crossbars and insulators.
function drawUtilityPole(x, y, s, side) {
  const poleH = 55 * s;
  const poleW = 4 * s;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,.12)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2 * s, 8 * s, 3 * s, 0, 0, TAU);
  ctx.fill();

  // Pole
  ctx.fillStyle = "#5a4a3a";
  ctx.fillRect(x - poleW / 2, y - poleH, poleW, poleH);

  // Crossbars
  ctx.fillStyle = "#4a3a2a";
  ctx.fillRect(x - 14 * s, y - poleH + 8 * s, 28 * s, 3 * s);
  ctx.fillRect(x - 10 * s, y - poleH + 18 * s, 20 * s, 3 * s);

  // Insulators
  ctx.fillStyle = "#ddd";
  for (let i = -1; i <= 1; i++) {
    ctx.fillRect(x + i * 10 * s - 1.5 * s, y - poleH + 5 * s, 3 * s, 4 * s);
  }

  // Light wires (slight sag)
  ctx.strokeStyle = "rgba(30,30,30,.6)";
  ctx.lineWidth = Math.max(1, 1 * s);
  ctx.beginPath();
  ctx.moveTo(x - 14 * s, y - poleH + 9 * s);
  ctx.quadraticCurveTo(x, y - poleH + 14 * s, x + 14 * s, y - poleH + 9 * s);
  ctx.stroke();
}

// Roadside sign: pole + rectangular sign.
function drawSign(x, y, s, side, color) {
  const poleH = 30 * s;
  const signW = 26 * s;
  const signH = 12 * s;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,.12)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2 * s, 6 * s, 2.5 * s, 0, 0, TAU);
  ctx.fill();

  // Pole
  ctx.fillStyle = "#666";
  ctx.fillRect(x - 1.5 * s, y - poleH, 3 * s, poleH);

  // Sign board
  const colors = ["#2a6a3a", "#2a4a6a", "#8a2a2a", "#6a5a2a"];
  ctx.fillStyle = colors[Math.floor(color * colors.length) % colors.length];
  ctx.fillRect(x - signW / 2, y - poleH - signH, signW, signH);

  // Sign border
  ctx.strokeStyle = "#fff4c7";
  ctx.lineWidth = Math.max(1, 1.5 * s);
  ctx.strokeRect(x - signW / 2, y - poleH - signH, signW, signH);
}

// Billboard: support poles + frame + flat panel (optional PNG texture).
function drawBillboard(x, y, s, side, filename) {
  const panelW = 90 * s;
  const panelH = 40 * s;
  const poleH = 30 * s;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,.14)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2 * s, panelW * 0.5, 6 * s, 0, 0, TAU);
  ctx.fill();

  // Support poles
  ctx.fillStyle = "#555";
  ctx.fillRect(x - panelW * 0.4 - 2 * s, y - poleH, 4 * s, poleH);
  ctx.fillRect(x + panelW * 0.4 - 2 * s, y - poleH, 4 * s, poleH);

  // Frame
  ctx.fillStyle = "#444";
  ctx.fillRect(x - panelW / 2 - 3 * s, y - poleH - panelH - 3 * s, panelW + 6 * s, panelH + 6 * s);

  // Panel
  const img = getBillboardTexture(filename);
  if (img && img.complete && img.naturalWidth > 0) {
    // Draw the PNG texture, preserving aspect ratio within the panel.
    const imgAspect = img.naturalWidth / img.naturalHeight;
    const panelAspect = panelW / panelH;
    let dw = panelW;
    let dh = panelH;
    if (imgAspect > panelAspect) {
      dw = panelH * imgAspect;
    } else {
      dh = panelW / imgAspect;
    }
    const dx = x - dw / 2;
    const dy = y - poleH - panelH - (panelH - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
  } else {
    // Empty billboard: plain panel with a subtle border.
    ctx.fillStyle = "#e8e4d8";
    ctx.fillRect(x - panelW / 2, y - poleH - panelH, panelW, panelH);
    ctx.strokeStyle = "#999";
    ctx.lineWidth = Math.max(1, 1.5 * s);
    ctx.strokeRect(x - panelW / 2, y - poleH - panelH, panelW, panelH);
  }
}

// Dhaba: larger roadside shop/building reusing shop components.
function drawDhaba(x, y, s, side, color) {
  const w = 80 * s;
  const h = 46 * s;
  const palette = ["#c9a97a", "#b8a08a", "#d9c09b", "#a89070"];
  const body = palette[Math.floor(color * palette.length) % palette.length];

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,.14)";
  ctx.beginPath();
  ctx.ellipse(x, y + 4 * s, w * 0.6, 8 * s, 0, 0, TAU);
  ctx.fill();

  // Body
  ctx.fillStyle = body;
  ctx.fillRect(x - w / 2, y - h, w, h);

  // Roof
  ctx.fillStyle = "#9a4f3f";
  ctx.beginPath();
  ctx.moveTo(x - w * 0.6, y - h);
  ctx.lineTo(x, y - h - 16 * s);
  ctx.lineTo(x + w * 0.6, y - h);
  ctx.closePath();
  ctx.fill();

  // Awning
  ctx.fillStyle = "#c93632";
  ctx.fillRect(x - w / 2, y - h + 6 * s, w, 7 * s);
  ctx.fillStyle = "#fff4c7";
  for (let i = 0; i < 8; i++) {
    ctx.fillRect(x - w / 2 + i * (w / 8), y - h + 6 * s, w / 16, 7 * s);
  }

  // Door
  ctx.fillStyle = "#3a2a20";
  ctx.fillRect(x - 8 * s, y - 20 * s, 16 * s, 20 * s);

  // Windows
  ctx.fillStyle = "#86b8c7";
  ctx.fillRect(x - w * 0.35, y - h + 14 * s, 12 * s, 10 * s);
  ctx.fillRect(x + w * 0.23, y - h + 14 * s, 12 * s, 10 * s);
}

// Bus stop / shelter: roof, support poles, bench.
function drawBusStop(x, y, s, side) {
  const w = 50 * s;
  const roofH = 8 * s;
  const poleH = 26 * s;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,.12)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2 * s, w * 0.5, 5 * s, 0, 0, TAU);
  ctx.fill();

  // Support poles
  ctx.fillStyle = "#666";
  ctx.fillRect(x - w / 2, y - poleH, 3 * s, poleH);
  ctx.fillRect(x + w / 2 - 3 * s, y - poleH, 3 * s, poleH);

  // Roof
  ctx.fillStyle = "#2a6a3a";
  ctx.fillRect(x - w / 2 - 3 * s, y - poleH - roofH, w + 6 * s, roofH);

  // Back panel
  ctx.fillStyle = "rgba(200,200,200,.5)";
  ctx.fillRect(x - w / 2, y - poleH + 6 * s, w, poleH - 6 * s);

  // Bench
  ctx.fillStyle = "#8a6a4a";
  ctx.fillRect(x - 14 * s, y - 8 * s, 28 * s, 4 * s);
  ctx.fillRect(x - 12 * s, y - 4 * s, 3 * s, 4 * s);
  ctx.fillRect(x + 9 * s, y - 4 * s, 3 * s, 4 * s);
}

// Petrol pump: stylized lightweight silhouette.
function drawPetrolPump(x, y, s, side, color) {
  const w = 46 * s;
  const h = 30 * s;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,.14)";
  ctx.beginPath();
  ctx.ellipse(x, y + 3 * s, w * 0.6, 6 * s, 0, 0, TAU);
  ctx.fill();

  // Canopy roof
  ctx.fillStyle = "#c93632";
  ctx.fillRect(x - w / 2 - 4 * s, y - h - 8 * s, w + 8 * s, 6 * s);

  // Support columns
  ctx.fillStyle = "#777";
  ctx.fillRect(x - w * 0.35, y - h - 2 * s, 4 * s, h + 2 * s);
  ctx.fillRect(x + w * 0.35 - 4 * s, y - h - 2 * s, 4 * s, h + 2 * s);

  // Pump unit
  ctx.fillStyle = "#2a4a6a";
  ctx.fillRect(x - 8 * s, y - h + 4 * s, 16 * s, h - 4 * s);

  // Pump display
  ctx.fillStyle = "#e8e4d8";
  ctx.fillRect(x - 5 * s, y - h + 8 * s, 10 * s, 6 * s);
}

// Roadside cart: small wheeled cart.
function drawCart(x, y, s, side, color) {
  const w = 30 * s;
  const h = 20 * s;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,.12)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2 * s, w * 0.5, 4 * s, 0, 0, TAU);
  ctx.fill();

  // Cart body
  ctx.fillStyle = "#8a6a4a";
  ctx.fillRect(x - w / 2, y - h, w, h);

  // Goods on top
  ctx.fillStyle = "#c9a97a";
  ctx.fillRect(x - w / 2 + 2 * s, y - h - 6 * s, w - 4 * s, 6 * s);

  // Wheels
  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.arc(x - w * 0.3, y - 3 * s, 4 * s, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + w * 0.3, y - 3 * s, 4 * s, 0, TAU);
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
