import Phaser from "phaser";

const PLAYER_SPEED = 180;
const PLAYER_SPRITE_SCALE = 2;
const MARIO_SHRINK_ANIMATION = "mario-shrink";
const MARIO_FIRE_TRANSITION = "mario-fire-transition";
const FIREBALL_ANIMATION = "fireball-spin";
const MARIO_INVINCIBILITY = 1500;
const MARIO_BLINK_INTERVAL = 100;
const ENEMY_SPEED = 55;
const ENEMY_STEP_INTERVAL = 140;
const KOOPA_FRAME_DURATION = 150;
const KOOPA_WALK_ANIMATION = "koopa-walk";
const SQUARE_SIZE = 32;
const FIREBALL_SCALE = 2;
const PROJECTILE_SPEED = 360;
const ATTACK_INTERVAL = 5000;
const ENEMY_SPAWN_INTERVAL = 2000;
const MAX_ENEMIES = 10;

type MarioForm = "big" | "fire" | "small";

export type GameScreen = "loading" | "start" | "playing" | "game-over";

type RunPhase = "waiting" | "running" | "dying" | "game-over" | "restarting";

type Enemy = {
  kind: "goomba" | "koopa";
  sprite: Phaser.GameObjects.Sprite;
  body: Phaser.Physics.Arcade.Body;
  walkTime: number;
};

export default class GameScene extends Phaser.Scene {
  private runPhase: RunPhase = "waiting";
  private player!: Phaser.Physics.Arcade.Body;
  private mario!: Phaser.GameObjects.Sprite;
  private marioForm: MarioForm = "big";
  private transforming = false;
  private flower?: Phaser.GameObjects.Image;
  private attackTimer?: Phaser.Time.TimerEvent;
  private invincibilityTimer?: Phaser.Time.TimerEvent;
  private enemies: Enemy[] = [];
  private projectiles!: Phaser.Physics.Arcade.Group;
  private movePlayer?: () => void;
  private enemyDirection = new Phaser.Math.Vector2();

  constructor(private readonly onScreenChange: (screen: GameScreen) => void) {
    super("GameScene");
  }

  preload() {
    this.load.image("mario-death", "/assets/sprites/mario-death.png");
    this.load.image("fire-flower", "/assets/sprites/fire-flower.png");
    this.load.spritesheet("fire-mario", "/assets/sprites/fire-mario.png", {
      frameWidth: 16,
      frameHeight: 32,
    });
    this.load.spritesheet("fireball", "/assets/sprites/fireball.png", {
      frameWidth: 8,
      frameHeight: 8,
    });
    this.load.spritesheet("big-mario", "/assets/sprites/big-mario.png", {
      frameWidth: 16,
      frameHeight: 32,
    });
    this.load.spritesheet(
      "mario-transform",
      "/assets/sprites/mario-transform.png",
      {
        frameWidth: 16,
        frameHeight: 32,
      },
    );
    this.load.spritesheet("small-mario", "/assets/sprites/small-mario.png", {
      frameWidth: 16,
      frameHeight: 16,
    });
    this.load.image("goomba", "/assets/sprites/goomba.png");
    this.load.spritesheet("koopa", "/assets/sprites/koopa.png", {
      frameWidth: 16,
      frameHeight: 24,
    });
  }

  create(data: { autoStart?: boolean } = {}) {
    this.runPhase = "waiting";
    this.createMarioAnimations();
    this.marioForm = "big";
    this.transforming = false;
    this.attackTimer = undefined;
    this.invincibilityTimer = undefined;

    const { width, height } = this.scale;
    const mario = this.add
      .sprite(width / 2, height / 2, "big-mario", 0)
      .setScale(PLAYER_SPRITE_SCALE);
    this.physics.add.existing(mario);
    if (!(mario.body instanceof Phaser.Physics.Arcade.Body)) {
      throw new Error("Could not create an Arcade Physics body for Mario");
    }

    this.mario = mario;
    const hitboxSize = SQUARE_SIZE / PLAYER_SPRITE_SCALE;
    const verticalInset = (mario.displayHeight - SQUARE_SIZE) / 2;
    this.player = mario.body
      .setSize(hitboxSize, hitboxSize)
      .setBoundsRectangle(
        new Phaser.Geom.Rectangle(
          0,
          verticalInset,
          width,
          height - 2 * verticalInset,
        ),
      )
      .setCollideWorldBounds(true);
    if (!this.anims.exists(KOOPA_WALK_ANIMATION)) {
      this.anims.create({
        key: KOOPA_WALK_ANIMATION,
        frames: this.anims.generateFrameNumbers("koopa", { start: 0, end: 1 }),
        duration: 2 * KOOPA_FRAME_DURATION,
        repeat: -1,
      });
    }

    this.projectiles = this.physics.add.group();
    this.enemies = [];
    this.spawnFlower();
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
    if (this.runPhase !== "running" || this.transforming) return;

    const grace = this.invincibilityTimer;
    if (!grace && this.enemies.some((enemy) => this.isTouchingPlayer(enemy))) {
      if (this.marioForm === "small") {
        this.playMarioDeath();
      } else {
        this.transformMario(this.marioForm === "fire" ? "big" : "small", true);
      }
      return;
    }

    if (this.flower && this.marioForm === "big" && this.isTouchingFlower()) {
      this.flower.destroy();
      this.flower = undefined;
      this.transformMario("fire", false);
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
      form === "small" ? MARIO_SHRINK_ANIMATION : MARIO_FIRE_TRANSITION;
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
    if (form === "small") {
      const hitboxSize = SQUARE_SIZE / PLAYER_SPRITE_SCALE;
      this.player
        .setSize(hitboxSize, hitboxSize)
        .setBoundsRectangle(this.physics.world.bounds)
        .updateFromGameObject();
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

  private spawnFlower() {
    const { width, height } = this.scale;
    const margin = SQUARE_SIZE;
    let x: number;
    let y: number;
    do {
      x = Phaser.Math.Between(margin, width - margin);
      y = Phaser.Math.Between(margin, height - margin);
    } while (
      Phaser.Math.Distance.Squared(x, y, width / 2, height / 2) <
      80 ** 2
    );
    this.flower = this.add.image(x, y, "fire-flower").setScale(2);
  }

  private isTouchingFlower() {
    const flower = this.flower;
    return (
      flower &&
      Math.abs(this.player.center.x - flower.x) <=
        this.player.halfWidth + flower.displayWidth / 2 &&
      Math.abs(this.player.center.y - flower.y) <=
        this.player.halfHeight + flower.displayHeight / 2
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
    mario.stop().setTexture("mario-death").setFlipX(false).setDepth(1);

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
    const x = Phaser.Math.Between(margin, width - margin);
    const y = Phaser.Math.Between(margin, height - margin);
    const { x: playerX, y: playerY } = this.player.center;
    const [spawnX, spawnY] = Phaser.Utils.Array.GetRandom([
      [playerX < width / 2 ? width - margin : margin, y],
      [x, playerY < height / 2 ? height - margin : margin],
    ]);
    const kind = Phaser.Math.Between(0, 1) === 0 ? "goomba" : "koopa";
    this.enemies.push(this.addEnemy(kind, spawnX, spawnY));
    this.startFireAttack();
  }

  private addEnemy(kind: Enemy["kind"], x: number, y: number): Enemy {
    const sprite = this.add.sprite(x, y, kind).setScale(2);
    this.physics.add.existing(sprite);
    if (!(sprite.body instanceof Phaser.Physics.Arcade.Body)) {
      throw new Error(`Could not create an Arcade Physics body for ${kind}`);
    }

    const enemy = {
      kind,
      sprite,
      body: sprite.body.setCollideWorldBounds(true),
      walkTime: 0,
    };
    const overlap = this.physics.add.overlap(
      sprite,
      this.projectiles,
      (_enemy, projectile) => {
        if (
          !enemy.body.enable ||
          !(projectile instanceof Phaser.GameObjects.Sprite)
        )
          return;
        overlap.destroy();
        this.hitEnemy(enemy, projectile);
      },
    );
    return enemy;
  }

  private updateEnemy(enemy: Enemy, delta: number) {
    const { body, sprite } = enemy;
    if (!body.enable) return;

    if (this.isTouchingPlayer(enemy)) {
      body.stop();
      this.stopEnemyAnimation(enemy);
      return;
    }

    const dx = this.player.center.x - body.center.x;
    const dy = this.player.center.y - body.center.y;
    this.enemyDirection.set(dx, dy).normalize().scale(ENEMY_SPEED);
    body.setVelocity(this.enemyDirection.x, this.enemyDirection.y);

    if (enemy.kind === "koopa") {
      if (dx !== 0) sprite.setFlipX(dx > 0);
      sprite.play(KOOPA_WALK_ANIMATION, true);
    } else {
      enemy.walkTime = (enemy.walkTime + delta) % (2 * ENEMY_STEP_INTERVAL);
      sprite.setFlipX(enemy.walkTime >= ENEMY_STEP_INTERVAL);
    }
  }

  private stopEnemyAnimation(enemy: Enemy) {
    if (enemy.kind === "koopa") {
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

  private hitEnemy(enemy: Enemy, projectile: Phaser.GameObjects.Sprite) {
    projectile.destroy();
    enemy.body.enable = false;
    enemy.sprite.destroy();
    this.enemies.splice(this.enemies.indexOf(enemy), 1);
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
