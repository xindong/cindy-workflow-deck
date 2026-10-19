"""Verify the downloaded release, then optionally open Cindy's normal installer."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import zipfile


def verify(root):
    metadata = json.loads((root / 'DISTRIBUTION.json').read_text(encoding='utf-8'))
    assert metadata['id'] == 'jixin-make-a-wish'
    assert metadata['file'] == 'jixin-make-a-wish.cindy'
    package = root / metadata['file']
    assert hashlib.sha256(package.read_bytes()).hexdigest() == metadata['sha256'], 'Package SHA256 mismatch'
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
    args = parser.parse_args()
    package = verify(Path(__file__).resolve().parent.parent)
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
