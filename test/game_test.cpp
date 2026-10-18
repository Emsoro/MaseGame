// 游戏逻辑单元测试：include main.cpp 复用同 TU 内的游戏核心
// （仅验证规则，不启动窗口）
#include "../src/main.cpp"

#include <iostream>

namespace {

int g_failures = 0;

void Check(bool cond, const char* expr, int line) {
    if (!cond) {
        std::cout << "FAIL line " << line << ": " << expr << "\n";
        ++g_failures;
    }
}

}  // namespace

#define CHECK(expr) Check((expr), #expr, __LINE__)

int main() {
    {
        std::lock_guard<std::mutex> lock(g_mutex);  // 单线程测试，全程持锁

        // ---- 新局 ----
        StartGame(1);
        CHECK(g_maze.Width() == 31);
        CHECK(g_maze.Height() == 17);
        CHECK(g_player == g_maze.Start());
        CHECK(g_alive);
        CHECK(!g_finished);
        CHECK(g_has_bomb);      // 开局自带炸弹
        CHECK(g_blast == 1);
        CHECK(g_coins_total == static_cast<int>(g_maze.Coins().size()));
        CHECK(g_chests_total == static_cast<int>(g_maze.Chests().size()));
        CHECK(static_cast<int>(g_monsters.size()) == g_monster_total);
        CHECK(g_monster_total >= 1);

        // ---- 吃金币 ----
        if (!g_coins.empty()) {
            const maze::Point target = g_coins.front();
            g_player = target;
            const std::string pick = PickupAt(g_player);
            CHECK(pick == "coin");
            CHECK(g_score == 10);
            CHECK(g_coins.size() + 1 == static_cast<size_t>(g_coins_total));
        }

        // ---- 吃宝箱：爆炸范围 +1 ----
        CHECK(!g_chests.empty());
        g_player = g_chests.front();
        CHECK(PickupAt(g_player) == "chest_power");
        CHECK(g_blast == 2);
        const int score_after_chest = g_score;
        CHECK(score_after_chest >= 50);

        // ---- 再吃宝箱：继续 +1 ----
        if (!g_chests.empty()) {
            g_player = g_chests.front();
            CHECK(PickupAt(g_player) == "chest_power");
            CHECK(g_blast == 3);
        }

        // ---- 放置炸弹 ----
        g_player = g_maze.Start();
        g_bombs.clear();
        CHECK(TryPlaceBomb().empty());
        CHECK(g_bombs.size() == 1);
        CHECK(TryPlaceBomb() == "occupied");   // 同格不能再放
        g_bombs.clear();

        // ---- 无炸弹时不能放置 ----
        g_has_bomb = false;
        CHECK(TryPlaceBomb() == "no_bomb");
        g_has_bomb = true;

        // ---- 移动：撞墙不动 ----
        g_player = g_maze.Start();
        bool moved = false;
        const std::string wall_result = DoMove(-1, 0, moved);  // 起点左侧必是墙
        CHECK(!moved);
        CHECK(wall_result.empty());

        // ---- 怪物碰撞：撞向怪物原地死亡 ----
        if (!g_monsters.empty()) {
            // 找一个与起点相邻的通路格放怪物
            const int dxs[4] = {1, -1, 0, 0};
            const int dys[4] = {0, 0, 1, -1};
            int dir = -1;
            for (int i = 0; i < 4; ++i) {
                const int nx = g_maze.Start().x + dxs[i];
                const int ny = g_maze.Start().y + dys[i];
                if (!g_maze.IsWall(nx, ny)) {
                    dir = i;
                    g_monsters[0].x = nx;
                    g_monsters[0].y = ny;
                    break;
                }
            }
            CHECK(dir >= 0);

            g_alive = true;
            const std::string caught = DoMove(dxs[dir], dys[dir], moved);
            CHECK(!moved);
            CHECK(caught == "monster_catch");
            CHECK(!g_alive);

            // ---- 阵亡后不能移动 ----
            const std::string after_death = DoMove(1, 0, moved);
            CHECK(!moved);
            CHECK(TryPlaceBomb() == "dead");
        }

        // ---- 复活：保留能力，怪物复位 ----
        ResetRun();
        CHECK(g_alive);
        CHECK(g_player == g_maze.Start());
        CHECK(g_bombs.empty());
        CHECK(g_steps == 0);
        CHECK(static_cast<int>(g_monsters.size()) == g_monster_total);
        CHECK(g_coins_total == static_cast<int>(g_coins.size()));  // 金币复原
    }

    // ---- 爆炸：击杀范围内怪物 ----
    {
        std::lock_guard<std::mutex> lock(g_mutex);
        StartGame(1);
        g_chests.clear();               // 直接给能力
        g_has_bomb = true;
        g_blast = 2;
        g_alive = true;

        // 清空怪物，在起点旁放一只
        g_monsters.clear();
        const int bx = g_maze.Start().x;
        const int by = g_maze.Start().y;
        int mx = bx + 1, my = by;
        if (g_maze.IsWall(mx, my)) { mx = bx; my = by + 1; }
        g_monsters.push_back(Monster{mx, my, 0.0f});
        g_monster_total = 1;

        g_bombs.push_back(Bomb{bx, by, 0.05f});
        const auto events = GameTick(0.2f);

        bool explode_event = false;
        bool kill_event = false;
        for (const auto& e : events) {
            if (e == "explode") explode_event = true;
            if (e == "monster_kill") kill_event = true;
        }
        CHECK(explode_event);
        CHECK(kill_event);
        CHECK(g_monsters.empty());
        CHECK(g_kills == 1);
        CHECK(g_score >= 100);
        CHECK(!g_explosions.empty());
        CHECK(g_explosion_life > 0.0f);

        // 爆炸伤害玩家：把玩家放到炸弹格
        g_explosions.clear();
        g_explosion_life = 0.0f;
        g_alive = true;
        g_player = maze::Point{bx, by};
        g_monsters.clear();
        g_bombs.push_back(Bomb{bx, by, 0.05f});
        const auto events2 = GameTick(0.2f);
        bool boom = false;
        for (const auto& e : events2) {
            if (e == "player_boom") boom = true;
        }
        CHECK(boom);
        CHECK(!g_alive);
    }

    // ---- 怪物游动：会移动且不穿墙 ----
    {
        std::lock_guard<std::mutex> lock(g_mutex);
        StartGame(1);
        g_alive = true;
        if (!g_monsters.empty()) {
            const size_t before_count = g_monsters.size();
            for (int i = 0; i < 20; ++i) MoveMonsters(0.5f);
            CHECK(g_monsters.size() == before_count);
            for (const auto& m : g_monsters) {
                CHECK(!g_maze.IsWall(m.x, m.y));   // 从不穿墙
            }
        }
    }

    if (g_failures == 0) {
        std::cout << "ALL GAME LOGIC TESTS PASSED\n";
        return 0;
    }
    std::cout << g_failures << " CHECK(S) FAILED\n";
    return 1;
}
