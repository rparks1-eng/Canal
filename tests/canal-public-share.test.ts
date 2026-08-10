import { Platform, Share } from "react-native";
import { canalCanonicalUrl, shareScene, shareSnapshot, shareStage } from "../lib/canal-share";

jest.mock("react-native", () => ({ Platform: { OS: "ios" }, Share: { share: jest.fn(), dismissedAction: "dismissedAction" } }));

describe("canonical Canal sharing", () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_CANAL_SHARE_BASE_URL = "https://Canal.Example/community/";
    (Share.share as jest.Mock).mockResolvedValue({ action: "sharedAction" });
  });

  it("builds only canonical HTTPS destinations", () => {
    expect(canalCanonicalUrl("/scenes/scene%2Fone")).toBe("https://canal.example/community/scenes/scene%2Fone");
    process.env.EXPO_PUBLIC_CANAL_SHARE_BASE_URL = "https://user:secret@canal.example";
    expect(canalCanonicalUrl("/scenes/one")).toBeUndefined();
    expect(canalCanonicalUrl("//attacker.example")).toBeUndefined();
  });

  it("shares public Scene, Snapshot, and Stage canonical links", async () => {
    await shareScene({ id: "scene/a", name: "Scene", visibility: "public" });
    await shareSnapshot({ id: "snap/a", sceneName: "Scene", visibility: "public" });
    await shareStage({ stageId: "00000000-0000-4000-8000-000000000001", inviteToken: "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789", name: "Stage", status: "live", visibility: "public" });
    expect(Share.share).toHaveBeenCalledTimes(3);
    expect((Share.share as jest.Mock).mock.calls[0][0].message).toContain("/scenes/scene%2Fa");
    expect((Share.share as jest.Mock).mock.calls[1][0].message).toContain("/snapshots/snap%2Fa");
    expect((Share.share as jest.Mock).mock.calls[2][0].message).toContain("/stages/00000000-0000-4000-8000-000000000001/join?invite=abcdefghijklmnopqrstuvwxyzABCDEFGH123456789");
    expect(Platform.OS).toBe("ios");
  });
});
