// --- CONFIG PISTE ---
const TRACK_LEN = 48;
const COORDS = [];
const CX = 350, CY = 300; 
const RX = 310, RY = 250; 

function initCoords() {
    for(let i=0; i<TRACK_LEN; i++) {
        const angle = (Math.PI / 2) - (i * (2 * Math.PI / TRACK_LEN));
        COORDS.push({
            x: CX + RX * Math.cos(angle) - 25, 
            y: CY + RY * Math.sin(angle) - 25
        });
    }
}
initCoords();

// --- CONFIG CARTES ---
const CARD_DEFINITIONS = [
    { id: 'CRAVACHE', name: "Coup de Cravache", count: 8, desc: "Le cheval avance immédiatement de 3 cases supplémentaires !" },
    { id: 'DAI', name: "Allure Irrégulière (DAI)", count: 4, desc: "Disqualification immédiate ! Le cheval quitte la course." },
    { id: 'ASPIRATION', name: "Aspiration", count: 12, desc: "Avancez pour coller le cheval juste devant vous !" },
    { id: 'ENFERME', name: "Enfermé", count: 8, desc: "CHOISISSEZ une cible adverse. Elle sera bloquée au prochain tour si elle a un cheval devant elle." },
    { id: 'DEFERRE', name: "Déferré des 4", count: 8, desc: "Si vous avez fait 1, 2 ou 3, ce dé compte comme un 6 ! Avancez de la différence." }
];

// --- ETAT DU JEU ---
const state = {
    playerCount: 2,
    currentRound: 1, 
    finishedList: [], 
    dice: [0,0], 
    diceUsed: [false, false], 
    movedHorses: [],
    gameOver: false,
    actionSquares: [],
    deck: [],
    lockedHorseId: null, 
    pendingCardState: null,
    turn: 1,
    players: {}
};

// --- DOM ELEMENTS ---
const elTrack = document.getElementById('track-container');
const elLog = document.getElementById('log-box');
const elRoll = document.getElementById('btn-roll');
const elMsg = document.getElementById('msg-box');
const elMalusArea = document.getElementById('malus-area');
const elMalusText = document.getElementById('malus-text');
const elTurnInd = document.getElementById('turn-indicator');
const elGameWrapper = document.getElementById('game-wrapper');
const elSetupScreen = document.getElementById('setup-screen');
const elInputP1 = document.getElementById('input-p1');
const elInputP2 = document.getElementById('input-p2');
const elBtnStart = document.getElementById('btn-start-game');

const elLabelP1 = document.getElementById('label-p1');
const elLabelP2 = document.getElementById('label-p2');
const elScoreNameP1 = document.getElementById('score-name-p1');
const elScoreNameP2 = document.getElementById('score-name-p2');
const elGlobalScoreP1 = document.getElementById('global-score-p1');
const elGlobalScoreP2 = document.getElementById('global-score-p2');
const elCurrentRound = document.getElementById('current-round');

const elModal = document.getElementById('card-modal');
const elCardTitle = document.getElementById('card-title');
const elCardDesc = document.getElementById('card-desc');
const elBtnCloseCard = document.getElementById('btn-close-card');

const elPlayerCountSelect = document.getElementById('player-count-select');
const elStablesContainer = document.getElementById('stables-container');
const elScoreBoardContainer = document.getElementById('score-board-container');

elBtnCloseCard.onclick = () => { 
    elModal.classList.add('hidden'); 
    resolvePendingCard(); 
};

elPlayerCountSelect.onchange = () => {
    const count = parseInt(elPlayerCountSelect.value);
    document.getElementById('group-p3').classList.toggle('hidden', count < 3);
    document.getElementById('group-p4').classList.toggle('hidden', count < 4);
};

elBtnStart.onclick = startGame;

function startGame() {
    state.playerCount = parseInt(elPlayerCountSelect.value);
    
    state.players = {};
    for(let i=1; i<=state.playerCount; i++) {
        const nameVal = document.getElementById(`input-p${i}`).value.trim();
        const name = nameVal || `Joueur ${i}`;
        state.players[i] = {
            id: i,
            name: name,
            color: `p${i}`,
            points: 0,
            horses: createTeam(name, `p${i}`)
        };
    }

    buildUI();

    elSetupScreen.classList.add('hidden');
    elGameWrapper.classList.remove('hidden');

    state.turn = 1;
    updateTurnIndicator();
    initGame();
}

function buildUI() {
    elStablesContainer.innerHTML = '';
    elScoreBoardContainer.innerHTML = '';
    
    for(let i=1; i<=state.playerCount; i++) {
        const stable = document.createElement('div');
        stable.className = 'stable-box';
        stable.id = `stable-p${i}`;
        
        const label = document.createElement('span');
        label.className = `stable-label p${i}-color`;
        label.id = `label-p${i}`;
        label.innerText = `Écurie ${state.players[i].name}`;
        
        stable.appendChild(label);
        elStablesContainer.appendChild(stable);

        const span = document.createElement('span');
        span.className = `p${i}-text`;
        span.innerHTML = `<span id="score-name-p${i}">${state.players[i].name}</span>: <span id="global-score-p${i}">0</span> pts`;
        elScoreBoardContainer.appendChild(span);
        
        if(i < state.playerCount) {
            const sep = document.createElement('span');
            sep.className = 'separator';
            sep.innerText = '|';
            elScoreBoardContainer.appendChild(sep);
        }
    }
}

function createTeam(name, col) {
    const prefix = name.length > 5 ? name.substring(0, 4) : name;
    return [1,2,3].map(i => ({ 
        id: `${col}h${i}`, 
        name: `${prefix}-${i}`, 
        pos: -1, 
        status: 'stable' 
    }));
}

function initGame() {
    initDeck();
    initActionSquares();
    drawBoard();
    renderHorses();
    log("=== DÉBUT DE LA MANCHE 1 ===");
    updateMalusUI();
    elRoll.style.display = 'block';
    updateDiceUI('?', '?', false);
}

function initDeck() {
    state.deck = [];
    CARD_DEFINITIONS.forEach(def => {
        for(let i=0; i<def.count; i++) state.deck.push({ ...def });
    });
    for (let i = state.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [state.deck[i], state.deck[j]] = [state.deck[j], state.deck[i]];
    }
}

function initActionSquares() {
    state.actionSquares = [];
    while(state.actionSquares.length < 10) {
        let r = Math.floor(Math.random() * 47) + 1;
        if(!state.actionSquares.includes(r)) state.actionSquares.push(r);
    }
}

function drawBoard() {
    elTrack.innerHTML = '<div id="infield"><div id="winners-circle"><div class="podium-header">LE PODIUM</div><div id="podium-slots"><div class="podium-step step-2"><div id="podium-2" class="podium-content"></div><div class="rank-label silver">2</div></div><div class="podium-step step-1"><div id="podium-1" class="podium-content"></div><div class="rank-label gold">1</div></div><div class="podium-step step-3"><div id="podium-3" class="podium-content"></div><div class="rank-label bronze">3</div></div></div></div></div>';

    COORDS.forEach((p, i) => {
        const d = document.createElement('div');
        d.className = 'cell';
        d.style.left = p.x + 'px'; d.style.top = p.y + 'px';
        d.setAttribute('data-idx', i);
        
        if(i === 0) { d.classList.add('finish-line'); d.innerText = '🏁'; }
        else if(state.actionSquares.includes(i)) {
            d.classList.add('action-cell');
            d.innerText = '?';
        }
        else d.innerText = i;
        
        elTrack.appendChild(d);
    });
}

function renderHorses() {
    document.querySelectorAll('.horse').forEach(h => h.remove());
    document.getElementById('dai-container').innerHTML = ''; 
    document.getElementById('podium-1').innerHTML = '';
    document.getElementById('podium-2').innerHTML = '';
    document.getElementById('podium-3').innerHTML = '';

    elCurrentRound.innerText = state.currentRound;
    
    for(let i=1; i<=state.playerCount; i++) {
        document.getElementById(`global-score-p${i}`).innerText = state.players[i].points;
    }

    for(let pid=1; pid<=state.playerCount; pid++) {
        const stableEl = document.getElementById(`stable-p${pid}`);
        const label = document.getElementById(`label-p${pid}`);
        stableEl.innerHTML = ''; 
        if(label) stableEl.appendChild(label);
        else {
             const newLabel = document.createElement('span');
             newLabel.id = `label-p${pid}`;
             newLabel.className = `stable-label p${pid}-color`;
             newLabel.innerText = state.players[pid].name;
             stableEl.appendChild(newLabel);
        }
        
        const list = document.createElement('div');
        list.className = 'racing-list';
        list.id = `racing-list-p${pid}`;
        stableEl.appendChild(list);
    }

    const occupancy = {}; 
    for(let pid=1; pid<=state.playerCount; pid++) {
        state.players[pid].horses.forEach(h => {
            if(h.status === 'racing') {
                if(!occupancy[h.pos]) occupancy[h.pos] = [];
                occupancy[h.pos].push(h);

                const listEl = document.getElementById(`racing-list-p${pid}`);
                const item = document.createElement('div');
                item.className = 'racing-item ' + state.players[pid].color;
                item.innerText = `${h.name} (Case ${h.pos})`;
                listEl.appendChild(item);
            }
        });
    }

    for(let pid=1; pid<=state.playerCount; pid++) {
        state.players[pid].horses.forEach(h => {
            const el = document.createElement('div');
            el.className = `horse ${state.players[pid].color}`;
            el.innerHTML = `${h.name}`;

            if(h.status === 'stable') {
                el.classList.add('static');
                document.getElementById(`stable-p${pid}`).appendChild(el);
            } 
            else if(h.status === 'dai') {
                el.classList.add('static', 'dai-status');
                document.getElementById('dai-container').appendChild(el);
            }
            else if(h.status === 'finished') {
                el.classList.add('winner');
                const rank = state.finishedList.indexOf(h.id) + 1;
                let targetDiv = document.getElementById(`podium-${rank}`);
                if(targetDiv) targetDiv.appendChild(el);
            } 
            else {
                const c = COORDS[h.pos];
                const stack = occupancy[h.pos];
                const indexInStack = stack.indexOf(h);
                const baseX = c.x + 4; 
                const baseY = c.y + 14;

                let offsetX = 0;
                let offsetY = 0;
                
                if (stack && stack.length > 1) {
                     offsetX = (indexInStack * 6) - 6;
                     offsetY = (indexInStack * 6) - 6;
                }

                el.style.left = (baseX + offsetX) + 'px'; 
                el.style.top = (baseY + offsetY) + 'px';
                elTrack.appendChild(el);
            }
        });
    }
}

function isSquareOccupied(idx) {
    let occ = false;
    for(let pid=1; pid<=state.playerCount; pid++) {
        state.players[pid].horses.forEach(h => {
            if(h.status === 'racing' && h.pos === idx) occ = true;
        });
    }
    return occ;
}

function checkOvertake(from, to) {
    for(let i = from + 1; i < to; i++) {
        if(i >= TRACK_LEN) break; 
        if(isSquareOccupied(i)) return true;
    }
    return false;
}

function drawCard(horse, dieValueUsed) {
    if(state.deck.length === 0) {
        log("Talon de cartes vide !");
        checkEndOfMove();
        return;
    }
    const card = state.deck.pop();
    log(`>> CARTE : ${card.name}`);
    
    state.pendingCardState = { card, horse, dieValueUsed };

    elCardTitle.innerText = card.name;
    elCardDesc.innerText = card.desc;
    elModal.classList.remove('hidden');
}

function resolvePendingCard() {
    if(!state.pendingCardState) return;
    
    const { card, horse, dieValueUsed } = state.pendingCardState;
    state.pendingCardState = null;

    if (card.id === 'ENFERME') {
        showEnfermeTargetSelection();
    } else {
        applyCardEffect(card, horse, dieValueUsed);
        checkEndOfMove();
    }
}

function showEnfermeTargetSelection() {
    const opponentId = state.turn === 1 ? 2 : 1;
    // Si + de 2 joueurs, on cherche tous les adversaires
    let opponentHorses = [];
    for(let pid=1; pid<=state.playerCount; pid++) {
        if(pid !== state.turn) {
            opponentHorses = opponentHorses.concat(state.players[pid].horses.filter(h => h.status === 'racing'));
        }
    }

    document.getElementById('list-die-0').innerHTML = '';
    document.getElementById('list-die-1').innerHTML = '';
    elMsg.innerText = "CHOISISSEZ UNE CIBLE À ENFERMER :";

    const container = document.getElementById('list-die-0');

    if (opponentHorses.length === 0) {
        log("Aucun cheval adverse en piste à enfermer.");
        checkEndOfMove();
        return;
    }

    opponentHorses.forEach(h => {
        const btn = document.createElement('div');
        btn.className = `choice-item target-btn`;
        btn.style.cursor = "pointer";
        btn.innerText = `BLOQUER ${h.name}`;
        btn.onclick = () => applyEnferme(h.id);
        container.appendChild(btn);
    });
}

function applyEnferme(targetId) {
    state.lockedHorseId = targetId;
    let name = "Cible";
    for(let pid=1; pid<=state.playerCount; pid++) {
        const h = state.players[pid].horses.find(x => x.id === targetId);
        if(h) name = h.name;
    }
    
    log(`🔒 ${name} sera bloqué au prochain tour s'il n'est pas seul !`);
    document.getElementById('list-die-0').innerHTML = '';
    checkEndOfMove();
}

function applyCardEffect(card, horse, dieValue) {
    const oldPos = horse.pos;

    switch(card.id) {
        case 'DAI':
            horse.status = 'dai';
            horse.pos = -99;
            log(`❌ ${horse.name} DISQUALIFIÉ !`);
            break;
            
        case 'ASPIRATION':
            let bestTarget = 999;
            let found = false;
            for(let pid=1; pid<=state.playerCount; pid++) {
                 state.players[pid].horses.forEach(h => {
                    if(h.status === 'racing' && h.pos > horse.pos && h.pos < bestTarget) {
                        bestTarget = h.pos;
                        found = true;
                    }
                });
            }
            if(found) {
                horse.pos = bestTarget - 1;
                if(horse.pos < 0) horse.pos = 0;
                log(`💨 Aspiration : ${horse.name} Case ${oldPos} ➝ Case ${horse.pos}`);
            } else {
                log("Personne devant à aspirer.");
            }
            break;

        case 'CRAVACHE':
            horse.pos += 3;
            log(`⚡ Cravache (+3) : ${horse.name} Case ${oldPos} ➝ Case ${horse.pos}`);
            checkFinishLine(horse);
            break;

        case 'DEFERRE':
            if(dieValue <= 3) {
                const bonus = 6 - dieValue;
                horse.pos += bonus;
                log(`⚡ Déferré (Dé ${dieValue}➝6) : ${horse.name} Case ${oldPos} ➝ Case ${horse.pos} (+${bonus})`);
                checkFinishLine(horse);
            } else {
                log(`Déferré sans effet (Dé était ${dieValue}).`);
            }
            break;
    }
    renderHorses();
}

function checkFinishLine(horse) {
    if(horse.status === 'racing' && horse.pos >= TRACK_LEN) {
        horse.pos = 999; 
        horse.status = 'finished';
        state.finishedList.push(horse.id);
        log(`🏁 ${horse.name} franchit la ligne grâce au bonus !`);
    }
}

function updateMalusUI() {
    if(state.lockedHorseId) {
        let lockedHorseName = "";
        for(let pid=1; pid<=state.playerCount; pid++) {
            const found = state.players[pid].horses.find(h => h.id === state.lockedHorseId);
            if(found) lockedHorseName = found.name;
        }

        const isMyHorse = state.players[state.turn].horses.some(h => h.id === state.lockedHorseId);
        
        if(isMyHorse) {
            elMalusArea.style.display = 'block';
            elMalusText.innerText = `⚠️ ${lockedHorseName} est menacé d'enfermement`;
        } else {
            elMalusArea.style.display = 'none';
        }
    } else {
        elMalusArea.style.display = 'none';
    }
}

function checkEndOfMove() {
    if(state.finishedList.length >= 3) {
        handleRaceFinish();
        return;
    }

    if(state.diceUsed[0] && state.diceUsed[1]) {
        setTimeout(endTurn, 1000);
    } else {
        setTimeout(calculateMoves, 300);
    }
}

function calculatePoints() {
    const points = [10, 5, 3];
    state.finishedList.forEach((horseId, index) => {
        if(index < 3) {
            for(let pid=1; pid<=state.playerCount; pid++) {
                if(state.players[pid].horses.some(h => h.id === horseId)) {
                    state.players[pid].points += points[index];
                    log(`🏆 ${state.players[pid].name} gagne ${points[index]} pts (${index+1}e place)`);
                }
            }
        }
    });
}

function handleRaceFinish() {
    calculatePoints();
    renderHorses(); 

    if(state.currentRound === 1) {
        setTimeout(() => {
            alert("FIN DE LA MANCHE 1 !\nLes points ont été attribués.\nPréparez-vous pour la manche décisive !");
            startNextRound();
        }, 500);
    } else {
        setTimeout(() => {
            endMatch();
        }, 500);
    }
}

function startNextRound() {
    state.currentRound = 2;
    state.turn = 1; 
    state.finishedList = [];
    state.movedHorses = [];
    state.diceUsed = [false, false];
    state.dice = [0, 0];
    state.lockedHorseId = null;
    
    for(let pid=1; pid<=state.playerCount; pid++) {
        state.players[pid].horses.forEach(h => {
            h.pos = -1;
            h.status = 'stable';
        });
    }

    initDeck();
    initActionSquares();
    drawBoard();
    renderHorses();
    
    elLog.innerHTML = ''; 
    log("=== DÉBUT DE LA MANCHE 2 ===");
    elMsg.innerText = "Nouvelle manche ! À vous de jouer.";
    
    document.getElementById('list-die-0').innerHTML = '';
    document.getElementById('list-die-1').innerHTML = '';

    elRoll.style.display = 'block';
    updateDiceUI('?', '?', false);
    updateTurnIndicator();
}

function endMatch() {
    const s1 = state.players[1].points;
    const s2 = state.players[2].points;
    let msg = `SCORE FINAL :\n${state.players[1].name} : ${s1} pts\n${state.players[2].name} : ${s2} pts\n\n`;
    
    if(s1 > s2) msg += `VICTOIRE DE ${state.players[1].name.toUpperCase()} ! 🏆`;
    else if(s2 > s1) msg += `VICTOIRE DE ${state.players[2].name.toUpperCase()} ! 🏆`;
    else msg += "ÉGALITÉ PARFAITE !";

    state.gameOver = true;
    elMsg.innerText = "CHAMPIONNAT TERMINÉ";
    elRoll.style.display = 'none';
    alert(msg);
}

elRoll.onclick = () => {
    if(state.gameOver) return;
    
    if(!state.players[state.turn]) {
        console.error("Bug: state.turn invalide. Reset to 1.");
        state.turn = 1;
    }

    state.dice = [Math.ceil(Math.random()*6), Math.ceil(Math.random()*6)];
    state.diceUsed = [false, false];
    state.movedHorses = []; 
    
    updateDiceUI(state.dice[0], state.dice[1], false);
    log(`${state.players[state.turn].name} : [${state.dice[0]}] [${state.dice[1]}]`);
    elRoll.style.display = 'none';
    
    calculateMoves();
};

function calculateMoves() {
    document.getElementById('list-die-0').innerHTML = '';
    document.getElementById('list-die-1').innerHTML = '';
    
    const p = state.players[state.turn];
    let moves = 0;
    
    state.dice.forEach((val, dIdx) => {
        if(state.diceUsed[dIdx]) return;
        
        p.horses.forEach(h => {
            if(state.movedHorses.includes(h.id) || h.status==='finished' || h.status==='dai') return;
            
            let type='', target=-1;
            let penaltyApplied = false;
            let blockedByEnferme = false;

            if(h.id === state.lockedHorseId && h.status === 'racing') {
                let someoneAhead = false;
                for(let pid=1; pid<=state.playerCount; pid++) {
                    state.players[pid].horses.forEach(other => {
                        if(other.status === 'racing' && other.pos > h.pos) someoneAhead = true;
                    });
                }
                if(someoneAhead) blockedByEnferme = true;
            }

            if(!blockedByEnferme) {
                if(h.status === 'stable') {
                    let rawTarget = val;
                    if(checkOvertake(-1, rawTarget)) {
                        rawTarget -= 1; 
                        penaltyApplied = true;
                    }
                    if(rawTarget < 0) rawTarget = 0;
                    target = rawTarget;
                    type = 'SORTIE';
                } 
                else { 
                    let rawTarget = h.pos + val;
                    if(checkOvertake(h.pos, rawTarget)) {
                        rawTarget -= 1; 
                        penaltyApplied = true;
                    }
                    target = rawTarget;
                    if(target >= TRACK_LEN) type='FINISH';
                    else type='MOVE';
                }
            }

            if(isValid(type, target, h, blockedByEnferme)) {
                moves++;
                addChoiceBtn(h, val, dIdx, type, target, p.color, penaltyApplied);
            }
        });
    });

    if(moves===0) {
        let msg = "Aucun mouvement possible.";
        if(state.lockedHorseId) msg += " (Cheval Enfermé)";
        elMsg.innerText = msg;
        if(!state.diceUsed[0] && !state.diceUsed[1]) setTimeout(endTurn, 1500);
        else setTimeout(endTurn, 1000);
    } else {
        elMsg.innerText = "Choisissez une action :";
    }
}

function isValid(type, target, h, blocked) {
    if(blocked) return false;
    if(type === 'SORTIE') return true;
    if((type === 'MOVE' || type === 'FINISH') && target > h.pos) return true;
    return false;
}

function addChoiceBtn(h, val, dIdx, type, target, color, penalty) {
    const container = document.getElementById(`list-die-${dIdx}`);
    if(!container) return; 

    const btn = document.createElement('div');
    btn.className = `choice-item ${color}`;
    
    let txt = "";
    if(type==='SORTIE') txt = `Sortie vers case ${target}`;
    else if(type==='FINISH') txt = '🏁 ARRIVÉE !';
    else txt = `Avance case ${target}`;

    let penaltyHtml = penalty ? `<span class="penalty-tag">Ext (-1)</span>` : '';
    let actionHtml = state.actionSquares.includes(target) ? ` <span class="card-tag">[CARTE]</span>` : '';

    btn.innerHTML = `<span class="die-icon">${val}</span> <b>${h.name}</b> : ${txt} ${penaltyHtml} ${actionHtml}`;
    btn.onclick = () => executeMove(h, target, dIdx, type, val);
    
    container.appendChild(btn);
}

function executeMove(h, target, dIdx, type, dieValue) {
    const oldPosTxt = h.status === 'stable' ? 'Écurie' : `Case ${h.pos}`;

    if(type==='SORTIE') {
        h.status='racing'; h.pos=target;
        log(`${h.name} : ${oldPosTxt} ➝ Case ${target}`);
    } else if(type==='FINISH') {
        h.pos = 999; h.status='finished';
        state.finishedList.push(h.id);
        log(`🏁 ${h.name} termine : ${oldPosTxt} ➝ Arrivée`);
    } else {
        h.pos = target;
        log(`${h.name} : ${oldPosTxt} ➝ Case ${target}`);
    }

    state.diceUsed[dIdx] = true;
    state.movedHorses.push(h.id);
    updateDiceUI(null, null, true);
    renderHorses();

    if(h.status === 'racing' && state.actionSquares.includes(h.pos)) {
        setTimeout(() => drawCard(h, dieValue), 500);
    } else {
        checkEndOfMove();
    }
}

function endTurn() {
    if(state.gameOver) return;
    
    const currentPlayerId = state.turn;
    const isVictimPlaying = state.players[currentPlayerId].horses.some(h => h.id === state.lockedHorseId);
    
    if(isVictimPlaying) {
        state.lockedHorseId = null;
    }

    document.getElementById('list-die-0').innerHTML = '';
    document.getElementById('list-die-1').innerHTML = '';
    
    elRoll.style.display = 'block';
    
    state.turn++;
    if(state.turn > state.playerCount) state.turn = 1;

    updateMalusUI();
    updateTurnIndicator();
    
    updateDiceUI('?', '?', false);
    elMsg.innerText = "À vous !";
    log(`--- Tour ${state.players[state.turn].name} ---`);
}

function updateTurnIndicator() {
    if(!state.players[state.turn]) return;
    const nextName = state.players[state.turn].name;
    elTurnInd.innerText = `TOUR DE ${nextName.toUpperCase()}`;
    elTurnInd.className = `bg-${state.players[state.turn].color}`; // Fix for CSS
}

function updateDiceUI(d1, d2, onlyStyle) {
    if(!onlyStyle) {
        document.getElementById('die-0').innerText = d1;
        document.getElementById('die-1').innerText = d2;
    }
    [0,1].forEach(i => {
        const el = document.getElementById(`die-${i}`);
        el.className = 'die'; 
        if(state.diceUsed[i]) el.classList.add('used');
        else el.classList.add('active'); 
    });
}

function log(t) {
    const d = document.createElement('div');
    d.className = 'log-line'; d.innerText = t;
    elLog.prepend(d); 
}
