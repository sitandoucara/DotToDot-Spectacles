/**
 * Specs Inc. 2026 — Simplifié
 * Un seul mode actif : NEAR_SURFACE / TableTop
 */
import { PlacementMode, PlacementSettings } from "./PlacementSettings";
import { HandHintsController } from "./HandHintsController";
import { Singleton } from "../Decorators/Singleton";
import { SurfaceDetector } from "./SurfaceDetector";
import { TableTop } from "./TableTop";

const CALIBRATE_AUDIOTRACK: AudioTrackAsset = requireAsset(
  "../Sounds/CalibrateSnap.mp3"
) as AudioTrackAsset;

const HANDHINTS_PREFAB: ObjectPrefab = requireAsset(
  "../Prefabs/HandHints.prefab"
) as ObjectPrefab;

const PLACEMENT_MODE_PREFABS: ObjectPrefab[] = [
  requireAsset("../Prefabs/HorizontalPlacement.prefab") as ObjectPrefab,
  requireAsset("../Prefabs/VerticalPlacement.prefab")   as ObjectPrefab,
  requireAsset("../Prefabs/TableTopPlacement.prefab")   as ObjectPrefab,
];

@Singleton
export class SurfacePlacementController {
  public static getInstance: () => SurfacePlacementController;

  private handHindsController: HandHintsController = null;
  private currDetector:        SurfaceDetector     = null;
  private sceneObject:         SceneObject         = null;

  public constructor() {
    this.sceneObject = global.scene.createSceneObject("SurfacePlacementController");
    this.init();
  }

  private init() {
    const audioComponent      = this.sceneObject.createComponent("AudioComponent");
    audioComponent.audioTrack = CALIBRATE_AUDIOTRACK;
    const handHintsObj        = HANDHINTS_PREFAB.instantiate(this.sceneObject);
    this.handHindsController  = handHintsObj.getComponent(HandHintsController.getTypeName());
    this.handHindsController.disableHint();
  }

  startSurfacePlacement(
    settings: PlacementSettings,
    callback: (pos: vec3, rot: quat) => void
  ) {
    if (this.currDetector != null) {
      this.stopSurfacePlacement();
    }

    // Instancie le prefab selon le mode
    const detectorObj = PLACEMENT_MODE_PREFABS[settings.placementMode]
      .instantiate(this.sceneObject);

    // Récupération du détecteur — méthode 1 : instanceof
    this.currDetector = detectorObj
      .getComponents("ScriptComponent")
      .find((s) => s instanceof SurfaceDetector) as SurfaceDetector;

    // Méthode 2 : fallback getTypeName
    if (!this.currDetector) {
      const tableTop = detectorObj.getComponent(TableTop.getTypeName());
      if (tableTop) {
        this.currDetector = tableTop as unknown as SurfaceDetector;
      }
    }

    // Méthode 3 : duck typing
    if (!this.currDetector) {
      const scripts = detectorObj.getComponents("ScriptComponent");
      for (const s of scripts) {
        if (typeof (s as any).startSurfaceCalibration === "function") {
          this.currDetector = s as unknown as SurfaceDetector;
          break;
        }
      }
    }

    if (!this.currDetector) {
      print("[SurfacePlacement] ERROR : détecteur introuvable !");
      return;
    }

    // TableTop : setOptions si besoin
    if (settings.placementMode === PlacementMode.NEAR_SURFACE) {
      const tableTop = detectorObj.getComponent(TableTop.getTypeName());
      if (tableTop && typeof tableTop.setOptions === "function") {
        tableTop.setOptions(settings);
      }
    }

    this.currDetector.init(this.handHindsController);
    this.currDetector.startSurfaceCalibration(callback);
  }

  stopSurfacePlacement() {
    if (this.currDetector) {
      this.handHindsController.disableHint();
      this.currDetector.onDestroy();
      this.currDetector.getSceneObject().destroy();
      this.currDetector = null;
    }
  }
}