export const ENTITY_SCALE = 1.75;

const INITIAL_ENEMY_CAP = 4;
const MAX_ENEMY_CAP = 10;
const ENEMY_CAP_STEP_SECONDS = 30;

export function enemyCapAt(elapsedSeconds: number) {
  return Math.min(
    MAX_ENEMY_CAP,
    INITIAL_ENEMY_CAP + Math.floor(elapsedSeconds / ENEMY_CAP_STEP_SECONDS),
  );
}
