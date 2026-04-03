#include "../include/GeoTypes.hpp"
#include <cmath>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

namespace WilsonCycles {

Vec3 EulerPole::rotatePoint(const Vec3& p) const {
    Vec3 k = getAxis();
    double theta = angle * M_PI / 180.0;
    
    double cos_theta = std::cos(theta);
    double sin_theta = std::sin(theta);
    
    Vec3 k_cross_v = k.cross(p);
    double k_dot_v = k.dot(p);
    
    Vec3 rotated = p * cos_theta + k_cross_v * sin_theta + k * (k_dot_v * (1.0 - cos_theta));
    return rotated.normalized();
}

bool Polygon::contains(const Vec3& point) const {
    if (boundary.size() < 3) return false;
    
    double angleSum = 0;
    Vec3 p = point.normalized();
    
    for (size_t i = 0; i < boundary.size(); ++i) {
        size_t next = (i + 1) % boundary.size();
        Vec3 vi = boundary[i].normalized();
        Vec3 vj = boundary[next].normalized();
        
        Vec3 a = (vi - p * vi.dot(p)).normalized();
        Vec3 b = (vj - p * vj.dot(p)).normalized();
        
        if (a.length() < 1e-10 || b.length() < 1e-10) continue;
        
        Vec3 cr = a.cross(b);
        double sinAngle = cr.dot(p);
        double cosAngle = std::max(-1.0, std::min(1.0, a.dot(b)));
        angleSum += std::atan2(sinAngle, cosAngle);
    }
    
    return std::abs(angleSum) > M_PI;
}

double Polygon::area() const {
    if (boundary.size() < 3) return 0.0;
    
    double angleSum = 0;
    size_t n = boundary.size();
    
    for (size_t i = 0; i < n; ++i) {
        Vec3 prev = boundary[(i + n - 1) % n].normalized();
        Vec3 curr = boundary[i].normalized();
        Vec3 next = boundary[(i + 1) % n].normalized();
        
        Vec3 a = (prev - curr * curr.dot(prev)).normalized();
        Vec3 b = (next - curr * curr.dot(next)).normalized();
        
        if (a.length() < 1e-10 || b.length() < 1e-10) continue;
        
        double cosAngle = std::max(-1.0, std::min(1.0, a.dot(b)));
        angleSum += std::acos(cosAngle);
    }
    
    double area = angleSum - ((double)n - 2.0) * M_PI;
    return std::abs(area);
}

Vec3 Polygon::centroid() const {
    if (boundary.empty()) return Vec3(1, 0, 0);
    
    Vec3 sum;
    double n = (double)boundary.size();
    for (const auto& pt : boundary) {
        Vec3 np = pt.normalized();
        sum = Vec3(sum.x + np.x, sum.y + np.y, sum.z + np.z);
    }
    return Vec3(sum.x / n, sum.y / n, sum.z / n).normalized();
}

}  // namespace WilsonCycles
