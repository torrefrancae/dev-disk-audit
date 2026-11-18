import { lstatSync, readdirSync, realpathSync, statSync } from "node:fs";
import type { Dirent, Stats } from "node:fs";
import path from "node:path";
import { compileNamePatterns } from "@src/patterns.js";
import type { ByteTotal, GitCheckout, GitKind, ScanResult } from "@src/types.js";

const SKIP_MTIME = new Set([".DS_Store"]);

export type ScanOptions = {
  onProgress?: (directories: number) => void;
  skipRootTrees?: boolean;
  skipDirs?: string[];
};

function isRootTree(root: string, dir: string): boolean {
  return dir === root || path.dirname(dir) === root;
}

function emptyTotal(): ByteTotal {
  return { logicalBytes: 0, allocatedBytes: 0, files: 0 };
}

function emptyCheckout(dir: string, gitKind: GitKind): GitCheckout {
  return { ...emptyTotal(), path: dir, gitKind, newestMtimeMs: 0, newestPath: "" };
}

function gitKindOf(entry: Dirent): GitKind | null {
  if (entry.name !== ".git") return null;
  if (entry.isSymbolicLink()) return "file";
  if (entry.isDirectory()) return "dir";
  if (entry.isFile()) return "file";
  return null;
}

function addBytes(total: ByteTotal, st: Stats, countFile: boolean): void {
  total.allocatedBytes += st.blocks * 512;
  if (countFile || st.isSymbolicLink()) total.logicalBytes += st.size;
  if (countFile) total.files += 1;
}

function noteWrite(checkout: GitCheckout, full: string, name: string, st: Stats): void {
  if (SKIP_MTIME.has(name)) return;
  if (!st.isFile() && !st.isSymbolicLink()) return;
  if (st.mtimeMs < checkout.newestMtimeMs) return;
  checkout.newestMtimeMs = st.mtimeMs;
  checkout.newestPath = full;
}

/* Files belong to the nearest enclosing git checkout.
   Parent totals leave out nested checkouts so the numbers can be added.
   The clock follows file and link writes. Directory stamps and .DS_Store do not. */
export function scanGitCheckouts(
  rootInput: string,
  nowMs: number,
  days: number,
  options: ScanOptions = {},
): ScanResult {
  const seen = statSync(rootInput);
  if (!seen.isDirectory()) {
    throw new Error(`${rootInput} is not a directory`);
  }
  const root = realpathSync(rootInput);
  const cutoffMs = nowMs - days * 86_400_000;
  const skipRootTrees = options.skipRootTrees === true;
  const skipName = compileNamePatterns(options.skipDirs ?? []);
  const checkouts = new Map<string, GitCheckout>();
  const skippedDirs: string[] = [];
  const outside = emptyTotal();
  let directories = 0;
  let errors = 0;
  const stack: Array<{ dir: string; owner: string | null }> = [{ dir: root, owner: null }];

  while (stack.length > 0) {
    const frame = stack.pop();
    if (!frame) break;
    let entries: Dirent[];
    try {
      entries = readdirSync(frame.dir, { withFileTypes: true });
    } catch {
      errors += 1;
      continue;
    }
    directories += 1;
    if (directories % 500 === 0) options.onProgress?.(directories);

    let owner = frame.owner;
    for (const entry of entries) {
      const kind = gitKindOf(entry);
      if (!kind) continue;
      owner = frame.dir;
      checkouts.set(owner, emptyCheckout(owner, kind));
      break;
    }

    for (const entry of entries) {
      const full = path.join(frame.dir, entry.name);
      let st: Stats;
      try {
        st = lstatSync(full);
      } catch {
        errors += 1;
        continue;
      }
      const file = st.isFile();
      const bucket = owner ? checkouts.get(owner) : null;
      if (bucket) {
        addBytes(bucket, st, file);
        noteWrite(bucket, full, entry.name, st);
      } else {
        addBytes(outside, st, file);
      }
      if (st.isDirectory() && !st.isSymbolicLink()) {
        if (skipName(entry.name)) {
          const rel = path.relative(root, full);
          skippedDirs.push(rel === "" ? entry.name : rel);
          continue;
        }
        stack.push({ dir: full, owner });
      }
    }
  }

  for (const checkout of checkouts.values()) {
    if (checkout.newestMtimeMs > 0) continue;
    try {
      const st = lstatSync(checkout.path);
      checkout.newestMtimeMs = st.mtimeMs;
      checkout.newestPath = checkout.path;
    } catch {
      errors += 1;
    }
  }

  options.onProgress?.(directories);
  const listed: GitCheckout[] = [];
  const skippedRoots: GitCheckout[] = [];
  for (const checkout of checkouts.values()) {
    if (skipRootTrees && isRootTree(root, checkout.path)) skippedRoots.push(checkout);
    else listed.push(checkout);
  }
  return {
    root,
    days,
    cutoffMs,
    directories,
    errors,
    outside,
    skipRootTrees,
    skippedDirs,
    skippedRoots,
    checkouts: listed,
  };
}
