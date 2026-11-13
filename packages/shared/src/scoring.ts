/**
 * Moteur Mathématique Pur des 10 Manches & des Buzz! Awards (Master RFC Section 4 & 5)
 * Toutes les fonctions sont pures et déterministes.
 */

export type BuzzAwardCode =
  | 'TRIGGER_HAPPY'
  | 'SNIPER'
  | 'TORTUE_GENIALE'
  | 'AIMANT_A_TARTES'
  | 'BOURREAU'
  | 'KAMIKAZE'
  | 'COMEBACK_KING'
  | 'CHOKER'
  | 'BOUTTON_ROUGE_ADDICT';

export interface PlayerAwardTelemetry {
  slotIndex: number;
  displayName: string;
  totalAnswered: number;
  correctAnswers: number;
  avgReactionSec: number;
  piesReceived: number;
  pointsStolenFromMeCount: number;
  targetedCountByVictimSlot: Record<number, number>;
  bombAndHighStakesLossPts: number;
  rankBeforeFinal: number;
  leadBeforeFinalPts: number;
  finalRank: number;
  tauntPresses: number;
}

export interface AwardedBuzzTitle {
  code: BuzzAwardCode;
  title: string;
  description: string;
  slotIndex: number;
  displayName: string;
  statLabel: string;
}

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

  /**
   * Section 5 : Cérémonie des Titres (« Buzz! Awards »)
   * Attribue de manière pure et déterministe les 9 titres officiels de fin de soirée.
   * Invariant AWARD-01 : Seuls les titres dont les seuils stricts sont atteints sont décernés.
   */
  computeBuzzAwards(telemetry: PlayerAwardTelemetry[]): AwardedBuzzTitle[] {
    if (telemetry.length === 0) return [];
    const awards: AwardedBuzzTitle[] = [];
    const totalPlayers = telemetry.length;

    const byFastest = [...telemetry]
      .filter((p) => p.totalAnswered > 0)
      .sort((a, b) => a.avgReactionSec - b.avgReactionSec);

    // 1. TRIGGER_HAPPY (Gâchette Folle) : Temps moyen le plus bas (< 1.8 s) mais taux d'erreur > 50 %
    const triggerCandidate = byFastest.find((p) => {
      const errorRate = (p.totalAnswered - p.correctAnswers) / Math.max(1, p.totalAnswered);
      return p.avgReactionSec < 1.8 && errorRate > 0.5;
    });
    if (triggerCandidate) {
      awards.push({
        code: 'TRIGGER_HAPPY',
        title: 'Gâchette Folle',
        description: 'Réflexes supersoniques mais cerveau resté au vestiaire !',
        slotIndex: triggerCandidate.slotIndex,
        displayName: triggerCandidate.displayName,
        statLabel: `${triggerCandidate.avgReactionSec.toFixed(2)}s moy.`,
      });
    }

    // 2. SNIPER (Le Sniper) : Précision >= 85 % avec temps de réaction dans le top 2 du salon
    const top2FastestSlots = new Set(byFastest.slice(0, 2).map((p) => p.slotIndex));
    const sniperCandidate = byFastest.find((p) => {
      const accuracy = p.correctAnswers / Math.max(1, p.totalAnswered);
      return top2FastestSlots.has(p.slotIndex) && accuracy >= 0.85;
    });
    if (sniperCandidate) {
      const accPct = Math.round(
        (sniperCandidate.correctAnswers / Math.max(1, sniperCandidate.totalAnswered)) * 100
      );
      awards.push({
        code: 'SNIPER',
        title: 'Le Sniper',
        description: 'Précision chirurgicale et vitesse d’exécution redoutable.',
        slotIndex: sniperCandidate.slotIndex,
        displayName: sniperCandidate.displayName,
        statLabel: `${accPct}% de réussite`,
      });
    }

    // 3. TORTUE_GENIALE (La Tortue Géniale) : Temps moyen le plus lent (> 5.5 s) mais précision >= 70 %
    const bySlowest = [...byFastest].reverse();
    const turtleCandidate = bySlowest.find((p) => {
      const accuracy = p.correctAnswers / Math.max(1, p.totalAnswered);
      return p.avgReactionSec > 5.5 && accuracy >= 0.7;
    });
    if (turtleCandidate) {
      awards.push({
        code: 'TORTUE_GENIALE',
        title: 'La Tortue Géniale',
        description: 'Prend tout son temps, mais tape presque toujours dans le mille.',
        slotIndex: turtleCandidate.slotIndex,
        displayName: turtleCandidate.displayName,
        statLabel: `${turtleCandidate.avgReactionSec.toFixed(1)}s de réflexion`,
      });
    }

    // 4. AIMANT_A_TARTES (Aimant à Tartes) : Plus grand cumul d'entartages et vols subis (>= 2)
    const pieMagnet = [...telemetry]
      .map((p) => ({ p, hits: p.piesReceived + p.pointsStolenFromMeCount }))
      .filter((x) => x.hits >= 2)
      .sort((a, b) => b.hits - a.hits)[0];
    if (pieMagnet) {
      awards.push({
        code: 'AIMANT_A_TARTES',
        title: 'Aimant à Tartes',
        description: 'La cible préférée de tout le salon ce soir !',
        slotIndex: pieMagnet.p.slotIndex,
        displayName: pieMagnet.p.displayName,
        statLabel: `${pieMagnet.hits} attaques subies`,
      });
    }

    // 5. BOURREAU (L'Ennemi Public n°1) : A ciblé le plus grand nombre de fois un même adversaire (>= 2)
    let bestExecutioner: { p: PlayerAwardTelemetry; maxSingleVictimHits: number } | null = null;
    for (const p of telemetry) {
      for (const count of Object.values(p.targetedCountByVictimSlot)) {
        if (
          count >= 2 &&
          (!bestExecutioner || count > bestExecutioner.maxSingleVictimHits)
        ) {
          bestExecutioner = { p, maxSingleVictimHits: count };
        }
      }
    }
    if (bestExecutioner) {
      awards.push({
        code: 'BOURREAU',
        title: 'L’Ennemi Public n°1',
        description: 'Acharnement thérapeutique caractérisé sur un même adversaire.',
        slotIndex: bestExecutioner.p.slotIndex,
        displayName: bestExecutioner.p.displayName,
        statLabel: `${bestExecutioner.maxSingleVictimHits} attaques ciblées`,
      });
    }

    // 6. KAMIKAZE (Le Kamikaze) : Plus grosse perte de points cumulée dans La Bombe et La Mise (>= 250 pts)
    const kamikaze = [...telemetry]
      .filter((p) => p.bombAndHighStakesLossPts >= 250)
      .sort((a, b) => b.bombAndHighStakesLossPts - a.bombAndHighStakesLossPts)[0];
    if (kamikaze) {
      awards.push({
        code: 'KAMIKAZE',
        title: 'Le Kamikaze',
        description: 'A tout misé, a tout fait exploser !',
        slotIndex: kamikaze.slotIndex,
        displayName: kamikaze.displayName,
        statLabel: `-${kamikaze.bombAndHighStakesLossPts} pts flambés`,
      });
    }

    // 7. COMEBACK_KING (Le Miraculé) : Classé dans les 2 derniers avant la Finale (sur >= 3 joueurs), termine 1er ou 2e
    if (totalPlayers >= 3) {
      const comeback = telemetry.find(
        (p) => p.rankBeforeFinal >= totalPlayers - 1 && (p.finalRank === 1 || p.finalRank === 2)
      );
      if (comeback) {
        awards.push({
          code: 'COMEBACK_KING',
          title: 'Le Miraculé',
          description: 'Revenu des abysses du classement pour braquer le podium final !',
          slotIndex: comeback.slotIndex,
          displayName: comeback.displayName,
          statLabel: `De ${comeback.rankBeforeFinal}e à ${comeback.finalRank}er`,
        });
      }
    }

    // 8. CHOKER (Mental en Chips) : Leader avec > 1000 pts d'avance avant la Finale, mais perd la couronne
    const choker = telemetry.find(
      (p) => p.rankBeforeFinal === 1 && p.leadBeforeFinalPts > 1000 && p.finalRank > 1
    );
    if (choker) {
      awards.push({
        code: 'CHOKER',
        title: 'Mental en Chips',
        description: 'Avait un boulevard d’avance avant la Finale et s’est effondré !',
        slotIndex: choker.slotIndex,
        displayName: choker.displayName,
        statLabel: `+${choker.leadBeforeFinalPts} pts dilapidés`,
      });
    }

    // 9. BOUTTON_ROUGE_ADDICT (Spammer Compulsif) : Plus de 40 pressions de Taunt hors-question
    const spammer = [...telemetry]
      .filter((p) => p.tauntPresses > 40)
      .sort((a, b) => b.tauntPresses - a.tauntPresses)[0];
    if (spammer) {
      awards.push({
        code: 'BOUTTON_ROUGE_ADDICT',
        title: 'Spammer Compulsif',
        description: 'Son pouce est officiellement fusionné avec le Buzzer Rouge.',
        slotIndex: spammer.slotIndex,
        displayName: spammer.displayName,
        statLabel: `${spammer.tauntPresses} buzz hors-jeu`,
      });
    }

    return awards;
  },
};

