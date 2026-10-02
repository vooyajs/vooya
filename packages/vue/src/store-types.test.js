import test from "node:test";
import { checkGeneratedStoreTypes } from "../../../tests/adapter-store-types.mjs";

test("generated store interfaces preserve snapshot and action types through vue", () => {
  checkGeneratedStoreTypes("vue");
});
