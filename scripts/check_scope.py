import hashlib,json
from pathlib import Path
r=Path(__file__).resolve().parents[1]
m=json.loads((r/'isolation-manifest.json').read_text())
for path in m['context']:
 assert hashlib.sha256((r/path).read_bytes()).hexdigest()==m['contextHashes'][path], 'Shared dependency changed: '+path
print('Shared dependencies unchanged; checklist scope verified')
