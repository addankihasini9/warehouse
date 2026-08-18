from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pandas as pd

from warehouseiq.config import PROCESSED_DIR


@dataclass
class CleaningReport:
    original_rows: int
    cleaned_rows: int
    duplicate_rows_removed: int
    datetime_coercions: list[str]
    numeric_coercions: list[str]
    high_missing_columns: list[str]


def _detect_datetime_columns(df: pd.DataFrame) -> list[str]:
    out: list[str] = []
    for col in df.columns:
        name_l = col.lower()
        if "status" in name_l:
            continue
        if any(k in name_l for k in ("_at", "date", "timestamp", "start", "end", "delivery", "dispatch")) and "minutes" not in name_l:
            out.append(col)
    return out


def _detect_numeric_columns(df: pd.DataFrame, exclude: set[str]) -> list[str]:
    out: list[str] = []
    for col in df.columns:
        if col in exclude:
            continue
        series = df[col]
        if pd.api.types.is_object_dtype(series):
            sample = series.dropna().astype(str).head(80)
            if sample.empty:
                continue
            converted = pd.to_numeric(sample, errors="coerce")
            if converted.notna().mean() >= 0.9:
                out.append(col)
    return out


def clean_dataset(df: pd.DataFrame) -> tuple[pd.DataFrame, CleaningReport]:
    original_rows = len(df)
    duplicate_rows = int(df.duplicated().sum())

    cleaned = df.drop_duplicates().copy()

    datetime_cols = _detect_datetime_columns(cleaned)
    for col in datetime_cols:
        cleaned[col] = pd.to_datetime(cleaned[col], errors="coerce")

    numeric_cols = _detect_numeric_columns(cleaned, exclude=set(datetime_cols))
    for col in numeric_cols:
        cleaned[col] = pd.to_numeric(cleaned[col], errors="coerce")

    for col in cleaned.columns:
        if pd.api.types.is_object_dtype(cleaned[col]):
            cleaned[col] = cleaned[col].astype(str).str.strip().replace({"": pd.NA, "nan": pd.NA})

    missing_ratio = cleaned.isna().mean()
    high_missing_cols = missing_ratio[missing_ratio > 0.6].index.tolist()

    report = CleaningReport(
        original_rows=int(original_rows),
        cleaned_rows=int(len(cleaned)),
        duplicate_rows_removed=duplicate_rows,
        datetime_coercions=datetime_cols,
        numeric_coercions=numeric_cols,
        high_missing_columns=high_missing_cols,
    )

    return cleaned, report


def persist_cleaned_dataset(cleaned_df: pd.DataFrame) -> None:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    cleaned_df.to_csv(PROCESSED_DIR / "cleaned_dataset.csv", index=False)
