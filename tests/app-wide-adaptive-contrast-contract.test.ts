import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(__dirname, "..");

function sourceFiles(root: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return entry.name.endsWith(".tsx") ? [absolute] : [];
  });
}

const adaptiveTextRole =
  /(?:title|heading|name|subtitle|description|body|copy|label|meta|caption|status|helper|artist|duration|detail|value|arrow|icon|text)/iu;
const intentionalFixedRole =
  /(?:accent|art|artwork|avatar|badge|brand|button|cta|danger|delete|logo|mark|pill|play|provider|selected|spotify|success|warning)/iu;

describe("app-wide adaptive contrast", () => {
  it("keeps input placeholders readable in either appearance", () => {
    for (const file of [
      ...sourceFiles(path.join(projectRoot, "app")),
      ...sourceFiles(path.join(projectRoot, "components")),
    ]) {
      const source = fs.readFileSync(file, "utf8");
      expect(`${path.relative(projectRoot, file)}:${/placeholderTextColor=["']#/u.test(source)}`).toBe(
        `${path.relative(projectRoot, file)}:false`,
      );
    }
  });

  it("uses the adaptive palette for neutral reading and navigation roles", () => {
    const failures: string[] = [];

    for (const file of [
      ...sourceFiles(path.join(projectRoot, "app")),
      ...sourceFiles(path.join(projectRoot, "components")),
    ]) {
      let activeStyle = "";
      const lines = fs.readFileSync(file, "utf8").split("\n");

      lines.forEach((line, index) => {
        const styleStart = line.match(/^\s{2,}(\w+):\s*\{/u);
        if (styleStart) activeStyle = styleStart[1];
        if (!adaptiveTextRole.test(activeStyle) || intentionalFixedRole.test(activeStyle)) return;

        const fixedNeutral = line.match(/\bcolor:\s*["'](#[0-9a-f]{6})["']/iu);
        if (!fixedNeutral) return;

        const [red, green, blue] = fixedNeutral[1]
          .slice(1)
          .match(/.{2}/gu)!
          .map((channel) => Number.parseInt(channel, 16));
        const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
        if (spread <= 34) {
          failures.push(`${path.relative(projectRoot, file)}:${index + 1}:${activeStyle}:${fixedNeutral[1]}`);
        }
      });
    }

    expect(failures).toEqual([]);
  });
});
