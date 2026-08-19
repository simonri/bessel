import { describe, expect, it } from "vitest";
import {
  basenameOf,
  isImageRel,
  linkTargetFor,
  newNoteRel,
  parentOf,
  parseLinkTarget,
  parseWikiLinks,
  resolveLink,
  stripMd,
  vaultAssetUrl,
} from "./wikilinks";

describe("parseLinkTarget", () => {
  it("parses a bare target", () => {
    expect(parseLinkTarget("Note")).toEqual({
      target: "Note",
      heading: null,
      block: null,
      alias: null,
    });
  });

  it("parses a same-note heading reference", () => {
    expect(parseLinkTarget("#heading")).toEqual({
      target: "",
      heading: "heading",
      block: null,
      alias: null,
    });
  });

  it("parses target#heading", () => {
    expect(parseLinkTarget("Note#Heading")).toEqual({
      target: "Note",
      heading: "Heading",
      block: null,
      alias: null,
    });
  });

  it("parses target#^block", () => {
    expect(parseLinkTarget("Note#^abc123")).toEqual({
      target: "Note",
      heading: null,
      block: "abc123",
      alias: null,
    });
  });

  it("parses an alias", () => {
    expect(parseLinkTarget("Note|Display Text")).toEqual({
      target: "Note",
      heading: null,
      block: null,
      alias: "Display Text",
    });
  });

  it("keeps extra pipes as part of the alias", () => {
    expect(parseLinkTarget("Note|a|b|c")).toEqual({
      target: "Note",
      heading: null,
      block: null,
      alias: "a|b|c",
    });
  });

  it("parses target#heading|alias together", () => {
    expect(parseLinkTarget("Note#Heading|Alias")).toEqual({
      target: "Note",
      heading: "Heading",
      block: null,
      alias: "Alias",
    });
  });
});

describe("parseWikiLinks", () => {
  it("finds a single link with correct offsets", () => {
    const text = "See [[Note]] for more.";
    const links = parseWikiLinks(text);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      target: "Note",
      embed: false,
      raw: "[[Note]]",
    });
    expect(text.slice(links[0].start, links[0].end)).toBe("[[Note]]");
  });

  it("finds an embed", () => {
    const [link] = parseWikiLinks("![[image.png]]");
    expect(link).toMatchObject({
      target: "image.png",
      embed: true,
      raw: "![[image.png]]",
    });
  });

  it("parses [[#heading]] as a same-note reference", () => {
    const [link] = parseWikiLinks("[[#heading]]");
    expect(link.target).toBe("");
    expect(link.heading).toBe("heading");
  });

  it("parses [[note#^block]]", () => {
    const [link] = parseWikiLinks("[[note#^block]]");
    expect(link.target).toBe("note");
    expect(link.block).toBe("block");
  });

  it("parses [[a|b|c]] keeping b|c as the alias", () => {
    const [link] = parseWikiLinks("[[a|b|c]]");
    expect(link.target).toBe("a");
    expect(link.alias).toBe("b|c");
  });

  it("finds multiple links per line with distinct offsets", () => {
    const text = "[[One]] and [[Two|Second]] and ![[Three.png]]";
    const links = parseWikiLinks(text);
    expect(links.map((l) => l.target)).toEqual(["One", "Two", "Three.png"]);
    expect(links[1].alias).toBe("Second");
    expect(links[2].embed).toBe(true);
    for (const link of links) {
      expect(text.slice(link.start, link.end)).toBe(link.raw);
    }
    expect(links[0].start).toBeLessThan(links[1].start);
    expect(links[1].start).toBeLessThan(links[2].start);
  });

  it("returns an empty array when there are no links", () => {
    expect(parseWikiLinks("plain text")).toEqual([]);
  });
});

describe("basenameOf / stripMd / parentOf", () => {
  it("strips folder and extension", () => {
    expect(basenameOf("Journal/2026-01-11.md")).toBe("2026-01-11");
    expect(basenameOf("Note.md")).toBe("Note");
  });

  it("stripMd only strips the extension", () => {
    expect(stripMd("Journal/2026-01-11.md")).toBe("Journal/2026-01-11");
  });

  it("parentOf returns '' at the root", () => {
    expect(parentOf("Note.md")).toBe("");
  });

  it("parentOf returns the folder otherwise", () => {
    expect(parentOf("Journal/2026-01-11.md")).toBe("Journal");
    expect(parentOf("A/B/C.md")).toBe("A/B");
  });
});

describe("resolveLink", () => {
  const files = [
    "Note.md",
    "Journal/2026-01-11.md",
    "Projects/Note.md",
    "Projects/Sub/Note.md",
    "Assets/image.png",
    "Pasted image.png",
  ];

  it("resolves an exact rel match", () => {
    expect(resolveLink(files, "Note.md", "Journal/2026-01-11.md")).toBe(
      "Journal/2026-01-11.md",
    );
  });

  it("resolves an exact rel match without .md", () => {
    expect(resolveLink(files, "Note.md", "Journal/2026-01-11")).toBe(
      "Journal/2026-01-11.md",
    );
  });

  it("is case-insensitive", () => {
    expect(resolveLink(files, "Note.md", "note")).toBe("Note.md");
    expect(resolveLink(files, "Note.md", "JOURNAL/2026-01-11")).toBe(
      "Journal/2026-01-11.md",
    );
  });

  it("returns fromRel for an empty target (same-note link)", () => {
    expect(resolveLink(files, "Note.md", "")).toBe("Note.md");
  });

  it("returns null when nothing matches", () => {
    expect(resolveLink(files, "Note.md", "Nonexistent")).toBeNull();
  });

  it("prefers the shortest path among basename matches", () => {
    // No exact top-level match here, only two nested basename candidates —
    // "Projects/Note.md" has the shorter path.
    const nested = ["Projects/Note.md", "Projects/Sub/Note.md"];
    expect(resolveLink(nested, "Elsewhere.md", "Note")).toBe(
      "Projects/Note.md",
    );
  });

  it("breaks a shortest-path tie by folder proximity to fromRel", () => {
    const clashFiles = ["A/Note.md", "B/Note.md"];
    expect(resolveLink(clashFiles, "B/Current.md", "Note")).toBe("B/Note.md");
    expect(resolveLink(clashFiles, "A/Current.md", "Note")).toBe("A/Note.md");
  });

  it("resolves a non-markdown target by full filename", () => {
    expect(resolveLink(files, "Note.md", "image.png")).toBe("Assets/image.png");
  });

  it("resolves a non-markdown target with spaces", () => {
    expect(resolveLink(files, "Note.md", "Pasted image.png")).toBe(
      "Pasted image.png",
    );
  });

  it("does not match a non-md target against a .md note with the same stem", () => {
    const mixed = ["Diagrams/image.png", "Notes/image.md"];
    expect(resolveLink(mixed, "Note.md", "image.png")).toBe(
      "Diagrams/image.png",
    );
  });
});

describe("linkTargetFor", () => {
  it("uses the bare basename when there is no clash", () => {
    const files = ["Note.md", "Journal/2026-01-11.md"];
    expect(linkTargetFor(files, "Journal/2026-01-11.md")).toBe("2026-01-11");
  });

  it("uses the full path (without .md) when basenames clash", () => {
    const files = ["Note.md", "Projects/Note.md"];
    expect(linkTargetFor(files, "Projects/Note.md")).toBe("Projects/Note");
    expect(linkTargetFor(files, "Note.md")).toBe("Note");
  });

  it("clash detection is case-insensitive", () => {
    const files = ["note.md", "Projects/Note.md"];
    expect(linkTargetFor(files, "Projects/Note.md")).toBe("Projects/Note");
  });
});

describe("isImageRel", () => {
  it("recognizes common image extensions", () => {
    for (const ext of [
      "png",
      "jpg",
      "jpeg",
      "gif",
      "webp",
      "svg",
      "bmp",
      "avif",
    ]) {
      expect(isImageRel(`Assets/pic.${ext}`)).toBe(true);
    }
  });

  it("rejects non-image extensions", () => {
    expect(isImageRel("Note.md")).toBe(false);
    expect(isImageRel("Assets/file.pdf")).toBe(false);
  });
});

describe("vaultAssetUrl", () => {
  it("builds a vault:// URL with encoded root and path", () => {
    const url = vaultAssetUrl("/home/simon/Obsidian Vault", "Assets/pic 1.png");
    expect(url).toBe(
      `vault://asset/?root=${encodeURIComponent("/home/simon/Obsidian Vault")}&path=${encodeURIComponent("Assets/pic 1.png")}`,
    );
  });
});

describe("newNoteRel", () => {
  it("returns 'Untitled.md' at the root when free", () => {
    expect(newNoteRel([], "")).toBe("Untitled.md");
  });

  it("suffixes with an incrementing number when taken", () => {
    expect(newNoteRel(["Untitled.md"], "")).toBe("Untitled 1.md");
    expect(newNoteRel(["Untitled.md", "Untitled 1.md"], "")).toBe(
      "Untitled 2.md",
    );
  });

  it("scopes to a folder", () => {
    expect(newNoteRel(["Untitled.md"], "Journal")).toBe("Journal/Untitled.md");
    expect(newNoteRel(["Journal/Untitled.md"], "Journal")).toBe(
      "Journal/Untitled 1.md",
    );
  });

  it("suffix check is case-insensitive", () => {
    expect(newNoteRel(["untitled.md"], "")).toBe("Untitled 1.md");
  });

  it("supports a custom base name", () => {
    expect(newNoteRel([], "", "New note")).toBe("New note.md");
  });
});
