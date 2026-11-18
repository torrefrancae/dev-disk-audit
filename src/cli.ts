import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { renderJson, renderReport } from "@src/report.js";
import { scanGitCheckouts } from "@src/scan.js";

const HELP = `disk-audit - show disk held by quiet git checkouts

Usage:
  disk-audit repos <path> [--days <n>] [--all] [--json] [--skip-root-trees] [--skip-dirs <list>]

Commands:
  repos <path>   Measure git checkouts under a directory

Options:
  --days <n>     Flag checkouts whose newest file write is at least this many days old (default 15)
  --all          Also list checkouts inside the cutoff
  --json         Print JSON on stdout
  --skip-root-trees
                 Omit a git checkout that is the path itself or a direct child of it.
                 Checkouts nested under that tree are still measured.
  --skip-dirs <list>
                 Do not walk directories whose name matches a comma-separated list.
                 * matches any characters in the name.
  -h, --help     Show this help
`;

function printHelp(): void {
  process.stdout.write(HELP);
}

export function main(argv: string[]): number {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        days: { type: "string", default: "15" },
        all: { type: "boolean", default: false },
        json: { type: "boolean", default: false },
        "skip-root-trees": { type: "boolean", default: false },
        "skip-dirs": { type: "string" },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    printHelp();
    return 2;
  }

  const [command, ...rest] = parsed.positionals;
  if (parsed.values.help || !command || command === "help") {
    printHelp();
    return 0;
  }
  if (command !== "repos") {
    process.stderr.write(`unknown command: ${command}\n`);
    printHelp();
    return 2;
  }
  const target = rest[0];
  if (!target || rest.length !== 1) {
    process.stderr.write("usage: disk-audit repos <path>\n");
    return 2;
  }
  const days = Number(parsed.values.days);
  if (!Number.isInteger(days) || days < 0) {
    process.stderr.write("--days must be a whole number >= 0\n");
    return 2;
  }

  process.stderr.write(`scanning ${target}\n`);
  let result;
  try {
    const skipDirs = String(parsed.values["skip-dirs"] ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    result = scanGitCheckouts(target, Date.now(), days, {
      skipRootTrees: parsed.values["skip-root-trees"] === true,
      skipDirs,
      onProgress(directories) {
        if (process.stderr.isTTY) {
          process.stderr.write(`\rscanning ${directories} directories`);
          return;
        }
        if (directories % 20000 === 0) process.stderr.write(`scanning ${directories} directories\n`);
      },
    });
  } catch (error) {
    if (process.stderr.isTTY) process.stderr.write("\r\x1b[K");
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    return 1;
  }
  if (process.stderr.isTTY) process.stderr.write("\r\x1b[K");
  process.stderr.write(`scanned ${result.directories} directories\n`);
  const body = parsed.values.json ? renderJson(result) : renderReport(result, parsed.values.all === true);
  process.stdout.write(`${body}\n`);
  return 0;
}

const invoked = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  process.exitCode = main(process.argv.slice(2));
}
