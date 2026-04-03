"""End-to-end pipeline test with the actual .gpml file."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from pipeline_skeleton import GPlatesPythonSimulationPipeline, PipelineConfig

gpml_dir = Path(__file__).parent.parent.parent.parent / "public" / "gpml"
gpml_file = gpml_dir / "current.gpml"
output_dir = Path(__file__).parent.parent.parent.parent / "public" / "gpml" / "output"

config = PipelineConfig(
    gpml_input_path=gpml_file,
    output_directory=output_dir,
    start_time_ma=0.0,
    end_time_ma=1000.0,
    time_step_ma=10.0,
    rift_resolution_deg=0.5,
    rift_zigzag_amplitude=1.5,
    rift_zigzag_interval=3,
    auto_generate_rift=True,
)

pipeline = GPlatesPythonSimulationPipeline(config)
result = pipeline.execute()

print("\nResult summary:")
for key, val in result.items():
    if key != "outputs":
        print(f"  {key}: {val}")
    else:
        print(f"  outputs:")
        for k, v in val.items():
            print(f"    {k}: {v}")
