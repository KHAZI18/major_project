#!/usr/bin/env python3
"""Generate synthetic BKT student trajectories for DKT training (spec §5.3).

Examples:
  ./venv/bin/python3 -m scripts.simulate_students                       # 10k students
  ./venv/bin/python3 -m scripts.simulate_students -n 1000 -m 60 -o data/synthetic/small.parquet
"""
from __future__ import annotations

import argparse
import subprocess
import time
from pathlib import Path

from scripts.eval import io as traj_io
from scripts.eval.simulator import simulate_dataset


def _git_sha_of_kg() -> str:
    try:
        out = subprocess.run(
            ["git", "log", "-1", "--format=%H", "--", "src/engine/knowledgeGraph.js"],
            capture_output=True, text=True, check=True,
        )
        return out.stdout.strip() or "unknown"
    except Exception:
        return "unknown"


def main() -> None:
    ap = argparse.ArgumentParser(description="Generate synthetic student trajectories.")
    ap.add_argument("-n", "--num-students", type=int, default=10_000)
    ap.add_argument("-m", "--max-interactions", type=int, default=80)
    ap.add_argument("-s", "--seed", type=int, default=2026)
    ap.add_argument("-o", "--out", type=str, default="data/synthetic/trajectories.parquet")
    args = ap.parse_args()

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    t0 = time.time()
    df = simulate_dataset(
        num_students=args.num_students,
        max_interactions=args.max_interactions,
        seed=args.seed,
    )
    elapsed = time.time() - t0

    meta = {
        "num_students": args.num_students,
        "max_interactions": args.max_interactions,
        "seed": args.seed,
        "num_rows": int(len(df)),
        "git_sha_of_knowledge_graph_js": _git_sha_of_kg(),
        "generated_in_seconds": round(elapsed, 1),
    }
    traj_io.write_trajectories(df, out, meta=meta)

    print(f"Wrote {len(df):,} rows for {args.num_students:,} students to {out}")
    print(f"Mean interactions/student: {len(df) / args.num_students:.1f}")
    print(f"Overall accuracy: {df['correct'].mean():.3f}")
    print(f"Elapsed: {elapsed:.1f}s")


if __name__ == "__main__":
    main()
