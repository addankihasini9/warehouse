from __future__ import annotations

import json
import traceback

from warehouseiq.data_profile import run_data_profiling
from warehouseiq.train import run_training


def main() -> int:
    try:
        profile = run_data_profiling()
        print(
            f"Data profiling complete: rows={profile.row_count}, columns={profile.column_count}, duplicates={profile.duplicate_rows}"
        )

        training_report = run_training()
        print("Training completed. Summary:")
        print(json.dumps(training_report, indent=2))
        return 0
    except Exception as exc:
        print("Phase 1 failed:")
        print(str(exc))
        print(traceback.format_exc())
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
