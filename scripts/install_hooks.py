"""Install only this repository's tracked commit hook."""
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parent.parent
result = subprocess.run(['git', 'config', '--get', 'core.hooksPath'],
                        cwd=root, text=True, capture_output=True)
if result.returncode not in (0, 1):
    raise SystemExit(result.stderr)
if result.stdout.strip():
    raise SystemExit('Existing hooksPath found; integrate .githooks/pre-commit without overwriting it')
path = subprocess.check_output(['git', 'rev-parse', '--git-path', 'hooks/pre-commit'],
                               cwd=root, text=True).strip()
hook = Path(path)
if not hook.is_absolute():
    hook = root / hook
template = (root / '.githooks/pre-commit').read_bytes()
if hook.exists() and hook.read_bytes() != template:
    raise SystemExit('Existing pre-commit hook found; integrate the version hook without overwriting it')
hook.parent.mkdir(parents=True, exist_ok=True)
hook.write_bytes(template)
hook.chmod(0o755)
print('Installed repository hook: each change commit increments the patch version')
