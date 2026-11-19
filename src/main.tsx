import { createRoot } from "react-dom/client";
import PhaserGame from "./Game";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Missing #root element");
}

createRoot(container).render(
  <main>
    <h1>Super Mario Survivors</h1>
    <PhaserGame />
  </main>,
);
