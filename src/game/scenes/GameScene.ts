import Phaser from "phaser";
import Enemy from "../Enemy";
import { ENEMY_KINDS, ENEMY_STATS, type EnemyKind } from "../enemyStats";
import { ENTITY_SCALE, enemyCapAt } from "../gameConfig";

const PLAYER_SPEED = 180;

const MARIO_SHRINK_ANIMATION = "mario-shrink";
const MARIO_FIRE_TRANSITION = "mario-fire-transition";
const FIREBALL_ANIMATION = "fireball-spin";
const MARIO_INVINCIBILITY = 1500;
const MARIO_BLINK_INTERVAL = 100;

const SPAWN_MARGIN = 32;
const PROJECTILE_SPEED = 360;
const ATTACK_INTERVAL = 1000;
const ENEMY_SPAWN_INTERVAL = 1000;

type MarioForm = "big" | "fire" | "small";

export type GameScreen = "loading" | "start" | "playing" | "game-over";

type RunPhase = "waiting" | "running" | "dying" | "game-over" | "restarting";

export default class GameScene extends Phaser.Scene {
  private runPhase: RunPhase = "waiting";
  private player!: Phaser.Physics.Arcade.Body;
  private mario!: Phaser.GameObjects.Sprite;
  private marioForm: MarioForm = "big";
  private transforming = false;
  private pickup?: Phaser.GameObjects.Image;
  private defeated = 0;
  private elapsedSeconds = 0;
  private attackTimer?: Phaser.Time.TimerEvent;
  private invincibilityTimer?: Phaser.Time.TimerEvent;
  private playerHit = false;
  private enemies: Enemy[] = [];
  private enemyBodies!: Phaser.Physics.Arcade.Group;

  private projectiles!: Phaser.Physics.Arcade.Group;
  private movePlayer?: () => void;

  constructor(
    private readonly onScreenChange: (screen: GameScreen) => void,
    private readonly onDefeatedChange: (defeated: number) => void,
    private readonly onElapsedChange: (seconds: number) => void,
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
    Enemy.preload(this);
  }

  create(data: { autoStart?: boolean } = {}) {
    this.runPhase = "waiting";
    this.createMarioAnimations();
    this.marioForm = "big";
    this.transforming = false;
    this.defeated = 0;
    this.onDefeatedChange(this.defeated);
    this.elapsedSeconds = 0;
    this.onElapsedChange(this.elapsedSeconds);
    this.pickup = undefined;
    this.attackTimer = undefined;
    this.invincibilityTimer = undefined;
    this.playerHit = false;

    const { width, height } = this.scale;
    const mario = this.add
      .sprite(width / 2, height / 2, "big-mario", 0)
      .setScale(ENTITY_SCALE)
      .setOrigin(0.5, 1);
    mario.y += mario.displayHeight / 2;
    this.physics.add.existing(mario);
    if (!(mario.body instanceof Phaser.Physics.Arcade.Body)) {
      throw new Error("Could not create an Arcade Physics body for Mario");
    }

    this.mario = mario;
    this.player = mario.body.setCollideWorldBounds(true);
    this.updatePlayerBounds();
    Enemy.createAnimations(this);

    this.projectiles = this.physics.add.group();
    this.enemyBodies = this.physics.add.group();
    this.physics.add.collider(
      this.enemyBodies,
      this.enemyBodies,
      undefined,
      (a, b) =>
        a instanceof Enemy &&
        b instanceof Enemy &&
        !a.isStraight &&
        !b.isStraight,
    );
    this.physics.add.overlap(
      this.enemyBodies,
      this.projectiles,
      (enemy, projectile) => {
        if (
          !(enemy instanceof Enemy) ||
          !enemy.body.enable ||
          !(projectile instanceof Phaser.GameObjects.Sprite)
        )
          return;
        const body = projectile.body;
        const defeated = enemy.takeHit(
          body instanceof Phaser.Physics.Arcade.Body
            ? body.velocity
            : undefined,
        );
        projectile.destroy();
        if (defeated) {
          this.removeEnemy(enemy);
          this.onDefeatedChange(++this.defeated);
        }
      },
    );
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
      this.time.addEvent({
        delay: 1000,
        loop: true,
        callback: () => this.onElapsedChange(++this.elapsedSeconds),
      });
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
    for (const enemy of this.enemies) enemy.positionHealthBar();
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
    this.startFireAttack();

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (enemy.hasExited(this.scale.width)) {
        this.removeEnemy(enemy);
      } else {
        enemy.move(
          delta,
          this.player.center,
          !grace && this.isTouchingPlayer(enemy),
          this.enemies,
        );
      }
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
    if (this.marioForm !== "fire" || this.attackTimer || !this.fireProjectile())
      return;
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
    const margin = SPAWN_MARGIN;
    const frame = this.textures.getFrame(texture);
    const verticalMargin = texture === "super-mushroom" ? 2 * margin : margin;
    let x: number;
    let y: number;
    do {
      x = Phaser.Math.Between(margin, width - margin);
      y = Phaser.Math.Between(verticalMargin, height - verticalMargin);
    } while (
      Phaser.Math.Distance.Squared(x, y, playerX, playerY) < 80 ** 2 ||
      this.enemies.some(({ body }) =>
        this.overlapsSpawn(
          body,
          x,
          y,
          frame.realWidth * ENTITY_SCALE,
          frame.realHeight * ENTITY_SCALE,
        ),
      )
    );
    this.pickup = this.add.image(x, y, texture).setScale(ENTITY_SCALE);
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
    for (const enemy of this.enemies) enemy.anims.pause();
    for (const projectile of this.projectiles.getChildren()) {
      if (projectile instanceof Phaser.GameObjects.Sprite)
        projectile.anims.pause();
    }
  }

  private resumeGameplay() {
    for (const enemy of this.enemies) enemy.anims.resume();
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
    if (this.enemies.length >= enemyCapAt(this.elapsedSeconds)) return;

    const { width, height } = this.scale;
    const margin = SPAWN_MARGIN;
    const { x: playerX, y: playerY } = this.player.center;
    const kind = Phaser.Utils.Array.GetRandom(ENEMY_KINDS);
    const frame = this.textures.getFrame(kind);
    if (ENEMY_STATS[kind].movement === "straight") {
      const heading = Phaser.Math.Between(0, 1) === 0 ? 1 : -1;
      const halfWidth = (frame.realWidth * ENTITY_SCALE) / 2;
      const x = heading === 1 ? -halfWidth : width + halfWidth;
      const y = Phaser.Math.Between(margin, height - margin);
      this.addEnemy(kind, x, y, heading);
      return;
    }

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
          frame.realWidth * ENTITY_SCALE,
          frame.realHeight * ENTITY_SCALE,
        );
      if (
        overlaps(this.player) ||
        this.enemies.some(({ body }) => overlaps(body))
      )
        continue;

      this.addEnemy(kind, x, y);
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

  private addEnemy(kind: EnemyKind, x: number, y: number, heading?: -1 | 1) {
    const enemy = new Enemy(this, this.enemyBodies, kind, x, y, heading);
    this.enemies.push(enemy);
    return enemy;
  }

  private removeEnemy(enemy: Enemy) {
    enemy.body.enable = false;
    enemy.destroy();
    this.enemies.splice(this.enemies.indexOf(enemy), 1);
  }

  private fireProjectile() {
    if (this.marioForm !== "fire" || this.transforming) return false;

    const { x, y } = this.player.center;
    let target: Enemy | undefined;
    let closestDistance = Infinity;

    for (const enemy of this.enemies) {
      if (
        !enemy.body.enable ||
        enemy.body.right <= 0 ||
        enemy.body.left >= this.scale.width
      )
        continue;
      const center = enemy.body.center;
      const distance = Phaser.Math.Distance.Squared(x, y, center.x, center.y);
      if (distance < closestDistance) {
        target = enemy;
        closestDistance = distance;
      }
    }
    if (!target) return false;

    const fireball = this.add
      .sprite(x, y, "fireball", 0)
      .setScale(ENTITY_SCALE);
    this.projectiles.add(fireball);
    fireball.play(FIREBALL_ANIMATION);
    this.physics.moveTo(
      fireball,
      target.body.center.x,
      target.body.center.y,
      PROJECTILE_SPEED,
    );
    return true;
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
