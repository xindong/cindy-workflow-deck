import hashlib
import json
from pathlib import Path
import os
import subprocess
import textwrap
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from prepare_release import ROOT, prepare
from install_local import verify


class ReleaseTests(unittest.TestCase):
    def test_release_downloads_are_consistent(self):
        version = json.loads((ROOT / 'package.json').read_text())['version']
        with tempfile.TemporaryDirectory() as temp:
            for tag in (version, 'v' + version):
                destination = Path(temp) / tag
                assets = prepare(tag, destination)
                self.assertTrue(verify(destination).is_file())
                metadata = json.loads(assets['DISTRIBUTION.json'])
                package = destination / metadata['file']
                self.assertEqual(hashlib.sha256(package.read_bytes()).hexdigest(), metadata['sha256'])
                with zipfile.ZipFile(package) as archive:
                    self.assertIsNone(archive.testzip())
                    self.assertEqual(json.loads(archive.read('ghost.json'))['version'], version)
                    self.assertEqual(set(archive.namelist()), set(metadata['sourceFiles']))
                    for name, digest in metadata['sourceFiles'].items():
                        self.assertEqual(hashlib.sha256(archive.read(name)).hexdigest(), digest)
                for line in assets['SHA256SUMS.txt'].decode().splitlines():
                    digest, name = line.split('  ')
                    self.assertEqual(hashlib.sha256((destination / name).read_bytes()).hexdigest(), digest)

    def test_publish_command_uses_tag_and_attaches_assets(self):
        workflow = (ROOT / '.github/workflows/release.yml').read_text()
        command = textwrap.dedent(workflow.rsplit('run: |', 1)[1])
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            (directory / 'repository-policy.json').write_bytes((ROOT / 'repository-policy.json').read_bytes())
            (directory / 'release-assets').mkdir()
            for name in ('plugin.cindy', 'DISTRIBUTION.json', 'SHA256SUMS.txt'):
                (directory / 'release-assets' / name).touch()
            fake_gh = directory / 'gh'
            fake_gh.write_text('#!' + sys.executable + chr(10) +
                               'import json,sys; print(json.dumps(sys.argv[1:]))' + chr(10))
            fake_gh.chmod(0o755)
            for tag, prerelease in (('v0.1.0', False), ('v0.1.0-rc.1', True),
                                    ('v0.1.0+build-test', False)):
                env = dict(os.environ, PATH=str(directory) + os.pathsep + os.environ['PATH'],
                           RELEASE_TAG=tag, GH_REPO='xindong/cindy-workflow-deck')
                result = subprocess.run(['bash', '-e', '-c', command], cwd=directory,
                                        env=env, check=True, capture_output=True, text=True)
                args = json.loads(result.stdout)
                self.assertEqual(args[:3], ['release', 'create', tag])
                self.assertEqual(args[args.index('--title') + 1], '极心许愿 ' + tag)
                self.assertIn('--verify-tag', args)
                self.assertIn('--generate-notes', args)
                self.assertEqual('--prerelease' in args, prerelease)
                for name in ('plugin.cindy', 'DISTRIBUTION.json', 'SHA256SUMS.txt'):
                    self.assertIn('release-assets/' + name, args)

    def test_publish_refuses_wrong_repository_before_calling_gh(self):
        workflow = (ROOT / '.github/workflows/release.yml').read_text()
        command = textwrap.dedent(workflow.rsplit('run: |', 1)[1])
        result = subprocess.run(['bash', '-e', '-c', command], cwd=ROOT,
                                env=dict(os.environ, GH_REPO='xindong/wrong-repo', RELEASE_TAG='v0.1.0'),
                                capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Release repository differs', result.stderr)

    def test_local_build_and_validator_use_explicit_artifact_directory(self):
        version = json.loads((ROOT / 'package.json').read_text())['version']
        with tempfile.TemporaryDirectory() as temp:
            destination = Path(temp) / 'assets'
            for command in (
                ['scripts/build_distribution.py', '--out', str(destination)],
                ['scripts/build_distribution.py', '--out', str(destination), '--check'],
                ['scripts/install_local.py', '--dir', str(destination), '--check'],
            ):
                subprocess.run([sys.executable, *command], cwd=ROOT, check=True, capture_output=True)
            self.assertTrue((destination / f'jixin-make-a-wish-{version}.cindy').exists())
            self.assertFalse((ROOT / 'jixin-make-a-wish.cindy').exists())
            self.assertFalse((ROOT / 'DISTRIBUTION.json').exists())

    def test_downloaded_corrupt_package_is_rejected(self):
        version = json.loads((ROOT / 'package.json').read_text())['version']
        with tempfile.TemporaryDirectory() as temp:
            destination = Path(temp) / 'assets'
            prepare('v' + version, destination)
            package = destination / f'jixin-make-a-wish-{version}.cindy'
            package.write_bytes(package.read_bytes() + b'corruption')
            with self.assertRaises(AssertionError):
                verify(destination)

    def test_invalid_or_mismatched_tag_produces_no_assets(self):
        with tempfile.TemporaryDirectory() as temp:
            destination = Path(temp) / 'assets'
            for tag in ('v9999.0.0', 'v01.0.0', 'test-tag', 'v0.1.0/unsafe'):
                with self.assertRaises(ValueError):
                    prepare(tag, destination)
                self.assertFalse(destination.exists())


if __name__ == '__main__':
    unittest.main()
