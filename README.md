# WarehouseIQ - Phase 1 (Dataset + ML Foundation)

This repository currently contains the WarehouseIQ Phase 1 implementation:

- Dataset profiling and data dictionary generation
- Reusable preprocessing pipeline
- Automatic ML task detection based on actual columns
- Model training, evaluation, and artifact saving
- Prediction service with explainability metadata
- Firestore sync for cleaned data and model metadata

## Project Structure

- `warehouse_decision_engine_sample_dataset.csv` -> source dataset (kept unchanged)
- `src/warehouseiq/data_profile.py` -> data profiling + data dictionary
- `src/warehouseiq/preprocessing.py` -> cleaning + feature preprocessing
- `src/warehouseiq/tasks.py` -> task detection (delay/stockout/demand/bottleneck if columns exist)
- `src/warehouseiq/train.py` -> train/evaluate/save models
- `src/warehouseiq/prediction_service.py` -> load artifacts + inference + explanation
- `src/warehouseiq/run_phase1.py` -> single command runner for Phase 1
- `src/warehouseiq/firestore_sync.py` -> push cleaned data + training report to Firestore
- `reports/data_profile.json` -> generated data profile
- `reports/data_dictionary.md` -> generated dictionary
- `reports/ml_training_report.json` -> training/evaluation results
- `artifacts/models/*.joblib` -> trained model artifacts

## Run

1. Install dependencies:

   pip install -r requirements.txt

2. Run Phase 1:

   PYTHONPATH=src python -m warehouseiq.run_phase1

3. Sync to Firestore:

   export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
   export FIREBASE_PROJECT_ID=warehouse-240bc
   PYTHONPATH=src python -m warehouseiq.firestore_sync

## Notes

- The source dataset file is read-only input and is never overwritten.
- Cleaned/processed data and reports are written under `data/processed` and `reports`.
- Training is skipped safely when the dataset is empty or there are not enough rows.
- Secrets are read from environment variables (see `.env.example`).
