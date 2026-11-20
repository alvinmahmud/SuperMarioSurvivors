import Phaser from "phaser";
import {
  ENEMY_KINDS,
  ENEMY_STATS,
  type EnemyKind,
  type EnemyStats,
} from "./enemyStats";

import { ENTITY_SCALE } from "./gameConfig";
const STEP_INTERVAL = 140;
const SPACING = 7;
const BAR_WIDTH = 23;
const BAR_HEIGHT = 3;
const BAR_GAP = 3;

export default class Enemy extends Phaser.GameObjects.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  readonly stats: EnemyStats;
  private hp: number;
  private readonly healthBar: Phaser.GameObjects.Graphics;
  private readonly direction = new Phaser.Math.Vector2();
  private knockbackRemaining = 0;
  private walkTime = 0;

  static preload(scene: Phaser.Scene) {
    for (const kind of ENEMY_KINDS) {
      const { animation }: EnemyStats = ENEMY_STATS[kind];
      const path = `/assets/sprites/enemies/${kind}.png`;
      if (animation) scene.load.spritesheet(kind, path, animation);
      else scene.load.image(kind, path);
    }
  }

  static createAnimations(scene: Phaser.Scene) {
    for (const kind of ENEMY_KINDS) {
      const { animation }: EnemyStats = ENEMY_STATS[kind];
      const key = `${kind}-walk`;
      if (!animation || scene.anims.exists(key)) continue;
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(kind, { start: 0, end: 1 }),
        duration: 2 * animation.frameDuration,
        repeat: -1,
      });
    }
  }

  constructor(
    scene: Phaser.Scene,
    group: Phaser.Physics.Arcade.Group,
    readonly kind: EnemyKind,
    x: number,
    y: number,
    private readonly heading: -1 | 1 = 1,
  ) {
    super(scene, x, y, kind);
    this.stats = ENEMY_STATS[kind];
    this.hp = this.stats.maxHp;
    this.setScale(ENTITY_SCALE);
    scene.add.existing(this);
    group.add(this);
    if (this.isStraight) {
      this.body
        .setImmovable(true)
        .setFriction(0, 0)
        .setVelocity(this.heading * this.stats.speed, 0);
      this.setFlipX(this.heading > 0);
    } else {
      this.body.setCollideWorldBounds(true);
    }

    this.healthBar = scene.add.graphics().setDepth(1).setVisible(false);
    this.once(Phaser.GameObjects.Events.DESTROY, () =>
      this.healthBar.destroy(),
    );
    this.positionHealthBar();
  }

  get isStraight() {
    return this.stats.movement === "straight";
  }

  hasExited(width: number) {
    if (!this.isStraight) return false;
    return this.heading > 0 ? this.body.left >= width : this.body.right <= 0;
  }

  move(
    delta: number,
    target: Phaser.Math.Vector2,
    touchingPlayer: boolean,
    peers: readonly Enemy[],
  ) {
    if (this.isStraight) return;
    if (this.knockbackRemaining > 0) {
      this.knockbackRemaining -= delta;
      return;
    }
    if (touchingPlayer) {
      this.body.stop();
      if (this.stats.animation) this.stop().setFrame(0);
      else {
        this.walkTime = 0;
        this.setFlipX(false);
      }
      return;
    }

    this.direction
      .set(target.x - this.body.center.x, target.y - this.body.center.y)
      .normalize();
    this.addSpacing(peers);
    this.direction.limit(1).scale(this.stats.speed);
    this.body.setVelocity(this.direction.x, this.direction.y);

    if (this.stats.animation) {
      if (this.body.velocity.x !== 0) this.setFlipX(this.body.velocity.x > 0);
      this.play(`${this.kind}-walk`, true);
    } else {
      this.walkTime = (this.walkTime + delta) % (2 * STEP_INTERVAL);
      this.setFlipX(this.walkTime >= STEP_INTERVAL);
    }
  }

  takeHit(velocity?: Phaser.Math.Vector2) {
    if (--this.hp <= 0) return true;

    this.drawHealthBar();
    this.healthBar.setVisible(true);
    const { knockback } = this.stats;
    if (velocity && knockback) {
      this.direction.copy(velocity).normalize().scale(knockback.speed);
      this.body.setVelocity(this.direction.x, this.direction.y);
      this.knockbackRemaining = knockback.duration;
    }
    return false;
  }

  positionHealthBar() {
    this.healthBar.setPosition(
      this.body.center.x - BAR_WIDTH / 2,
      Math.min(
        this.body.bottom + BAR_GAP,
        this.scene.scale.height - BAR_HEIGHT,
      ),
    );
  }

  private drawHealthBar() {
    const ratio = this.hp / this.stats.maxHp;
    const color =
      ratio <= 1 / 3 ? 0xef4444 : ratio <= 2 / 3 ? 0xfacc15 : 0x22c55e;
    this.healthBar
      .clear()
      .fillStyle(0x111827)
      .fillRect(0, 0, BAR_WIDTH, BAR_HEIGHT)
      .fillStyle(color)
      .fillRect(0, 0, BAR_WIDTH * ratio, BAR_HEIGHT);
  }

  private addSpacing(peers: readonly Enemy[]) {
    const { body } = this;
    const index = peers.indexOf(this);
    for (const [otherIndex, other] of peers.entries()) {
      if (other === this || other.isStraight || !other.body.enable) continue;

      const dx = body.center.x - other.body.center.x;
      const dy = body.center.y - other.body.center.y;
      const spacingX =
        body.halfWidth + other.body.halfWidth + SPACING - Math.abs(dx);
      const spacingY =
        body.halfHeight + other.body.halfHeight + SPACING - Math.abs(dy);
      if (spacingX <= 0 || spacingY <= 0) continue;

      const fallback = index < otherIndex ? -1 : 1;
      if (spacingX <= spacingY) {
        this.direction.x +=
          (Math.sign(dx) || fallback) * Math.min(2, spacingX / SPACING);
      } else {
        this.direction.y +=
          (Math.sign(dy) || fallback) * Math.min(2, spacingY / SPACING);
      }
    }
  }
}
