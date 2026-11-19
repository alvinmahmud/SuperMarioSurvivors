import { useEffect, useRef } from "react";
import Phaser from "phaser";

export default function Game() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;

    let movePlayer: (() => void) | undefined;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      width: 640,
      height: 360,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      backgroundColor: "#202838",
      pixelArt: true,
      physics: {
        default: "arcade",
        arcade: {
          gravity: { x: 0, y: 0 },
        },
      },
      scene: {
        create(this: Phaser.Scene) {
          const player = this.add.rectangle(320, 180, 32, 32, 0xff4444);
          this.physics.add.existing(player);

          const body = player.body;
          const keyboard = this.input.keyboard;
          if (!(body instanceof Phaser.Physics.Arcade.Body) || !keyboard)
            return;

          body.setCollideWorldBounds(true);

          const { W, A, S, D } = Phaser.Input.Keyboard.KeyCodes;
          const up = keyboard.addKey(W);
          const left = keyboard.addKey(A);
          const down = keyboard.addKey(S);
          const right = keyboard.addKey(D);
          const arrows = keyboard.createCursorKeys();
          const direction = new Phaser.Math.Vector2();
          const speed = 180;

          movePlayer = () => {
            direction
              .set(
                Number(right.isDown || arrows.right.isDown) -
                  Number(left.isDown || arrows.left.isDown),
                Number(down.isDown || arrows.down.isDown) -
                  Number(up.isDown || arrows.up.isDown),
              )
              .normalize()
              .scale(speed);

            body.setVelocity(direction.x, direction.y);
          };
        },
        update() {
          movePlayer?.();
        },
      },
    });

    return () => {
      game.destroy(true);
    };
  }, []);

  return <div className="game-container" ref={containerRef} />;
}
