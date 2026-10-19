"""Patch per change commit, or an explicit minor upgrade, locally and on GitHub."""
import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from build_distribution import ROOT
from check_repository import validate, tracked_paths

MANAGED = ['package.json', 'plugin/ghost.json', 'README.md']
BOT_SUBJECT = 'build: synchronize version '
INTENT_FILE = 'VERSION_BUMP.json'


def git(*args, cwd=ROOT):
    return subprocess.check_output(['git', *args], cwd=cwd)


def version_tuple(version):
    if not re.fullmatch(r'(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)', version):
        raise ValueError('Automatic patch increments require an x.y.z version')
    return tuple(map(int, version.split('.')))


def increment(version, level='patch'):
    major, minor, patch = version_tuple(version)
    if level == 'minor':
        return f'{major}.{minor + 1}.0'
    return f'{major}.{minor}.{patch + 1}'


def bump_level(files, intent_ref, base_version):
    if INTENT_FILE not in files:
        return 'patch'
    intent = json.loads(git('show', f'{intent_ref}:{INTENT_FILE}'))
    if intent != {'base': base_version, 'level': 'minor'}:
        raise ValueError('Minor intent must specify the parent version and level=minor')
    return 'minor'


def version_at(ref):
    return json.loads(git('show', f'{ref}:package.json'))['version']


def synchronize(version):
    version_tuple(version)
    for name in MANAGED[:2]:
        path = ROOT / name
        info = json.loads(path.read_text(encoding='utf-8'))
        info['version'] = version
        path.write_text(json.dumps(info, ensure_ascii=False, indent=2) + chr(10), encoding='utf-8')
    readme = ROOT / 'README.md'
    text = readme.read_text(encoding='utf-8')
    display_name = json.loads((ROOT / 'repository-policy.json').read_text(encoding='utf-8'))['name']
    text = re.sub(r'\A# ' + re.escape(display_name) + r' — [^\n]+', '# ' + display_name + ' — ' + version, text)
    readme.write_text(text, encoding='utf-8')
    print('Synchronized version ' + version)


def prepare_index():
    if not git('diff', '--cached', '--name-only').strip():
        return
    if git('ls-files', '--cached', '--', '*.cindy').strip():
        raise ValueError('Do not commit .cindy files; distribute them through GitHub Releases only')
    # Only build staged source, never sneak unstaged changes into the commit.
    if git('diff', '--name-only', '--', *MANAGED).strip():
        raise ValueError('Stage or stash unstaged changes to version/README files first')
    base = version_at('HEAD')
    staged = git('diff', '--cached', '--name-only').decode().splitlines()
    expected = increment(base, bump_level(staged, '', base))
    with tempfile.TemporaryDirectory(prefix='jixin-version-') as temp:
        snapshot = Path(temp)
        git('checkout-index', '--all', '--prefix=' + str(snapshot) + '/')
        subprocess.run([sys.executable, str(snapshot / 'scripts/bump_version.py'),
                        '--set-version', expected], cwd=snapshot, check=True)
        validate(snapshot, tracked_paths())
        for name in MANAGED:
            (ROOT / name).write_bytes((snapshot / name).read_bytes())
    subprocess.run(['git', 'add', '--', *MANAGED], cwd=ROOT, check=True)


def expected_push_version(before):
    # Process each first-parent change, including multi-commit pushes. Repair
    # commits only materialize versions already earned by authored commits.
    if not re.fullmatch('[0-9a-f]{40}', before) or before == '0' * 40:
        raise ValueError('A nonzero push base SHA is required')
    subprocess.run(['git', 'merge-base', '--is-ancestor', before, 'HEAD'], cwd=ROOT, check=True)
    expected = version_at(before)
    for commit in git('rev-list', '--first-parent', '--reverse', before + '..HEAD').decode().splitlines():
        parent = commit + '^'
        if not git('diff', '--name-only', parent, commit).strip():
            continue
        subject = git('show', '-s', '--format=%s', commit).decode().strip()
        email = git('show', '-s', '--format=%ce', commit).decode().strip()
        files = set(git('diff', '--name-only', parent, commit).decode().splitlines())
        if (subject.startswith(BOT_SUBJECT) and email == '41898282+github-actions[bot]@users.noreply.github.com'
                and files.issubset(MANAGED)):
            expected = max(expected, version_at(commit), key=version_tuple)
        else:
            expected = increment(expected, bump_level(files, commit, version_at(parent)))
    return expected


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument('--staged', action='store_true')
    modes.add_argument('--set-version')
    modes.add_argument('--push-base')
    modes.add_argument('--minor', action='store_true', help='Stage an explicit +0.1.0 upgrade')
    args = parser.parse_args()
    if args.staged:
        prepare_index()
    elif args.minor:
        intent = {'base': version_at('HEAD'), 'level': 'minor'}
        (ROOT / INTENT_FILE).write_text(json.dumps(intent, indent=2) + chr(10), encoding='utf-8')
        subprocess.run(['git', 'add', '--', INTENT_FILE], cwd=ROOT, check=True)
        prepare_index()
    elif args.push_base:
        synchronize(expected_push_version(args.push_base))
    else:
        synchronize(args.set_version)
