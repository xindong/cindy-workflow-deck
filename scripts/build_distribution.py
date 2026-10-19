"""Build the repository's reproducible .cindy distribution; stdlib only."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'plugin'
PACKAGE = ROOT / 'jixin-make-a-wish.cindy'
METADATA = ROOT / 'DISTRIBUTION.json'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def build():
    manifest = json.loads((SOURCE / 'ghost.json').read_text(encoding='utf-8'))
    assert manifest['id'] == 'jixin-make-a-wish'
    assert manifest['name'] == '极心许愿'
    assert manifest['command'] == manifest['id']
    assert manifest['version'] == json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
    paths = sorted(p for p in SOURCE.rglob('*') if p.is_file()
                   and not p.name.endswith('.cindy')
                   and not any(part.startswith('.') or part == 'node_modules'
                               for part in p.relative_to(SOURCE).parts))
    assert all(not p.is_symlink() for p in paths), 'Symlinks are not distribution files'
    files = {p.relative_to(SOURCE).as_posix(): p.read_bytes() for p in paths}
    required = [manifest['entry'], manifest['panel']['html'], manifest['node']['entry'],
                manifest['icon'], 'USAGE.md', *manifest['locales'].values()]
    assert all(name in files for name in required), 'Missing manifest reference'
    data = io.BytesIO()
    with zipfile.ZipFile(data, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, content in files.items():
            info = zipfile.ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, content, compresslevel=9)
    package = data.getvalue()
    metadata = {
        'schemaVersion': 1,
        'purpose': 'Repository distribution metadata; not a Cindy marketplace manifest',
        'id': manifest['id'], 'name': manifest['name'], 'version': manifest['version'],
        'minCindyVersion': manifest['minCindyVersion'], 'file': PACKAGE.name,
        'sha256': digest(package),
        'sourceFiles': {name: digest(content) for name, content in files.items()},
    }
    return package, (json.dumps(metadata, ensure_ascii=False, indent=2) + chr(10)).encode()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Fail if committed distribution is stale')
    args = parser.parse_args()
    package, metadata = build()
    if args.check:
        assert PACKAGE.read_bytes() == package, 'Distribution package differs from source; rebuild it'
        assert METADATA.read_bytes() == metadata, 'Distribution metadata is stale; rebuild it'
    else:
        PACKAGE.write_bytes(package)
        METADATA.write_bytes(metadata)
    print(f'{PACKAGE.name}: {len(package)} bytes; SHA256 {digest(package)}; version unchanged')


if __name__ == '__main__':
    main()
