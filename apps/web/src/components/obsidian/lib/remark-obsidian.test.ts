import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import { describe, expect, it } from "vitest";
import { type RemarkObsidianOptions, remarkObsidian } from "./remark-obsidian";
import { vaultAssetUrl } from "./wikilinks";

// react-markdown's default URL sanitizer blanks any protocol outside its
// http(s)/mailto allowlist, which would strip every `vault://` asset URL —
// same override note-reader.tsx applies for real rendering.
function urlTransform(url: string): string {
  return url.startsWith("vault://") ? url : defaultUrlTransform(url);
}

function render(content: string, options: RemarkObsidianOptions): string {
  return renderToStaticMarkup(
    createElement(
      ReactMarkdown,
      {
        remarkPlugins: [
          remarkFrontmatter,
          remarkGfm,
          [remarkObsidian, options],
        ],
        urlTransform,
      },
      content,
    ),
  );
}

const files = ["Note A.md", "Folder/Note B.md", "Assets/pic.png"];
const opts: RemarkObsidianOptions = {
  files,
  fromRel: "Note A.md",
  root: "/vault",
};

describe("remarkObsidian — wikilinks", () => {
  it("renders a resolved wikilink with its data attributes", () => {
    const html = render("See [[Note B]] here.", opts);
    expect(html).toContain('data-wikilink="Note B"');
    expect(html).toContain('data-resolved="true"');
    expect(html).toMatch(/class="wikilink"[^>]*>Note B</);
    expect(html).not.toContain("unresolved");
  });

  it("renders an unresolved wikilink with the unresolved class", () => {
    const html = render("[[Missing Note]]", opts);
    expect(html).toContain('data-wikilink="Missing Note"');
    expect(html).toContain('data-resolved="false"');
    expect(html).toMatch(/class="wikilink unresolved"/);
  });

  it("uses the alias as the visible text", () => {
    const html = render("[[Note B|Custom Text]]", opts);
    expect(html).toContain('data-wikilink="Note B"');
    expect(html).toContain(">Custom Text<");
    expect(html).not.toContain(">Note B<");
  });

  it("treats [[#heading]] as resolved to the current note", () => {
    const html = render("[[#Section]]", opts);
    expect(html).toContain('data-resolved="true"');
  });
});

describe("remarkObsidian — images", () => {
  it("rewrites a wikilink image embed to a vault:// asset URL", () => {
    const html = render("![[pic.png]]", opts);
    const expectedUrl = vaultAssetUrl("/vault", "Assets/pic.png");
    expect(html).toContain(`src="${expectedUrl.replace(/&/g, "&amp;")}"`);
  });

  it("rewrites a markdown image with a relative, unresolved path to a vault:// asset URL using the raw path", () => {
    const html = render("![alt text](other.png)", opts);
    const expectedUrl = vaultAssetUrl("/vault", "other.png");
    expect(html).toContain(`src="${expectedUrl.replace(/&/g, "&amp;")}"`);
  });

  it("leaves an absolute http(s) image URL untouched", () => {
    const html = render("![alt](https://example.com/pic.png)", opts);
    expect(html).toContain('src="https://example.com/pic.png"');
  });
});

describe("remarkObsidian — embeds", () => {
  it("renders a note embed as a div with data-embed", () => {
    const html = render("![[Note B]]", opts);
    expect(html).toMatch(
      /<div[^>]*data-embed="Folder\/Note B\.md"[^>]*class="obsidian-embed"[^>]*>/,
    );
  });

  it("falls back to the raw target when the embedded note doesn't resolve", () => {
    const html = render("![[Ghost Note]]", opts);
    expect(html).toContain('data-embed="Ghost Note"');
  });
});

describe("remarkObsidian — tags", () => {
  it("renders a hashtag as a link with data-tag", () => {
    const html = render("Working on #project/alpha today.", opts);
    expect(html).toContain('data-tag="project/alpha"');
    expect(html).toContain(">#project/alpha<");
  });

  it("matches a tag at the very start of the text", () => {
    const html = render("#todo needs doing", opts);
    expect(html).toContain('data-tag="todo"');
  });

  it("does not treat a mid-word hash as a tag", () => {
    const html = render("see foo#bar here", opts);
    expect(html).not.toContain("data-tag");
  });
});

describe("remarkObsidian — highlight", () => {
  it("renders ==text== as <mark>", () => {
    const html = render("This is ==important==.", opts);
    expect(html).toContain("<mark>important</mark>");
  });
});

describe("remarkObsidian — callouts", () => {
  it("sets data-callout and data-callout-title, stripping the marker", () => {
    const html = render("> [!warning]+ Watch out\n> Body text here.", opts);
    expect(html).toContain('data-callout="warning"');
    expect(html).toContain('data-callout-title="Watch out"');
    expect(html).not.toContain("[!warning]");
    expect(html).toContain("Body text here.");
  });

  it("defaults the title to the capitalized type when none is given", () => {
    const html = render("> [!note]\n> Content.", opts);
    expect(html).toContain('data-callout="note"');
    expect(html).toContain('data-callout-title="Note"');
  });

  it("leaves a plain blockquote (no marker) untouched", () => {
    const html = render("> Just a quote.", opts);
    expect(html).not.toContain("data-callout");
    expect(html).toContain("Just a quote.");
  });
});

describe("remarkObsidian — code is left alone", () => {
  it("does not transform wikilink syntax inside inline code", () => {
    const html = render("`[[Not A Link]]` and #not-a-tag-either-in-code", opts);
    expect(html).toContain("[[Not A Link]]");
    expect(html).not.toContain("data-wikilink");
  });

  it("does not transform syntax inside a fenced code block", () => {
    const html = render("```\n[[Also Not]] and #tag and ==nope==\n```", opts);
    expect(html).toContain("[[Also Not]]");
    expect(html).not.toContain("data-wikilink");
    expect(html).not.toContain("data-tag");
    expect(html).not.toContain("<mark>");
  });
});

describe("remarkObsidian — task list items", () => {
  it("sets data-task-line on a tight list item (0-based)", () => {
    const html = render("- [ ] one\n- [x] two", opts);
    expect(html).toContain('data-task-line="0"');
    expect(html).toContain('data-task-line="1"');
  });

  it("sets data-task-line on a loose list item (checkbox nested in <p>)", () => {
    const html = render("- [ ] one\n\n- [x] two\n", opts);
    expect(html).toMatch(/<li[^>]*data-task-line="0"[^>]*>\s*<p>/);
    expect(html).toMatch(/<li[^>]*data-task-line="2"[^>]*>\s*<p>/);
  });

  it("does not set data-task-line on a non-task list item", () => {
    const html = render("- plain item", opts);
    expect(html).not.toContain("data-task-line");
  });
});

describe("remarkObsidian — frontmatter", () => {
  it("exposes the raw yaml block via data-frontmatter", () => {
    const html = render("---\ntitle: Hello\ntags: [a, b]\n---\n\nBody.", opts);
    expect(html).toContain("data-frontmatter=");
    expect(html).toContain("title: Hello");
  });
});
