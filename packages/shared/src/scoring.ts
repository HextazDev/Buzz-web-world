/**
 * Moteur Mathématique Pur des 10 Manches & des Buzz! Awards (Master RFC Section 4 & 5)
 * Toutes les fonctions sont pures et déterministes.
 */

export const ScoringMath = {
  /**
   * Manche 1 : Accumulation (Point Builder)
   * Bonne réponse : +250 pts. Mauvaise réponse ou hors délai : 0 pt.
   */
  pointBuilder(isCorrect: boolean): number {
    return isCorrect ? 250 : 0;
  },

  /**
   * Manche 2 : Doigt sur la gâchette (Fastest Finger)
   * La valeur décroît linéairement de 400 à 100 pts (−30 pts/s).
   * Formule : Points = max(100, floor(400 - 30 * t_reponse_sec)). Erreur : 0 pt.
   */
  fastestFinger(isCorrect: boolean, reactionTimeSeconds: number): number {
    if (!isCorrect) return 0;
    const clampedTime = Math.max(0, Math.min(10, reactionTimeSeconds));
    return Math.max(100, Math.floor(400 - 30 * clampedTime));
  },

  /**
   * Manche 3 : Stop ou Encore (Point Stealer)
   * Juste : +300 pts (et -300 pts pour la cible). Faux/hors délai : -150 pts.
   */
  pointStealer(
    isCorrect: boolean,
    currentScore: number,
    targetCurrentScore?: number
  ): { buzzerDelta: number; targetDelta: number } {
    if (!isCorrect) {
      return {
        buzzerDelta: -Math.min(currentScore, 150),
        targetDelta: 0,
      };
    }
    const stolenAmount =
      targetCurrentScore !== undefined ? Math.min(targetCurrentScore, 300) : 300;
    return {
      buzzerDelta: stolenAmount,
      targetDelta: -stolenAmount,
    };
  },

  /**
   * Manche 4 : L'Entartage (Pie Fight)
   * Tir réussi : +100 pts. Dernier survivant : +500 pts (2e : +250 pts).
   */
  pieFightHit(): number {
    return 100;
  },

  pieFightRankBonus(rank: 1 | 2 | number): number {
    if (rank === 1) return 500;
    if (rank === 2) return 250;
    return 0;
  },

  /**
   * Manche 5 : La Bombe (Pass the Bomb)
   * Mèche aléatoire 28 à 42 s.
   * Juste : +100 pts et passe au voisin. Faux : -3 s sur la mèche. Explosion : -400 pts (plancher 0).
   */
  passTheBombInitialFuseMs(): number {
    return Math.floor((28 + Math.random() * 14) * 1000);
  },

  passTheBombExplosionDelta(currentScore: number): number {
    return -Math.min(currentScore, 400);
  },

  /**
   * Manche 6 : La Mise (High Stakes)
   * Mise : 50 | 100 | 250 | 500. Juste : +Mise. Faux : -Mise (plancher à 0).
   */
  highStakes(isCorrect: boolean, bet: 50 | 100 | 250 | 500, currentScore: number): number {
    if (isCorrect) return bet;
    return -Math.min(currentScore, bet);
  },

  /**
   * Manche 7 : En Ébullition (Boiling Point)
   * Juste : +1 cran (+50 pts). Faux : -1 cran (min 0).
   * Atteindre le 6e cran : +750 pts jackpot.
   */
  boilingPointStep(
    isCorrect: boolean,
    currentThermometer: number
  ): { nextThermometer: number; pointsDelta: number; triggeredJackpot: boolean } {
    if (!isCorrect) {
      return {
        nextThermometer: Math.max(0, currentThermometer - 1),
        pointsDelta: 0,
        triggeredJackpot: false,
      };
    }
    const next = currentThermometer + 1;
    const triggeredJackpot = next >= 6;
    return {
      nextThermometer: Math.min(6, next),
      pointsDelta: 50 + (triggeredJackpot ? 750 : 0),
      triggeredJackpot,
    };
  },

  /**
   * Manche 8 : Sur la Sellette (On the Spot)
   * Si J_cible répond juste : +400 pts pour lui et +200 pts aux votants Bleu (0).
   * S'il échoue : 0 pt pour lui et +200 pts aux votants Orange (1).
   */
  onTheSpot(
    targetAnsweredCorrectly: boolean,
    voterChoices: Record<number, 0 | 1>
  ): { targetDelta: number; voterDeltas: Record<number, number> } {
    const winningVote: 0 | 1 = targetAnsweredCorrectly ? 0 : 1;
    const voterDeltas: Record<number, number> = {};
    for (const [slotStr, vote] of Object.entries(voterChoices)) {
      const slot = Number(slotStr);
      voterDeltas[slot] = vote === winningVote ? 200 : 0;
    }
    return {
      targetDelta: targetAnsweredCorrectly ? 400 : 0,
      voterDeltas,
    };
  },

  /**
   * Manche 9 : Finale Compte à Rebours (Final Countdown)
   * Conversion des scores en hauteur de socle de 6.0 s à 14.0 s :
   * T_i = 6.0 + 8.0 * (S_i - S_min) / max(1, S_max - S_min)
   */
  finalCountdownInitialHeights(scoresBySlot: Record<number, number>): Record<number, number> {
    const values = Object.values(scoresBySlot);
    if (values.length === 0) return {};
    const sMin = Math.min(...values);
    const sMax = Math.max(...values);
    const denominator = Math.max(1, sMax - sMin);

    const heights: Record<number, number> = {};
    for (const [slotStr, score] of Object.entries(scoresBySlot)) {
      const t = 6.0 + (8.0 * (score - sMin)) / denominator;
      heights[Number(slotStr)] = Math.round(t * 100) / 100;
    }
    return heights;
  },

  /**
   * Manche 9 : Calcul de la nouvelle hauteur de socle après une question
   * Descente de -1.0 s/s jusqu'au verrouillage.
   * Juste : hauteur conservée (+0.5 s au plus rapide). Faux : chute immédiate de -1.5 s. Plancher à 0.0 s.
   */
  finalCountdownQuestionStep(
    currentHeightSec: number,
    drainSecondsBeforeLock: number,
    isCorrect: boolean,
    isFastestCorrect: boolean
  ): number {
    const afterDrain = Math.max(0, currentHeightSec - Math.max(0, drainSecondsBeforeLock));
    const delta = isCorrect ? (isFastestCorrect ? 0.5 : 0) : -1.5;
    return Math.max(0, Math.round((afterDrain + delta) * 100) / 100);
  },
};
