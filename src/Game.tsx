import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import GameScene, { type GameScreen } from "./game/scenes/GameScene";

export default function Game() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<GameScene | null>(null);
  const [screen, setScreen] = useState<GameScreen>("loading");
  const [defeated, setDefeated] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0");
  const seconds = String(elapsedSeconds % 60).padStart(2, "0");
  const survivalTime = `${minutes}:${seconds}`;

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;

    const scene = new GameScene(setScreen, setDefeated, setElapsedSeconds);
    sceneRef.current = scene;

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
      scene,
    });

    return () => {
      sceneRef.current = null;
      game.destroy(true);
    };
  }, []);

  return (
    <div className="game-container">
      <div className="game-surface" ref={containerRef} />
      {screen === "playing" && (
        <>
          <p className="game-time">Time: {survivalTime}</p>
          <p className="game-score">Enemies defeated: {defeated}</p>
        </>
      )}
      {screen !== "playing" && (
        <div
          className="game-overlay"
          role="group"
          aria-label={screen === "game-over" ? "Game over" : "Start game"}
        >
          <div className="game-overlay-content">
            {screen === "game-over" && (
              <p className="game-stats">
                <span>Enemies defeated: {defeated}</span>
                <span>Time: {survivalTime}</span>
              </p>
            )}
            <button
              type="button"
              disabled={screen === "loading"}
              onClick={() => sceneRef.current?.startRun()}
            >
              {screen === "game-over" ? "Play Again" : "Start Game"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
