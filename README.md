# dev-disk-audit

`disk-audit` finds git checkouts that have gone quiet and shows the disk they still hold.

Worktrees, linked checkouts, and nested repos pile up. A normal `du` of the parent counts those bytes again inside every ancestor, so the total is not something you can add up. This tool charges each file to the nearest enclosing checkout, lists the ones that have not been written in N days, and deletes nothing.

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
disk-audit repos ~/src/demo --skip-root-trees --skip-dirs='vendor,cache*'
```

| Flag | Effect |
|---|---|
| `--days <n>` | Untouched means the newest file write is at least this many days old. Default 15. |
| `--all` | Also print checkouts that are still inside the window. |
| `--json` | One JSON document on stdout. Progress stays on stderr. |
| `--skip-root-trees` | Omit a checkout that is the given path, or a directory directly inside it. Nested checkouts under that tree are still measured. |
| `--skip-dirs <list>` | Do not walk directories whose name matches a comma-separated list. `*` matches any characters in the name. Quote the list so the shell does not expand `*`. |

Sample:

```text
root: /home/dev/src/demo
cutoff: 2026-11-04 04:41 (15 days)
walked: 840 directories, 0 read errors
outside checkouts: 12 KB allocated, 4.0 KB logical, 3 files
skipped root trees: 2, 4.0 GB allocated, 3.8 GB logical
skipped dirs: vendor, cache-old

git checkouts: 4
untouched: 2, 1.4 GB allocated, 1.6 GB logical
active: 2, 220 MB allocated, 240 MB logical

untouched
allocated     logical  last change       checkout                  newest file
    1.2 GB      1.3 GB  2026-08-02 09:14  app/.worktrees/old-export src/export.ts
    180 MB      210 MB  2026-07-19 16:02  sandbox/spike             README.md
```

The paths and sizes above are illustrative.

## Measurement

A checkout is a directory that contains a `.git` directory or a `.git` file. A `.git` file is how linked worktrees and submodules point at a git dir. The walk does not follow a symlink named `.git`, and it does not follow symlinked directories, so a linked object store is counted where the files actually live.

Each file is charged to the nearest enclosing checkout. A parent total leaves out bytes that belong to a nested checkout, so the untouched and active rows can be added together. `--skip-root-trees` moves the top checkout into its own summary line and keeps every checkout underneath it in the table. `--skip-dirs` never opens a matching directory, which is how you leave a large tree out of both the walk and the totals.

Allocated size uses filesystem block counts (512-byte units). Logical size is the length of file contents. Allocated size is the closer hint of what a delete might free. When the filesystem shares blocks between copies, deleting one checkout can free less than the allocated number.

The clock is the newest regular file or symlink write inside that checkout. Directory timestamps are ignored, so a folder stamp does not mark a tree as active. `.DS_Store` is ignored for the clock and its bytes are still counted. Reading a file without writing it does not move the clock. A checkout, a generate, or an edit does.

Files that sit in no checkout are summed once as `outside checkouts`.

The walk includes dependency folders, because those bytes are part of the checkout on disk. Large trees take a while.

## Develop

```bash
npm test
npm run typecheck
npm run build
```

## License

MIT. See [LICENSE](LICENSE).
