// 机场关卡地图数据与配置
const LEVEL_AIRPORT = {
    id: "level1_airport",
    name: "ZONE A // AIRPORT TERMINAL",
    playerStart: { x: 100, y: 350 },
    
    getMapLayout: (width, height) => {
        const margin = 40;
        const w = width - margin * 2;
        const h = height - margin * 2;

        return {
            obstacles: [
                { x: margin, y: margin, w: w, h: 12, type: 'solid' },
                { x: margin, y: height - margin - 12, w: w, h: 12, type: 'solid' },
                { x: margin, y: margin, w: 12, h: h, type: 'solid' },
                { x: width - margin - 12, y: margin, w: 12, h: h, type: 'solid' },

                { x: margin + w * 0.28, y: margin, w: 12, h: h * 0.30, type: 'solid' },
                { x: margin + w * 0.28, y: margin + h * 0.60, w: 12, h: h * 0.40, type: 'solid' },

                { x: margin + w * 0.18, y: margin + h * 0.15, w: 12, h: h * 0.25, type: 'low_wall', label: 'GATE A1' },
                { x: margin + w * 0.18, y: margin + h * 0.55, w: 12, h: h * 0.25, type: 'low_wall', label: 'GATE A2' },

                { x: margin + w * 0.42, y: margin + h * 0.32, w: w * 0.30, h: 10, type: 'glass', label: 'GLASS WALL' },
                { x: margin + w * 0.72, y: margin, w: 10, h: h * 0.32, type: 'glass', label: 'GLASS WALL' },
                { x: margin + w * 0.55, y: margin, w: 10, h: h * 0.18, type: 'solid' },

                { x: margin + w * 0.68, y: margin + h * 0.48, w: 12, h: h * 0.52, type: 'solid' },
                { x: margin + w * 0.68, y: margin + h * 0.48, w: w * 0.18, h: 12, type: 'solid' },

                { x: margin + w * 0.28, y: margin + h * 0.82, w: w * 0.25, h: 10, type: 'low_wall', label: 'JETBRIDGE RAMP' }
            ],
            securityGates: [
                { x: margin + w * 0.28, y: margin + h * 0.45 - 20, w: 12, h: 40, label: 'SECURITY GATE' },
                { x: margin + w * 0.68, y: margin + h * 0.38, w: 12, h: 40, label: 'SECURITY GATE' }
            ],
            props: [
                { type: 'desk', x: margin + w * 0.08, y: margin + h * 0.20, w: 80, h: 22, label: 'DESK 01' },
                { type: 'desk', x: margin + w * 0.08, y: margin + h * 0.65, w: 80, h: 22, label: 'DESK 02' },
                { type: 'conveyor', x: margin + w * 0.21, y: margin + h * 0.20, w: 55, h: 28 },
                { type: 'conveyor', x: margin + w * 0.21, y: margin + h * 0.60, w: 55, h: 28 },
                { type: 'chair_group', x: margin + w * 0.45, y: margin + h * 0.12 },
                { type: 'chair_group', x: margin + w * 0.60, y: margin + h * 0.12 },
                { type: 'desk', x: margin + w * 0.48, y: margin + h * 0.24, w: 90, h: 25, label: 'BAR COUNTER' },
                { type: 'conveyor', x: margin + w * 0.74, y: margin + h * 0.65, w: 140, h: 45, label: 'CAROUSEL 1' },
                { type: 'conveyor', x: margin + w * 0.74, y: margin + h * 0.80, w: 140, h: 45, label: 'CAROUSEL 2' }
            ],
            zones: [
                { name: "ZONE A // MAIN SECURITY & CHECK-IN", x: margin + 20, y: margin + 20, w: w * 0.25, h: h - 40 },
                { name: "ZONE B // VIP LOUNGE [GLASS]", x: margin + w * 0.31, y: margin + 20, w: w * 0.39, h: h * 0.28 },
                { name: "ZONE C // BAGGAGE HANDLING", x: margin + w * 0.71, y: margin + h * 0.50, w: w * 0.26, h: h * 0.46 },
                { name: "ZONE D // JET BRIDGE & BOARDING", x: margin + w * 0.31, y: margin + h * 0.85, w: w * 0.35, h: h * 0.10 }
            ],
            waypoints: [
                { x: margin + w * 0.12, y: margin + h * 0.25 },
                { x: margin + w * 0.12, y: margin + h * 0.75 },
                { x: margin + w * 0.50, y: margin + h * 0.18 },
                { x: margin + w * 0.50, y: margin + h * 0.60 },
                { x: margin + w * 0.82, y: margin + h * 0.25 },
                { x: margin + w * 0.82, y: margin + h * 0.75 }
            ],
            cameras: [
                { 
                    x: margin + w * 0.42, y: margin + h * 0.32, 
                    baseAngle: Math.PI * 0.75, currentAngle: Math.PI * 0.75,
                    sweepTimer: 0, sweepSpeed: 0.02, sweepRange: Math.PI / 2.2, 
                    detecting: false, cooldownTimer: 0 
                },
                { 
                    x: margin + w * 0.72, y: margin + 40, 
                    baseAngle: Math.PI * 0.8, currentAngle: Math.PI * 0.8,
                    sweepTimer: 1.0, sweepSpeed: 0.018, sweepRange: Math.PI / 2.0, 
                    detecting: false, cooldownTimer: 0 
                }
            ]
        };
    }
};
