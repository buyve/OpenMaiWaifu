import { describe, it, expect } from "vitest";
import { detectConversationSignal } from "../conversationSignals";

describe("detectConversationSignal", () => {
  // ---------- Pin signals ----------

  it("detects Korean pin signal: 기억해", () => {
    expect(detectConversationSignal("이거 기억해")).toBe("pin");
  });

  it("detects Korean pin signal: 잊지마", () => {
    expect(detectConversationSignal("잊지마줘")).toBe("pin");
  });

  it("detects Korean pin signal: 외워", () => {
    expect(detectConversationSignal("이거 외워줘")).toBe("pin");
  });

  it("detects English pin signal: remember this", () => {
    expect(detectConversationSignal("please remember this")).toBe("pin");
  });

  it("detects English pin signal: don't forget", () => {
    expect(detectConversationSignal("don't forget about it")).toBe("pin");
  });

  it("detects English pin signal: keep this in mind", () => {
    expect(detectConversationSignal("keep this in mind for later")).toBe("pin");
  });

  // ---------- Forget signals ----------

  it("detects Korean forget signal: 잊어", () => {
    expect(detectConversationSignal("방금 거 잊어")).toBe("forget");
  });

  it("detects Korean forget signal: 됐어", () => {
    expect(detectConversationSignal("됐어 됐어")).toBe("forget");
  });

  it("detects Korean forget signal: 잊어버려", () => {
    expect(detectConversationSignal("그거 잊어버려")).toBe("forget");
  });

  it("detects Korean forget signal: 없던걸로", () => {
    expect(detectConversationSignal("없던걸로 해")).toBe("forget");
  });

  it("detects English forget signal: forget it", () => {
    expect(detectConversationSignal("just forget it")).toBe("forget");
  });

  it("detects English forget signal: never mind", () => {
    expect(detectConversationSignal("never mind that")).toBe("forget");
  });

  it("detects English forget signal: nevermind", () => {
    expect(detectConversationSignal("oh nevermind")).toBe("forget");
  });

  // ---------- No signal ----------

  it("returns null for neutral text", () => {
    expect(detectConversationSignal("오늘 날씨 어때?")).toBeNull();
  });

  it("returns null for empty text", () => {
    expect(detectConversationSignal("")).toBeNull();
  });

  it("returns null for unrelated English text", () => {
    expect(detectConversationSignal("What's for lunch today?")).toBeNull();
  });

  // ---------- Case insensitivity ----------

  it("is case-insensitive for English keywords", () => {
    expect(detectConversationSignal("REMEMBER THIS")).toBe("pin");
    expect(detectConversationSignal("Forget It")).toBe("forget");
  });
});
