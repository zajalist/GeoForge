#pragma once

#include <vector>
#include <cmath>
#include <array>
#include <algorithm>
#include <numeric>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

namespace WilsonCycles {

// Basic 3D vector on unit sphere
struct Vec3 {
    double x, y, z;
    
    Vec3() : x(0), y(0), z(0) {}
    Vec3(double x, double y, double z) : x(x), y(y), z(z) {}
    
    Vec3 normalized() const {
        double len = std::sqrt(x*x + y*y + z*z);
        if (len < 1e-10) return Vec3(1, 0, 0);
        return Vec3(x/len, y/len, z/len);
    }
    
    double length() const {
        return std::sqrt(x*x + y*y + z*z);
    }
    
    double lengthSq() const {
        return x*x + y*y + z*z;
    }
    
    Vec3 operator+(const Vec3& v) const { return Vec3(x+v.x, y+v.y, z+v.z); }
    Vec3 operator-(const Vec3& v) const { return Vec3(x-v.x, y-v.y, z-v.z); }
    Vec3 operator*(double s) const { return Vec3(x*s, y*s, z*s); }
    Vec3 operator/(double s) const { return Vec3(x/s, y/s, z/s); }
    double dot(const Vec3& v) const { return x*v.x + y*v.y + z*v.z; }
    Vec3 cross(const Vec3& v) const { 
        return Vec3(y*v.z - z*v.y, z*v.x - x*v.z, x*v.y - y*v.x); 
    }
    Vec3 lerp(const Vec3& v, double t) const { return Vec3(x + (v.x-x)*t, y + (v.y-y)*t, z + (v.z-z)*t); }
};

// Latitude/Longitude representation
struct LatLon {
    double lat, lon;
    
    LatLon() : lat(0), lon(0) {}
    LatLon(double lat, double lon) : lat(lat), lon(lon) {}
    
    Vec3 toVec3() const {
        double lat_rad = lat * M_PI / 180.0;
        double lon_rad = lon * M_PI / 180.0;
        return Vec3(
            std::cos(lat_rad) * std::cos(lon_rad),
            std::cos(lat_rad) * std::sin(lon_rad),
            std::sin(lat_rad)
        );
    }
};

inline LatLon toLatLon(const Vec3& v) {
    double lat = std::asin(std::max(-1.0, std::min(1.0, v.z))) * 180.0 / M_PI;
    double lon = std::atan2(v.y, v.x) * 180.0 / M_PI;
    return LatLon(lat, lon);
}

// Great circle distance (radians)
inline double greatCircleDistance(const Vec3& a, const Vec3& b) {
    double dot = a.normalized().dot(b.normalized());
    return std::acos(std::max(-1.0, std::min(1.0, dot)));
}

// Slerp interpolation
inline Vec3 slerp(const Vec3& a, const Vec3& b, double t) {
    Vec3 an = a.normalized();
    Vec3 bn = b.normalized();
    double dot = std::max(-1.0, std::min(1.0, an.dot(bn)));
    if (dot > 0.9995) return an.lerp(bn, t).normalized();
    double theta = std::acos(dot);
    double sinTheta = std::sin(theta);
    double wA = std::sin((1.0 - t) * theta) / sinTheta;
    double wB = std::sin(t * theta) / sinTheta;
    return (an * wA + bn * wB).normalized();
}

// Euler rotation pole
struct EulerPole {
    double lat, lon;
    double angle;
    
    EulerPole() : lat(0), lon(0), angle(0) {}
    EulerPole(double lat, double lon, double angle) : lat(lat), lon(lon), angle(angle) {}
    
    Vec3 getAxis() const {
        return LatLon(lat, lon).toVec3();
    }
    
    Vec3 rotatePoint(const Vec3& p) const;
};

// A polyline
using Polyline = std::vector<Vec3>;

// A polygon
struct Polygon {
    Polyline boundary;
    
    bool contains(const Vec3& point) const;
    Polyline getOutline() const { return boundary; }
    double area() const;
    Vec3 centroid() const;
};

// Crust types
enum class CrustType {
    Continental,
    Oceanic,
    Mixed
};

// Plate types
enum class PlateType {
    Continental,
    Oceanic,
    Composite
};

// Wilson Cycle phase
enum class WilsonPhase {
    Embryonic,    // Continental rifting
    Young,        // Oceanic spreading
    Mature,       // Wide ocean basin
    Declining,    // Subduction initiation
    Terminal,     // Closing basin
    Suturing      // Continental collision
};

// Boundary segment type
enum class BoundaryType {
    Passive,
    Active,       // Subduction
    Divergent,    // Spreading
    Transform,
    Collision
};

// A boundary segment between two plates
struct BoundarySegment {
    int plateA;
    int plateB;
    BoundaryType type;
    Polyline geometry;
    double convergenceRate;  // cm/yr, positive = converging
    double age;              // Myr
};

// A plate in the simulation
struct Plate {
    int id;
    PlateType type;
    WilsonPhase phase;
    
    EulerPole eulerPole;
    Vec3 angularVelocity;    // omega vector for torque calculations
    
    std::vector<Polygon> continents;
    Polyline boundaries;
    
    // Crust properties
    CrustType crustType;
    double crustThickness;   // km
    double density;          // g/cm3
    double crustAge;         // Myr (for oceanic crust)
    
    // Dynamics
    double velocity;         // cm/yr
    double mass;             // relative mass for torque
    double area;             // relative area
    
    // Thermal
    double mantleTemp;       // relative mantle temperature below plate
    double heatProduction;   // radiogenic heat production
    
    // Collision tracking
    bool isColliding;
    double collisionForce;
    
    Plate() : id(-1), type(PlateType::Oceanic), phase(WilsonPhase::Mature),
              crustType(CrustType::Oceanic), crustThickness(7.0), density(3.0),
              crustAge(0), velocity(0), mass(1.0), area(1.0),
              mantleTemp(0), heatProduction(0),
              isColliding(false), collisionForce(0) {}
};

// Subduction zone
struct SubductionZone {
    int id;
    int subductingPlateId;
    int overridingPlateId;
    Polyline trenchLine;
    double dippingAngle;
    double age;
    double slabPullForce;
    bool isActive;
    double volcanicArcOffset;  // degrees from trench
    std::vector<Vec3> volcanicArcPoints;
    int trenchStartIndex;      // locked position on coastline, prevents drifting

    SubductionZone() : id(-1), subductingPlateId(-1), overridingPlateId(-1),
                       dippingAngle(45), age(0), slabPullForce(0), isActive(false),
                       volcanicArcOffset(2.0), trenchStartIndex(-1) {}
};

// Rift zone
struct RiftZone {
    int id;
    int plateA;
    int plateB;
    Polyline axis;
    double halfSpreadingRate;
    double age;
    double riftWidth;        // km
    bool isOceanic;          // true if seafloor spreading
    double magmaProduction;  // relative
    
    RiftZone() : id(-1), plateA(-1), plateB(-1), halfSpreadingRate(2), age(0),
                 riftWidth(0), isOceanic(false), magmaProduction(0) {}
};

// Collision zone
struct CollisionZone {
    int id;
    int plate1Id;
    int plate2Id;
    Polyline boundaryLine;
    double orogenyHeight;
    double age;
    double shortening;       // km of crustal shortening
    
    enum class OrogenyType {
        Andean,
        Ural,
        Himalayan,
        Laramide
    } type;
    
    std::vector<Vec3> mountainRange;
    bool isSutured;
    
    CollisionZone() : id(-1), plate1Id(-1), plate2Id(-1), orogenyHeight(4), age(0),
                      shortening(0), type(OrogenyType::Ural), isSutured(false) {}
};

// Craton
struct Craton {
    int id;
    Vec3 center;
    double radius;
    Polygon boundary;
    double age;              // Ga (billion years)
    double thickness;        // km
    
    Craton() : id(-1), radius(0.1), age(2.5), thickness(200) {}
};

// Mantle plume
struct MantlePlume {
    int id;
    Vec3 center;
    double strength;         // relative
    double radius;           // degrees
    double age;
    bool isActive;
    double heatFlux;
    
    MantlePlume() : id(-1), strength(1.0), radius(10), age(0), isActive(true), heatFlux(0) {}
};

// Suture zone (permanent scar from past collisions)
struct SutureZone {
    int id;
    Polyline geometry;
    double age;              // when it formed
    double weakness;         // 0-1, how weak this zone is
    
    SutureZone() : id(-1), age(0), weakness(0.5) {}
};

}  // namespace WilsonCycles
