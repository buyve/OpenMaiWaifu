import { useEffect, useRef, useCallback, type MutableRefObject } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import * as THREE from "three";
import { useVRM } from "../hooks/useVRM.ts";
import { useEmotion } from "../hooks/useEmotion.ts";
import { useMotion } from "../hooks/useMotion.ts";
import type { MotionPersonality } from "../lib/soulIdentity.ts";
import { useDrag } from "../hooks/useDrag.ts";
import { useTouchReaction } from "../hooks/useTouchReaction.ts";
import { useThreeScene } from "../hooks/useThreeScene.ts";
import { useHitTest } from "../hooks/useHitTest.ts";
import { usePetTick } from "../hooks/usePetTick.ts";
import { useCharacterInteraction } from "../hooks/useCharacterInteraction.ts";
import { useTauriListeners } from "../hooks/useTauriListeners.ts";
import { invoke } from "@tauri-apps/api/core";
import { PetBehavior } from "../lib/petBehavior.ts";
import type { PetAction, WindowInfo, ScreenSize } from "../lib/petBehavior.ts";
import { PlatformPhysics } from "../lib/platformPhysics.ts";
import { MouseTracker } from "../lib/mouseTracking.ts";
import { DragSway } from "../lib/dragSway.ts";
import { SpringBoneGravity } from "../lib/springBoneGravity.ts";
import { HeadpatDetector } from "../lib/headpatDetector.ts";
import { HandReach } from "../lib/handReach.ts";
import { ParticleSystem } from "../lib/particleSystem.ts";
import {
  CAMERA_FOV,
  FACING_ROTATION_LERP,
  CLAMP_MARGIN_X,
  CLAMP_MARGIN_TOP,
  CLAMP_MARGIN_BOTTOM,
  HEAD_PROJECTION_OFFSET_Y,
  HEAD_FALLBACK_HEIGHT,
  PHYSICS_ENABLED,
} from "../lib/constants.ts";
import { log } from "../lib/logger.ts";

// Reusable vector for head projection (avoids GC)
const _headProjectionVec = new THREE.Vector3();

// ---------- Types ----------

/** Dock information returned from Tauri backend. */
interface DockInfo {
  height: number;
  position: string;
  is_hidden: boolean;
}

interface VRMViewerProps {
  onHitTestChange?: (isOver: boolean) => void;
  onEmotionSetterReady?: (setter: (emotion: string) => void) => void;
  onMotionSetterReady?: (setter: (motion: string) => void) => void;
  /** Exposes the loadVRM function so parent can trigger model loading. */
  onLoadVRMReady?: (loadFn: (source: string | File) => void) => void;
  /** When true, window stays interactive (e.g. chat/settings panel is open). */
  forceInteractive?: boolean;
  /** Ref updated each frame with the character's head position in screen pixels. */
  characterScreenPosRef?: MutableRefObject<{ x: number; y: number }>;
  /** Callback when a VRM model is loaded (e.g. to show notification). */
  onModelLoaded?: (filename: string) => void;
  /** Callback when a VRM model fails to load. */
  onModelError?: (error: string) => void;
  /** Callback when dock height changes (for UI offset). */
  onDockHeightChange?: (height: number) => void;
  /** Motion personality type for selecting personality-specific VRMA animations. */
  personality?: MotionPersonality;
}

// ---------- Component ----------

export default function VRMViewer({
  onHitTestChange,
  onEmotionSetterReady,
  onMotionSetterReady,
  onLoadVRMReady,
  forceInteractive,
  characterScreenPosRef,
  onModelLoaded,
  onModelError,
  onDockHeightChange,
  personality,
}: VRMViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // ---- VRM loading ----

  const {
    vrm,
    scene: vrmScene,
    expressionMap,
    loadVRM,
    setLookAtTarget,
    error: vrmError,
  } = useVRM();

  // Notify parent of VRM load errors
  useEffect(() => {
    if (vrmError) {
      onModelError?.(vrmError);
    }
  }, [vrmError, onModelError]);

  // Track mouse position for eye following
  const mouseWorldPosRef = useRef(new THREE.Vector3(0, 1.0, 2.0));

  // ---- Core domain hooks ----

  const emotion = useEmotion(vrm, expressionMap);
  const motion = useMotion(vrm, personality ?? "innocent");
  const touchReaction = useTouchReaction();

  // ---- Stable refs for per-frame and callback access ----

  const emotionSetRef = useRef(emotion.setEmotion);
  emotionSetRef.current = emotion.setEmotion;
  const motionPlayRef = useRef(motion.playAnimation);
  motionPlayRef.current = motion.playAnimation;
  const touchHandleRef = useRef(touchReaction.handleTouch);
  touchHandleRef.current = touchReaction.handleTouch;

  const emotionUpdateRef = useRef(emotion.update);
  emotionUpdateRef.current = emotion.update;
  const motionUpdateRef = useRef(motion.update);
  motionUpdateRef.current = motion.update;

  // ---- Mouse tracking for eye follow ----

  const setLookAtTargetRef = useRef(setLookAtTarget);
  setLookAtTargetRef.current = setLookAtTarget;

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const cam = cameraRef.current;
      if (!cam) return;

      // Convert screen mouse position to world-space point on a plane at z=1
      const ndcX = (e.clientX / window.innerWidth) * 2 - 1;
      const ndcY = -(e.clientY / window.innerHeight) * 2 + 1;

      const halfAngle = (CAMERA_FOV / 2) * (Math.PI / 180);
      const halfH = Math.tan(halfAngle) * cam.position.z;
      const halfW = halfH * cam.aspect;

      mouseWorldPosRef.current.set(
        ndcX * halfW,
        cam.position.y + ndcY * halfH,
        1.0, // slightly in front of character
      );
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // ---- Pet behavior ----

  const petBehaviorRef = useRef<PetBehavior>(new PetBehavior());
  const physicsRef = useRef(new PlatformPhysics());
  const screenSizeRef = useRef<ScreenSize>({ width: 1920, height: 1080 });
  /** True after the first rebuildPlatforms completes (prevents applying (0,0) to root). */
  const platformsReadyRef = useRef(false);
  /** Track previous window IDs to detect window changes. */
  const prevWindowIdsRef = useRef<Set<number>>(new Set());
  /** Ref for onDockHeightChange callback. */
  const onDockHeightChangeRef = useRef(onDockHeightChange);
  onDockHeightChangeRef.current = onDockHeightChange;

  // ---- Mate-Engine style systems ----
  const mouseTrackerRef = useRef(new MouseTracker());
  const dragSwayRef = useRef(new DragSway());
  const springGravityRef = useRef(new SpringBoneGravity());
  const mouseScreenRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  // Track previous drag state for distressed face trigger
  const wasDraggingRef = useRef(false);
  // Headpat circular motion detector
  const headpatDetectorRef = useRef(new HeadpatDetector());
  // Hand reach IK
  const handReachRef = useRef(new HandReach());
  // Particle effects
  const particleSystemRef = useRef(new ParticleSystem());

  // Track mouse screen position for drag sway
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseScreenRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Ref for executePetActions (declared below) so it can be used in the init effect
  const executePetActionsRef = useRef<(actions: PetAction[]) => void>(() => {});

  // Initialize tracking systems when VRM loads
  useEffect(() => {
    if (vrm) {
      mouseTrackerRef.current.init(vrm);
      dragSwayRef.current.init(vrm);
      springGravityRef.current.init(vrm);

      // Initialize hand reach IK
      handReachRef.current.init(vrm);

      // Set up headpat reaction callback — plays "liked" VRMA animation
      headpatDetectorRef.current.onHeadpat = () => {
        emotionSetRef.current("happy");
        motionPlayRef.current("liked", { loop: false });
        // Emit heart particles above the head
        const headBone = vrm.humanoid?.getNormalizedBoneNode("head");
        if (headBone) {
          const pos = new THREE.Vector3();
          headBone.getWorldPosition(pos);
          particleSystemRef.current.emit("hearts", pos.x, pos.y + 0.2);
        }
        // Notify pet behavior of touch interaction
        const petActions = petBehaviorRef.current.handleInteraction("touch");
        executePetActionsRef.current(petActions);
      };
    }
    return () => {
      mouseTrackerRef.current.dispose();
      dragSwayRef.current.dispose();
      springGravityRef.current.dispose();
      headpatDetectorRef.current.dispose();
      handReachRef.current.dispose();
    };
  }, [vrm]);

  const executePetActions = useCallback((actions: PetAction[]) => {
    for (const action of actions) {
      switch (action.type) {
        case "set_position":
          // Instant snap (e.g. teleport)
          if (characterRootRef.current && action.position) {
            characterRootRef.current.position.x = action.position.x;
            characterRootRef.current.position.y = action.position.y;
            if (PHYSICS_ENABLED) {
              physicsRef.current.setPosition(action.position.x, action.position.y);
            }
          }
          break;
        case "play_animation":
          if (action.animation) motionPlayRef.current(action.animation);
          break;
        case "set_emotion":
          if (action.emotion) {
            emotionSetRef.current(
              action.emotion as Parameters<typeof emotion.setEmotion>[0],
            );
          }
          break;
        case "none":
          break;
      }
    }
  }, []);

  // Keep ref in sync for callbacks in init effect
  executePetActionsRef.current = executePetActions;

  // ---- Three.js scene (creates scene, camera, renderer, animation loop) ----

  const onFrameRef = useRef<((delta: number) => void) | null>(null);

  const { sceneRef, cameraRef, characterRootRef, getHitTestTargets } = useThreeScene({
    containerRef,
    vrmScene,
    vrmError,
    onFrame: onFrameRef,
  });

  // ---- Initialize particle system when scene is available ----

  useEffect(() => {
    const scene = sceneRef.current;
    if (scene) {
      particleSystemRef.current.init(scene);
    }
    return () => {
      particleSystemRef.current.dispose();
    };
  }, [sceneRef]);

  // ---- Platform physics rebuild interval ----

  useEffect(() => {
    if (!PHYSICS_ENABLED) return;

    const rebuild = async () => {
      try {
        // Sync camera values to petBehavior BEFORE rebuildPlatforms so that
        // screenToWorld uses the real camera geometry (not defaults).
        const cam = cameraRef.current;
        if (cam) {
          petBehaviorRef.current.updateCamera(cam.position.z, cam.aspect);
        }

        const [windows, dockInfo] = await Promise.all([
          invoke<WindowInfo[]>("get_window_list"),
          invoke<DockInfo>("get_dock_info"),
        ]);

        // Notify parent of dock height changes
        const dockHeight = dockInfo.is_hidden ? 0 : dockInfo.height;
        onDockHeightChangeRef.current?.(dockHeight);

        // Track window IDs for platform rebuild detection
        const currentIds = new Set(windows.map((w) => w.window_id));
        prevWindowIdsRef.current = currentIds;

        // Rebuild physics platforms from current windows
        const taskbarHeightPx = dockInfo.is_hidden ? 0 : dockInfo.height;
        physicsRef.current.rebuildPlatforms(
          windows,
          screenSizeRef.current,
          (sx, sy) => petBehaviorRef.current.screenToWorld(sx, sy),
          taskbarHeightPx,
        );

        // Place the character on the taskbar (dock) platform once both
        // platforms are built AND the character root exists.  We check every
        // cycle (not just when `rebuilt` is true) because the VRM model loads
        // asynchronously and may not be ready during the first rebuild.
        if (!platformsReadyRef.current && physicsRef.current.isPlatformsBuilt()) {
          const root = characterRootRef.current;
          if (root) {
            const taskbarY = physicsRef.current.getTaskbarY();
            const spawnY = taskbarY ?? root.position.y;
            physicsRef.current.setPosition(root.position.x, spawnY);
            root.position.y = spawnY;
            platformsReadyRef.current = true;
          }
        }
      } catch {
        // Ignore platform rebuild errors
      }
    };

    // Fetch screen size from monitor list FIRST, then start rebuild cycle.
    const startRebuilds = (size: ScreenSize) => {
      screenSizeRef.current = size;
      rebuild();
    };

    invoke<{ width: number; height: number; is_primary: boolean }[]>("get_all_monitors")
      .then((monitors) => {
        const primary = monitors.find((m) => m.is_primary) ?? monitors[0];
        if (primary) {
          startRebuilds({ width: primary.width, height: primary.height });
        } else {
          rebuild();
        }
      })
      .catch(() => {
        // Fallback to simpler get_screen_size
        invoke<ScreenSize>("get_screen_size")
          .then((size) => { startRebuilds(size); })
          .catch(() => { rebuild(); });
      });

    const interval = setInterval(rebuild, 100);
    return () => clearInterval(interval);
  }, []);

  // ---- Drag (needs characterRoot + camera from scene) ----

  const drag = useDrag(
    vrmScene ?? characterRootRef.current,
    cameraRef.current,
  );
  const isDraggingRef = useRef(drag.isDragging);
  isDraggingRef.current = drag.isDragging;
  const dragUpdateRef = useRef(drag.update);
  dragUpdateRef.current = drag.update;

  // ---- Hit-test (mouse tracking + raycaster + click-through toggle) ----

  const { performHitTest } = useHitTest({
    cameraRef,
    getHitTestTargets,
    onHitTestChange,
    forceInteractive,
  });
  const performHitTestRef = useRef(performHitTest);
  performHitTestRef.current = performHitTest;

  // ---- Wire the per-frame callback ----

  // Update order matters:
  // 1. physics step + direction rotation (before VRM update)
  // 2. motion (mixer writes normalized bones)
  // 3. emotion (expression setValue + breathing)
  // 4. vrm.update (copies normalized -> raw bones, runs spring physics, applies expressions)
  // 5. screen projection (after VRM update, before render)
  onFrameRef.current = (delta: number) => {
    const root = characterRootRef.current;

    // -- Drag state detection (MUST run before physics step so the physics
    //    body is updated to the drop position before the step reads it) --
    const currentlyDragging = isDraggingRef.current;
    if (currentlyDragging && !wasDraggingRef.current) {
      // Drag started -> distressed face + sweat particles
      emotionSetRef.current("distressed");
      if (root) {
        const headBone = vrm?.humanoid?.getNormalizedBoneNode("head");
        if (headBone) {
          const pos = new THREE.Vector3();
          headBone.getWorldPosition(pos);
          particleSystemRef.current.emit("sweat", pos.x + 0.15, pos.y + 0.1);
        }
      }
      if (PHYSICS_ENABLED) {
        physicsRef.current.onDragStart();
      }
      // Notify pet behavior so it clears targets
      const dragActions = petBehaviorRef.current.handleInteraction("drag");
      executePetActionsRef.current(dragActions);
    } else if (!currentlyDragging && wasDraggingRef.current) {
      // Drag ended -> return to neutral + resume physics (fall from drop point)
      emotionSetRef.current("neutral");
      if (PHYSICS_ENABLED && root) {
        const dropX = root.position.x;
        const dropY = root.position.y;
        log.info(`[Drag] Released at world (${dropX.toFixed(3)}, ${dropY.toFixed(3)})`);
        physicsRef.current.setPosition(dropX, dropY);
        physicsRef.current.onDragEnd(0, 0);
      }
      // Ensure behavior state is clean after drag release
      if (petBehaviorRef.current.state.state !== "idle") {
        const resetActions = petBehaviorRef.current.handleInteraction("drag");
        executePetActionsRef.current(resetActions);
      }
    }
    wasDraggingRef.current = currentlyDragging;

    // -- Movement: physics-driven --
    if (root) {
      if (PHYSICS_ENABLED) {
        // --- Physics-driven movement ---
        const physics = physicsRef.current;

        if (!isDraggingRef.current) {
          // Step physics simulation
          physics.step(delta);

          // Apply physics body position to scene.
          // Skip until platformsReady to avoid snapping to (0,0) before platforms are built.
          if (platformsReadyRef.current) {
            const body = physics.getBody();
            root.position.x = body.x;
            root.position.y = body.y;
          }
        }

        // Face movement direction based on physics velocity
        const body = physics.getBody();
        if (Math.abs(body.vx) > 0.01 && !isDraggingRef.current) {
          const targetRotY = body.vx > 0 ? Math.PI - 0.3 : Math.PI + 0.3;
          const lerpFactor = Math.min(1, FACING_ROTATION_LERP * delta);
          root.rotation.y += (targetRotY - root.rotation.y) * lerpFactor;
        } else if (!isDraggingRef.current) {
          const lerpFactor = Math.min(1, FACING_ROTATION_LERP * delta);
          root.rotation.y += (Math.PI - root.rotation.y) * lerpFactor;
        }
      } else {
        // --- Legacy mode (PHYSICS_ENABLED = false) ---
        // Just face forward
        const lerpFactor = Math.min(1, FACING_ROTATION_LERP * delta);
        root.rotation.y += (Math.PI - root.rotation.y) * lerpFactor;

        // -- Clamp to visible frustum --
        const cam = cameraRef.current;
        if (cam) {
          const camZ = cam.position.z;
          const halfH = Math.tan((CAMERA_FOV / 2) * (Math.PI / 180)) * camZ;
          const halfW = halfH * cam.aspect;

          const maxX = halfW - CLAMP_MARGIN_X;
          const maxY = cam.position.y + halfH - CLAMP_MARGIN_TOP;
          const minY = cam.position.y - halfH + CLAMP_MARGIN_BOTTOM;

          root.position.x = Math.max(-maxX, Math.min(maxX, root.position.x));
          root.position.y = Math.max(minY, Math.min(maxY, root.position.y));
        }
      }
    }

    // Keep PetBehavior's camera state in sync for accurate screenToWorld
    const cam = cameraRef.current;
    if (cam) {
      petBehaviorRef.current.updateCamera(cam.position.z, cam.aspect);
    }

    // Update eye tracking — make eyes follow mouse cursor with eye-lead offset
    {
      const eyeLead = mouseTrackerRef.current.getEyeLeadOffset();
      const DEG2RAD = Math.PI / 180;
      const leadX = mouseWorldPosRef.current.x + eyeLead.yaw * DEG2RAD * 0.5;
      const leadY = mouseWorldPosRef.current.y + eyeLead.pitch * DEG2RAD * 0.5;
      mouseWorldPosRef.current.set(leadX, leadY, mouseWorldPosRef.current.z);
    }
    setLookAtTargetRef.current(mouseWorldPosRef.current);

    motionUpdateRef.current(delta);
    emotionUpdateRef.current(delta);

    // ---- Mate-Engine style tracking (after animation, before vrm.update) ----
    if (vrm && cameraRef.current) {
      // Mouse tracking: head + spine follow cursor (NDC coords)
      const ndcX = (mouseScreenRef.current.x / window.innerWidth) * 2 - 1;
      const ndcY = -(mouseScreenRef.current.y / window.innerHeight) * 2 + 1;
      mouseTrackerRef.current.update(ndcX, ndcY, delta, isDraggingRef.current);

      // Drag sway: spring physics body lean during drag
      dragSwayRef.current.update(
        mouseScreenRef.current.x,
        mouseScreenRef.current.y,
        isDraggingRef.current,
        delta,
      );

      // Hand reach IK: arm reaches toward nearby mouse cursor
      const rootForReach = characterRootRef.current;
      if (rootForReach) {
        handReachRef.current.update(
          mouseWorldPosRef.current.x,
          mouseWorldPosRef.current.y,
          rootForReach.position.x,
          rootForReach.position.y,
          delta,
          isDraggingRef.current,
        );
      }

      // SpringBone gravity: hair/clothes react to drag movement
      const rootPos = characterRootRef.current;
      if (rootPos) {
        springGravityRef.current.update(
          rootPos.position.x,
          rootPos.position.y,
          isDraggingRef.current,
          delta,
        );
      }
    }

    // -- Headpat detection: check if mouse is over head zone --
    if (vrm && cameraRef.current) {
      const headBone = vrm.humanoid?.getNormalizedBoneNode("head");
      if (headBone) {
        headBone.getWorldPosition(_headProjectionVec);
        _headProjectionVec.project(cameraRef.current);
        const headScreenX = (_headProjectionVec.x * 0.5 + 0.5) * window.innerWidth;
        const headScreenY = (-_headProjectionVec.y * 0.5 + 0.5) * window.innerHeight;
        // Head zone: 80px radius around head bone screen position
        const dx = mouseScreenRef.current.x - headScreenX;
        const dy = mouseScreenRef.current.y - headScreenY;
        const isOverHead = Math.sqrt(dx * dx + dy * dy) < 80;
        headpatDetectorRef.current.setOverHead(isOverHead);
        headpatDetectorRef.current.update(mouseScreenRef.current.x, mouseScreenRef.current.y, delta);
      }
    }

    if (vrm) vrm.update(delta);

    // Update particle effects
    particleSystemRef.current.update(delta);

    dragUpdateRef.current();
    performHitTestRef.current();

    // -- Project character head position to screen coordinates --
    if (root && cameraRef.current && characterScreenPosRef) {
      // Use the actual VRM head bone world position for accurate placement
      const headBone = vrm?.humanoid?.getNormalizedBoneNode("head");
      if (headBone) {
        headBone.getWorldPosition(_headProjectionVec);
        // Offset slightly above the head top
        _headProjectionVec.y += HEAD_PROJECTION_OFFSET_Y;
      } else {
        // Fallback: estimate head top from root position
        _headProjectionVec.set(root.position.x, root.position.y + HEAD_FALLBACK_HEIGHT, 0);
      }
      _headProjectionVec.project(cameraRef.current);
      characterScreenPosRef.current = {
        x: (_headProjectionVec.x * 0.5 + 0.5) * window.innerWidth,
        y: (-_headProjectionVec.y * 0.5 + 0.5) * window.innerHeight,
      };
    }
  };

  // ---- Pet tick (1-second interval) ----

  usePetTick({
    characterRootRef,
    isDraggingRef,
    petBehavior: petBehaviorRef.current,
    executePetActions,
  });

  // ---- Character interaction (click/dblclick handlers) ----

  useCharacterInteraction({
    cameraRef,
    characterRootRef,
    isDraggingRef,
    getHitTestTargets,
    onTouch: touchHandleRef,
    onEmotion: emotionSetRef,
    onMotion: motionPlayRef,
    petBehavior: petBehaviorRef.current,
    executePetActions,
  });

  // ---- Tray event listeners ----

  useTauriListeners();

  // ---- Load VRM model on mount (from saved path or default) ----

  useEffect(() => {
    const savedModel = localStorage.getItem("companion_vrm_model_path");
    // Ignore legacy asset:// URLs from before scope restriction
    if (savedModel && !savedModel.startsWith("asset://")) {
      loadVRM(savedModel);
    } else {
      loadVRM("/models/default.vrm");
    }
  }, [loadVRM]);

  // ---- VRM drag-and-drop (Tauri file drop) ----

  useEffect(() => {
    const appWindow = getCurrentWebviewWindow();
    let unlisten: (() => void) | undefined;

    appWindow.onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        const paths = event.payload.paths;
        const vrmPath = paths.find(
          (p) => p.toLowerCase().endsWith(".vrm"),
        );
        if (vrmPath) {
          const filename = vrmPath.split("/").pop() || vrmPath;
          invoke<number[]>("read_file_bytes", { path: vrmPath })
            .then((bytes) => {
              const blob = new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" });
              const file = new File([blob], filename, { type: "application/octet-stream" });
              loadVRM(file);
              // Clear any saved asset:// path so next launch uses default
              localStorage.removeItem("companion_vrm_model_path");
              onModelLoaded?.(filename);
              log.info(`[VRMViewer] VRM dropped: ${filename}`);
            })
            .catch((err) => {
              log.error(`[VRMViewer] Failed to read dropped VRM: ${err}`);
            });
        }
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [loadVRM, onModelLoaded]);

  // ---- Expose emotion/motion setters to parent (chat integration) ----

  useEffect(() => {
    if (onEmotionSetterReady) {
      onEmotionSetterReady((emotionName: string) => {
        emotionSetRef.current(
          emotionName as Parameters<typeof emotion.setEmotion>[0],
        );
      });
    }
    if (onMotionSetterReady) {
      onMotionSetterReady((motionName: string) => {
        motionPlayRef.current(motionName, { loop: false });
      });
    }
    if (onLoadVRMReady) {
      onLoadVRMReady(loadVRM);
    }
  }, [onEmotionSetterReady, onMotionSetterReady, onLoadVRMReady, emotion.setEmotion, motion.playAnimation, loadVRM]);

  // ---- Render ----

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "transparent",
      }}
    />
  );
}
