"""Verify the downloaded release, then optionally open Cindy's normal installer."""
import argparse
import hashlib
import json
import os
import re
from pathlib import Path
import subprocess
import sys
import zipfile


def verify(root):
    metadata = json.loads((root / 'DISTRIBUTION.json').read_text(encoding='utf-8'))
    assert metadata['id'] == 'jixin-make-a-wish'
    assert re.fullmatch(r'jixin-make-a-wish-[0-9][0-9A-Za-z.+-]*[.]cindy', metadata['file']), 'Unsafe package filename'
    assert metadata['file'] == f'jixin-make-a-wish-{metadata["version"]}.cindy'
    package = root / metadata['file']
    assert hashlib.sha256(package.read_bytes()).hexdigest() == metadata['sha256'], 'Package SHA256 mismatch'
    checksums = {}
    for line in (root / 'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
        digest, name = line.split('  ')
        assert name in (metadata['file'], 'DISTRIBUTION.json') and name not in checksums
        checksums[name] = digest
    assert set(checksums) == {metadata['file'], 'DISTRIBUTION.json'}
    for name, digest in checksums.items():
        assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest, 'Release checksum mismatch'
    with zipfile.ZipFile(package) as archive:
        names = archive.namelist()
        assert len(names) == len(set(names)), 'Duplicate ZIP entries'
        assert set(names) == set(metadata['sourceFiles']), 'Unexpected or missing ZIP entry'
        for name in names:
            assert not name.startswith('/') and '..' not in name.split('/'), 'Unsafe ZIP path'
            assert hashlib.sha256(archive.read(name)).hexdigest() == metadata['sourceFiles'][name], name
        manifest = json.loads(archive.read('ghost.json'))
        for key in ['id', 'name', 'version', 'minCindyVersion']:
            assert manifest[key] == metadata[key], f'Manifest {key} mismatch'
        assert manifest['command'] == metadata['id']
        assert archive.testzip() is None
    print(f"Verified: {metadata['name']} {metadata['version']}; {len(names)} files")
    return package


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--open', action='store_true', help='Request installation; user confirms in Cindy')
    parser.add_argument('--dir', type=Path, default=Path(__file__).resolve().parent.parent / 'release-assets',
                        help='Directory containing the three assets downloaded from one Release')
    args = parser.parse_args()
    package = verify(args.dir.resolve())
    if args.open:
        if sys.platform == 'darwin':
            subprocess.run(['open', '-a', 'Cindy', str(package)], check=True)
        elif os.name == 'nt':
            os.startfile(str(package))
        else:
            subprocess.run(['xdg-open', str(package)], check=True)
        print('Install requested. Await Cindy confirmation and verify its final receipt; not installed yet.')


if __name__ == '__main__':
    main()
