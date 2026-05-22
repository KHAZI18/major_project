# DKT training (`scripts/`)

Off-device pipeline that produces `public/models/dkt/`. Inference is on-device
in `src/engine/masteryModelDKT.js`.

## Setup
```bash
venv/bin/python -m pip install --upgrade pip
venv/bin/pip install -r ../requirements-dkt.txt   # from repo root: -r requirements-dkt.txt
venv/bin/python -m pytest scripts -q              # model/encoder/AUC/export tests
```
Apple-Silicon / Python 3.9: if the `tensorflow` wheel won't install, use a 3.10/3.11
venv, or train on Colab (below). The model is a tiny LSTM — CPU training is fine.

## Train + export (needs the synthetic dataset)
```bash
venv/bin/python train_dkt.py \
  --data ../data/synthetic/trajectories.parquet \
  --out  ../public/models/dkt \
  --epochs 30 --batch-size 64 --val-split 0.2 --auc-gate 0.85
# add --quantize-int8 if the export exceeds ~3 MB (spec §10)
```
`trajectories.parquet` (+ `trajectories.meta.json`) is produced by the
**data-producer plan** (`docs/superpowers/plans/2026-05-22-synthetic-data-and-evaluation.md`);
the locked schema is in that plan's `docs/data/TRAJECTORY_SCHEMA.md`. It MUST be
implemented first.

## Colab (no local TF needed)
```python
!pip install tensorflow tensorflowjs scikit-learn pandas pyarrow
# upload train_dkt.py + trajectories.parquet + trajectories.meta.json, then:
from train_dkt import build_dkt_model, train, evaluate_auc, export_tfjs, load_dataset
ds = load_dataset("trajectories.parquet")   # reads the .meta.json sidecar too
# split by student, train, check AUC >= 0.85, export_tfjs(model, "dkt"), download the folder
```

## Dimensions (IMPORTANT)
13 skills -> input one-hot dim = 26, output dim = 13. NOT the spec's 24/12.
Skill ordering = `src/engine/knowledgeGraph.js` SKILL_IDS, surfaced to Python via
the data-producer's `trajectories.meta.json` `skill_ids`. One-hot index convention
is LOCKED: `dkt_input_idx = skill_idx * 2 + correct` (Python encoder, JS encoder,
and the dataset all agree).
