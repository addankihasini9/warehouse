from pathlib import Path
import os

PROJECT_ROOT = Path(__file__).resolve().parents[2]
RAW_DATA_PATH = Path(
	os.getenv(
		"WAREHOUSEIQ_DATASET_PATH",
		str(PROJECT_ROOT / "warehouse_decision_engine_sample_dataset.csv"),
	)
)
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"
REPORTS_DIR = PROJECT_ROOT / "reports"
ARTIFACTS_DIR = PROJECT_ROOT / "artifacts" / "models"

PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
REPORTS_DIR.mkdir(parents=True, exist_ok=True)
ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
