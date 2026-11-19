import { createRoot } from "react-dom/client";
import PhaserGame from "./Game";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Missing #root element");
}

createRoot(container).render(
  <main className="game-page">
    <h1>
      <img
        src="/assets/game-logo.png"
        alt="Super Mario Survivors"
        width={1024}
        height={162}
      />
    </h1>
    <PhaserGame />
  </main>,
);
