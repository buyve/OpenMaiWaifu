import { useState, useCallback, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  VRM,
  VRMLoaderPlugin,
  VRMUtils,
  VRMExpressionPresetName,
} from "@pixiv/three-vrm";
import { log } from "../lib/logger.ts";

// ---------- Types ----------

/** Maps standard emotion names to the VRM expression preset names available on the model. */
export type ExpressionMap = Record<string, VRMExpressionPresetName | string>;

export interface UseVRMReturn {
  /** The loaded VRM instance, or null before load / on error. */
  vrm: VRM | null;
  /** The THREE.Scene root of the loaded VRM model. */
  scene: THREE.Group | null;
  /** Available expressions mapped to standard names. */
  expressionMap: ExpressionMap;
  /** The VRM lookAt controller, if present. */
  lookAt: VRM["lookAt"] | null;
  /** Whether the model is currently loading. */
  isLoading: boolean;
  /** Error message if loading failed. */
  error: string | null;
  /** Load a VRM from a URL string or File object. */
  loadVRM: (source: string | File) => void;
  /** Apply a named expression with a given weight (0-1). */
  setExpression: (name: string, weight: number) => void;
  /** Set the lookAt target position for eye tracking. */
  setLookAtTarget: (position: THREE.Vector3) => void;
}

// ---------- VRM0 -> VRM1 expression mapping ----------

/**
 * VRM0 used different names for some expressions.
 * We map them to their VRM1 equivalents for a unified interface.
 */
const VRM0_TO_VRM1: Record<string, VRMExpressionPresetName> = {
  joy: VRMExpressionPresetName.Happy,
  sorrow: VRMExpressionPresetName.Sad,
  fun: VRMExpressionPresetName.Relaxed,
};

/** Standard VRM1 expression preset names we want to detect. */
const STANDARD_EXPRESSIONS: VRMExpressionPresetName[] = [
  VRMExpressionPresetName.Happy,
  VRMExpressionPresetName.Angry,
  VRMExpressionPresetName.Sad,
  VRMExpressionPresetName.Relaxed,
  VRMExpressionPresetName.Surprised,
  VRMExpressionPresetName.Neutral,
  VRMExpressionPresetName.Blink,
  VRMExpressionPresetName.BlinkLeft,
  VRMExpressionPresetName.BlinkRight,
];

// ---------- Helpers ----------

/**
 * Scans the VRM's expression manager and builds a mapping table
 * of available expressions using standard names.
 */
function buildExpressionMap(vrm: VRM): ExpressionMap {
  const map: ExpressionMap = {};
  const manager = vrm.expressionManager;
  if (!manager) return map;

  // Check all standard VRM1 preset names
  for (const preset of STANDARD_EXPRESSIONS) {
    const expression = manager.getExpression(preset);
    if (expression) {
      map[preset] = preset;
    }
  }

  // Check for VRM0 legacy names and map to VRM1 equivalents
  for (const [v0Name, v1Preset] of Object.entries(VRM0_TO_VRM1)) {
    // Only add VRM0 mapping if the VRM1 equivalent isn't already present
    if (!map[v1Preset]) {
      const expression = manager.getExpression(v0Name);
      if (expression) {
        map[v1Preset] = v0Name;
      }
    }
  }

  return map;
}

// ---------- Hook ----------

export function useVRM(): UseVRMReturn {
  const [vrm, setVRM] = useState<VRM | null>(null);
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const [expressionMap, setExpressionMap] = useState<ExpressionMap>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep a ref to the lookAt target so we can update it without re-renders
  const lookAtTargetRef = useRef<THREE.Object3D | null>(null);

  const loadVRM = useCallback((source: string | File) => {
    setIsLoading(true);
    setError(null);
    setVRM(null);
    setScene(null);
    setExpressionMap({});

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    const onLoad = (gltf: { userData: { vrm?: VRM }; scene: THREE.Group }) => {
      const loadedVRM = gltf.userData.vrm as VRM | undefined;
      if (!loadedVRM) {
        setError("No VRM data found in GLTF file.");
        setIsLoading(false);
        return;
      }

      // Apply VRMUtils optimizations
      VRMUtils.removeUnnecessaryVertices(loadedVRM.scene);
      VRMUtils.combineSkeletons(loadedVRM.scene);

      // combineMorphs takes the VRM instance (not the scene)
      if (typeof VRMUtils.combineMorphs === "function") {
        VRMUtils.combineMorphs(loadedVRM);
      }

      // Disable frustum culling on all meshes
      loadedVRM.scene.traverse((obj) => {
        obj.frustumCulled = false;
      });

      // Set up lookAt target if lookAt is available
      if (loadedVRM.lookAt) {
        const target = new THREE.Object3D();
        target.position.set(0, 1.0, 2.0); // default: looking at camera
        lookAtTargetRef.current = target;
        loadedVRM.lookAt.target = target;
      }

      // Build expression mapping
      const map = buildExpressionMap(loadedVRM);

      setVRM(loadedVRM);
      setScene(loadedVRM.scene);
      setExpressionMap(map);
      setIsLoading(false);

      log.info("[useVRM] Model loaded. Expressions:", Object.keys(map));
    };

    const onProgress = (progress: ProgressEvent) => {
      if (progress.total > 0) {
        log.debug(
          `[useVRM] Loading: ${((progress.loaded / progress.total) * 100).toFixed(1)}%`,
        );
      }
    };

    const onError = (err: unknown) => {
      const message =
        err instanceof Error ? err.message : "Unknown error loading VRM.";
      log.error("[useVRM] Load error:", message);
      setError(message);
      setIsLoading(false);
    };

    if (typeof source === "string") {
      loader.load(source, onLoad, onProgress, onError);
    } else {
      // File object: create an object URL
      const url = URL.createObjectURL(source);
      loader.load(
        url,
        (gltf) => {
          URL.revokeObjectURL(url);
          onLoad(gltf);
        },
        onProgress,
        (err) => {
          URL.revokeObjectURL(url);
          onError(err);
        },
      );
    }
  }, []);

  const setExpression = useCallback(
    (name: string, weight: number) => {
      if (!vrm?.expressionManager) return;

      // Resolve name through expression map, or use directly
      const resolvedName = expressionMap[name] ?? name;
      vrm.expressionManager.setValue(resolvedName, weight);
    },
    [vrm, expressionMap],
  );

  const setLookAtTarget = useCallback(
    (position: THREE.Vector3) => {
      if (lookAtTargetRef.current) {
        lookAtTargetRef.current.position.copy(position);
      } else if (vrm?.lookAt) {
        const target = new THREE.Object3D();
        target.position.copy(position);
        lookAtTargetRef.current = target;
        vrm.lookAt.target = target;
      }
    },
    [vrm],
  );

  return {
    vrm,
    scene,
    expressionMap,
    lookAt: vrm?.lookAt ?? null,
    isLoading,
    error,
    loadVRM,
    setExpression,
    setLookAtTarget,
  };
}
