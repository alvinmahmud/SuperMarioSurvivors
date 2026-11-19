import { useEffect, useRef } from "react";
import Phaser from "phaser";

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
      backgroundColor: "#202838",
      pixelArt: true,
      scene: {
        create(this: Phaser.Scene) {
          this.add.rectangle(320, 180, 32, 32, 0xff4444);
        },
      },
    });

    return () => {
      game.destroy(true);
    };
  }, []);

  return <div ref={containerRef} />;
}
