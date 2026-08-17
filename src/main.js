const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d", { alpha: false });
const speedLabel = document.querySelector("#speed");

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
  time: 0
}

const road = {
  laneCount: 4,
  worldWidth: 12,
  shoulder: 1.15,
  horizonY: 0.20,
  bottomY: 1.04,
  nearHalfWidth: 0.43,
  farHalfWidth: 0.055
};

const player = {
  x: 0,
  y: 0.88,
  width: 0.105,
  height: 0.18,
  lean: 0,
  bob: 0
};

const scenery = [];
const SCENERY_COUNT = 46;

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
  for (let i = 0; i < SCENERY_COUNT; i++) {
    scenery.push({
      side: Math.random() < 0.5 ? -1 : 1,
      depth: Math.random(),
      offset: rand(1.0, 2.7),
      kind: Math.random() < 0.72 ? "tree" : "bush",
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

function update(dt) {
  state.time += dt;

  // W accelerates toward cruise speed; S slows down.
  const accelerating = keys.has("KeyW") || keys.has("ArrowUp");
  const braking = keys.has("KeyS") || keys.has("ArrowDown");

  const maxSpeed = 0.34;
  const acceleration = 0.22;
  const deceleration = 0.32;

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

  // Move scenery toward camera and recycle it.
  for (const obj of scenery) {
    obj.depth += state.forwardSpeed * dt * 0.72;
    if (obj.depth > 1.08) {
      obj.depth -= 1.08;
      obj.side = Math.random() < 0.5 ? -1 : 1;
      obj.offset = rand(1.0, 2.7);
      obj.kind = Math.random() < 0.72 ? "tree" : "bush";
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

  // Dashed lines get longer and thicker toward the player,
  // matching the perspective of the road.
  const dashCount = 30;

  for (let i = 0; i < dashCount; i++) {
    const d0 = i / dashCount;
    const d1 = Math.min(1, d0 + 0.42 / dashCount);

    // Keep a small gap between dashes.
    if (i % 2 === 1) continue;

    const a = roadPoint(fraction, d0, w, h);
    const b = roadPoint(fraction, d1, w, h);

    const thickness = lerp(1.1, 4.2, Math.pow(d0, 1.35));

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = "#e7e3ce";
    ctx.lineWidth = Math.max(1, w * 0.00085 * thickness);
    ctx.lineCap = "butt";
    ctx.stroke();
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
  // Far objects first, near objects last.
  const sorted = [...scenery].sort((a, b) => a.depth - b.depth);

  for (const obj of sorted) {
    const p = perspective(obj.depth);
    const x = w * (0.5 + obj.side * p.width * obj.offset);
    const y = h * p.y;
    const scale = lerp(0.18, 1.35, Math.pow(obj.depth, 1.3));

    if (obj.kind === "tree") {
      drawTree(x, y, scale);
    } else {
      drawBush(x, y, scale);
    }
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
  const laneNorm = ((state.lane + 0.5) / road.laneCount - 0.5);
  const roadHalfAtPlayer = perspective(0.98).width;
  const x = w * (0.5 + laneNorm * roadHalfAtPlayer * 1.85);
  const y = h * player.y + Math.sin(player.bob) * 1.2;

  // Shadow.
  ctx.save();
  ctx.translate(x, y + 11);
  ctx.rotate(player.lean);
  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.045, h * 0.018, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  // Stylized car body.
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(player.lean);

  const cw = w * 0.055;
  const ch = h * 0.13;

  // Wheels.
  ctx.fillStyle = "#17191a";
  ctx.fillRect(-cw * .56, -ch * .28, cw * .16, ch * .35);
  ctx.fillRect(cw * .40, -ch * .28, cw * .16, ch * .35);
  ctx.fillRect(-cw * .56, ch * .18, cw * .16, ch * .35);
  ctx.fillRect(cw * .40, ch * .18, cw * .16, ch * .35);

  // Body.
  ctx.fillStyle = "#d63f35";
  roundRect(-cw / 2, -ch / 2, cw, ch, cw * .22);
  ctx.fill();

  // Roof / windshield.
  ctx.fillStyle = "#253746";
  roundRect(-cw * .33, -ch * .20, cw * .66, ch * .43, cw * .12);
  ctx.fill();

  // Rear glass highlight.
  ctx.fillStyle = "rgba(255,255,255,.18)";
  ctx.fillRect(-cw * .25, ch * .03, cw * .50, ch * .035);

  // Tail lights.
  ctx.fillStyle = "#ff6b5f";
  ctx.fillRect(-cw * .38, ch * .35, cw * .18, ch * .055);
  ctx.fillRect(cw * .20, ch * .35, cw * .18, ch * .055);

  ctx.restore();
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
