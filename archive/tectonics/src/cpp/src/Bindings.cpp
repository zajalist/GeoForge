#include "../include/TectonicSimulation.hpp"

#include <algorithm>
#include <cmath>

#include <emscripten/bind.h>
#include <emscripten/val.h>

using namespace emscripten;
using namespace WilsonCycles;

class SimulationWrapper {
private:
    TectonicSimulation sim;

    static std::vector<double> jsArrayToVector(const emscripten::val& arr) {
        std::vector<double> values;
        const unsigned length = arr["length"].as<unsigned>();
        values.reserve(length);
        for (unsigned i = 0; i < length; ++i) {
            values.push_back(arr[i].as<double>());
        }
        return values;
    }

    static emscripten::val vectorToJsArray(const std::vector<double>& values) {
        emscripten::val out = emscripten::val::array();
        for (size_t i = 0; i < values.size(); ++i) {
            out.set(i, values[i]);
        }
        return out;
    }

public:
    SimulationWrapper() = default;

    void initSupercontinent(const emscripten::val& latVals, const emscripten::val& lonVals) {
        const auto lat = jsArrayToVector(latVals);
        const auto lon = jsArrayToVector(lonVals);
        const size_t count = std::min(lat.size(), lon.size());

        Polygon continentShape;
        continentShape.boundary.reserve(count);
        for (size_t i = 0; i < count; ++i) {
            continentShape.boundary.push_back(LatLon(lat[i], lon[i]).toVec3());
        }

        std::vector<Craton> initialCratons;
        sim.initializeSupercontinent(continentShape, initialCratons);
    }

    void addCraton(double lat, double lon, double radiusDegrees) {
        Craton c;
        c.center = LatLon(lat, lon).toVec3();
        c.radius = std::max(0.2, radiusDegrees) * M_PI / 180.0;

        const int segments = 24;
        const double latRad = lat * M_PI / 180.0;
        const double cosLat = std::max(0.12, std::cos(latRad));

        for (int i = 0; i < segments; ++i) {
            const double angle = (2.0 * M_PI * i) / segments;
            const double dLat = radiusDegrees * std::cos(angle);
            const double dLon = (radiusDegrees * std::sin(angle)) / cosLat;
            const double pLat = std::max(-89.9, std::min(89.9, lat + dLat));
            const double pLon = lon + dLon;
            c.boundary.boundary.push_back(LatLon(pLat, pLon).toVec3());
        }

        sim.addCraton(c);
    }

    void step(double timeStep) { sim.step(timeStep); }
    void reset() { sim.reset(); }

    double getCurrentTime() const { return sim.getCurrentTime(); }
    int getPlateCount() const { return sim.getPlateCount(); }
    int getSubductionZoneCount() const { return sim.getSubductionZoneCount(); }
    int getRiftZoneCount() const { return sim.getRiftZoneCount(); }
    int getCollisionZoneCount() const { return sim.getCollisionZoneCount(); }
    int getCratonCount() const { return sim.getCratonCount(); }
    int getPlumeCount() const { return sim.getPlumeCount(); }
    int getSutureCount() const { return sim.getSutureCount(); }
    int getBoundaryCount() const { return static_cast<int>(sim.getBoundaries().size()); }

    double getCratonLat(int idx) const {
        return sim.getCratonLat(idx);
    }

    double getCratonLon(int idx) const {
        return sim.getCratonLon(idx);
    }

    emscripten::val getContinentLats(int plateIdx, int continentIdx) const {
        return vectorToJsArray(sim.getPlateContinentLats(plateIdx, continentIdx));
    }

    emscripten::val getContinentLons(int plateIdx, int continentIdx) const {
        return vectorToJsArray(sim.getPlateContinentLons(plateIdx, continentIdx));
    }

    emscripten::val getSubductionZoneLats(int zoneIdx) const {
        return vectorToJsArray(sim.getSubductionZoneLats(zoneIdx));
    }

    emscripten::val getSubductionZoneLons(int zoneIdx) const {
        return vectorToJsArray(sim.getSubductionZoneLons(zoneIdx));
    }

    emscripten::val getSubductionVolcanicArcLats(int zoneIdx) const {
        return vectorToJsArray(sim.getSubductionVolcanicArcLats(zoneIdx));
    }

    emscripten::val getSubductionVolcanicArcLons(int zoneIdx) const {
        return vectorToJsArray(sim.getSubductionVolcanicArcLons(zoneIdx));
    }

    emscripten::val getRiftZoneLats(int zoneIdx) const {
        return vectorToJsArray(sim.getRiftZoneLats(zoneIdx));
    }

    emscripten::val getRiftZoneLons(int zoneIdx) const {
        return vectorToJsArray(sim.getRiftZoneLons(zoneIdx));
    }

    emscripten::val getCollisionZoneLats(int zoneIdx) const {
        return vectorToJsArray(sim.getCollisionZoneLats(zoneIdx));
    }

    emscripten::val getCollisionZoneLons(int zoneIdx) const {
        return vectorToJsArray(sim.getCollisionZoneLons(zoneIdx));
    }

    emscripten::val getMountainRangeLats(int zoneIdx) const {
        return vectorToJsArray(sim.getMountainRangeLats(zoneIdx));
    }

    emscripten::val getMountainRangeLons(int zoneIdx) const {
        return vectorToJsArray(sim.getMountainRangeLons(zoneIdx));
    }

    emscripten::val getPlumeLats(int idx) const {
        return vectorToJsArray(sim.getPlumeLats(idx));
    }

    emscripten::val getPlumeLons(int idx) const {
        return vectorToJsArray(sim.getPlumeLons(idx));
    }

    emscripten::val getSutureZoneLats(int idx) const {
        return vectorToJsArray(sim.getSutureZoneLats(idx));
    }

    emscripten::val getSutureZoneLons(int idx) const {
        return vectorToJsArray(sim.getSutureZoneLons(idx));
    }

    emscripten::val getBoundaryLats(int idx) const {
        return vectorToJsArray(sim.getBoundaryLats(idx));
    }

    emscripten::val getBoundaryLons(int idx) const {
        return vectorToJsArray(sim.getBoundaryLons(idx));
    }

    double getMountainHeight(int zoneIdx) const {
        return sim.getMountainHeight(zoneIdx);
    }

    bool isMountainSutured(int zoneIdx) const {
        return sim.isMountainSutured(zoneIdx);
    }

    bool isRiftZoneOceanic(int zoneIdx) const {
        return sim.isRiftZoneOceanic(zoneIdx);
    }

    double getOceanAge(int plateIdx) const {
        return sim.getOceanAge(plateIdx);
    }

    int getPlateType(int plateIdx) const {
        return sim.getPlateType(plateIdx);
    }

    int getWilsonPhase(int plateIdx) const {
        return sim.getWilsonPhase(plateIdx);
    }
};

EMSCRIPTEN_BINDINGS(wilson_cycles_sim) {
    class_<SimulationWrapper>("TectonicSimulation")
        .constructor<>()
        .function("initSupercontinent", &SimulationWrapper::initSupercontinent)
        .function("addCraton", &SimulationWrapper::addCraton)
        .function("step", &SimulationWrapper::step)
        .function("reset", &SimulationWrapper::reset)
        .function("getCurrentTime", &SimulationWrapper::getCurrentTime)
        .function("getPlateCount", &SimulationWrapper::getPlateCount)
        .function("getSubductionZoneCount", &SimulationWrapper::getSubductionZoneCount)
        .function("getRiftZoneCount", &SimulationWrapper::getRiftZoneCount)
        .function("getCollisionZoneCount", &SimulationWrapper::getCollisionZoneCount)
        .function("getCratonCount", &SimulationWrapper::getCratonCount)
        .function("getPlumeCount", &SimulationWrapper::getPlumeCount)
        .function("getSutureCount", &SimulationWrapper::getSutureCount)
        .function("getBoundaryCount", &SimulationWrapper::getBoundaryCount)
        .function("getCratonLat", &SimulationWrapper::getCratonLat)
        .function("getCratonLon", &SimulationWrapper::getCratonLon)
        .function("getContinentLats", &SimulationWrapper::getContinentLats)
        .function("getContinentLons", &SimulationWrapper::getContinentLons)
        .function("getSubductionZoneLats", &SimulationWrapper::getSubductionZoneLats)
        .function("getSubductionZoneLons", &SimulationWrapper::getSubductionZoneLons)
        .function("getSubductionVolcanicArcLats", &SimulationWrapper::getSubductionVolcanicArcLats)
        .function("getSubductionVolcanicArcLons", &SimulationWrapper::getSubductionVolcanicArcLons)
        .function("getRiftZoneLats", &SimulationWrapper::getRiftZoneLats)
        .function("getRiftZoneLons", &SimulationWrapper::getRiftZoneLons)
        .function("getCollisionZoneLats", &SimulationWrapper::getCollisionZoneLats)
        .function("getCollisionZoneLons", &SimulationWrapper::getCollisionZoneLons)
        .function("getMountainRangeLats", &SimulationWrapper::getMountainRangeLats)
        .function("getMountainRangeLons", &SimulationWrapper::getMountainRangeLons)
        .function("getPlumeLats", &SimulationWrapper::getPlumeLats)
        .function("getPlumeLons", &SimulationWrapper::getPlumeLons)
        .function("getSutureZoneLats", &SimulationWrapper::getSutureZoneLats)
        .function("getSutureZoneLons", &SimulationWrapper::getSutureZoneLons)
        .function("getBoundaryLats", &SimulationWrapper::getBoundaryLats)
        .function("getBoundaryLons", &SimulationWrapper::getBoundaryLons)
        .function("getMountainHeight", &SimulationWrapper::getMountainHeight)
        .function("isMountainSutured", &SimulationWrapper::isMountainSutured)
        .function("isRiftZoneOceanic", &SimulationWrapper::isRiftZoneOceanic)
        .function("getOceanAge", &SimulationWrapper::getOceanAge)
        .function("getPlateType", &SimulationWrapper::getPlateType)
        .function("getWilsonPhase", &SimulationWrapper::getWilsonPhase);
}
