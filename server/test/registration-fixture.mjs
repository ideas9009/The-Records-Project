import { createService as realService } from "../src/service.mjs";
import { digest } from "../src/security.mjs";
export const fixtureSnapshot = (name) => {
  const id = digest(name.toLowerCase()).slice(0, 32);
  return {
    username: name,
    minecraftUuid: id,
    nation: { name: "Byzantium", uuid: "b".repeat(32) },
    town: {
      name: name + "Town",
      uuid: digest(name + "Town").slice(0, 32),
      mayorUuid: id,
      mayorName: name,
    },
    isMayor: true,
    isCapital: false,
    roles: ["citizen", "mayor"],
    unknownRanks: [],
    ranks: [],
    balance: 10,
    townBalance: 20,
    earthmcResidents: 2,
    claimedChunks: 16,
  };
};
// Existing feature fixtures use the same two requests as the registration UI,
// with EMC responses supplied by this test-only lookup.
export function createService(store, options = {}) {
  const service = realService(store, {
    ...options,
    registration: {
      lookup: async (name) => fixtureSnapshot(name),
      ...options.registration,
    },
  });
  const register = service.register;
  service.register = async (body, ip) => {
    if (body.receipt) return register(body, ip);
    const confirmation = await service.manualLookup(
      { username: body.username },
      ip,
    );
    return register(
      { ...body, receipt: confirmation.receipt, confirmed: true },
      ip,
    );
  };
  return service;
}
