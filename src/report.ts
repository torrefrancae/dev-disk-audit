import path from "node:path";
import { formatBytes } from "@src/bytes.js";
import type { ByteTotal, GitCheckout, ScanResult } from "@src/types.js";

export function isQuiet(newestMtimeMs: number, cutoffMs: number): boolean {
  return newestMtimeMs <= cutoffMs;
}

function pad(value: string, width: number, align: "left" | "right"): string {
  if (value.length >= width) return value;
  const gap = " ".repeat(width - value.length);
  return align === "right" ? gap + value : value + gap;
}

function formatWhen(ms: number): string {
  if (!ms) return "-";
  const date = new Date(ms);
  const part = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())} ${part(date.getHours())}:${part(date.getMinutes())}`;
}

function sum(list: GitCheckout[], key: "allocatedBytes" | "logicalBytes"): number {
  return list.reduce((total, checkout) => total + checkout[key], 0);
}

function relativeCheckout(root: string, checkout: string): string {
  const rel = path.relative(root, checkout);
  return rel === "" ? "." : rel;
}

function newestLabel(checkout: GitCheckout): string {
  if (!checkout.newestPath || checkout.newestPath === checkout.path) return "-";
  return path.relative(checkout.path, checkout.newestPath) || "-";
}

function totalLine(label: string, list: GitCheckout[]): string {
  return `${label}: ${list.length}, ${formatBytes(sum(list, "allocatedBytes"))} allocated, ${formatBytes(sum(list, "logicalBytes"))} logical`;
}

function outsideLine(outside: ByteTotal): string {
  return `outside checkouts: ${formatBytes(outside.allocatedBytes)} allocated, ${formatBytes(outside.logicalBytes)} logical, ${outside.files} files`;
}

function table(title: string, list: GitCheckout[], root: string): string[] {
  const lines = [title];
  if (list.length === 0) {
    lines.push("none");
    return lines;
  }
  const rows = [...list]
    .sort((a, b) => b.allocatedBytes - a.allocatedBytes || a.path.localeCompare(b.path))
    .map((checkout) => [
      formatBytes(checkout.allocatedBytes),
      formatBytes(checkout.logicalBytes),
      formatWhen(checkout.newestMtimeMs),
      relativeCheckout(root, checkout.path),
      newestLabel(checkout),
    ]);
  const header = ["allocated", "logical", "last change", "checkout", "newest file"];
  const widths = header.map((name, index) =>
    Math.max(name.length, ...rows.map((row) => row[index]?.length ?? 0)),
  );
  const align = ["right", "right", "left", "left", "left"] as const;
  const paint = (cells: string[]) => cells.map((cell, index) => pad(cell, widths[index] ?? 0, align[index] ?? "left")).join("  ");
  lines.push(paint(header));
  for (const row of rows) lines.push(paint(row));
  return lines;
}

export function renderReport(result: ScanResult, showActive: boolean): string {
  const quiet = result.checkouts.filter((checkout) => isQuiet(checkout.newestMtimeMs, result.cutoffMs));
  const active = result.checkouts.filter((checkout) => !isQuiet(checkout.newestMtimeMs, result.cutoffMs));
  const lines = [
    `root: ${result.root}`,
    `cutoff: ${formatWhen(result.cutoffMs)} (${result.days} days)`,
    `walked: ${result.directories} directories, ${result.errors} read errors`,
    outsideLine(result.outside),
  ];
  if (result.skipRootTrees) lines.push(totalLine("skipped root trees", result.skippedRoots));
  if (result.skippedDirs.length > 0) lines.push(`skipped dirs: ${result.skippedDirs.join(", ")}`);
  lines.push(
    "",
    `git checkouts: ${result.checkouts.length}`,
    totalLine("untouched", quiet),
    totalLine("active", active),
    "",
    ...table("untouched", quiet, result.root),
  );
  if (showActive) {
    lines.push("", ...table("active", active, result.root));
  }
  return lines.join("\n");
}

export function renderJson(result: ScanResult): string {
  const checkouts = [...result.checkouts]
    .sort((a, b) => b.allocatedBytes - a.allocatedBytes || a.path.localeCompare(b.path))
    .map((checkout) => ({
      path: checkout.path,
      relative: relativeCheckout(result.root, checkout.path),
      gitKind: checkout.gitKind,
      quiet: isQuiet(checkout.newestMtimeMs, result.cutoffMs),
      allocatedBytes: checkout.allocatedBytes,
      logicalBytes: checkout.logicalBytes,
      files: checkout.files,
      newestMtime: checkout.newestMtimeMs ? new Date(checkout.newestMtimeMs).toISOString() : null,
      newestPath: checkout.newestPath || null,
    }));
  const quiet = checkouts.filter((checkout) => checkout.quiet);
  const active = checkouts.filter((checkout) => !checkout.quiet);
  const pack = (list: typeof checkouts) => ({
    count: list.length,
    allocatedBytes: list.reduce((total, checkout) => total + checkout.allocatedBytes, 0),
    logicalBytes: list.reduce((total, checkout) => total + checkout.logicalBytes, 0),
  });
  return JSON.stringify(
    {
      root: result.root,
      days: result.days,
      cutoff: new Date(result.cutoffMs).toISOString(),
      directories: result.directories,
      errors: result.errors,
      outside: result.outside,
      skipRootTrees: result.skipRootTrees,
      skippedDirs: result.skippedDirs,
      skippedRoots: result.skippedRoots.map((checkout) => ({
        path: checkout.path,
        relative: relativeCheckout(result.root, checkout.path),
        allocatedBytes: checkout.allocatedBytes,
        logicalBytes: checkout.logicalBytes,
      })),
      totals: {
        checkouts: checkouts.length,
        untouched: pack(quiet),
        active: pack(active),
      },
      checkouts,
    },
    null,
    2,
  );
}
