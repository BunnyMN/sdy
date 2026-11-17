"""deploy/scripts/scheduled-backup.sh — the production backup service.

Run with: python3 -m unittest discover -s deploy/scripts -p 'test_*.py'

pg_dump and psql are replaced by stubs on PATH, so what is tested is the
script's own logic: a dump is written atomically, a failed or empty dump fails
the run (deploy.yml stops the rollout on that), and retention keeps the newest.
"""

import os
import pathlib
import subprocess
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).with_name("scheduled-backup.sh")


class ScheduledBackupTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = pathlib.Path(self.tmp.name)
        self.bin = root / "bin"
        self.bin.mkdir()
        self.backups = root / "backups"
        self.metrics = root / "metrics"
        self.metrics.mkdir()
        self.recorded = root / "recorded.sql"
        self.stub("psql", f'echo "$@" >> "{self.recorded}"\n')
        self.dump_ok()

    def tearDown(self):
        self.tmp.cleanup()

    def stub(self, name, body):
        path = self.bin / name
        path.write_text("#!/bin/sh\n" + body)
        path.chmod(0o755)

    def dump_ok(self, size=20000):
        # Random bytes: gzip would shrink a repeated character below the limit.
        self.stub("pg_dump", f"head -c {size} /dev/urandom\n")

    def run_script(self, *args):
        env = dict(os.environ)
        env.update(
            PATH=f"{self.bin}:{env['PATH']}",
            BACKUP_DIR=str(self.backups),
            BACKUP_MIN_BYTES="100",
            BACKUP_KEEP_COUNT="3",
            TEXTFILE_DIR=str(self.metrics),
            PGPASSWORD="unused",
        )
        return subprocess.run(["sh", str(SCRIPT), *args], env=env, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=30)

    def dumps(self, kind):
        return sorted(p.name for p in (self.backups / kind).glob("*.sql.gz"))

    def test_a_dump_is_written_and_recorded(self):
        result = self.run_script("once", "predeploy")
        self.assertEqual(result.returncode, 0, result.stderr)
        files = self.dumps("predeploy")
        self.assertEqual(len(files), 1)
        self.assertFalse(list((self.backups / "predeploy").glob("*.part")))
        self.assertIn("platform_backups", self.recorded.read_text())
        self.assertIn("nexus_backup_last_ok 1", (self.metrics / "nexus_backup.prom").read_text())

    def test_a_failed_dump_fails_the_run_and_leaves_nothing(self):
        self.stub("pg_dump", "echo 'connection refused' >&2; exit 2\n")
        result = self.run_script("once", "predeploy")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.dumps("predeploy"), [])
        self.assertIn("connection refused", result.stderr)
        self.assertIn("nexus_backup_last_ok 0", (self.metrics / "nexus_backup.prom").read_text())

    def test_an_empty_dump_is_refused(self):
        self.dump_ok(size=10)
        result = self.run_script("once", "predeploy")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.dumps("predeploy"), [])

    def test_only_the_newest_are_kept(self):
        kind = self.backups / "predeploy"
        kind.mkdir(parents=True)
        for stamp in ("20260101T000000Z", "20260102T000000Z", "20260103T000000Z", "20260104T000000Z"):
            (kind / f"nexus-predeploy-{stamp}.sql.gz").write_text("old")
        result = self.run_script("once", "predeploy")
        self.assertEqual(result.returncode, 0, result.stderr)
        files = self.dumps("predeploy")
        self.assertEqual(len(files), 3)
        self.assertNotIn("nexus-predeploy-20260101T000000Z.sql.gz", files)
        self.assertNotIn("nexus-predeploy-20260102T000000Z.sql.gz", files)

    def test_an_unsafe_kind_is_refused(self):
        result = self.run_script("once", "../etc")
        self.assertEqual(result.returncode, 2)


if __name__ == "__main__":
    unittest.main()
