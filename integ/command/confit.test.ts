import * as T from "./helper";

const t = T.create("config");

beforeEach(t.beforeHook);
afterEach(t.afterHook);

describe("config", () => {
  it.skip("returns 1 for unknown variable", async () => {
    await t.kitCmd("config", "--local", "no.such");
    t.assertStatus(1);
  });
});
