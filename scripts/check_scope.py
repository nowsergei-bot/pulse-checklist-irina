import hashlib,json
from pathlib import Path
r=Path(__file__).resolve().parents[1]
m=json.loads(__import__('subprocess').check_output(['git','show','main:isolation-manifest.json'],cwd=r))
assert json.loads((r/'isolation-manifest.json').read_text())==m, 'Isolation manifest changed'
for p in m['context']:
 expected=(__import__('subprocess').check_output(['git','show','main:'+p],cwd=r))
 assert (r/p).read_bytes()==expected, 'Shared dependency changed: '+p
print('Shared dependencies unchanged; checklist scope verified')
