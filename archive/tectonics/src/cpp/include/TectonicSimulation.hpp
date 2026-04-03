#pragma once

#include "GeoTypes.hpp"
#include <unordered_map>
#include <unordered_set>
#include <memory>
#include <random>

namespace WilsonCycles {

class TectonicSimulation {
public:
    TectonicSimulation();
    
    void initializeSupercontinent(const Polygon& continentShape, const std::vector<Craton>& cratons);
    void addCraton(const Craton& craton);
    
    void step(double timeStep);
    
    const std::vector<Plate>& getPlates() const { return plates; }
    const std::vector<SubductionZone>& getSubductionZones() const { return subductionZones; }
    const std::vector<RiftZone>& getRiftZones() const { return riftZones; }
    const std::vector<CollisionZone>& getCollisionZones() const { return collisionZones; }
    const std::vector<Craton>& getCratons() const { return cratons; }
    const std::vector<MantlePlume>& getMantlePlumes() const { return mantlePlumes; }
    const std::vector<SutureZone>& getSutureZones() const { return sutureZones; }
    const std::vector<BoundarySegment>& getBoundaries() const { return boundaries; }
    
    double getCurrentTime() const { return currentTime; }
    int getPlateCount() const { return (int)plates.size(); }
    int getSubductionZoneCount() const { return (int)subductionZones.size(); }
    int getRiftZoneCount() const { return (int)riftZones.size(); }
    int getCollisionZoneCount() const { return (int)collisionZones.size(); }
    int getCratonCount() const { return (int)cratons.size(); }
    int getPlumeCount() const { return (int)mantlePlumes.size(); }
    int getSutureCount() const { return (int)sutureZones.size(); }
    
    void reset();
    
    // Visualization data accessors
    std::vector<double> getPlateContinentLats(int plateIdx, int continentIdx) const;
    std::vector<double> getPlateContinentLons(int plateIdx, int continentIdx) const;
    std::vector<double> getSubductionZoneLats(int zoneIdx) const;
    std::vector<double> getSubductionZoneLons(int zoneIdx) const;
    std::vector<double> getSubductionVolcanicArcLats(int zoneIdx) const;
    std::vector<double> getSubductionVolcanicArcLons(int zoneIdx) const;
    std::vector<double> getRiftZoneLats(int zoneIdx) const;
    std::vector<double> getRiftZoneLons(int zoneIdx) const;
    std::vector<double> getCollisionZoneLats(int zoneIdx) const;
    std::vector<double> getCollisionZoneLons(int zoneIdx) const;
    std::vector<double> getMountainRangeLats(int zoneIdx) const;
    std::vector<double> getMountainRangeLons(int zoneIdx) const;
    std::vector<double> getPlumeLats(int idx) const;
    std::vector<double> getPlumeLons(int idx) const;
    std::vector<double> getSutureZoneLats(int idx) const;
    std::vector<double> getSutureZoneLons(int idx) const;
    std::vector<double> getBoundaryLats(int idx) const;
    std::vector<double> getBoundaryLons(int idx) const;
    double getCratonLat(int idx) const;
    double getCratonLon(int idx) const;
    
    double getContinentElevation(int plateIdx, int continentIdx) const;
    double getOceanAge(int plateIdx) const;
    int getPlateType(int plateIdx) const;
    int getWilsonPhase(int plateIdx) const;
    double getMountainHeight(int zoneIdx) const;
    bool isMountainSutured(int zoneIdx) const;
    bool isRiftZoneOceanic(int zoneIdx) const;
    
private:
    std::vector<Plate> plates;
    std::vector<SubductionZone> subductionZones;
    std::vector<RiftZone> riftZones;
    std::vector<CollisionZone> collisionZones;
    std::vector<Craton> cratons;
    std::vector<MantlePlume> mantlePlumes;
    std::vector<SutureZone> sutureZones;
    std::vector<BoundarySegment> boundaries;
    
    double currentTime;
    int nextPlateId;
    int nextSubductionId;
    int nextRiftId;
    int nextCollisionId;
    int nextPlumeId;
    int nextSutureId;
    int nextBoundaryId;
    
    std::mt19937 rng;
    std::unordered_map<int, int> cratonPlateOwner;
    std::unordered_set<int> completedRiftSplits;
    
    void updatePlateMotion(double dt);
    void solveTorqueBalance(double dt);
    void updateCrustAge(double dt);
    void updateThermalState(double dt);
    
    void detectPlateBoundaries();
    void classifyBoundaries();
    
    void detectAndProcessRifting(double dt);
    void processSpreading(double dt);
    void detectSubductionInitiation();
    void processSubduction(double dt);
    void detectCollisions();
    void processCollisions(double dt);
    void processSuturing(double dt);
    
    void updateMantlePlumes(double dt);
    void generateNewPlumes();
    bool splitContinentalPlateAlongRift(RiftZone& zone);
    int pickPlateForCraton(const Craton& craton) const;
    
    double greatCircleDist(const Vec3& a, const Vec3& b) const;
    Vec3 midpointOnSphere(const Vec3& a, const Vec3& b) const;
    bool polygonsOverlap(const Polygon& p1, const Polygon& p2) const;
    double polygonsOverlapAmount(const Polygon& p1, const Polygon& p2) const;
    Vec3 projectToSphere(const Vec3& v) const;
    double angleBetween(const Vec3& a, const Vec3& b) const;
    Polyline subdivideArc(const Vec3& start, const Vec3& end, int segments) const;
    Vec3 offsetPoint(const Vec3& point, const Vec3& direction, double angleRad) const;
    bool isPointNearPolyline(const Vec3& point, const Polyline& line, double threshold) const;
    Polyline offsetPolyline(const Polyline& line, const Vec3& normal, double angleRad) const;
    double randomDouble(double min, double max);
    Vec3 randomPointOnSphere();
};

}  // namespace WilsonCycles
