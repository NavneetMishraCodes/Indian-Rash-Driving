export class TrafficCar {
  constructor(type = "sedan") {
    this.type = type;

    this.depth = 0;
    this.lane = 0;
    this.speed = 0.15;

    this.width = 0.052;
    this.height = 0.115;

    this.hit = false;
    this.hitX = 0;
    this.hitY = 0;
    this.hitRotation = 0;

    this.hitVelocityX = 0;
    this.hitVelocityY = 0;
    this.hitVelocityDepth = 0;

    this.hitSpin = 0;
  }

  reset(lane, depth, speed, type) {
    this.lane = lane;
    this.depth = depth;
    this.speed = speed;
    this.type = type;

    this.hit = false;
    this.hitX = 0;
    this.hitY = 0;
    this.hitRotation = 0;

    this.hitVelocityX = 0;
    this.hitVelocityY = 0;
    this.hitVelocityDepth = 0;

    this.hitSpin = 0;
  }

  update(dt, playerSpeed) {
    // Normal traffic movement.
    if (!this.hit) {
      this.depth +=
        (playerSpeed + this.speed) * dt;

      return;
    }

    // ----------------------------------------------------------
    // HIT PHYSICS
    // ----------------------------------------------------------

    this.hitX += this.hitVelocityX * dt;
    this.hitY += this.hitVelocityY * dt;
    this.depth += this.hitVelocityDepth * dt;

    // Gravity-like pull.
    this.hitVelocityY += 1.8 * dt;

    // Air resistance.
    this.hitVelocityX *= Math.pow(0.985, dt * 60);
    this.hitVelocityY *= Math.pow(0.985, dt * 60);
    this.hitVelocityDepth *= Math.pow(0.985, dt * 60);

    // Spin.
    this.hitRotation += this.hitSpin * dt;
  }

  launch(direction = 1) {
    this.hit = true;

    // Strong sideways launch.
    this.hitVelocityX =
      direction * (0.45 + Math.random() * 0.35);

    // Throw the car upward.
    this.hitVelocityY =
      -(0.65 + Math.random() * 0.30);

    // Push it forward away from the player.
    this.hitVelocityDepth =
      0.20 + Math.random() * 0.20;

    // Random spin direction and strength.
    this.hitSpin =
      (Math.random() < 0.5 ? -1 : 1) *
      (3.5 + Math.random() * 5);

    this.hitRotation = 0;
  }

  draw(ctx, x, y, scale) {
    const w = window.innerWidth;
    const h = window.innerHeight;

    const carW = w * this.width * scale;
    const carH = h * this.height * scale;

    ctx.save();

    ctx.translate(
      x + this.hitX * window.innerWidth,
      y + this.hitY * window.innerHeight
    );

    ctx.rotate(
      Math.PI + this.hitRotation
    );

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.20)";

    ctx.beginPath();
    ctx.ellipse(
      0,
      carH * 0.05,
      carW * 0.50,
      carH * 0.10,
      0,
      0,
      Math.PI * 2
    );

    ctx.fill();

    this.drawBody(
      ctx,
      carW,
      carH
    );

    ctx.restore();
  }

  drawBody(ctx, carW, carH) {
  switch (this.type) {
    case "sedan":
      this.drawSedan(ctx, carW, carH);
      break;

    case "hatchback":
      this.drawHatchback(ctx, carW, carH);
      break;

    case "suv":
      this.drawSUV(ctx, carW, carH);
      break;

    case "taxi":
      this.drawTaxi(ctx, carW, carH);
      break;

    case "compact":
      this.drawCompact(ctx, carW, carH);
      break;
    }
  }

  drawBase(ctx, carW, carH, bodyColor) {

    ctx.fillStyle = bodyColor;

    ctx.beginPath();

    ctx.roundRect(
      -carW / 2,
      -carH / 2,
      carW,
      carH,
      carW * 0.16
    );

    ctx.fill();

    // Windshield
    ctx.fillStyle = "#263842";

    ctx.beginPath();

    ctx.roundRect(
      -carW * 0.30,
      -carH * 0.22,
      carW * 0.60,
      carH * 0.36,
      carW * 0.08
    );

    ctx.fill();

    // Front grille
    ctx.fillStyle = "#111315";

    ctx.fillRect(
      -carW * 0.28,
      -carH * 0.47,
      carW * 0.56,
      carH * 0.07
    );

    // Headlights
    ctx.fillStyle = "#fff3c4";

    ctx.fillRect(
      -carW * 0.39,
      -carH * 0.45,
      carW * 0.18,
      carH * 0.06
    );

    ctx.fillRect(
      carW * 0.21,
      -carH * 0.45,
      carW * 0.18,
      carH * 0.06
    );
  }

  drawSedan(ctx, carW, carH) {
    ctx.fillStyle = "#3978b5";

    this.roundRect(
        ctx,
        -carW * 0.48,
        -carH * 0.50,
        carW * 0.96,
        carH,
        carW * 0.13
    );

    ctx.fill();

    // Cabin
    ctx.fillStyle = "#243641";

    this.roundRect(
        ctx,
        -carW * 0.30,
        -carH * 0.20,
        carW * 0.60,
        carH * 0.36,
        carW * 0.08
    );

    ctx.fill();

    this.drawFrontDetails(ctx, carW, carH);
  }

  drawHatchback(ctx, carW, carH) {
    ctx.fillStyle = "#eeeeee";

    this.roundRect(
        ctx,
        -carW * 0.46,
        -carH * 0.46,
        carW * 0.92,
        carH * 0.92,
        carW * 0.20
    );

    ctx.fill();

    // Short, tall cabin
    ctx.fillStyle = "#273943";

    this.roundRect(
        ctx,
        -carW * 0.31,
        -carH * 0.18,
        carW * 0.62,
        carH * 0.32,
        carW * 0.10
    );

    ctx.fill();

    // Rear hatch line
    ctx.strokeStyle = "#c5c5c5";
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(-carW * 0.35, carH * 0.20);
    ctx.lineTo(carW * 0.35, carH * 0.20);
    ctx.stroke();

    this.drawFrontDetails(ctx, carW, carH);
  }

  drawSUV(ctx, carW, carH) {
    const w = carW * 1.12;
    const h = carH * 1.08;

    ctx.fillStyle = "#34383d";

    this.roundRect(
        ctx,
        -w * 0.48,
        -h * 0.50,
        w * 0.96,
        h,
        w * 0.09
    );

    ctx.fill();

    // Large upright cabin
    ctx.fillStyle = "#25333b";

    this.roundRect(
        ctx,
        -w * 0.33,
        -h * 0.18,
        w * 0.66,
        h * 0.40,
        w * 0.06
    );

    ctx.fill();

    // Roof rails
    ctx.strokeStyle = "#111";
    ctx.lineWidth = Math.max(1, w * 0.035);

    ctx.beginPath();
    ctx.moveTo(-w * 0.30, -h * 0.27);
    ctx.lineTo(w * 0.30, -h * 0.27);
    ctx.stroke();

    this.drawFrontDetails(ctx, w, h);
  }

  drawTaxi(ctx, carW, carH) {
    ctx.fillStyle = "#d9bd32";

    this.roundRect(
        ctx,
        -carW * 0.48,
        -carH * 0.50,
        carW * 0.96,
        carH,
        carW * 0.12
    );

    ctx.fill();

    // Cabin
    ctx.fillStyle = "#283943";

    this.roundRect(
        ctx,
        -carW * 0.29,
        -carH * 0.20,
        carW * 0.58,
        carH * 0.35,
        carW * 0.08
    );

    ctx.fill();

    // Taxi roof sign
    ctx.fillStyle = "#f4f4f4";

    ctx.fillRect(
        -carW * 0.15,
        -carH * 0.31,
        carW * 0.30,
        carH * 0.08
    );

    this.drawFrontDetails(ctx, carW, carH);
  }

  drawCompact(ctx, carW, carH) {
    const w = carW * 0.88;
    const h = carH * 0.88;

    ctx.fillStyle = "#bd4945";

    this.roundRect(
        ctx,
        -w * 0.48,
        -h * 0.50,
        w * 0.96,
        h,
        w * 0.22
    );

    ctx.fill();

    // Small cabin
    ctx.fillStyle = "#293a44";

    this.roundRect(
        ctx,
        -w * 0.27,
        -h * 0.19,
        w * 0.54,
        h * 0.31,
        w * 0.11
    );

    ctx.fill();

    this.drawFrontDetails(ctx, w, h);
  }

    drawFrontDetails(ctx, carW, carH) {
    // Front grille
    ctx.fillStyle = "#101214";

    ctx.fillRect(
      -carW * 0.27,
      -carH * 0.47,
      carW * 0.54,
      carH * 0.065
    );

    // Left headlight
    ctx.fillStyle = "#fff2bd";

    ctx.fillRect(
      -carW * 0.40,
      -carH * 0.45,
      carW * 0.17,
      carH * 0.065
    );

    // Right headlight
    ctx.fillRect(
      carW * 0.23,
      -carH * 0.45,
      carW * 0.17,
      carH * 0.065
    );
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