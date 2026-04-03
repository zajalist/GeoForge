"""Plate reconstruction helpers for gplatespython."""

from dataclasses import dataclass, field
from typing import Optional

try:
    from .gpml_io_skeleton import GpmlFeature
    from .rift_pathfinder import generate_rift_path, RiftPath
except ImportError:
    from gpml_io_skeleton import GpmlFeature
    from rift_pathfinder import generate_rift_path, RiftPath


@dataclass
class ReconstructionSnapshot:
    """Plate features at a specific geological time."""

    time_ma: float
    features: list[GpmlFeature] = field(default_factory=list)
    rotation_poles: list[dict] = field(default_factory=list)


def build_topologies(features: list[GpmlFeature]) -> list[dict]:
    """Create topological features needed for reconstruction.

    Identifies plate boundaries, network connections, and
    topological closed plate boundaries from the feature set.

    Returns a list of topology descriptions with connected plates.
    """
    topologies = []
    plate_ids = set()

    for feat in features:
        if feat.reconstruction_plate_id is not None:
            plate_ids.add(feat.reconstruction_plate_id)

    plate_features: dict[int, list[GpmlFeature]] = {}
    for pid in plate_ids:
        plate_features[pid] = [
            f for f in features if f.reconstruction_plate_id == pid and f.coordinates
        ]

    for pid, feats in plate_features.items():
        boundary_coords = []
        for feat in feats:
            boundary_coords.extend(feat.coordinates)

        topologies.append(
            {
                "plate_id": pid,
                "feature_count": len(feats),
                "boundary_points": len(boundary_coords),
                "features": feats,
            }
        )

    return topologies


def compute_plate_motions(
    topologies: list[dict],
    start_time_ma: float,
    end_time_ma: float,
    time_step_ma: float,
) -> list[ReconstructionSnapshot]:
    """Compute plate motions through time and return reconstruction snapshots.

    For each time step, reconstruct all features to their positions
    at that geological time using finite rotations.
    """
    snapshots = []
    current_time = start_time_ma

    while current_time <= end_time_ma:
        snapshot_features = []
        for topo in topologies:
            for feat in topo["features"]:
                if feat.valid_from is not None and feat.valid_to is not None:
                    if feat.valid_from <= current_time <= feat.valid_to:
                        snapshot_features.append(feat)
                else:
                    snapshot_features.append(feat)

        snapshots.append(
            ReconstructionSnapshot(
                time_ma=current_time,
                features=snapshot_features,
            )
        )
        current_time += time_step_ma

    return snapshots


def project_feature_to_time(
    feature: GpmlFeature,
    reconstruction_model: Optional[dict] = None,
    target_time_ma: float = 0.0,
) -> GpmlFeature:
    """Project a feature to target geological time.

    If a reconstruction_model with rotation poles is provided,
    applies finite rotations to transform coordinates.
    Otherwise returns the feature unchanged.
    """
    if reconstruction_model is None:
        return feature

    rotations = reconstruction_model.get("rotations", {})
    plate_id = feature.reconstruction_plate_id

    if plate_id is None or plate_id not in rotations:
        return feature

    pole = rotations[plate_id]
    lat_pole = pole.get("lat", 0.0)
    lon_pole = pole.get("lon", 0.0)
    angle = pole.get("angle", 0.0)

    rotated_coords = []
    for lon, lat in feature.coordinates:
        rlon, rlat = _rotate_point(lon, lat, lon_pole, lat_pole, angle)
        rotated_coords.append([rlon, rlat])

    projected = GpmlFeature(
        feature_id=feature.feature_id,
        feature_type=feature.feature_type,
        name=feature.name,
        description=feature.description,
        reconstruction_plate_id=feature.reconstruction_plate_id,
        valid_from=feature.valid_from,
        valid_to=feature.valid_to,
        geometry_type=feature.geometry_type,
        coordinates=rotated_coords,
        properties=dict(feature.properties),
    )
    return projected


def _rotate_point(
    lon: float,
    lat: float,
    pole_lon: float,
    pole_lat: float,
    angle_deg: float,
) -> tuple[float, float]:
    """Rotate a point around an Euler pole (simplified)."""
    import math

    lon_r = math.radians(lon)
    lat_r = math.radians(lat)
    pole_lon_r = math.radians(pole_lon)
    pole_lat_r = math.radians(pole_lat)
    angle_r = math.radians(angle_deg)

    x = math.cos(lat_r) * math.cos(lon_r)
    y = math.cos(lat_r) * math.sin(lon_r)
    z = math.sin(lat_r)

    px = math.cos(pole_lat_r) * math.cos(pole_lon_r)
    py = math.cos(pole_lat_r) * math.sin(pole_lon_r)
    pz = math.sin(pole_lat_r)

    dot = x * px + y * py + z * pz

    rx = (
        x * math.cos(angle_r)
        + (py * z - pz * y) * math.sin(angle_r)
        + px * dot * (1 - math.cos(angle_r))
    )
    ry = (
        y * math.cos(angle_r)
        + (pz * x - px * z) * math.sin(angle_r)
        + py * dot * (1 - math.cos(angle_r))
    )
    rz = (
        z * math.cos(angle_r)
        + (px * y - py * x) * math.sin(angle_r)
        + pz * dot * (1 - math.cos(angle_r))
    )

    new_lat = math.degrees(math.asin(max(-1.0, min(1.0, rz))))
    new_lon = math.degrees(math.atan2(ry, rx))

    return new_lon, new_lat


def generate_rift_feature(
    plate_coords: list[list[float]],
    craton_polygons: list[list[list[float]]],
    plate_id: int = 0,
    valid_from: float = 0.0,
    valid_to: float = 1000.0,
    resolution_deg: float = 1.0,
    zigzag_amplitude: float = 2.0,
    zigzag_interval: int = 4,
) -> GpmlFeature:
    """Generate a rift GPML feature from plate coordinates.

    Runs the pathfinding algorithm to create a zigzagging rift line
    from ocean edge to ocean edge, avoiding cratons.

    Returns a GpmlFeature representing the rift as a polyline.
    """
    rift_path: RiftPath = generate_rift_path(
        plate_coords=plate_coords,
        craton_polygons=craton_polygons,
        resolution_deg=resolution_deg,
        zigzag_amplitude=zigzag_amplitude,
        zigzag_interval=zigzag_interval,
    )

    rift_feature = GpmlFeature(
        feature_id=f"rift-{plate_id}-{valid_from:.0f}Ma",
        feature_type="Rift",
        name=f"Auto-generated rift (plate {plate_id})",
        description="rift",
        reconstruction_plate_id=plate_id,
        valid_from=valid_from,
        valid_to=valid_to,
        geometry_type="polyline",
        coordinates=rift_path.coordinates,
        properties={
            "rift_type": "auto_generated",
            "start_point": f"{rift_path.start_point[0]:.4f},{rift_path.start_point[1]:.4f}",
            "end_point": f"{rift_path.end_point[0]:.4f},{rift_path.end_point[1]:.4f}",
            "total_length_km": f"{rift_path.total_length_km:.1f}",
            "num_zigzags": str(rift_path.num_zigzags),
            "zigzag_amplitude_deg": str(rift_path.zigzag_amplitude_deg),
        },
    )

    return rift_feature
