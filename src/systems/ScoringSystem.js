export class ScoringSystem {
  constructor() {
    this.total = 0;
    this.streakCount = 0;
    this.streakActive = false;
  }

  /**
   * Register a successful traffic-car hit.
   * Awards a random base score (9, 10, or 11, equally weighted).
   * Increments the streak. When streak count > 3, adds a bonus of
   * 5 × streak count on top of the base.
   *
   * Returns an event object describing what happened, for a future
   * UI layer to consume. This system is DOM/UI-agnostic.
   */
  registerHit(car) {
    // Random base score: 9, 10, or 11 (equally weighted).
    const base = 9 + Math.floor(Math.random() * 3);

    this.streakCount += 1;
    this.streakActive = this.streakCount > 3;

    let bonus = 0;
    if (this.streakActive) {
      bonus = 5 * this.streakCount;
    }

    const gain = base + bonus;
    this.total += gain;

    return {
      type: "hit",
      base,
      bonus,
      gain,
      streakCount: this.streakCount,
      streakActive: this.streakActive,
      totalScore: this.total
    };
  }

  /**
   * Register a missed car (an unhit car that passed the player).
   * Resets the streak to 0 and deactivates it. No score penalty.
   *
   * Returns an event object for a future UI layer.
   */
  registerMiss(car) {
    const wasActive = this.streakActive;

    this.streakCount = 0;
    this.streakActive = false;

    return {
      type: "miss",
      wasActive,
      streakCount: 0,
      streakActive: false,
      totalScore: this.total
    };
  }
}