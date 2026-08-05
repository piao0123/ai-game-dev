const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let width = window.innerWidth;
let height = window.innerHeight;

// --- 武器系统 ---
const WEAPONS = {
    RIFLE:   { id: 1, name: "RIFLE",   range: 600, cooldown: 12, damage: 35, speed: 16, radius: 3.5, type: 'bullet' },
    PISTOL:  { id: 2, name: "PISTOL",  range: 350, cooldown: 18, damage: 50, speed: 14, radius: 4.0, type: 'bullet' },
    SNIPER:  { id: 3, name: "SNIPER",  range: 1100,cooldown: 55, damage: 130,speed: 26, radius: 3.0, type: 'bullet' },
    SMG:     { id: 4, name: "SMG",     range: 320, cooldown: 5,  damage: 20, speed: 17, radius: 2.8, type: 'bullet' },
    GRENADE: { id: 5, name: "GRENADE", range: 380, cooldown: 75, damage: 120,speed: 9,  radius: 6.0, type: 'grenade', blastRadius: 110 }
};

let currentWeapon = WEAPONS.RIFLE;
let unlockedWeapons = [WEAPONS.RIFLE.id];

let shootCooldownTimer = 0;

let wave = 1;
let killCount = 0;
let isGameOver = false;
let waveTransitionTimer = 0;
let gateAlarmCooldown = 0;

const player = { 
    x: 100, y: 350, angle: 0, speed: 3.8, walkCycle: 0, 
    flashTimer: 0, hp: 100, maxHp: 100,
    shield: 100, maxShield: 100, shieldActive: false,
    fov: Math.PI / 2.2, viewDistance: 500
};

let blindActive = false;
let blindEnergy = 100;
const MAX_BLIND_ENERGY = 100;
const BLIND_CONSUME_RATE = 0.20; 
const BLIND_RECOVER_RATE = 0.12; 
let blindZone = null;

const mouse = { x: width / 2, y: height / 2 };
const keys = {};

const playerBullets = [];
const grenades = [];
const enemyBullets = [];
const particles = [];
const dropItems = []; 

let obstacles = [];
let securityGates = [];
let zones = [];
let props = [];
let waypoints = [];
let cameras = [];
let enemies = [];

function initMapLayout() {
    levelManager.loadCurrentLevel();
}

function resizeCanvas() {
    width = window.innerWidth; height = window.innerHeight;
    canvas.width = width; canvas.height = height;
    initMapLayout();
}
window.addEventListener('resize', resizeCanvas);

function getRayIntersection(ray, segment) {
    const r_px = ray.x, r_py = ray.y, r_dx = ray.dx, r_dy = ray.dy;
    const s_px = segment.x1, s_py = segment.y1, s_dx = segment.x2 - segment.x1, s_dy = segment.y2 - segment.y1;

    const r_mag = Math.sqrt(r_dx * r_dx + r_dy * r_dy);
    const s_mag = Math.sqrt(s_dx * s_dx + s_dy * s_dy);

    if (r_dx / r_mag === s_dx / s_mag && r_dy / r_mag === s_dy / s_mag) return null;

    const T2 = (r_dx * (s_py - r_py) + r_dy * (r_px - s_px)) / (s_dx * r_dy - s_dy * r_dx);
    const T1 = (s_px + s_dx * T2 - r_px) / r_dx;

    if (T1 < 0 || T2 < 0 || T2 > 1) return null;
    return { x: r_px + r_dx * T1, y: r_py + r_dy * T1, param: T1 };
}

function getVisionBlockingSegments() {
    const segments = [];
    obstacles.forEach(obs => {
        if (obs.type === 'solid') {
            segments.push(
                { x1: obs.x, y1: obs.y, x2: obs.x + obs.w, y2: obs.y },
                { x1: obs.x + obs.w, y1: obs.y, x2: obs.x + obs.w, y2: obs.y + obs.h },
                { x1: obs.x + obs.w, y1: obs.y + obs.h, x2: obs.x, y2: obs.y + obs.h },
                { x1: obs.x, y1: obs.y + obs.h, x2: obs.x, y2: obs.y }
            );
        }
    });
    return segments;
}

function drawTacticalFOV(x, y, angle, fovAngle, maxDist, fillColor, strokeColor) {
    const segments = getVisionBlockingSegments();
    const rayCount = 100;
    const startAngle = angle - fovAngle / 2;
    const step = fovAngle / rayCount;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, y);

    for (let i = 0; i <= rayCount; i++) {
        const a = startAngle + step * i;
        const ray = { x: x, y: y, dx: Math.cos(a) * maxDist, dy: Math.sin(a) * maxDist };

        let closestHit = null;
        let minParam = 1;

        segments.forEach(seg => {
            const hit = getRayIntersection(ray, seg);
            if (hit && hit.param < minParam) {
                minParam = hit.param;
                closestHit = hit;
            }
        });

        const targetX = closestHit ? closestHit.x : x + ray.dx;
        const targetY = closestHit ? closestHit.y : y + ray.dy;
        ctx.lineTo(targetX, targetY);
    }

    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
    if (strokeColor) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1;
        ctx.stroke();
    }
    ctx.restore();
}

function checkObstacleCollision(x, y, radius) {
    for (let obs of obstacles) {
        if (x > obs.x - radius && x < obs.x + obs.w + radius && y > obs.y - radius && y < obs.y + obs.h + radius) {
            return true;
        }
    }
    for (let p of props) {
        if (p.w && p.h) {
            if (x > p.x - radius && x < p.x + p.w + radius && y > p.y - radius && y < p.y + p.h + radius) {
                return true;
            }
        }
    }
    return false;
}

function checkLineObstacleIntersection(x1, y1, x2, y2) {
    for (let obs of obstacles) {
        if (lineIntersectsRect(x1, y1, x2, y2, obs)) return obs;
    }
    return null;
}

function lineIntersectsRect(x1, y1, x2, y2, rect) {
    const minX = rect.x, maxX = rect.x + rect.w;
    const minY = rect.y, maxY = rect.y + rect.h;
    if ((x1 < minX && x2 < minX) || (x1 > maxX && x2 > maxX)) return false;
    if ((y1 < minY && y2 < minY) || (y1 > maxY && y2 > maxY)) return false;
    return true;
}

function canSee(fromX, fromY, toX, toY) {
    for (let obs of obstacles) {
        if (obs.type === 'solid') {
            if (lineIntersectsRect(fromX, fromY, toX, toY, obs)) return false;
        }
    }
    return true;
}

function isInFOV(target) {
    if (!target) return false;
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const dist = Math.hypot(dx, dy);

    // 1. 超出最大视角距离不可见
    if (dist > player.viewDistance) return false;

    // 2. 判断是否在玩家视野弧度扇形内
    const targetAngle = Math.atan2(dy, dx);
    let angleDiff = targetAngle - player.angle;

    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

    if (Math.abs(angleDiff) > player.fov / 2) return false;

    // 3. 检查是否有障碍物遮挡 (利用你原本的 canSee 函数)
    return canSee(player.x, player.y, target.x, target.y);
}

function triggerGlobalAlarm() {
    document.getElementById('alarm-banner').style.display = 'block';
    enemies.forEach(e => {
        if (e.hp > 0 && e.spawnGraceTimer <= 0) {
            e.alert = true;
            e.alertCooldown = 300; 
        }
    });
}

function spawnWave() {
    enemies = [];
    const count = 2 + wave;
    for (let i = 0; i < count; i++) {
        let spawnX, spawnY, valid = false, attempts = 0;
        while (!valid && attempts < 150) {
            attempts++;
            spawnX = width * 0.35 + Math.random() * (width * 0.55);
            spawnY = 80 + Math.random() * (height - 160);
            if (Math.hypot(spawnX - player.x, spawnY - player.y) > 350 && !checkObstacleCollision(spawnX, spawnY, 20)) {
                valid = true;
            }
        }

        const isShieldObserver = wave >= 2 && (Math.random() < 0.4 || i === 0);

        enemies.push({
            id: i, x: spawnX, y: spawnY, angle: Math.PI, hp: 100, maxHp: 100,
            isObserver: isShieldObserver,
            shield: isShieldObserver ? 80 : 0, maxShield: isShieldObserver ? 80 : 0,
            alert: false, alertCooldown: 0,
            pendingDamage: 0,
            targetWaypoint: waypoints.length > 0 ? Math.floor(Math.random() * waypoints.length) : 0,
            stuckFrames: 0, 
            spawnGraceTimer: 100,
            confusedTimer: 0, confusedAngle: 0,
            patrolSpeed: 1.0 + Math.random() * 0.3, walkCycle: 0, hitTimer: 0, scanAngle: Math.random() * 6, shootCooldown: 0,
            deathAlpha: 1.0
        });
    }
    addLog(`WAVE ${wave} INITIATED. ${count} HOSTILES DETECTED.`);
}

window.addEventListener('keydown', e => { 
    if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); toggleBlindZone(); }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        e.preventDefault();
        if (player.shield > 10) player.shieldActive = !player.shieldActive;
    }
    if (e.code === 'Digit1' && unlockedWeapons.includes(WEAPONS.RIFLE.id)) switchWeapon(WEAPONS.RIFLE);
    if (e.code === 'Digit2' && unlockedWeapons.includes(WEAPONS.PISTOL.id)) switchWeapon(WEAPONS.PISTOL);
    if (e.code === 'Digit3' && unlockedWeapons.includes(WEAPONS.SNIPER.id)) switchWeapon(WEAPONS.SNIPER);
    if (e.code === 'Digit4' && unlockedWeapons.includes(WEAPONS.SMG.id)) switchWeapon(WEAPONS.SMG);
    if (e.code === 'Digit5' && unlockedWeapons.includes(WEAPONS.GRENADE.id)) switchWeapon(WEAPONS.GRENADE);

    if (e.code === 'KeyR' || e.key === 'r') { if(isGameOver) resetGame(); }
    keys[e.code] = true; keys[e.key.toLowerCase()] = true;
});

window.addEventListener('keyup', e => { keys[e.code] = false; keys[e.key.toLowerCase()] = false; });
canvas.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
canvas.addEventListener('mousedown', e => { if (e.button === 0) shoot(); });

function switchWeapon(wp) {
    currentWeapon = wp;
    addLog(`EQUIPPED: ${wp.name}`);
}

function addLog(text) {
    const log = document.getElementById('log-panel');
    const line = document.createElement('div');
    line.innerText = "> " + text;
    log.appendChild(line);
    if(log.children.length > 5) log.removeChild(log.children[0]);
}

function createExplosion(x, y, count = 15, color = null) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 4.5;
        particles.push({
            x: x, y: y,
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            life: 25 + Math.random() * 15, maxLife: 40,
            color: color || (Math.random() > 0.3 ? '#FF3344' : '#00FF66')
        });
    }
}

function spawnDropItem(x, y) {
    const rand = Math.random();
    if (rand < 0.7) { 
        if (rand < 0.25) {
            dropItems.push({ x, y, type: 'medkit', timer: 700 });
        } else if (rand < 0.50) {
            dropItems.push({ x, y, type: 'battery', timer: 700 });
        } else {
            const allWps = [WEAPONS.PISTOL, WEAPONS.SNIPER, WEAPONS.SMG, WEAPONS.GRENADE];
            const lockedWps = allWps.filter(w => !unlockedWeapons.includes(w.id));
            const wpToDrop = lockedWps.length > 0 ? lockedWps[Math.floor(Math.random() * lockedWps.length)] : allWps[Math.floor(Math.random() * allWps.length)];
            dropItems.push({ x, y, type: 'weapon', weaponData: wpToDrop, timer: 700 });
        }
    }
}

function toggleBlindZone() {
    if (player.hp <= 0 || isGameOver) return;
    if (!blindActive) {
        if (blindEnergy >= 15) {
            blindActive = true;
            blindZone = { x: player.x, y: player.y, radius: 240 };
            addLog("BLIND ZONE ACTIVATED.");
        } else {
            addLog("ENERGY TOO LOW TO ACTIVATE!");
        }
    } else {
        closeBlindZone("MANUAL DEACTIVATION");
    }
}

function closeBlindZone(reason = "COLLAPSED") {
    if (!blindActive) return;
    blindActive = false;
    blindZone = null;
    addLog(`BLIND ZONE DEACTIVATED (${reason}).`);
    
    enemies.forEach(e => {
        if (e.pendingDamage > 0) {
            applyDamageToEnemy(e, e.pendingDamage);
            e.pendingDamage = 0; e.alert = true; e.alertCooldown = 300; e.hitTimer = 8;
            createExplosion(e.x, e.y, 20);
        }
    });
}

function applyDamageToEnemy(enemy, amount) {
    if (enemy.shield > 0) {
        if (enemy.shield >= amount) {
            enemy.shield -= amount;
            createExplosion(enemy.x, enemy.y, 6, '#00CCFF');
            return;
        } else {
            const overflow = amount - enemy.shield;
            enemy.shield = 0;
            enemy.hp -= overflow;
            createExplosion(enemy.x, enemy.y, 10, '#00CCFF');
        }
    } else {
        enemy.hp -= amount;
    }

    if (enemy.hp <= 0) {
        killCount++;
        createExplosion(enemy.x, enemy.y, 18);
        spawnDropItem(enemy.x, enemy.y);
    }
}

function inBlindZone(x, y) {
    if (!blindActive || !blindZone) return false;
    const dx = x - blindZone.x, dy = y - blindZone.y;
    return (dx*dx + dy*dy) <= blindZone.radius * blindZone.radius;
}

function shoot() {
    if (player.hp <= 0 || isGameOver || shootCooldownTimer > 0) return;
    
    shootCooldownTimer = currentWeapon.cooldown;
    player.flashTimer = 3;
    const angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);

    if (currentWeapon.type === 'grenade') {
        grenades.push({
            x: player.x, y: player.y,
            targetX: mouse.x, targetY: mouse.y,
            startX: player.x, startY: player.y,
            vx: Math.cos(angle) * currentWeapon.speed,
            vy: Math.sin(angle) * currentWeapon.speed,
            traveled: 0,
            maxDist: Math.min(currentWeapon.range, Math.hypot(mouse.x - player.x, mouse.y - player.y)),
            damage: currentWeapon.damage,
            blastRadius: currentWeapon.blastRadius
        });
    } else {
        playerBullets.push({
            x: player.x + Math.cos(angle) * 24,
            y: player.y + Math.sin(angle) * 24,
            startX: player.x, startY: player.y,
            vx: Math.cos(angle) * currentWeapon.speed,
            vy: Math.sin(angle) * currentWeapon.speed,
            traveled: 0,
            maxRange: currentWeapon.range,
            damage: currentWeapon.damage,
            radius: currentWeapon.radius,
            penetrations: 1
        });
    }

    if (inBlindZone(player.x, player.y)) {
        enemies.forEach(e => {
            if (!inBlindZone(e.x, e.y) && !e.alert && Math.hypot(e.x - player.x, e.y - player.y) < 450) {
                e.confusedTimer = 60;
            }
        });
    }
}

function triggerGameOver(success) {
    isGameOver = true;
    const screen = document.getElementById('game-over-screen');
    const title = document.getElementById('over-title');
    const desc = document.getElementById('over-desc');
    screen.style.display = 'flex';
    if(success) {
        title.innerText = "SECTOR CLEARED"; title.style.color = "#00FF66";
        desc.innerText = `AIRPORT CLEARED. TOTAL KILLS: ${killCount}`;
    } else {
        title.innerText = "MISSION FAILED"; title.style.color = "#FF3344";
        desc.innerText = `OPERATIVE KILLED AT WAVE ${wave}. TOTAL KILLS: ${killCount}`;
    }
}

function resetGame() {
    wave = 1; killCount = 0; isGameOver = false; gateAlarmCooldown = 0;
    unlockedWeapons = [WEAPONS.RIFLE.id];
    currentWeapon = WEAPONS.RIFLE;
    document.getElementById('alarm-banner').style.display = 'none';
    player.hp = 100; player.shield = 100; player.shieldActive = false;
    
    blindActive = false; blindEnergy = MAX_BLIND_ENERGY; blindZone = null;
    playerBullets.length = 0; grenades.length = 0; enemyBullets.length = 0; particles.length = 0; dropItems.length = 0;
    document.getElementById('game-over-screen').style.display = 'none';

    initMapLayout();
    spawnWave();
}

function update() {
    if (isGameOver) return;
    if (shootCooldownTimer > 0) shootCooldownTimer--;
    if (gateAlarmCooldown > 0) gateAlarmCooldown--;

    let moveSpeed = player.shieldActive ? player.speed * 0.65 : player.speed;
    let dx = 0, dy = 0;
    if (keys['KeyW'] || keys['w'] || keys['ArrowUp']) dy -= 1;
    if (keys['KeyS'] || keys['s'] || keys['ArrowDown']) dy += 1;
    if (keys['KeyA'] || keys['a'] || keys['ArrowLeft']) dx -= 1;
    if (keys['KeyD'] || keys['d'] || keys['ArrowRight']) dx += 1;
    
    if (dx !== 0 || dy !== 0) {
        if (dx !== 0 && dy !== 0) { dx *= 0.7071; dy *= 0.7071; }
        player.walkCycle += 0.22;
    } else { player.walkCycle = 0; }
    
    let nextX = player.x + dx * moveSpeed;
    let nextY = player.y + dy * moveSpeed;
    if (!checkObstacleCollision(nextX, nextY, 18)) {
        player.x = Math.max(20, Math.min(width - 20, nextX));
        player.y = Math.max(20, Math.min(height - 20, nextY));
    }
    player.angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    if (player.flashTimer > 0) player.flashTimer--;

    if (gateAlarmCooldown <= 0) {
        securityGates.forEach(gate => {
            if (player.x > gate.x - 12 && player.x < gate.x + gate.w + 12 &&
                player.y > gate.y && player.y < gate.y + gate.h) {
                triggerGlobalAlarm();
                gateAlarmCooldown = 120;
                addLog("SECURITY GATE BREACHED! ALARM ACTIVATED!");
                createExplosion(player.x, player.y, 8, '#FF3344');
            }
        });
    }

    if (player.shieldActive) {
        player.shield = Math.max(0, player.shield - 0.15);
        if (player.shield <= 0) player.shieldActive = false;
    } else {
        player.shield = Math.min(player.maxShield, player.shield + 0.08);
    }
    
    if (blindActive) {
        blindEnergy = Math.max(0, blindEnergy - BLIND_CONSUME_RATE);
        if (blindEnergy <= 0) closeBlindZone("ENERGY DEPLETED");
    } else {
        blindEnergy = Math.min(MAX_BLIND_ENERGY, blindEnergy + BLIND_RECOVER_RATE);
    }

    for (let i = dropItems.length - 1; i >= 0; i--) {
        let item = dropItems[i];
        item.timer--;
        if (item.timer <= 0) { dropItems.splice(i, 1); continue; }
        if (Math.hypot(player.x - item.x, player.y - item.y) < 28) {
            if (item.type === 'medkit') {
                player.hp = Math.min(player.maxHp, player.hp + 35);
                addLog("RECOVERED MEDKIT (+35 VITALS)");
                createExplosion(player.x, player.y, 10, '#00FF66');
            } else if (item.type === 'battery') {
                player.shield = Math.min(player.maxShield, player.shield + 50);
                blindEnergy = Math.min(MAX_BLIND_ENERGY, blindEnergy + 40);
                addLog("RECOVERED BATTERY (+50 SHIELD / +40 ENERGY)");
                createExplosion(player.x, player.y, 10, '#00CCFF');
            } else if (item.type === 'weapon') {
                const wp = item.weaponData;
                if (!unlockedWeapons.includes(wp.id)) {
                    unlockedWeapons.push(wp.id);
                    addLog(`UNLOCKED NEW WEAPON: [${wp.name}]!`);
                } else {
                    addLog(`PICKED UP: [${wp.name}]`);
                }
                switchWeapon(wp);
                createExplosion(player.x, player.y, 12, '#FFFF00');
            }
            dropItems.splice(i, 1);
        }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx; p.y += p.vy;
        p.life--;
        if (p.life <= 0) particles.splice(i, 1);
    }
    
    for (let i = grenades.length - 1; i >= 0; i--) {
        let g = grenades[i];
        let nextGPointX = g.x + g.vx;
        let nextGPointY = g.y + g.vy;

        let hitObs = checkLineObstacleIntersection(g.x, g.y, nextGPointX, nextGPointY);
        if (hitObs && (hitObs.type === 'solid' || hitObs.type === 'glass')) {
            g.traveled = g.maxDist;
        } else {
            g.x = nextGPointX; g.y = nextGPointY;
            g.traveled += Math.hypot(g.vx, g.vy);
        }

        if (g.traveled >= g.maxDist) {
            createExplosion(g.x, g.y, 35, '#FF5500');
            enemies.forEach(e => {
                if (e.hp <= 0) return;
                const d = Math.hypot(e.x - g.x, e.y - g.y);
                if (d <= g.blastRadius) {
                    const dmg = Math.floor(g.damage * (1 - d / g.blastRadius * 0.4));
                    if (inBlindZone(e.x, e.y)) {
                        e.pendingDamage += dmg;
                    } else {
                        applyDamageToEnemy(e, dmg);
                        e.alert = true; e.alertCooldown = 300; e.hitTimer = 6;
                    }
                }
            });
            grenades.splice(i, 1);
        }
    }

    for (let i = playerBullets.length - 1; i >= 0; i--) {
        let b = playerBullets[i];
        let nextBX = b.x + b.vx;
        let nextBY = b.y + b.vy;

        let hitObs = checkLineObstacleIntersection(b.x, b.y, nextBX, nextBY);
        if (hitObs) {
            if (hitObs.type === 'glass' && b.penetrations > 0) {
                b.penetrations--;
                b.damage *= 0.65;
                createExplosion(nextBX, nextBY, 4, '#00CCFF');
                b.x = nextBX; b.y = nextBY;
            } else {
                playerBullets.splice(i, 1); continue;
            }
        } else {
            b.x = nextBX; b.y = nextBY;
        }

        b.traveled += Math.hypot(b.vx, b.vy);

        if (b.traveled >= b.maxRange || b.x < 0 || b.x > width || b.y < 0 || b.y > height) {
            playerBullets.splice(i, 1); continue;
        }
        for (let e of enemies) {
            if (e.hp <= 0) continue;
            if (Math.hypot(b.x - e.x, b.y - e.y) < 22) {
                if (inBlindZone(e.x, e.y)) {
                    e.pendingDamage += b.damage;
                } else {
                    applyDamageToEnemy(e, b.damage);
                    e.hitTimer = 6;
                    if (inBlindZone(player.x, player.y) && !e.isObserver) {
                        e.confusedTimer = 80;
                    } else {
                        e.alert = true; e.alertCooldown = 300;
                    }
                }
                playerBullets.splice(i, 1); break;
            }
        }
    }

    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        let eb = enemyBullets[i];
        let nextEBX = eb.x + eb.vx;
        let nextEBY = eb.y + eb.vy;

        let hitObs = checkLineObstacleIntersection(eb.x, eb.y, nextEBX, nextEBY);
        if (hitObs) {
            if (hitObs.type === 'glass' && eb.penetrations > 0) {
                eb.penetrations--;
                eb.x = nextEBX; eb.y = nextEBY;
            } else {
                enemyBullets.splice(i, 1); continue;
            }
        } else {
            eb.x = nextEBX; eb.y = nextEBY;
        }

        if (eb.x < 0 || eb.x > width || eb.y < 0 || eb.y > height) {
            enemyBullets.splice(i, 1); continue;
        }
        if (Math.hypot(eb.x - player.x, eb.y - player.y) < 20) {
            if (player.shieldActive && player.shield > 0) {
                player.shield = Math.max(0, player.shield - 15);
                player.hp = Math.max(0, player.hp - 3);
                createExplosion(eb.x, eb.y, 6, '#00CCFF');
            } else {
                player.hp = Math.max(0, player.hp - 12);
                createExplosion(eb.x, eb.y, 6, '#FF3344');
            }
            enemyBullets.splice(i, 1);
            if (player.hp <= 0) { triggerGameOver(false); return; }
        }
    }
    
    let anyCameraDetecting = false;
    cameras.forEach(cam => {
        cam.sweepTimer += cam.sweepSpeed;
        cam.currentAngle = cam.baseAngle + Math.sin(cam.sweepTimer) * cam.sweepRange;
        
        let inSight = false;
        if (!inBlindZone(player.x, player.y) && player.hp > 0) {
            const pdx = player.x - cam.x;
            const pdy = player.y - cam.y;
            const dist = Math.hypot(pdx, pdy);
            
            if (dist < 320) {
                const angleToPlayer = Math.atan2(pdy, pdx);
                let diff = angleToPlayer - cam.currentAngle;
                diff = Math.atan2(Math.sin(diff), Math.cos(diff));

                if (Math.abs(diff) < 0.45 && canSee(cam.x, cam.y, player.x, player.y)) {
                    inSight = true;
                }
            }
        }

        if (inSight) {
            cam.detecting = true;
            cam.cooldownTimer = 180;
            triggerGlobalAlarm();
        } else {
            if (cam.cooldownTimer > 0) {
                cam.cooldownTimer--;
            } else {
                cam.detecting = false;
            }
        }

        if (cam.detecting) anyCameraDetecting = true;
    });

    if (!anyCameraDetecting && gateAlarmCooldown <= 0) {
        document.getElementById('alarm-banner').style.display = 'none';
    }
    
    let aliveCount = 0;
    enemies.forEach(e => {
        if (e.hp <= 0) {
            if (e.deathAlpha > 0) e.deathAlpha -= 0.08;
            return;
        }
        aliveCount++;
        if (e.hitTimer > 0) e.hitTimer--;
        if (e.shootCooldown > 0) e.shootCooldown--;
        if (e.spawnGraceTimer > 0) e.spawnGraceTimer--;

        const inZone = inBlindZone(e.x, e.y);
        if (inZone && !e.isObserver) {
            if (Math.random() < 0.1) e.confusedAngle = e.angle + (Math.random() - 0.5) * 2.2;
            e.angle += (e.confusedAngle - e.angle) * 0.12;
            return;
        }

        if (e.confusedTimer > 0 && !e.isObserver) {
            e.confusedTimer--;
            return;
        }
        
        const pdx = player.x - e.x, pdy = player.y - e.y;
        const dist = Math.hypot(pdx, pdy);
        const visible = canSee(e.x, e.y, player.x, player.y);
        const playerIsHidden = inBlindZone(player.x, player.y) && !e.isObserver;

        if (e.spawnGraceTimer <= 0 && dist < 280 && visible && !playerIsHidden) {
            e.alert = true;
            e.alertCooldown = 300; 
        }
        
        if (e.alert) {
            if (!visible || playerIsHidden) {
                e.alertCooldown--;
                if (e.alertCooldown <= 0) {
                    e.alert = false;
                }
            }
        }

        if (e.alert && !playerIsHidden && e.spawnGraceTimer <= 0) {
            e.angle = Math.atan2(pdy, pdx);
            
            let moveSpeed = 1.5;
            let moveAngle = e.angle;
            
            const stopDistance = 45;
            let moved = false;

            if (dist > stopDistance) {
                let eNextX = e.x + Math.cos(moveAngle) * moveSpeed;
                let eNextY = e.y + Math.sin(moveAngle) * moveSpeed;

                if (!checkObstacleCollision(eNextX, e.y, 16)) { e.x = eNextX; moved = true; }
                if (!checkObstacleCollision(e.x, eNextY, 16)) { e.y = eNextY; moved = true; }

                if (!moved) {
                    let altAngle = moveAngle + Math.PI / 2;
                    let altX = e.x + Math.cos(altAngle) * moveSpeed;
                    let altY = e.y + Math.sin(altAngle) * moveSpeed;
                    if (!checkObstacleCollision(altX, altY, 16)) {
                        e.x = altX; e.y = altY; moved = true;
                    }
                }
            }

            if (moved) e.walkCycle += 0.15;

            if (visible && e.shootCooldown <= 0) {
                e.shootCooldown = Math.max(38, 60 - wave * 2);
                enemyBullets.push({
                    x: e.x + Math.cos(e.angle) * 20, y: e.y + Math.sin(e.angle) * 20,
                    vx: Math.cos(e.angle) * 8.5, vy: Math.sin(e.angle) * 8.5,
                    penetrations: 1
                });
            }
        } else if (waypoints.length > 0) {
            const target = waypoints[e.targetWaypoint];
            const tdx = target.x - e.x, tdy = target.y - e.y;
            if (Math.hypot(tdx, tdy) < 15) {
                let nextIndex;
                do { nextIndex = Math.floor(Math.random() * waypoints.length); } while(nextIndex === e.targetWaypoint && waypoints.length > 1);
                e.targetWaypoint = nextIndex;
                e.stuckFrames = 0;
            } else {
                const moveAngle = Math.atan2(tdy, tdx);
                e.scanAngle += 0.02;
                e.angle = moveAngle + Math.sin(e.scanAngle) * 0.2;
                let pNextX = e.x + Math.cos(moveAngle) * e.patrolSpeed;
                let pNextY = e.y + Math.sin(moveAngle) * e.patrolSpeed;
                if (!checkObstacleCollision(pNextX, pNextY, 16)) {
                    e.x = pNextX; e.y = pNextY; e.walkCycle += 0.1; e.stuckFrames = 0;
                } else {
                    e.stuckFrames++;
                    if (e.stuckFrames > 30) {
                        e.targetWaypoint = (e.targetWaypoint + 1) % waypoints.length;
                        e.stuckFrames = 0;
                    }
                }
            }
        }
    });

    if (aliveCount === 0) {
        waveTransitionTimer++;
        if (waveTransitionTimer > 80) {
            wave++; waveTransitionTimer = 0;
            spawnWave();
        }
    }

    document.getElementById('player-hp-bar').style.width = (player.hp / player.maxHp * 100) + '%';
    document.getElementById('player-shield-bar').style.width = (player.shield / player.maxShield * 100) + '%';
    document.getElementById('blind-energy-bar').style.width = (blindEnergy / MAX_BLIND_ENERGY * 100) + '%';
    
    const label = document.getElementById('blind-label');
    if (blindActive) {
        label.innerText = "BLIND ZONE ACTIVE // 盲区维持中 [SPACE关闭]";
        label.style.color = "#FF3344";
    } else {
        label.innerText = "BLIND ENERGY // 盲区能量 [SPACE开启]";
        label.style.color = "#00FF66";
    }

    document.getElementById('wave-title').innerText = `WAVE: ${wave}`;
    document.getElementById('enemies-left').innerText = aliveCount > 0 ? `HOSTILES: ${aliveCount}` : `NEXT WAVE INCOMING...`;
    document.getElementById('score-count').innerText = `KILLS: ${killCount}`;
}

function drawZones() {
    zones.forEach(z => {
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 255, 102, 0.08)';
        ctx.strokeRect(z.x, z.y, z.w, z.h);
        ctx.fillStyle = 'rgba(0, 255, 102, 0.35)';
        ctx.font = 'bold 10px monospace';
        ctx.fillText(z.name, z.x + 8, z.y + 16);
        ctx.restore();
    });
}

function drawProps(ctx, props) {
    if (!props) return;

    props.forEach(p => {
        ctx.save();

        if (p.type === 'desk') {
            // 办公桌：木质/现代办公桌
            // 1. 桌下阴影
            ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.fillRect(p.x + 3, p.y + 3, p.w, p.h);

            // 2. 桌面主体（棕色木质/灰白现代风格）
            ctx.fillStyle = '#334155';
            ctx.fillRect(p.x, p.y, p.w, p.h);

            // 3. 桌面内嵌封边与光泽
            ctx.strokeStyle = '#64748b';
            ctx.lineWidth = 2;
            ctx.strokeRect(p.x + 1, p.y + 1, p.w - 2, p.h - 2);

            // 4. 桌面小细节（比如显示器/文档/键盘挡板标识）
            ctx.fillStyle = '#0f172a';
            // 模拟显示器/笔记本
            ctx.fillRect(p.x + p.w * 0.3, p.y + 3, p.w * 0.4, 4);
            // 模拟文件夹/鼠标垫
            ctx.fillStyle = '#94a3b8';
            ctx.fillRect(p.x + 5, p.y + p.h - 8, 8, 5);

            // 文字标识（可选）
            if (p.label) {
                ctx.fillStyle = '#94a3b8';
                ctx.font = '10px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(p.label, p.x + p.w / 2, p.y + p.h / 2 + 2);
            }

        } else if (p.type === 'conveyor') {
            // 工业传送带
            // 1. 金属底座框架
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(p.x, p.y, p.w, p.h);

            // 2. 履带主干（深灰）
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(p.x + 2, p.y + 2, p.w - 4, p.h - 4);

            // 3. 履带防滑斜纹
            ctx.strokeStyle = '#475569';
            ctx.lineWidth = 2;
            const gap = 12;
            for (let i = -p.h; i < p.w; i += gap) {
                ctx.beginPath();
                ctx.moveTo(Math.max(p.x, p.x + i), Math.min(p.y + p.h, p.y + p.h - i));
                ctx.lineTo(Math.min(p.x + p.w, p.x + i + p.h), Math.max(p.y, p.y - i));
                ctx.stroke();
            }

            // 4. 两侧工业黄/黑边框包边
            ctx.strokeStyle = '#eab308';
            ctx.lineWidth = 2;
            ctx.strokeRect(p.x, p.y, p.w, p.h);
        }

        ctx.restore();
    });
}

function drawObstacle(ctx, obs) {
    ctx.save();

    if (obs.type === 'solid') {
        // 1. 落地绘制阴影（向右下偏移，增强立柱/墙体高度感）
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(obs.x + 4, obs.y + 4, obs.w, obs.h);

        // 2. 墙体主渐变（模拟顶部光照效果）
        let grad = ctx.createLinearGradient(obs.x, obs.y, obs.x, obs.y + obs.h);
        grad.addColorStop(0, '#4a5568');   // 顶部较浅
        grad.addColorStop(1, '#1a202c');   // 底部暗色
        ctx.fillStyle = grad;
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);

        // 3. 混凝土/砖块微纹理
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        const tileSize = 16;
        for (let x = obs.x; x < obs.x + obs.w; x += tileSize) {
            for (let y = obs.y; y < obs.y + obs.h; y += tileSize) {
                ctx.strokeRect(x, y, Math.min(tileSize, obs.x + obs.w - x), Math.min(tileSize, obs.y + obs.h - y));
            }
        }

        // 4. 顶部高光边（增强立体边缘）
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(obs.x, obs.y + obs.h);
        ctx.lineTo(obs.x, obs.y);
        ctx.lineTo(obs.x + obs.w, obs.y);
        ctx.stroke();

        // 5. 外包边
        ctx.strokeStyle = '#2d3748';
        ctx.lineWidth = 2;
        ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);

    } else if (obs.type === 'glass') {
        // 1. 半透明蓝灰玻璃底色
        ctx.fillStyle = 'rgba(100, 200, 255, 0.12)';
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);

        // 2. 斜向高光反光条纹（玻璃质感核心）
        ctx.save();
        ctx.beginPath();
        ctx.rect(obs.x, obs.y, obs.w, obs.h);
        ctx.clip(); // 限制反光在玻璃范围内

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 3;
        for (let i = -obs.h; i < obs.w; i += 24) {
            ctx.beginPath();
            ctx.moveTo(obs.x + i, obs.y);
            ctx.lineTo(obs.x + i + 20, obs.y + obs.h);
            ctx.stroke();
        }
        ctx.restore();

        // 3. 金属固定边框
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
        ctx.lineWidth = 2;
        ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);

        // 4. 四角加固小角码
        ctx.fillStyle = '#38bdf8';
        const cs = 4; // 角码大小
        ctx.fillRect(obs.x, obs.y, cs, cs);
        ctx.fillRect(obs.x + obs.w - cs, obs.y, cs, cs);
        ctx.fillRect(obs.x, obs.y + obs.h - cs, cs, cs);
        ctx.fillRect(obs.x + obs.w - cs, obs.y + obs.h - cs, cs, cs);

    } else if (obs.type === 'low_wall') {
        // 低矮墙：掩体防撞墩样式（橙黑黄相间条纹 + 厚重感）
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.fillRect(obs.x + 3, obs.y + 3, obs.w, obs.h);

        // 基础底色
        ctx.fillStyle = '#d97706';
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);

        // 黄黑斜向警示条纹
        ctx.save();
        ctx.beginPath();
        ctx.rect(obs.x, obs.y, obs.w, obs.h);
        ctx.clip();
        
        ctx.fillStyle = '#1e293b';
        const stripeW = 10;
        for (let x = obs.x - obs.h; x < obs.x + obs.w; x += stripeW * 2) {
            ctx.beginPath();
            ctx.moveTo(x, obs.y + obs.h);
            ctx.lineTo(x + stripeW, obs.y + obs.h);
            ctx.lineTo(x + stripeW + obs.h, obs.y);
            ctx.lineTo(x + obs.h, obs.y);
            ctx.fill();
        }
        ctx.restore();

        // 顶部防护板边缘
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
    }

    ctx.restore();
}

function drawSecurityGates() {
    securityGates.forEach(gate => {
        ctx.save();
        ctx.fillStyle = 'rgba(255, 51, 68, 0.10)';
        ctx.fillRect(gate.x, gate.y, gate.w, gate.h);
        ctx.strokeStyle = '#FF3344';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(gate.x, gate.y, gate.w, gate.h);
        
        ctx.fillStyle = '#FF3344';
        ctx.fillRect(gate.x - 2, gate.y - 2, 6, 4);
        ctx.fillRect(gate.x - 2, gate.y + gate.h - 2, 6, 4);

        ctx.strokeStyle = 'rgba(255, 51, 68, 0.8)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(gate.x + gate.w / 2, gate.y);
        ctx.lineTo(gate.x + gate.w / 2, gate.y + gate.h);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#FF3344';
        ctx.font = '8px monospace';
        ctx.fillText(gate.label, gate.x - 15, gate.y - 5);
        ctx.restore();
    });
}

function drawWeaponIcons() {
    const startX = 25;
    const startY = height - 55;
    const boxSize = 40;
    const gap = 10;

    let index = 0;
    for (let key in WEAPONS) {
        let w = WEAPONS[key];
        let x = startX + index * (boxSize + gap);
        let y = startY;
        let isUnlocked = unlockedWeapons.includes(w.id);
        let isSelected = (w.id === currentWeapon.id);

        ctx.save();
        if (!isUnlocked) {
            ctx.fillStyle = 'rgba(15, 20, 18, 0.6)';
            ctx.strokeStyle = 'rgba(80, 100, 90, 0.3)';
            ctx.lineWidth = 1;
            ctx.fillRect(x, y, boxSize, boxSize);
            ctx.strokeRect(x, y, boxSize, boxSize);
            ctx.strokeStyle = 'rgba(80, 100, 90, 0.3)';
            ctx.fillStyle = 'rgba(80, 100, 90, 0.3)';
        } else {
            ctx.fillStyle = isSelected ? 'rgba(0, 255, 102, 0.28)' : 'rgba(4, 16, 10, 0.85)';
            ctx.strokeStyle = isSelected ? '#FFFF00' : 'rgba(0, 255, 102, 0.4)';
            ctx.lineWidth = isSelected ? 2 : 1;
            ctx.fillRect(x, y, boxSize, boxSize);
            ctx.strokeRect(x, y, boxSize, boxSize);
            ctx.strokeStyle = isSelected ? '#FFFF00' : '#00FF66';
            ctx.fillStyle = isSelected ? '#FFFF00' : '#00FF66';
        }
        ctx.lineWidth = 1.5;
        const cx = x + boxSize / 2;
        const cy = y + boxSize / 2;

        ctx.beginPath();
        if (w.id === 1) {
            ctx.strokeRect(cx - 12, cy - 2, 18, 4);
            ctx.fillRect(cx + 6, cy - 1, 5, 2);
            ctx.fillRect(cx - 4, cy + 2, 3, 6);
        } else if (w.id === 2) {
            ctx.strokeRect(cx - 7, cy - 3, 12, 3);
            ctx.fillRect(cx - 5, cy, 4, 7);
        } else if (w.id === 3) {
            ctx.strokeRect(cx - 14, cy - 2, 18, 2);
            ctx.fillRect(cx + 4, cy - 1, 8, 1);
            ctx.fillRect(cx - 4, cy - 4, 8, 2);
        } else if (w.id === 4) {
            ctx.strokeRect(cx - 9, cy - 3, 14, 4);
            ctx.fillRect(cx, cy + 1, 3, 7);
        } else if (w.id === 5) {
            ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
            ctx.fillRect(cx - 1.5, cy - 7, 3, 3);
        }
        ctx.stroke();

        ctx.restore();
        index++;
    }
}

function drawCamera(cam) {
    ctx.save();
    ctx.translate(cam.x, cam.y);
    
    ctx.fillStyle = cam.detecting ? 'rgba(255, 51, 51, 0.35)' : 'rgba(0, 255, 102, 0.12)';
    ctx.beginPath(); 
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 320, cam.currentAngle - 0.45, cam.currentAngle + 0.45);
    ctx.closePath(); 
    ctx.fill();

    ctx.fillStyle = '#1A241F'; 
    ctx.strokeStyle = cam.detecting ? '#FF3344' : '#00FF66'; 
    ctx.lineWidth = 1.5;
    ctx.beginPath(); 
    ctx.arc(0, 0, 12, 0, Math.PI * 2); 
    ctx.fill(); 
    ctx.stroke();

    ctx.rotate(cam.currentAngle);
    ctx.fillStyle = '#060B08'; 
    ctx.fillRect(-4, -6, 16, 12); 
    ctx.strokeRect(-4, -6, 16, 12);
    ctx.restore();
}

function drawDropItems() {
    dropItems.forEach(item => {
        ctx.save();
        ctx.translate(item.x, item.y);
        ctx.shadowBlur = 12;
        if (item.type === 'medkit') {
            ctx.fillStyle = '#00FF66'; ctx.shadowColor = '#00FF66';
            ctx.fillRect(-9, -9, 18, 18);
            ctx.fillStyle = '#000'; ctx.fillRect(-2, -6, 4, 12); ctx.fillRect(-6, -2, 12, 4);
        } else if (item.type === 'battery') {
            ctx.fillStyle = '#00CCFF'; ctx.shadowColor = '#00CCFF';
            ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#000'; ctx.fillRect(-4, -4, 8, 8);
        } else if (item.type === 'weapon') {
            ctx.fillStyle = '#FFFF00'; ctx.shadowColor = '#FFFF00';
            ctx.fillRect(-9, -9, 18, 18);
            ctx.fillStyle = '#000'; ctx.font = 'bold 11px monospace';
            ctx.fillText("W", -4, 4);
        }
        ctx.restore();
    });
}

function drawAgent(x, y, angle, isPlayer, walkCycle, hitFlash, hp, maxHp, pendingDamage, alpha = 1.0, isObserver = false, enemyShield = 0, maxShield = 80, alert = false) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);

    const isInBlind = !isPlayer && inBlindZone(x, y);

    // ------------------- 1. 头顶血条与护盾 -------------------
    if ((hp < maxHp || !isPlayer) && hp > 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; ctx.fillRect(-20, -36, 40, 5);
        ctx.fillStyle = isPlayer ? '#00FF66' : (isInBlind ? '#FFFF00' : '#FF3344');
        ctx.fillRect(-20, -36, (Math.max(0, hp) / maxHp) * 40, 5);
        
        if (enemyShield > 0) {
            ctx.fillStyle = '#00CCFF';
            ctx.fillRect(-20, -42, (enemyShield / maxShield) * 40, 4);
        }
    }

    ctx.rotate(angle);
    
    // 决定色彩
    let mainColor = '#FF3344';
    if (isPlayer) {
        mainColor = '#00FF66';
    } else if (isInBlind) {
        mainColor = '#FFFF00';
    } else if (isObserver) {
        mainColor = alert ? '#FF3344' : '#00CCFF';
    } else if (hitFlash) {
        mainColor = '#FFFFFF';
    }

    const darkColor = isPlayer ? '#0D1A12' : (isInBlind ? '#332E0A' : (isObserver ? '#051A24' : '#220D0F'));

    // ------------------- 2. 四肢：战术靴与步态动画 -------------------
    const legOffset = Math.sin(walkCycle) * 5;
    ctx.fillStyle = '#080D0A';
    // 左靴/右靴
    ctx.beginPath(); ctx.roundRect(-8, -11 + legOffset, 7, 5, 2); ctx.fill();
    ctx.beginPath(); ctx.roundRect(-8, 6 - legOffset, 7, 5, 2); ctx.fill();

    // ------------------- 3. 躯干：战术防弹衣 & 弹匣挂包 (无背包) -------------------
    // 3.1 防弹衣基底
    ctx.fillStyle = darkColor; 
    ctx.strokeStyle = mainColor; 
    ctx.lineWidth = isInBlind ? 2.8 : 1.8;
    ctx.beginPath(); 
    ctx.roundRect(-10, -10, 17, 20, 4); 
    ctx.fill(); 
    ctx.stroke();

    // 3.2 胸前/背部战术插板 (Plate Carrier)
    ctx.fillStyle = '#141E18';
    ctx.beginPath(); ctx.roundRect(-7, -7, 12, 14, 2); ctx.fill();

    // 3.3 战术弹匣包 (Pouches)
    ctx.fillStyle = '#1E2B23';
    ctx.fillRect(-2, -8, 4, 2);
    ctx.fillRect(3, -8, 4, 2);
    ctx.fillRect(-2, 6, 4, 2);
    ctx.fillRect(3, 6, 4, 2);

    // 3.4 肩章
    ctx.fillStyle = mainColor;
    ctx.fillRect(-4, -9, 4, 1.5);
    ctx.fillRect(-4, 7.5, 4, 1.5);

    // ------------------- 4. 技能与状态光环 -------------------
    if (isInBlind && hp > 0) {
        ctx.strokeStyle = '#FFFF00'; ctx.lineWidth = 2; ctx.shadowColor = '#FFFF00'; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0;
    }

    if (isObserver && enemyShield > 0) {
        ctx.strokeStyle = '#00CCFF'; ctx.lineWidth = 2; ctx.shadowColor = '#00CCFF'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(0, 0, 21, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0;
    }

    if (isPlayer && player.shieldActive) {
        ctx.strokeStyle = '#00CCFF'; ctx.shadowColor = '#00CCFF'; ctx.shadowBlur = 12; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(8, 0, 22, -Math.PI / 2.2, Math.PI / 2.2); ctx.stroke();
        ctx.shadowBlur = 0;
    }

    // ------------------- 5. 极简精细枪械 -------------------
    ctx.save();
    ctx.translate(4, 3); // 枪械基底偏移

    // 5.1 枪托
    ctx.fillStyle = '#111A14';
    ctx.fillRect(-4, -1.5, 4, 3);

    // 5.2 枪身
    ctx.fillStyle = '#050A07';
    ctx.fillRect(0, -2, 16, 4);

    // 5.3 顶部战术导轨与瞄具
    ctx.fillStyle = '#223328';
    ctx.fillRect(2, -2.8, 8, 1);
    ctx.fillStyle = mainColor; // 全息瞄具发光点
    ctx.fillRect(5, -3.3, 2, 1);

    // 5.4 侧挂激光/战术手电
    ctx.fillStyle = '#111A14';
    ctx.fillRect(6, 1.8, 4, 1.5);

    // 5.5 枪口消音器/制退器
    ctx.fillStyle = '#223328';
    ctx.fillRect(16, -2.5, 4, 5);

    // 5.6 枪口前端微光
    ctx.fillStyle = mainColor;
    ctx.fillRect(19, -1, 2, 2);

    ctx.restore();

    // ------------------- 6. 战术双手 (Hands & Gloves) -------------------
    ctx.fillStyle = '#141E18';
    ctx.strokeStyle = mainColor;
    ctx.lineWidth = 1;

    // 左手 (握持枪身前护木)
    ctx.beginPath(); ctx.arc(14, -2, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // 右手 (握持后握把)
    ctx.beginPath(); ctx.arc(5, 5, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // 开火枪口焰
    if (isPlayer && player.flashTimer > 0) {
        ctx.fillStyle = '#FFFF88'; ctx.shadowColor = '#FFFF00'; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(26, 3, 6, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    }

    // ------------------- 7. 头盔与双筒夜视仪 (Helmet & NVG) -------------------
    // 7.1 战术头盔
    ctx.fillStyle = '#060B08'; 
    ctx.beginPath(); ctx.arc(0, 0, 8.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = mainColor; ctx.lineWidth = 1.5; ctx.stroke();

    // 7.2 墨镜/战术护目镜
    ctx.fillStyle = '#020403';
    ctx.fillRect(3, -5, 2, 10);

    // 7.3 双筒夜视仪 (NVG) 镜筒结构
    ctx.fillStyle = '#141E18';
    ctx.fillRect(5, -4, 4, 2.5); // 上镜筒
    ctx.fillRect(5, 1.5, 4, 2.5); // 下镜筒

    // 7.4 夜视仪镜头镀膜发光点
    ctx.fillStyle = mainColor;
    ctx.shadowColor = mainColor;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(9, -2.7, 1, 0, Math.PI * 2);
    ctx.arc(9, 2.7, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0; // 恢复 shadowBlur

    ctx.restore();

    // ------------------- 8. 文字标识 (不随视角旋转) -------------------
    if (isInBlind && hp > 0) {
        ctx.fillStyle = '#FFFF00'; ctx.font = 'bold 10px monospace';
        ctx.fillText("[IN BLIND ZONE]", x - 35, y - 46);
    } else if (!isPlayer && isObserver && hp > 0) {
        ctx.fillStyle = alert ? '#FF3344' : '#00CCFF'; ctx.font = 'bold 9px monospace';
        ctx.fillText("[OBSERVER]", x - 26, y - 46);
    }

    if (!isPlayer && pendingDamage > 0 && hp > 0) {
        ctx.fillStyle = '#00FF66'; ctx.font = 'bold 10px monospace';
        ctx.fillText(`[DEBT: ${pendingDamage}]`, x - 26, y - (isInBlind ? 58 : 46));
    }
}

function draw() {
    ctx.clearRect(0, 0, width, height);
    
    ctx.strokeStyle = '#08120B'; ctx.lineWidth = 1;
    for(let x = 0; x < width; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
    for(let y = 0; y < height; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    
    drawZones();
    drawProps();
    obstacles.forEach(drawObstacle);
    drawSecurityGates();

    if (player.hp > 0) {
        drawTacticalFOV(player.x, player.y, player.angle, player.fov, player.viewDistance, 'rgba(0, 255, 102, 0.12)', 'rgba(0, 255, 102, 0.4)');
    }

    if (blindActive && blindZone) {
        ctx.save();
        ctx.fillStyle = 'rgba(4, 14, 9, 0.92)';
        ctx.beginPath(); ctx.arc(blindZone.x, blindZone.y, blindZone.radius, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#00FF66'; ctx.setLineDash([8, 6]); ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
    }

    enemies.forEach(e => {
    if (e.hp <= 0 && e.deathAlpha <= 0) return;

    // 1. 玩家视角与射线遮挡计算
    const dx = e.x - player.x;
    const dy = e.y - player.y;
    const dist = Math.hypot(dx, dy);
    let angleDiff = Math.atan2(dy, dx) - player.angle;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

    // 2. 判断敌人是否在玩家视角扇形内且无障碍物遮挡
    const inSight = dist <= player.viewDistance && Math.abs(angleDiff) <= player.fov / 2 && canSee(player.x, player.y, e.x, e.y);

    // 3. 判断敌人是否处于警戒或开火状态（发现玩家/向玩家射击）
    const isAttackingOrAlert = e.alert || e.state === 'attack' || e.state === 'shoot' || e.shootTimer > 0;

    // 条件：只有在【玩家视野内】或者【敌人主动警戒/攻击】时，才渲染该敌人
    if (inSight || isAttackingOrAlert) {
        if (e.hp > 0 && e.confusedTimer <= 0) {
            let fovFill = e.alert ? 'rgba(255, 51, 51, 0.15)' : (e.isObserver ? 'rgba(0, 204, 255, 0.12)' : 'rgba(255, 200, 0, 0.08)');
            let fovStroke = e.alert ? 'rgba(255, 51, 51, 0.4)' : null;
            drawTacticalFOV(e.x, e.y, e.angle, Math.PI / 3, 260, fovFill, fovStroke);
        }
        drawAgent(e.x, e.y, e.angle, false, e.walkCycle, e.hitTimer > 0, e.hp, e.maxHp, e.pendingDamage, e.deathAlpha, e.isObserver, e.shield, e.maxShield, e.alert);
    }
});

    cameras.forEach(drawCamera);
    drawDropItems();
    
    if (player.hp > 0) {
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 255, 102, 0.25)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(player.x, player.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
        ctx.strokeStyle = '#00FF66'; ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 6, 0, Math.PI*2); ctx.stroke();
        ctx.restore();
        drawAgent(player.x, player.y, player.angle, true, player.walkCycle, false, player.hp, player.maxHp, 0, 1.0);
    }
    
    particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    });

    grenades.forEach(g => {
        ctx.save();
        ctx.fillStyle = '#FF9900'; ctx.shadowColor = '#FF5500'; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(g.x, g.y, g.radius, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    });

    ctx.fillStyle = '#00FF66'; ctx.shadowColor = '#00FF66'; ctx.shadowBlur = 8;
    playerBullets.forEach(b => { 
        ctx.beginPath(); ctx.arc(b.x, b.y, b.radius || 3.5, 0, Math.PI*2); ctx.fill(); 
    });
    
    ctx.fillStyle = '#FF3344'; ctx.shadowColor = '#FF3344'; ctx.shadowBlur = 8;
    enemyBullets.forEach(eb => { ctx.beginPath(); ctx.arc(eb.x, eb.y, 3.5, 0, Math.PI*2); ctx.fill(); });
    
    ctx.shadowBlur = 0;

    drawWeaponIcons();
}

function gameLoop() {
    update(); draw();
    requestAnimationFrame(gameLoop);
}

// 初始化运行
resizeCanvas();
spawnWave();
gameLoop();
