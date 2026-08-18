from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

from warehouseiq.config import PROCESSED_DIR, REPORTS_DIR


def _ensure_firebase_admin():
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
    except ImportError as exc:
        raise ImportError(
            "firebase-admin is not installed. Run: pip install -r requirements.txt"
        ) from exc
    return firebase_admin, credentials, firestore


def _init_firestore_client():
    firebase_admin, credentials, firestore = _ensure_firebase_admin()

    if firebase_admin._apps:
        return firestore.client()

    project_id = os.getenv("FIREBASE_PROJECT_ID", "warehouse-240bc")
    sa_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
    creds_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")

    if sa_json:
        cred_obj = credentials.Certificate(json.loads(sa_json))
        firebase_admin.initialize_app(cred_obj, {"projectId": project_id})
    elif creds_path:
        cred_obj = credentials.Certificate(creds_path)
        firebase_admin.initialize_app(cred_obj, {"projectId": project_id})
    else:
        raise ValueError(
            "Missing Firebase Admin credentials. Set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON."
        )

    return firestore.client()


def _row_to_jsonable(row: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k, v in row.items():
        if pd.isna(v):
            out[k] = None
        elif isinstance(v, (pd.Timestamp, datetime)):
            out[k] = v.isoformat()
        else:
            out[k] = v
    return out


def sync_to_firestore() -> dict[str, Any]:
    db = _init_firestore_client()

    cleaned_path = PROCESSED_DIR / "cleaned_dataset.csv"
    training_report_path = REPORTS_DIR / "ml_training_report.json"
    data_profile_path = REPORTS_DIR / "data_profile.json"

    if not cleaned_path.exists():
        raise FileNotFoundError(f"Cleaned dataset not found: {cleaned_path}")
    if not training_report_path.exists():
        raise FileNotFoundError(f"Training report not found: {training_report_path}")

    cleaned_df = pd.read_csv(cleaned_path)
    training_report = json.loads(training_report_path.read_text(encoding="utf-8"))
    data_profile = (
        json.loads(data_profile_path.read_text(encoding="utf-8")) if data_profile_path.exists() else {}
    )

    batch = db.batch()
    warehouse_orders = db.collection("warehouse_orders")
    for row in cleaned_df.to_dict(orient="records"):
        order_id = str(row.get("Order_ID") or f"ROW_{abs(hash(str(row))) % 10_000_000}")
        doc_ref = warehouse_orders.document(order_id)
        batch.set(doc_ref, _row_to_jsonable(row), merge=True)

    metadata_ref = db.collection("warehouseiq_metadata").document("latest_training")
    batch.set(
        metadata_ref,
        {
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "row_count": int(len(cleaned_df)),
            "training_report": training_report,
            "data_profile": data_profile,
        },
        merge=True,
    )

    prediction_rows = []
    for tr in training_report.get("task_reports", []):
        if tr.get("status") != "trained":
            continue
        task = tr.get("task", {})
        prediction_rows.append(
            {
                "task_name": task.get("task_name"),
                "objective": task.get("objective"),
                "target_column": task.get("target_column"),
                "model": tr.get("model"),
                "metrics": tr.get("metrics"),
                "top_features": tr.get("top_features", [])[:10],
                "artifact": tr.get("artifact"),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    pred_collection = db.collection("model_registry")
    for item in prediction_rows:
        key = f"{item['task_name']}_{item['target_column']}".replace(" ", "_")
        batch.set(pred_collection.document(key), item, merge=True)

    batch.commit()

    return {
        "status": "synced",
        "orders_synced": int(len(cleaned_df)),
        "models_synced": int(len(prediction_rows)),
    }


if __name__ == "__main__":
    result = sync_to_firestore()
    print(json.dumps(result, indent=2))
