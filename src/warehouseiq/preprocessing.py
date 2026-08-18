from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


@dataclass
class PreprocessArtifacts:
    preprocessor: ColumnTransformer
    feature_columns: list[str]
    numeric_columns: list[str]
    categorical_columns: list[str]
    datetime_columns: list[str]


def _infer_column_groups(df: pd.DataFrame, target_column: str) -> tuple[list[str], list[str], list[str]]:
    features = [c for c in df.columns if c != target_column]
    numeric_cols: list[str] = []
    categorical_cols: list[str] = []
    datetime_cols: list[str] = []

    for col in features:
        series = df[col]
        if pd.api.types.is_numeric_dtype(series):
            numeric_cols.append(col)
        elif (
            "status" not in col.lower()
            and any(k in col.lower() for k in ("_at", "date", "timestamp", "start", "end", "delivery", "dispatch"))
            and "minutes" not in col.lower()
        ):
            datetime_cols.append(col)
        else:
            categorical_cols.append(col)

    return numeric_cols, categorical_cols, datetime_cols


def _expand_datetime_features(df: pd.DataFrame, datetime_cols: list[str]) -> pd.DataFrame:
    out = df.copy()
    for col in datetime_cols:
        dt = pd.to_datetime(out[col], errors="coerce")
        out[f"{col}_year"] = dt.dt.year
        out[f"{col}_month"] = dt.dt.month
        out[f"{col}_day"] = dt.dt.day
        out[f"{col}_dayofweek"] = dt.dt.dayofweek
        out[f"{col}_hour"] = dt.dt.hour
        out = out.drop(columns=[col])
    return out


def clip_numeric_outliers(df: pd.DataFrame, numeric_cols: list[str]) -> pd.DataFrame:
    clipped = df.copy()
    for col in numeric_cols:
        series = clipped[col]
        if series.dropna().empty:
            continue
        q1 = series.quantile(0.25)
        q3 = series.quantile(0.75)
        iqr = q3 - q1
        if iqr == 0:
            continue
        lower = q1 - 1.5 * iqr
        upper = q3 + 1.5 * iqr
        clipped[col] = np.clip(series, lower, upper)
    return clipped


def build_preprocessor(df: pd.DataFrame, target_column: str) -> tuple[pd.DataFrame, pd.Series, PreprocessArtifacts]:
    numeric_cols, categorical_cols, datetime_cols = _infer_column_groups(df, target_column)

    features_df = df.drop(columns=[target_column])
    features_df = _expand_datetime_features(features_df, datetime_cols)

    # Recompute numeric/categorical after datetime expansion.
    expanded_numeric = [c for c in features_df.columns if pd.api.types.is_numeric_dtype(features_df[c])]
    expanded_categorical = [c for c in features_df.columns if c not in expanded_numeric]

    features_df = clip_numeric_outliers(features_df, expanded_numeric)

    numeric_pipe = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )
    categorical_pipe = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("encoder", OneHotEncoder(handle_unknown="ignore")),
        ]
    )

    preprocessor = ColumnTransformer(
        transformers=[
            ("num", numeric_pipe, expanded_numeric),
            ("cat", categorical_pipe, expanded_categorical),
        ],
        remainder="drop",
    )

    y = df[target_column]
    artifacts = PreprocessArtifacts(
        preprocessor=preprocessor,
        feature_columns=features_df.columns.tolist(),
        numeric_columns=expanded_numeric,
        categorical_columns=expanded_categorical,
        datetime_columns=datetime_cols,
    )

    return features_df, y, artifacts
