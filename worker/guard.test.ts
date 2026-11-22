import { describe, expect, it } from "vitest";
import { looksLikeAccountDetails as bad } from "./guard";

describe("looksLikeAccountDetails", () => {
  it("catches account numbers, sort code plus account, cards and IBANs", () => {
    expect(bad("Account 12345678")).toBe(true);
    expect(bad("Sort 12-34-56 acc 1234 5678")).toBe(true);
    expect(bad("Card 4111 1111 1111 1111")).toBe(true);
    expect(bad("GB29 NWBK 6016 1331 9268 19")).toBe(true);
    expect(bad("07700 900123")).toBe(true); // phone numbers are caught too
  });
  it("allows ordinary instructions", () => {
    expect(bad("Pay Sarah by bank transfer. Details are in the group chat.")).toBe(false);
    expect(bad("PayPal.me/sarah or cash on Friday")).toBe(false);
    expect(bad("Bring £5 to the kitchen by 12 Dec")).toBe(false);
    expect(bad("Sort code 12-34-56")).toBe(false);
  });
});
