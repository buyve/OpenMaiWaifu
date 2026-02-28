import { useEffect, useRef, useCallback, type MutableRefObject, type RefObject } from "react";
import * as THREE from "three";
import {
  CAMERA_FOV,
  CAMERA_BASE_DISTANCE,
  CAMERA_LOOKAT_Y,
  CAMERA_REFERENCE_HEIGHT,
  CAMERA_NEAR,
  CAMERA_FAR,
  RENDERER_MAX_PIXEL_RATIO,
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_SPEED,
  FPS_ACTIVE,
  FPS_BLURRED,
  FPS_HIDDEN,
  AMBIENT_LIGHT_INTENSITY,
  DIRECTIONAL_LIGHT_INTENSITY,
} from "../lib/constants.ts";
import { log } from "../lib/logger.ts";

// ---------- Types ----------

export interface UseThreeSceneOptions {
  containerRef: RefObject<HTMLDivElement | null>;
  vrmScene: THREE.Group | null;
  vrmError: string | null;
  /** Called each frame with delta time. Set `.current` before mount. */
  onFrame: MutableRefObject<((delta: number) => void) | null>;
}

export interface UseThreeSceneReturn {
  sceneRef: MutableRefObject<THREE.Scene | null>;
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  characterRootRef: MutableRefObject<THREE.Object3D | null>;
  /** Returns the hitbox mesh(es) for raycasting. */
  getHitTestTargets: () => THREE.Mesh[];
}

// ---------- Fallback Character ----------

function createFallbackCharacter(): THREE.Group {
  const group = new THREE.Group();
  group.name = "FallbackCharacter";

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x6a5acd });
  const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffdab9 });

  const bodyGeometry = new THREE.CapsuleGeometry(0.25, 0.8, 8, 16);
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.set(0, 0.9, 0);
  group.add(body);

  const headGeometry = new THREE.SphereGeometry(0.18, 16, 16);
  const head = new THREE.Mesh(headGeometry, headMaterial);
  head.position.set(0, 1.55, 0);
  group.add(head);

  const armGeometry = new THREE.CylinderGeometry(0.06, 0.06, 0.55, 8);

  const leftArm = new THREE.Mesh(armGeometry, bodyMaterial);
  leftArm.position.set(-0.35, 1.05, 0);
  leftArm.rotation.z = Math.PI / 6;
  group.add(leftArm);

  const rightArm = new THREE.Mesh(armGeometry, bodyMaterial);
  rightArm.position.set(0.35, 1.05, 0);
  rightArm.rotation.z = -Math.PI / 6;
  group.add(rightArm);

  const legGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.65, 8);

  const leftLeg = new THREE.Mesh(legGeometry, bodyMaterial);
  leftLeg.position.set(-0.12, 0.32, 0);
  group.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeometry, bodyMaterial);
  rightLeg.position.set(0.12, 0.32, 0);
  group.add(rightLeg);

  return group;
}

// ---------- Hook ----------

/**
 * Manages the core Three.js lifecycle: scene, camera, renderer, lighting,
 * resize handling, WebGL context loss recovery, FPS throttling, and the
 * animation loop.
 *
 * The `onFrame` callback ref is invoked each frame with the delta time,
 * allowing the parent component to drive per-frame updates (VRM, emotion,
 * motion, drag, hit-test) without coupling those concerns here.
 */
export function useThreeScene({
  containerRef,
  vrmScene,
  vrmError,
  onFrame,
}: UseThreeSceneOptions): UseThreeSceneReturn {
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const characterRootRef = useRef<THREE.Object3D | null>(null);

  // Invisible hitbox mesh for reliable raycasting (SkinnedMesh bind-pose
  // raycasting is unreliable when bones are animated away from T-pose).
  const hitboxRef = useRef<THREE.Mesh | null>(null);

  const getHitTestTargets = useCallback((): THREE.Mesh[] => {
    return hitboxRef.current ? [hitboxRef.current] : [];
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ---- Scene, Camera, Renderer ----

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      CAMERA_FOV,
      window.innerWidth / window.innerHeight,
      CAMERA_NEAR,
      CAMERA_FAR,
    );
    // Scale camera distance based on window height so the character
    // occupies a consistent proportion of the screen across resolutions.
    // Reference: at 1080px height, distance = 3.0 (character ~40% of screen).
    const computeBaseZ = () => CAMERA_BASE_DISTANCE * (window.innerHeight / CAMERA_REFERENCE_HEIGHT);
    let userZoomOffset = 0; // tracks user zoom delta from auto-computed base
    const initialZ = computeBaseZ();
    camera.position.set(0, CAMERA_LOOKAT_Y, Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, initialZ)));
    camera.lookAt(0, CAMERA_LOOKAT_Y, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDERER_MAX_PIXEL_RATIO));
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    // ---- WebGL context loss ----

    let animationFrameId: number;

    renderer.domElement.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      cancelAnimationFrame(animationFrameId);
      log.error("[WebGL] Context lost");
    });
    renderer.domElement.addEventListener("webglcontextrestored", () => {
      log.info("[WebGL] Context restored");
      animationFrameId = requestAnimationFrame(animate);
    });

    // ---- Lighting ----

    const ambientLight = new THREE.AmbientLight(0xffffff, AMBIENT_LIGHT_INTENSITY);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, DIRECTIONAL_LIGHT_INTENSITY);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // ---- VRM / Fallback ----

    if (vrmScene) {
      // VRM models face -Z by default (glTF convention).
      // Rotate 180° around Y so the character faces the camera at +Z.
      vrmScene.rotation.y = Math.PI;
      scene.add(vrmScene);
      characterRootRef.current = vrmScene;

      // Create an invisible hitbox mesh sized to the VRM model's actual bounding box.
      const bbox = new THREE.Box3().setFromObject(vrmScene);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      bbox.getSize(size);
      bbox.getCenter(center);

      // Shrink hitbox slightly so edges don't over-trigger
      const hitboxGeo = new THREE.BoxGeometry(
        size.x * 0.8,
        size.y * 0.95,
        size.z * 0.8,
      );
      const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitbox = new THREE.Mesh(hitboxGeo, hitboxMat);
      // Position relative to character root (bbox center is in world space)
      hitbox.position.set(
        center.x - vrmScene.position.x,
        center.y - vrmScene.position.y,
        center.z - vrmScene.position.z,
      );
      hitbox.name = "CharacterHitbox";
      vrmScene.add(hitbox);
      hitboxRef.current = hitbox;

      log.info("[useThreeScene] VRM model + hitbox added to scene.");
    } else if (vrmError) {
      const fallback = createFallbackCharacter();
      fallback.traverse((obj) => {
        obj.frustumCulled = false;
      });
      scene.add(fallback);
      characterRootRef.current = fallback;
      log.info("[useThreeScene] Fallback character added to scene.");
    }

    // ---- FPS throttling ----

    let targetFps = FPS_ACTIVE;

    function handleVisibilityChange() {
      targetFps = document.hidden ? FPS_HIDDEN : FPS_ACTIVE;
    }
    function handleWindowBlur() {
      if (!document.hidden) targetFps = FPS_BLURRED;
    }
    function handleWindowFocus() {
      targetFps = FPS_ACTIVE;
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);

    // ---- Scroll zoom ----

    function handleWheel(e: WheelEvent) {
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1 : -1; // scroll down = zoom out
      userZoomOffset += dir * ZOOM_SPEED;
      const targetZ = computeBaseZ() + userZoomOffset;
      camera.position.z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, targetZ));
    }

    renderer.domElement.addEventListener("wheel", handleWheel, {
      passive: false,
    });

    // ---- Resize ----

    function handleResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      // Re-scale camera distance, preserving user's zoom offset
      const newZ = computeBaseZ() + userZoomOffset;
      camera.position.z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZ));
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }

    window.addEventListener("resize", handleResize);

    // ---- Animation loop ----

    const clock = new THREE.Clock();
    let lastFrameTime = 0;

    function animate(now: number) {
      animationFrameId = requestAnimationFrame(animate);

      const frameInterval = 1000 / targetFps;
      if (now - lastFrameTime < frameInterval) return;
      lastFrameTime = now;

      const delta = clock.getDelta();

      // Delegate all per-frame updates to the parent component
      onFrame.current?.(delta);

      renderer.render(scene, camera);
    }

    animationFrameId = requestAnimationFrame(animate);

    // ---- Cleanup ----

    return () => {
      cancelAnimationFrame(animationFrameId);

      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("resize", handleResize);
      renderer.domElement.removeEventListener("wheel", handleWheel);

      if (vrmScene) scene.remove(vrmScene);
      hitboxRef.current = null;

      renderer.dispose();
      renderer.domElement.remove();

      // Dispose geometry and textures
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.geometry?.dispose();
          const materials = Array.isArray(mesh.material)
            ? mesh.material
            : mesh.material
              ? [mesh.material]
              : [];
          for (const m of materials) {
            const mat = m as THREE.MeshStandardMaterial;
            mat.map?.dispose();
            mat.normalMap?.dispose();
            mat.roughnessMap?.dispose();
            mat.metalnessMap?.dispose();
            mat.emissiveMap?.dispose();
            mat.aoMap?.dispose();
            mat.dispose();
          }
        }
      });

      sceneRef.current = null;
      cameraRef.current = null;
    };
  }, [containerRef, vrmScene, vrmError, onFrame]);

  return { sceneRef, cameraRef, characterRootRef, getHitTestTargets };
}
