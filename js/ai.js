/**
 * ai.js — Intelligence artificielle des bots Belote
 *
 * Stratégies :
 *   decideBid()  → Décider de prendre ou passer aux enchères
 *   playCard()   → Choisir quelle carte jouer
 *
 * Niveau : intermédiaire-avancé
 *   - Évalue la force de la main avant de prendre
 *   - Joue stratégiquement (couper, tierce maître, défausse)
 *   - Connaît les cartes jouées (mémoire du pli en cours)
 */

'use strict';

const ai = {

  /* ═══════════════════════════════════════════════════════════
     ENCHÈRES
  ═══════════════════════════════════════════════════════════ */

  /**
   * L'IA décide de prendre ou passer
   * @param {BeloteGame} g
   * @param {string} player
   */
  decideBid(g, player) {
    const s = g.state;
    const hand = s.hands[player];
    const proposedSuit = s.turnedCard.suit;

    if (s.bidPhase === 1) {
      const score = this._evaluateHand(hand, proposedSuit);
      const shouldTake = score >= 55; // seuil empirique

      if (shouldTake) {
        g._processTake(player, proposedSuit);
      } else {
        g._processBidPass(player);
      }
    } else {
      /* Tour 2 : cherche la meilleure couleur alternative */
      const bestSuit = this._findBestAlternativeSuit(hand, proposedSuit);
      if (bestSuit) {
        g._processTake(player, bestSuit);
      } else {
        g._processPass2(player);
      }
    }
  },

  /**
   * Évalue la force d'une main pour un atout donné
   * Score indicatif : ≥ 55 → prendre, < 55 → passer
   */
  _evaluateHand(hand, trump) {
    let score = 0;

    for (const card of hand) {
      if (card.suit === trump) {
        /* Atout : Valet=20, 9=14, As=11, 10=10… */
        score += POINTS_TRUMP[card.rank];
        /* Bonus pour chaque atout supplémentaire */
        score += 4;
        /* Bonus Valet d'atout (maître absolu) */
        if (card.rank === 'V') score += 12;
        /* Bonus 9 d'atout */
        if (card.rank === '9') score += 6;
      } else {
        score += POINTS_PLAIN[card.rank] * 0.5;
        /* Bonus As sec ou double As */
        if (card.rank === 'A') score += 4;
      }
    }

    /* Bonus si on est le premier à parler (avantage positionnel) */
    return score;
  },

  /**
   * Cherche la meilleure couleur alternative au tour 2
   */
  _findBestAlternativeSuit(hand, excludeSuit) {
    let best = null;
    let bestScore = 30; // seuil minimum pour prendre en tour 2

    for (const suit of SUITS) {
      if (suit === excludeSuit) continue;
      const score = this._evaluateHand(hand, suit);
      if (score > bestScore) {
        bestScore = score;
        best = suit;
      }
    }

    return best;
  },

  /* ═══════════════════════════════════════════════════════════
     JEUX DE CARTES
  ═══════════════════════════════════════════════════════════ */

  /**
   * Choisit et joue la meilleure carte pour l'IA
   */
  playCard(g, player) {
    const legalCards = g.getLegalCards(player);
    const card = this._chooseCard(g, player, legalCards);
    g._playCard(player, card);
  },

  /**
   * Stratégie de sélection de carte
   */
  _chooseCard(g, player, legal) {
    const s = g.state;
    const trump    = s.trump;
    const trick    = s.currentTrick;
    const isFirst  = trick.length === 0;
    const partner  = g._partner(player);
    const isPartnerWinning = !isFirst && g._getTrickWinner().player === partner;

    /* ── Premier de pli ────────────────────────────────────── */
    if (isFirst) {
      return this._leadStrategy(g, player, legal, trump);
    }

    /* ── Partenaire en tête → défausser le moins utile ─────── */
    if (isPartnerWinning) {
      return this._discard(legal, trump);
    }

    /* ── Adversaire en tête → essayer de surmonter ──────────── */
    return this._beatStrategy(g, player, legal, trump, trick);
  },

  /**
   * Stratégie d'entame (premier de pli)
   */
  _leadStrategy(g, player, legal, trump) {
    const s = g.state;
    const isTakerTeam = g._teamOf(player) === s.takerTeam;

    if (isTakerTeam) {
      const trumps = legal.filter(c => c.suit === trump);
      if (trumps.length > 0) {
        /* Compter les atouts déjà joués dans les plis terminés */
        const trumpsPlayed = s.tricks.reduce(
          (n, t) => n + t.cards.filter(tc => tc.card.suit === trump).length, 0
        );
        /* Atouts encore chez les adversaires (et partenaire inconnu) */
        const trumpsLeft = 8 - trumpsPlayed - trumps.length;

        /* Tant qu'il reste potentiellement des atouts adverses, tirer l'atout */
        if (trumpsLeft > 0) {
          const sorted = this._sortByTrumpStrength(trumps);
          return sorted[0]; // le plus fort pour forcer les atouts ennemis
        }
        /* Atouts adverses épuisés → passer aux couleurs fortes */
      }
    }

    /* Chercher une carte maître (As hors atout) */
    const master = this._findMasterCard(legal, trump);
    if (master) return master;

    /* Sinon défausser la carte la moins précieuse */
    return this._discard(legal, trump);
  },

  /**
   * Stratégie pour battre le pli adverse
   */
  _beatStrategy(g, player, legal, trump, trick) {
    const winner = g._getTrickWinner();
    const winCard = winner.card;
    const leadSuit = trick[0].card.suit;

    const trumps   = legal.filter(c => c.suit === trump);
    const sameSuit = legal.filter(c => c.suit === leadSuit);

    /* ── Couper (la couleur demandée n'est pas atout, adversaire gagne) ── */
    if (trumps.length > 0 && winCard.suit !== trump) {
      /* Jouer le plus FAIBLE atout : suffit pour gagner, préserve les maîtres */
      const sorted = this._sortByTrumpStrength(trumps); // fort → faible
      return sorted[sorted.length - 1];
    }

    /* ── Fournir et monter (même couleur que l'entame) ── */
    if (sameSuit.length > 0 && winCard.suit !== trump) {
      const stronger = sameSuit.filter(c =>
        ORDER_PLAIN.indexOf(c.rank) < ORDER_PLAIN.indexOf(winCard.rank)
      );
      if (stronger.length > 0) {
        /* Le plus faible des gagnants : économise les grosses cartes */
        return stronger.sort((a, b) =>
          ORDER_PLAIN.indexOf(a.rank) - ORDER_PLAIN.indexOf(b.rank)
        ).pop();
      }
    }

    /* ── Surcouper à l'atout (adversaire a déjà coupé) ── */
    if (winCard.suit === trump && trumps.length > 0) {
      const sorted = this._sortByTrumpStrength(trumps); // fort → faible
      /* Garder uniquement ceux qui battent la coupe adverse */
      const higher = sorted.filter(
        c => ORDER_TRUMP.indexOf(c.rank) < ORDER_TRUMP.indexOf(winCard.rank)
      );
      if (higher.length > 0) {
        /* Le plus FAIBLE parmi ceux qui gagnent */
        return higher[higher.length - 1];
      }
    }

    /* Ne peut pas gagner : défausser */
    return this._discard(legal, trump);
  },

  /**
   * Défausse : jeter la carte la moins utile
   * — Préserve les atouts en priorité
   * — Parmi les non-atouts, jette la moins précieuse (valeur de points réelle)
   */
  _discard(legal, trump) {
    const nonTrumps = legal.filter(c => c.suit !== trump);
    const pool = nonTrumps.length > 0 ? nonTrumps : legal;

    return pool.reduce((weakest, c) => {
      /* Utiliser la table de points correcte selon si c'est un atout ou non */
      const pts  = (suit) => suit === trump ? POINTS_TRUMP  : POINTS_PLAIN;
      const wPts = pts(weakest.suit)[weakest.rank];
      const cPts = pts(c.suit)[c.rank];
      return cPts < wPts ? c : weakest;
    });
  },

  /**
   * Cherche une carte "maître" (As ou tierce haute)
   */
  _findMasterCard(legal, trump) {
    /* As d'une couleur non-atout */
    const aces = legal.filter(c => c.rank === 'A' && c.suit !== trump);
    if (aces.length > 0) return aces[0];
    return null;
  },

  _sortByTrumpStrength(trumpCards) {
    return [...trumpCards].sort((a, b) =>
      ORDER_TRUMP.indexOf(a.rank) - ORDER_TRUMP.indexOf(b.rank)
    );
  }

};

window.ai = ai;
