import type { VaultEntry, VaultEntryKind } from "../vault-types";

export interface TreeNode {
  name: string;
  /** Vault-relative path; "" only for the synthetic root. */
  rel: string;
  kind: VaultEntryKind | "dir";
  entry?: VaultEntry;
  children: TreeNode[];
}

export interface VisibleTreeNode {
  node: TreeNode;
  depth: number;
}

function basename(rel: string): string {
  return rel.slice(rel.lastIndexOf("/") + 1);
}

function parentOf(rel: string): string {
  const at = rel.lastIndexOf("/");
  return at === -1 ? "" : rel.slice(0, at);
}

function sortChildren(node: TreeNode): void {
  node.children.sort((a, b) => {
    const aDir = a.kind === "dir";
    const bDir = b.kind === "dir";
    if (aDir !== bDir) return aDir ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
  for (const child of node.children)
    if (child.kind === "dir") sortChildren(child);
}

/**
 * Nests a flat `vault:list` result into a tree, folders first, natural sort.
 * Intermediate folders are synthesized from `rel` path segments even when
 * `vault:list` didn't return an explicit "dir" entry for them, so a stray
 * file at "a/b/c.md" still renders under "a" and "a/b".
 */
export function buildTree(entries: readonly VaultEntry[]): TreeNode[] {
  const dirs = new Map<string, TreeNode>();
  const root: TreeNode = { name: "", rel: "", kind: "dir", children: [] };
  dirs.set("", root);

  function ensureDir(rel: string): TreeNode {
    const cached = dirs.get(rel);
    if (cached) return cached;
    const parent = ensureDir(parentOf(rel));
    const node: TreeNode = {
      name: basename(rel),
      rel,
      kind: "dir",
      children: [],
    };
    parent.children.push(node);
    dirs.set(rel, node);
    return node;
  }

  for (const entry of entries) {
    if (entry.kind === "dir") ensureDir(entry.rel).entry = entry;
  }
  for (const entry of entries) {
    if (entry.kind === "dir") continue;
    const parent = ensureDir(parentOf(entry.rel));
    parent.children.push({
      name: basename(entry.rel),
      rel: entry.rel,
      kind: entry.kind,
      entry,
      children: [],
    });
  }

  sortChildren(root);
  return root.children;
}

/**
 * Keeps only nodes whose rel matches `query` (substring, case-insensitive),
 * plus their ancestor folders. Empty `query` returns `nodes` unchanged.
 */
export function filterTree(
  nodes: readonly TreeNode[],
  query: string,
): TreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes as TreeNode[];
  const result: TreeNode[] = [];
  for (const node of nodes) {
    if (node.kind === "dir") {
      const children = filterTree(node.children, q);
      if (children.length > 0 || node.rel.toLowerCase().includes(q)) {
        result.push({ ...node, children });
      }
    } else if (node.rel.toLowerCase().includes(q)) {
      result.push(node);
    }
  }
  return result;
}

/** Flattens the expanded portion of a tree into display order. Keeping this
 * separate from rendering lets the file tree window an arbitrarily large
 * vault while preserving the hierarchy through each row's `depth`. */
export function flattenVisibleTree(
  nodes: readonly TreeNode[],
  isExpanded: (rel: string) => boolean,
): VisibleTreeNode[] {
  const visible: VisibleTreeNode[] = [];

  function visit(items: readonly TreeNode[], depth: number): void {
    for (const node of items) {
      visible.push({ node, depth });
      if (node.kind === "dir" && isExpanded(node.rel)) {
        visit(node.children, depth + 1);
      }
    }
  }

  visit(nodes, 0);
  return visible;
}
