"""High-level gplatespython pipeline.

Wires GPML loading, rift generation, reconstruction, and export.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

try:
    from .gpml_io_skeleton import (
        GpmlFeature,
        load_gpml_features,
        save_gpml_features,
        validate_feature_geometry,
    )
    from .reconstruction_skeleton import (
        build_topologies,
        compute_plate_motions,
        generate_rift_feature,
        ReconstructionSnapshot,
    )
except ImportError:
    from gpml_io_skeleton import (
        GpmlFeature,
        load_gpml_features,
        save_gpml_features,
        validate_feature_geometry,
    )
    from reconstruction_skeleton import (
        build_topologies,
        compute_plate_motions,
        generate_rift_feature,
        ReconstructionSnapshot,
    )


@dataclass
class PipelineConfig:
    gpml_input_path: Path
    output_directory: Path
    start_time_ma: float = 0.0
    end_time_ma: float = 1000.0
    time_step_ma: float = 1.0
    rift_resolution_deg: float = 1.0
    rift_zigzag_amplitude: float = 2.0
    rift_zigzag_interval: int = 4
    auto_generate_rift: bool = True


class GPlatesPythonSimulationPipeline:
    """Plate-motion simulation using gplatespython with auto-rift generation."""

    def __init__(self, config: PipelineConfig):
        self.config = config
        self.features: list[GpmlFeature] = []
        self.topologies: list[dict] = []
        self.rotation_model: dict = {}
        self.snapshots: list[ReconstructionSnapshot] = []
        self.rift_features: list[GpmlFeature] = []
        self.validation_errors: list[str] = []

    def load_initial_features(self) -> list[GpmlFeature]:
        """Load and validate supercontinent/craton GPML features."""
        self.features = load_gpml_features(self.config.gpml_input_path)
        self.validation_errors = validate_feature_geometry(self.features)

        if self.validation_errors:
            print(f"Warning: {len(self.validation_errors)} validation issues:")
            for err in self.validation_errors:
                print(f"  - {err}")

        print(
            f"Loaded {len(self.features)} features from {self.config.gpml_input_path}"
        )
        return self.features

    def assign_plate_ids(self) -> dict[int, list[GpmlFeature]]:
        """Assign or resolve reconstruction plate IDs for all features."""
        plate_groups: dict[int, list[GpmlFeature]] = {}
        for feat in self.features:
            pid = feat.reconstruction_plate_id or 0
            if pid not in plate_groups:
                plate_groups[pid] = []
            plate_groups[pid].append(feat)

        print(f"Resolved {len(plate_groups)} plate groups")
        return plate_groups

    def build_rotation_model(self) -> dict:
        """Build reconstruction tree / finite rotations for plates."""
        self.rotation_model = {
            "plates": {},
            "rotations": {},
        }

        for feat in self.features:
            pid = feat.reconstruction_plate_id
            if pid is not None and pid not in self.rotation_model["plates"]:
                self.rotation_model["plates"][pid] = {
                    "name": feat.name or f"Plate {pid}",
                    "features": [],
                }
            if pid is not None:
                self.rotation_model["plates"][pid]["features"].append(feat.feature_id)

        print(f"Built rotation model with {len(self.rotation_model['plates'])} plates")
        return self.rotation_model

    def auto_generate_rift(self) -> list[GpmlFeature]:
        """Auto-generate rift features for all plates.

        For each plate polygon, runs A* pathfinding from ocean edge to
        ocean edge with zigzag patterns, avoiding craton regions.

        Returns the list of generated rift features.
        """
        self.rift_features = []

        plate_features = [
            f for f in self.features if f.coordinates and f.geometry_type == "polygon"
        ]

        craton_features = [
            f
            for f in self.features
            if f.coordinates
            and (
                "craton" in f.name.lower()
                or "craton" in (f.description or "").lower()
                or "Craton" in f.feature_type
            )
        ]

        craton_polygons = [c.coordinates for c in craton_features if c.coordinates]

        print(
            f"Found {len(plate_features)} plate(s) and {len(craton_features)} craton(s)"
        )

        for plate in plate_features:
            plate_id = plate.reconstruction_plate_id or 0
            print(f"  Generating rift for plate '{plate.name}' (ID: {plate_id})...")

            try:
                rift = generate_rift_feature(
                    plate_coords=plate.coordinates,
                    craton_polygons=craton_polygons,
                    plate_id=plate_id,
                    valid_from=plate.valid_from or self.config.start_time_ma,
                    valid_to=plate.valid_to or self.config.end_time_ma,
                    resolution_deg=self.config.rift_resolution_deg,
                    zigzag_amplitude=self.config.rift_zigzag_amplitude,
                    zigzag_interval=self.config.rift_zigzag_interval,
                )
                self.rift_features.append(rift)
                print(
                    f"    Rift: {len(rift.coordinates)} points, "
                    f"{rift.properties.get('total_length_km', '?')} km, "
                    f"{rift.properties.get('num_zigzags', '?')} zigzags"
                )
            except ValueError as e:
                print(f"    Failed: {e}")

        print(f"Generated {len(self.rift_features)} rift feature(s)")
        return self.rift_features

    def run_reconstruction(self) -> list[ReconstructionSnapshot]:
        """Run forward or backward reconstruction through time."""
        self.topologies = build_topologies(self.features + self.rift_features)

        self.snapshots = compute_plate_motions(
            topologies=self.topologies,
            start_time_ma=self.config.start_time_ma,
            end_time_ma=self.config.end_time_ma,
            time_step_ma=self.config.time_step_ma,
        )

        print(f"Computed {len(self.snapshots)} reconstruction snapshot(s)")
        return self.snapshots

    def export_outputs(self) -> dict[str, Optional[Path]]:
        """Export reconstructed GPML and optional rotation files."""
        self.config.output_directory.mkdir(parents=True, exist_ok=True)

        all_features = self.features + self.rift_features

        output_path = self.config.output_directory / "reconstructed.gpml"
        save_gpml_features(all_features, output_path)
        print(f"Exported {len(all_features)} features to {output_path}")

        rift_path: Optional[Path] = None
        if self.rift_features:
            rift_path = self.config.output_directory / "rifts.gpml"
            save_gpml_features(self.rift_features, rift_path)
            print(f"Exported {len(self.rift_features)} rift(s) to {rift_path}")

        return {
            "full": output_path,
            "rifts": rift_path,
        }

    def execute(self) -> dict:
        """Top-level pipeline orchestration."""
        print("=" * 60)
        print("  GPlatesPython Simulation Pipeline")
        print("=" * 60)

        print("\n[1/5] Loading features...")
        self.load_initial_features()

        print("\n[2/5] Assigning plate IDs...")
        self.assign_plate_ids()

        print("\n[3/5] Building rotation model...")
        self.build_rotation_model()

        if self.config.auto_generate_rift:
            print("\n[4/5] Auto-generating rifts...")
            self.auto_generate_rift()
        else:
            print("\n[4/5] Skipping rift generation (disabled)")

        print("\n[5/5] Running reconstruction...")
        self.run_reconstruction()

        print("\n[Export] Saving outputs...")
        outputs = self.export_outputs()

        print("\n" + "=" * 60)
        print("  Pipeline complete")
        print("=" * 60)

        return {
            "features": len(self.features),
            "rifts": len(self.rift_features),
            "snapshots": len(self.snapshots),
            "outputs": outputs,
            "validation_errors": self.validation_errors,
        }
