#!/usr/bin/env python3
"""Build index.html (the page GitHub Pages serves) from the files in src/.

src/shell.html holds the page's HTML. Two kinds of marker lines in it are
replaced with the contents of a file, byte for byte:
    /*@include styles.css*/        -> src/styles.css
    //@include js/01-config.js     -> src/js/01-config.js
Nothing else is changed, so the build is fully reproducible.

Usage:
    python3 build.py           write index.html
    python3 build.py --check   exit 1 if index.html doesn't match src/ (no write)
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"
OUT = ROOT / "index.html"
MARKER = re.compile(r"^(?:/\*@include (?P<a>\S+)\*/|//@include (?P<b>\S+))\n$")


def build() -> bytes:
    out = []
    for line in (SRC / "shell.html").read_text(encoding="utf-8").splitlines(keepends=True):
        m = MARKER.match(line)
        if m:
            part = SRC / (m.group("a") or m.group("b"))
            text = part.read_text(encoding="utf-8")
            if not text.endswith("\n"):
                text += "\n"
            out.append(text)
        else:
            out.append(line)
    return "".join(out).encode("utf-8")


def main() -> int:
    data = build()
    if "--check" in sys.argv[1:]:
        if OUT.exists() and OUT.read_bytes() == data:
            print("index.html is up to date with src/")
            return 0
        print("index.html does NOT match src/ - run: python3 build.py", file=sys.stderr)
        return 1
    OUT.write_bytes(data)
    print(f"wrote {OUT.name} ({len(data):,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
