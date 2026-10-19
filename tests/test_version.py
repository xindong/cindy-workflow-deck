import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

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

    def assert_version(self, version):
        self.assertEqual(self.version(), version)
        manifest = json.loads((self.root / 'plugin/ghost.json').read_text())
        self.assertEqual(manifest['version'], version)
        self.assertTrue((self.root / 'README.md').read_text().startswith('# 极心许愿 — ' + version))
        self.assertFalse((self.root / 'jixin-make-a-wish.cindy').exists())
        self.assertFalse((self.root / 'DISTRIBUTION.json').exists())
        self.assertEqual(self.run_git('ls-files', '--', '*.cindy').stdout, '')

    def test_two_real_commits_increment_once_each(self):
        for number in (1, 2):
            self.change(str(number))
            self.run_git('commit', '-qm', 'change')
            self.assert_version(self.plus(number))
            self.assertEqual(self.run_git('status', '--porcelain').stdout, '')
        self.run_python('scripts/bump_version.py', '--push-base', self.base)
        self.assert_version(self.plus(2))
        self.assertEqual(self.run_git('status', '--porcelain').stdout, '')

    def test_partial_staging_uses_only_index_source(self):
        usage = self.root / 'plugin/USAGE.md'
        usage.write_text(usage.read_text() + chr(10) + 'STAGED_MARKER')
        self.run_git('add', 'plugin/USAGE.md')
        usage.write_text(usage.read_text() + chr(10) + 'UNSTAGED_MARKER')
        self.run_git('commit', '-qm', 'partial change')
        self.assert_version(self.plus(1))
        content = self.run_git('show', 'HEAD:plugin/USAGE.md').stdout
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
        self.assert_version(self.plus(2))
        self.run_git('add', '.')
        self.run_git('config', 'user.name', 'github-actions[bot]')
        self.run_git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
        self.run_git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'build: synchronize version ' + self.plus(2))
        self.run_python('scripts/bump_version.py', '--push-base', self.base)
        self.assert_version(self.plus(2))
        self.assertEqual(self.run_git('status', '--porcelain').stdout, '')

    def test_force_adding_package_is_rejected(self):
        (self.root / 'accidental.cindy').write_bytes(b'not a source file')
        self.run_git('add', '-f', 'accidental.cindy')
        result = self.run_git('commit', '-qm', 'bad binary', check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Do not commit .cindy', result.stderr)
        self.assertEqual(self.version(), self.initial)

    def test_empty_commit_does_not_increment(self):
        self.run_git('commit', '--allow-empty', '-qm', 'no source change')
        self.assertEqual(self.version(), self.initial)

    def test_explicit_minor_then_normal_patch_and_cloud_replay(self):
        major, minor, _ = map(int, self.initial.split('.'))
        upgraded = f'{major}.{minor + 1}.0'
        self.change('large release')
        self.run_python('scripts/bump_version.py', '--minor')
        self.assert_version(upgraded)
        self.run_git('commit', '-qm', 'minor upgrade')
        self.assert_version(upgraded)
        self.change('next normal change')
        self.run_git('commit', '-qm', 'patch after minor')
        self.assert_version(f'{major}.{minor + 1}.1')
        self.run_python('scripts/bump_version.py', '--push-base', self.base)
        self.assert_version(f'{major}.{minor + 1}.1')
        self.assertEqual(self.run_git('status', '--porcelain').stdout, '')

    def test_api_minor_intent_is_respected(self):
        major, minor, _ = map(int, self.initial.split('.'))
        intent = {'base': self.initial, 'level': 'minor'}
        (self.root / 'VERSION_BUMP.json').write_text(json.dumps(intent))
        self.run_git('add', 'VERSION_BUMP.json')
        self.run_git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'API minor upgrade')
        self.run_python('scripts/bump_version.py', '--push-base', self.base)
        self.assert_version(f'{major}.{minor + 1}.0')

    def test_stale_minor_intent_is_rejected(self):
        intent = {'base': '999.0.0', 'level': 'minor'}
        (self.root / 'VERSION_BUMP.json').write_text(json.dumps(intent))
        self.run_git('add', 'VERSION_BUMP.json')
        result = self.run_git('commit', '-qm', 'invalid upgrade', check=False)
        self.assertNotEqual(result.returncode, 0)
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
