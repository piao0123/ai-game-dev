/**
 * 游戏主引擎 (engine.js)
 * 职责：负责 GameLoop 循环、Canvas 渲染、键盘与鼠标事件监听、FOV视野遮罩、状态更新
 */

// --- 基础配置与画布初始化 ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// --- 游戏全局状态 ---
const gameState = {
    isRunning: true,
    isPaused: false,
    score: 0,
    timeElapsed: 0,
    alarmTriggered: false
};

// --- 玩家状态 ---
const player = {
    x: 100,
    y: 100,
    radius: 12,
    speed: 3,
    angle: 0,                // 当前朝向角度（弧度）
    fovAngle: Math.PI / 3,   // 视野角度（60度）
    fovDistance: 220,        // 视野最远距离（像素）
    health: 100,
    maxHealth: 100
};

// --- 按键与鼠标监听 ---
const keys = {};
window.addEventListener('keydown', (e) => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);

let mousePos = { x: 0, y: 0 };
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mousePos.x = e.clientX - rect.left;
    mousePos.y = e.clientY - rect.top;
});

// --- 日志与UI系统 ---
function addLog(text, type = 'info') {
    const logBox = document.getElementById('game-log');
    if (!logBox) return;
    const item = document.createElement('div');
    item.className = `log-item log-${type}`;
    item.innerText = `[${new Date().toLocaleTimeString()}] ${text}`;
    logBox.appendChild(item);
    logBox.scrollTop = logBox.scrollHeight;
}

// --- 视野判定逻辑 ---
/**
 * 检查某个目标（如敌人）是否在主角的视野扇形区域内
 * @param {Object} target 包含 x, y 坐标的目标对象
 * @returns {boolean} 是否在视野内
 */
function isInFOV(target) {
    if (!target) return false;
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const dist = Math.hypot(dx, dy);

    // 1. 如果超出玩家视野最大距离，不可见
    if (dist > player.fovDistance) return false;

    // 2. 计算目标相对于主角的角度差
    const targetAngle = Math.atan2(dy, dx);
    let angleDiff = targetAngle - player.angle;

    // 规范化角度差到 [-PI, PI] 区间
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

    // 3. 判断夹角绝对值是否在 half-FOV 之内
    return Math.abs(angleDiff) <= player.fovAngle / 2;
}

// --- 碰撞检测逻辑 ---
function checkObstacleCollision(newX, newY, radius) {
    if (!window.obstacles) return false;
    for (let obs of window.obstacles) {
        if (newX + radius > obs.x &&
            newX - radius < obs.x + obs.w &&
            newY + radius > obs.y &&
            newY - radius < obs.y + obs.h) {
            return true;
        }
    }
    return false;
}

// --- 物理与逻辑更新 ---
function update() {
    if (gameState.isPaused || !gameState.isRunning) return;

    // 1. 玩家移动计算
    let moveX = 0;
    let moveY = 0;
    if (keys['w'] || keys['arrowup']) moveY -= 1;
    if (keys['s'] || keys['arrowdown']) moveY += 1;
    if (keys['a'] || keys['arrowleft']) moveX -= 1;
    if (keys['d'] || keys['arrowright']) moveX += 1;

    // 归一化移动向量
    if (moveX !== 0 && moveY !== 0) {
        moveX *= 0.7071;
        moveY *= 0.7071;
    }

    const nextX = player.x + moveX * player.speed;
    const nextY = player.y + moveY * player.speed;

    // 碰撞检测后再更新坐标
    if (!checkObstacleCollision(nextX, player.y, player.radius)) {
        player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, nextX));
    }
    if (!checkObstacleCollision(player.x, nextY, player.radius)) {
        player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, nextY));
    }

    // 2. 计算玩家面向鼠标的角度
    player.angle = Math.atan2(mousePos.y - player.y, mousePos.x - player.x);

    // 3. 更新敌人 AI 与状态
    if (window.enemies) {
        window.enemies.forEach(enemy => {
            if (typeof enemy.update === 'function') {
                enemy.update(player, window.obstacles);
            }
        });
    }

    // 4. 更新关卡特定逻辑
    if (window.levelManager && typeof window.levelManager.update === 'function') {
        window.levelManager.update();
    }
}

// --- 渲染绘制子模块 ---

// 绘制地图与静态物体
function drawEnvironment() {
    // 绘制地图背景
    ctx.fillStyle = '#1b1d22';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 绘制障碍物/墙体
    if (window.obstacles) {
        ctx.fillStyle = '#2c303e';
        ctx.strokeStyle = '#41485c';
        ctx.lineWidth = 2;
        window.obstacles.forEach(obs => {
            ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
            ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
        });
    }

    // 绘制安检门/警报区
    if (window.securityGates) {
        window.securityGates.forEach(gate => {
            ctx.fillStyle = gate.active ? 'rgba(255, 50, 50, 0.25)' : 'rgba(50, 255, 50, 0.15)';
            ctx.fillRect(gate.x, gate.y, gate.w, gate.h);
            ctx.strokeStyle = gate.active ? '#ff3232' : '#32ff32';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(gate.x, gate.y, gate.w, gate.h);
        });
    }
}

// 绘制主角视野锥体 (FOV)
function drawPlayerFOV() {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.arc(
        player.x,
        player.y,
        player.fovDistance,
        player.angle - player.fovAngle / 2,
        player.angle + player.fovAngle / 2
    );
    ctx.closePath();

    // 视野透明光束
    const gradient = ctx.createRadialGradient(
        player.x, player.y, 10,
        player.x, player.y, player.fovDistance
    );
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0.01)');

    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
}

// 绘制所有敌人 (加入 isInFOV 判定)
function drawEnemies() {
    if (!window.enemies) return;

    window.enemies.forEach(enemy => {
        // 核心修改：只有在主角视野范围内的敌人，才会被渲染显示
        if (!isInFOV(enemy)) return;

        ctx.save();

        // 绘制敌人的警戒视线扇形
        if (enemy.fovAngle && enemy.fovDistance) {
            ctx.beginPath();
            ctx.moveTo(enemy.x, enemy.y);
            ctx.arc(
                enemy.x,
                enemy.y,
                enemy.fovDistance,
                (enemy.angle || 0) - enemy.fovAngle / 2,
                (enemy.angle || 0) + enemy.fovAngle / 2
            );
            ctx.closePath();
            ctx.fillStyle = enemy.alert ? 'rgba(255, 77, 77, 0.2)' : 'rgba(255, 204, 0, 0.1)';
            ctx.fill();
        }

        // 绘制敌人本体圆圈
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius || 10, 0, Math.PI * 2);
        ctx.fillStyle = enemy.alert ? '#ff3333' : '#e6b800';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 绘制敌人朝向线
        if (enemy.angle !== undefined) {
            ctx.beginPath();
            ctx.moveTo(enemy.x, enemy.y);
            ctx.lineTo(
                enemy.x + Math.cos(enemy.angle) * ((enemy.radius || 10) + 5),
                enemy.y + Math.sin(enemy.angle) * ((enemy.radius || 10) + 5)
            );
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // 绘制警觉度/状态指示
        if (enemy.alert) {
            ctx.fillStyle = '#ff0000';
            ctx.font = 'bold 12px sans-serif';
            ctx.fillText('!', enemy.x - 3, enemy.y - (enemy.radius || 10) - 6);
        }

        ctx.restore();
    });
}

// 绘制主角本体
function drawPlayer() {
    ctx.save();

    // 主角外轮廓与圆圈
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#3a9bdc';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 枪口朝向
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(
        player.x + Math.cos(player.angle) * (player.radius + 7),
        player.y + Math.sin(player.angle) * (player.radius + 7)
    );
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.restore();
}

// 主绘制入口
function draw() {
    drawEnvironment();
    drawPlayerFOV();
    drawEnemies();
    drawPlayer();
}

// --- 游戏主循环 (GameLoop) ---
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// 启动引擎主循环
gameLoop();
