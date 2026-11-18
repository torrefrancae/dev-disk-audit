export type GitKind = "dir" | "file";

export type ByteTotal = {
  logicalBytes: number;
  allocatedBytes: number;
  files: number;
};

export type GitCheckout = ByteTotal & {
  path: string;
  gitKind: GitKind;
  newestMtimeMs: number;
  newestPath: string;
};

export type ScanResult = {
  root: string;
  days: number;
  cutoffMs: number;
  directories: number;
  errors: number;
  outside: ByteTotal;
  skipRootTrees: boolean;
  skippedDirs: string[];
  skippedRoots: GitCheckout[];
  checkouts: GitCheckout[];
};
