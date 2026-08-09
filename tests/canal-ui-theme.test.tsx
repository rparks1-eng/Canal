import {
  canalColors,
  getCanalColors,
} from "../theme/canal-colors";

import {
  canalSpacing,
} from "../theme/canal-spacing";

import {
  canalTypography,
} from "../theme/canal-typography";

describe("Canal UI foundation tokens", () => {
  it("keeps light and dark editorial palettes with concrete mood accents", () => {
    expect(getCanalColors("light").page).toBe("#DDF4F2");
    expect(getCanalColors("dark").ink).toBe("#F6FEFF");
    expect(getCanalColors("dark").glass).toBe("rgba(4, 34, 54, 0.66)");
    expect(canalColors.mood).toEqual(expect.objectContaining({ lavender: "#787DFF", mint: "#82D5AA" }));
  });

  it("uses serif display type and 48pt actionable targets", () => {
    expect(canalTypography.display.fontFamily).toBe("Georgia");
    expect(canalSpacing.touchTarget).toBeGreaterThanOrEqual(48);
    expect(canalSpacing.radius.continuous).toBeGreaterThan(0);
  });
});
