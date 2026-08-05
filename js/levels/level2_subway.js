// 【关卡占位符】后续扩展关卡 2（地铁站场景）时在此填写数据
const LEVEL_SUBWAY = {
    id: "level2_subway",
    name: "ZONE B // METRO SUBWAY STATION",
    playerStart: { x: 100, y: 350 },
    getMapLayout: (width, height) => {
        return {
            obstacles: [],
            securityGates: [],
            props: [],
            zones: [],
            waypoints: [],
            cameras: []
        };
    }
};
