import { it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  microsoftAuthorizationUrl,
  goldBalance,
  type MicrosoftReady,
} from "../src/lib/microsoft";
import { MicrosoftConfirmation } from "../src/components/MicrosoftVerification";
const ready: MicrosoftReady = {
  status: "ready",
  mode: "register",
  confirmationDigest: "test",
  profile: {
    username: "Player",
    avatar: null,
    balance: 25,
    townBalance: 500,
    isMayor: false,
    town: { name: "Capital", uuid: "town" },
    nation: { name: "Byzantium" },
    ranks: ["Minister", "Knight"],
    townRegistered: false,
  },
};
it("confirmation shows identity, ranks and an unregistered-town warning without exposing mayor finances", () => {
  const html = renderToStaticMarkup(<MicrosoftConfirmation ready={ready} />);
  for (const text of [
    "Player avatar",
    "25 Gold",
    "Capital",
    "Byzantium",
    "Minister",
    "Knight",
    "Your town is awaiting registration",
  ])
    expect(html).toContain(text);
  expect(html).not.toContain("Town bank balance");
  expect(html).not.toContain("500 Gold");
});
it("mayors see their town balance and registered citizens do not receive a town warning", () => {
  const mayor = renderToStaticMarkup(
    <MicrosoftConfirmation
      ready={{ ...ready, profile: { ...ready.profile, isMayor: true } }}
    />,
  );
  expect(mayor).toContain("Town bank balance");
  expect(mayor).toContain("500 Gold");
  expect(mayor).not.toContain("Your town is awaiting registration");
  const registered = renderToStaticMarkup(
    <MicrosoftConfirmation
      ready={{ ...ready, profile: { ...ready.profile, townRegistered: true } }}
    />,
  );
  expect(registered).not.toContain("Your town is awaiting registration");
  expect(goldBalance(null)).toBe("Unavailable");
});
it("only the exact Microsoft authorization endpoint can be opened", () => {
  expect(
    microsoftAuthorizationUrl(
      "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?state=test",
    ),
  ).toContain("state=test");
  for (const url of [
    "javascript:alert(1)",
    "https://evil.invalid/consumers/oauth2/v2.0/authorize",
    "https://evil@login.microsoftonline.com/consumers/oauth2/v2.0/authorize",
  ])
    expect(() => microsoftAuthorizationUrl(url)).toThrow();
});
