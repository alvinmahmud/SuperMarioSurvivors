import { useEffect, useRef } from "react";
import Phaser from "phaser";
import GameScene from "./game/scenes/GameScene";

export default function Game() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;

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
      scene: GameScene,
    });

    return () => {
      game.destroy(true);
    };
  }, []);

  return <div className="game-container" ref={containerRef} />;
}
