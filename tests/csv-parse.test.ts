/**
 * Pure-parser tests for csv-import.parseCsv. No DB.
 * Exercises RFC 4180 edge cases that real-world Excel exports hit.
 */
import { describe, it, expect } from "vitest";
import { parseCsv } from "../src/lib/csv-import";

describe("parseCsv — RFC 4180", () => {
  it("parses a simple header + rows", () => {
    const r = parseCsv("name,email\nAlice,a@x.com\nBob,b@x.com");
    expect(r.headers).toEqual(["name", "email"]);
    expect(r.rows).toEqual([
      ["Alice", "a@x.com"],
      ["Bob", "b@x.com"],
    ]);
  });

  it("handles UTF-8 BOM (Excel default)", () => {
    const bomCsv = "﻿name,email\nAlice,a@x.com";
    const r = parseCsv(bomCsv);
    expect(r.headers).toEqual(["name", "email"]);
    expect(r.rows[0]).toEqual(["Alice", "a@x.com"]);
  });

  it("handles CRLF line endings", () => {
    const r = parseCsv("a,b\r\n1,2\r\n3,4\r\n");
    expect(r.headers).toEqual(["a", "b"]);
    expect(r.rows).toEqual([["1", "2"], ["3", "4"]]);
  });

  it("handles quoted fields with commas inside", () => {
    const r = parseCsv('name,note\n"Smith, John","hello, world"');
    expect(r.rows[0]).toEqual(["Smith, John", "hello, world"]);
  });

  it("handles escaped quotes inside quoted fields", () => {
    const r = parseCsv('name,note\n"Doe","She said ""hi"""');
    expect(r.rows[0]).toEqual(["Doe", `She said "hi"`]);
  });

  it("handles newlines inside quoted fields", () => {
    const r = parseCsv('a,b\n"line1\nline2",ok');
    expect(r.rows[0]).toEqual(["line1\nline2", "ok"]);
  });

  it("trims trailing empty rows", () => {
    const r = parseCsv("a,b\n1,2\n\n\n");
    expect(r.rows.length).toBe(1);
  });

  it("returns empty when CSV is empty", () => {
    const r = parseCsv("");
    expect(r.headers).toEqual([]);
    expect(r.rows).toEqual([]);
  });

  it("trims header whitespace but preserves cell content", () => {
    const r = parseCsv("  name  ,  email  \nAlice ,a@x.com");
    expect(r.headers).toEqual(["name", "email"]);
    // Cell content is intentionally NOT trimmed — mapping logic does that.
    expect(r.rows[0]).toEqual(["Alice ", "a@x.com"]);
  });
});
