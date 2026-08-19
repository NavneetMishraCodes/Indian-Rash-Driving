export class PlayerCar {
  constructor() {
    this.width = 0.062;
    this.height = 0.135;

    this.lean = 0;
    this.bob = 0;

    this.boosting = false;
  }

  update(dt, keys, state) {
    this.boosting =
      keys.has("KeyW") ||
      keys.has("ArrowUp");

    this.bob += dt * (5 + state.forwardSpeed * 20);

    const laneError = state.laneTarget - state.lane;

    this.lean = Math.max(
      -0.18,
      Math.min(0.18, laneError * -0.9)
    );
  }

  draw(ctx, x, y, scale = 1) {
    const w = window.innerWidth;
    const h = window.innerHeight;

    const carW = w * this.width * scale;
    const carH = h * this.height * scale;

    ctx.save();

    ctx.translate(x, y);
    ctx.rotate(this.lean);

    this.drawShadow(ctx, carW, carH);
    this.drawBoost(ctx, carW, carH);
    this.drawBody(ctx, carW, carH);

    ctx.restore();
  }

  drawShadow(ctx, carW, carH) {
    ctx.fillStyle = "rgba(0,0,0,0.28)";

    ctx.beginPath();
    ctx.ellipse(
      0,
      carH * 0.08,
      carW * 0.52,
      carH * 0.12,
      0,
      0,
      Math.PI * 2
    );

    ctx.fill();
  }

  drawBoost(ctx, carW, carH) {
    if (!this.boosting) return;

    const flameLength = carH * (0.18 + Math.random() * 0.08);

    // Left exhaust
    this.drawFlame(
      ctx,
      -carW * 0.18,
      carH * 0.50,
      carW * 0.09,
      flameLength
    );

    // Right exhaust
    this.drawFlame(
      ctx,
      carW * 0.18,
      carH * 0.50,
      carW * 0.09,
      flameLength
    );
  }

  drawFlame(ctx, x, y, width, length) {
    ctx.save();

    ctx.fillStyle = "#ffb52e";

    ctx.beginPath();
    ctx.moveTo(x - width / 2, y);
    ctx.lineTo(x, y + length);
    ctx.lineTo(x + width / 2, y);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#fff4bd";

    ctx.beginPath();
    ctx.moveTo(x - width * 0.25, y);
    ctx.lineTo(x, y + length * 0.65);
    ctx.lineTo(x + width * 0.25, y);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  drawBody(ctx, carW, carH) {
    // Main aerodynamic body
    ctx.fillStyle = "#c93632";

    this.roundRect(
        ctx,
        -carW / 2,
        -carH / 2,
        carW,
        carH,
        carW * 0.20
    );

    ctx.fill();

    // Wide rear shoulders
    ctx.fillStyle = "#a92528";

    ctx.beginPath();
    ctx.moveTo(-carW * 0.48, carH * 0.08);
    ctx.lineTo(-carW * 0.40, carH * 0.47);
    ctx.lineTo(carW * 0.40, carH * 0.47);
    ctx.lineTo(carW * 0.48, carH * 0.08);
    ctx.closePath();
    ctx.fill();

    // Supercar cabin
    ctx.fillStyle = "#17252f";

    this.roundRect(
        ctx,
        -carW * 0.29,
        -carH * 0.28,
        carW * 0.58,
        carH * 0.44,
        carW * 0.12
    );

    ctx.fill();

    // Windshield reflection
    ctx.fillStyle = "rgba(190,225,240,0.18)";

    ctx.beginPath();
    ctx.moveTo(-carW * 0.20, -carH * 0.20);
    ctx.lineTo(carW * 0.20, -carH * 0.20);
    ctx.lineTo(carW * 0.25, -carH * 0.04);
    ctx.lineTo(-carW * 0.25, -carH * 0.04);
    ctx.closePath();
    ctx.fill();

    // Rear spoiler
    ctx.fillStyle = "#17191b";

    ctx.fillRect(
        -carW * 0.40,
        carH * 0.22,
        carW * 0.80,
        carH * 0.045
    );

    // Spoiler supports
    ctx.fillRect(
        -carW * 0.28,
        carH * 0.22,
        carW * 0.035,
        carH * 0.10
    );

    ctx.fillRect(
        carW * 0.245,
        carH * 0.22,
        carW * 0.035,
        carH * 0.10
    );

    // Rear diffuser
    ctx.fillStyle = "#111315";

    ctx.fillRect(
        -carW * 0.40,
        carH * 0.38,
        carW * 0.80,
        carH * 0.09
    );

    // Exhausts
    ctx.fillStyle = "#080909";

    ctx.beginPath();
    ctx.arc(
        -carW * 0.18,
        carH * 0.445,
        carW * 0.055,
        0,
        Math.PI * 2
    );
    ctx.fill();

    ctx.beginPath();
    ctx.arc(
        carW * 0.18,
        carH * 0.445,
        carW * 0.055,
        0,
        Math.PI * 2
    );
    ctx.fill();

    // Tail lights
    ctx.fillStyle = "#ff403d";

    ctx.fillRect(
        -carW * 0.38,
        carH * 0.30,
        carW * 0.25,
        carH * 0.045
    );

    ctx.fillRect(
        carW * 0.13,
        carH * 0.30,
        carW * 0.25,
        carH * 0.045
    );

    // Headlights — visible from the top/front of the car
    ctx.fillStyle = "#fff4c7";

    ctx.beginPath();
    ctx.moveTo(-carW * 0.36, -carH * 0.43);
    ctx.lineTo(-carW * 0.12, -carH * 0.43);
    ctx.lineTo(-carW * 0.17, -carH * 0.34);
    ctx.lineTo(-carW * 0.39, -carH * 0.34);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(carW * 0.12, -carH * 0.43);
    ctx.lineTo(carW * 0.36, -carH * 0.43);
    ctx.lineTo(carW * 0.39, -carH * 0.34);
    ctx.lineTo(carW * 0.17, -carH * 0.34);
    ctx.closePath();
    ctx.fill();

    // Headlight glow
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#fff7d1";

    ctx.beginPath();
    ctx.ellipse(
        -carW * 0.25,
        -carH * 0.47,
        carW * 0.12,
        carH * 0.035,
        0,
        0,
        Math.PI * 2
    );
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(
        carW * 0.25,
        -carH * 0.47,
        carW * 0.12,
        carH * 0.035,
        0,
        0,
        Math.PI * 2
    );
    ctx.fill();

    ctx.globalAlpha = 1;
  }

  roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.roundRect(
      x,
      y,
      width,
      height,
      radius
    );
  }
}