"""Validation tests for GPML I/O and rift pathfinding.

Run with: python -m pytest test_gpml_rift.py -v
Or: python test_gpml_rift.py
"""

import sys
import tempfile
from pathlib import Path

# Add parent dir so imports work
sys.path.insert(0, str(Path(__file__).parent))

from gpml_io_skeleton import (
    GpmlFeature,
    load_gpml_features,
    save_gpml_features,
    validate_feature_geometry,
)
from rift_pathfinder import generate_rift_path
from reconstruction_skeleton import generate_rift_feature


def _print_header(title: str) -> None:
    print(f"\n{'=' * 60}")
    print(f"  {title}")
    print(f"{'=' * 60}")


def test_load_actual_gpml() -> bool:
    """Test loading the actual .gpml files from the project."""
    _print_header("TEST: Load actual GPML files")

    gpml_dir = Path(__file__).parent.parent.parent.parent / "public" / "gpml"
    gpml_files = list(gpml_dir.glob("*.gpml"))

    if not gpml_files:
        print("  SKIP: No .gpml files found")
        return True

    all_passed = True
    for gpml_file in gpml_files:
        print(f"\n  Loading: {gpml_file.name}")
        try:
            features = load_gpml_features(gpml_file)
            print(f"    Features found: {len(features)}")

            for feat in features:
                print(f"    - ID: {feat.feature_id}")
                print(f"      Type: {feat.feature_type}")
                print(f"      Name: {feat.name}")
                print(f"      Desc: {feat.description}")
                print(f"      Plate ID: {feat.reconstruction_plate_id}")
                print(f"      Valid: {feat.valid_from} - {feat.valid_to}")
                print(f"      Geometry: {feat.geometry_type}")
                print(f"      Coords: {len(feat.coordinates)} points")
                if feat.coordinates:
                    print(f"      First: {feat.coordinates[0]}")
                    print(f"      Last:  {feat.coordinates[-1]}")

            errors = validate_feature_geometry(features)
            if errors:
                print(f"    Validation issues ({len(errors)}):")
                for err in errors:
                    print(f"      - {err}")
            else:
                print(f"    Validation: PASSED")

            if not features:
                print(f"    FAIL: No features parsed from {gpml_file.name}")
                all_passed = False
            else:
                print(f"    PASSED")

        except Exception as e:
            print(f"    FAIL: {e}")
            all_passed = False

    return all_passed


def test_gpml_roundtrip() -> bool:
    """Test that save -> load produces equivalent features."""
    _print_header("TEST: GPML roundtrip (save -> load)")

    original = GpmlFeature(
        feature_id="test-plate-1",
        feature_type="UnclassifiedFeature",
        name="Test Plate",
        description="test-plate-outline",
        reconstruction_plate_id=42,
        valid_from=0.0,
        valid_to=500.0,
        geometry_type="polygon",
        coordinates=[
            [10.0, 20.0],
            [20.0, 20.0],
            [20.0, 10.0],
            [10.0, 10.0],
            [10.0, 20.0],
        ],
        properties={"source": "test"},
    )

    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = Path(tmpdir) / "roundtrip.gpml"
        save_gpml_features([original], output_path)
        print(f"  Saved to: {output_path}")

        with open(output_path) as f:
            content = f.read()
            print(f"  File size: {len(content)} bytes")
            if "featureMember" in content:
                print(f"  Contains featureMember: YES")
            if "Test Plate" in content:
                print(f"  Contains name: YES")
            if "42" in content:
                print(f"  Contains plate ID: YES")

        loaded = load_gpml_features(output_path)
        print(f"  Loaded features: {len(loaded)}")

        if not loaded:
            print("  FAIL: No features loaded after roundtrip")
            return False

        feat = loaded[0]
        checks = [
            ("feature_id", feat.feature_id == original.feature_id),
            ("name", feat.name == original.name),
            (
                "plate_id",
                feat.reconstruction_plate_id == original.reconstruction_plate_id,
            ),
            ("valid_from", feat.valid_from == original.valid_from),
            ("valid_to", feat.valid_to == original.valid_to),
            ("geometry_type", feat.geometry_type == original.geometry_type),
            ("coord_count", len(feat.coordinates) == len(original.coordinates)),
        ]

        all_passed = True
        for name, passed in checks:
            status = "PASS" if passed else "FAIL"
            print(f"    {status}: {name}")
            if not passed:
                all_passed = False

        if all_passed:
            print(f"  PASSED")
        else:
            print(f"  FAIL: Some checks failed")

        return all_passed


def test_rift_pathfinding_basic() -> bool:
    """Test rift pathfinding with a simple plate (no cratons)."""
    _print_header("TEST: Basic rift pathfinding (no cratons)")

    plate_coords = [
        [10.0, 30.0],
        [20.0, 30.0],
        [30.0, 20.0],
        [30.0, 10.0],
        [20.0, 0.0],
        [10.0, 0.0],
        [0.0, 10.0],
        [0.0, 20.0],
        [10.0, 30.0],
    ]

    try:
        result = generate_rift_path(
            plate_coords=plate_coords,
            craton_polygons=[],
            resolution_deg=1.0,
            zigzag_amplitude=2.0,
            zigzag_interval=4,
        )

        print(f"  Start point: {result.start_point}")
        print(f"  End point:   {result.end_point}")
        print(f"  Path length: {result.total_length_km:.1f} km")
        print(f"  Num points:  {len(result.coordinates)}")
        print(f"  Zigzags:     {result.num_zigzags}")
        print(f"  Amplitude:   {result.zigzag_amplitude_deg} deg")

        if len(result.coordinates) < 2:
            print(f"  FAIL: Path too short")
            return False

        if result.total_length_km <= 0:
            print(f"  FAIL: Invalid path length")
            return False

        print(f"  PASSED")
        return True

    except Exception as e:
        print(f"  FAIL: {e}")
        import traceback

        traceback.print_exc()
        return False


def test_rift_avoids_cratons() -> bool:
    """Test that rift pathfinding avoids craton regions."""
    _print_header("TEST: Rift avoids cratons")

    plate_coords = [
        [0.0, 40.0],
        [40.0, 40.0],
        [40.0, 0.0],
        [0.0, 0.0],
        [0.0, 40.0],
    ]

    craton = [
        [15.0, 25.0],
        [25.0, 25.0],
        [25.0, 15.0],
        [15.0, 15.0],
        [15.0, 25.0],
    ]

    try:
        result = generate_rift_path(
            plate_coords=plate_coords,
            craton_polygons=[craton],
            resolution_deg=1.0,
            zigzag_amplitude=2.0,
            zigzag_interval=4,
        )

        print(f"  Path length: {result.total_length_km:.1f} km")
        print(f"  Num points:  {len(result.coordinates)}")

        def point_in_rect(lon, lat, rect):
            min_lon = min(c[0] for c in rect)
            max_lon = max(c[0] for c in rect)
            min_lat = min(c[1] for c in rect)
            max_lat = max(c[1] for c in rect)
            return min_lon <= lon <= max_lon and min_lat <= lat <= max_lat

        craton_violations = 0
        for lon, lat in result.coordinates:
            if point_in_rect(lon, lat, craton):
                craton_violations += 1
                print(f"    VIOLATION: ({lon}, {lat}) inside craton")

        if craton_violations > 0:
            print(f"  FAIL: {craton_violations} points inside craton")
            return False

        print(f"  PASSED: No craton violations")
        return True

    except Exception as e:
        print(f"  FAIL: {e}")
        import traceback

        traceback.print_exc()
        return False


def test_rift_with_actual_plate() -> bool:
    """Test rift generation using the actual plate from the .gpml file."""
    _print_header("TEST: Rift with actual GPML plate")

    gpml_dir = Path(__file__).parent.parent.parent.parent / "public" / "gpml"
    gpml_files = list(gpml_dir.glob("*.gpml"))

    if not gpml_files:
        print("  SKIP: No .gpml files found")
        return True

    gpml_file = gpml_files[0]
    print(f"  Using: {gpml_file.name}")

    try:
        features = load_gpml_features(gpml_file)
        plate_features = [
            f for f in features if f.coordinates and f.geometry_type == "polygon"
        ]

        if not plate_features:
            print(f"  SKIP: No polygon features found")
            return True

        plate = plate_features[0]
        print(f"  Plate: {plate.name} ({len(plate.coordinates)} coords)")

        result = generate_rift_path(
            plate_coords=plate.coordinates,
            craton_polygons=[],
            resolution_deg=0.5,
            zigzag_amplitude=1.5,
            zigzag_interval=3,
        )

        print(f"  Rift start: {result.start_point}")
        print(f"  Rift end:   {result.end_point}")
        print(f"  Length:     {result.total_length_km:.1f} km")
        print(f"  Points:     {len(result.coordinates)}")
        print(f"  Zigzags:    {result.num_zigzags}")

        if len(result.coordinates) < 3:
            print(f"  FAIL: Path too short")
            return False

        print(f"  PASSED")
        return True

    except Exception as e:
        print(f"  FAIL: {e}")
        import traceback

        traceback.print_exc()
        return False


def test_rift_feature_generation() -> bool:
    """Test generating a complete rift GPML feature."""
    _print_header("TEST: Rift feature generation")

    plate_coords = [
        [10.0, 30.0],
        [20.0, 30.0],
        [30.0, 20.0],
        [30.0, 10.0],
        [20.0, 0.0],
        [10.0, 0.0],
        [0.0, 10.0],
        [0.0, 20.0],
        [10.0, 30.0],
    ]

    try:
        rift_feature = generate_rift_feature(
            plate_coords=plate_coords,
            craton_polygons=[],
            plate_id=1,
            valid_from=0.0,
            valid_to=1000.0,
        )

        print(f"  Feature ID: {rift_feature.feature_id}")
        print(f"  Type: {rift_feature.feature_type}")
        print(f"  Name: {rift_feature.name}")
        print(f"  Plate ID: {rift_feature.reconstruction_plate_id}")
        print(f"  Coords: {len(rift_feature.coordinates)} points")
        print(f"  Geometry: {rift_feature.geometry_type}")

        checks = [
            ("has_feature_id", bool(rift_feature.feature_id)),
            (
                "is_rift_type",
                "rift" in rift_feature.feature_type.lower()
                or "Rift" in rift_feature.feature_type,
            ),
            ("has_coords", len(rift_feature.coordinates) >= 2),
            ("has_plate_id", rift_feature.reconstruction_plate_id is not None),
            ("polyline_geom", rift_feature.geometry_type == "polyline"),
        ]

        all_passed = True
        for name, passed in checks:
            status = "PASS" if passed else "FAIL"
            print(f"    {status}: {name}")
            if not passed:
                all_passed = False

        if all_passed:
            print(f"  PASSED")
        else:
            print(f"  FAIL")

        return all_passed

    except Exception as e:
        print(f"  FAIL: {e}")
        import traceback

        traceback.print_exc()
        return False


def test_rift_gpml_roundtrip() -> bool:
    """Test that a generated rift can be saved and re-loaded."""
    _print_header("TEST: Rift GPML roundtrip")

    plate_coords = [
        [10.0, 30.0],
        [20.0, 30.0],
        [30.0, 20.0],
        [30.0, 10.0],
        [20.0, 0.0],
        [10.0, 0.0],
        [0.0, 10.0],
        [0.0, 20.0],
        [10.0, 30.0],
    ]

    try:
        rift_feature = generate_rift_feature(
            plate_coords=plate_coords,
            craton_polygons=[],
            plate_id=1,
            valid_from=0.0,
            valid_to=1000.0,
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            rift_path = Path(tmpdir) / "rift.gpml"
            save_gpml_features([rift_feature], rift_path)
            print(f"  Saved rift to: {rift_path}")

            with open(rift_path) as f:
                content = f.read()
                if "Polyline" in content or "polyline" in content:
                    print(f"  Contains Polyline: YES")
                if "Rift" in content or "rift" in content:
                    print(f"  Contains Rift type: YES")

            loaded = load_gpml_features(rift_path)
            print(f"  Loaded features: {len(loaded)}")

            if not loaded:
                print(f"  FAIL: No features loaded")
                return False

            rift = loaded[0]
            if len(rift.coordinates) < 2:
                print(f"  FAIL: Loaded rift has too few coordinates")
                return False

            print(f"  Loaded rift coords: {len(rift.coordinates)}")
            print(f"  PASSED")
            return True

    except Exception as e:
        print(f"  FAIL: {e}")
        import traceback

        traceback.print_exc()
        return False


def main() -> None:
    """Run all validation tests."""
    print("\n" + "=" * 60)
    print("  GPML I/O & Rift Pathfinding Validation")
    print("=" * 60)

    tests = [
        ("Load actual GPML", test_load_actual_gpml),
        ("GPML roundtrip", test_gpml_roundtrip),
        ("Basic rift pathfinding", test_rift_pathfinding_basic),
        ("Rift avoids cratons", test_rift_avoids_cratons),
        ("Rift with actual plate", test_rift_with_actual_plate),
        ("Rift feature generation", test_rift_feature_generation),
        ("Rift GPML roundtrip", test_rift_gpml_roundtrip),
    ]

    results = {}
    for name, test_fn in tests:
        try:
            results[name] = test_fn()
        except Exception as e:
            print(f"\n  EXCEPTION in {name}: {e}")
            results[name] = False

    print("\n" + "=" * 60)
    print("  SUMMARY")
    print("=" * 60)

    passed = sum(1 for v in results.values() if v)
    total = len(results)

    for name, result in results.items():
        status = "PASS" if result else "FAIL"
        print(f"  [{status}] {name}")

    print(f"\n  Total: {passed}/{total} passed")

    if passed == total:
        print("\n  All tests passed!")
    else:
        print(f"\n  {total - passed} test(s) failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
