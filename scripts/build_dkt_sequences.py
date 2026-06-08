#!/usr/bin/env python3
"""Build the training-ready DKT .npz from a long-format trajectory file.

Examples:
  ./venv/bin/python3 -m scripts.build_dkt_sequences \
      --traj data/synthetic/trajectories.parquet -o data/dkt_sequences.npz
"""
from __future__ import annotations

import argparse
from pathlib import Path

from scripts.eval import io as traj_io
from scripts.eval import schema
from scripts.eval.sequences import build_sequences, write_npz


def main() -> None:
    ap = argparse.ArgumentParser(description="Long-format trajectories -> DKT .npz")
    ap.add_argument("--traj", type=str, default="data/synthetic/trajectories.parquet")
    ap.add_argument("-o", "--out", type=str, default="data/dkt_sequences.npz")
    ap.add_argument("--seq-len", type=int, default=schema.MAX_SEQ_LEN)
    args = ap.parse_args()

    df, meta = traj_io.read_trajectories(args.traj)
    # echo skill ordering from the sidecar so npz and meta agree
    if meta.get("skill_ids") and list(meta["skill_ids"]) != schema.SKILL_IDS:
        raise SystemExit("meta skill_ids disagree with knowledge_graph.SKILL_IDS — drift!")
    seqs = build_sequences(df, seq_len=args.seq_len)
    write_npz(seqs, Path(args.out))
    n = seqs["X"].shape[0]
    print(f"Wrote {args.out}: X{seqs['X'].shape} Y_skill{seqs['Y_skill'].shape} "
          f"for {n} students, seq_len={args.seq_len}, num_skills={int(seqs['num_skills'])}")


if __name__ == "__main__":
    main()
