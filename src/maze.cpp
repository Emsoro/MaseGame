#include "maze.hpp"

#include <algorithm>
#include <deque>
#include <random>

namespace maze {

void Maze::Generate(int width, int height) {
    width_ = width | 1;
    height_ = height | 1;
    if (width_ < 5) width_ = 5;
    if (height_ < 5) height_ = 5;

    grid_.assign(height_, std::string(width_, kWall));
    start_ = Point{1, 1};
    goal_ = Point{width_ - 2, height_ - 2};

    std::mt19937 rng(std::random_device{}());
    std::vector<std::vector<bool>> seen(height_, std::vector<bool>(width_, false));
    std::vector<Point> stack;

    grid_[start_.y][start_.x] = kRoad;
    seen[start_.y][start_.x] = true;
    stack.push_back(start_);

    const int dx[4] = {2, -2, 0, 0};
    const int dy[4] = {0, 0, 2, -2};
    while (!stack.empty()) {
        Point cur = stack.back();
        std::vector<int> dirs{0, 1, 2, 3};
        std::shuffle(dirs.begin(), dirs.end(), rng);

        bool moved = false;
        for (int d : dirs) {
            Point next{cur.x + dx[d], cur.y + dy[d]};
            if (next.x <= 0 || next.y <= 0 || next.x >= width_ - 1 || next.y >= height_ - 1) continue;
            if (seen[next.y][next.x]) continue;

            grid_[(cur.y + next.y) / 2][(cur.x + next.x) / 2] = kRoad;
            grid_[next.y][next.x] = kRoad;
            seen[next.y][next.x] = true;
            stack.push_back(next);
            moved = true;
            break;
        }
        if (!moved) stack.pop_back();
    }

    // 随机打通少量墙壁形成环路，避免迷宫只有唯一解而过于枯燥
    std::uniform_int_distribution<int> rx(1, width_ - 2);
    std::uniform_int_distribution<int> ry(1, height_ - 2);
    std::uniform_int_distribution<int> rc(0, width_ * height_ / 16);
    int extra = rc(rng);
    for (int i = 0; i < extra; ++i) {
        grid_[ry(rng)][rx(rng)] = kRoad;
    }

    grid_[goal_.y][goal_.x] = kRoad;

    PlaceItems(rng);
}

void Maze::PlaceItems(std::mt19937& rng) {
    coins_.clear();
    chests_.clear();
    if (width_ < 5 || height_ < 5) return;

    std::vector<Point> cells;
    for (int y = 1; y < height_ - 1; ++y) {
        for (int x = 1; x < width_ - 1; ++x) {
            if (grid_[y][x] != kRoad) continue;
            if (x == start_.x && y == start_.y) continue;
            if (x == goal_.x && y == goal_.y) continue;
            cells.push_back(Point{x, y});
        }
    }
    if (cells.empty()) return;

    std::shuffle(cells.begin(), cells.end(), rng);

    const int chest_count = std::clamp<int>(static_cast<int>(cells.size()) / 60, 2, 4);
    const int coin_count = std::clamp<int>(static_cast<int>(cells.size()) / 9, 8, 40);

    std::size_t idx = 0;
    for (int i = 0; i < chest_count && idx < cells.size(); ++i) chests_.push_back(cells[idx++]);
    for (int i = 0; i < coin_count && idx < cells.size(); ++i) coins_.push_back(cells[idx++]);
}

bool Maze::IsWall(int x, int y) const {
    if (x < 0 || y < 0 || x >= width_ || y >= height_) return true;
    return grid_[y][x] == kWall;
}

std::vector<Point> Maze::ShortestPath(Point from) const {
    std::vector<Point> path;
    if (width_ <= 0 || height_ <= 0) return path;
    if (IsWall(from.x, from.y)) return path;

    std::vector<std::vector<int>> prev(height_, std::vector<int>(width_, -1));
    std::vector<std::vector<bool>> seen(height_, std::vector<bool>(width_, false));
    std::deque<Point> queue;

    queue.push_back(from);
    seen[from.y][from.x] = true;

    const int dx[4] = {1, -1, 0, 0};
    const int dy[4] = {0, 0, 1, -1};
    while (!queue.empty()) {
        Point cur = queue.front();
        queue.pop_front();
        if (cur.x == goal_.x && cur.y == goal_.y) break;

        for (int i = 0; i < 4; ++i) {
            Point next{cur.x + dx[i], cur.y + dy[i]};
            if (IsWall(next.x, next.y) || seen[next.y][next.x]) continue;
            seen[next.y][next.x] = true;
            prev[next.y][next.x] = cur.y * width_ + cur.x;
            queue.push_back(next);
        }
    }

    if (!seen[goal_.y][goal_.x]) return path;

    for (Point p = goal_;;) {
        path.push_back(p);
        if (p.x == from.x && p.y == from.y) break;
        int id = prev[p.y][p.x];
        p = Point{id % width_, id / width_};
    }
    std::reverse(path.begin(), path.end());
    return path;
}

}  // namespace maze
