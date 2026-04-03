#include "../include/TectonicSimulation.hpp"

#include <algorithm>
#include <cmath>
#include <limits>
#include <unordered_map>

namespace WilsonCycles {
namespace {
constexpr double kDegToRad = M_PI / 180.0;
constexpr double kRadToDeg = 180.0 / M_PI;

bool samePair(int a, int b, int x, int y) {
    return (a == x && b == y) || (a == y && b == x);
}

bool sameDirectedPair(int a, int b, int x, int y) {
    return a == x && b == y;
}
}  // namespace

TectonicSimulation::TectonicSimulation()
    : currentTime(0.0),
      nextPlateId(0),
      nextSubductionId(0),
      nextRiftId(0),
      nextCollisionId(0),
      nextPlumeId(0),
      nextSutureId(0),
      nextBoundaryId(0),
      rng(std::random_device{}()) {}

void TectonicSimulation::initializeSupercontinent(const Polygon& continentShape, const std::vector<Craton>& inputCratons) {
    reset();

    Plate continental;
    continental.id = nextPlateId++;
    continental.type = PlateType::Continental;
    continental.phase = WilsonPhase::Embryonic;
    continental.eulerPole = EulerPole(35.0, -20.0, 0.22);
    continental.angularVelocity = continental.eulerPole.getAxis() * (continental.eulerPole.angle * kDegToRad);
    continental.continents.push_back(continentShape);
    continental.boundaries = continentShape.boundary;
    continental.crustType = CrustType::Continental;
    continental.crustThickness = 42.0;
    continental.density = 2.82;
    continental.crustAge = 150.0;
    continental.velocity = 1.8;
    continental.mass = 1.4;
    continental.area = std::max(0.25, continentShape.area());
    continental.mantleTemp = 0.72;
    continental.heatProduction = 0.48;
    plates.push_back(continental);

    Plate oceanic;
    oceanic.id = nextPlateId++;
    oceanic.type = PlateType::Oceanic;
    oceanic.phase = WilsonPhase::Young;
    oceanic.eulerPole = EulerPole(-18.0, 108.0, -0.38);
    oceanic.angularVelocity = oceanic.eulerPole.getAxis() * (oceanic.eulerPole.angle * kDegToRad);
    oceanic.continents.clear();
    oceanic.boundaries = offsetPolyline(continentShape.boundary, continentShape.centroid(), 7.0 * kDegToRad);
    if (oceanic.boundaries.empty()) {
        oceanic.boundaries = continentShape.boundary;
    }
    oceanic.crustType = CrustType::Oceanic;
    oceanic.crustThickness = 7.0;
    oceanic.density = 3.03;
    oceanic.crustAge = 12.0;
    oceanic.velocity = 4.2;
    oceanic.mass = 0.9;
    oceanic.area = std::max(1.0, 4.0 * M_PI - continental.area);
    oceanic.mantleTemp = 1.02;
    oceanic.heatProduction = 0.12;
    plates.push_back(oceanic);

    cratons.clear();
    cratonPlateOwner.clear();
    completedRiftSplits.clear();
    cratons.reserve(inputCratons.size());
    for (size_t i = 0; i < inputCratons.size(); ++i) {
        Craton copy = inputCratons[i];
        copy.id = static_cast<int>(i);
        cratons.push_back(copy);
        cratonPlateOwner[copy.id] = continental.id;
    }

    detectPlateBoundaries();
    classifyBoundaries();

    // Seed the first rift and subduction system immediately at simulation start.
    detectAndProcessRifting(1.0);
    detectSubductionInitiation();
    processSubduction(0.5);
}

void TectonicSimulation::addCraton(const Craton& craton) {
    Craton copy = craton;
    copy.id = static_cast<int>(cratons.size());
    copy.radius = std::max(0.01, copy.radius);
    cratons.push_back(copy);
    cratonPlateOwner[copy.id] = pickPlateForCraton(copy);
}

void TectonicSimulation::step(double timeStep) {
    if (std::abs(timeStep) < 1e-9 || plates.empty()) {
        return;
    }

    // PHASE 1: Apply Euler-pole rotation to all plate-attached geometry.
    // subduction trench/arc moves with overriding plate (done inside).
    // Rift axes stay FIXED in global space — not rotated.
    updatePlateMotion(timeStep);
    solveTorqueBalance(timeStep);
    updateCrustAge(timeStep);
    updateThermalState(timeStep);

    // PHASE 2: Rebuild boundary lines from current plate positions so they
    // track moving continents and don't glitch/teleport.
    detectPlateBoundaries();
    classifyBoundaries();

    // PHASE 3: Rift zones are FIXED (mid-ocean ridges don't move).
    // Only create NEW rifts; existing axes are never recalculated.
    detectAndProcessRifting(timeStep);
    processSpreading(timeStep);

    // PHASE 4: Subduction zones already move with the overriding plate
    // (rotated in updatePlateMotion). Only create NEW zones here.
    detectSubductionInitiation();
    processSubduction(timeStep);

    // PHASE 5: Collision and suturing
    detectCollisions();
    processCollisions(timeStep);
    processSuturing(timeStep);

    updateMantlePlumes(timeStep);

    currentTime = std::max(0.0, currentTime + timeStep);
}

void TectonicSimulation::updatePlateMotion(double dt) {
    constexpr double velocityToAngle = 1.0 / 111.0 / 1000.0;
    constexpr double baseRotationRate = 0.5;

    // Compute each plate's incremental rotation ONCE, reuse for all attached geometry.
    std::unordered_map<int, EulerPole> stepRotations;
    stepRotations.reserve(plates.size());
    for (const auto& plate : plates) {
        double angleStep = (plate.velocity * velocityToAngle + baseRotationRate) * dt;
        stepRotations[plate.id] = EulerPole(plate.eulerPole.lat, plate.eulerPole.lon, angleStep);
    }

    // Rotate continent boundaries and plate boundary polylines.
    for (auto& plate : plates) {
        const EulerPole& stepPole = stepRotations.at(plate.id);
        for (auto& continent : plate.continents) {
            for (auto& point : continent.boundary) {
                point = stepPole.rotatePoint(point);
            }
        }
        for (auto& point : plate.boundaries) {
            point = stepPole.rotatePoint(point);
        }
        double angleStep = (plate.velocity * velocityToAngle + baseRotationRate) * dt;
        plate.angularVelocity = plate.eulerPole.getAxis() * (angleStep * kDegToRad);
    }

    // Rotate cratons with their owner plate.
    for (auto& craton : cratons) {
        if (plates.empty()) break;

        int ownerPlateId = -1;
        auto ownerIt = cratonPlateOwner.find(craton.id);
        if (ownerIt != cratonPlateOwner.end()) {
            ownerPlateId = ownerIt->second;
        }

        auto plateIt = std::find_if(plates.begin(), plates.end(),
            [&](const Plate& p) { return p.id == ownerPlateId; });

        if (plateIt == plates.end()) {
            ownerPlateId = pickPlateForCraton(craton);
            if (ownerPlateId >= 0) {
                cratonPlateOwner[craton.id] = ownerPlateId;
                plateIt = std::find_if(plates.begin(), plates.end(),
                    [&](const Plate& p) { return p.id == ownerPlateId; });
            }
        }

        if (plateIt == plates.end()) continue;

        auto rotIt = stepRotations.find(ownerPlateId);
        if (rotIt == stepRotations.end()) continue;

        const EulerPole& stepPole = rotIt->second;
        craton.center = stepPole.rotatePoint(craton.center);
        for (auto& point : craton.boundary.boundary) {
            point = stepPole.rotatePoint(point);
        }
    }

    // Rotate subduction trench + volcanic arc with the OVERRIDING plate.
    // Rift zones are intentionally NOT rotated — they are fixed in global space
    // (mid-ocean ridges don't move; they're the reference frame).
    for (auto& zone : subductionZones) {
        auto rotIt = stepRotations.find(zone.overridingPlateId);
        if (rotIt == stepRotations.end()) continue;
        const EulerPole& stepPole = rotIt->second;
        for (auto& pt : zone.trenchLine) {
            pt = stepPole.rotatePoint(pt);
        }
        for (auto& pt : zone.volcanicArcPoints) {
            pt = stepPole.rotatePoint(pt);
        }
    }

    // Rotate collision zone boundaries + mountain ranges with plate1.
    for (auto& zone : collisionZones) {
        auto rotIt = stepRotations.find(zone.plate1Id);
        if (rotIt == stepRotations.end()) continue;
        const EulerPole& stepPole = rotIt->second;
        for (auto& pt : zone.boundaryLine) {
            pt = stepPole.rotatePoint(pt);
        }
        for (auto& pt : zone.mountainRange) {
            pt = stepPole.rotatePoint(pt);
        }
    }
}

void TectonicSimulation::solveTorqueBalance(double dt) {
    const double dtAbs = std::abs(dt);

    for (auto& plate : plates) {
        double slabPull = 0.0;
        double ridgePush = 0.0;
        double collisionDrag = 0.0;
        double plumeBoost = 0.0;

        for (const auto& zone : subductionZones) {
            if (zone.subductingPlateId == plate.id) {
                slabPull += zone.slabPullForce;
            }
            if (zone.overridingPlateId == plate.id) {
                slabPull += zone.slabPullForce * 0.2;
            }
        }

        for (const auto& zone : riftZones) {
            if (zone.plateA == plate.id || zone.plateB == plate.id) {
                ridgePush += zone.halfSpreadingRate * 0.35;
            }
        }

        for (const auto& zone : collisionZones) {
            if (zone.plate1Id == plate.id || zone.plate2Id == plate.id) {
                collisionDrag += zone.orogenyHeight * 0.45;
            }
        }

        for (const auto& plume : mantlePlumes) {
            if (!plume.isActive || plate.continents.empty()) {
                continue;
            }
            const double d = greatCircleDist(plate.continents.front().centroid(), plume.center);
            const double radiusRad = std::max(1.0, plume.radius) * kDegToRad;
            if (d < radiusRad) {
                plumeBoost += plume.strength * (1.0 - (d / radiusRad));
            }
        }

        const double mantleDrag = plate.velocity * 0.16;
        const double netTorque = slabPull + ridgePush + plumeBoost - collisionDrag - mantleDrag;

        plate.velocity = std::clamp(plate.velocity + netTorque * 0.02 * dt, 0.2, 13.0);
        plate.eulerPole.angle = std::clamp(plate.eulerPole.angle + netTorque * 0.007 * dt, -3.5, 3.5);

        plate.eulerPole.lon += plate.velocity * 0.008 * dt;
        while (plate.eulerPole.lon > 180.0) plate.eulerPole.lon -= 360.0;
        while (plate.eulerPole.lon < -180.0) plate.eulerPole.lon += 360.0;

        plate.eulerPole.lat = std::clamp(
            plate.eulerPole.lat + netTorque * 0.003 * dt,
            -85.0,
            85.0
        );

        plate.angularVelocity = plate.eulerPole.getAxis() * (plate.eulerPole.angle * kDegToRad);
    }
}

void TectonicSimulation::updateCrustAge(double dt) {
    for (auto& plate : plates) {
        const double scale = (plate.type == PlateType::Oceanic) ? 1.0 : 0.15;
        plate.crustAge = std::max(0.0, plate.crustAge + dt * scale);
    }
}

void TectonicSimulation::updateThermalState(double dt) {
    const double dtAbs = std::abs(dt);

    for (auto& plate : plates) {
        if (plate.type == PlateType::Oceanic) {
            const double cooling = std::sqrt(std::max(1.0, plate.crustAge));
            plate.crustThickness = std::clamp(6.5 + 0.32 * cooling, 6.5, 16.0);
            plate.density = std::clamp(2.95 + plate.crustAge * 0.0009, 2.95, 3.30);
            plate.mantleTemp = std::clamp(1.18 - 0.0026 * plate.crustAge, 0.35, 1.18);

            if (plate.crustAge < 30.0) {
                plate.phase = WilsonPhase::Young;
            } else if (plate.crustAge < 90.0) {
                plate.phase = WilsonPhase::Mature;
            } else {
                plate.phase = WilsonPhase::Declining;
            }
        } else {
            plate.crustThickness = std::clamp(plate.crustThickness + 0.004 * dt, 28.0, 68.0);
            plate.density = std::clamp(2.76 + plate.crustThickness * 0.0015, 2.72, 3.05);
            plate.mantleTemp = std::clamp(plate.mantleTemp + 0.0008 * dtAbs, 0.45, 1.3);
        }
    }
}

void TectonicSimulation::detectPlateBoundaries() {
    boundaries.clear();

    if (plates.size() < 2) {
        return;
    }

    for (size_t i = 0; i < plates.size(); ++i) {
        for (size_t j = i + 1; j < plates.size(); ++j) {
            const Plate& a = plates[i];
            const Plate& b = plates[j];

            const bool aContinental = a.type == PlateType::Continental && !a.continents.empty();
            const bool bContinental = b.type == PlateType::Continental && !b.continents.empty();
            const bool aOceanic = a.type == PlateType::Oceanic;
            const bool bOceanic = b.type == PlateType::Oceanic;

            // Build coastline-following boundaries for continental-oceanic contacts.
            if ((aContinental && bOceanic) || (bContinental && aOceanic)) {
                const Plate& continental = aContinental ? a : b;
                const Polygon& coast = continental.continents.front();
                const size_t n = coast.boundary.size();
                if (n >= 4) {
                    const int window = std::max(6, std::min(36, static_cast<int>(n / 2)));
                    // Use deterministic, fixed sampling based on plate IDs, NOT time
                    // This ensures boundary geometry stays stable
                    const int start = (a.id * 17 + b.id * 31) % static_cast<int>(n);

                    BoundarySegment segment;
                    segment.plateA = a.id;
                    segment.plateB = b.id;
                    segment.type = BoundaryType::Passive;
                    segment.convergenceRate = 0.0;
                    segment.age = currentTime;

                    for (int k = 0; k <= window; ++k) {
                        const int idx = (start + k) % static_cast<int>(n);
                        segment.geometry.push_back(coast.boundary[idx]);
                    }

                    if (!segment.geometry.empty()) {
                        boundaries.push_back(segment);
                    }
                }
                continue;
            }

            if (a.continents.empty() || b.continents.empty()) {
                continue;
            }

            for (const auto& contA : a.continents) {
                for (const auto& contB : b.continents) {
                    if (contA.boundary.empty() || contB.boundary.empty()) {
                        continue;
                    }

                    const Vec3 cA = contA.centroid();
                    const Vec3 cB = contB.centroid();
                    const double dist = greatCircleDist(cA, cB);
                    if (dist > 1.9) {
                        continue;
                    }

                    BoundarySegment segment;
                    segment.plateA = a.id;
                    segment.plateB = b.id;
                    segment.type = BoundaryType::Passive;
                    segment.convergenceRate = 0.0;
                    segment.age = currentTime;

                    const Vec3 midpoint = midpointOnSphere(cA, cB);
                    const Vec3 tangent = projectToSphere(cB - cA);
                    const double extent = std::max(0.08, std::min(0.45, dist * 0.35));

                    const Vec3 start = offsetPoint(midpoint, tangent, -extent);
                    const Vec3 end = offsetPoint(midpoint, tangent, extent);
                    segment.geometry = subdivideArc(start, end, 20);

                    if (!segment.geometry.empty()) {
                        boundaries.push_back(segment);
                    }
                }
            }
        }
    }

    if (boundaries.empty() && plates.size() >= 2) {
        BoundarySegment fallback;
        fallback.plateA = plates[0].id;
        fallback.plateB = plates[1].id;
        fallback.type = BoundaryType::Passive;
        fallback.convergenceRate = 0.0;
        fallback.age = currentTime;

        Vec3 a = plates[0].continents.empty() ? randomPointOnSphere() : plates[0].continents.front().centroid();
        Vec3 b = plates[1].continents.empty() ? randomPointOnSphere() : plates[1].continents.front().centroid();
        fallback.geometry = subdivideArc(a, b, 12);
        boundaries.push_back(fallback);
    }
}

void TectonicSimulation::classifyBoundaries() {
    std::unordered_map<int, Plate*> plateById;
    for (auto& plate : plates) {
        plateById[plate.id] = &plate;
    }

    for (auto& boundary : boundaries) {
        auto itA = plateById.find(boundary.plateA);
        auto itB = plateById.find(boundary.plateB);
        if (itA == plateById.end() || itB == plateById.end()) {
            continue;
        }

        Plate* plateA = itA->second;
        Plate* plateB = itB->second;

        Vec3 sample = boundary.geometry.empty()
            ? midpointOnSphere(
                plateA->continents.empty() ? randomPointOnSphere() : plateA->continents.front().centroid(),
                plateB->continents.empty() ? randomPointOnSphere() : plateB->continents.front().centroid())
            : boundary.geometry[boundary.geometry.size() / 2];

        const Vec3 refDir = projectToSphere(
            (plateB->continents.empty() ? sample : plateB->continents.front().centroid()) -
            (plateA->continents.empty() ? sample : plateA->continents.front().centroid())
        );

        const Vec3 velA = plateA->angularVelocity.cross(sample);
        const Vec3 velB = plateB->angularVelocity.cross(sample);
        const Vec3 rel = velB - velA;

        const double convergence = rel.dot(refDir) * 220.0;
        boundary.convergenceRate = convergence;

        const bool bothContinental = plateA->type == PlateType::Continental && plateB->type == PlateType::Continental;

        if (convergence > 0.45) {
            boundary.type = bothContinental ? BoundaryType::Collision : BoundaryType::Active;
        } else if (convergence < -0.45) {
            boundary.type = BoundaryType::Divergent;
        } else {
            const double strikeSlip = rel.cross(sample).length();
            boundary.type = strikeSlip > 0.003 ? BoundaryType::Transform : BoundaryType::Passive;
        }
    }
}

void TectonicSimulation::detectAndProcessRifting(double dt) {
    std::vector<RiftZone> updated;
    std::unordered_set<int> carriedCompletedSplitZones;

    for (const auto& zone : riftZones) {
        if (completedRiftSplits.find(zone.id) == completedRiftSplits.end()) {
            continue;
        }

        RiftZone carried = zone;
        carried.age += std::abs(dt);
        carried.riftWidth += carried.halfSpreadingRate * std::abs(dt) * 1.4;
        carried.isOceanic = true;
        carried.magmaProduction = std::clamp(0.25 + carried.halfSpreadingRate * 0.08, 0.2, 1.0);
        updated.push_back(carried);
        carriedCompletedSplitZones.insert(carried.id);
    }

    auto isInsideAnyCraton = [&](const Vec3& point) {
        for (const auto& craton : cratons) {
            if (greatCircleDist(point, craton.center) <= craton.radius * 1.05) {
                return true;
            }
            if (craton.boundary.boundary.size() >= 3 && craton.boundary.contains(point)) {
                return true;
            }
        }
        return false;
    };

    auto minCratonClearance = [&](const Vec3& point) {
        if (cratons.empty()) {
            return 1.5;
        }
        double best = std::numeric_limits<double>::infinity();
        for (const auto& craton : cratons) {
            const double d = greatCircleDist(point, craton.center) - craton.radius;
            best = std::min(best, d);
        }
        return best;
    };

    auto segmentHitsCraton = [&](const Vec3& a, const Vec3& b) {
        for (int i = 1; i < 10; ++i) {
            const double t = static_cast<double>(i) / 10.0;
            const Vec3 sample = slerp(a, b, t);
            if (isInsideAnyCraton(sample)) {
                return true;
            }
        }
        return false;
    };

    auto segmentLeavesContinent = [&](const Vec3& a, const Vec3& b, const Polygon& continent) {
        for (int i = 2; i < 8; ++i) {
            const double t = static_cast<double>(i) / 10.0;
            const Vec3 sample = slerp(a, b, t);
            if (!continent.contains(sample)) {
                return true;
            }
        }
        return false;
    };

    for (auto& continental : plates) {
        if (continental.type != PlateType::Continental || continental.continents.empty()) {
            continue;
        }

        // Check if this plate already HAS a rift zone
        // If it does, the rift axis is LOCKED and FIXED - do NOT recalculate it
        bool alreadyHasRift = false;
        for (const auto& zone : riftZones) {
            if (zone.plateA == continental.id) {
                if (carriedCompletedSplitZones.count(zone.id)) {
                    // Already carried in the completed-splits pass above — don't duplicate.
                    alreadyHasRift = true;
                } else {
                    // Carry this rift forward with LOCKED axis — never recalculate.
                    RiftZone carried = zone;
                    carried.age += std::abs(dt);
                    carried.riftWidth += carried.halfSpreadingRate * std::abs(dt) * 1.6;
                    carried.isOceanic = zone.age > 35.0;
                    carried.magmaProduction = std::clamp(0.32 + carried.halfSpreadingRate * 0.09, 0.2, 1.0);
                    updated.push_back(carried);
                    alreadyHasRift = true;
                }
                break;
            }
        }
        if (alreadyHasRift) {
            continue;
        }

        const Polygon& continent = continental.continents.front();
        const size_t n = continent.boundary.size();
        if (n < 6) {
            continue;
        }

        int coupledPlateId = continental.id;
        double bestCoupleMetric = std::numeric_limits<double>::infinity();
        const Vec3 continentCenter = continent.centroid();

        for (const auto& candidate : plates) {
            if (candidate.id == continental.id || candidate.type != PlateType::Oceanic) {
                continue;
            }

            Vec3 oceanRef = candidate.boundaries.empty()
                ? candidate.eulerPole.getAxis()
                : candidate.boundaries[candidate.boundaries.size() / 2];

            const double d = greatCircleDist(continentCenter, oceanRef);
            if (d < bestCoupleMetric) {
                bestCoupleMetric = d;
                coupledPlateId = candidate.id;
            }
        }

        int bestStart = 0;
        int bestEnd = static_cast<int>(n / 2);
        double bestScore = -1e9;

        for (size_t i = 0; i < n; ++i) {
            if (i % std::max<size_t>(1, n / 24) != 0) {
                continue;
            }

            const size_t opposite = (i + n / 2) % n;
            for (int offset = -static_cast<int>(n / 8); offset <= static_cast<int>(n / 8); ++offset) {
                const int j = (static_cast<int>(opposite) + offset + static_cast<int>(n)) % static_cast<int>(n);
                if (j == static_cast<int>(i)) {
                    continue;
                }

                const Vec3 a = continent.boundary[i];
                const Vec3 b = continent.boundary[static_cast<size_t>(j)];
                const double separation = greatCircleDist(a, b);
                const double clearance = std::min(minCratonClearance(a), minCratonClearance(b));
                const double score = separation + 0.25 * clearance;

                if (score > bestScore) {
                    bestScore = score;
                    bestStart = static_cast<int>(i);
                    bestEnd = j;
                }
            }
        }

        const Vec3 start = continent.boundary[static_cast<size_t>(bestStart)];
        const Vec3 end = continent.boundary[static_cast<size_t>(bestEnd)];

        const int layers = 18;
        std::vector<std::vector<Vec3>> layerPoints(static_cast<size_t>(layers + 1));
        std::vector<std::vector<int>> layerLanes(static_cast<size_t>(layers + 1));

        for (int layer = 0; layer <= layers; ++layer) {
            if (layer == 0) {
                layerPoints[static_cast<size_t>(layer)].push_back(start);
                layerLanes[static_cast<size_t>(layer)].push_back(0);
                continue;
            }
            if (layer == layers) {
                layerPoints[static_cast<size_t>(layer)].push_back(end);
                layerLanes[static_cast<size_t>(layer)].push_back(0);
                continue;
            }

            const double t = static_cast<double>(layer) / static_cast<double>(layers);
            const double envelope = std::sin(t * M_PI);
            const Vec3 base = slerp(start, end, t);

            Vec3 inward = projectToSphere(continentCenter - base);
            if (inward.lengthSq() < 1e-12) {
                inward = projectToSphere(continentCenter);
            }

            Vec3 lateral = projectToSphere(base.cross(inward));
            if (lateral.lengthSq() < 1e-12) {
                lateral = projectToSphere(inward.cross(base));
            }

            for (int lane = -3; lane <= 3; ++lane) {
                const double laneDeg = 0.55 * static_cast<double>(lane) * envelope;
                const double zigDeg =
                    ((layer % 2 == 0) ? 1.0 : -1.0) *
                    (0.50 + 0.25 * std::sin((layer + std::abs(lane)) * 1.17)) *
                    envelope;

                Vec3 candidate = offsetPoint(base, lateral, (laneDeg + zigDeg) * kDegToRad);
                candidate = offsetPoint(candidate, inward, 0.24 * std::sin(layer * 0.9 + lane * 0.7) * kDegToRad);

                int pullAttempts = 0;
                while (!continent.contains(candidate) && pullAttempts < 6) {
                    candidate = midpointOnSphere(candidate, continentCenter);
                    ++pullAttempts;
                }

                if (!continent.contains(candidate) || isInsideAnyCraton(candidate)) {
                    continue;
                }

                if (!layerPoints[static_cast<size_t>(layer)].empty()) {
                    const Vec3& prev = layerPoints[static_cast<size_t>(layer)].back();
                    if (greatCircleDist(prev, candidate) < 0.012) {
                        continue;
                    }
                }

                layerPoints[static_cast<size_t>(layer)].push_back(candidate);
                layerLanes[static_cast<size_t>(layer)].push_back(lane);
            }

            if (layerPoints[static_cast<size_t>(layer)].empty()) {
                Vec3 fallback = midpointOnSphere(base, continentCenter);
                int pullAttempts = 0;
                while ((!continent.contains(fallback) || isInsideAnyCraton(fallback)) && pullAttempts < 8) {
                    fallback = midpointOnSphere(fallback, continentCenter);
                    ++pullAttempts;
                }

                if (!continent.contains(fallback) || isInsideAnyCraton(fallback)) {
                    fallback = midpointOnSphere(base, continentCenter);
                }

                layerPoints[static_cast<size_t>(layer)].push_back(fallback);
                layerLanes[static_cast<size_t>(layer)].push_back(0);
            }
        }

        const double kInf = std::numeric_limits<double>::infinity();
        std::vector<std::vector<double>> cost(static_cast<size_t>(layers + 1));
        std::vector<std::vector<int>> parent(static_cast<size_t>(layers + 1));

        for (int layer = 0; layer <= layers; ++layer) {
            const size_t sz = layerPoints[static_cast<size_t>(layer)].size();
            cost[static_cast<size_t>(layer)].assign(sz, kInf);
            parent[static_cast<size_t>(layer)].assign(sz, -1);
        }

        cost[0][0] = 0.0;

        for (int layer = 1; layer <= layers; ++layer) {
            for (size_t k = 0; k < layerPoints[static_cast<size_t>(layer)].size(); ++k) {
                const Vec3& curr = layerPoints[static_cast<size_t>(layer)][k];
                const int currLane = layerLanes[static_cast<size_t>(layer)][k];

                for (size_t p = 0; p < layerPoints[static_cast<size_t>(layer - 1)].size(); ++p) {
                    const double prevCost = cost[static_cast<size_t>(layer - 1)][p];
                    if (!std::isfinite(prevCost)) {
                        continue;
                    }

                    const Vec3& prev = layerPoints[static_cast<size_t>(layer - 1)][p];
                    const int prevLane = layerLanes[static_cast<size_t>(layer - 1)][p];

                    double transition = greatCircleDist(prev, curr);

                    const double cratonClear = std::min(minCratonClearance(prev), minCratonClearance(curr));
                    if (cratonClear < 0.10) {
                        transition += (0.10 - cratonClear) * 18.0;
                    }

                    if (segmentHitsCraton(prev, curr)) {
                        transition += 10000.0;
                    }

                    if (segmentLeavesContinent(prev, curr, continent)) {
                        transition += 12.0;
                    }

                    transition += 0.08 * std::abs(currLane - prevLane);

                    if ((currLane > 0 && prevLane < 0) || (currLane < 0 && prevLane > 0)) {
                        transition -= 0.025;
                    }

                    const double candidateCost = prevCost + transition;
                    if (candidateCost < cost[static_cast<size_t>(layer)][k]) {
                        cost[static_cast<size_t>(layer)][k] = candidateCost;
                        parent[static_cast<size_t>(layer)][k] = static_cast<int>(p);
                    }
                }
            }
        }

        int bestTerminalIdx = 0;
        double bestTerminalCost = kInf;
        for (size_t i = 0; i < cost[static_cast<size_t>(layers)].size(); ++i) {
            if (cost[static_cast<size_t>(layers)][i] < bestTerminalCost) {
                bestTerminalCost = cost[static_cast<size_t>(layers)][i];
                bestTerminalIdx = static_cast<int>(i);
            }
        }

        std::vector<Vec3> path;
        int currIdx = bestTerminalIdx;
        for (int layer = layers; layer >= 0; --layer) {
            path.push_back(layerPoints[static_cast<size_t>(layer)][static_cast<size_t>(currIdx)]);
            if (layer > 0) {
                currIdx = parent[static_cast<size_t>(layer)][static_cast<size_t>(currIdx)];
                if (currIdx < 0) {
                    currIdx = 0;
                }
            }
        }
        std::reverse(path.begin(), path.end());

        if (!path.empty()) {
            path.front() = start;
            path.back() = end;
        }

        std::vector<Vec3> detoured;
        if (!path.empty()) {
            detoured.push_back(path.front());
        }

        for (size_t i = 1; i < path.size(); ++i) {
            const Vec3 a = detoured.back();
            const Vec3 b = path[i];

            if (segmentHitsCraton(a, b)) {
                Vec3 mid = midpointOnSphere(a, b);
                Vec3 nearestCenter = continentCenter;
                double nearestDist = std::numeric_limits<double>::infinity();

                for (const auto& craton : cratons) {
                    const double d = greatCircleDist(mid, craton.center);
                    if (d < nearestDist) {
                        nearestDist = d;
                        nearestCenter = craton.center;
                    }
                }

                Vec3 repel = projectToSphere(mid - nearestCenter);
                if (repel.lengthSq() < 1e-12) {
                    repel = projectToSphere(mid.cross(continentCenter));
                }

                Vec3 detour = offsetPoint(mid, repel, 1.5 * kDegToRad);
                int attempts = 0;
                while ((!continent.contains(detour) || isInsideAnyCraton(detour)) && attempts < 8) {
                    detour = midpointOnSphere(detour, continentCenter);
                    ++attempts;
                }

                if (continent.contains(detour) && !isInsideAnyCraton(detour)) {
                    detoured.push_back(detour);
                }
            }

            detoured.push_back(b);
        }

        Polyline denseAxis;
        if (detoured.size() == 1) {
            denseAxis.push_back(detoured.front());
        } else {
            for (size_t i = 0; i + 1 < detoured.size(); ++i) {
                Polyline arc = subdivideArc(detoured[i], detoured[i + 1], 2);
                if (i > 0 && !arc.empty()) {
                    arc.erase(arc.begin());
                }
                denseAxis.insert(denseAxis.end(), arc.begin(), arc.end());
            }
        }

        if (denseAxis.size() < 2) {
            denseAxis = {start, end};
        }
        denseAxis.front() = start;
        denseAxis.back() = end;

        auto existing = std::find_if(
            riftZones.begin(),
            riftZones.end(),
            [&](const RiftZone& zone) {
                return zone.plateA == continental.id && carriedCompletedSplitZones.find(zone.id) == carriedCompletedSplitZones.end();
            });

        RiftZone zone;
        if (existing != riftZones.end()) {
            zone = *existing;
        } else {
            zone.id = nextRiftId++;
            zone.plateA = continental.id;
            zone.plateB = coupledPlateId;
            zone.age = 0.0;
            zone.riftWidth = 0.0;
        }

        zone.plateB = coupledPlateId;
        // Only recompute axis if it's a new rift. For existing rifts, keep geometry locked.
        if (existing == riftZones.end() || zone.axis.empty()) {
            zone.axis = denseAxis;
        }
        zone.halfSpreadingRate = std::clamp(2.0 + 0.4 * std::sin(currentTime * 0.02), 1.1, 6.2);
        zone.age += std::abs(dt);
        zone.riftWidth += zone.halfSpreadingRate * std::abs(dt) * 1.6;
        zone.isOceanic = zone.age > 35.0;
        zone.magmaProduction = std::clamp(0.32 + zone.halfSpreadingRate * 0.09, 0.2, 1.0);
        updated.push_back(zone);

        continental.phase = zone.isOceanic ? WilsonPhase::Young : WilsonPhase::Embryonic;
    }

    riftZones.swap(updated);
}

void TectonicSimulation::processSpreading(double dt) {
    const double dtAbs = std::abs(dt);

    for (auto& zone : riftZones) {
        if (!zone.isOceanic) {
            continue;
        }

        if (completedRiftSplits.find(zone.id) == completedRiftSplits.end()) {
            splitContinentalPlateAlongRift(zone);
        }

        for (auto& plate : plates) {
            if (plate.id != zone.plateA && plate.id != zone.plateB) {
                continue;
            }

            if (plate.type == PlateType::Oceanic) {
                plate.crustAge = std::max(0.0, plate.crustAge - 0.28 * dtAbs);
                plate.velocity = std::clamp(plate.velocity + zone.halfSpreadingRate * 0.01 * dtAbs, 0.2, 13.0);
            } else {
                plate.phase = WilsonPhase::Young;
            }
        }
    }
}

void TectonicSimulation::detectSubductionInitiation() {
    std::vector<SubductionZone> updated;

    const Plate* overriding = nullptr;
    const Plate* subducting = nullptr;
    double bestMetric = std::numeric_limits<double>::infinity();

    for (const auto& continental : plates) {
        if (continental.type != PlateType::Continental || continental.continents.empty()) {
            continue;
        }

        const Vec3 continentalCentroid = continental.continents.front().centroid();

        for (const auto& oceanic : plates) {
            if (oceanic.id == continental.id || oceanic.type != PlateType::Oceanic) {
                continue;
            }

            Vec3 oceanRef = oceanic.boundaries.empty() ? randomPointOnSphere() : oceanic.boundaries.front();
            const double d = greatCircleDist(continentalCentroid, oceanRef);
            if (d < bestMetric) {
                bestMetric = d;
                overriding = &continental;
                subducting = &oceanic;
            }
        }
    }

    if (overriding && subducting && !overriding->continents.empty()) {
        const Polygon& coast = overriding->continents.front();
        const size_t n = coast.boundary.size();

        if (n >= 6) {
            auto existing = std::find_if(
                subductionZones.begin(),
                subductionZones.end(),
                [&](const SubductionZone& zone) {
                    return sameDirectedPair(zone.subductingPlateId, zone.overridingPlateId, subducting->id, overriding->id);
                });

            // Only create NEW subduction zones, never recalculate existing ones
            if (existing == subductionZones.end()) {
            // NEW subduction zone - calculate geometry ONCE
            SubductionZone zone;
            zone.id = nextSubductionId++;
            zone.subductingPlateId = subducting->id;
            zone.overridingPlateId = overriding->id;
            zone.age = 0.0;

            // Pick and lock the start index
            int start = static_cast<int>(randomDouble(0.0, static_cast<double>(n - 1)));
            const int window = std::max(8, std::min(40, static_cast<int>(n / 2)));
            const Vec3 continentalCenter = coast.centroid();

            const bool islandArcMode = std::fmod(currentTime * 0.01 + overriding->id * 0.37, 1.0) > 0.45;

            zone.trenchLine.clear();
            zone.volcanicArcPoints.clear();
            zone.trenchStartIndex = start;

            auto segmentCrossesContinent = [&](const Vec3& a, const Vec3& b) {
                for (int s = 1; s < 9; ++s) {
                    const double t = static_cast<double>(s) / 9.0;
                    const Vec3 sample = slerp(a, b, t);
                    if (coast.contains(sample)) {
                        return true;
                    }
                }
                return false;
            };

            auto makeOffshorePoint = [&](const Vec3& coastPoint, double baseOffsetDeg, double waviness) {
                Vec3 radial = projectToSphere(coastPoint - continentalCenter);
                if (radial.lengthSq() < 1e-12) {
                    radial = projectToSphere(coastPoint);
                }

                Vec3 tangent = projectToSphere(coastPoint.cross(continentalCenter));
                if (tangent.lengthSq() < 1e-12) {
                    tangent = projectToSphere(radial.cross(coastPoint));
                }

                Vec3 candidate = offsetPoint(coastPoint, radial, baseOffsetDeg * kDegToRad);
                if (!coast.contains(candidate)) {
                    return candidate;
                }

                const Vec3 dirs[4] = {radial, radial * -1.0, tangent, tangent * -1.0};
                for (int step = 0; step < 12; ++step) {
                    const double offsetDeg = baseOffsetDeg + 0.28 * step + 0.12 * waviness;
                    for (const auto& dir : dirs) {
                        candidate = offsetPoint(coastPoint, dir, offsetDeg * kDegToRad);
                        if (!coast.contains(candidate)) {
                            return candidate;
                        }
                    }
                }

                return offsetPoint(coastPoint, radial, (baseOffsetDeg + 3.0) * kDegToRad);
            };

            for (int i = 0; i <= window; ++i) {
                const int idx = (start + i) % static_cast<int>(n);
                const Vec3 coastPoint = coast.boundary[idx];

                // Use deterministic waviness based on position, not time
                const double waviness = std::abs(std::sin(i * 0.85 + idx * 0.37));
                double trenchOffsetDeg = islandArcMode
                    ? (0.8 + waviness * 0.9)
                    : (0.35 + waviness * 0.55);
                if (i % 6 == 0) {
                    trenchOffsetDeg += islandArcMode ? 0.9 : 0.2;
                }

                Vec3 trenchPoint = makeOffshorePoint(coastPoint, trenchOffsetDeg, waviness);
                int retries = 0;
                while (coast.contains(trenchPoint) && retries < 6) {
                    trenchOffsetDeg += 0.35;
                    trenchPoint = makeOffshorePoint(coastPoint, trenchOffsetDeg, waviness);
                    ++retries;
                }

                retries = 0;
                while (!zone.trenchLine.empty() && segmentCrossesContinent(zone.trenchLine.back(), trenchPoint) && retries < 8) {
                    trenchOffsetDeg += 0.35;
                    trenchPoint = makeOffshorePoint(coastPoint, trenchOffsetDeg, waviness);
                    ++retries;
                }

                // Invariant: trench must stay offshore and never cross into continent.
                if (coast.contains(trenchPoint)) {
                    trenchPoint = makeOffshorePoint(coastPoint, 2.8, waviness);
                }

                zone.trenchLine.push_back(trenchPoint);

                double arcExtraDeg = islandArcMode
                    ? (0.8 + 0.4 * waviness)
                    : (0.35 + 0.2 * waviness);

                Vec3 arcPoint = makeOffshorePoint(coastPoint, trenchOffsetDeg + arcExtraDeg, waviness + 0.3);
                retries = 0;
                while ((coast.contains(arcPoint) || segmentCrossesContinent(trenchPoint, arcPoint)) && retries < 8) {
                    arcPoint = makeOffshorePoint(coastPoint, trenchOffsetDeg + arcExtraDeg + 0.4 * retries, waviness + 0.4);
                    ++retries;
                }

                zone.volcanicArcPoints.push_back(arcPoint);
            }

            zone.isActive = true;
            zone.dippingAngle = std::clamp(42.0 + subducting->crustAge * 0.05, 28.0, 64.0);
            zone.slabPullForce = std::clamp(0.9 + subducting->crustAge * 0.025, 0.5, 9.5);
            zone.volcanicArcOffset = islandArcMode ? 2.8 : 1.8;
            zone.trenchStartIndex = start;  // Lock the trench position

            updated.push_back(zone);
            } else {
                // CRITICAL: For existing subduction zones, LOCK geometry - never recalculate
                SubductionZone zone = *existing;
                zone.isActive = true;
                updated.push_back(zone);
            }
        }
    }

    // Keep fallback behavior from boundary classification if no continental-oceanic pair exists.
    if (updated.empty()) {
        std::unordered_map<int, const Plate*> plateById;
        for (const auto& plate : plates) {
            plateById[plate.id] = &plate;
        }

        for (const auto& boundary : boundaries) {
            if (boundary.type != BoundaryType::Active) {
                continue;
            }

            auto itA = plateById.find(boundary.plateA);
            auto itB = plateById.find(boundary.plateB);
            if (itA == plateById.end() || itB == plateById.end()) {
                continue;
            }

            const Plate* plateA = itA->second;
            const Plate* plateB = itB->second;
            const bool aLikelySubducting =
                plateA->type == PlateType::Oceanic ||
                plateA->density > plateB->density + 0.03 ||
                plateA->crustAge > plateB->crustAge + 5.0;

            const int subductingId = aLikelySubducting ? plateA->id : plateB->id;
            const int overridingId = aLikelySubducting ? plateB->id : plateA->id;

            SubductionZone zone;
            zone.id = nextSubductionId++;
            zone.subductingPlateId = subductingId;
            zone.overridingPlateId = overridingId;
            zone.trenchLine = boundary.geometry;
            zone.volcanicArcPoints = boundary.geometry;
            zone.isActive = true;
            zone.dippingAngle = 45.0;
            zone.slabPullForce = 1.2;
            zone.volcanicArcOffset = 2.0;
            updated.push_back(zone);
        }
    }

    subductionZones.swap(updated);
}

void TectonicSimulation::processSubduction(double dt) {
    const double dtAbs = std::abs(dt);

    for (auto& zone : subductionZones) {
        zone.age += dtAbs;
        zone.slabPullForce = std::clamp(zone.slabPullForce + 0.02 * dtAbs, 0.2, 9.0);

        for (auto& plate : plates) {
            if (plate.id == zone.subductingPlateId) {
                plate.velocity = std::clamp(plate.velocity + zone.slabPullForce * 0.008 * dtAbs, 0.2, 13.0);
                plate.phase = zone.age > 80.0 ? WilsonPhase::Terminal : WilsonPhase::Declining;
            } else if (plate.id == zone.overridingPlateId) {
                plate.phase = WilsonPhase::Declining;
            }
        }
    }
}

void TectonicSimulation::detectCollisions() {
    std::vector<CollisionZone> updated;

    for (const auto& boundary : boundaries) {
        if (boundary.type != BoundaryType::Collision) {
            continue;
        }

        auto existing = std::find_if(
            collisionZones.begin(),
            collisionZones.end(),
            [&](const CollisionZone& zone) {
                return samePair(zone.plate1Id, zone.plate2Id, boundary.plateA, boundary.plateB);
            });

        CollisionZone zone;
        if (existing != collisionZones.end()) {
            zone = *existing;
        } else {
            zone.id = nextCollisionId++;
            zone.plate1Id = boundary.plateA;
            zone.plate2Id = boundary.plateB;
            zone.age = 0.0;
            zone.shortening = 0.0;
            zone.orogenyHeight = 4.0;
            zone.isSutured = false;
        }

        zone.boundaryLine = boundary.geometry;

        if (std::abs(boundary.convergenceRate) > 2.5) {
            zone.type = CollisionZone::OrogenyType::Himalayan;
        } else if (std::abs(boundary.convergenceRate) > 1.5) {
            zone.type = CollisionZone::OrogenyType::Andean;
        } else {
            zone.type = CollisionZone::OrogenyType::Ural;
        }

        Vec3 normal = midpointOnSphere(
            zone.boundaryLine.empty() ? randomPointOnSphere() : zone.boundaryLine.front(),
            zone.boundaryLine.empty() ? randomPointOnSphere() : zone.boundaryLine.back());

        zone.mountainRange = offsetPolyline(
            zone.boundaryLine,
            normal,
            (1.8 + zone.orogenyHeight * 0.05) * kDegToRad);

        if (zone.mountainRange.empty()) {
            zone.mountainRange = zone.boundaryLine;
        }

        updated.push_back(zone);
    }

    collisionZones.swap(updated);
}

void TectonicSimulation::processCollisions(double dt) {
    const double dtAbs = std::abs(dt);

    for (auto& plate : plates) {
        plate.isColliding = false;
        plate.collisionForce = 0.0;
    }

    for (auto& zone : collisionZones) {
        zone.age += dtAbs;
        zone.shortening += std::max(0.3, zone.orogenyHeight * 0.18) * dtAbs;
        zone.orogenyHeight = std::min(11.5, zone.orogenyHeight + 0.02 * dtAbs + 0.00045 * zone.shortening);

        Vec3 normal = midpointOnSphere(
            zone.boundaryLine.empty() ? randomPointOnSphere() : zone.boundaryLine.front(),
            zone.boundaryLine.empty() ? randomPointOnSphere() : zone.boundaryLine.back());

        zone.mountainRange = offsetPolyline(
            zone.boundaryLine,
            normal,
            (2.0 + zone.orogenyHeight * 0.06) * kDegToRad);

        for (auto& plate : plates) {
            if (plate.id != zone.plate1Id && plate.id != zone.plate2Id) {
                continue;
            }

            plate.isColliding = true;
            plate.collisionForce += zone.orogenyHeight;
            plate.velocity = std::max(0.2, plate.velocity * (1.0 - 0.01 * dtAbs));
            plate.crustThickness = std::min(72.0, plate.crustThickness + 0.03 * dtAbs);
            plate.phase = zone.age > 70.0 ? WilsonPhase::Suturing : WilsonPhase::Terminal;
        }

        if (zone.age > 95.0) {
            zone.isSutured = true;
        }
    }
}

void TectonicSimulation::processSuturing(double dt) {
    const double dtAbs = std::abs(dt);

    for (auto& zone : collisionZones) {
        if (!zone.isSutured) {
            continue;
        }

        auto existing = std::find_if(
            sutureZones.begin(),
            sutureZones.end(),
            [&](const SutureZone& suture) {
                if (suture.geometry.empty() || zone.boundaryLine.empty()) {
                    return false;
                }
                return isPointNearPolyline(suture.geometry.front(), zone.boundaryLine, 0.04);
            });

        if (existing == sutureZones.end()) {
            SutureZone suture;
            suture.id = nextSutureId++;
            suture.geometry = zone.boundaryLine;
            suture.age = currentTime;
            suture.weakness = 0.35;
            sutureZones.push_back(suture);
        }
    }

    for (auto& suture : sutureZones) {
        suture.weakness = std::clamp(suture.weakness - 0.0008 * dtAbs, 0.1, 0.9);
    }
}

void TectonicSimulation::updateMantlePlumes(double dt) {
    const double dtAbs = std::abs(dt);

    for (auto& plume : mantlePlumes) {
        plume.age += dtAbs;
        plume.isActive = plume.age < 320.0;
        plume.heatFlux = plume.strength * (0.7 + 0.3 * std::cos(plume.age * 0.01));

        if (!plume.isActive) {
            continue;
        }

        const double radiusRad = std::max(1.0, plume.radius) * kDegToRad;

        for (auto& plate : plates) {
            if (plate.continents.empty()) {
                continue;
            }

            const Vec3 center = plate.continents.front().centroid();
            const double d = greatCircleDist(center, plume.center);
            if (d > radiusRad) {
                continue;
            }

            const double influence = std::exp(-(d * d) / std::max(1e-6, 2.0 * radiusRad * radiusRad));
            plate.mantleTemp = std::clamp(plate.mantleTemp + influence * plume.strength * 0.006 * dtAbs, 0.3, 1.5);

            if (influence > 0.45 && plate.type == PlateType::Continental && plate.phase == WilsonPhase::Mature) {
                plate.phase = WilsonPhase::Embryonic;
            }
        }
    }
}

void TectonicSimulation::generateNewPlumes() {
    if (currentTime < 120.0 || mantlePlumes.size() >= 6) {
        return;
    }

    const double spawnChance = 0.004 + plates.size() * 0.0015;
    if (randomDouble(0.0, 1.0) > spawnChance) {
        return;
    }

    MantlePlume plume;
    plume.id = nextPlumeId++;
    plume.age = 0.0;
    plume.strength = randomDouble(0.65, 1.5);
    plume.radius = randomDouble(7.0, 18.0);
    plume.heatFlux = plume.strength * 1.2;
    plume.isActive = true;

    std::vector<const Plate*> continentalPlates;
    for (const auto& plate : plates) {
        if (plate.type == PlateType::Continental && !plate.continents.empty()) {
            continentalPlates.push_back(&plate);
        }
    }

    if (!continentalPlates.empty()) {
        const int idx = static_cast<int>(randomDouble(0.0, static_cast<double>(continentalPlates.size() - 1) + 0.999));
        const Vec3 seed = continentalPlates[idx]->continents.front().centroid();
        plume.center = offsetPoint(seed, randomPointOnSphere(), randomDouble(-4.0, 4.0) * kDegToRad);
    } else {
        plume.center = randomPointOnSphere();
    }

    mantlePlumes.push_back(plume);
}

int TectonicSimulation::pickPlateForCraton(const Craton& craton) const {
    if (plates.empty()) {
        return -1;
    }

    int bestPlateId = plates.front().id;
    double bestScore = std::numeric_limits<double>::infinity();

    for (const auto& plate : plates) {
        if (plate.continents.empty()) {
            continue;
        }

        bool containsCenter = false;
        for (const auto& continent : plate.continents) {
            if (continent.boundary.size() >= 3 && continent.contains(craton.center)) {
                containsCenter = true;
                break;
            }
        }

        const double dist = greatCircleDist(craton.center, plate.continents.front().centroid());
        double score = dist;
        if (containsCenter) {
            score -= 1.0;
        }
        if (plate.type == PlateType::Continental) {
            score -= 0.15;
        }

        if (score < bestScore) {
            bestScore = score;
            bestPlateId = plate.id;
        }
    }

    return bestPlateId;
}

bool TectonicSimulation::splitContinentalPlateAlongRift(RiftZone& zone) {
    if (!zone.isOceanic) {
        return false;
    }
    if (completedRiftSplits.find(zone.id) != completedRiftSplits.end()) {
        return false;
    }

    auto parentIt = std::find_if(
        plates.begin(),
        plates.end(),
        [&](const Plate& plate) { return plate.id == zone.plateA; });

    if (parentIt == plates.end()) {
        return false;
    }

    const size_t parentIndex = static_cast<size_t>(std::distance(plates.begin(), parentIt));
    Plate parentSnapshot = plates[parentIndex];
    if (parentSnapshot.type != PlateType::Continental || parentSnapshot.continents.empty()) {
        return false;
    }

    auto cleanPolyline = [&](const Polyline& input) {
        Polyline cleaned;
        cleaned.reserve(input.size());

        for (const auto& rawPoint : input) {
            const Vec3 point = projectToSphere(rawPoint);
            if (!cleaned.empty() && greatCircleDist(cleaned.back(), point) < 1e-5) {
                continue;
            }
            cleaned.push_back(point);
        }

        while (cleaned.size() > 1 && greatCircleDist(cleaned.front(), cleaned.back()) < 1e-5) {
            cleaned.pop_back();
        }

        return cleaned;
    };

    auto appendUnique = [&](Polyline& target, const Polyline& source) {
        for (const auto& point : source) {
            if (!target.empty() && greatCircleDist(target.back(), point) < 1e-5) {
                continue;
            }
            target.push_back(point);
        }
    };

    Polyline boundary = cleanPolyline(parentSnapshot.continents.front().boundary);
    Polyline axis = cleanPolyline(zone.axis);
    if (boundary.size() < 4 || axis.size() < 2) {
        return false;
    }

    auto nearestBoundaryIndex = [&](const Vec3& point) {
        int bestIndex = 0;
        double bestDist = std::numeric_limits<double>::infinity();
        for (size_t i = 0; i < boundary.size(); ++i) {
            const double dist = greatCircleDist(boundary[i], point);
            if (dist < bestDist) {
                bestDist = dist;
                bestIndex = static_cast<int>(i);
            }
        }
        return bestIndex;
    };

    const int startIdx = nearestBoundaryIndex(axis.front());
    const int endIdx = nearestBoundaryIndex(axis.back());
    if (startIdx == endIdx) {
        return false;
    }

    const int boundaryCount = static_cast<int>(boundary.size());
    const int forwardSteps = (endIdx - startIdx + boundaryCount) % boundaryCount;
    const int backwardSteps = (startIdx - endIdx + boundaryCount) % boundaryCount;
    if (forwardSteps < 2 || backwardSteps < 2) {
        return false;
    }

    axis.front() = boundary[static_cast<size_t>(startIdx)];
    axis.back() = boundary[static_cast<size_t>(endIdx)];

    auto collectBoundaryArc = [&](int fromIdx, int toIdx) {
        Polyline arc;
        int idx = fromIdx;
        int guard = 0;
        arc.push_back(boundary[static_cast<size_t>(idx)]);

        while (idx != toIdx && guard <= boundaryCount) {
            idx = (idx + 1) % boundaryCount;
            arc.push_back(boundary[static_cast<size_t>(idx)]);
            ++guard;
        }

        return arc;
    };

    Polyline arcForward = collectBoundaryArc(startIdx, endIdx);
    Polyline arcBackward = collectBoundaryArc(endIdx, startIdx);
    if (arcForward.size() < 2 || arcBackward.size() < 2) {
        return false;
    }

    Polyline axisReverse(axis.rbegin(), axis.rend());

    Polyline daughterRingA = arcForward;
    appendUnique(daughterRingA, axisReverse);
    daughterRingA = cleanPolyline(daughterRingA);

    Polyline daughterRingB = arcBackward;
    appendUnique(daughterRingB, axis);
    daughterRingB = cleanPolyline(daughterRingB);

    if (daughterRingA.size() < 3 || daughterRingB.size() < 3) {
        return false;
    }

    Polygon polyA;
    polyA.boundary = daughterRingA;
    Polygon polyB;
    polyB.boundary = daughterRingB;

    const double areaA = polyA.area();
    const double areaB = polyB.area();
    const double totalSplitArea = areaA + areaB;
    if (areaA < 0.02 || areaB < 0.02 || totalSplitArea < 0.08) {
        return false;
    }

    Plate& parent = plates[parentIndex];
    const double oldMass = std::max(0.2, parentSnapshot.mass);
    const double oldArea = std::max(0.1, parentSnapshot.area);
    const double areaFracA = std::clamp(areaA / totalSplitArea, 0.05, 0.95);
    const double areaFracB = 1.0 - areaFracA;

    parent.continents.clear();
    parent.continents.push_back(polyA);
    parent.boundaries = polyA.boundary;
    parent.phase = WilsonPhase::Young;
    parent.velocity = std::clamp(parentSnapshot.velocity + 0.25, 0.4, 13.0);
    parent.mass = std::max(0.2, oldMass * areaFracA);
    parent.area = std::max(0.05, oldArea * areaFracA);
    parent.crustAge = std::max(0.0, parentSnapshot.crustAge - 10.0);
    parent.mantleTemp = std::clamp(parentSnapshot.mantleTemp + 0.08, 0.3, 1.5);

    Plate daughter = parentSnapshot;
    daughter.id = nextPlateId++;
    daughter.continents.clear();
    daughter.continents.push_back(polyB);
    daughter.boundaries = polyB.boundary;
    daughter.phase = WilsonPhase::Young;
    daughter.velocity = std::clamp(parentSnapshot.velocity + 0.25, 0.4, 13.0);
    daughter.mass = std::max(0.2, oldMass * areaFracB);
    daughter.area = std::max(0.05, oldArea * areaFracB);
    daughter.crustAge = std::max(0.0, parentSnapshot.crustAge - 10.0);
    daughter.mantleTemp = std::clamp(parentSnapshot.mantleTemp + 0.08, 0.3, 1.5);

    // Compute Euler poles that guarantee the two daughter plates move APART.
    // The rift axis runs from axis.front() to axis.back(). We need each plate
    // to rotate away from the other across this axis.
    //
    // Strategy: place the Euler pole for each plate near the rift axis endpoints
    // so that the rotation at the rift boundary produces outward motion.
    // The pole should be roughly perpendicular to the rift axis midpoint,
    // with opposite rotation directions for the two plates.

    const Vec3 riftFront = axis.front();
    const Vec3 riftBack = axis.back();
    const Vec3 riftMid = midpointOnSphere(riftFront, riftBack);

    // Compute centroids of the two daughter plates
    const Vec3 centroidA = polyA.centroid();
    const Vec3 centroidB = polyB.centroid();

    // Direction from the rift midpoint toward centroidA tells us which side
    // plate A is on. We use this to orient the rotation correctly.
    const Vec3 dirToA = projectToSphere(centroidA - riftMid);
    const Vec3 dirToB = projectToSphere(centroidB - riftMid);

    // The rift axis direction (along the rift, not across it)
    const Vec3 riftDir = projectToSphere(riftBack - riftFront);

    // For plate A: Euler pole = riftMid cross dirToA, rotated so plate A
    // moves AWAY from the rift (in direction opposite to dirToA's side...
    // actually we want plate A to move further into its own side, so the
    // velocity at the rift should push A's edge away from the rift center).
    //
    // velocity = omega x point. At riftMid, we want vel_A to point roughly
    // toward centroidA direction (away from rift, into plate A's territory).
    //
    // If pole_A = riftDir (axis along the rift), then:
    //   vel_A = pole_A x riftMid = riftDir x riftMid
    // This gives motion perpendicular to the rift -- good.
    // The sign of the angle determines direction.

    // Use the rift axis direction as the Euler pole axis for both plates.
    // Plate A gets positive rotation, Plate B gets negative rotation,
    // which causes them to rotate in opposite directions around the rift axis.
    Vec3 riftAxisDir = projectToSphere(riftBack - riftFront);
    if (riftAxisDir.lengthSq() < 1e-12) {
        riftAxisDir = parentSnapshot.eulerPole.getAxis();
    }

    // Determine which side of the rift each plate is on
    const Vec3 sideNormal = projectToSphere(riftAxisDir.cross(riftMid));

    // Check: does sideNormal point toward centroidA or centroidB?
    // If sideNormal points toward A, then plate A should rotate so its
    // boundary moves in the +sideNormal direction (away from the rift).
    // velocity = omega x point. At riftMid with omega along riftAxisDir:
    //   vel = riftAxisDir x riftMid = sideNormal
    // So positive angle on riftAxisDir gives motion in sideNormal direction.

    const double dotA = sideNormal.dot(dirToA);
    const double spreadMagnitude = std::clamp(std::abs(parentSnapshot.eulerPole.angle) + 0.35, 0.35, 3.2);

    LatLon poleA, poleB;
    double angleA, angleB;

    if (dotA > 0) {
        // sideNormal points toward plate A
        // Plate A: positive rotation -> moves in +sideNormal (away from rift)
        // Plate B: negative rotation -> moves in -sideNormal (away from rift)
        poleA = toLatLon(riftAxisDir);
        poleB = toLatLon(riftAxisDir);
        angleA = spreadMagnitude;
        angleB = -spreadMagnitude;
    } else {
        // sideNormal points toward plate B
        // Plate A: negative rotation -> moves in -sideNormal (away from rift)
        // Plate B: positive rotation -> moves in +sideNormal (away from rift)
        poleA = toLatLon(riftAxisDir);
        poleB = toLatLon(riftAxisDir);
        angleA = -spreadMagnitude;
        angleB = spreadMagnitude;
    }

    parent.eulerPole = EulerPole(poleA.lat, poleA.lon, angleA);
    daughter.eulerPole = EulerPole(poleB.lat, poleB.lon, angleB);
    parent.angularVelocity = parent.eulerPole.getAxis() * (parent.eulerPole.angle * kDegToRad);
    daughter.angularVelocity = daughter.eulerPole.getAxis() * (daughter.eulerPole.angle * kDegToRad);

    const int daughterId = daughter.id;
    plates.push_back(daughter);

    for (auto& craton : cratons) {
        auto ownerIt = cratonPlateOwner.find(craton.id);
        if (ownerIt == cratonPlateOwner.end()) {
            continue;
        }
        if (ownerIt->second != parentSnapshot.id) {
            continue;
        }

        const bool inA = polyA.contains(craton.center);
        const bool inB = polyB.contains(craton.center);

        if (inA && !inB) {
            ownerIt->second = parentSnapshot.id;
        } else if (inB && !inA) {
            ownerIt->second = daughterId;
        } else {
            const Vec3 centroidA = polyA.centroid();
            const Vec3 centroidB = polyB.centroid();
            const double distA = greatCircleDist(craton.center, centroidA);
            const double distB = greatCircleDist(craton.center, centroidB);
            ownerIt->second = (distA <= distB) ? parentSnapshot.id : daughterId;
        }
    }

    zone.plateA = parentSnapshot.id;
    zone.plateB = daughterId;
    zone.isOceanic = true;
    zone.age = std::max(zone.age, 35.0);
    zone.riftWidth = std::max(zone.riftWidth, 220.0);

    completedRiftSplits.insert(zone.id);
    return true;
}

double TectonicSimulation::greatCircleDist(const Vec3& a, const Vec3& b) const {
    return greatCircleDistance(a, b);
}

Vec3 TectonicSimulation::midpointOnSphere(const Vec3& a, const Vec3& b) const {
    const Vec3 sum = a + b;
    if (sum.lengthSq() < 1e-12) {
        return projectToSphere(a);
    }
    return projectToSphere(sum);
}

bool TectonicSimulation::polygonsOverlap(const Polygon& p1, const Polygon& p2) const {
    if (p1.boundary.empty() || p2.boundary.empty()) {
        return false;
    }

    for (const auto& pt : p1.boundary) {
        if (p2.contains(pt)) {
            return true;
        }
    }

    for (const auto& pt : p2.boundary) {
        if (p1.contains(pt)) {
            return true;
        }
    }

    return p1.contains(p2.centroid()) || p2.contains(p1.centroid());
}

double TectonicSimulation::polygonsOverlapAmount(const Polygon& p1, const Polygon& p2) const {
    if (p1.boundary.empty() || p2.boundary.empty()) {
        return 0.0;
    }

    double insideCount = 0.0;
    double total = 0.0;

    for (const auto& pt : p1.boundary) {
        insideCount += p2.contains(pt) ? 1.0 : 0.0;
        total += 1.0;
    }
    for (const auto& pt : p2.boundary) {
        insideCount += p1.contains(pt) ? 1.0 : 0.0;
        total += 1.0;
    }

    const double ratio = (total > 0.0) ? (insideCount / total) : 0.0;
    const double centroidDist = greatCircleDist(p1.centroid(), p2.centroid());
    const double proximity = std::max(0.0, 1.0 - centroidDist / (M_PI * 0.5));

    return std::clamp(0.6 * ratio + 0.4 * proximity, 0.0, 1.0);
}

Vec3 TectonicSimulation::projectToSphere(const Vec3& v) const {
    return v.normalized();
}

double TectonicSimulation::angleBetween(const Vec3& a, const Vec3& b) const {
    const Vec3 an = a.normalized();
    const Vec3 bn = b.normalized();
    const double dot = std::clamp(an.dot(bn), -1.0, 1.0);
    return std::acos(dot);
}

Polyline TectonicSimulation::subdivideArc(const Vec3& start, const Vec3& end, int segments) const {
    Polyline result;
    const int safeSegments = std::max(1, segments);
    result.reserve(static_cast<size_t>(safeSegments) + 1);

    for (int i = 0; i <= safeSegments; ++i) {
        const double t = static_cast<double>(i) / static_cast<double>(safeSegments);
        result.push_back(slerp(start, end, t));
    }

    return result;
}

Vec3 TectonicSimulation::offsetPoint(const Vec3& point, const Vec3& direction, double angleRad) const {
    const Vec3 p = projectToSphere(point);
    const Vec3 d = projectToSphere(direction);

    Vec3 axis = d.cross(p);
    if (axis.lengthSq() < 1e-12) {
        axis = p.cross(Vec3(0, 0, 1));
    }
    if (axis.lengthSq() < 1e-12) {
        axis = p.cross(Vec3(0, 1, 0));
    }
    axis = projectToSphere(axis);

    const double cosTheta = std::cos(angleRad);
    const double sinTheta = std::sin(angleRad);

    const Vec3 rotated =
        p * cosTheta +
        axis.cross(p) * sinTheta +
        axis * (axis.dot(p) * (1.0 - cosTheta));

    return projectToSphere(rotated);
}

bool TectonicSimulation::isPointNearPolyline(const Vec3& point, const Polyline& line, double threshold) const {
    if (line.empty()) {
        return false;
    }

    const Vec3 p = projectToSphere(point);
    const double safeThreshold = std::max(1e-4, threshold);

    for (size_t i = 0; i < line.size(); ++i) {
        if (greatCircleDist(p, line[i]) <= safeThreshold) {
            return true;
        }

        if (i + 1 < line.size()) {
            const Polyline samples = subdivideArc(line[i], line[i + 1], 6);
            for (const auto& sample : samples) {
                if (greatCircleDist(p, sample) <= safeThreshold) {
                    return true;
                }
            }
        }
    }

    return false;
}

Polyline TectonicSimulation::offsetPolyline(const Polyline& line, const Vec3& normal, double angleRad) const {
    Polyline out;
    out.reserve(line.size());

    for (const auto& point : line) {
        out.push_back(offsetPoint(point, normal, angleRad));
    }

    return out;
}

double TectonicSimulation::randomDouble(double min, double max) {
    std::uniform_real_distribution<double> dist(min, max);
    return dist(rng);
}

Vec3 TectonicSimulation::randomPointOnSphere() {
    const double u = randomDouble(-1.0, 1.0);
    const double phi = randomDouble(0.0, 2.0 * M_PI);
    const double r = std::sqrt(std::max(0.0, 1.0 - u * u));
    return Vec3(r * std::cos(phi), r * std::sin(phi), u);
}

std::vector<double> TectonicSimulation::getPlateContinentLats(int plateIdx, int continentIdx) const {
    std::vector<double> result;
    if (plateIdx < 0 || plateIdx >= static_cast<int>(plates.size())) {
        return result;
    }

    const auto& continents = plates[plateIdx].continents;
    if (continentIdx < 0 || continentIdx >= static_cast<int>(continents.size())) {
        return result;
    }

    for (const auto& point : continents[continentIdx].boundary) {
        result.push_back(toLatLon(point).lat);
    }
    return result;
}

std::vector<double> TectonicSimulation::getPlateContinentLons(int plateIdx, int continentIdx) const {
    std::vector<double> result;
    if (plateIdx < 0 || plateIdx >= static_cast<int>(plates.size())) {
        return result;
    }

    const auto& continents = plates[plateIdx].continents;
    if (continentIdx < 0 || continentIdx >= static_cast<int>(continents.size())) {
        return result;
    }

    for (const auto& point : continents[continentIdx].boundary) {
        result.push_back(toLatLon(point).lon);
    }
    return result;
}

std::vector<double> TectonicSimulation::getSubductionZoneLats(int zoneIdx) const {
    std::vector<double> result;
    if (zoneIdx < 0 || zoneIdx >= static_cast<int>(subductionZones.size())) {
        return result;
    }

    for (const auto& point : subductionZones[zoneIdx].trenchLine) {
        result.push_back(toLatLon(point).lat);
    }
    return result;
}

std::vector<double> TectonicSimulation::getSubductionZoneLons(int zoneIdx) const {
    std::vector<double> result;
    if (zoneIdx < 0 || zoneIdx >= static_cast<int>(subductionZones.size())) {
        return result;
    }

    for (const auto& point : subductionZones[zoneIdx].trenchLine) {
        result.push_back(toLatLon(point).lon);
    }
    return result;
}

std::vector<double> TectonicSimulation::getSubductionVolcanicArcLats(int zoneIdx) const {
    std::vector<double> result;
    if (zoneIdx < 0 || zoneIdx >= static_cast<int>(subductionZones.size())) {
        return result;
    }

    for (const auto& point : subductionZones[zoneIdx].volcanicArcPoints) {
        result.push_back(toLatLon(point).lat);
    }
    return result;
}

std::vector<double> TectonicSimulation::getSubductionVolcanicArcLons(int zoneIdx) const {
    std::vector<double> result;
    if (zoneIdx < 0 || zoneIdx >= static_cast<int>(subductionZones.size())) {
        return result;
    }

    for (const auto& point : subductionZones[zoneIdx].volcanicArcPoints) {
        result.push_back(toLatLon(point).lon);
    }
    return result;
}

std::vector<double> TectonicSimulation::getRiftZoneLats(int zoneIdx) const {
    std::vector<double> result;
    if (zoneIdx < 0 || zoneIdx >= static_cast<int>(riftZones.size())) {
        return result;
    }

    for (const auto& point : riftZones[zoneIdx].axis) {
        result.push_back(toLatLon(point).lat);
    }
    return result;
}

std::vector<double> TectonicSimulation::getRiftZoneLons(int zoneIdx) const {
    std::vector<double> result;
    if (zoneIdx < 0 || zoneIdx >= static_cast<int>(riftZones.size())) {
        return result;
    }

    for (const auto& point : riftZones[zoneIdx].axis) {
        result.push_back(toLatLon(point).lon);
    }
    return result;
}

std::vector<double> TectonicSimulation::getCollisionZoneLats(int zoneIdx) const {
    std::vector<double> result;
    if (zoneIdx < 0 || zoneIdx >= static_cast<int>(collisionZones.size())) {
        return result;
    }

    for (const auto& point : collisionZones[zoneIdx].boundaryLine) {
        result.push_back(toLatLon(point).lat);
    }
    return result;
}

std::vector<double> TectonicSimulation::getCollisionZoneLons(int zoneIdx) const {
    std::vector<double> result;
    if (zoneIdx < 0 || zoneIdx >= static_cast<int>(collisionZones.size())) {
        return result;
    }

    for (const auto& point : collisionZones[zoneIdx].boundaryLine) {
        result.push_back(toLatLon(point).lon);
    }
    return result;
}

std::vector<double> TectonicSimulation::getMountainRangeLats(int zoneIdx) const {
    std::vector<double> result;
    if (zoneIdx < 0 || zoneIdx >= static_cast<int>(collisionZones.size())) {
        return result;
    }

    for (const auto& point : collisionZones[zoneIdx].mountainRange) {
        result.push_back(toLatLon(point).lat);
    }
    return result;
}

std::vector<double> TectonicSimulation::getMountainRangeLons(int zoneIdx) const {
    std::vector<double> result;
    if (zoneIdx < 0 || zoneIdx >= static_cast<int>(collisionZones.size())) {
        return result;
    }

    for (const auto& point : collisionZones[zoneIdx].mountainRange) {
        result.push_back(toLatLon(point).lon);
    }
    return result;
}

std::vector<double> TectonicSimulation::getPlumeLats(int idx) const {
    std::vector<double> result;
    if (idx < 0 || idx >= static_cast<int>(mantlePlumes.size())) {
        return result;
    }

    result.push_back(toLatLon(mantlePlumes[idx].center).lat);
    return result;
}

std::vector<double> TectonicSimulation::getPlumeLons(int idx) const {
    std::vector<double> result;
    if (idx < 0 || idx >= static_cast<int>(mantlePlumes.size())) {
        return result;
    }

    result.push_back(toLatLon(mantlePlumes[idx].center).lon);
    return result;
}

std::vector<double> TectonicSimulation::getSutureZoneLats(int idx) const {
    std::vector<double> result;
    if (idx < 0 || idx >= static_cast<int>(sutureZones.size())) {
        return result;
    }

    for (const auto& point : sutureZones[idx].geometry) {
        result.push_back(toLatLon(point).lat);
    }
    return result;
}

std::vector<double> TectonicSimulation::getSutureZoneLons(int idx) const {
    std::vector<double> result;
    if (idx < 0 || idx >= static_cast<int>(sutureZones.size())) {
        return result;
    }

    for (const auto& point : sutureZones[idx].geometry) {
        result.push_back(toLatLon(point).lon);
    }
    return result;
}

std::vector<double> TectonicSimulation::getBoundaryLats(int idx) const {
    std::vector<double> result;
    if (idx < 0 || idx >= static_cast<int>(boundaries.size())) {
        return result;
    }

    for (const auto& point : boundaries[idx].geometry) {
        result.push_back(toLatLon(point).lat);
    }
    return result;
}

std::vector<double> TectonicSimulation::getBoundaryLons(int idx) const {
    std::vector<double> result;
    if (idx < 0 || idx >= static_cast<int>(boundaries.size())) {
        return result;
    }

    for (const auto& point : boundaries[idx].geometry) {
        result.push_back(toLatLon(point).lon);
    }
    return result;
}

double TectonicSimulation::getCratonLat(int idx) const {
    if (idx < 0 || idx >= static_cast<int>(cratons.size())) {
        return 0.0;
    }
    return toLatLon(cratons[static_cast<size_t>(idx)].center).lat;
}

double TectonicSimulation::getCratonLon(int idx) const {
    if (idx < 0 || idx >= static_cast<int>(cratons.size())) {
        return 0.0;
    }
    return toLatLon(cratons[static_cast<size_t>(idx)].center).lon;
}

double TectonicSimulation::getContinentElevation(int plateIdx, int continentIdx) const {
    if (plateIdx < 0 || plateIdx >= static_cast<int>(plates.size())) {
        return 0.0;
    }

    if (continentIdx < 0 || continentIdx >= static_cast<int>(plates[plateIdx].continents.size())) {
        return 0.0;
    }

    const double rhoMantle = 3.3;
    const double rhoCrust = std::clamp(plates[plateIdx].density, 2.6, 3.2);
    return plates[plateIdx].crustThickness * ((rhoMantle - rhoCrust) / rhoMantle);
}

double TectonicSimulation::getOceanAge(int plateIdx) const {
    if (plateIdx < 0 || plateIdx >= static_cast<int>(plates.size())) {
        return 0.0;
    }
    return plates[plateIdx].crustAge;
}

int TectonicSimulation::getPlateType(int plateIdx) const {
    if (plateIdx < 0 || plateIdx >= static_cast<int>(plates.size())) {
        return static_cast<int>(PlateType::Oceanic);
    }
    return static_cast<int>(plates[plateIdx].type);
}

int TectonicSimulation::getWilsonPhase(int plateIdx) const {
    if (plateIdx < 0 || plateIdx >= static_cast<int>(plates.size())) {
        return static_cast<int>(WilsonPhase::Mature);
    }
    return static_cast<int>(plates[plateIdx].phase);
}

double TectonicSimulation::getMountainHeight(int zoneIdx) const {
    if (zoneIdx < 0 || zoneIdx >= static_cast<int>(collisionZones.size())) {
        return 0.0;
    }
    return collisionZones[zoneIdx].orogenyHeight;
}

bool TectonicSimulation::isMountainSutured(int zoneIdx) const {
    if (zoneIdx < 0 || zoneIdx >= static_cast<int>(collisionZones.size())) {
        return false;
    }
    return collisionZones[zoneIdx].isSutured;
}

bool TectonicSimulation::isRiftZoneOceanic(int zoneIdx) const {
    if (zoneIdx < 0 || zoneIdx >= static_cast<int>(riftZones.size())) {
        return false;
    }
    return riftZones[zoneIdx].isOceanic;
}

void TectonicSimulation::reset() {
    plates.clear();
    subductionZones.clear();
    riftZones.clear();
    collisionZones.clear();
    cratons.clear();
    mantlePlumes.clear();
    sutureZones.clear();
    boundaries.clear();
    cratonPlateOwner.clear();
    completedRiftSplits.clear();

    currentTime = 0.0;
    nextPlateId = 0;
    nextSubductionId = 0;
    nextRiftId = 0;
    nextCollisionId = 0;
    nextPlumeId = 0;
    nextSutureId = 0;
    nextBoundaryId = 0;
}

}  // namespace WilsonCycles
