#!/usr/bin/env python3
"""Copy a Harbor task and keep the first N [[steps]] (alb-compatible).

Matches agent-learning-bench `alb.bench.slice_task`: destination for smoke/medium
slices is `<bench>/.alb/smoke/<task-name>` even when N is 40.

Usage:
  python3 scripts/slice_task.py --src DIR --dest DIR --n 10
  python3 scripts/slice_task.py --self-test
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
import tempfile
import unittest
from pathlib import Path


def _step_blocks(task_toml: str) -> tuple[str, list[str]]:
    parts = re.split(r"(?=^\[\[steps\]\])", task_toml, flags=re.M)
    return parts[0], parts[1:]


def step_name(block: str) -> str | None:
    match = re.search(r'^name\s*=\s*"([^"]+)"', block, re.M)
    return match.group(1) if match else None


def count_steps(task_toml: Path) -> int:
    text = task_toml.read_text()
    return len(re.findall(r"^\[\[steps\]\]", text, re.M))


def slice_task(src: Path, dest: Path, n: int) -> Path:
    """Copy a committed-step task and keep the first n Harbor steps."""
    if n < 1:
        raise SystemExit("--n must be >= 1")
    src = src.resolve()
    dest = dest.resolve()
    toml_src = src / "task.toml"
    if not toml_src.is_file():
        raise SystemExit(f"{src} has no task.toml")
    head, blocks = _step_blocks(toml_src.read_text())
    if not blocks:
        raise SystemExit(f"{src.name} has no [[steps]] in task.toml")
    if n > len(blocks):
        print(
            f"warning: requested {n} steps but {src} has {len(blocks)}; keeping all",
            file=sys.stderr,
        )
    keep = blocks[:n]
    names = [name for name in (step_name(b) for b in keep) if name]
    if dest.exists():
        shutil.rmtree(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(
        src,
        dest,
        ignore=shutil.ignore_patterns("__pycache__", ".venv", "*.pyc", ".alb"),
    )
    (dest / "task.toml").write_text(head + "".join(keep))
    steps_dir = dest / "steps"
    if steps_dir.is_dir():
        for child in list(steps_dir.iterdir()):
            if child.name not in names:
                if child.is_dir():
                    shutil.rmtree(child)
                else:
                    child.unlink()
    print(f"smoke slice: {len(keep)} steps -> {dest}")
    return dest


def _write_fixture(src: Path, n: int) -> None:
    lines = [
        "schema_version = \"1.4\"\n",
        "[task]\n",
        'name = "fixture"\n',
    ]
    steps = src / "steps"
    steps.mkdir(parents=True)
    for i in range(1, n + 1):
        name = f"q-{i:03d}"
        lines.append(f"\n[[steps]]\nname = \"{name}\"\n")
        step = steps / name
        step.mkdir()
        (step / "instruction.md").write_text(f"step {name}\n")
    (src / "task.toml").write_text("".join(lines))
    (src / "keep-me.txt").write_text("copied\n")


class SliceTaskTests(unittest.TestCase):
    def test_keeps_first_n_steps_and_sidecar_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "src"
            dest = Path(tmp) / "dest"
            _write_fixture(src, 5)
            slice_task(src, dest, 2)
            self.assertEqual(count_steps(dest / "task.toml"), 2)
            names = sorted(p.name for p in (dest / "steps").iterdir())
            self.assertEqual(names, ["q-001", "q-002"])
            self.assertTrue((dest / "keep-me.txt").is_file())
            text = (dest / "task.toml").read_text()
            self.assertIn('name = "q-002"', text)
            self.assertNotIn('name = "q-003"', text)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--src", type=Path, help="Full Harbor task directory")
    parser.add_argument("--dest", type=Path, help="Slice destination")
    parser.add_argument("--n", type=int, help="Keep first N steps")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)
    if args.self_test:
        suite = unittest.defaultTestLoader.loadTestsFromTestCase(SliceTaskTests)
        result = unittest.TextTestRunner(verbosity=2).run(suite)
        return 0 if result.wasSuccessful() else 1
    if args.src is None or args.dest is None or args.n is None:
        parser.error("--src, --dest, and --n are required (or pass --self-test)")
    slice_task(args.src, args.dest, args.n)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
