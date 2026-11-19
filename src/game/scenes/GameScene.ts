import Phaser from "phaser";
import { ENEMY_KINDS, ENEMY_STATS, type EnemyKind } from "../enemyStats";

const PLAYER_SPEED = 180;
const PLAYER_SPRITE_SCALE = 2;
const MARIO_SHRINK_ANIMATION = "mario-shrink";
const MARIO_FIRE_TRANSITION = "mario-fire-transition";
const FIREBALL_ANIMATION = "fireball-spin";
const MARIO_INVINCIBILITY = 1500;
const MARIO_BLINK_INTERVAL = 100;

const ENEMY_STEP_INTERVAL = 140;
const KOOPA_FRAME_DURATION = 150;
const RED_PARATROOPA_FRAME_DURATION = 200;
const KOOPA_KINDS = ENEMY_KINDS.filter((kind) => kind !== "goomba");

const SQUARE_SIZE = 32;
const FIREBALL_SCALE = 2;
const PROJECTILE_SPEED = 360;
const ATTACK_INTERVAL = 1000;
const ENEMY_SPAWN_INTERVAL = 1000;
const MAX_ENEMIES = 5;

const HEALTH_BAR_WIDTH = 26;
const HEALTH_BAR_HEIGHT = 3;
const HEALTH_BAR_GAP = 3;
const KNOCKBACK_SPEED = 95;
const KNOCKBACK_DURATION = 90;
const ENEMY_SPACING = 8;

type MarioForm = "big" | "fire" | "small";

export type GameScreen = "loading" | "start" | "playing" | "game-over";

type RunPhase = "waiting" | "running" | "dying" | "game-over" | "restarting";

type Enemy = {
  kind: EnemyKind;
  sprite: Phaser.GameObjects.Sprite;
  body: Phaser.Physics.Arcade.Body;
  healthBar: Phaser.GameObjects.Graphics;
  hp: number;
  maxHp: number;
  knockbackRemaining: number;
  walkTime: number;
};

export default class GameScene extends Phaser.Scene {
  private runPhase: RunPhase = "waiting";
  private player!: Phaser.Physics.Arcade.Body;
  private mario!: Phaser.GameObjects.Sprite;
  private marioForm: MarioForm = "big";
  private transforming = false;
  private pickup?: Phaser.GameObjects.Image;
  private defeated = 0;
  private attackTimer?: Phaser.Time.TimerEvent;
  private invincibilityTimer?: Phaser.Time.TimerEvent;
  private playerHit = false;
  private enemies: Enemy[] = [];
  private enemyBodies!: Phaser.Physics.Arcade.Group;

  private projectiles!: Phaser.Physics.Arcade.Group;
  private movePlayer?: () => void;
  private enemyDirection = new Phaser.Math.Vector2();

  constructor(
    private readonly onScreenChange: (screen: GameScreen) => void,
    private readonly onDefeatedChange: (defeated: number) => void,
  ) {
    super("GameScene");
  }

  preload() {
    this.load.image("mario-death", "/assets/sprites/player/mario-death.png");
    this.load.image("fire-flower", "/assets/sprites/items/fire-flower.png");
    this.load.image(
      "super-mushroom",
      "/assets/sprites/items/super-mushroom.png",
    );
    this.load.spritesheet(
      "fire-mario",
      "/assets/sprites/player/fire-mario.png",
      {
        frameWidth: 16,
        frameHeight: 32,
      },
    );
    this.load.spritesheet("fireball", "/assets/sprites/fireball.png", {
      frameWidth: 8,
      frameHeight: 8,
    });
    this.load.spritesheet("big-mario", "/assets/sprites/player/big-mario.png", {
      frameWidth: 16,
      frameHeight: 32,
    });
    this.load.spritesheet(
      "mario-transform",
      "/assets/sprites/player/mario-transform.png",
      {
        frameWidth: 16,
        frameHeight: 32,
      },
    );
    this.load.spritesheet(
      "small-mario",
      "/assets/sprites/player/small-mario.png",
      {
        frameWidth: 16,
        frameHeight: 16,
      },
    );
    this.load.image("goomba", "/assets/sprites/enemies/goomba.png");
    for (const kind of KOOPA_KINDS) {
      this.load.spritesheet(kind, `/assets/sprites/enemies/${kind}.png`, {
        frameWidth: 16,
        frameHeight: 24,
      });
    }
  }

  create(data: { autoStart?: boolean } = {}) {
    this.runPhase = "waiting";
    this.createMarioAnimations();
    this.marioForm = "big";
    this.transforming = false;
    this.defeated = 0;
    this.onDefeatedChange(this.defeated);
    this.pickup = undefined;
    this.attackTimer = undefined;
    this.invincibilityTimer = undefined;
    this.playerHit = false;

    const { width, height } = this.scale;
    const mario = this.add
      .sprite(width / 2, height / 2, "big-mario", 0)
      .setScale(PLAYER_SPRITE_SCALE)
      .setOrigin(0.5, 1);
    mario.y += mario.displayHeight / 2;
    this.physics.add.existing(mario);
    if (!(mario.body instanceof Phaser.Physics.Arcade.Body)) {
      throw new Error("Could not create an Arcade Physics body for Mario");
    }

    this.mario = mario;
    this.player = mario.body.setCollideWorldBounds(true);
    this.updatePlayerBounds();
    for (const kind of KOOPA_KINDS) {
      const key = `${kind}-walk`;
      if (this.anims.exists(key)) continue;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(kind, { start: 0, end: 1 }),
        duration:
          2 *
          (kind === "red-paratroopa"
            ? RED_PARATROOPA_FRAME_DURATION
            : KOOPA_FRAME_DURATION),
        repeat: -1,
      });
    }

    this.projectiles = this.physics.add.group();
    this.enemyBodies = this.physics.add.group();
    this.physics.add.collider(this.enemyBodies, this.enemyBodies);
    this.physics.add.collider(
      mario,
      this.enemyBodies,
      () => {
        this.playerHit = true;
      },
      () => !this.invincibilityTimer,
    );
    this.enemies = [];
    this.spawnPickup("fire-flower");
    this.time.addEvent({
      delay: ENEMY_SPAWN_INTERVAL,
      loop: true,
      callback: () => this.spawnEnemy(),
    });

    this.bindPlayerControls(mario);
    if (data.autoStart) {
      this.startRun();
    } else {
      this.freezeGameplay();
      this.onScreenChange("start");
    }
  }

  startRun() {
    if (this.runPhase === "waiting") {
      this.runPhase = "running";
      this.resumeGameplay();
      this.onScreenChange("playing");
    } else if (this.runPhase === "game-over") {
      this.runPhase = "restarting";
      this.scene.restart({ autoStart: true });
    }
  }

  private bindPlayerControls(mario: Phaser.GameObjects.Sprite) {
    this.movePlayer = undefined;
    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    const { W, A, S, D } = Phaser.Input.Keyboard.KeyCodes;
    const up = keyboard.addKey(W);
    const left = keyboard.addKey(A);
    const down = keyboard.addKey(S);
    const right = keyboard.addKey(D);
    const arrows = keyboard.createCursorKeys();
    keyboard.removeCapture(Phaser.Input.Keyboard.KeyCodes.SPACE);
    const direction = new Phaser.Math.Vector2();

    this.movePlayer = () => {
      direction
        .set(
          Number(right.isDown || arrows.right.isDown) -
            Number(left.isDown || arrows.left.isDown),
          Number(down.isDown || arrows.down.isDown) -
            Number(up.isDown || arrows.up.isDown),
        )
        .normalize()
        .scale(PLAYER_SPEED);

      this.player.setVelocity(direction.x, direction.y);

      if (direction.x !== 0) mario.setFlipX(direction.x < 0);
      if (direction.x !== 0 || direction.y !== 0) {
        mario.play(`${this.marioForm}-mario-walk`, true);
      } else if (mario.anims.isPlaying) {
        mario.stop().setFrame(0);
      }
    };
  }

  update(_time: number, delta: number) {
    for (const enemy of this.enemies) this.positionHealthBar(enemy);
    if (this.runPhase !== "running" || this.transforming) return;

    const grace = this.invincibilityTimer;
    const playerHit = this.playerHit;
    this.playerHit = false;
    if (
      !grace &&
      (playerHit || this.enemies.some((enemy) => this.isTouchingPlayer(enemy)))
    ) {
      if (this.marioForm === "small") {
        this.playMarioDeath();
      } else {
        this.transformMario(this.marioForm === "fire" ? "big" : "small", true);
      }
      return;
    }

    const pickup = this.pickup;
    if (pickup && this.isTouchingPickup(pickup)) {
      pickup.destroy();
      this.pickup = undefined;
      this.transformMario(this.marioForm === "small" ? "big" : "fire", false);
      return;
    }
    if (grace) {
      const blink = Math.floor(grace.getElapsed() / MARIO_BLINK_INTERVAL) % 2;
      this.mario.setAlpha(blink === 0 ? 0.35 : 1);
    }

    this.movePlayer?.();

    this.clearOffscreenProjectiles();

    for (const enemy of this.enemies) {
      this.updateEnemy(enemy, delta);
    }
  }

  private createMarioAnimations() {
    for (const [texture, duration] of [
      ["big-mario", 450],
      ["fire-mario", 450],
      ["small-mario", 300],
    ] as const) {
      const key = `${texture}-walk`;
      if (this.anims.exists(key)) continue;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(texture, { start: 1, end: 3 }),
        duration,
        repeat: -1,
      });
    }

    if (!this.anims.exists(MARIO_FIRE_TRANSITION)) {
      this.anims.create({
        key: MARIO_FIRE_TRANSITION,
        frames: Array.from({ length: 8 }, (_, i) => ({
          key: i % 2 === 0 ? "big-mario" : "fire-mario",
          frame: 0,
        })),
        frameRate: 10,
      });
    }
    if (!this.anims.exists(FIREBALL_ANIMATION)) {
      this.anims.create({
        key: FIREBALL_ANIMATION,
        frames: this.anims.generateFrameNumbers("fireball", {
          start: 0,
          end: 3,
        }),
        frameRate: 25,
        repeat: -1,
      });
    }
    if (this.anims.exists(MARIO_SHRINK_ANIMATION)) return;
    this.anims.create({
      key: MARIO_SHRINK_ANIMATION,
      frames: this.anims.generateFrameNumbers("mario-transform", {
        frames: [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
      }),
      frameRate: 10,
    });
  }

  private isTouchingPlayer({ body }: Enemy) {
    return (
      body.enable &&
      Math.abs(this.player.center.x - body.center.x) <=
        this.player.halfWidth + body.halfWidth &&
      Math.abs(this.player.center.y - body.center.y) <=
        this.player.halfHeight + body.halfHeight
    );
  }

  private transformMario(form: MarioForm, fromHit: boolean) {
    this.transforming = true;
    this.freezeGameplay();
    if (this.marioForm === "fire") {
      this.attackTimer?.remove();
      this.attackTimer = undefined;
    }

    const animation =
      form === "small" || this.marioForm === "small"
        ? MARIO_SHRINK_ANIMATION
        : MARIO_FIRE_TRANSITION;
    this.mario.once(
      `${Phaser.Animations.Events.ANIMATION_COMPLETE_KEY}${animation}`,
      () => this.finishTransformation(form, fromHit),
    );
    if (form === "big") {
      this.mario.playReverse(animation);
    } else {
      this.mario.play(animation);
    }
  }

  private finishTransformation(form: MarioForm, fromHit: boolean) {
    this.marioForm = form;
    this.transforming = false;
    this.mario.setTexture(`${form}-mario`, 0).setAlpha(fromHit ? 0.35 : 1);
    this.updatePlayerBounds();
    if (form === "small") {
      this.spawnPickup("super-mushroom");
    } else if (form === "big") {
      this.spawnPickup("fire-flower");
    }

    this.resumeGameplay();
    if (fromHit) {
      this.invincibilityTimer = this.time.delayedCall(
        MARIO_INVINCIBILITY,
        () => {
          this.invincibilityTimer = undefined;
          this.mario.setAlpha(1);
        },
      );
    } else {
      this.startFireAttack();
    }
  }

  private startFireAttack() {
    if (this.marioForm !== "fire" || this.attackTimer || !this.enemies.length)
      return;

    this.fireProjectile();
    this.attackTimer = this.time.addEvent({
      delay: ATTACK_INTERVAL,
      loop: true,
      callback: () => this.fireProjectile(),
    });
  }

  private updatePlayerBounds() {
    this.player
      .setSize(this.mario.width, this.mario.height)
      .updateFromGameObject();
  }

  private spawnPickup(texture: "fire-flower" | "super-mushroom") {
    this.pickup?.destroy();
    const { width, height } = this.scale;
    const { x: playerX, y: playerY } = this.player.center;
    const margin = SQUARE_SIZE;
    const verticalMargin = texture === "super-mushroom" ? 2 * margin : margin;
    let x: number;
    let y: number;
    do {
      x = Phaser.Math.Between(margin, width - margin);
      y = Phaser.Math.Between(verticalMargin, height - verticalMargin);
    } while (
      Phaser.Math.Distance.Squared(x, y, playerX, playerY) < 80 ** 2 ||
      this.enemies.some(({ body }) =>
        this.overlapsSpawn(body, x, y, margin, margin),
      )
    );
    this.pickup = this.add.image(x, y, texture).setScale(2);
  }

  private isTouchingPickup(pickup: Phaser.GameObjects.Image) {
    return (
      Math.abs(this.player.center.x - pickup.x) <=
        this.player.halfWidth + pickup.displayWidth / 2 &&
      Math.abs(this.player.center.y - pickup.y) <=
        this.player.halfHeight + pickup.displayHeight / 2
    );
  }

  private freezeGameplay() {
    this.player.stop();
    this.physics.pause();
    this.time.paused = true;
    for (const { sprite } of this.enemies) sprite.anims.pause();
    for (const projectile of this.projectiles.getChildren()) {
      if (projectile instanceof Phaser.GameObjects.Sprite)
        projectile.anims.pause();
    }
  }

  private resumeGameplay() {
    for (const { sprite } of this.enemies) sprite.anims.resume();
    for (const projectile of this.projectiles.getChildren()) {
      if (projectile instanceof Phaser.GameObjects.Sprite)
        projectile.anims.resume();
    }
    this.physics.resume();
    this.time.paused = false;
  }

  private playMarioDeath() {
    this.runPhase = "dying";
    this.freezeGameplay();
    this.player.enable = false;
    const mario = this.mario;
    mario.stop().setTexture("mario-death").setFlipX(false).setDepth(2);

    this.tweens.chain({
      targets: mario,
      tweens: [
        { y: mario.y - 56, duration: 250, ease: "Quad.Out" },
        {
          y: this.scale.height + mario.displayHeight,
          duration: 750,
          ease: "Quad.In",
        },
      ],
      onComplete: () => {
        this.runPhase = "game-over";
        this.onScreenChange("game-over");
      },
    });
  }

  private spawnEnemy() {
    if (this.enemies.length >= MAX_ENEMIES) return;

    const { width, height } = this.scale;
    const margin = SQUARE_SIZE;
    const { x: playerX, y: playerY } = this.player.center;
    const kind = Phaser.Utils.Array.GetRandom(ENEMY_KINDS);
    const frame = this.textures.getFrame(kind);

    for (let attempt = 0; attempt < 8; attempt++) {
      const [x, y] = Phaser.Utils.Array.GetRandom([
        [
          playerX < width / 2 ? width - margin : margin,
          Phaser.Math.Between(margin, height - margin),
        ],
        [
          Phaser.Math.Between(margin, width - margin),
          playerY < height / 2 ? height - margin : margin,
        ],
      ]);
      const overlaps = (body: Phaser.Physics.Arcade.Body) =>
        this.overlapsSpawn(
          body,
          x,
          y,
          frame.realWidth * 2,
          frame.realHeight * 2,
        );
      if (
        overlaps(this.player) ||
        this.enemies.some(({ body }) => overlaps(body))
      )
        continue;

      this.enemies.push(this.addEnemy(kind, x, y));
      this.startFireAttack();
      return;
    }
  }

  private overlapsSpawn(
    body: Phaser.Physics.Arcade.Body,
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    return (
      Math.abs(x - body.center.x) < width / 2 + body.halfWidth &&
      Math.abs(y - body.center.y) < height / 2 + body.halfHeight
    );
  }

  private addEnemy(kind: Enemy["kind"], x: number, y: number): Enemy {
    const sprite = this.add.sprite(x, y, kind).setScale(2);
    this.enemyBodies.add(sprite);
    if (!(sprite.body instanceof Phaser.Physics.Arcade.Body)) {
      throw new Error(`Could not create an Arcade Physics body for ${kind}`);
    }

    const { maxHp } = ENEMY_STATS[kind];
    const enemy: Enemy = {
      kind,
      sprite,
      body: sprite.body.setCollideWorldBounds(true),
      healthBar: this.add.graphics().setDepth(1),
      hp: maxHp,
      maxHp,
      knockbackRemaining: 0,
      walkTime: 0,
    };
    this.drawHealthBar(enemy);
    this.positionHealthBar(enemy);
    const overlap = this.physics.add.overlap(
      sprite,
      this.projectiles,
      (_enemy, projectile) => {
        if (
          !enemy.body.enable ||
          !(projectile instanceof Phaser.GameObjects.Sprite)
        )
          return;
        this.hitEnemy(enemy, projectile);
        if (enemy.hp === 0) overlap.destroy();
      },
    );
    return enemy;
  }

  private updateEnemy(enemy: Enemy, delta: number) {
    const { body, sprite } = enemy;
    if (!body.enable) return;

    if (enemy.knockbackRemaining > 0) {
      enemy.knockbackRemaining -= delta;
      return;
    }

    if (!this.invincibilityTimer && this.isTouchingPlayer(enemy)) {
      body.stop();
      this.stopEnemyAnimation(enemy);
      return;
    }

    const dx = this.player.center.x - body.center.x;
    const dy = this.player.center.y - body.center.y;
    this.enemyDirection.set(dx, dy).normalize();
    this.addEnemySpacing(enemy);
    this.enemyDirection.limit(1).scale(ENEMY_STATS[enemy.kind].speed);
    body.setVelocity(this.enemyDirection.x, this.enemyDirection.y);

    if (enemy.kind !== "goomba") {
      if (body.velocity.x !== 0) sprite.setFlipX(body.velocity.x > 0);
      sprite.play(`${enemy.kind}-walk`, true);
    } else {
      enemy.walkTime = (enemy.walkTime + delta) % (2 * ENEMY_STEP_INTERVAL);
      sprite.setFlipX(enemy.walkTime >= ENEMY_STEP_INTERVAL);
    }
  }

  private addEnemySpacing(enemy: Enemy) {
    const { body } = enemy;
    const index = this.enemies.indexOf(enemy);

    for (const [otherIndex, other] of this.enemies.entries()) {
      if (other === enemy || !other.body.enable) continue;

      const dx = body.center.x - other.body.center.x;
      const dy = body.center.y - other.body.center.y;
      const spacingX =
        body.halfWidth + other.body.halfWidth + ENEMY_SPACING - Math.abs(dx);
      const spacingY =
        body.halfHeight + other.body.halfHeight + ENEMY_SPACING - Math.abs(dy);
      if (spacingX <= 0 || spacingY <= 0) continue;

      const fallback = index < otherIndex ? -1 : 1;
      if (spacingX <= spacingY) {
        this.enemyDirection.x +=
          (Math.sign(dx) || fallback) * Math.min(2, spacingX / ENEMY_SPACING);
      } else {
        this.enemyDirection.y +=
          (Math.sign(dy) || fallback) * Math.min(2, spacingY / ENEMY_SPACING);
      }
    }
  }

  private stopEnemyAnimation(enemy: Enemy) {
    if (enemy.kind !== "goomba") {
      enemy.sprite.stop().setFrame(0);
    } else {
      enemy.walkTime = 0;
      enemy.sprite.setFlipX(false);
    }
  }

  private fireProjectile() {
    if (this.marioForm !== "fire" || this.transforming) return;

    const { x, y } = this.player.center;
    let target: Enemy | undefined;
    let closestDistance = Infinity;

    for (const enemy of this.enemies) {
      if (!enemy.body.enable) continue;
      const center = enemy.body.center;
      const distance = Phaser.Math.Distance.Squared(x, y, center.x, center.y);
      if (distance < closestDistance) {
        target = enemy;
        closestDistance = distance;
      }
    }
    if (!target) return;

    const fireball = this.add
      .sprite(x, y, "fireball", 0)
      .setScale(FIREBALL_SCALE);
    this.projectiles.add(fireball);
    fireball.play(FIREBALL_ANIMATION);
    this.physics.moveTo(
      fireball,
      target.body.center.x,
      target.body.center.y,
      PROJECTILE_SPEED,
    );
  }

  private drawHealthBar(enemy: Enemy) {
    const ratio = enemy.hp / enemy.maxHp;
    const color =
      ratio <= 1 / 3 ? 0xef4444 : ratio <= 2 / 3 ? 0xfacc15 : 0x22c55e;
    enemy.healthBar
      .clear()
      .fillStyle(0x111827)
      .fillRect(0, 0, HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT)
      .fillStyle(color)
      .fillRect(0, 0, HEALTH_BAR_WIDTH * ratio, HEALTH_BAR_HEIGHT);
  }

  private positionHealthBar({ body, healthBar }: Enemy) {
    healthBar.setPosition(
      body.center.x - HEALTH_BAR_WIDTH / 2,
      Math.min(
        body.bottom + HEALTH_BAR_GAP,
        this.scale.height - HEALTH_BAR_HEIGHT,
      ),
    );
  }

  private hitEnemy(enemy: Enemy, projectile: Phaser.GameObjects.Sprite) {
    const projectileBody = projectile.body;
    if (projectileBody instanceof Phaser.Physics.Arcade.Body) {
      this.enemyDirection
        .copy(projectileBody.velocity)
        .normalize()
        .scale(KNOCKBACK_SPEED);
    }
    projectile.destroy();

    enemy.hp -= 1;
    if (enemy.hp > 0) {
      this.drawHealthBar(enemy);
      if (projectileBody instanceof Phaser.Physics.Arcade.Body) {
        enemy.body.setVelocity(this.enemyDirection.x, this.enemyDirection.y);
        enemy.knockbackRemaining = KNOCKBACK_DURATION;
      }
      return;
    }

    enemy.body.enable = false;
    enemy.healthBar.destroy();
    enemy.sprite.destroy();
    this.enemies.splice(this.enemies.indexOf(enemy), 1);
    this.onDefeatedChange(++this.defeated);
  }

  private clearOffscreenProjectiles() {
    const { width, height } = this.scale;
    const projectiles = this.projectiles.getChildren();

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const projectile = projectiles[i];
      if (!(projectile instanceof Phaser.GameObjects.Sprite)) continue;

      const { x, y } = projectile;
      const margin = projectile.displayWidth / 2;
      if (
        x < -margin ||
        x > width + margin ||
        y < -margin ||
        y > height + margin
      ) {
        projectile.destroy();
      }
    }
  }
}
