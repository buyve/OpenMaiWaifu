import { describe, it, expect } from "vitest";
import { extractJSON } from "../llmService";

describe("extractJSON", () => {
  // ---------- Markdown code blocks ----------

  it("extracts JSON from ```json code block", () => {
    const text = 'Some text\n```json\n{"key":"value"}\n```\nMore text';
    expect(extractJSON(text)).toEqual({ key: "value" });
  });

  it("extracts JSON from ``` code block (no language)", () => {
    const text = '```\n{"foo":42}\n```';
    expect(extractJSON(text)).toEqual({ foo: 42 });
  });

  it("extracts JSON array from code block", () => {
    const text = '```json\n[1,2,3]\n```';
    expect(extractJSON(text)).toEqual([1, 2, 3]);
  });

  // ---------- Raw JSON ----------

  it("extracts raw JSON object from text", () => {
    const text = 'Here is the result: {"distilled":"test","emotions":["joy"],"intensity":0.8}';
    const result = extractJSON<{ distilled: string; emotions: string[]; intensity: number }>(text);
    expect(result).toEqual({
      distilled: "test",
      emotions: ["joy"],
      intensity: 0.8,
    });
  });

  it("extracts raw JSON array from text", () => {
    const text = 'Result: [{"a":1},{"b":2}]';
    expect(extractJSON(text)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("handles JSON with trailing text by brace matching", () => {
    const text = '{"key":"value"} some trailing garbage that breaks JSON.parse';
    expect(extractJSON(text)).toEqual({ key: "value" });
  });

  it("handles nested JSON objects", () => {
    const text = '{"outer":{"inner":"value"}}';
    expect(extractJSON(text)).toEqual({ outer: { inner: "value" } });
  });

  // ---------- Edge cases ----------

  it("returns null for plain text with no JSON", () => {
    expect(extractJSON("Hello world, no JSON here")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractJSON("")).toBeNull();
  });

  it("returns null for invalid JSON in code block", () => {
    const text = '```json\n{invalid json}\n```';
    expect(extractJSON(text)).toBeNull();
  });

  it("prefers code block over raw JSON", () => {
    const text = '{"raw":"first"}\n```json\n{"block":"second"}\n```';
    expect(extractJSON(text)).toEqual({ block: "second" });
  });

  it("handles whitespace around JSON in code block", () => {
    const text = '```json\n  {"key": "value"}  \n```';
    expect(extractJSON(text)).toEqual({ key: "value" });
  });

  // ---------- LLM-typical responses ----------

  it("extracts imagination-style response", () => {
    const text = `Sure, here you go:
\`\`\`json
{"action":"뭘 봐...!","emotion":"joy","scenario":"user is idle"}
\`\`\``;
    const result = extractJSON<{ action: string; emotion: string; scenario: string }>(text);
    expect(result).toEqual({
      action: "뭘 봐...!",
      emotion: "joy",
      scenario: "user is idle",
    });
  });

  it("extracts belief extraction response", () => {
    const text = '{"beliefs":[{"statement":"나는 츤데레다","confidence":0.9,"memoryIds":["m1"]}]}';
    const result = extractJSON<{ beliefs: { statement: string; confidence: number; memoryIds: string[] }[] }>(text);
    expect(result?.beliefs).toHaveLength(1);
    expect(result?.beliefs[0].statement).toBe("나는 츤데레다");
  });
});
