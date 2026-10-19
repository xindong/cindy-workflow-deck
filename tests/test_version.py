import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]


class VersionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        shutil.copytree(ROOT / 'plugin', self.root / 'plugin', ignore=shutil.ignore_patterns('*.cindy'))
        shutil.copytree(ROOT / 'scripts', self.root / 'scripts', ignore=shutil.ignore_patterns('__pycache__'))
        shutil.copytree(ROOT / '.githooks', self.root / '.githooks')
        for name in ('package.json', 'README.md', '.gitignore'):
            shutil.copyfile(ROOT / name, self.root / name)
        self.run_git('init', '-q')
        self.run_git('config', 'user.name', 'Version fixture')
        self.run_git('config', 'user.email', 'fixture@example.invalid')
        self.run_git('add', '.')
        self.run_git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'seed')
        self.base = self.run_git('rev-parse', 'HEAD').stdout.strip()
        self.initial = self.version()
        self.run_python('scripts/install_hooks.py')

    def run_git(self, *args, check=True):
        return subprocess.run(['git', *args], cwd=self.root, check=check,
                              text=True, capture_output=True)

    def run_python(self, *args, check=True):
        return subprocess.run([sys.executable, *args], cwd=self.root, check=check,
                              text=True, capture_output=True)

    def version(self):
        return json.loads((self.root / 'package.json').read_text())['version']

    def plus(self, count):
        major, minor, patch = map(int, self.initial.split('.'))
        return f'{major}.{minor}.{patch + count}'

    def change(self, text):
        (self.root / 'change.txt').write_text(text)
        self.run_git('add', 'change.txt')

    def assert_package(self, version):
        self.assertEqual(self.version(), version)
        metadata = json.loads((self.root / 'DISTRIBUTION.json').read_text())
        package = self.root / metadata['file']
        self.assertEqual(metadata['version'], version)
        self.assertEqual(hashlib.sha256(package.read_bytes()).hexdigest(), metadata['sha256'])
        with zipfile.ZipFile(package) as archive:
            self.assertEqual(json.loads(archive.read('ghost.json'))['version'], version)

    def test_two_real_commits_increment_once_each(self):
        for number in (1, 2):
            self.change(str(number))
            self.run_git('commit', '-qm', 'change')
            self.assert_package(self.plus(number))
            self.assertEqual(self.run_git('status', '--porcelain').stdout, '')
        self.run_python('scripts/bump_version.py', '--push-base', self.base)
        self.assert_package(self.plus(2))
        self.assertEqual(self.run_git('status', '--porcelain').stdout, '')

    def test_partial_staging_uses_only_index_source(self):
        usage = self.root / 'plugin/USAGE.md'
        usage.write_text(usage.read_text() + chr(10) + 'STAGED_MARKER')
        self.run_git('add', 'plugin/USAGE.md')
        usage.write_text(usage.read_text() + chr(10) + 'UNSTAGED_MARKER')
        self.run_git('commit', '-qm', 'partial change')
        self.assert_package(self.plus(1))
        with zipfile.ZipFile(self.root / 'jixin-make-a-wish.cindy') as archive:
            content = archive.read('USAGE.md').decode()
            self.assertIn('STAGED_MARKER', content)
            self.assertNotIn('UNSTAGED_MARKER', content)
        self.assertIn('UNSTAGED_MARKER', usage.read_text())

    def test_unstaged_managed_file_blocks_commit_without_overwriting(self):
        self.change('change')
        readme = self.root / 'README.md'
        original = readme.read_text() + chr(10) + 'UNSTAGED_README'
        readme.write_text(original)
        result = self.run_git('commit', '-qm', 'blocked', check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.version(), self.initial)
        self.assertEqual(readme.read_text(), original)

    def test_api_push_fallback_counts_commits_and_is_idempotent(self):
        for number in (1, 2):
            self.change(str(number))
            self.run_git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'API change')
        self.run_python('scripts/bump_version.py', '--push-base', self.base)
        self.assert_package(self.plus(2))
        self.run_git('add', '.')
        self.run_git('config', 'user.name', 'github-actions[bot]')
        self.run_git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
        self.run_git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'build: synchronize version ' + self.plus(2))
        self.run_python('scripts/bump_version.py', '--push-base', self.base)
        self.assert_package(self.plus(2))
        self.assertEqual(self.run_git('status', '--porcelain').stdout, '')

    def test_empty_commit_does_not_increment(self):
        self.run_git('commit', '--allow-empty', '-qm', 'no source change')
        self.assertEqual(self.version(), self.initial)

    def test_installer_preserves_existing_custom_hook(self):
        hook = self.root / '.git/hooks/pre-commit'
        original = '#!/bin/sh' + chr(10) + 'exit 23' + chr(10)
        hook.write_text(original)
        result = self.run_python('scripts/install_hooks.py', check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(hook.read_text(), original)


if __name__ == '__main__':
    unittest.main()
