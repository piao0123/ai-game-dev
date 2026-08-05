// 负责切换与管理场景关卡
class LevelManager {
    constructor() {
        this.levels = [LEVEL_AIRPORT]; // 以后可以 push(LEVEL_SUBWAY)
        this.currentIndex = 0;
    }

    getCurrentLevel() {
        return this.levels[this.currentIndex];
    }

    loadCurrentLevel() {
        const level = this.getCurrentLevel();
        const layout = level.getMapLayout(width, height);
        
        obstacles = layout.obstacles;
        securityGates = layout.securityGates;
        props = layout.props;
        zones = layout.zones;
        waypoints = layout.waypoints;
        cameras = layout.cameras;

        player.x = level.playerStart.x;
        player.y = level.playerStart.y;

        addLog(`LOADED: ${level.name}`);
    }

    nextLevel() {
        if (this.currentIndex + 1 < this.levels.length) {
            this.currentIndex++;
            this.loadCurrentLevel();
            return true;
        }
        return false; // 已无更多关卡
    }
}

const levelManager = new LevelManager();
