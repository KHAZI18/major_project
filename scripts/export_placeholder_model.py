"""Export an UNTRAINED DKT model so the JS load/inference path is testable
before the synthetic dataset exists. Replace with the trained artifact (Task 5)
before shipping. Usage: venv/bin/python scripts/export_placeholder_model.py
"""
from train_dkt import build_dkt_model, export_tfjs

if __name__ == "__main__":
    export_tfjs(build_dkt_model(), "public/models/dkt", quantize_int8=True)
    print("[dkt] wrote untrained placeholder to public/models/dkt (REPLACE before ship)")
