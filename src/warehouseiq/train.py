from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor, RandomForestClassifier, RandomForestRegressor
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

from warehouseiq.config import ARTIFACTS_DIR, RAW_DATA_PATH, REPORTS_DIR
from warehouseiq.data_cleaning import clean_dataset, persist_cleaned_dataset
from warehouseiq.data_profile import load_dataset, profile_dataset, write_profile_report
from warehouseiq.preprocessing import build_preprocessor
from warehouseiq.tasks import TaskSpec, detect_ml_tasks

MIN_ROWS_FOR_TRAINING = 50

LEAKAGE_KEYWORDS = {
    "actual",
    "delivered",
    "completed",
    "completion",
    "dispatch",
    "shipped",
    "resolved",
    "final",
    "outcome",
}


def _classification_metrics(y_true: pd.Series, y_pred: np.ndarray, y_proba: np.ndarray | None) -> dict[str, float]:
    metrics: dict[str, float] = {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision_weighted": float(precision_score(y_true, y_pred, average="weighted", zero_division=0)),
        "recall_weighted": float(recall_score(y_true, y_pred, average="weighted", zero_division=0)),
        "f1_weighted": float(f1_score(y_true, y_pred, average="weighted", zero_division=0)),
    }
    if y_proba is not None and len(pd.unique(y_true)) == 2:
        metrics["roc_auc"] = float(roc_auc_score(y_true, y_proba))
    return metrics


def _regression_metrics(y_true: pd.Series, y_pred: np.ndarray) -> dict[str, float]:
    mse = mean_squared_error(y_true, y_pred)
    return {
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "rmse": float(np.sqrt(mse)),
        "r2": float(r2_score(y_true, y_pred)),
    }


def _score(metrics: dict[str, float], task_type: str) -> float:
    if task_type == "classification":
        return metrics.get("roc_auc", metrics.get("f1_weighted", 0.0))
    return -metrics.get("rmse", float("inf"))


def _build_candidates(task_type: str) -> list[tuple[str, Any]]:
    if task_type == "classification":
        return [
            ("logistic_regression", LogisticRegression(max_iter=1000)),
            ("random_forest", RandomForestClassifier(n_estimators=250, random_state=42)),
            ("gradient_boosting", GradientBoostingClassifier(random_state=42)),
        ]
    return [
        ("linear_regression", LinearRegression()),
        ("random_forest_reg", RandomForestRegressor(n_estimators=250, random_state=42)),
        ("gradient_boosting_reg", GradientBoostingRegressor(random_state=42)),
    ]


def _add_derived_targets(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()

    if {"Dispatch_At", "Estimated_Delivery"}.issubset(out.columns):
        dispatch = pd.to_datetime(out["Dispatch_At"], errors="coerce", format="mixed")
        eta = pd.to_datetime(out["Estimated_Delivery"], errors="coerce", format="mixed")
        out["Delay_Risk_Label"] = pd.Series(pd.NA, index=out.index, dtype="object")
        valid = dispatch.notna() & eta.notna()
        out.loc[valid, "Delay_Risk_Label"] = (dispatch[valid] > eta[valid]).astype(int)

    if {"Total_Available", "Avg_Daily_Demand_Units"}.issubset(out.columns):
        demand = pd.to_numeric(out["Avg_Daily_Demand_Units"], errors="coerce")
        available = pd.to_numeric(out["Total_Available"], errors="coerce")
        days_cover = available / demand.replace(0, np.nan)
        out["Stockout_Risk_Label"] = pd.Series(pd.NA, index=out.index, dtype="object")
        valid = days_cover.notna()
        out.loc[valid, "Stockout_Risk_Label"] = (days_cover[valid] < 14).astype(int)

    if "Processing_Time_Minutes" in out.columns:
        proc = pd.to_numeric(out["Processing_Time_Minutes"], errors="coerce")
        if proc.notna().sum() >= MIN_ROWS_FOR_TRAINING:
            threshold = proc.quantile(0.75)
            out["Bottleneck_Risk_Label"] = pd.Series(pd.NA, index=out.index, dtype="object")
            valid = proc.notna()
            out.loc[valid, "Bottleneck_Risk_Label"] = (proc[valid] >= threshold).astype(int)

    return out


def _select_feature_columns(df: pd.DataFrame, target_column: str) -> list[str]:
    derived_target_source_columns: dict[str, set[str]] = {
        "Delay_Risk_Label": {"Dispatch_At", "Estimated_Delivery"},
        "Stockout_Risk_Label": {"Total_Available", "Avg_Daily_Demand_Units"},
        "Bottleneck_Risk_Label": {"Processing_Time_Minutes"},
    }
    blocked_cols = derived_target_source_columns.get(target_column, set())

    selected: list[str] = []
    for col in df.columns:
        if col == target_column:
            continue

        if col in blocked_cols:
            continue

        name_l = col.lower()

        # Drop likely leakage columns that encode post-outcome states.
        if any(k in name_l for k in LEAKAGE_KEYWORDS):
            continue

        # Drop high-missing columns where signal is likely too weak for hackathon-grade reliability.
        missing_ratio = float(df[col].isna().mean())
        if missing_ratio > 0.65:
            continue

        non_null = df[col].dropna()
        if non_null.empty:
            continue

        # Drop mostly constant columns.
        top_freq = non_null.value_counts(normalize=True).iloc[0]
        if top_freq > 0.995:
            continue

        # Drop strict ID columns to reduce overfitting on row identity.
        unique_ratio = non_null.nunique() / max(1, len(non_null))
        if ("id" in name_l or name_l.endswith("_code") or name_l.endswith("_key")) and unique_ratio >= 0.98:
            continue

        # Drop deterministic aggregate columns for demand target to avoid formula leakage.
        if target_column == "Avg_Daily_Demand_Units" and "120_day_demand" in name_l:
            continue

        selected.append(col)
    return selected


def _train_single_task(df: pd.DataFrame, task: TaskSpec) -> dict[str, Any]:
    task_df = df.dropna(subset=[task.target_column]).copy()
    if len(task_df) < MIN_ROWS_FOR_TRAINING:
        return {
            "task": asdict(task),
            "status": "skipped",
            "reason": f"Not enough rows for training after target filtering. Need >= {MIN_ROWS_FOR_TRAINING}, got {len(task_df)}.",
        }

    selected_features = _select_feature_columns(task_df, task.target_column)
    if not selected_features:
        return {
            "task": asdict(task),
            "status": "skipped",
            "reason": "No usable feature columns remained after leakage and quality filtering.",
        }

    modeling_df = task_df[selected_features + [task.target_column]].copy()

    if task.task_type == "classification":
        target_series = pd.to_numeric(modeling_df[task.target_column], errors="coerce")
        valid = target_series.notna()
        modeling_df = modeling_df.loc[valid].copy()
        modeling_df[task.target_column] = target_series.loc[valid].astype(int)

        if modeling_df[task.target_column].nunique() < 2:
            return {
                "task": asdict(task),
                "status": "skipped",
                "reason": "Target has fewer than 2 classes after cleaning.",
            }

    X, y, prep = build_preprocessor(modeling_df, task.target_column)

    stratify = y if task.task_type == "classification" and y.nunique() > 1 else None
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42,
        stratify=stratify,
    )

    candidates = _build_candidates(task.task_type)
    best_name = ""
    best_model = None
    best_metrics: dict[str, float] = {}
    best_score = float("-inf")

    for name, estimator in candidates:
        pipe = Pipeline(
            steps=[
                ("preprocessor", prep.preprocessor),
                ("model", estimator),
            ]
        )
        pipe.fit(X_train, y_train)

        if task.task_type == "classification":
            y_pred = pipe.predict(X_test)
            y_proba = None
            if hasattr(pipe.named_steps["model"], "predict_proba"):
                y_proba = pipe.predict_proba(X_test)[:, 1] if y.nunique() == 2 else None
            metrics = _classification_metrics(y_test, y_pred, y_proba)
        else:
            y_pred = pipe.predict(X_test)
            metrics = _regression_metrics(y_test, y_pred)

        score = _score(metrics, task.task_type)
        if score > best_score:
            best_score = score
            best_name = name
            best_model = pipe
            best_metrics = metrics

    assert best_model is not None

    artifact_name = f"{task.task_name}_{task.target_column}.joblib".replace(" ", "_")
    artifact_path = ARTIFACTS_DIR / artifact_name
    joblib.dump(best_model, artifact_path)

    feature_importance = []
    model = best_model.named_steps["model"]
    if hasattr(model, "feature_importances_"):
        fi = model.feature_importances_
        feature_names = best_model.named_steps["preprocessor"].get_feature_names_out().tolist()
        pairs = sorted(zip(feature_names, fi), key=lambda x: x[1], reverse=True)
        feature_importance = [{"feature": f, "importance": float(v)} for f, v in pairs[:15]]
    elif hasattr(model, "coef_"):
        coef = np.ravel(model.coef_)
        feature_names = best_model.named_steps["preprocessor"].get_feature_names_out().tolist()
        pairs = sorted(zip(feature_names, np.abs(coef)), key=lambda x: x[1], reverse=True)
        feature_importance = [{"feature": f, "importance": float(v)} for f, v in pairs[:15]]

    return {
        "task": asdict(task),
        "status": "trained",
        "rows_used": len(task_df),
        "features_used": selected_features,
        "model": best_name,
        "metrics": best_metrics,
        "artifact": str(artifact_path),
        "top_features": feature_importance,
        "feature_columns": prep.feature_columns,
    }


def run_training() -> dict[str, Any]:
    raw_df = load_dataset(RAW_DATA_PATH)
    cleaned_df, cleaning_report = clean_dataset(raw_df)
    persist_cleaned_dataset(cleaned_df)

    profile = profile_dataset(cleaned_df, RAW_DATA_PATH)
    write_profile_report(profile)

    if len(cleaned_df) < MIN_ROWS_FOR_TRAINING:
        raise ValueError(
            f"Dataset has {len(cleaned_df)} rows after cleaning, but at least {MIN_ROWS_FOR_TRAINING} rows are required for reliable training."
        )

    modeling_df = _add_derived_targets(cleaned_df)

    tasks = detect_ml_tasks(modeling_df)
    if not tasks:
        report = {
            "status": "no_tasks_detected",
            "reason": "No suitable target columns were detected for delay/stockout/demand/bottleneck objectives based on real column names.",
            "available_columns": modeling_df.columns.tolist(),
            "cleaning_report": asdict(cleaning_report),
        }
        (REPORTS_DIR / "ml_training_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        return report

    task_reports = [_train_single_task(modeling_df, task) for task in tasks]

    final_report = {
        "status": "completed",
        "dataset_rows": len(cleaned_df),
        "dataset_columns": len(modeling_df.columns),
        "derived_targets": [
            c
            for c in ["Delay_Risk_Label", "Stockout_Risk_Label", "Bottleneck_Risk_Label"]
            if c in modeling_df.columns
        ],
        "cleaning_report": asdict(cleaning_report),
        "tasks_detected": [asdict(t) for t in tasks],
        "task_reports": task_reports,
    }

    (REPORTS_DIR / "ml_training_report.json").write_text(
        json.dumps(final_report, indent=2), encoding="utf-8"
    )

    return final_report


if __name__ == "__main__":
    result = run_training()
    print(json.dumps(result, indent=2))
