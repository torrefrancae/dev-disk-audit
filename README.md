# dev-disk-audit

`disk-audit` measures git checkouts under a directory and shows which ones have gone quiet, plus the disk those quiet checkouts still hold.

Old worktrees, linked checkouts, and nested repos are easy to leave behind. This tool lists them without deleting anything.

## Install

Requires Node.js 20 or newer.

```bash
git clone https://github.com/torrefrancae/dev-disk-audit.git
cd dev-disk-audit
npm install
npm link
```

`npm install` builds `dist/`. After that, `./bin/disk-audit` works even without `npm link`.

## Usage

```bash
disk-audit repos ~/src/demo
disk-audit repos ~/src/demo --days 30
disk-audit repos ~/src/demo --all
disk-audit repos ~/src/demo --json
```

`--days` defaults to 15. A checkout is untouched when its newest file write is at least that old. `--all` adds the checkouts that are still inside the window. `--json` prints one JSON document on stdout. Progress stays on stderr.

Sample:

```text
root: /home/dev/src/demo
cutoff: 2026-11-04 04:41 (15 days)
walked: 840 directories, 0 read errors
outside checkouts: 12 KB allocated, 4.0 KB logical, 3 files

git checkouts: 4
untouched: 2, 1.4 GB allocated, 1.6 GB logical
active: 2, 220 MB allocated, 240 MB logical

untouched
allocated     logical  last change       checkout                  newest file
    1.2 GB      1.3 GB  2026-08-02 09:14  .worktrees/old-export     src/export.ts
    180 MB      210 MB  2026-07-19 16:02  sandbox/spike             README.md
```

The sample paths and sizes are illustrative.

## Measurement

A checkout is a directory that contains a `.git` directory or a `.git` file. A `.git` file is how linked worktrees and submodules point at a git dir. The tool does not follow a symlink named `.git`, and it does not follow symlinked directories, so a linked object store is counted where the files actually live.

Nested checkouts are measured on their own. Bytes inside a nested checkout are left out of the parent, so the untouched and active totals can be added together.

Allocated size uses filesystem block counts (512-byte units). Logical size is the length of file contents. Allocated size is the closer hint of what a delete might free. If the filesystem shares blocks between copies, deleting one checkout can free less than the allocated number.

The clock is the newest regular file or symlink write inside that checkout. Directory timestamps are ignored, so a folder stamp does not mark a tree as active. `.DS_Store` is ignored for the clock and its bytes are still counted. Reading a file without writing it does not move the clock. A checkout, generate, or edit does.

Files that are not inside any checkout are summed as `outside checkouts` and are not listed as rows.

The walk covers the whole tree, including dependency folders, because those bytes are part of the checkout on disk. Large trees take a while. Nothing is deleted.

## Develop

```bash
npm test
npm run typecheck
npm run build
```

## License

MIT. See [LICENSE](LICENSE).
