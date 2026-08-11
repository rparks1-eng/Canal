import {
  loginModeFromParam,
} from "../lib/login-route";

describe("shared-link login route mode", () => {
  it("opens the account form only for the exact create-account mode", () => {
    expect(loginModeFromParam("create-account")).toBe("create-account");
    expect(loginModeFromParam(["create-account"])).toBe("create-account");
  });

  it("fails closed to sign in for missing or untrusted values", () => {
    expect(loginModeFromParam(undefined)).toBe("sign-in");
    expect(loginModeFromParam("onboarding")).toBe("sign-in");
    expect(loginModeFromParam(["unknown", "create-account"])).toBe("sign-in");
  });
});
