/**
 * Constantes strictes de Buzz! Web World (Master RFC v1.1)
 */

export const BUZZER_COLORS = [
  { index: 0 as const, id: 'BLUE', label: 'Bleu', hex: '#0066FF' },
  { index: 1 as const, id: 'ORANGE', label: 'Orange', hex: '#FF6600' },
  { index: 2 as const, id: 'GREEN', label: 'Vert', hex: '#00CC33' },
  { index: 3 as const, id: 'YELLOW', label: 'Jaune', hex: '#FFCC00' },
] as const;

export const AVATAR_PRESETS = [
  'rocker',
  'astronaut',
  'granny',
  'geek',
  'wrestler',
  'detective',
  'pirate',
  'cheerleader',
  'mad_scientist',
  'knight',
  'tourist',
  'dandy',
] as const;

export type AvatarPreset = (typeof AVATAR_PRESETS)[number];

export const BUZZER_SOUNDS = [
  'classic_tv',
  'klaxon',
  'cow',
  'duck',
  'sadistic_laugh',
  'laser',
  'fart_cushion',
  'gong',
  'police_siren',
  'sheep',
  'boing',
  'airhorn',
] as const;

export type BuzzerSound = (typeof BUZZER_SOUNDS)[number];

export const HIGH_STAKES_BETS = [50, 100, 250, 500] as const;

export const GAME_FORMATS = {
  SHORT: { roundsBeforeFinal: 3, estimatedMinutes: 12 },
  NORMAL: { roundsBeforeFinal: 5, estimatedMinutes: 20 },
  LONG: { roundsBeforeFinal: 8, estimatedMinutes: 35 },
  CUSTOM: { minRounds: 2, maxRounds: 12 },
} as const;

export const ROUND_TYPES = [
  'POINT_BUILDER',     // 1. Accumulation
  'FASTEST_FINGER',    // 2. Doigt sur la gâchette
  'POINT_STEALER',     // 3. Stop ou Encore
  'PIE_FIGHT',         // 4. L'Entartage
  'PASS_THE_BOMB',     // 5. La Bombe
  'HIGH_STAKES',       // 6. La Mise
  'BOILING_POINT',     // 7. En Ébullition
  'ON_THE_SPOT',       // 8. Sur la Sellette
  'FINAL_COUNTDOWN',   // 9. Finale : Compte à Rebours
  'FINAL_FLASHPOINT',  // 10. Finale Égalité : Éclair
] as const;

export type RoundType = (typeof ROUND_TYPES)[number];
