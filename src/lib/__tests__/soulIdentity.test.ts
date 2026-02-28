import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  classifyMotionPersonality,
  SoulManager,
  DEFAULT_SOUL,
} from "../soulIdentity";

// Mock localStorage
const mockStorage: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => mockStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    mockStorage[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete mockStorage[key];
  }),
  clear: vi.fn(() => {
    for (const key in mockStorage) delete mockStorage[key];
  }),
  get length() {
    return Object.keys(mockStorage).length;
  },
  key: vi.fn((i: number) => Object.keys(mockStorage)[i] ?? null),
};
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });

describe("classifyMotionPersonality", () => {
  it("returns 'cool' for tsundere text", () => {
    expect(classifyMotionPersonality("츤데레 성격의 캐릭터")).toBe("cool");
  });

  it("returns 'cool' for English tsundere keyword", () => {
    expect(classifyMotionPersonality("tsundere and cold personality")).toBe("cool");
  });

  it("returns 'shy' for introverted text", () => {
    expect(classifyMotionPersonality("수줍고 내성적인 아이")).toBe("shy");
  });

  it("returns 'energetic' for lively text", () => {
    expect(classifyMotionPersonality("활발하고 밝은 성격")).toBe("energetic");
  });

  it("returns 'powerful' for strong text", () => {
    expect(classifyMotionPersonality("강한 카리스마의 리더")).toBe("powerful");
  });

  it("returns 'ladylike' for elegant text", () => {
    expect(classifyMotionPersonality("우아하고 세련된 품위")).toBe("ladylike");
  });

  it("returns 'gentleman' for polite text", () => {
    expect(classifyMotionPersonality("신사적이고 젠틀한 존재")).toBe("gentleman");
  });

  it("returns 'flamboyant' for dramatic text", () => {
    expect(classifyMotionPersonality("화려하고 극적인 성격")).toBe("flamboyant");
  });

  it("returns 'standard' for normal text", () => {
    expect(classifyMotionPersonality("평범한 일반적인 캐릭터")).toBe("standard");
  });

  it("returns 'innocent' as fallback for unmatched text", () => {
    expect(classifyMotionPersonality("랜덤한 텍스트")).toBe("innocent");
  });

  it("returns 'innocent' for empty text", () => {
    expect(classifyMotionPersonality("")).toBe("innocent");
  });

  it("picks highest scoring type when multiple match", () => {
    // "시크" -> cool(1), "활발" -> energetic(1), but "밝은" -> energetic(2)
    expect(classifyMotionPersonality("시크하지만 활발하고 밝은")).toBe("energetic");
  });

  it("is case-insensitive for English keywords", () => {
    expect(classifyMotionPersonality("TSUNDERE Cool")).toBe("cool");
  });
});

describe("SoulManager", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it("starts with DEFAULT_SOUL when no saved data", () => {
    const sm = new SoulManager();
    expect(sm.getSoul()).toBe(DEFAULT_SOUL);
  });

  it("loads saved soul from localStorage", () => {
    mockStorage["companion_soul_identity"] = "custom soul text";
    const sm = new SoulManager();
    expect(sm.getSoul()).toBe("custom soul text");
  });

  it("setSoul updates and persists", () => {
    const sm = new SoulManager();
    sm.setSoul("new soul");
    expect(sm.getSoul()).toBe("new soul");
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "companion_soul_identity",
      "new soul",
    );
  });

  it("reset restores DEFAULT_SOUL", () => {
    const sm = new SoulManager();
    sm.setSoul("temporary");
    sm.reset();
    expect(sm.getSoul()).toBe(DEFAULT_SOUL);
  });

  it("getMotionPersonality classifies from soul text", () => {
    const sm = new SoulManager();
    // Default soul contains "tsundere" -> should be "cool"
    expect(sm.getMotionPersonality()).toBe("cool");
  });

  it("getMotionPersonality updates after setSoul", () => {
    const sm = new SoulManager();
    sm.setSoul("수줍고 내성적인 캐릭터");
    expect(sm.getMotionPersonality()).toBe("shy");
  });
});
