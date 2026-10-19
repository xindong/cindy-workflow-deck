"""Shared identity and tracked-file checks for staged commits and CI."""
import argparse
import json
import re
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def validate(root, paths):
    errors = []
    def require(ok, message):
        if not ok:
            errors.append(message)
    def load(name):
        return json.loads((root / name).read_text(encoding='utf-8'))
    identity = load('repository-policy.json')
    slug, name, repository = (identity[key] for key in ('id', 'name', 'repository'))
    require(bool(re.fullmatch('[a-z][a-z0-9]*(?:-[a-z0-9]+)*', slug)), 'policy: id must use lowercase kebab-case')
    require(bool(re.fullmatch('[a-z0-9-]+/[a-z0-9-]+', repository)), 'policy: repository must be lowercase owner/repo')
    manifest, package = load('plugin/ghost.json'), load('package.json')
    require(manifest['id'] == manifest['command'] == package['name'] == slug, 'identity: manifest id/command and package name must match policy exactly')
    require(manifest['name'] == manifest['panel']['title'] == name, 'identity: manifest and panel names must match policy')
    for locale in manifest['locales'].values():
        data = load('plugin/' + locale)
        require(data['name'] == data['panel']['title'] == name, 'identity: locale name/title mismatch: ' + locale)
    html = (root / 'plugin/panel.html').read_text(encoding='utf-8')
    require('<title>' + name + '</title>' in html, 'identity: HTML title mismatch')
    version = package['version']
    require(bool(re.fullmatch(r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)', version)), 'version: use x.y.z source versions')
    require(manifest['version'] == version, 'version: package and manifest differ')
    readme = (root / 'README.md').read_text(encoding='utf-8')
    require(readme.splitlines()[0] == f'# {name} — {version}', 'version: README title must match source name/version')
    for doc in ('README.md', 'INSTALL.md'):
        text = (root / doc).read_text(encoding='utf-8')
        require('https://github.com/' + repository + '/releases/latest' in text, 'links: missing canonical latest Release URL: ' + doc)
        for match in re.finditer(r'https://github\.com/([^/\s<>]+)/([^/\s<>?#)]+)', text):
            require('/'.join(match.groups()) == repository, 'links: noncanonical repository URL in ' + doc + ': ' + match.group())
        require('Source code ZIP/TAR' in text, 'installation: distinguish source archive from installable assets: ' + doc)
    seen = {}
    for path in paths:
        folded = path.casefold()
        require(folded not in seen, 'paths: case-insensitive collision: ' + path + ' / ' + seen.get(folded, ''))
        seen[folded] = path
        parts = folded.split('/')
        if path.startswith('plugin/') and (root / path).suffix in ('.js', '.html', '.json', '.md'):
            text = (root / path).read_text(encoding='utf-8')
            for token in re.findall(r'\$([A-Za-z][A-Za-z0-9-]*)', text):
                require(token == slug, 'identity: noncanonical plugin command in ' + path + ': ' + token)
        require(not (folded.endswith('.cindy') or parts[-1] in ('distribution.json', 'sha256sums.txt') or
                     any(p in ('node_modules', '__pycache__', 'release-assets') for p in parts) or folded.endswith('.pyc')),
                'artifacts: generated file must not be tracked: ' + path)
        require(not any(p in ('.env', '.ds_store') for p in parts), 'files: local configuration must not be tracked: ' + path)
    if errors:
        raise ValueError('\n'.join(errors))
    return identity


def tracked_paths(root=ROOT):
    records = subprocess.check_output(['git', 'ls-files', '--stage', '-z'], cwd=root).split(b'\0')
    paths = []
    for record in filter(None, records):
        metadata, path = record.split(b'\t', 1)
        mode, _, stage = metadata.split()
        if mode not in (b'100644', b'100755') or stage != b'0':
            raise ValueError('files: only resolved regular source files allowed: ' + path.decode())
        paths.append(path.decode('utf-8'))
    return paths


def check(root=ROOT, staged=False):
    paths = tracked_paths(root)
    if staged:
        with tempfile.TemporaryDirectory(prefix='jixin-policy-') as temp:
            subprocess.run(['git', 'checkout-index', '--all', '--prefix=' + temp + '/'], cwd=root, check=True)
            validate(Path(temp), paths)
    else:
        validate(root, paths)
    print('Repository policy passed (identity, casing, links, versions, tracked files).')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--staged', action='store_true')
    args = parser.parse_args()
    try:
        check(staged=args.staged)
    except (ValueError, KeyError, OSError) as error:
        raise SystemExit('Repository policy failed:\n' + str(error))
