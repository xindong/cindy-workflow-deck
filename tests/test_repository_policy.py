"""Mutation regressions: each governance rule must reject a real mismatch."""
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from check_repository import validate


class RepositoryPolicyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        shutil.copytree(ROOT / 'plugin', self.root / 'plugin', ignore=shutil.ignore_patterns('*.cindy'))
        for path in ('repository-policy.json', 'package.json', 'README.md', 'INSTALL.md'):
            shutil.copyfile(ROOT / path, self.root / path)

    def paths(self):
        return [p.relative_to(self.root).as_posix() for p in self.root.rglob('*') if p.is_file()]

    def change_json(self, path, key, value):
        p = self.root / path
        data = json.loads(p.read_text())
        data[key] = value
        p.write_text(json.dumps(data, ensure_ascii=False))

    def reject(self, message):
        with self.assertRaisesRegex(ValueError, message):
            validate(self.root, self.paths())

    def test_correct_source_does_not_require_latest_release_version(self):
        self.assertEqual(validate(self.root, self.paths())['name'], '极心许愿')

    def test_wrong_id_case(self):
        self.change_json('plugin/ghost.json', 'id', 'Jixin-Make-A-Wish')
        self.reject('identity:')

    def test_wrong_locale_name(self):
        self.change_json('plugin/locales/en.json', 'name', 'Workflow Deck')
        self.reject('locale')

    def test_wrong_command_in_user_instructions(self):
        p = self.root / 'plugin/USAGE.md'
        p.write_text(p.read_text().replace('$jixin-make-a-wish', '$Jixin-Make-A-Wish'))
        self.reject('noncanonical plugin command')

    def test_old_html_title(self):
        p = self.root / 'plugin/panel.html'
        p.write_text(p.read_text().replace('<title>极心许愿</title>', '<title>Workflow tools</title>'))
        self.reject('HTML title')

    def test_wrong_repository_url_or_casing(self):
        p = self.root / 'INSTALL.md'
        original = p.read_text()
        for slug in ('xindong/jixin-make-a-wish', 'XinDong/Cindy-Workflow-Deck'):
            with self.subTest(slug=slug):
                p.write_text(original.replace('xindong/cindy-workflow-deck', slug))
                self.reject('links:')

    def test_stale_readme_or_manifest_version(self):
        self.change_json('package.json', 'version', '999.0.0')
        self.reject('version:')

    def test_generated_files_even_with_capitalized_suffix(self):
        for path in ('bad.CINDY', 'DISTRIBUTION.json', 'sub/SHA256SUMS.txt', 'node_modules/a.js', '__pycache__/a.pyc', '.env'):
            with self.subTest(path=path):
                p = self.root / path
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text('generated')
                self.reject('artifacts:|files:')
                p.unlink()

    def test_case_colliding_paths_on_case_sensitive_ci(self):
        with self.assertRaisesRegex(ValueError, 'collision'):
            validate(self.root, self.paths() + ['Src/readme.md', 'src/README.md'])
