import { it, expect } from "vitest";
import { validCapture } from "../scripts/local-capture";
const header = (width: number, height: number) => {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.write("IHDR", 12);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
};
it("local Windows capture rejects non-PNG and oversized image dimensions", () => {
  expect(validCapture(Buffer.from("not an image"))).toBe(false);
  expect(validCapture(header(0, 10))).toBe(false);
  expect(validCapture(header(16000, 10))).toBe(false);
  expect(validCapture(header(15000, 15000))).toBe(false);
  expect(validCapture(header(1768, 7220))).toBe(true);
});
