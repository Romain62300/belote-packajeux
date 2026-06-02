/**
 * ui.js — Interface utilisateur de la Belote PackaJeux
 *
 * Rôle : écouter les événements émis par game.js et mettre à jour le DOM.
 *        Gérer les interactions du joueur humain (clic sur cartes, enchères…).
 *
 * Aucune logique de jeu ici : toute règle reste dans game.js.
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════
   ÉTAT LOCAL DE L'UI
═══════════════════════════════════════════════════════════════ */
const ui = {
  /* Référence aux éléments DOM souvent utilisés */
  el: {},

  /* Retient quel pli est affiché (pour l'animation de victoire) */
  lastWinner: null,

  /* True pendant l'animation de pli (on bloque les clics) */
  busy: false,
};

/* ═══════════════════════════════════════════════════════════════
   INITIALISATION
═══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

  /* Cache des éléments DOM */
  ui.el = {
    screenWelcome:    document.getElementById('screen-welcome'),
    screenGame:       document.getElementById('screen-game'),
    btnStart:         document.getElementById('btn-start'),

    /* Scores */
    scoreNS:          document.getElementById('score-ns-val'),
    scoreEW:          document.getElementById('score-ew-val'),
    infoTrump:        document.getElementById('info-trump'),
    infoRound:        document.getElementById('info-round'),

    /* Mains */
    handSouth:        document.getElementById('hand-south'),
    handNorth:        document.getElementById('hand-north'),
    handWest:         document.getElementById('hand-west'),
    handEast:         document.getElementById('hand-east'),

    /* Pli central */
    trickNorth:       document.getElementById('trick-north'),
    trickSouth:       document.getElementById('trick-south'),
    trickWest:        document.getElementById('trick-west'),
    trickEast:        document.getElementById('trick-east'),
    trickWinnerBadge: document.getElementById('trick-winner-badge'),

    /* Compteurs */
    tricksNS:         document.getElementById('tricks-ns'),
    tricksEW:         document.getElementById('tricks-ew'),
    pileNS:           document.getElementById('pile-ns'),
    pileEW:           document.getElementById('pile-ew'),

    /* Tags joueurs */
    tagSouth:         document.getElementById('tag-south'),
    tagNorth:         document.getElementById('tag-north'),
    tagWest:          document.getElementById('tag-west'),
    tagEast:          document.getElementById('tag-east'),

    /* Zones joueurs */
    zoneSouth:        document.getElementById('zone-south'),

    /* Panneau enchères */
    bidOverlay:       document.getElementById('modal-bid'),
    bidPhase1:        document.getElementById('bid-phase1'),
    bidPhase2:        document.getElementById('bid-phase2'),
    bidProposedSuit:  document.getElementById('bid-proposed-suit'),
    bidInstruction:   document.getElementById('bid-instruction'),
    bidCardDisplay:   document.getElementById('bid-card-display'),
    bidHistory:       document.getElementById('bid-history'),
    btnTake:          document.getElementById('btn-take'),
    btnPass1:         document.getElementById('btn-pass1'),
    btnPass2:         document.getElementById('btn-pass2'),

    /* Modal annonces */
    modalAnnounce:     document.getElementById('modal-announce'),
    announceTrumpSuit: document.getElementById('announce-trump-suit'),
    announceList:      document.getElementById('announce-list'),
    announceBelote:    document.getElementById('announce-belote'),
    btnAnnounceOk:     document.getElementById('btn-announce-ok'),

    /* Modal fin de manche */
    modalRoundEnd:    document.getElementById('modal-round-end'),
    roundEndTitle:    document.getElementById('round-end-title'),
    scoreTableNS:     document.getElementById('score-table-ns'),
    scoreTableEW:     document.getElementById('score-table-ew'),
    rsTotalNS:        document.getElementById('rs-total-ns'),
    rsTotalEW:        document.getElementById('rs-total-ew'),
    roundEndMsg:      document.getElementById('round-end-msg'),
    btnNextRound:     document.getElementById('btn-next-round'),

    /* Modal fin de partie */
    modalGameEnd:     document.getElementById('modal-game-end'),
    gameEndTitle:     document.getElementById('game-end-title'),
    gameEndMsg:       document.getElementById('game-end-msg'),
    finalNS:          document.getElementById('final-ns'),
    finalEW:          document.getElementById('final-ew'),
    btnNewGame:       document.getElementById('btn-new-game'),

    /* Aide */
    btnHelp:          document.getElementById('btn-help'),
    btnOpenRules:     document.getElementById('btn-open-rules'),
    helpPanel:        document.getElementById('help-panel'),
    btnHelpClose:     document.getElementById('btn-help-close'),

    /* Config accueil */
    infoTarget:       document.getElementById('info-target'),
    optAnnouncements: document.getElementById('opt-announcements'),
    optBelote:        document.getElementById('opt-belote'),

    /* Toast */
    toastContainer:   document.getElementById('toast-container'),

  };

  /* ── Boutons ─────────────────────────────────────────────── */
  ui.el.btnStart.addEventListener('click', () => {
    const cfg = getGameConfig();
    showScreen('game');
    if (ui.el.infoTarget) ui.el.infoTarget.textContent = `Objectif : ${cfg.winningScore} pts`;
    game.startGame(cfg);
  });

  if (ui.el.btnOpenRules) {
    ui.el.btnOpenRules.addEventListener('click', () => ui.el.helpPanel.classList.remove('hidden'));
  }

  ui.el.btnNewGame.addEventListener('click', () => {
    hideModal('game-end');
    const cfg = getGameConfig();
    if (ui.el.infoTarget) ui.el.infoTarget.textContent = `Objectif : ${cfg.winningScore} pts`;
    game.startGame(cfg);
  });

  ui.el.btnNextRound.addEventListener('click', () => {
    hideModal('round-end');
    game.nextRound();
  });

  /* Enchères */
  ui.el.btnTake.addEventListener('click', () => game.humanTake(game.state.turnedCard.suit));
  ui.el.btnPass1.addEventListener('click', () => game.humanPass());
  ui.el.btnPass2.addEventListener('click', () => game.humanPass());

  document.querySelectorAll('.btn-suit').forEach(btn => {
    btn.addEventListener('click', () => game.humanChooseSuit(btn.dataset.suit));
  });

  /* Annonces */
  ui.el.btnAnnounceOk.addEventListener('click', () => {
    hideModal('announce');
    game.confirmAnnouncements();
  });

  /* Aide */
  ui.el.btnHelp.addEventListener('click', () => {
    ui.el.helpPanel.classList.toggle('hidden');
  });
  ui.el.btnHelpClose.addEventListener('click', () => {
    ui.el.helpPanel.classList.add('hidden');
  });

  /* ── Abonnements aux événements du moteur ────────────────── */
  game.on('roundStart',      onRoundStart);
  game.on('cardsDealt',      onCardsDealt);
  game.on('bidTurn',         onBidTurn);
  game.on('bidEnd',          onBidEnd);
  game.on('announcePhase',   onAnnouncePhase);
  game.on('playPhaseStart',  onPlayPhaseStart);
  game.on('turnChange',      onTurnChange);
  game.on('cardPlayed',      onCardPlayed);
  game.on('trickWon',        onTrickWon);
  game.on('clearTrick',      onClearTrick);
  game.on('roundEnd',        onRoundEnd);
  game.on('gameEnd',         onGameEnd);
  game.on('toast',           ({ msg, type }) => showToast(msg, type));
});

/* ── Lit la configuration choisie sur l'écran d'accueil ─────── */
function getGameConfig() {
  const targetEl  = document.querySelector('input[name="targetScore"]:checked');
  const variantEl = document.querySelector('input[name="variant"]:checked');
  return {
    winningScore:         targetEl  ? Number(targetEl.value)  : 1001,
    announcementsEnabled: ui.el.optAnnouncements ? ui.el.optAnnouncements.checked : true,
    beloteEnabled:        ui.el.optBelote        ? ui.el.optBelote.checked        : true,
    variant:              variantEl ? variantEl.value : 'classic',
  };
}

/* ═══════════════════════════════════════════════════════════════
   HANDLERS D'ÉVÉNEMENTS
═══════════════════════════════════════════════════════════════ */

function onRoundStart({ round }) {
  ui.el.infoRound.textContent = `Manche ${round}`;
  /* Réinitialiser l'UI */
  clearAllHands();
  clearTrickArea();
  ui.el.tricksNS.textContent = '0';
  ui.el.tricksEW.textContent = '0';
  ui.el.pileNS.classList.remove('has-tricks');
  ui.el.pileEW.classList.remove('has-tricks');
  ui.el.infoTrump.textContent = 'Atout : —';
  clearAllTags();
  ui.el.trickWinnerBadge.classList.add('hidden');
}

function onCardsDealt({ hands, turnedCard }) {
  /* Afficher les mains */
  renderHand('south', hands.south, false);
  renderHand('north', hands.north, true);   // dos
  renderHand('west',  hands.west,  true);   // dos
  renderHand('east',  hands.east,  true);   // dos
}

function onBidTurn({ bidder, bidPhase, turnedCard, bidHistory }) {
  if (bidder !== 'south') {
    showToast(`${playerLabel(bidder)} réfléchit…`, 'info');
    return;
  }

  const e = ui.el;

  /* Carte retournée */
  e.bidCardDisplay.innerHTML = '';
  e.bidCardDisplay.appendChild(buildCardEl(turnedCard, false, true));
  e.bidProposedSuit.textContent = turnedCard.suit;

  /* Historique */
  e.bidHistory.innerHTML = '';
  bidHistory.forEach(h => {
    const div = document.createElement('div');
    div.textContent = h;
    e.bidHistory.appendChild(div);
  });

  if (bidPhase === 1) {
    e.bidPhase1.classList.remove('hidden');
    e.bidPhase2.classList.add('hidden');
    e.bidInstruction.innerHTML = `Prendre en <strong>${turnedCard.suit}</strong> ?`;
  } else {
    e.bidPhase1.classList.add('hidden');
    e.bidPhase2.classList.remove('hidden');
    e.bidInstruction.innerHTML = `Choisir l'atout :`;
    document.querySelectorAll('.btn-suit').forEach(btn => {
      btn.disabled = (btn.dataset.suit === turnedCard.suit);
    });
  }

  /* Délai au tout premier tour pour laisser voir la distribution */
  const delay = (bidPhase === 1 && bidHistory.length === 0) ? 1000 : 0;
  setTimeout(() => showBidPanel(), delay);
}

function onBidEnd({ taker, trump, bidHistory }) {
  hideBidPanel();
  ui.el.infoTrump.textContent = `Atout : ${trump}`;

  /* Tags équipes */
  setTag(taker, 'Preneur');
  setTag(game._partner(taker), 'Associé');
  PLAY_ORDER.filter(p => p !== taker && p !== game._partner(taker))
            .forEach(p => setTag(p, 'Défense'));

  /* ── Re-rendre toutes les mains avec les 8 cartes complètes ──
     _completeDistribution a rempli game.state.hands en mémoire
     mais l'UI n'avait affiché que les 5 cartes initiales.      */
  const hands = game.state.hands;
  renderHand('south', hands.south, false);
  renderHand('north', hands.north, true);
  renderHand('west',  hands.west,  true);
  renderHand('east',  hands.east,  true);

  showToast(`${playerLabel(taker)} prend en ${trump} !`, 'success');
}

function onAnnouncePhase({ playerAnnouncements, hasBelote, allAnnouncements }) {
  const e = ui.el;
  const list = e.announceList;
  list.innerHTML = '';

  e.announceTrumpSuit.textContent = game.state.trump;

  if (playerAnnouncements.length === 0 && !hasBelote) {
    const div = document.createElement('div');
    div.className = 'announce-none';
    div.textContent = 'Aucune annonce.';
    list.appendChild(div);
  } else {
    playerAnnouncements.forEach(ann => {
      const item = document.createElement('div');
      item.className = 'announce-item';
      item.innerHTML = `<span>${ann.label}</span><span class="ann-pts">+${ann.points} pts</span>`;
      list.appendChild(item);
    });
  }

  if (hasBelote) {
    ui.el.announceBelote.classList.remove('hidden');
  } else {
    ui.el.announceBelote.classList.add('hidden');
  }

  /* Afficher aussi les annonces adverses en toast */
  const ewAnns = allAnnouncements.EW;
  if (ewAnns.length > 0) {
    const total = ewAnns.reduce((s, a) => s + a.points, 0);
    setTimeout(() => showToast(`Adversaires : ${ewAnns.map(a => a.label).join(', ')} (${total} pts)`, 'info'), 400);
  }

  showModal('announce');
}

function onPlayPhaseStart({ trump, taker, currentPlayer }) {
  updateHandPlayability();
}

function onTurnChange({ player }) {
  ui.el.zoneSouth.classList.toggle('your-turn', player === 'south');
  if (player === 'south') {
    updateHandPlayability();
  }
}

function onCardPlayed({ player, card, trickLength, beloteMsg }) {
  /* Retirer la carte de la main visuelle */
  removeCardFromHand(player, card);

  /* Poser la carte dans la zone de pli */
  const slot = getTrickSlot(player);
  slot.innerHTML = '';
  const cardEl = buildCardEl(card, false, true);
  cardEl.classList.add('play-card');
  slot.appendChild(cardEl);
}

function onTrickWon({ winner, winTeam, points, isLastTrick, trickCards }) {
  ui.busy = true;

  /* Marquer la carte gagnante */
  const winSlot = getTrickSlot(winner);
  const winCardEl = winSlot.querySelector('.card');
  if (winCardEl) winCardEl.classList.add('winner-card');

  /* Badge de victoire */
  const badge = ui.el.trickWinnerBadge;
  badge.textContent = `${playerLabel(winner)} +${points}`;
  badge.classList.remove('hidden');

  /* Mettre à jour compteurs */
  const ns = game.state.wonTricks.NS;
  const ew = game.state.wonTricks.EW;
  ui.el.tricksNS.textContent = ns;
  ui.el.tricksEW.textContent = ew;

  if (ns > 0) ui.el.pileNS.classList.add('has-tricks');
  if (ew > 0) ui.el.pileEW.classList.add('has-tricks');

  /* Mise à jour du score total */
  ui.el.scoreNS.textContent = game.totalScore.NS;
  ui.el.scoreEW.textContent = game.totalScore.EW;
}

function onClearTrick() {
  clearTrickArea();
  ui.el.trickWinnerBadge.classList.add('hidden');
  ui.busy = false;
}

function onRoundEnd(data) {
  const { dedans, taker, takerTeam, roundNS, roundEW,
          totalNS, totalEW, messages, scoreDetails,
          wonTricks, trickPoints, announcePts } = data;

  /* Mettre à jour les scores totaux dans la barre */
  ui.el.scoreNS.textContent = totalNS;
  ui.el.scoreEW.textContent = totalEW;

  /* Titre */
  ui.el.roundEndTitle.textContent = dedans
    ? `💥 ${takerTeam === 'NS' ? 'Vous êtes' : 'Ils sont'} DEDANS !`
    : `✅ Fin de manche`;

  /* Tableau de scores */
  renderScoreTable(ui.el.scoreTableNS, scoreDetails.NS);
  renderScoreTable(ui.el.scoreTableEW, scoreDetails.EW);
  ui.el.rsTotalNS.textContent = roundNS;
  ui.el.rsTotalEW.textContent = roundEW;

  /* Message */
  const msgs = [
    `Levées NS : ${trickPoints.NS} pts (${wonTricks.NS} plis)`,
    `Levées EW : ${trickPoints.EW} pts (${wonTricks.EW} plis)`,
  ];
  if (announcePts.NS > 0) msgs.push(`Annonces NS : +${announcePts.NS} pts`);
  if (announcePts.EW > 0) msgs.push(`Annonces EW : +${announcePts.EW} pts`);
  msgs.push(...messages);
  ui.el.roundEndMsg.innerHTML = msgs.map(m => `<div>${m}</div>`).join('');

  /* Effet visuel "dedans" */
  if (dedans) {
    ui.el.modalRoundEnd.classList.add('dedans-effect');
  } else {
    ui.el.modalRoundEnd.classList.remove('dedans-effect');
  }

  setTimeout(() => showModal('round-end'), 600);
}

function onGameEnd({ winner, totalNS, totalEW }) {
  const isPlayerWin = winner === 'NS';
  ui.el.gameEndTitle.textContent = isPlayerWin ? '🏆 Victoire !' : '😢 Défaite';
  ui.el.gameEndMsg.textContent = isPlayerWin
    ? 'Félicitations ! Vous avez remporté la partie !'
    : 'L\'équipe adverse a remporté la partie. Bonne chance la prochaine fois !';
  ui.el.finalNS.textContent = totalNS;
  ui.el.finalEW.textContent = totalEW;
  showModal('game-end');
}

/* ═══════════════════════════════════════════════════════════════
   RENDU DES MAINS
═══════════════════════════════════════════════════════════════ */

/**
 * Affiche la main d'un joueur dans son conteneur
 * @param {string} player
 * @param {object[]} cards
 * @param {boolean} faceDown — true pour les bots
 */
function renderHand(player, cards, faceDown) {
  const container = getHandEl(player);
  container.innerHTML = '';

  cards.forEach((card, i) => {
    const el = buildCardEl(card, faceDown, false);
    el.style.animationDelay = `${i * 0.06}s`;
    el.classList.add('deal-anim');

    if (!faceDown && player === 'south') {
      el.addEventListener('click', () => {
        if (ui.busy) return;
        if (game.state.phase !== 'play' || game.state.currentPlayer !== 'south') return;
        game.humanPlayCard(card);
      });
    }

    container.appendChild(el);
  });
}

/**
 * Met à jour la jouabilité des cartes de la main sud
 */
function updateHandPlayability() {
  const container = ui.el.handSouth;
  const cards = container.querySelectorAll('.card');
  if (game.state.phase !== 'play' || game.state.currentPlayer !== 'south') {
    cards.forEach(el => {
      el.classList.remove('playable', 'not-playable');
    });
    return;
  }

  const legal = game.getLegalCards('south');
  const legalKeys = new Set(legal.map(c => c.suit + c.rank));

  cards.forEach(el => {
    const key = el.dataset.suit + el.dataset.rank;
    if (legalKeys.has(key)) {
      el.classList.add('playable');
      el.classList.remove('not-playable');
    } else {
      el.classList.remove('playable');
      el.classList.add('not-playable');
    }
  });
}

/**
 * Retire visuellement une carte de la main d'un joueur
 */
function removeCardFromHand(player, card) {
  const container = getHandEl(player);
  const els = Array.from(container.querySelectorAll('.card'));

  const fadeOut = (el, duration = 200) => {
    el.style.transition = `transform ${duration}ms, opacity ${duration}ms`;
    el.style.transform  = 'translateY(-20px)';
    el.style.opacity    = '0';
    setTimeout(() => el.remove(), duration);
  };

  /* Chercher d'abord par identifiant exact (cartes face visible) */
  const exact = els.find(el => el.dataset.suit === card.suit && el.dataset.rank === card.rank);
  if (exact) { fadeOut(exact); return; }

  /* Sinon (cartes dos de bots) : retirer le premier dos */
  const back = els.find(el => el.classList.contains('back'));
  if (back) { fadeOut(back, 150); }
}

/* ═══════════════════════════════════════════════════════════════
   CONSTRUCTION D'UN ÉLÉMENT CARTE
═══════════════════════════════════════════════════════════════ */

/**
 * Crée l'élément DOM d'une carte
 * @param {object} card  — { suit, rank }
 * @param {boolean} faceDown
 * @param {boolean} noMargin — pour les affichages isolés (modal)
 */
function buildCardEl(card, faceDown, noMargin) {
  const el = document.createElement('div');
  el.className = 'card';

  if (faceDown) {
    el.classList.add('back');
    el.dataset.suit = card.suit;
    el.dataset.rank = card.rank;
    return el;
  }

  const color = (card.suit === '♥' || card.suit === '♦') ? 'red' : 'black';
  el.classList.add(color);
  el.dataset.suit = card.suit;
  el.dataset.rank = card.rank;

  /* Marquer les cartes d'atout si atout connu */
  if (game.state && game.state.trump === card.suit) {
    el.classList.add('trump-card');
  }

  if (noMargin) el.style.margin = '0';

  const suitSym = card.suit;
  const rankDisplay = card.rank === 'V' ? 'J' : card.rank === 'D' ? 'Q' : card.rank === 'R' ? 'K' : card.rank === 'A' ? 'A' : card.rank;

  el.innerHTML = `
    <div class="card-top">${rankDisplay}<br>${suitSym}</div>
    <div class="card-center">${suitSym}</div>
    <div class="card-bottom">${rankDisplay}<br>${suitSym}</div>
  `;

  return el;
}

/* ═══════════════════════════════════════════════════════════════
   HELPERS DOM
═══════════════════════════════════════════════════════════════ */

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${id}`).classList.add('active');
}

function showModal(id) {
  document.getElementById(`modal-${id}`).classList.remove('hidden');
}

function hideModal(id) {
  document.getElementById(`modal-${id}`).classList.add('hidden');
}

function showBidPanel() {
  ui.el.bidOverlay.classList.remove('hidden');
}

function hideBidPanel() {
  ui.el.bidOverlay.classList.add('hidden');
}

function getHandEl(player) {
  return document.getElementById(`hand-${player}`);
}

function getTrickSlot(player) {
  return document.getElementById(`trick-${player}`);
}

function clearAllHands() {
  PLAY_ORDER.forEach(p => {
    const el = getHandEl(p);
    if (el) el.innerHTML = '';
  });
}

function clearTrickArea() {
  PLAY_ORDER.forEach(p => {
    const slot = getTrickSlot(p);
    if (slot) {
      /* Conserver le label de position */
      const label = slot.querySelector('.pos-label');
      slot.innerHTML = '';
      if (label) slot.appendChild(label);
    }
  });
}

function clearAllTags() {
  PLAY_ORDER.forEach(p => setTag(p, ''));
}

function setTag(player, text) {
  const el = document.getElementById(`tag-${player}`);
  if (el) el.textContent = text;
}

function playerLabel(player) {
  const labels = { south: 'Vous', north: 'Nord', east: 'Est', west: 'Ouest' };
  return labels[player] || player;
}

function renderScoreTable(tableEl, rows) {
  tableEl.innerHTML = '';
  rows.forEach(([label, pts]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${label}</td><td>${pts}</td>`;
    tableEl.appendChild(tr);
  });
  if (rows.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="2" style="color:#888">Rien</td>`;
    tableEl.appendChild(tr);
  }
}

/**
 * Affiche un toast flottant
 * @param {string} msg
 * @param {'info'|'success'|'error'} type
 */
function showToast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  ui.el.toastContainer.appendChild(el);
  /* Supprimer après la fin de l'animation */
  setTimeout(() => el.remove(), 2700);
}
