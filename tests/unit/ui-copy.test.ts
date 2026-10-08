import { expect, it } from "vitest";
import {
  errorText,
  runStateText,
  uiMessages,
} from "../../src/components/ui-copy";

it("keeps every UI message key available in both locales", () => {
  expect(Object.keys(uiMessages.en).sort()).toEqual(
    Object.keys(uiMessages.vi).sort(),
  );
  expect(Object.values(uiMessages.vi).every((value) => value.length > 0)).toBe(
    true,
  );
});
it("localizes known failures without exposing arbitrary exception payloads", () => {
  expect(errorText("CHAT_PROFILE_REQUIRED", "en")).not.toContain(
    "CHAT_PROFILE_REQUIRED",
  );
  expect(errorText("CHAT_PROFILE_REQUIRED", "vi")).not.toBe(
    errorText("CHAT_PROFILE_REQUIRED", "en"),
  );
  expect(
    errorText("private token payload: fixture-secret", "vi"),
  ).not.toContain("fixture-secret");
  expect(errorText("", "vi")).toBe("");
});
it("localizes business run states while keeping the protocol codes unchanged", () => {
  expect(runStateText("READY", "en")).toBe("Ready");
  expect(runStateText("READY", "vi")).toBe("Sẵn sàng");
});
