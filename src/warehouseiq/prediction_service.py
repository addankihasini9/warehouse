from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
import pandas as pd

from warehouseiq.config import ARTIFACTS_DIR, REPORTS_DIR


class PredictionService:
    def __init__(self, artifacts_dir: Path = ARTIFACTS_DIR) -> None:
        self.artifacts_dir = artifacts_dir
        self.models: dict[str, Any] = {}
        self._load_models()

    def _load_models(self) -> None:
        for path in self.artifacts_dir.glob("*.joblib"):
            self.models[path.stem] = joblib.load(path)

    def available_models(self) -> list[str]:
        return sorted(self.models.keys())

    def predict(self, model_key: str, records: list[dict[str, Any]]) -> dict[str, Any]:
        if model_key not in self.models:
            raise KeyError(f"Model '{model_key}' not loaded. Available: {self.available_models()}")

        model = self.models[model_key]
        X = pd.DataFrame.from_records(records)
        preds = model.predict(X)

        probabilities = None
        if hasattr(model.named_steps["model"], "predict_proba"):
            proba = model.predict_proba(X)
            probabilities = proba[:, 1].tolist() if proba.shape[1] == 2 else proba.tolist()

        explanations = self._build_explanations(model_key, records)

        return {
            "model": model_key,
            "predictions": preds.tolist(),
            "probabilities": probabilities,
            "explanations": explanations,
        }

    def _build_explanations(self, model_key: str, records: list[dict[str, Any]]) -> list[dict[str, Any]]:
        report_path = REPORTS_DIR / "ml_training_report.json"
        if not report_path.exists():
            return [{"message": "Training report unavailable."} for _ in records]

        report = json.loads(report_path.read_text(encoding="utf-8"))
        task_reports = report.get("task_reports", [])

        matched = None
        for tr in task_reports:
            artifact = tr.get("artifact", "")
            if artifact and Path(artifact).stem == model_key:
                matched = tr
                break

        if not matched:
            return [{"message": "No explanation metadata found for model."} for _ in records]

        top_features = matched.get("top_features", [])[:5]
        out = []
        for row in records:
            factors = []
            for f in top_features:
                feature_name = f.get("feature", "")
                raw_col = feature_name.split("__")[-1]
                if raw_col in row and row[raw_col] is not None:
                    factors.append({"feature": raw_col, "value": row[raw_col]})
            out.append(
                {
                    "main_factors": factors,
                    "global_feature_importance": top_features,
                }
            )
        return out
