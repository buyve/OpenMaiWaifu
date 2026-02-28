import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

// ---------- Types ----------

export interface CharacterPosition {
  x: number;
  y: number;
}

export interface UseDragReturn {
  /** Whether the character is currently being dragged. */
  isDragging: boolean;
  /** Current character position in world coordinates. */
  characterPosition: CharacterPosition;
  /** Must be called every frame to check for drag state changes. */
  update: () => void;
}

// ---------- Constants ----------

const STORAGE_KEY = "companion_character_position";
const DEFAULT_POSITION: CharacterPosition = { x: 0, y: 0 };

// ---------- Helpers ----------

function loadSavedPosition(): CharacterPosition {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as CharacterPosition;
      if (typeof parsed.x === "number" && typeof parsed.y === "number") {
        return parsed;
      }
    }
  } catch {
    // Ignore parse errors
  }
  return { ...DEFAULT_POSITION };
}

function savePosition(pos: CharacterPosition): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
  } catch {
    // Ignore storage errors
  }
}

// ---------- Hook ----------

/**
 * Provides drag-to-move functionality for the VRM character.
 *
 * @param characterRoot - The THREE.Group or Object3D that is the character's scene root.
 * @param camera - The THREE.Camera used for screen-to-world coordinate conversion.
 */
export function useDrag(
  characterRoot: THREE.Object3D | null,
  camera: THREE.Camera | null,
): UseDragReturn {
  const [isDragging, setIsDragging] = useState(false);
  const [characterPosition, setCharacterPosition] =
    useState<CharacterPosition>(loadSavedPosition);

  // Internal refs for the drag loop
  const isDraggingRef = useRef(false);
  const dragStartMouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const characterRootRef = useRef(characterRoot);
  const cameraRef = useRef(camera);

  // Keep refs in sync
  characterRootRef.current = characterRoot;
  cameraRef.current = camera;

  // Apply saved position to character on mount / when character changes
  useEffect(() => {
    if (characterRoot) {
      const pos = loadSavedPosition();
      characterRoot.position.x = pos.x;
      // Only apply x-axis offset; y stays at model origin for grounding
      setCharacterPosition(pos);
    }
  }, [characterRoot]);

  // Mouse event handlers
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      // Only initiate drag on left button while over character
      // The Tauri hit-test system ensures mousedown only fires when over the character
      if (e.button !== 0) return;

      const root = characterRootRef.current;
      const cam = cameraRef.current;
      if (!root || !cam) return;

      // Raycasting to confirm the click is on the character
      const raycaster = new THREE.Raycaster();
      const ndcPointer = new THREE.Vector2(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1,
      );
      raycaster.setFromCamera(ndcPointer, cam);

      const meshes: THREE.Mesh[] = [];
      root.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) meshes.push(obj as THREE.Mesh);
      });

      const hits = raycaster.intersectObjects(meshes, false);
      if (hits.length === 0) return;

      isDraggingRef.current = true;
      setIsDragging(true);
      dragStartMouseRef.current = { x: e.clientX, y: e.clientY };
      dragStartPosRef.current = {
        x: root.position.x,
        y: root.position.y,
      };

      e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;

      const root = characterRootRef.current;
      const cam = cameraRef.current;
      if (!root || !cam) return;

      // Convert mouse delta to world-space delta
      // Use camera properties to calculate world units per pixel
      const distance = cam.position.z; // Distance from camera to character plane
      let worldUnitsPerPixelX: number;
      let worldUnitsPerPixelY: number;

      if (cam instanceof THREE.PerspectiveCamera) {
        const vFov = (cam.fov * Math.PI) / 180;
        const heightAtPlane = 2 * Math.tan(vFov / 2) * distance;
        const widthAtPlane = heightAtPlane * cam.aspect;
        worldUnitsPerPixelX = widthAtPlane / window.innerWidth;
        worldUnitsPerPixelY = heightAtPlane / window.innerHeight;
      } else {
        // Orthographic fallback
        worldUnitsPerPixelX = 1 / window.innerWidth;
        worldUnitsPerPixelY = 1 / window.innerHeight;
      }

      const dx = e.clientX - dragStartMouseRef.current.x;
      const dy = e.clientY - dragStartMouseRef.current.y;

      const newX = dragStartPosRef.current.x + dx * worldUnitsPerPixelX;
      const newY = dragStartPosRef.current.y - dy * worldUnitsPerPixelY; // Invert Y

      root.position.x = newX;
      root.position.y = newY;

      setCharacterPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      if (!isDraggingRef.current) return;

      isDraggingRef.current = false;
      setIsDragging(false);

      const root = characterRootRef.current;
      if (root) {
        const pos = { x: root.position.x, y: root.position.y };
        savePosition(pos);
        setCharacterPosition(pos);
      }
    };

    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  // Update is a no-op for now but kept for API consistency with other hooks
  const update = useCallback(() => {
    // Reserved for future per-frame drag logic (e.g., inertia, snapping)
  }, []);

  return {
    isDragging,
    characterPosition,
    update,
  };
}
