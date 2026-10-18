#pragma once

#include <random>
#include <string>
#include <vector>

namespace maze {

struct Point {
    int x = 0;
    int y = 0;

    bool operator==(const Point& o) const { return x == o.x && y == o.y; }
    bool operator!=(const Point& o) const { return !(*this == o); }
};

/// 随机迷宫：递归回溯生成 + BFS 求解
class Maze {
public:
    static constexpr char kWall = '#';
    static constexpr char kRoad = '.';

    Maze() = default;
    Maze(int width, int height) { Generate(width, height); }

    /// 生成迷宫（宽高自动调整为奇数）
    void Generate(int width, int height);

    int Width() const { return width_; }
    int Height() const { return height_; }
    Point Start() const { return start_; }
    Point Goal() const { return goal_; }

    /// 每行一个字符串，字符为 kWall / kRoad
    const std::vector<std::string>& Grid() const { return grid_; }

    /// 散布在通路上的金币与宝箱
    const std::vector<Point>& Coins() const { return coins_; }
    const std::vector<Point>& Chests() const { return chests_; }

    bool IsWall(int x, int y) const;

    /// 从 from 到终点的最短路径（含起点与终点），不可达时返回空
    std::vector<Point> ShortestPath(Point from) const;

private:
    /// 在通路上随机投放金币与宝箱
    void PlaceItems(std::mt19937& rng);

    int width_ = 0;
    int height_ = 0;
    Point start_{1, 1};
    Point goal_{1, 1};
    std::vector<std::string> grid_;
    std::vector<Point> coins_;
    std::vector<Point> chests_;
};

}  // namespace maze
