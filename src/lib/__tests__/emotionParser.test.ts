import { describe, it, expect } from "vitest";
import { parseResponse } from "../emotionParser";

describe("emotionParser", () => {
  describe("parseResponse", () => {
    // Test 1: Extracts emotion and motion tags correctly
    it("extracts [emotion:happy] and [motion:wave] tags", () => {
      const result = parseResponse(
        "[emotion:happy][motion:wave] 오랜만이다!",
      );
      expect(result.emotion).toBe("happy");
      expect(result.motion).toBe("wave");
      expect(result.text).toBe("오랜만이다!");
    });

    // Test 2: Handles empty string
    it("handles empty string input", () => {
      const result = parseResponse("");
      expect(result.text).toBe("");
      expect(result.emotion).toBe("neutral");
      expect(result.motion).toBeNull();
    });

    // Test 2 continued: Handles no tags, invalid tags, multiple tags
    it("handles text with no tags", () => {
      const result = parseResponse("그냥 평범한 대화야");
      expect(result.text).toBe("그냥 평범한 대화야");
      expect(result.emotion).toBe("neutral");
      expect(result.motion).toBeNull();
    });

    it("ignores invalid emotion values", () => {
      const result = parseResponse("[emotion:INVALID] test");
      expect(result.emotion).toBe("neutral"); // falls back to inference
      expect(result.text).toBe("test");
    });

    it("ignores invalid motion values", () => {
      const result = parseResponse("[emotion:happy][motion:dance] test");
      expect(result.emotion).toBe("happy");
      expect(result.motion).toBeNull(); // 'dance' is not valid
    });

    it("uses first valid tag when multiple are present", () => {
      const result = parseResponse(
        "[emotion:sad][emotion:happy] 복잡한 감정",
      );
      expect(result.emotion).toBe("sad"); // first valid one
    });

    it("handles tags case-insensitively", () => {
      const result = parseResponse("[Emotion:HAPPY][Motion:WAVE] hi");
      expect(result.emotion).toBe("happy");
      expect(result.motion).toBe("wave");
    });

    it("strips tags and collapses extra whitespace", () => {
      const result = parseResponse(
        "[emotion:happy]  hello  [motion:nod]  world",
      );
      expect(result.text).toBe("hello world");
    });

    // Sentiment inference tests
    it("infers happy from Korean keywords", () => {
      const result = parseResponse("하하 재밌다!");
      expect(result.emotion).toBe("happy");
    });

    it("infers sad from Korean keywords", () => {
      const result = parseResponse("너무 슬프다...");
      expect(result.emotion).toBe("sad");
    });

    it("infers angry from Korean keywords", () => {
      const result = parseResponse("진짜 짜증나");
      expect(result.emotion).toBe("angry");
    });

    it("infers surprised from Korean keywords", () => {
      const result = parseResponse("대박! 진짜?");
      expect(result.emotion).toBe("surprised");
    });

    it("defaults to neutral when no keywords match", () => {
      const result = parseResponse("내일 회의 있어");
      expect(result.emotion).toBe("neutral");
    });

    // All supported emotions
    it("supports all 7 emotion values", () => {
      const emotions = [
        "happy",
        "sad",
        "angry",
        "surprised",
        "neutral",
        "relaxed",
        "thinking",
      ];
      for (const e of emotions) {
        const result = parseResponse(`[emotion:${e}] test`);
        expect(result.emotion).toBe(e);
      }
    });

    // All supported motions
    it("supports all 4 motion values", () => {
      const motions = ["wave", "nod", "shake", "idle"];
      for (const m of motions) {
        const result = parseResponse(`[motion:${m}] test`);
        expect(result.motion).toBe(m);
      }
    });
  });
});
