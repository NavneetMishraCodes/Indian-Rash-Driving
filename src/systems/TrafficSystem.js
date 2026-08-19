import { TrafficCar } from "../entities/TrafficCar.js";

export class TrafficSystem {

  constructor() {
    this.cars = [];

    this.maxCars = 20;

    this.types = [
      "sedan",
      "hatchback",
      "suv",
      "taxi",
      "compact"
    ];

    this.spawnTimer = 0;
  }

  start() {
    this.cars.length = 0;

    // Start with a bunch of traffic.
    for (let i = 0; i < 8; i++) {
      this.spawn(
        1.1 + i * 0.55
      );
    }
  }

  spawn(depth = 1.2) {

    if (this.cars.length >= this.maxCars) {
      return;
    }

    const car =
      new TrafficCar(
        this.randomType()
      );

    // Oncoming traffic can occupy
    // any of the four lanes.
    let lane;

    const occupiedLanes =
    this.cars
        .filter(car =>
        car.depth < 0.45
        )
        .map(car => car.lane);

    const availableLanes =
    [0, 1, 2, 3].filter(
        lane =>
        !occupiedLanes.includes(lane)
    );

    if (availableLanes.length > 0) {
    lane =
        availableLanes[
        Math.floor(
            Math.random() *
            availableLanes.length
        )
        ];
    } else {
    lane =
        Math.floor(
        Math.random() * 4
        );
    }

    const speed =
      0.10 +
      Math.random() * 0.14;

    car.reset(
      lane,
      depth,
      speed,
      this.randomType()
    );

    this.cars.push(car);
  }

  randomType() {
    return this.types[
      Math.floor(
        Math.random() *
        this.types.length
      )
    ];
  }

  update(dt, playerSpeed) {
    // Traffic count is proportional to player speed.
    // Slow driving = sparse traffic.
    // Fast driving = denser traffic.
    const speedRatio = Math.min(
        1,
        playerSpeed / 0.75
    );

    const targetCars = Math.floor(
        2 + speedRatio * 10
    );

    // Move existing traffic.
    for (const car of this.cars) {
        car.update(
        dt,
        playerSpeed
        );
    }

    // Remove cars that passed the player.
    for (
        let i = this.cars.length - 1;
        i >= 0;
        i--
    ) {
        if (this.cars[i].depth > 1.15) {
        this.cars.splice(i, 1);
        }
    }

    // Spawn gradually toward the desired density.
    this.spawnTimer -= dt;

    if (
        this.spawnTimer <= 0 &&
        this.cars.length < targetCars
    ) {
        this.spawnTimer =
        0.8 +
        Math.random() * 1.2;

        this.spawn(
        0.05
        );
    }
  }

  draw(ctx, road, roadPoint, perspective) {

    const w = window.innerWidth;
    const h = window.innerHeight;

    // Far cars first.
    const sorted =
      [...this.cars].sort(
        (a, b) =>
          a.depth - b.depth
      );

    for (const car of sorted) {

      const p =
        perspective(car.depth);

      const laneCenter =
        (car.lane + 0.5) /
        road.laneCount;

      const normalized =
        (laneCenter - 0.5) * 2;

      const x =
        w * (
          0.5 +
          normalized * p.width
        );

      const y =
        h * p.y;

      const scale =
        0.18 +
        Math.pow(
          car.depth,
          1.45
        ) * 1.05;

      car.draw(
        ctx,
        x,
        y,
        scale
      );
    }
  }
}