from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import pandas as pd

TaskType = Literal["classification", "regression", "forecasting"]


@dataclass
class TaskSpec:
    task_name: str
    objective: str
    target_column: str
    task_type: TaskType
    group_by_column: str | None = None
    time_column: str | None = None


OBJECTIVE_KEYWORDS: dict[str, tuple[str, ...]] = {
    "order_delay_risk": ("delay", "late", "fulfillment_risk", "at_risk", "sla_breach", "delay_risk"),
    "stockout_risk": ("stockout", "low_stock", "reorder", "out_of_stock", "stockout_risk"),
    "demand": ("demand", "units_sold", "sales_qty", "consumption", "order_qty"),
    "bottleneck": ("bottleneck", "stage_delay", "pick_delay", "pack_delay", "queue_time", "bottleneck_risk"),
}


def _choose_task_type(series: pd.Series) -> TaskType:
    non_null = series.dropna()
    if non_null.empty:
        return "classification"
    if pd.api.types.is_numeric_dtype(non_null):
        unique_n = non_null.nunique()
        if unique_n <= 5:
            return "classification"
        return "regression"
    unique_n = non_null.nunique()
    return "classification" if unique_n <= max(20, int(0.1 * len(non_null))) else "regression"


def detect_ml_tasks(df: pd.DataFrame) -> list[TaskSpec]:
    tasks: list[TaskSpec] = []
    lower_map = {c.lower(): c for c in df.columns}

    datetime_candidates = [
        c
        for c in df.columns
        if any(k in c.lower() for k in ("_at", "date", "timestamp", "start", "end", "delivery", "dispatch"))
        and "minutes" not in c.lower()
    ]
    sku_candidates = [c for c in df.columns if "sku" in c.lower() or "product" in c.lower()]

    for objective, keywords in OBJECTIVE_KEYWORDS.items():
        candidate_cols = [
            original
            for lower, original in lower_map.items()
            if any(k in lower for k in keywords)
        ]
        if not candidate_cols:
            continue

        target = candidate_cols[0]
        task_type = _choose_task_type(df[target])

        if objective == "demand" and datetime_candidates and sku_candidates:
            tasks.append(
                TaskSpec(
                    task_name="demand_forecasting",
                    objective=objective,
                    target_column=target,
                    task_type="forecasting",
                    group_by_column=sku_candidates[0],
                    time_column=datetime_candidates[0],
                )
            )
            continue

        tasks.append(
            TaskSpec(
                task_name=objective,
                objective=objective,
                target_column=target,
                task_type=task_type,
            )
        )

    seen_targets: set[str] = set()
    deduped: list[TaskSpec] = []
    for task in tasks:
        if task.target_column in seen_targets:
            continue
        seen_targets.add(task.target_column)
        deduped.append(task)

    return deduped
