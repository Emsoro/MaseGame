// 迷宫炸弹人 —— 基于 TauriCPP (C++ 后端 + Web 前端)
//
// 玩法：吃宝箱获得炸弹 → 引信倒计时爆炸 → 炸掉缓慢游动的怪物；
//       玩家没躲开会被炸死；再吃宝箱可增加炸弹爆炸范围。
//       碰到怪物同样死亡。
#include "tauricpp/app.hpp"

#include <Windows.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdlib>
#include <fstream>
#include <iterator>
#include <mutex>
#include <random>
#include <thread>
#include <vector>

#include "maze.hpp"

using nlohmann::json;

namespace {

struct Level {
    const char* name;
    int width;
    int height;
    int monsters;
};

const Level kLevels[] = {
    {"简单", 21, 11, 1},
    {"普通", 31, 17, 2},
    {"困难", 41, 23, 3},
    {"地狱", 51, 29, 4},
};

struct Bomb {
    int x = 0;
    int y = 0;
    float fuse = 0;
};

struct Monster {
    int x = 0;
    int y = 0;
    float timer = 0;
    int id = 0;   // 稳定标识，供前端做插值动画
};

constexpr float kFuseTime = 2.0f;        // 引信：约两次呼吸后爆炸
constexpr float kExplosionLife = 0.55f;  // 火焰持续时间
constexpr float kMonsterInterval = 0.8f; // 怪物速度：缓慢游动
constexpr int kMaxBombs = 2;             // 场上同时存在的炸弹上限

std::mutex g_mutex;
std::mt19937 g_rng{std::random_device{}()};

maze::Maze g_maze;
maze::Point g_player{1, 1};

std::vector<maze::Point> g_coins;    // 场上剩余金币
std::vector<maze::Point> g_chests;   // 场上剩余宝箱
int g_coins_total = 0;
int g_chests_total = 0;
int g_score = 0;

std::vector<Bomb> g_bombs;
std::vector<Monster> g_monsters;
std::vector<maze::Point> g_explosions;  // 当前火焰格
float g_explosion_life = 0.0f;
int g_monster_total = 0;

bool g_alive = true;
bool g_has_bomb = false;
int g_blast = 1;
int g_kills = 0;

int g_level = 1;
int g_steps = 0;
int g_hints = 0;
int g_best = 0;
bool g_finished = false;

std::chrono::steady_clock::time_point g_start = std::chrono::steady_clock::now();
std::atomic<bool> g_running{true};

int ElapsedMs() {
    return static_cast<int>(std::chrono::duration_cast<std::chrono::milliseconds>(
                                std::chrono::steady_clock::now() - g_start)
                                .count());
}

json PointJson(const maze::Point& p) {
    return json{{"x", p.x}, {"y", p.y}};
}

json PointsJson(const std::vector<maze::Point>& pts) {
    json arr = json::array();
    for (const auto& p : pts) arr.push_back(PointJson(p));
    return arr;
}

json StateJson() {
    json j;
    j["width"] = g_maze.Width();
    j["height"] = g_maze.Height();
    j["grid"] = g_maze.Grid();
    j["start"] = PointJson(g_maze.Start());
    j["goal"] = PointJson(g_maze.Goal());
    j["player"] = PointJson(g_player);
    j["steps"] = g_steps;
    j["hints"] = g_hints;
    j["best"] = g_best;
    j["level"] = g_level;
    j["levelName"] = kLevels[g_level].name;
    j["finished"] = g_finished;
    j["ms"] = ElapsedMs();
    j["coins"] = PointsJson(g_coins);
    j["chests"] = PointsJson(g_chests);
    j["coinsTotal"] = g_coins_total;
    j["chestsTotal"] = g_chests_total;
    j["coinsGot"] = g_coins_total - static_cast<int>(g_coins.size());
    j["chestsGot"] = g_chests_total - static_cast<int>(g_chests.size());
    j["score"] = g_score;

    json bombs = json::array();
    for (const auto& b : g_bombs) {
        bombs.push_back(json{{"x", b.x}, {"y", b.y}, {"fuse", b.fuse}});
    }
    j["bombs"] = bombs;

    json monsters = json::array();
    for (const auto& m : g_monsters) {
        monsters.push_back(json{{"id", m.id}, {"x", m.x}, {"y", m.y}});
    }
    j["monsters"] = monsters;
    j["monsterTotal"] = g_monster_total;

    j["explosions"] = PointsJson(g_explosions);
    j["explosionLife"] = g_explosion_life;
    j["alive"] = g_alive;
    j["kills"] = g_kills;
    j["hasBomb"] = g_has_bomb;
    j["blast"] = g_blast;
    return j;
}

/// 玩家踩到金币/宝箱时拾取，返回类型："coin" / "chest_bomb" / "chest_power" / ""
std::string PickupAt(const maze::Point& pos) {
    auto is_same = [&pos](const maze::Point& p) { return p.x == pos.x && p.y == pos.y; };

    auto coin = std::find_if(g_coins.begin(), g_coins.end(), is_same);
    if (coin != g_coins.end()) {
        g_coins.erase(coin);
        g_score += 10;
        return "coin";
    }

    auto chest = std::find_if(g_chests.begin(), g_chests.end(), is_same);
    if (chest != g_chests.end()) {
        g_chests.erase(chest);
        g_score += 50;
        if (!g_has_bomb) {
            g_has_bomb = true;   // 第一个宝箱：获得炸弹
            g_blast = 1;
            return "chest_bomb";
        }
        ++g_blast;               // 后续宝箱：爆炸范围 +1
        return "chest_power";
    }
    return "";
}

bool MonsterAt(int x, int y) {
    for (const auto& m : g_monsters) {
        if (m.x == x && m.y == y) return true;
    }
    return false;
}

void KillPlayer(const std::string& reason, std::vector<std::string>& events) {
    if (g_alive) {
        g_alive = false;
        events.push_back(reason);
    }
}

/// 炸弹爆炸：十字范围，遇墙停止；击杀怪物、误伤玩家
std::vector<std::string> Explode(const Bomb& b) {
    std::vector<std::string> events;
    events.emplace_back("explode");
    g_explosions.push_back(maze::Point{b.x, b.y});
    if (g_alive && g_player.x == b.x && g_player.y == b.y) {
        KillPlayer("player_boom", events);
    }

    const int dx[4] = {1, -1, 0, 0};
    const int dy[4] = {0, 0, 1, -1};
    for (int d = 0; d < 4; ++d) {
        for (int i = 1; i <= g_blast; ++i) {
            const int nx = b.x + dx[d] * i;
            const int ny = b.y + dy[d] * i;
            if (g_maze.IsWall(nx, ny)) break;
            g_explosions.push_back(maze::Point{nx, ny});

            g_monsters.erase(std::remove_if(g_monsters.begin(), g_monsters.end(),
                [&](const Monster& m) {
                    if (m.x != nx || m.y != ny) return false;
                    ++g_kills;
                    g_score += 100;
                    events.emplace_back("monster_kill");
                    return true;
                }),
                g_monsters.end());

            if (g_alive && g_player.x == nx && g_player.y == ny) {
                KillPlayer("player_boom", events);
            }
        }
    }
    g_explosion_life = kExplosionLife;
    return events;
}

std::vector<std::string> MoveMonsters(float dt) {
    std::vector<std::string> events;
    const int dx[4] = {1, -1, 0, 0};
    const int dy[4] = {0, 0, 1, -1};

    for (auto& m : g_monsters) {
        m.timer += dt;
        if (m.timer < kMonsterInterval) continue;
        m.timer = 0.0f;

        std::vector<int> dirs{0, 1, 2, 3};
        std::shuffle(dirs.begin(), dirs.end(), g_rng);
        bool blocked = true;
        for (int d : dirs) {
            const int nx = m.x + dx[d];
            const int ny = m.y + dy[d];
            if (g_maze.IsWall(nx, ny)) continue;
            m.x = nx;
            m.y = ny;
            blocked = false;
            break;
        }
        if (blocked) continue;

        if (m.x == g_player.x && m.y == g_player.y) {
            KillPlayer("monster_catch", events);
        }
    }
    return events;
}

/// 每帧推进游戏：炸弹引信、爆炸、怪物移动；返回触发的事件
std::vector<std::string> GameTick(float dt) {
    std::vector<std::string> events;
    if (!g_alive) return events;

    for (auto& b : g_bombs) b.fuse -= dt;

    std::vector<Bomb> remaining;
    remaining.reserve(g_bombs.size());
    for (auto& b : g_bombs) {
        if (b.fuse <= 0.0f) {
            auto ev = Explode(b);
            events.insert(events.end(), ev.begin(), ev.end());
        } else {
            remaining.push_back(b);
        }
    }
    g_bombs.swap(remaining);

    if (g_explosion_life > 0.0f) {
        g_explosion_life -= dt;
        if (g_explosion_life <= 0.0f) {
            g_explosion_life = 0.0f;
            g_explosions.clear();
        }
    }

    auto ev = MoveMonsters(dt);
    events.insert(events.end(), ev.begin(), ev.end());
    return events;
}

void SpawnMonsters(int count) {
    g_monsters.clear();
    g_monster_total = 0;
    if (count <= 0) return;

    std::vector<maze::Point> cells;
    for (int y = 1; y < g_maze.Height() - 1; ++y) {
        for (int x = 1; x < g_maze.Width() - 1; ++x) {
            if (g_maze.IsWall(x, y)) continue;
            const int dist = std::abs(x - g_maze.Start().x) + std::abs(y - g_maze.Start().y);
            if (dist < 8) continue;   // 出生点附近不放怪物
            cells.push_back(maze::Point{x, y});
        }
    }
    if (cells.empty()) return;

    std::shuffle(cells.begin(), cells.end(), g_rng);
    const int n = std::min<int>(static_cast<int>(cells.size()), count);
    static int next_id = 1;
    for (int i = 0; i < n; ++i) {
        g_monsters.push_back(Monster{cells[i].x, cells[i].y, 0.0f, next_id++});
    }
    g_monster_total = n;
}

/// 复位一局（复活）：保留已获得的炸弹能力
void ResetRun() {
    g_player = g_maze.Start();
    g_steps = 0;
    g_finished = false;
    g_score = 0;
    g_coins = g_maze.Coins();
    g_chests = g_maze.Chests();
    g_coins_total = static_cast<int>(g_coins.size());
    g_chests_total = static_cast<int>(g_chests.size());
    g_bombs.clear();
    g_explosions.clear();
    g_explosion_life = 0.0f;
    g_alive = true;
    g_start = std::chrono::steady_clock::now();
    SpawnMonsters(kLevels[g_level].monsters);
}

void StartGame(int level) {
    g_level = level;
    g_maze.Generate(kLevels[level].width, kLevels[level].height);
    g_hints = 0;
    g_has_bomb = true;   // 开局即有炸弹；宝箱用于升级爆炸范围
    g_blast = 1;
    g_kills = 0;
    ResetRun();
    auto best = g_maze.ShortestPath(g_maze.Start());
    g_best = best.empty() ? 0 : static_cast<int>(best.size()) - 1;
}

/// 尝试移动一格。返回 ""（撞墙/未动）/ "coin" / "chest_bomb" / "chest_power" / "monster_catch"
std::string DoMove(int dx, int dy, bool& moved) {
    moved = false;
    if (!g_alive || g_finished || (dx == 0 && dy == 0)) return "";

    maze::Point next{g_player.x + dx, g_player.y + dy};
    if (g_maze.IsWall(next.x, next.y)) return "";

    if (MonsterAt(next.x, next.y)) {
        // 撞向怪物，原地被抓
        g_alive = false;
        return "monster_catch";
    }

    g_player = next;
    ++g_steps;
    moved = true;

    const std::string picked = PickupAt(g_player);
    if (g_player.x == g_maze.Goal().x && g_player.y == g_maze.Goal().y) {
        g_finished = true;
    }
    return picked;
}

/// 放置炸弹到玩家脚下。返回 ""（成功）或失败原因
std::string TryPlaceBomb() {
    if (!g_alive) return "dead";
    if (!g_has_bomb) return "no_bomb";
    if (static_cast<int>(g_bombs.size()) >= kMaxBombs) return "limit";

    for (const auto& b : g_bombs) {
        if (b.x == g_player.x && b.y == g_player.y) return "occupied";
    }
    g_bombs.push_back(Bomb{g_player.x, g_player.y, kFuseTime});
    return "";
}

}  // namespace

int WINAPI WinMain(HINSTANCE, HINSTANCE, LPSTR, int) {
    tauricpp::App::Config config;
    config.window_config.title = "迷宫炸弹人 · TauriCPP";
    config.window_config.width = 1180;
    config.window_config.height = 800;
    config.window_config.center = true;
    config.window_config.resizable = true;
    config.window_config.devtools = true;                 // F12 打开 DevTools
    config.window_config.bg_color = RGB(11, 10, 31);      // 与前端主题同色，消除白屏

    tauricpp::App app(config);
    auto& bridge = app.GetBridge();

    // 开始新一局（按难度生成迷宫、怪物、金币、宝箱）
    bridge.RegisterCommand("new_game", [](const json& args) -> json {
        int level = args.value("level", 1);
        if (level < 0 || level >= static_cast<int>(std::size(kLevels))) level = 1;

        std::lock_guard<std::mutex> lock(g_mutex);
        StartGame(level);
        return StateJson();
    });

    // 复活（保留炸弹能力，怪物复位）
    bridge.RegisterCommand("restart", [](const json&) -> json {
        std::lock_guard<std::mutex> lock(g_mutex);
        ResetRun();
        return StateJson();
    });

    // 移动玩家
    bridge.RegisterCommand("move", [](const json& args) -> json {
        int dx = args.value("dx", 0);
        int dy = args.value("dy", 0);

        std::lock_guard<std::mutex> lock(g_mutex);
        bool moved = false;
        std::string picked = DoMove(dx, dy, moved);

        json j;
        j["ok"] = moved;
        j["pick"] = picked;
        j["death"] = picked == "monster_catch" ? "monster_catch" : "";
        j["state"] = StateJson();
        return j;
    });

    // 放置炸弹（在玩家脚下；需要先吃宝箱获得炸弹）
    bridge.RegisterCommand("place_bomb", [](const json&) -> json {
        std::lock_guard<std::mutex> lock(g_mutex);
        json j;
        const std::string reason = TryPlaceBomb();
        j["ok"] = reason.empty();
        if (!reason.empty()) j["reason"] = reason;
        return j;
    });

    // 求解：返回从当前位置到终点的最短路径
    bridge.RegisterCommand("hint", [](const json&) -> json {
        std::lock_guard<std::mutex> lock(g_mutex);
        auto path = g_maze.ShortestPath(g_player);
        ++g_hints;

        json arr = json::array();
        for (const auto& p : path) arr.push_back(PointJson(p));

        json j;
        j["path"] = arr;
        j["state"] = StateJson();
        return j;
    });

    // 查询当前状态
    bridge.RegisterCommand("get_state", [](const json&) -> json {
        std::lock_guard<std::mutex> lock(g_mutex);
        return StateJson();
    });

    bridge.RegisterCommand("window.set_title", [&app](const json& args) -> json {
        app.GetWindow().SetTitle(args.value("title", "迷宫炸弹人"));
        return json{{"success", true}};
    });

    // 前端诊断日志
    bridge.RegisterCommand("log_error", [](const json& args) -> json {
        std::lock_guard<std::mutex> lock(g_mutex);
        std::ofstream log("D:/Cplusplus/maze/error_log.txt", std::ios::app);
        log << args.value("message", "") << std::endl;
        return json{{"success", true}};
    });

    app.OnSetup([](tauricpp::App& app) {
        app.GetWindow().OnClose([]() -> bool {
            g_running = false;  // 通知游戏线程退出
            return true;
        });

        // 游戏主循环：推进炸弹/怪物，并把全量状态推给前端
        std::thread([&app]() {
            auto last = std::chrono::steady_clock::now();
            while (g_running) {
                std::this_thread::sleep_for(std::chrono::milliseconds(120));
                if (!g_running) break;

                const auto now = std::chrono::steady_clock::now();
                const float dt = std::chrono::duration<float>(now - last).count();
                last = now;

                std::vector<std::string> events;
                json snapshot;
                {
                    std::lock_guard<std::mutex> lock(g_mutex);
                    events = GameTick(dt);
                    snapshot = StateJson();
                }

                app.GetBridge().Emit("tick", snapshot);
                for (const auto& e : events) {
                    app.GetBridge().Emit(e, json::object());
                }
            }
        }).detach();
    });

    return app.Run();
}
