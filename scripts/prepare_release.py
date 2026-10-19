"""Validate a version tag and build release assets without changing tracked files."""
import argparse
import hashlib
import json
import re
from pathlib import Path

from build_distribution import ROOT, build

TAG = re.compile(r'v?(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:[.][0-9A-Za-z-]+)*)?(?:[+][0-9A-Za-z-]+(?:[.][0-9A-Za-z-]+)*)?')


def prepare(tag, destination):
    if not TAG.fullmatch(tag):
        raise ValueError('Use a version tag such as v0.1.0 or 0.1.0')
    version = tag.removeprefix('v')
    manifest = json.loads((ROOT / 'plugin/ghost.json').read_text(encoding='utf-8'))
    project = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
    if manifest['version'] != version or project['version'] != version:
        raise ValueError('Tag must match both plugin/ghost.json and package.json versions')
    package, metadata = build()
    destination.mkdir(parents=True, exist_ok=False)
    info = json.loads(metadata)
    info['file'] = f'{manifest["id"]}-{version}.cindy'
    assets = {info['file']: package,
              'DISTRIBUTION.json': (json.dumps(info, ensure_ascii=False, indent=2) + chr(10)).encode()}
    checksums = ''.join(f'{hashlib.sha256(data).hexdigest()}  {name}' + chr(10)
                        for name, data in assets.items())
    assets['SHA256SUMS.txt'] = checksums.encode()
    for name, data in assets.items():
        (destination / name).write_bytes(data)
    return assets


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tag', required=True)
    parser.add_argument('--out', type=Path, default=ROOT / 'release-assets')
    args = parser.parse_args()
    for name in prepare(args.tag, args.out):
        print(name)
