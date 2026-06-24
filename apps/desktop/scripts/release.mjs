import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const dir = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(dir, "../package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const [major, minor, patch] = pkg.version.split(".").map(Number);

const bump = process.argv[2] ?? "patch";
let next;
if (bump === "major") next = `${major + 1}.0.0`;
else if (bump === "minor") next = `${major}.${minor + 1}.0`;
else next = `${major}.${minor}.${patch + 1}`;

pkg.version = next;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

const run = (cmd) => execSync(cmd, { stdio: "inherit", cwd: resolve(dir, "../../../") });
run(`git add apps/desktop/package.json`);
run(`git commit -m "release: v${next}"`);
run(`git tag v${next}`);
run(`git push --follow-tags origin HEAD`);
run(`git push origin v${next}`);
console.log(`\nReleased v${next}.`);
