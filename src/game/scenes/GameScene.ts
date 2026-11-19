import Phaser from "phaser";

const PLAYER_SPEED = 180;
const ENEMY_SPEED = 90;
const SQUARE_SIZE = 32;

export default class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Body;
  private enemy!: Phaser.Physics.Arcade.Body;
  private movePlayer?: () => void;
  private enemyDirection = new Phaser.Math.Vector2();

  create() {
    this.player = this.addSquare(
      this.scale.width / 2,
      this.scale.height / 2,
      0xff4444,
    );
    this.enemy = this.addSquare(64, 64, 0x4488ff);

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

    const dx = this.player.center.x - this.enemy.center.x;
    const dy = this.player.center.y - this.enemy.center.y;

    if (Math.abs(dx) <= SQUARE_SIZE && Math.abs(dy) <= SQUARE_SIZE) {
      this.enemy.setVelocity(0, 0);
      return;
    }

    this.enemyDirection.set(dx, dy).normalize().scale(ENEMY_SPEED);
    this.enemy.setVelocity(this.enemyDirection.x, this.enemyDirection.y);
  }

  private addSquare(x: number, y: number, color: number) {
    const square = this.add.rectangle(x, y, SQUARE_SIZE, SQUARE_SIZE, color);
    this.physics.add.existing(square);

    if (!(square.body instanceof Phaser.Physics.Arcade.Body)) {
      throw new Error("Could not create an Arcade Physics body for the square");
    }

    return square.body.setCollideWorldBounds(true);
  }
}
