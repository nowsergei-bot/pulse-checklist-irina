#!/usr/bin/env python3
"""Create a reviewable checklist-only patch; never write into Pulse."""
import hashlib, json, subprocess, sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
def git(*args): return subprocess.check_output(['git',*args],cwd=root)
base=sys.argv[1] if len(sys.argv)>1 else 'main'
manifest=json.loads(git('show',base+':isolation-manifest.json'))
changed=git('diff','--name-only',base,'HEAD','--','frontend/src','backend').decode().splitlines()
for p in changed:
 if p not in manifest['editable']:
  raise SystemExit('STOP: shared dependency / sandbox file changed: '+p)
if len(sys.argv)<3: raise SystemExit('Usage: python3 scripts/export_patch.py BASE_SHA /path/to/pulse > checklist.patch')
pulse=Path(sys.argv[2]).resolve()
for p in changed:
 f=pulse/p
 if not f.is_file() or hashlib.sha256(f.read_bytes()).hexdigest()!=manifest['editable'][p]:
  raise SystemExit('STOP: Pulse has diverged; manual merge required: '+p)
if git('status','--porcelain').strip(): raise SystemExit('STOP: commit workspace changes first')
sys.stdout.buffer.write(git('diff','--binary',base,'HEAD','--',*changed) if changed else b'')
