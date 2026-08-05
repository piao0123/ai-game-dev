# ai-game-dev
# AI Game Dev - 游戏项目说明文档

这是一个基于纯 HTML5 Canvas 和 JavaScript 开发的关卡制 Web 游戏。

## 📁 项目目录结构与文件职责

```text
ai-game-dev/
├── index.html                  # 页面主入口，负责挂载 Canvas 和按顺序引入 CSS/JS 脚本
├── style.css                   # 全局样式表（游戏画布居中、UI 布局与按钮样式）
├── README.md                   # 项目架构与 AI 协作规范文档
└── js/                         # 游戏核心逻辑代码目录
    ├── engine.js               # 游戏主引擎（负责 GameLoop 循环、Canvas 渲染、键盘事件绑定）
    ├── levelManager.js         # 关卡管理器（负责关卡加载、关卡切换、胜负判定与 UI 弹窗）
    └── levels/                 # 关卡数据配置文件目录
        ├── level1_airport.js   # 第一关数据：机场（包含玩家起始点、终点、障碍物、npc 交互等）
        └── level2_subway.js    # 第二关数据：地铁站（包含关卡独有地图与逻辑）
