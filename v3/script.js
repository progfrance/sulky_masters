// --- CONFIG PISTE ---
const TRACK_LEN = 48;
const COORDS = [];
const CX = 325, CY = 275; 
const RX = 270, RY = 220; 

function initCoords() {
    for(let i=0; i<TRACK_LEN; i++) {
        const angle = (Math.PI / 2) - (i * (2 * Math.PI / TRACK_LEN));
        COORDS.push({
            x: CX + RX * Math.cos(angle) - 22, 
            y: CY + RY * Math.sin(angle) - 22
        });
    }
}
initCoords();

// --- ETAT DU JEU ---
const state = {
    turn: 1, 
    finishedList: [], 
    dice: [0,0], 
    diceUsed: [false, false], 
    movedHorses: [], 
    gameOver: false,
    players: {
        1: { color: 'p1', horses: createTeam('J1', 'p1') },
        2: { color: 'p2', horses: createTeam('J2', 'p2') }
    }
};

function createTeam(name, col) {
    return [1,2,3].map(i => ({ id: `${col}h${i}`, name: `${name}-${i}`, pos: -1, status: 'stable' }));
}

// --- DOM ELEMENTS ---
const elTrack = document.getElementById('track-container');
const elChoices = document.getElementById('choice-list');
const elLog = document.getElementById('log-box');
const elRoll = document.getElementById('btn-roll');
const elMsg = document.getElementById('msg-box');

// --- INITIALISATION ---
function initGame() {
    drawBoard();
    renderHorses();
    log("Bienvenue ! Pénalité seulement si dépassement.");
    log("--- Tour J1 ---");
}

function drawBoard() {
    COORDS.forEach((p, i) => {
        const d = document.createElement('div');
        d.className = 'cell';
        d.style.left = p.x + 'px'; d.style.top = p.y + 'px';
        d.setAttribute('data-idx', i);
        if(i === 0) { d.classList.add('finish-line'); d.innerText = '🏁'; }
        else d.innerText = i;
        elTrack.appendChild(d);
    });
}

function renderHorses() {
    document.querySelectorAll('.horse').forEach(h => h.remove());

    const occupancy = {}; 
    [1,2].forEach(pid => {
        state.players[pid].horses.forEach(h => {
            if(h.status === 'racing') {
                if(!occupancy[h.pos]) occupancy[h.pos] = [];
                occupancy[h.pos].push(h);
            }
        });
    });

    [1,2].forEach(pid => {
        state.players[pid].horses.forEach(h => {
            const el = document.createElement('div');
            el.className = `horse ${state.players[pid].color}`;
            el.innerText = h.name;

            if(h.status === 'stable') {
                el.classList.add('static');
                document.getElementById(`stable-p${pid}`).appendChild(el);
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
                let offsetX = 0;
                let offsetY = 0;
                
                if (stack && stack.length > 1) {
                    if (stack.length === 2) {
                        offsetX = indexInStack === 0 ? -8 : 8;
                        offsetY = indexInStack === 0 ? -5 : 5;
                    } else {
                        offsetX = (indexInStack * 6) - 6;
                    }
                }

                el.style.left = (c.x + offsetX) + 'px'; 
                el.style.top = (c.y + offsetY) + 'px';
                elTrack.appendChild(el);
            }
        });
    });
    
    // Scores
    const p1Score = state.players[1].horses.filter(h=>h.status==='finished').length;
    const p2Score = state.players[2].horses.filter(h=>h.status==='finished').length;
    document.getElementById('score-p1').innerText = p1Score;
    document.getElementById('score-p2').innerText = p2Score;
}

// --- LOGIQUE METIER ---

function isSquareOccupied(idx) {
    let occ = false;
    [1,2].forEach(pid => {
        state.players[pid].horses.forEach(h => {
            if(h.status === 'racing' && h.pos === idx) occ = true;
        });
    });
    return occ;
}

// NOUVELLE FONCTION : Vérifie le dépassement seulement
// On regarde STRICTEMENT entre from et to (exclus)
// Si 'to' est occupé, ce n'est pas grave (mise à hauteur)
function checkOvertake(from, to) {
    // i commence à from + 1
    // i s'arrête AVANT to (i < to)
    for(let i = from + 1; i < to; i++) {
        if(i >= TRACK_LEN) break; 
        if(isSquareOccupied(i)) return true;
    }
    return false;
}

function checkGameOver() {
    if(state.finishedList.length >= 3) {
        state.gameOver = true;
        elMsg.innerText = "PODIUM COMPLET !";
        elRoll.style.display = 'none';
        setTimeout(() => alert("Le Podium est rempli !\nLa course est terminée."), 100);
    }
}

// --- GESTION DU TOUR ---

elRoll.onclick = () => {
    if(state.gameOver) return;
    
    state.dice = [Math.ceil(Math.random()*6), Math.ceil(Math.random()*6)];
    state.diceUsed = [false, false];
    state.movedHorses = []; 
    
    updateDiceUI(state.dice[0], state.dice[1], false);
    log(`J${state.turn} lance [${state.dice[0]}] [${state.dice[1]}]`);
    elRoll.style.display = 'none';
    
    calculateMoves();
};

function calculateMoves() {
    elChoices.innerHTML = '';
    const p = state.players[state.turn];
    let moves = 0;

    state.dice.forEach((val, dIdx) => {
        if(state.diceUsed[dIdx]) return;
        document.getElementById(`die-${dIdx}`).classList.add('active');

        p.horses.forEach(h => {
            if(state.movedHorses.includes(h.id) || h.status==='finished') return;
            
            let type='', target=-1;
            let penaltyApplied = false;

            // CAS 1: SORTIE
            if(h.status === 'stable') {
                let rawTarget = val; // Sortie directe à la case du dé
                
                // On vérifie le dépassement depuis l'écurie (-1) jusqu'à la cible
                // Si la cible est occupée, pas de pénalité (on se met à côté)
                if(checkOvertake(-1, rawTarget)) {
                    rawTarget -= 1; 
                    penaltyApplied = true;
                }

                if(rawTarget < 0) rawTarget = 0; // Sécurité

                target = rawTarget;
                type = 'SORTIE';
            } 
            // CAS 2: COURSE
            else { 
                let rawTarget = h.pos + val;
                
                // On vérifie seulement s'il y a quelqu'un ENTRE le départ et l'arrivée
                if(checkOvertake(h.pos, rawTarget)) {
                    rawTarget -= 1; 
                    penaltyApplied = true;
                }
                
                target = rawTarget;
                
                if(target >= TRACK_LEN) type='FINISH';
                else type='MOVE';
            }

            // Validation
            let isValid = false;
            if(type === 'SORTIE') isValid = true;
            if((type === 'MOVE' || type === 'FINISH') && target > h.pos) isValid = true;

            if(isValid) {
                moves++;
                addChoiceBtn(h, val, dIdx, type, target, p.color, penaltyApplied);
            }
        });
    });

    if(moves===0) {
        elMsg.innerText = "Aucun mouvement possible.";
        if(!state.diceUsed[0] && !state.diceUsed[1]) setTimeout(endTurn, 1500);
        else setTimeout(endTurn, 1000);
    } else {
        elMsg.innerText = "Choisissez une action :";
    }
}

function addChoiceBtn(h, val, dIdx, type, target, color, penalty) {
    const btn = document.createElement('div');
    btn.className = `choice-item ${color}`;
    
    let txt = "";
    if(type==='SORTIE') txt = `Sortie vers case ${target}`;
    else if(type==='FINISH') txt = '🏁 LIGNE D\'ARRIVÉE !';
    else txt = `Avance case ${target}`;

    let penaltyHtml = penalty ? `<span class="penalty-tag">Extérieur (-1)</span>` : '';

    btn.innerHTML = `<span class="die-icon">${val}</span> <b>${h.name}</b> : ${txt} ${penaltyHtml}`;
    btn.onclick = () => executeMove(h, target, dIdx, type);
    elChoices.appendChild(btn);
}

function executeMove(h, target, dIdx, type) {
    if(type==='SORTIE') {
        h.status='racing'; h.pos=target;
        log(`${h.name} sort de l'écurie (Case ${target})`);
    } else if(type==='FINISH') {
        h.pos = 999; h.status='finished';
        state.finishedList.push(h.id);
        log(`🏁 ${h.name} termine la course !`);
    } else {
        h.pos = target;
        log(`${h.name} avance case ${target}`);
    }

    state.diceUsed[dIdx] = true;
    state.movedHorses.push(h.id);
    
    updateDiceUI(null, null, true);
    renderHorses();
    
    if(state.finishedList.length >= 3) {
        checkGameOver();
        return;
    }

    if(state.diceUsed[0] && state.diceUsed[1]) {
        setTimeout(endTurn, 1000);
    } else {
        setTimeout(calculateMoves, 300);
    }
}

function endTurn() {
    if(state.gameOver) return;
    elChoices.innerHTML = '';
    elRoll.style.display = 'block';
    
    state.turn = state.turn===1 ? 2 : 1;
    
    const ui = document.getElementById('turn-indicator');
    ui.innerText = `TOUR JOUEUR ${state.turn}`;
    ui.className = state.turn===1 ? 'bg-p1' : 'bg-p2';
    
    updateDiceUI('?', '?', false);
    elMsg.innerText = "À vous !";
    log(`--- Tour J${state.turn} ---`);
}

function updateDiceUI(d1, d2, onlyStyle) {
    if(!onlyStyle) {
        document.getElementById('die-0').innerText = d1;
        document.getElementById('die-1').innerText = d2;
    }
    [0,1].forEach(i => {
        const el = document.getElementById(`die-${i}`);
        el.className = `die ${state.diceUsed[i] ? 'used' : ''}`;
        if(!state.diceUsed[i]) el.classList.remove('active'); 
    });
}

function log(t) {
    const d = document.createElement('div');
    d.className = 'log-line'; d.innerText = t;
    elLog.prepend(d); 
}

// Start
initGame();
