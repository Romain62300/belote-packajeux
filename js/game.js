/**
 * game.js — Moteur complet de la Belote
 *
 * Architecture :
 *   BeloteGame  → état de la partie, règles, scoring
 *   On crée une instance unique `game` utilisée par ui.js et ai.js
 *
 * Positions : 'south'=vous, 'north'=partenaire, 'west'/'east'=adversaires
 * Équipes    : NS (vous+nord), EW (est+ouest)
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════
   CONSTANTES
═══════════════════════════════════════════════════════════════ */

/** 32 cartes = 4 couleurs × 8 rangs */
const SUITS  = ['♠', '♥', '♦', '♣'];
const RANKS  = ['7', '8', '9', '10', 'V', 'D', 'R', 'A'];  // V=Valet D=Dame R=Roi A=As
const COLORS = { '♠': 'black', '♣': 'black', '♥': 'red', '♦': 'red' };

/**
 * Points hors atout : As=11, 10=10, R=4, D=3, V=2, 9/8/7=0
 * Points à l'atout  : V=20, 9=14, As=11, 10=10, R=4, D=3, 8/7=0
 */
const POINTS_PLAIN = { 'A': 11, '10': 10, 'R': 4, 'D': 3, 'V': 2, '9': 0, '8': 0, '7': 0 };
const POINTS_TRUMP = { 'V': 20, '9': 14, 'A': 11, '10': 10, 'R': 4, 'D': 3, '8': 0, '7': 0 };

/**
 * Ordre des cartes à l'atout (du plus fort au plus faible)
 * V > 9 > A > 10 > R > D > 8 > 7
 */
const ORDER_TRUMP  = ['V', '9', 'A', '10', 'R', 'D', '8', '7'];
const ORDER_PLAIN  = ['A', '10', 'R', 'D', 'V', '9', '8', '7'];

/** Points totaux de toutes les cartes = 152 (+ 10 pour le dernier pli = 162) */
const TOTAL_CARD_POINTS = 162;

/** Score cible pour gagner la partie */
const DEFAULT_WINNING_SCORE = 1001;

/** Ordre de jeu (sens des aiguilles d'une montre vue du dessus) */
const PLAY_ORDER = ['south', 'west', 'north', 'east'];

/* ═══════════════════════════════════════════════════════════════
   CLASSE BeloteGame
═══════════════════════════════════════════════════════════════ */
class BeloteGame {

  constructor() {
    this.config = {
      winningScore: DEFAULT_WINNING_SCORE,
      announcementsEnabled: true,
      beloteEnabled: true,
      variant: 'classic'
    };
    /* Scores cumulés de la partie */
    this.totalScore = { NS: 0, EW: 0 };
    /* Numéro de la manche en cours */
    this.roundNumber = 0;
    /* État courant (voir _resetRound) */
    this.state = null;
    /* Callbacks enregistrés par ui.js */
    this._listeners = {};
  }

  /* ─── API publique ─────────────────────────────────────────── */

  /** Démarre une toute nouvelle partie */
  startGame(config = {}) {
    this.config = { ...this.config, ...config };
    this.totalScore = { NS: 0, EW: 0 };
    this.roundNumber = 0;
    this._startRound();
  }

  /** Lance la manche suivante */
  nextRound() {
    this._startRound();
  }

  /**
   * Le joueur humain (south) prend l'atout en tour 1
   * @param {string} suit — couleur proposée (déjà connue)
   */
  humanTake(suit) {
    if (this.state.bidPhase !== 1 || this.state.currentBidder !== 'south') return;
    this._processTake('south', suit);
  }

  /**
   * Le joueur humain passe en tour 1 ou 2
   */
  humanPass() {
    const s = this.state;
    if (s.currentBidder !== 'south') return;
    if (s.bidPhase === 1) this._processBidPass('south');
    else if (s.bidPhase === 2) this._processPass2('south');
  }

  /**
   * Le joueur humain choisit une couleur en tour 2
   * @param {string} suit
   */
  humanChooseSuit(suit) {
    if (this.state.bidPhase !== 2 || this.state.currentBidder !== 'south') return;
    if (suit === this.state.turnedCard.suit) {
      this.emit('toast', { msg: 'Vous ne pouvez pas choisir la couleur retournée au tour 2 !', type: 'error' });
      return;
    }
    this._processTake('south', suit);
  }

  /**
   * Le joueur humain joue une carte
   * @param {object} card — { suit, rank }
   */
  humanPlayCard(card) {
    const s = this.state;
    if (s.phase !== 'play' || s.currentPlayer !== 'south') return;
    const legal = this.getLegalCards('south');
    if (!legal.some(c => c.suit === card.suit && c.rank === card.rank)) {
      this.emit('toast', { msg: 'Cette carte n\'est pas jouable !', type: 'error' });
      return;
    }
    this._playCard('south', card);
  }

  /**
   * Retourne la liste des cartes jouables pour un joueur
   * @param {string} player
   * @returns {object[]}
   */
  getLegalCards(player) {
    const s = this.state;
    const hand = s.hands[player];
    if (s.currentTrick.length === 0) return hand.slice(); // Premier de pli : tout jouer

    const leadCard = s.currentTrick[0].card;
    const leadSuit = leadCard.suit;
    const trump    = s.trump;

    /* Cartes de la couleur demandée */
    const sameSuit = hand.filter(c => c.suit === leadSuit);

    if (leadSuit === trump) {
      /* Couleur demandée = atout */
      if (sameSuit.length > 0) {
        /* Doit couper supérieur si possible */
        const winningTrump = this._getTrickWinner().card;
        const higher = sameSuit.filter(c => this._trumpStrength(c) > this._trumpStrength(winningTrump));
        return higher.length > 0 ? higher : sameSuit;
      }
      return hand.slice(); // Aucun atout, joue ce qu'il veut
    }

    /* Couleur demandée ≠ atout */
    if (sameSuit.length > 0) return sameSuit; // Doit fournir

    /* N'a pas la couleur demandée */
    const trumps = hand.filter(c => c.suit === trump);
    if (trumps.length === 0) return hand.slice(); // Pas d'atout non plus

    /* A des atouts — doit-il couper ? */
    /* Exception : le partenaire est en tête du pli */
    const partnerSeat = this._partner(player);
    const trickWinner = this._getTrickWinner();
    if (trickWinner.player === partnerSeat) {
      /* Partenaire maître du pli : on peut jeter (pas obligé de couper) */
      return hand.slice();
    }

    /* Doit couper avec un atout supérieur si possible */
    const winningTrump = trickWinner.card.suit === trump ? trickWinner.card : null;
    if (winningTrump) {
      const higherTrumps = trumps.filter(c => this._trumpStrength(c) > this._trumpStrength(winningTrump));
      return higherTrumps.length > 0 ? higherTrumps : trumps;
    }
    return trumps; // Couper avec n'importe quel atout (adversaire non-atout en tête)
  }

  /** Abonne un callback à un événement */
  on(event, cb) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(cb);
  }

  /** Émet un événement vers ui.js */
  emit(event, data) {
    (this._listeners[event] || []).forEach(cb => cb(data));
  }

  /* ─── Internals : initialisation de manche ─────────────────── */

  _startRound() {
    this.roundNumber++;
    this._resetRound();

    /* Important : on remet l'interface à zéro AVANT d'afficher les cartes.
       Sinon l'événement roundStart efface les mains juste après la distribution. */
    this.emit('roundStart', { round: this.roundNumber });

    this._dealCards();
    this._startBidding();
  }

  _resetRound() {
    this.state = {
      phase:         'bid',     // 'bid' | 'announce' | 'play' | 'score'
      hands:         { south: [], north: [], east: [], west: [] },
      tricks:        [],        // plis joués [{ cards: [...], winner }]
      currentTrick:  [],        // [{ player, card }, ...]
      wonTricks:     { NS: 0, EW: 0 },
      trickPoints:   { NS: 0, EW: 0 },

      /* Enchères */
      bidPhase:      1,         // 1 ou 2
      firstBidder:   this._nextDealer(),
      currentBidder: null,
      turnedCard:    null,      // carte retournée
      trump:         null,      // couleur atout choisie
      taker:         null,      // joueur qui a pris
      takerTeam:     null,      // 'NS' ou 'EW'
      bidHistory:    [],

      /* Annonces */
      announcements: { NS: [], EW: [] },
      announcePts:   { NS: 0, EW: 0 },
      hasBelote:     { NS: false, EW: false },
      beloteAnnounced: null,    // joueur qui annonce belote
      _beloteCard:     null,    // 'R' ou 'D' selon la première carte Belote jouée

      /* Jeu */
      currentPlayer: null,
      leadPlayer:    null,      // premier de ce pli
    };
  }

  _nextDealer() {
    /* On tourne le premier enchérisseur à chaque manche */
    const idx = (this.roundNumber - 1) % 4;
    return PLAY_ORDER[idx];
  }

  /* ─── Distribution ──────────────────────────────────────────── */

  _dealCards() {
    const deck = this._createDeck();
    this._shuffle(deck);

    /* Distribution initiale : 3+2 = 5 cartes par joueur (20 cartes)
       La 21e carte est retournée comme proposition d'atout.
       Les 11 cartes restantes + la carte retournée complètent à 8 après enchère. */
    const groups = [3, 2];
    let idx = 0;
    const startPos = PLAY_ORDER.indexOf(this.state.firstBidder);

    for (const count of groups) {
      for (let p = 0; p < 4; p++) {
        const player = PLAY_ORDER[(startPos + p) % 4];
        for (let i = 0; i < count; i++) {
          this.state.hands[player].push(deck[idx++]);
        }
      }
    }

    /* La 21e carte est retournée comme proposition d'atout */
    this.state.turnedCard = deck[idx];

    /* Trier les mains */
    for (const player of PLAY_ORDER) {
      this._sortHand(player);
    }

    this.emit('cardsDealt', {
      hands: this.state.hands,
      turnedCard: this.state.turnedCard
    });
  }

  _createDeck() {
    const deck = [];
    for (const suit of SUITS)
      for (const rank of RANKS)
        deck.push({ suit, rank });
    return deck;
  }

  _shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }

  _sortHand(player) {
    /* Trie : couleur, puis force décroissante */
    this.state.hands[player].sort((a, b) => {
      if (a.suit !== b.suit) return SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
      return ORDER_PLAIN.indexOf(a.rank) - ORDER_PLAIN.indexOf(b.rank);
    });
  }

  /* ─── Phase d'enchères ──────────────────────────────────────── */

  _startBidding() {
    this.state.currentBidder = this.state.firstBidder;
    this.state.bidPhase = 1;
    this._nextBid();
  }

  _nextBid() {
    const s = this.state;
    this.emit('bidTurn', {
      bidder:      s.currentBidder,
      bidPhase:    s.bidPhase,
      turnedCard:  s.turnedCard,
      bidHistory:  s.bidHistory
    });

    if (s.currentBidder !== 'south') {
      /* Bot enchérit après un délai naturel */
      setTimeout(() => ai.decideBid(this, s.currentBidder), 900);
    }
  }

  /** Appelé par l'IA ou le joueur pour prendre */
  _processTake(player, suit) {
    const s = this.state;
    s.trump  = suit;
    s.taker  = player;
    s.takerTeam = this._teamOf(player);

    s.bidHistory.push(`${this._playerLabel(player)} prend en ${suit}`);

    /* Distribuer les cartes restantes */
    this._completeDistribution(player, suit);

    /* Détecter la Belote (Roi + Dame d'atout) dans chaque main */
    if (this.config.beloteEnabled) this._detectBelote();

    s.phase = 'announce';
    this.emit('bidEnd', {
      taker: player,
      trump: suit,
      bidHistory: s.bidHistory
    });

    /* Détecter et afficher les annonces du joueur humain */
    this._startAnnouncePhase();
  }

  _processBidPass(player) {
    const s = this.state;
    s.bidHistory.push(`${this._playerLabel(player)} passe`);

    const startIdx = PLAY_ORDER.indexOf(s.firstBidder);
    const curIdx   = PLAY_ORDER.indexOf(player);
    const passCount = (curIdx - startIdx + 4) % 4 + 1;

    if (passCount === 4) {
      /* 4 passes en tour 1 → tour 2 */
      s.bidPhase = 2;
      s.currentBidder = s.firstBidder;
      this._nextBid();
    } else {
      s.currentBidder = PLAY_ORDER[(PLAY_ORDER.indexOf(player) + 1) % 4];
      this._nextBid();
    }
  }

  _processPass2(player) {
    const s = this.state;
    s.bidHistory.push(`${this._playerLabel(player)} passe`);

    const startIdx = PLAY_ORDER.indexOf(s.firstBidder);
    const curIdx   = PLAY_ORDER.indexOf(player);
    const pass2Count = (curIdx - startIdx + 4) % 4 + 1;

    if (pass2Count === 4) {
      /* 4 passes en tour 2 → remise (redistribuer) */
      s.bidHistory.push('— Remise —');
      this.emit('toast', { msg: 'Remise ! Redistribution…', type: 'info' });
      setTimeout(() => this._startRound(), 1800);
    } else {
      s.currentBidder = PLAY_ORDER[(PLAY_ORDER.indexOf(player) + 1) % 4];
      this._nextBid();
    }
  }

  _completeDistribution(taker, trump) {
    const s = this.state;
    const deck = this._createDeck();
    this._shuffle(deck);

    /* Lister toutes les cartes déjà en main */
    const usedCards = new Set();
    for (const p of PLAY_ORDER)
      for (const c of s.hands[p])
        usedCards.add(c.suit + c.rank);
    usedCards.add(s.turnedCard.suit + s.turnedCard.rank);

    const remaining = deck.filter(c => !usedCards.has(c.suit + c.rank));
    let idx = 0;

    /* Le preneur reçoit la carte retournée (passe de 5 à 6 cartes) */
    s.hands[taker].push(s.turnedCard);

    /* Compléter chaque joueur à 8 cartes avec les restantes */
    for (const player of PLAY_ORDER) {
      while (s.hands[player].length < 8 && idx < remaining.length) {
        s.hands[player].push(remaining[idx++]);
      }
    }

    /* Retrier */
    for (const player of PLAY_ORDER) this._sortHand(player);
  }

  /* ─── Belote (Roi + Dame d'atout) ──────────────────────────── */

  _detectBelote() {
    const s = this.state;
    for (const player of PLAY_ORDER) {
      const hasKing  = s.hands[player].some(c => c.suit === s.trump && c.rank === 'R');
      const hasQueen = s.hands[player].some(c => c.suit === s.trump && c.rank === 'D');
      if (hasKing && hasQueen) {
        const team = this._teamOf(player);
        s.hasBelote[team] = true;
        if (player === 'south') s.beloteAnnounced = 'south';
      }
    }
  }

  /* ─── Phase d'annonces ──────────────────────────────────────── */

  _startAnnouncePhase() {
    const s = this.state;

    if (!this.config.announcementsEnabled) {
      if (!this.config.beloteEnabled) s.hasBelote = { NS: false, EW: false };
      this.confirmAnnouncements();
      return;
    }

    /* Calculer annonces de chaque joueur */
    for (const player of PLAY_ORDER) {
      const anns = this._detectAnnouncements(player, s.hands[player], s.trump);
      if (anns.length > 0) {
        const team = this._teamOf(player);
        s.announcements[team].push(...anns.map(a => ({ ...a, player })));
      }
    }

    /* Résoudre les conflits (seule la meilleure équipe garde ses annonces) */
    this._resolveAnnouncements();

    /* Calculer les points d'annonces (Belote comptée séparément via hasBelote) */
    for (const team of ['NS', 'EW']) {
      s.announcePts[team] = s.announcements[team].reduce((sum, a) => sum + a.points, 0);
    }

    /* Afficher la modal d'annonces au joueur sud */
    const playerAnnouncements = s.announcements['NS'].filter(a => a.player === 'south');
    const hasBeloteSouth = s.hasBelote['NS'] &&
      s.hands['south'].some(c => c.suit === s.trump && (c.rank === 'R' || c.rank === 'D'));

    this.emit('announcePhase', {
      playerAnnouncements,
      hasBelote: hasBeloteSouth,
      allAnnouncements: s.announcements
    });
  }

  /**
   * Détecte les annonces (suites et carrés) dans une main
   */
  _detectAnnouncements(player, hand, trump) {
    const announcements = [];

    /* ── Carrés ── */
    const byRank = {};
    for (const card of hand) {
      byRank[card.rank] = (byRank[card.rank] || 0) + 1;
    }
    for (const [rank, count] of Object.entries(byRank)) {
      if (count === 4) {
        let pts = 100;
        if (rank === 'V')  pts = 200;
        if (rank === '9')  pts = 150;
        if (rank === '7' || rank === '8') continue; // Pas de carré de 7/8
        announcements.push({ type: 'carré', rank, points: pts, label: `Carré de ${rank}` });
      }
    }

    /* ── Suites ── */
    for (const suit of SUITS) {
      const suited = hand
        .filter(c => c.suit === suit)
        .map(c => RANKS.indexOf(c.rank))
        .sort((a, b) => a - b);

      /* Trouver les séquences consécutives (longueur ≥ 3) */
      let start = 0;
      while (start < suited.length) {
        let end = start;
        while (end + 1 < suited.length && suited[end + 1] === suited[end] + 1) end++;
        const len = end - start + 1;
        if (len >= 3) {
          let pts;
          if (len === 3)      pts = 20;
          else if (len === 4) pts = 50;
          else                pts = 100;

          const ranks = suited.slice(start, end + 1).map(i => RANKS[i]);
          const label = len === 3 ? 'Tierce' : len === 4 ? 'Quarte' : `Quinte (${len})`;
          const topRank = RANKS[suited[end]];
          const isTrump = suit === trump;

          announcements.push({
            type: 'suite',
            suit,
            ranks,
            topRank,
            points: pts,
            length: len,
            isTrump,
            label: `${label} à ${topRank} de ${suit}`
          });
        }
        start = end + 1;
      }
    }

    return announcements;
  }

  /**
   * Règle : seule l'équipe ayant la meilleure annonce garde toutes ses annonces.
   * Critère : longueur de suite, puis rang le plus haut, puis atout > autre.
   */
  _resolveAnnouncements() {
    const s = this.state;

    /* Trouver la meilleure suite de chaque équipe */
    const bestSuite = (anns) => {
      const suites = anns.filter(a => a.type === 'suite');
      if (suites.length === 0) return null;
      return suites.reduce((best, a) => {
        if (!best) return a;
        if (a.length > best.length) return a;
        if (a.length === best.length) {
          const aTop = ORDER_PLAIN.indexOf(a.topRank);
          const bTop = ORDER_PLAIN.indexOf(best.topRank);
          if (aTop < bTop) return a;
          if (aTop === bTop && a.isTrump && !best.isTrump) return a;
        }
        return best;
      }, null);
    };

    const bestNS = bestSuite(s.announcements.NS);
    const bestEW = bestSuite(s.announcements.EW);

    if (!bestNS && !bestEW) return;
    if (bestNS && !bestEW) { s.announcements.EW = s.announcements.EW.filter(a => a.type === 'carré'); return; }
    if (!bestNS && bestEW) { s.announcements.NS = s.announcements.NS.filter(a => a.type === 'carré'); return; }

    /* Comparer les deux meilleures suites */
    let nsWins = false;
    if (bestNS.length > bestEW.length) nsWins = true;
    else if (bestNS.length === bestEW.length) {
      const nsTop = ORDER_PLAIN.indexOf(bestNS.topRank);
      const ewTop = ORDER_PLAIN.indexOf(bestEW.topRank);
      if (nsTop < ewTop) nsWins = true;
      else if (nsTop === ewTop) {
        nsWins = bestNS.isTrump && !bestEW.isTrump;
      }
    }

    if (nsWins) {
      s.announcements.EW = s.announcements.EW.filter(a => a.type === 'carré');
    } else {
      s.announcements.NS = s.announcements.NS.filter(a => a.type === 'carré');
    }
  }

  /** Appelé quand le joueur valide ses annonces */
  confirmAnnouncements() {
    this.state.phase = 'play';
    this.state.currentPlayer = this.state.firstBidder;
    this.state.leadPlayer    = this.state.firstBidder;
    this.emit('playPhaseStart', {
      trump:        this.state.trump,
      taker:        this.state.taker,
      currentPlayer: this.state.currentPlayer
    });
    this._nextPlayerTurn();
  }

  /* ─── Phase de jeu ──────────────────────────────────────────── */

  _nextPlayerTurn() {
    const s = this.state;
    this.emit('turnChange', { player: s.currentPlayer });

    if (s.currentPlayer !== 'south') {
      /* IA joue après un délai naturel */
      setTimeout(() => ai.playCard(this, s.currentPlayer), 1000 + Math.random() * 600);
    }
  }

  _playCard(player, card) {
    const s = this.state;

    /* Sécurité : valider la carte même pour les bots */
    if (player !== 'south') {
      const legal = this.getLegalCards(player);
      if (!legal.some(c => c.suit === card.suit && c.rank === card.rank)) {
        console.warn('[Belote] Carte illégale bloquée', { player, card });
        const fallback = legal[0];
        if (fallback) this._playCard(player, fallback);
        return;
      }
    }

    /* Retirer la carte de la main */
    const idx = s.hands[player].findIndex(c => c.suit === card.suit && c.rank === card.rank);
    if (idx === -1) return;
    const [played] = s.hands[player].splice(idx, 1);

    /* Gérer Belote/Rebelote */
    let beloteMsg = null;
    if (played.suit === s.trump && (played.rank === 'R' || played.rank === 'D')) {
      const team = this._teamOf(player);
      if (s.hasBelote[team]) {
        const playerHadBoth = this._hadBeloteAtStart(player);
        if (playerHadBoth) {
          if (!s._beloteCard) {
            s._beloteCard = played.rank; // Premier annoncé
            beloteMsg = `${this._playerLabel(player)} : Belote !`;
          } else {
            beloteMsg = `${this._playerLabel(player)} : Rebelote !`;
          }
        }
      }
    }

    s.currentTrick.push({ player, card: played });

    this.emit('cardPlayed', {
      player,
      card: played,
      trickLength: s.currentTrick.length,
      beloteMsg
    });

    if (beloteMsg) this.emit('toast', { msg: beloteMsg, type: 'info' });

    if (s.currentTrick.length === 4) {
      /* Pli complet */
      setTimeout(() => this._resolveTrick(), 800);
    } else {
      /* Joueur suivant */
      const curIdx = PLAY_ORDER.indexOf(player);
      s.currentPlayer = PLAY_ORDER[(curIdx + 1) % 4];
      this._nextPlayerTurn();
    }
  }

  _hadBeloteAtStart(player) {
    /* Vérifie si le joueur possède encore (ou vient de jouer) Roi et Dame d'atout */
    const s = this.state;
    const trump = s.trump;
    const hand = s.hands[player];
    const playedThisRound = s.currentTrick.filter(t => t.player === player).map(t => t.card);
    const allCards = [...hand, ...playedThisRound];
    return allCards.some(c => c.suit === trump && c.rank === 'R') &&
           allCards.some(c => c.suit === trump && c.rank === 'D');
  }

  _resolveTrick() {
    const s = this.state;
    const winner = this._getTrickWinner();
    const winTeam = this._teamOf(winner.player);

    /* Points du pli */
    let pts = 0;
    for (const { card } of s.currentTrick) {
      pts += this._cardPoints(card, s.trump);
    }

    /* Dernier pli = +10 */
    const totalCardsLeft = PLAY_ORDER.reduce((sum, p) => sum + s.hands[p].length, 0);
    const isLastTrick = (totalCardsLeft === 0);
    if (isLastTrick) pts += 10;

    s.trickPoints[winTeam] += pts;
    s.wonTricks[winTeam]++;
    s.tricks.push({ cards: [...s.currentTrick], winner: winner.player });
    s.currentTrick = [];
    s.leadPlayer   = winner.player;
    s.currentPlayer = winner.player;

    this.emit('trickWon', {
      winner: winner.player,
      winTeam,
      points: pts,
      isLastTrick,
      trickCards: s.tricks[s.tricks.length - 1].cards
    });

    if (isLastTrick) {
      setTimeout(() => this._computeRoundScore(), 1200);
    } else {
      setTimeout(() => {
        this.emit('clearTrick', {});
        this._nextPlayerTurn();
      }, 1000);
    }
  }

  /* ─── Calcul du score de fin de manche ──────────────────────── */

  _computeRoundScore() {
    const s = this.state;
    const taker  = s.taker;
    const tTeam  = s.takerTeam;
    const oTeam  = tTeam === 'NS' ? 'EW' : 'NS';

    const tPts   = s.trickPoints[tTeam];
    const oPts   = s.trickPoints[oTeam];
    const annT   = s.announcePts[tTeam];
    const annO   = s.announcePts[oTeam];

    let roundNS = 0, roundEW = 0;
    let messages = [];
    let dedans   = false;

    /* ── Priorité 1 : Capot (une équipe a tous les plis) ── */
    if (s.wonTricks[tTeam] === 8) {
      /* Preneur fait capot */
      if (tTeam === 'NS') { roundNS = 250 + annT; roundEW = annO; }
      else                { roundEW = 250 + annT; roundNS = annO; }
      messages.push(`🏆 Capot ! L'équipe preneuse remporte tous les plis !`);

    } else if (s.wonTricks[oTeam] === 8) {
      /* Défense fait capot → preneur dedans */
      dedans = true;
      if (oTeam === 'NS') { roundNS = 250 + annO + annT; roundEW = 0; }
      else                { roundEW = 250 + annO + annT; roundNS = 0; }
      messages.push(`🏆 Capot adverse ! L'équipe preneuse est DEDANS !`);

    /* ── Priorité 2 : Dedans (preneur ≤ adversaire) ── */
    } else if (tPts <= oPts) {
      dedans = true;
      messages.push(`⚠️ L'équipe preneuse (${tTeam}) est DEDANS !`);
      if (oTeam === 'NS') { roundNS = TOTAL_CARD_POINTS + annO + annT; roundEW = 0; }
      else                { roundEW = TOTAL_CARD_POINTS + annO + annT; roundNS = 0; }

    /* ── Priorité 3 : Score normal ── */
    } else {
      if (tTeam === 'NS') {
        roundNS = this._roundTo10(tPts) + annT;
        roundEW = this._roundTo10(oPts) + annO;
      } else {
        roundEW = this._roundTo10(tPts) + annT;
        roundNS = this._roundTo10(oPts) + annO;
      }
    }

    /* Belote : toujours comptée pour son propriétaire, même si dedans */
    if (s.hasBelote.NS) roundNS += 20;
    if (s.hasBelote.EW) roundEW += 20;

    /* Arrondir les totaux finaux */
    roundNS = this._roundTo10(roundNS);
    roundEW = this._roundTo10(roundEW);

    /* Ajouter au total */
    this.totalScore.NS += roundNS;
    this.totalScore.EW += roundEW;

    const scoreDetails = {
      NS: this._buildScoreTable('NS', tTeam, tPts, oPts, annT, annO, dedans, roundNS, s),
      EW: this._buildScoreTable('EW', tTeam, tPts, oPts, annT, annO, dedans, roundEW, s),
    };

    this.emit('roundEnd', {
      dedans,
      taker,
      takerTeam: tTeam,
      roundNS,
      roundEW,
      totalNS: this.totalScore.NS,
      totalEW: this.totalScore.EW,
      messages,
      scoreDetails,
      wonTricks: s.wonTricks,
      trickPoints: s.trickPoints,
      announcePts: s.announcePts
    });

    /* Vérifier fin de partie */
    if (this.totalScore.NS >= this.config.winningScore || this.totalScore.EW >= this.config.winningScore) {
      setTimeout(() => this._endGame(), 400);
    }
  }

  _buildScoreTable(team, takerTeam, tPts, oPts, annT, annO, dedans, roundTotal, s) {
    const rows = [];
    const isTaker = team === takerTeam;
    const myAnn   = team === takerTeam ? annT : annO;

    if (dedans) {
      if (!isTaker) {
        /* Gagnant : récupère toutes les levées + ses propres annonces + annonces adverses */
        rows.push(['Levées (toutes)', TOTAL_CARD_POINTS]);
        if (myAnn  > 0) rows.push(['Vos annonces',            myAnn]);
        if (annT   > 0) rows.push(['Annonces adverses récup.', annT]);
      }
      /* Perdant (dedans) : aucune levée, seulement Belote si elle lui appartient */
    } else {
      const myPts = isTaker ? tPts : oPts;
      rows.push(['Levées', this._roundTo10(myPts)]);
      if (myAnn > 0) rows.push(['Annonces', myAnn]);
    }
    if (s.hasBelote[team]) rows.push(['Belote', 20]);

    return rows;
  }

  _roundTo10(n) {
    return Math.floor(n / 10) * 10;
  }

  _endGame() {
    const winner = this.totalScore.NS >= this.config.winningScore ? 'NS' : 'EW';
    this.emit('gameEnd', {
      winner,
      totalNS: this.totalScore.NS,
      totalEW: this.totalScore.EW
    });
  }

  /* ─── Helpers ────────────────────────────────────────────────── */

  _teamOf(player) {
    return (player === 'south' || player === 'north') ? 'NS' : 'EW';
  }

  _partner(player) {
    const map = { south: 'north', north: 'south', east: 'west', west: 'east' };
    return map[player];
  }

  _playerLabel(player) {
    const labels = { south: 'Vous', north: 'Nord', east: 'Est', west: 'Ouest' };
    return labels[player];
  }

  _cardPoints(card, trump) {
    if (card.suit === trump) return POINTS_TRUMP[card.rank];
    return POINTS_PLAIN[card.rank];
  }

  _trumpStrength(card) {
    return ORDER_TRUMP.length - ORDER_TRUMP.indexOf(card.rank);
  }

  _plainStrength(card) {
    return ORDER_PLAIN.length - ORDER_PLAIN.indexOf(card.rank);
  }

  /**
   * Retourne le joueur qui est actuellement en tête du pli en cours
   * @returns {{ player, card }}
   */
  _getTrickWinner() {
    const s = this.state;
    const trick = s.currentTrick;
    if (trick.length === 0) return null;

    const leadSuit = trick[0].card.suit;
    const trump    = s.trump;
    let best = trick[0];

    for (let i = 1; i < trick.length; i++) {
      const { card } = trick[i];
      const bestCard = best.card;

      /* Règle : atout bat tout, plus fort atout gagne */
      if (card.suit === trump && bestCard.suit !== trump) {
        best = trick[i];
      } else if (card.suit === trump && bestCard.suit === trump) {
        if (this._trumpStrength(card) > this._trumpStrength(bestCard)) best = trick[i];
      } else if (card.suit === leadSuit && bestCard.suit !== trump) {
        if (this._plainStrength(card) > this._plainStrength(bestCard)) best = trick[i];
      }
      /* Autrement (ni atout ni couleur demandée) : ne bat pas */
    }

    return best;
  }
}

/* ── Instance globale ─────────────────────────────────────────── */
const game = new BeloteGame();

/* Exporte les constantes utiles aux autres modules */
window.PLAY_ORDER     = PLAY_ORDER;
window.SUITS          = SUITS;
window.RANKS          = RANKS;
window.ORDER_TRUMP    = ORDER_TRUMP;
window.ORDER_PLAIN    = ORDER_PLAIN;
window.POINTS_TRUMP   = POINTS_TRUMP;
window.POINTS_PLAIN   = POINTS_PLAIN;
window.game           = game;
