import { useEffect, useRef, useCallback, type MutableRefObject } from "react";
import * as THREE from "three";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { log } from "../lib/logger.ts";
import { HIT_TEST_DEBUG_INTERVAL } from "../lib/constants.ts";

// ---------- Types ----------

interface MouseMovePayload {
  x: number;
  y: number;
}

export interface UseHitTestOptions {
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  getHitTestTargets: () => THREE.Mesh[];
  onHitTestChange?: (isOver: boolean) => void;
  /** When true, the window stays interactive regardless of hit test results. */
  forceInteractive?: boolean;
}

export interface UseHitTestReturn {
  /** Call once per frame to run the raycaster and toggle click-through. */
  performHitTest: () => void;
  /** Current mouse position in screen coordinates. */
  mousePositionRef: MutableRefObject<{ x: number; y: number }>;
}

// ---------- Hook ----------

/**
 * Tracks the mouse position (via Tauri events from the Rust backend)
 * and performs per-frame raycasting to determine whether the cursor is over
 * a character mesh. Toggles Tauri's `setIgnoreCursorEvents` accordingly.
 *
 * The Rust backend already converts absolute screen coordinates to
 * **window-relative** logical pixels, so we use them directly for NDC conversion.
 */
export function useHitTest({
  cameraRef,
  getHitTestTargets,
  onHitTestChange,
  forceInteractive = false,
}: UseHitTestOptions): UseHitTestReturn {
  const mousePositionRef = useRef<{ x: number; y: number }>({ x: -1, y: -1 });
  const prevIsOverRef = useRef<boolean | null>(null);
  const hitTestCallbackRef = useRef(onHitTestChange);
  hitTestCallbackRef.current = onHitTestChange;

  // Reusable raycaster objects (avoid per-frame allocations)
  const raycasterRef = useRef(new THREE.Raycaster());
  const ndcPointerRef = useRef(new THREE.Vector2());

  // Debug: log coordinate info periodically
  const debugCountRef = useRef(0);

  // Track forceInteractive via ref so the callback doesn't re-create on toggle
  const forceInteractiveRef = useRef(forceInteractive);
  forceInteractiveRef.current = forceInteractive;

  const performHitTest = useCallback(() => {
    // When a panel (chat/settings/memory) is open, force the window to be
    // interactive so the user can click and type in the panel.
    if (forceInteractiveRef.current) {
      if (prevIsOverRef.current !== true) {
        prevIsOverRef.current = true;
        hitTestCallbackRef.current?.(true);
        const appWindow = getCurrentWindow();
        appWindow.setIgnoreCursorEvents(false).catch(() => {});
      }
      return;
    }

    const { x, y } = mousePositionRef.current;
    if (x < 0 || y < 0) return;

    const camera = cameraRef.current;
    if (!camera) return;

    // Coordinates are already window-relative (converted by Rust backend).
    // Skip if outside window bounds.
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
      if (prevIsOverRef.current !== false) {
        prevIsOverRef.current = false;
        hitTestCallbackRef.current?.(false);
        const appWindow = getCurrentWindow();
        appWindow.setIgnoreCursorEvents(true).catch(() => {});
      }
      return;
    }

    const ndc = ndcPointerRef.current;
    ndc.x = (x / window.innerWidth) * 2 - 1;
    ndc.y = -(y / window.innerHeight) * 2 + 1;

    raycasterRef.current.setFromCamera(ndc, camera);

    const targets = getHitTestTargets();
    const intersections = raycasterRef.current.intersectObjects(targets, false);

    // Also check if the cursor is over any DOM element marked as a hit target.
    const hitEls = document.querySelectorAll<HTMLElement>("[data-hit-target]");
    let isOverUI = false;
    for (const el of hitEls) {
      const rect = el.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        isOverUI = true;
        break;
      }
    }

    const isOver = intersections.length > 0 || isOverUI;

    // Periodic debug logging (every ~120 frames ≈ 2 seconds)
    debugCountRef.current++;
    if (debugCountRef.current % HIT_TEST_DEBUG_INTERVAL === 0) {
      log.debug(
        `[HitTest:debug] pos(${x},${y}) ndc(${ndc.x.toFixed(2)},${ndc.y.toFixed(2)})` +
        ` viewport(${window.innerWidth}x${window.innerHeight})` +
        ` targets=${targets.length} hit=${isOver}`,
      );
    }

    // Only fire when state changes
    if (prevIsOverRef.current === isOver) return;
    prevIsOverRef.current = isOver;

    hitTestCallbackRef.current?.(isOver);

    log.info(
      `[HitTest] ${isOver ? "OVER character -> interactive" : "NOT over character -> pass-through"}` +
      ` | pos(${x},${y}) ndc(${ndc.x.toFixed(2)},${ndc.y.toFixed(2)})` +
      ` | targets=${targets.length}`,
    );

    const appWindow = getCurrentWindow();
    appWindow.setIgnoreCursorEvents(!isOver).catch((err) => {
      log.warn("[HitTest] setIgnoreCursorEvents unavailable:", err);
    });
  }, [cameraRef, getHitTestTargets]);

  // Listen for mouse-move events from Rust backend
  useEffect(() => {
    let cancelled = false;
    const unlisteners: (() => void)[] = [];

    const setup = async () => {
      const unlisten = await listen<MouseMovePayload>("mouse-move", (event) => {
        mousePositionRef.current = event.payload;
      });
      if (cancelled) {
        unlisten();
      } else {
        unlisteners.push(unlisten);
      }
    };
    setup().catch((err) => {
      log.warn("[HitTest] Failed to set up mouse-move listener:", err);
    });

    return () => {
      cancelled = true;
      for (const u of unlisteners) u();
    };
  }, []);

  return { performHitTest, mousePositionRef };
}
