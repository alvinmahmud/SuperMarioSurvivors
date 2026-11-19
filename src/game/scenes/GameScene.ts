import Phaser from "phaser";

const PLAYER_SPEED = 180;
const ENEMY_SPEED = 90;
const SQUARE_SIZE = 32;
const PROJECTILE_SIZE = 8;
const PROJECTILE_SPEED = 360;
const ATTACK_INTERVAL = 1000;
const RESPAWN_DELAY = 1000;

export default class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Body;
  private enemy!: {
    shape: Phaser.GameObjects.Rectangle;
    body: Phaser.Physics.Arcade.Body;
  };
  private projectiles!: Phaser.Physics.Arcade.Group;
  private movePlayer?: () => void;
  private enemyDirection = new Phaser.Math.Vector2();

  create() {
    this.player = this.addSquare(
      this.scale.width / 2,
      this.scale.height / 2,
      SQUARE_SIZE,
      0xff4444,
    ).body.setCollideWorldBounds(true);
    this.enemy = this.addSquare(64, 64, SQUARE_SIZE, 0x4488ff);
    this.enemy.body.setCollideWorldBounds(true);
    this.projectiles = this.physics.add.group();

    this.physics.add.overlap(
      this.enemy.shape,
      this.projectiles,
      (_enemy, projectile) => {
        if (!(projectile instanceof Phaser.GameObjects.Rectangle)) return;
        this.hitEnemy(projectile);
      },
    );
    this.time.addEvent({
      delay: ATTACK_INTERVAL,
      loop: true,
      callback: () => this.fireProjectile(),
    });

    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    const { W, A, S, D } = Phaser.Input.Keyboard.KeyCodes;
    const up = keyboard.addKey(W);
    const left = keyboard.addKey(A);
    const down = keyboard.addKey(S);
    const right = keyboard.addKey(D);
    const arrows = keyboard.createCursorKeys();
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
    };
  }

  update() {
    this.movePlayer?.();

    this.clearOffscreenProjectiles();

    const enemyBody = this.enemy.body;
    if (!enemyBody.enable) return;

    const dx = this.player.center.x - enemyBody.center.x;
    const dy = this.player.center.y - enemyBody.center.y;

    if (Math.abs(dx) <= SQUARE_SIZE && Math.abs(dy) <= SQUARE_SIZE) {
      enemyBody.setVelocity(0, 0);
      return;
    }

    this.enemyDirection.set(dx, dy).normalize().scale(ENEMY_SPEED);
    enemyBody.setVelocity(this.enemyDirection.x, this.enemyDirection.y);
  }

  private fireProjectile() {
    if (!this.enemy.body.enable) return;

    const { x, y } = this.player.center;
    const { shape } = this.addSquare(x, y, PROJECTILE_SIZE, 0xffdd55);
    this.projectiles.add(shape);

    const target = this.enemy.body.center;
    this.physics.moveTo(shape, target.x, target.y, PROJECTILE_SPEED);
  }

  private hitEnemy(projectile: Phaser.GameObjects.Rectangle) {
    if (!this.enemy.body.enable) return;

    projectile.destroy();
    this.enemy.body.stop();
    this.enemy.body.enable = false;
    this.enemy.shape.setVisible(false);
    this.time.delayedCall(RESPAWN_DELAY, () => this.respawnEnemy());
  }

  private respawnEnemy() {
    const { width, height } = this.scale;
    const { x, y } = this.player.center;
    const spawnX = x < width / 2 ? width - SQUARE_SIZE : SQUARE_SIZE;
    const spawnY = y < height / 2 ? height - SQUARE_SIZE : SQUARE_SIZE;

    this.enemy.body.reset(spawnX, spawnY);
    this.enemy.body.enable = true;
    this.enemy.shape.setVisible(true);
  }

  private clearOffscreenProjectiles() {
    const { width, height } = this.scale;
    const margin = PROJECTILE_SIZE / 2;
    const projectiles = this.projectiles.getChildren();

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const projectile = projectiles[i];
      if (!(projectile instanceof Phaser.GameObjects.Rectangle)) continue;

      const { x, y } = projectile;
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

  private addSquare(x: number, y: number, size: number, color: number) {
    const square = this.add.rectangle(x, y, size, size, color);
    this.physics.add.existing(square);

    if (!(square.body instanceof Phaser.Physics.Arcade.Body)) {
      throw new Error("Could not create an Arcade Physics body for the square");
    }

    return { shape: square, body: square.body };
  }
}
