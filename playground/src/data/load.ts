/**
 * The generated site data.
 *
 * Imported statically so a broken build fails loudly rather than showing an empty screen.
 * The files are produced by `tools/export_site_data.py` from the repo's own specs and
 * fixtures; `tools/export_site_data.py --check` proves they are not stale.
 */

import patternsFile from "./patterns.json";
import reportFile from "./report.json";
import canonicalFile from "./canonical.json";
import p1 from "./matrices/P1.json";
import p2 from "./matrices/P2.json";
import p3 from "./matrices/P3.json";
import p4 from "./matrices/P4.json";
import p5 from "./matrices/P5.json";
import p6 from "./matrices/P6.json";
import type { CanonicalFile, MatrixFile, PatternsFile, ReportFile } from "./types";

export const patterns: PatternsFile = patternsFile as PatternsFile;
export const report: ReportFile = reportFile as ReportFile;
export const canonical: CanonicalFile = canonicalFile as CanonicalFile;

export const matrices: Record<string, MatrixFile> = {
  P1: p1 as MatrixFile,
  P2: p2 as MatrixFile,
  P3: p3 as MatrixFile,
  P4: p4 as MatrixFile,
  P5: p5 as MatrixFile,
  P6: p6 as MatrixFile,
};

export const packageVersion = patterns.packageVersion;

export function findPattern(id: string) {
  return patterns.patterns.find((pattern) => pattern.id === id) ?? null;
}
