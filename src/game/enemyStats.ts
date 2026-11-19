const SLOW_SPEED = 45;
const FAST_SPEED = 65;

export const ENEMY_STATS = {
  goomba: { maxHp: 2, speed: SLOW_SPEED },
  koopa: { maxHp: 2, speed: SLOW_SPEED },
  "red-koopa": { maxHp: 2, speed: FAST_SPEED },
  paratroopa: { maxHp: 3, speed: FAST_SPEED },
  "red-paratroopa": { maxHp: 3, speed: FAST_SPEED },
} as const;

export type EnemyKind = keyof typeof ENEMY_STATS;

export const ENEMY_KINDS = Object.keys(ENEMY_STATS) as EnemyKind[];
