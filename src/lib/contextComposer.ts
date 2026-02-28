import type { SoulManager } from "./soulIdentity";
import type { MemoryManager } from "./memoryManager";
import type { SenseOfSelfManager } from "./senseOfSelf";
import type { IslandManager } from "./personalityIslands";

/**
 * Compose SOUL identity + relevant memories + personality islands + sense of
 * self into a single context string that is prepended to the user's message
 * before sending to OpenClaw.
 */
export async function composeContext(
  soulManager: SoulManager,
  memoryManager: MemoryManager,
  senseOfSelf?: SenseOfSelfManager,
  islandManager?: IslandManager,
): Promise<string> {
  const parts: string[] = [];

  const soul = soulManager.getSoul();
  if (soul) {
    parts.push(`[SYSTEM]\n${soul}`);
  }

  const memories = await memoryManager.getContextForChat();
  if (memories) {
    parts.push(`[MEMORY CONTEXT]\n${memories}`);
  }

  if (islandManager) {
    const islandContext = islandManager.getContextForChat();
    if (islandContext) {
      parts.push(islandContext);
    }
  }

  if (senseOfSelf) {
    const selfContext = senseOfSelf.getContextForChat();
    if (selfContext) {
      parts.push(selfContext);
    }
  }

  return parts.join("\n\n");
}
