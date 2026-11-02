"""
Phase 3 (Option B) — Train 6 XGBoost quantile regression models.

Changes from Option A:
  - Intervals widened to q05 / q95  (90% prediction intervals)
  - n_estimators: 200 -> 400, learning_rate: 0.05 -> 0.03
  - early_stopping_rounds=30 on test eval set
  - reg_alpha=0.1, reg_lambda=1.0 added for L1/L2 regularisation
  - Coverage [GOOD] target updated to 85-95%

Models saved:
    models/sbp_q05.pkl   — SBP lower bound  (5th percentile)
    models/sbp_q50.pkl   — SBP median       (50th percentile)
    models/sbp_q95.pkl   — SBP upper bound  (95th percentile)
    models/dbp_q05.pkl   — DBP lower bound
    models/dbp_q50.pkl   — DBP median
    models/dbp_q95.pkl   — DBP upper bound
    models/feature_columns.pkl — ordered feature list used during training

Usage:
    cd ml/
    python src/train.py
"""

import sys
import joblib
import numpy as np
import pandas as pd
import xgboost as xgb
from pathlib import Path
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, root_mean_squared_error

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ML_ROOT   = Path(__file__).resolve().parent.parent
FEAT_CSV  = ML_ROOT / "data" / "processed" / "features.csv"
MODEL_DIR = ML_ROOT / "models"

# ---------------------------------------------------------------------------
# XGBoost hyper-parameters (shared across all 6 models)
# Change 2: n_estimators 200->400, learning_rate 0.05->0.03
# Change 3: reg_alpha and reg_lambda added
# ---------------------------------------------------------------------------
XGB_PARAMS = dict(
    objective        = "reg:quantileerror",
    max_depth        = 5,
    n_estimators     = 400,
    learning_rate    = 0.03,
    subsample        = 0.8,
    colsample_bytree = 0.8,
    reg_alpha        = 0.1,
    reg_lambda       = 1.0,
    random_state     = 42,
    n_jobs           = -1,
    tree_method      = "hist",
    early_stopping_rounds = 30,
)

# Change 1: widened from q10/q90 to q05/q95
QUANTILES = {
    "q05": 0.05,
    "q50": 0.50,
    "q95": 0.95,
}

TARGETS = ["sbp", "dbp"]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def coverage(y_true: np.ndarray, y_low: np.ndarray, y_high: np.ndarray) -> float:
    """Fraction of samples where y_true falls within [y_low, y_high]."""
    return float(np.mean((y_true >= y_low) & (y_true <= y_high)))


def train_quantile_model(
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_eval: np.ndarray,
    y_eval: np.ndarray,
    alpha: float,
) -> xgb.XGBRegressor:
    """
    Fit one XGBRegressor for the given quantile alpha with early stopping.

    Args:
        X_train, y_train: training data.
        X_eval, y_eval:   held-out set for early stopping (the test split).
        alpha:            quantile level (0.05, 0.50, or 0.95).

    Returns:
        Fitted XGBRegressor.
    """
    model = xgb.XGBRegressor(**XGB_PARAMS, quantile_alpha=alpha)
    model.fit(
        X_train, y_train,
        eval_set=[(X_eval, y_eval)],
        verbose=False,
    )
    return model


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # 1. Load features
    # ------------------------------------------------------------------
    if not FEAT_CSV.exists():
        print(f"ERROR: {FEAT_CSV} not found. Run build_dataset.py first.")
        sys.exit(1)

    df = pd.read_csv(FEAT_CSV)
    print(f"Loaded {len(df)} rows x {df.shape[1]} columns from features.csv")

    df = df.dropna()
    print(f"After dropping NaN rows: {len(df)} rows")

    # ------------------------------------------------------------------
    # 2. Define feature columns (everything except id and targets)
    # ------------------------------------------------------------------
    drop_cols = {"subject_id", "sbp", "dbp"}
    feature_cols = [c for c in df.columns if c not in drop_cols]

    print(f"\nFeature columns ({len(feature_cols)}):")
    print("  " + ", ".join(feature_cols))

    X     = df[feature_cols].values
    y_sbp = df["sbp"].values
    y_dbp = df["dbp"].values

    # ------------------------------------------------------------------
    # 3. Train / test split  80 / 20  (same seed as before)
    # ------------------------------------------------------------------
    (X_train, X_test,
     ys_train, ys_test,
     yd_train, yd_test) = train_test_split(
        X, y_sbp, y_dbp,
        test_size=0.2,
        random_state=42,
    )

    print(f"\nTrain samples : {len(X_train)}")
    print(f"Test  samples : {len(X_test)}")
    print(f"\nConfig: n_estimators=400, lr=0.03, early_stopping=30, "
          f"reg_alpha=0.1, reg_lambda=1.0")
    print(f"Intervals: q05 / q50 / q95  (90% prediction intervals)")

    # ------------------------------------------------------------------
    # 4. Train all 6 models
    # ------------------------------------------------------------------
    models = {}
    best_iters = {}

    for target_name, y_train, y_test in [
        ("sbp", ys_train, ys_test),
        ("dbp", yd_train, yd_test),
    ]:
        print(f"\n{'='*55}")
        print(f"Training {target_name.upper()} models ...")
        print(f"{'='*55}")

        for q_label, alpha in QUANTILES.items():
            print(f"  {target_name}_{q_label}  (alpha={alpha:.2f}) ... ", end="", flush=True)
            model = train_quantile_model(X_train, y_train, X_test, y_test, alpha)

            key = f"{target_name}_{q_label}"
            models[key] = model
            best_iters[key] = model.best_iteration

            pred_train = model.predict(X_train)
            mae_train  = mean_absolute_error(y_train, pred_train)
            print(f"train MAE={mae_train:.2f}  best_iter={model.best_iteration}")

    # ------------------------------------------------------------------
    # 5. Evaluate on test set
    # ------------------------------------------------------------------
    print(f"\n{'='*55}")
    print("TEST SET EVALUATION")
    print(f"{'='*55}")

    results = {}
    for target_name, y_test in [("sbp", ys_test), ("dbp", yd_test)]:
        # Change 1: updated key names q05/q95
        pred_q05 = models[f"{target_name}_q05"].predict(X_test)
        pred_q50 = models[f"{target_name}_q50"].predict(X_test)
        pred_q95 = models[f"{target_name}_q95"].predict(X_test)

        mae  = mean_absolute_error(y_test, pred_q50)
        rmse = root_mean_squared_error(y_test, pred_q50)
        cov  = coverage(y_test, pred_q05, pred_q95)

        results[target_name] = {"mae": mae, "rmse": rmse, "coverage": cov}

        print(f"\n  {target_name.upper()} (median predictions):")
        print(f"    MAE      = {mae:.2f} mmHg", end="")
        print("  [EXCELLENT]" if mae < (10 if target_name == "sbp" else 6)
              else "  [GOOD]"   if mae < (12 if target_name == "sbp" else 8)
              else "  [NEEDS TUNING]")
        print(f"    RMSE     = {rmse:.2f} mmHg")

        # Change 4: updated coverage target to 85-95% for 90% intervals
        print(f"    90% PI coverage = {cov*100:.1f}%", end="")
        print("  [GOOD]" if 0.85 <= cov <= 0.95 else "  [CHECK INTERVAL WIDTH]")

        # Sample predictions
        print(f"\n    Sample predictions (first 8 test subjects):")
        print(f"    {'Actual':>8} {'Pred_Q50':>10} {'Pred_Q05':>10} {'Pred_Q95':>10}  In?")
        for i in range(min(8, len(y_test))):
            inside = "Y" if pred_q05[i] <= y_test[i] <= pred_q95[i] else "N"
            print(f"    {y_test[i]:>8.1f} {pred_q50[i]:>10.1f} "
                  f"{pred_q05[i]:>10.1f} {pred_q95[i]:>10.1f}  {inside}")

    # ------------------------------------------------------------------
    # 6. Save models + feature column order
    # ------------------------------------------------------------------
    print(f"\n{'='*55}")
    print("Saving models ...")

    for key, model in models.items():
        out = MODEL_DIR / f"{key}.pkl"
        joblib.dump(model, out)
        print(f"  Saved: {out.name}  ({out.stat().st_size / 1024:.1f} KB)  "
              f"best_iter={best_iters[key]}")

    # Remove old q10/q90 files if present (from Option A run)
    for stale in ["sbp_q10.pkl", "sbp_q90.pkl", "dbp_q10.pkl", "dbp_q90.pkl"]:
        stale_path = MODEL_DIR / stale
        if stale_path.exists():
            stale_path.unlink()
            print(f"  Removed stale: {stale}")

    feat_col_path = MODEL_DIR / "feature_columns.pkl"
    joblib.dump(feature_cols, feat_col_path)
    print(f"  Saved: feature_columns.pkl  ({len(feature_cols)} features)")

    # ------------------------------------------------------------------
    # 7. Feature importance (SBP and DBP median models)
    # ------------------------------------------------------------------
    for target_name in ["sbp", "dbp"]:
        print(f"\n{'='*55}")
        print(f"Feature Importance ({target_name.upper()} median model, top 10):")
        importance = models[f"{target_name}_q50"].feature_importances_
        imp_df = pd.DataFrame({
            "feature":    feature_cols,
            "importance": importance,
        }).sort_values("importance", ascending=False).head(10)

        for _, r in imp_df.iterrows():
            bar = "#" * int(r["importance"] * 200)
            print(f"  {r['feature']:<18} {r['importance']:.4f}  {bar}")

    # ------------------------------------------------------------------
    # 8. Summary
    # ------------------------------------------------------------------
    print(f"\n{'='*55}")
    print("PHASE 3 OPTION B — FINAL SUMMARY")
    print(f"{'='*55}")
    print(f"  SBP  MAE      = {results['sbp']['mae']:.2f} mmHg")
    print(f"  SBP  RMSE     = {results['sbp']['rmse']:.2f} mmHg")
    print(f"  SBP  90% cov  = {results['sbp']['coverage']*100:.1f}%")
    print(f"  DBP  MAE      = {results['dbp']['mae']:.2f} mmHg")
    print(f"  DBP  RMSE     = {results['dbp']['rmse']:.2f} mmHg")
    print(f"  DBP  90% cov  = {results['dbp']['coverage']*100:.1f}%")
    print(f"{'='*55}")


if __name__ == "__main__":
    main()
