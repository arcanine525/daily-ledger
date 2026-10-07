import { expect, it } from "vitest";
import { localTimeToIso } from "../../src/shared/local-time";

it("converts declared meeting timezone rather than browser timezone", () => {
  expect(localTimeToIso("2026-10-07T09:00", "Asia/Ho_Chi_Minh")).toBe(
    "2026-10-07T02:00:00.000Z",
  );
  expect(() => localTimeToIso("2026-03-08T02:30", "America/New_York")).toThrow(
    "NONEXISTENT_LOCAL_TIME",
  );
});
