import { PlayerCar } from "./entities/PlayerCar.js";
import { TrafficSystem } from "./systems/TrafficSystem.js";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d", { alpha: false });
const speedLabel = document.querySelector("#speed");

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

const COLLISION_SOUNDS = [
  `${AUDIO_BASE}cid.mp3`,
  `${AUDIO_BASE}cid-chut.mp3`,
  `${AUDIO_BASE}kyu-re-madarchod-cid.mp3`,
  `${AUDIO_BASE}atmkbfjg-echo.mp3`,
  `${AUDIO_BASE}dil-na-diya.mp3`,
  `${AUDIO_BASE}cid-acp-behn-choo.mp3`,
  `${AUDIO_BASE}cid-le-mdc.mp3`,
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

window.addEventListener("keydown", (e) => {
  if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"].includes(e.code)) {
    e.preventDefault();
    keys.add(e.code);
  }
});

window.addEventListener("keyup", (e) => keys.delete(e.code));

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

const traffic = new TrafficSystem();

traffic.start();

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

function makeScenery() {
  scenery.length = 0;

  const types = [
    "house",
    "house",
    "park",
    "park",
    "wall",
    "wall"
  ];

  for (let i = 0; i < SCENERY_COUNT; i++) {
    scenery.push({
      side: Math.random() < 0.5 ? -1 : 1,
      depth: Math.random(),
      offset: rand(1.45, 2.45),
      kind: types[Math.floor(Math.random() * types.length)],
      phase: Math.random() * TAU
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

    playRandomCollisionSound();

    break;
  }
}

function update(dt) {
  state.time += dt;

  // W accelerates toward cruise speed; S slows down.
  const accelerating = keys.has("KeyW") || keys.has("ArrowUp");
  const braking = keys.has("KeyS") || keys.has("ArrowDown");

  const maxSpeed = 0.34;
  const acceleration = 0.22;
  const deceleration = 0.25;

  if (accelerating) {
    state.forwardSpeed = Math.min(maxSpeed, state.forwardSpeed + acceleration * dt);
  } else {
    state.forwardSpeed = Math.max(0.08, state.forwardSpeed - deceleration * 0.22 * dt);
  }

  if (braking) {
    state.forwardSpeed = Math.max(0, state.forwardSpeed - deceleration * dt);
  }

  // Lane input changes the target lane, while actual movement is smoothed.
  if (keys.has("KeyA") || keys.has("ArrowLeft")) {
    if (!state._leftLatch) {
      state.laneTarget = Math.max(0, state.laneTarget - 1);
      state._leftLatch = true;
    }
  } else {
    state._leftLatch = false;
  }

  if (keys.has("KeyD") || keys.has("ArrowRight")) {
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

  player.update(dt, keys, state);
  traffic.update(dt, state.forwardSpeed);

  checkTrafficCollisions();

  // Move scenery toward camera and recycle it.
  for (const obj of scenery) {
    obj.depth += state.forwardSpeed * dt * 0.72;
    if (obj.depth > 1.08) {
      obj.depth -= 1.08;

      obj.side = Math.random() < 0.5 ? -1 : 1;

      // Keep every object safely away from the road.
      obj.offset = rand(1.45, 2.45);

      // Natural mixture of roadside objects.
      const types = [
        "house",
        "house",
        "park",
        "park",
        "wall"
      ];

      obj.kind = types[Math.floor(Math.random() * types.length)];
      obj.phase = Math.random() * TAU;
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
  // Subtle horizontal bands provide depth without heavy textures.
  const horizon = h * road.horizonY;
  const bandCount = 18;

  for (let i = 0; i < bandCount; i++) {
    const t = i / bandCount;
    const y0 = lerp(horizon, h, Math.pow(t, 1.6));
    const y1 = lerp(horizon, h, Math.pow((i + 1) / bandCount, 1.6));
    ctx.fillStyle = i % 2 ? "#76a65b" : "#729e58";
    ctx.fillRect(0, y0, w, y1 - y0 + 1);
  }

  // Very light grass strokes.
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = "#d7e8b9";
  ctx.lineWidth = 1;
  for (let i = 0; i < 130; i++) {
    const x = Math.random() * w;
    const y = horizon + Math.random() * (h - horizon);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + rand(-2, 2), y - rand(2, 6));
    ctx.stroke();
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

    if (obj.kind === "house") {
      drawHouse(x, y, scale, obj.side);
    }

    if (obj.kind === "park") {
      drawPark(x, y, scale);
    }

    if (obj.kind === "wall") {
      drawWall(x, y, scale, obj.side);
    }
  }
}

function drawHouse(x, y, s, side) {
  const width = 55 * s;
  const height = 45 * s;

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
  ctx.fillStyle = "#d9c09b";
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


function drawWall(x, y, s, side) {
  const width = 90 * s;
  const height = 14 * s;

  ctx.fillStyle = "rgba(0,0,0,.12)";
  ctx.fillRect(
    x - width / 2,
    y + 2 * s,
    width,
    5 * s
  );

  ctx.fillStyle = "#b8b0a0";

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

function drawTree(x, y, s) {
  const trunkW = 8 * s;
  const trunkH = 25 * s;
  const canopy = 28 * s;

  ctx.fillStyle = "rgba(0,0,0,.14)";
  ctx.beginPath();
  ctx.ellipse(x, y + 3 * s, canopy * 0.75, 7 * s, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = "#6d4c35";
  ctx.fillRect(x - trunkW / 2, y - trunkH, trunkW, trunkH);

  ctx.fillStyle = "#3f713d";
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
