import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { isQuiet, renderReport } from "@src/report.js";
import { scanGitCheckouts } from "@src/scan.js";
import type { GitCheckout } from "@src/types.js";

const DAY = 86_400_000;

function touch(file: string, ms: number): void {
  const seconds = ms / 1000;
  utimesSync(file, seconds, seconds);
}

function checkout(resultRoot: string, list: GitCheckout[], rel: string): GitCheckout {
  const found = list.find((item) => path.relative(resultRoot, item.path) === rel);
  assert.ok(found, `missing checkout ${rel}`);
  return found;
}

test("charges nested checkouts separately and ignores Finder metadata for age", () => {
  const root = mkdtempSync(path.join(tmpdir(), "disk-audit-"));
  const now = Date.now();
  const oldMs = now - 40 * DAY;
  const newMs = now - 2 * DAY;
  try {
    writeFileSync(path.join(root, "loose.txt"), "loose");

    const outer = path.join(root, "outer");
    mkdirSync(path.join(outer, ".git"), { recursive: true });
    writeFileSync(path.join(outer, "README.md"), "hello");
    touch(path.join(outer, "README.md"), oldMs);
    writeFileSync(path.join(outer, ".DS_Store"), "ds");
    touch(path.join(outer, ".DS_Store"), newMs);

    const nested = path.join(outer, "nested");
    mkdirSync(nested);
    const gitFile = "gitdir: /tmp/example\n";
    writeFileSync(path.join(nested, ".git"), gitFile);
    writeFileSync(path.join(nested, "payload.txt"), "a".repeat(2000));
    touch(path.join(nested, "payload.txt"), newMs);

    const fresh = path.join(root, "fresh");
    mkdirSync(path.join(fresh, ".git"), { recursive: true });
    writeFileSync(path.join(fresh, "now.txt"), "now");
    touch(path.join(fresh, "now.txt"), newMs);

    const result = scanGitCheckouts(root, now, 15);
    const outerHit = checkout(result.root, result.checkouts, "outer");
    const nestedHit = checkout(result.root, result.checkouts, path.join("outer", "nested"));
    const freshHit = checkout(result.root, result.checkouts, "fresh");

    assert.equal(result.checkouts.length, 3);
    assert.equal(result.outside.files, 1);
    assert.equal(result.outside.logicalBytes, Buffer.byteLength("loose"));
    assert.equal(outerHit.logicalBytes, Buffer.byteLength("hello") + Buffer.byteLength("ds"));
    assert.equal(outerHit.gitKind, "dir");
    assert.equal(nestedHit.logicalBytes, 2000 + Buffer.byteLength(gitFile));
    assert.equal(nestedHit.gitKind, "file");
    assert.equal(path.basename(outerHit.newestPath), "README.md");
    assert.equal(isQuiet(outerHit.newestMtimeMs, result.cutoffMs), true);
    assert.equal(isQuiet(nestedHit.newestMtimeMs, result.cutoffMs), false);
    assert.equal(isQuiet(freshHit.newestMtimeMs, result.cutoffMs), false);

    const report = renderReport(result, false);
    assert.match(report, /untouched: 1,/);
    assert.match(report, /\bouter\b/);
    assert.doesNotMatch(report, /payload\.txt/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("does not walk a symlinked directory as another checkout", () => {
  const root = mkdtempSync(path.join(tmpdir(), "disk-audit-"));
  try {
    const real = path.join(root, "real");
    mkdirSync(path.join(real, ".git"), { recursive: true });
    writeFileSync(path.join(real, "a.txt"), "abc");
    symlinkSync(real, path.join(root, "alias"), "dir");
    const result = scanGitCheckouts(root, Date.now(), 15);
    const rels = result.checkouts.map((item) => path.relative(result.root, item.path));
    assert.deepEqual(rels, ["real"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
