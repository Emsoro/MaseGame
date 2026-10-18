# 迷宫炸弹人 · Maze Bomberman

一个用 **C++ 后端 + Web 前端** 写成的桌面迷宫游戏：随机生成迷宫，吃金币、开宝箱、放炸弹、炸怪物，一路冲到右下角终点。炸弹有 2 秒引信——**没躲开，连自己一起炸死**。

基于自研框架 [TauriCPP](https://github.com/Emsoro/TauriCPP)（C++ / Win32 / WebView2）：前端资源在编译期嵌入 exe，运行时从内存加载，不落地临时文件，最终是单个可执行文件。

## 玩法

| 元素 | 说明 |
|---|---|
| 迷宫 | 递归回溯随机生成 + 少量环路，四档难度：简单 21×11 / 普通 31×17 / 困难 41×23 / 地狱 51×29 |
| 金币 | +10 分 |
| 宝箱 | 开局自带 1 格爆炸范围，每吃一个宝箱范围 +1 |
| 怪物 | 每档 1~4 只，沿通路缓慢游荡（0.8s/格），撞上即死 |
| 炸弹 | 空格放置，2 秒引信，十字爆炸；范围内怪物被炸死（+100 分） |
| 误伤 | 玩家在爆炸范围内会被自己炸死 |
| 复活 | 死亡后原地复活，保留已获得的爆炸范围 |

**操作**：`WASD / 方向键` 移动 · `空格` 放炸弹 · `R` 换迷宫 · `H` 提示最短路径 · `F12` DevTools

## 特性

- **C++ 游戏主循环**：后端 120ms tick 推进炸弹引信、怪物游走，向前端推送全量状态快照
- **细腻前端渲染**：Canvas 绘制墙体/金币/宝箱/怪物/炸弹/爆炸火焰，玩家与怪物均为帧间插值动画，移动丝滑
- **7 套主题**：深空紫 / 赛博朋克 / 深海 / 森林 / 日落 / 琥珀金 / 玫瑰金，CSS 变量与 Canvas 配色同步切换，可折叠功能面板
- **程序化音频**：Web Audio 实时合成的背景伴奏（Am-F-C-G 循环）与音效（吃币、开箱、放弹、爆炸、阵亡），零音频文件
- **图标**：`icon.png` 经 `TauriCPP/tools/make_icon.py` 生成 7 种分辨率 ico 编入 exe
- **可测试**：游戏规则有 C++ 单元测试（`test/game_test.cpp`），连跑多种子通过
- **可调试**：支持 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`，用 CDP（playwright 等）直接截图、注入按键、读状态

## 构建

环境要求：

- Windows 10/11 x64
- Visual Studio 2022（C++ 工作负载）
- CMake 3.15+
- Python 3（资源打包）
- WebView2 静态 SDK：`vcpkg install webview2:x64-windows-static --classic`

```powershell
git clone https://github.com/Emsoro/MaseGame.git
cd MaseGame
.\build.ps1              # Release，前端资源嵌入 exe
.\build.ps1 -DevMode     # 开发模式：直接读 frontend/ 目录，改 UI 免重编
.\build.ps1 -Clean       # 清理重建
```

产物：`build\Release\MazeGame.exe`（约 666 KB，单文件无外部依赖）。

## 目录结构

```
maze/
├── src/                  # C++ 后端：TauriCPP 入口 + 迷宫生成 + 游戏逻辑
│   ├── main.cpp          #   命令注册（move/place_bomb/hint...）、游戏主循环线程
│   ├── maze.hpp/.cpp     #   迷宫生成（DFS）、BFS 最短路径、金币宝箱投放
│   ├── app.ico           #   应用图标（icon.png 生成）
├── frontend/             # Web 前端：Canvas 渲染 + Web Audio
│   ├── index.html
│   ├── css/style.css     #   7 套主题 CSS 变量
│   └── js/app.js         #   Bridge 通信、插值动画、音效合成
├── test/
│   └── game_test.cpp     # 游戏规则单元测试（含构建，ctest 可跑）
├── TauriCPP/             # 内置框架副本（C++/WebView2）
├── CMakeLists.txt
└── build.ps1
```

## 技术栈

`C++17` · `Win32` · `WebView2` · `nlohmann/json` · `Canvas 2D` · `Web Audio API` · `MSVC` · `CMake`

## License

MIT（框架部分见 `TauriCPP/LICENSE`）
