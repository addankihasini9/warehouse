from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd

from warehouseiq.config import RAW_DATA_PATH, REPORTS_DIR


@dataclass
class DatasetProfile:
    file_path: str
    file_size_bytes: int
    row_count: int
    column_count: int
    columns: list[dict[str, Any]]
    missing_by_column: dict[str, int]
    duplicate_rows: int
    categorical_columns: list[str]
    numerical_columns: list[str]
    datetime_columns: list[str]
    id_like_columns: list[str]


def _safe_to_datetime(series: pd.Series) -> bool:
    if series.dropna().empty:
        return False
    sample = series.dropna().astype(str).head(50)
    parsed = pd.to_datetime(sample, errors="coerce", utc=False, format="mixed")
    return parsed.notna().mean() >= 0.8


def profile_dataset(df: pd.DataFrame, source_path: Path) -> DatasetProfile:
    categorical_cols: list[str] = []
    numerical_cols: list[str] = []
    datetime_cols: list[str] = []
    id_like_cols: list[str] = []
    columns_meta: list[dict[str, Any]] = []

    for col in df.columns:
        series = df[col]
        name_l = col.lower()

        inferred_type = str(series.dtype)
        if pd.api.types.is_numeric_dtype(series):
            numerical_cols.append(col)
            col_type = "numeric"
        elif (
            "status" not in name_l
            and
            any(k in name_l for k in ("_at", "date", "timestamp", "start", "end", "delivery", "dispatch"))
            and "minutes" not in name_l
        ) or _safe_to_datetime(series):
            datetime_cols.append(col)
            col_type = "datetime-like"
            inferred_type = "datetime-candidate"
        else:
            categorical_cols.append(col)
            col_type = "categorical/text"

        unique_non_null = int(series.nunique(dropna=True))
        missing_count = int(series.isna().sum())
        missing_pct = round((missing_count / len(df) * 100.0), 2) if len(df) else 0.0

        is_id_like = (
            unique_non_null == len(series.dropna())
            and ("id" in name_l or name_l.endswith("_key") or name_l.endswith("_code"))
        )
        if is_id_like:
            id_like_cols.append(col)

        columns_meta.append(
            {
                "column": col,
                "detected_type": col_type,
                "pandas_dtype": inferred_type,
                "missing_count": missing_count,
                "missing_pct": missing_pct,
                "unique_non_null": unique_non_null,
                "id_like": is_id_like,
            }
        )

    return DatasetProfile(
        file_path=str(source_path),
        file_size_bytes=source_path.stat().st_size,
        row_count=int(len(df)),
        column_count=int(len(df.columns)),
        columns=columns_meta,
        missing_by_column={c: int(df[c].isna().sum()) for c in df.columns},
        duplicate_rows=int(df.duplicated().sum()),
        categorical_columns=categorical_cols,
        numerical_columns=numerical_cols,
        datetime_columns=datetime_cols,
        id_like_columns=id_like_cols,
    )


def load_dataset(csv_path: Path = RAW_DATA_PATH) -> pd.DataFrame:
    if not csv_path.exists():
        raise FileNotFoundError(f"Dataset not found: {csv_path}")
    if csv_path.stat().st_size == 0:
        raise ValueError(
            "Dataset file is empty (0 bytes). Add data to the CSV and rerun profiling/training."
        )

    df = pd.read_csv(csv_path)
    if df.empty:
        raise ValueError(
            "Dataset has no rows. Add data rows to the CSV and rerun profiling/training."
        )
    return df


def write_profile_report(profile: DatasetProfile) -> None:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    json_path = REPORTS_DIR / "data_profile.json"
    md_path = REPORTS_DIR / "data_dictionary.md"

    with json_path.open("w", encoding="utf-8") as f:
        json.dump(profile.__dict__, f, indent=2)

    lines = [
        "# WarehouseIQ Data Dictionary",
        "",
        f"- Source file: {profile.file_path}",
        f"- File size (bytes): {profile.file_size_bytes}",
        f"- Rows: {profile.row_count}",
        f"- Columns: {profile.column_count}",
        f"- Duplicate rows: {profile.duplicate_rows}",
        "",
        "## Column Dictionary",
        "",
        "| Column | Detected Type | Pandas DType | Missing % | Unique (non-null) | ID-like |",
        "|---|---|---|---:|---:|---:|",
    ]

    for col in profile.columns:
        lines.append(
            "| {column} | {detected_type} | {pandas_dtype} | {missing_pct} | {unique_non_null} | {id_like} |".format(
                **col
            )
        )

    lines.extend(
        [
            "",
            "## Auto-detected Groups",
            "",
            f"- Categorical columns: {', '.join(profile.categorical_columns) if profile.categorical_columns else 'None'}",
            f"- Numerical columns: {', '.join(profile.numerical_columns) if profile.numerical_columns else 'None'}",
            f"- Datetime-like columns: {', '.join(profile.datetime_columns) if profile.datetime_columns else 'None'}",
            f"- ID-like columns: {', '.join(profile.id_like_columns) if profile.id_like_columns else 'None'}",
        ]
    )

    md_path.write_text("\n".join(lines), encoding="utf-8")


def run_data_profiling() -> DatasetProfile:
    df = load_dataset(RAW_DATA_PATH)
    profile = profile_dataset(df, RAW_DATA_PATH)
    write_profile_report(profile)
    return profile


if __name__ == "__main__":
    prof = run_data_profiling()
    print(
        f"Profile complete. Rows={prof.row_count}, Columns={prof.column_count}, "
        f"Duplicates={prof.duplicate_rows}"
    )
