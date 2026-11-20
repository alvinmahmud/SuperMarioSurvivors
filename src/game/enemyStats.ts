const SLOW_SPEED = 45;
const FAST_SPEED = 65;

const STANDARD_KNOCKBACK = { speed: 95, duration: 90 };

export type EnemyStats = {
  maxHp: number;
  speed: number;
  knockback: { speed: number; duration: number } | null;
  movement: "chase" | "straight";
  animation?: {
    frameWidth: number;
    frameHeight: number;
    frameDuration: number;
  };
};

const KOOPA_ANIMATION = { frameWidth: 16, frameHeight: 24, frameDuration: 150 };
const CHASER = { movement: "chase", knockback: STANDARD_KNOCKBACK } as const;

export const ENEMY_STATS = {
  goomba: { ...CHASER, maxHp: 2, speed: SLOW_SPEED },
  koopa: { ...CHASER, maxHp: 2, speed: SLOW_SPEED, animation: KOOPA_ANIMATION },
  "red-koopa": {
    ...CHASER,
    maxHp: 2,
    speed: FAST_SPEED,
    animation: KOOPA_ANIMATION,
  },
  paratroopa: {
    ...CHASER,
    maxHp: 3,
    speed: FAST_SPEED,
    animation: KOOPA_ANIMATION,
  },
  "red-paratroopa": {
    ...CHASER,
    maxHp: 3,
    speed: FAST_SPEED,
    animation: { ...KOOPA_ANIMATION, frameDuration: 200 },
  },
  "bullet-bill": {
    maxHp: 2,
    speed: 130,
    knockback: null,
    movement: "straight",
  },
} satisfies Record<string, EnemyStats>;

export type EnemyKind = keyof typeof ENEMY_STATS;

export const ENEMY_KINDS = Object.keys(ENEMY_STATS) as EnemyKind[];
