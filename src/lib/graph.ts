// Pure graph helpers over the document dependency graph.
// Edge semantics: `target` depends on `source` (source --> target).
// When `source` changes, every node downstream of it is impacted.

export type Edge = { sourceId: string; targetId: string };

function buildDownstreamAdjacency(edges: Edge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.sourceId)) adj.set(e.sourceId, []);
    adj.get(e.sourceId)!.push(e.targetId);
  }
  return adj;
}

function buildUpstreamAdjacency(edges: Edge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.targetId)) adj.set(e.targetId, []);
    adj.get(e.targetId)!.push(e.sourceId);
  }
  return adj;
}

function traverse(start: string, adj: Map<string, string[]>): Set<string> {
  const visited = new Set<string>();
  const stack = [...(adj.get(start) ?? [])];
  while (stack.length) {
    const node = stack.pop()!;
    if (visited.has(node)) continue;
    visited.add(node);
    for (const next of adj.get(node) ?? []) {
      if (!visited.has(next)) stack.push(next);
    }
  }
  return visited;
}

// All documents impacted when `docId` changes (everything downstream).
export function downstreamOf(docId: string, edges: Edge[]): Set<string> {
  return traverse(docId, buildDownstreamAdjacency(edges));
}

// All documents that `docId` ultimately derives from (everything upstream).
export function upstreamOf(docId: string, edges: Edge[]): Set<string> {
  return traverse(docId, buildUpstreamAdjacency(edges));
}

// Direct dependents (one hop downstream).
export function directDependents(docId: string, edges: Edge[]): string[] {
  return edges.filter((e) => e.sourceId === docId).map((e) => e.targetId);
}

// Direct dependencies (one hop upstream).
export function directDependencies(docId: string, edges: Edge[]): string[] {
  return edges.filter((e) => e.targetId === docId).map((e) => e.sourceId);
}
