"""Owner removed the workshop application scope restriction on 2026-10-28."""
import subprocess
from pathlib import Path
subprocess.run(["git", "diff", "--check"], cwd=Path(__file__).resolve().parents[1], check=True)
print("Application scope is unrestricted; build and tests remain required")
