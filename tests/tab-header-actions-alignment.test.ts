import fs from "node:fs";
import path from "node:path";

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const home = read("app/(tabs)/index.tsx");
const explore = read("app/(tabs)/explore.tsx");
const library = read("app/(tabs)/library.tsx");

describe("primary tab header actions", () => {
  it("shows the notification bell without Settings on all three tabs", () => {
    expect(home).toContain("<CanalHeaderActions showSettings={false} />");
    expect(explore).toContain("<CanalHeaderActions showSettings={false} />");
    expect(library).toContain("<CanalHeaderActions showSettings={false} />");
  });

  it("uses the same top-right header geometry", () => {
    for (const source of [home, explore, library]) {
      expect(source).toMatch(/content:\s*\{[\s\S]*?paddingHorizontal:\s*20/);
      expect(source).toMatch(/header:\s*\{[\s\S]*?alignItems:[\s\S]*?"flex-start"/);
      expect(source).toMatch(/header:\s*\{[\s\S]*?paddingTop:\s*12/);
      expect(source).toMatch(/headerCopy:\s*\{[\s\S]*?paddingRight:\s*4/);
    }

    expect(explore).toMatch(/content:\s*\{[\s\S]*?paddingTop:\s*0/);
    expect(library).toMatch(/content:\s*\{[\s\S]*?paddingTop:\s*0/);
  });
});
