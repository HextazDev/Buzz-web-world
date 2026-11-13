import { describe, expect, it } from 'vitest';
import { ScoringMath } from '../scoring.js';

describe('ScoringMath — Moteur Mathématique des Manches (MASTER_RFC §4)', () => {
  describe('SCORE-01 : Manche 1 — Accumulation (pointBuilder)', () => {
    it('awards +250 pts on correct answer and 0 pt on wrong answer', () => {
      expect(ScoringMath.pointBuilder(true)).toBe(250);
      expect(ScoringMath.pointBuilder(false)).toBe(0);
    });
  });

  describe('SCORE-02 : Manche 2 — Doigt sur la gâchette (fastestFinger)', () => {
    it('awards 0 pt on wrong answer regardless of reaction time', () => {
      expect(ScoringMath.fastestFinger(false, 0)).toBe(0);
      expect(ScoringMath.fastestFinger(false, 1.5)).toBe(0);
    });

    it('computes max(100, floor(400 - 30 * t)) and clamps t within [0, 10]', () => {
      expect(ScoringMath.fastestFinger(true, -2)).toBe(400);
      expect(ScoringMath.fastestFinger(true, 0)).toBe(400);
      expect(ScoringMath.fastestFinger(true, 1)).toBe(370);
      expect(ScoringMath.fastestFinger(true, 2.5)).toBe(325);
      expect(ScoringMath.fastestFinger(true, 10)).toBe(100);
      expect(ScoringMath.fastestFinger(true, 15)).toBe(100);
    });
  });

  describe('SCORE-03 : Manche 3 — Stop ou Encore (pointStealer)', () => {
    it('deducts up to 150 pts on wrong answer without making score negative', () => {
      expect(ScoringMath.pointStealer(false, 500)).toEqual({
        buzzerDelta: -150,
        targetDelta: 0,
      });
      expect(ScoringMath.pointStealer(false, 80)).toEqual({
        buzzerDelta: -80,
        targetDelta: 0,
      });
      expect(ScoringMath.pointStealer(false, 0)).toEqual({
        buzzerDelta: -0,
        targetDelta: 0,
      });
    });

    it('awards stolen amount (up to 300 pts) from target on correct answer (SCORE-03)', () => {
      expect(ScoringMath.pointStealer(true, 500, 600)).toEqual({
        buzzerDelta: 300,
        targetDelta: -300,
      });
      expect(ScoringMath.pointStealer(true, 500, 120)).toEqual({
        buzzerDelta: 120,
        targetDelta: -120,
      });
      expect(ScoringMath.pointStealer(true, 500)).toEqual({
        buzzerDelta: 300,
        targetDelta: -300,
      });
    });
  });

  describe('Manche 4 — L’Entartage (pieFightHit & pieFightRankBonus)', () => {
    it('awards +100 pts per hit and rank bonuses (+500 for 1st, +250 for 2nd, 0 otherwise)', () => {
      expect(ScoringMath.pieFightHit()).toBe(100);
      expect(ScoringMath.pieFightRankBonus(1)).toBe(500);
      expect(ScoringMath.pieFightRankBonus(2)).toBe(250);
      expect(ScoringMath.pieFightRankBonus(3)).toBe(0);
    });
  });

  describe('SCORE-04 : Manche 5 — La Bombe (passTheBomb)', () => {
    it('generates an initial fuse strictly between 28000 ms and 42000 ms', () => {
      for (let i = 0; i < 50; i++) {
        const fuse = ScoringMath.passTheBombInitialFuseMs();
        expect(fuse).toBeGreaterThanOrEqual(28000);
        expect(fuse).toBeLessThanOrEqual(42000);
      }
    });

    it('caps explosion penalty at -400 pts with a strict floor at 0 pt', () => {
      expect(ScoringMath.passTheBombExplosionDelta(1000)).toBe(-400);
      expect(ScoringMath.passTheBombExplosionDelta(250)).toBe(-250);
      expect(ScoringMath.passTheBombExplosionDelta(0)).toBe(-0);
    });
  });

  describe('SCORE-05 : Manche 6 — La Mise (highStakes)', () => {
    it('adds the bet on correct answer and deducts up to currentScore on wrong answer', () => {
      expect(ScoringMath.highStakes(true, 50, 100)).toBe(50);
      expect(ScoringMath.highStakes(true, 500, 100)).toBe(500);
      expect(ScoringMath.highStakes(false, 250, 600)).toBe(-250);
      expect(ScoringMath.highStakes(false, 500, 200)).toBe(-200);
      expect(ScoringMath.highStakes(false, 100, 0)).toBe(-0);
    });
  });

  describe('SCORE-06 : Manche 7 — En Ébullition (boilingPointStep)', () => {
    it('decrements thermometer on wrong answer without going below 0 and gives 0 pt', () => {
      expect(ScoringMath.boilingPointStep(false, 0)).toEqual({
        nextThermometer: 0,
        pointsDelta: 0,
        triggeredJackpot: false,
      });
      expect(ScoringMath.boilingPointStep(false, 3)).toEqual({
        nextThermometer: 2,
        pointsDelta: 0,
        triggeredJackpot: false,
      });
    });

    it('increments thermometer (+50 pts) and triggers +750 pts jackpot at step 6', () => {
      expect(ScoringMath.boilingPointStep(true, 0)).toEqual({
        nextThermometer: 1,
        pointsDelta: 50,
        triggeredJackpot: false,
      });
      expect(ScoringMath.boilingPointStep(true, 4)).toEqual({
        nextThermometer: 5,
        pointsDelta: 50,
        triggeredJackpot: false,
      });
      expect(ScoringMath.boilingPointStep(true, 5)).toEqual({
        nextThermometer: 6,
        pointsDelta: 800,
        triggeredJackpot: true,
      });
    });
  });

  describe('SCORE-07 : Manche 8 — Sur la Sellette (onTheSpot)', () => {
    it('rewards target (+400) and Blue (0) voters (+200) when target succeeds', () => {
      const res = ScoringMath.onTheSpot(true, { 1: 0, 2: 1, 3: 0 });
      expect(res).toEqual({
        targetDelta: 400,
        voterDeltas: { 1: 200, 2: 0, 3: 200 },
      });
    });

    it('gives 0 to target and rewards Orange (1) voters (+200) when target fails', () => {
      const res = ScoringMath.onTheSpot(false, { 1: 0, 2: 1, 3: 1 });
      expect(res).toEqual({
        targetDelta: 0,
        voterDeltas: { 1: 0, 2: 200, 3: 200 },
      });
    });
  });

  describe('SCORE-08 : Manche 9 — Finale Compte à Rebours (finalCountdownInitialHeights & finalCountdownQuestionStep)', () => {
    it('scales heights proportionally between 6.0 s (min) and 14.0 s (max)', () => {
      const heights = ScoringMath.finalCountdownInitialHeights({
        0: 1000,
        1: 2000,
        2: 3000,
      });
      expect(heights).toEqual({
        0: 6.0,
        1: 10.0,
        2: 14.0,
      });
    });

    it('handles perfect score ties (S_max = S_min) without division by zero', () => {
      const heights = ScoringMath.finalCountdownInitialHeights({
        0: 1500,
        1: 1500,
        2: 1500,
      });
      expect(heights).toEqual({
        0: 6.0,
        1: 6.0,
        2: 6.0,
      });
    });

    it('returns an empty object when given no players', () => {
      expect(ScoringMath.finalCountdownInitialHeights({})).toEqual({});
    });

    it('applies -1.0s/s drain, +0.5s fastest correct bonus, and -1.5s wrong penalty', () => {
      expect(ScoringMath.finalCountdownQuestionStep(10.0, 2.0, true, true)).toBe(8.5);
      expect(ScoringMath.finalCountdownQuestionStep(10.0, 2.0, true, false)).toBe(8.0);
      expect(ScoringMath.finalCountdownQuestionStep(10.0, 2.0, false, false)).toBe(6.5);
      expect(ScoringMath.finalCountdownQuestionStep(1.0, 1.5, false, false)).toBe(0);
    });
  });

  describe('AWARD-01 : Moteur des 9 Buzz! Awards (computeBuzzAwards — MASTER_RFC §5)', () => {
    it('awards all 9 official titles when players meet the exact statistical conditions', () => {
      const awards = ScoringMath.computeBuzzAwards([
        {
          slotIndex: 0,
          displayName: 'TriggerGuy',
          totalAnswered: 10,
          correctAnswers: 4, // 60% error (> 50%)
          avgReactionSec: 1.2, // < 1.8s
          piesReceived: 0,
          pointsStolenFromMeCount: 0,
          targetedCountByVictimSlot: { 2: 5 }, // Bourreau (5 attacks on slot 2)
          bombAndHighStakesLossPts: 100,
          rankBeforeFinal: 1,
          leadBeforeFinalPts: 1200, // > 1000 pts lead before final
          finalRank: 3, // Lost the crown -> CHOKER
          tauntPresses: 45, // > 40 -> BOUTTON_ROUGE_ADDICT
        },
        {
          slotIndex: 1,
          displayName: 'SniperQueen',
          totalAnswered: 10,
          correctAnswers: 9, // 90% accuracy (>= 85%)
          avgReactionSec: 1.5, // Top 2 fastest
          piesReceived: 1,
          pointsStolenFromMeCount: 0,
          targetedCountByVictimSlot: {},
          bombAndHighStakesLossPts: 0,
          rankBeforeFinal: 4, // In bottom 2 of 4 players before final
          leadBeforeFinalPts: 0,
          finalRank: 1, // Finishes 1st -> COMEBACK_KING
          tauntPresses: 5,
        },
        {
          slotIndex: 2,
          displayName: 'TortueSage',
          totalAnswered: 10,
          correctAnswers: 8, // 80% accuracy (>= 70%)
          avgReactionSec: 6.2, // > 5.5s and slowest
          piesReceived: 4,
          pointsStolenFromMeCount: 3, // 7 total hits -> AIMANT_A_TARTES
          targetedCountByVictimSlot: {},
          bombAndHighStakesLossPts: 900, // Highest loss -> KAMIKAZE
          rankBeforeFinal: 3,
          leadBeforeFinalPts: 0,
          finalRank: 2,
          tauntPresses: 2,
        },
        {
          slotIndex: 3,
          displayName: 'NeutralPlayer',
          totalAnswered: 10,
          correctAnswers: 5,
          avgReactionSec: 3.0,
          piesReceived: 0,
          pointsStolenFromMeCount: 0,
          targetedCountByVictimSlot: {},
          bombAndHighStakesLossPts: 0,
          rankBeforeFinal: 2,
          leadBeforeFinalPts: 0,
          finalRank: 4,
          tauntPresses: 0,
        },
      ]);

      const codes = awards.map((a) => a.code);
      expect(codes).toContain('TRIGGER_HAPPY');
      expect(codes).toContain('SNIPER');
      expect(codes).toContain('TORTUE_GENIALE');
      expect(codes).toContain('AIMANT_A_TARTES');
      expect(codes).toContain('BOURREAU');
      expect(codes).toContain('KAMIKAZE');
      expect(codes).toContain('COMEBACK_KING');
      expect(codes).toContain('CHOKER');
      expect(codes).toContain('BOUTTON_ROUGE_ADDICT');

      expect(awards.find((a) => a.code === 'TRIGGER_HAPPY')?.slotIndex).toBe(0);
      expect(awards.find((a) => a.code === 'SNIPER')?.slotIndex).toBe(1);
      expect(awards.find((a) => a.code === 'TORTUE_GENIALE')?.slotIndex).toBe(2);
      expect(awards.find((a) => a.code === 'AIMANT_A_TARTES')?.slotIndex).toBe(2);
      expect(awards.find((a) => a.code === 'BOURREAU')?.slotIndex).toBe(0);
      expect(awards.find((a) => a.code === 'KAMIKAZE')?.slotIndex).toBe(2);
      expect(awards.find((a) => a.code === 'COMEBACK_KING')?.slotIndex).toBe(1);
      expect(awards.find((a) => a.code === 'CHOKER')?.slotIndex).toBe(0);
      expect(awards.find((a) => a.code === 'BOUTTON_ROUGE_ADDICT')?.slotIndex).toBe(0);
    });

    it('[AWARD-01] returns an empty array when no player satisfies the strict award thresholds', () => {
      const awards = ScoringMath.computeBuzzAwards([
        {
          slotIndex: 0,
          displayName: 'QuietPlayer',
          totalAnswered: 4,
          correctAnswers: 2,
          avgReactionSec: 3.2,
          piesReceived: 0,
          pointsStolenFromMeCount: 0,
          targetedCountByVictimSlot: {},
          bombAndHighStakesLossPts: 0,
          rankBeforeFinal: 1,
          leadBeforeFinalPts: 250,
          finalRank: 1,
          tauntPresses: 3,
        },
      ]);
      expect(awards).toEqual([]);
    });
  });
});

