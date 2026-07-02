// Document version-string helpers, shared by server actions and the MCP layer.

// Minor bump: vMAJOR.MINOR or vMAJOR.MINOR.PATCH -> vMAJOR.(MINOR+1); drops any patch.
export function bumpMinor(version: string): string {
  const m = version.match(/^v?(\d+)\.(\d+)(?:\.\d+)?$/);
  if (!m) return "v1.1";
  return `v${m[1]}.${Number(m[2]) + 1}`;
}

// Patch bump for minor edits: vMAJOR.MINOR -> vMAJOR.MINOR.1,
// vMAJOR.MINOR.PATCH -> vMAJOR.MINOR.(PATCH+1).
export function bumpPatch(version: string): string {
  const m = version.match(/^v?(\d+)\.(\d+)(?:\.(\d+))?$/);
  if (!m) return "v1.0.1";
  const patch = m[3] ? Number(m[3]) + 1 : 1;
  return `v${m[1]}.${m[2]}.${patch}`;
}
