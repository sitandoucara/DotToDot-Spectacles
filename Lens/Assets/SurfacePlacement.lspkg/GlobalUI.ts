import { PlacementMode, PlacementSettings } from "./Scripts/PlacementSettings";
import { SurfacePlacementController } from "./Scripts/SurfacePlacementController";
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger";
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";

@component
export class Example extends BaseScriptComponent {

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Placement</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">TableTop — Palm detection</span>')

  @input
  @allowUndefined
  game_container: SceneObject;

  @input
  @allowUndefined
  btn_container: SceneObject;

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Phase 1 — Scan</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Visible au démarrage, flotte devant la caméra</span>')

  @input
  @allowUndefined
  start_table: SceneObject;

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Phase 2 — Loading</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Visible quand la main est détectée sur la surface</span>')

  @input
  @allowUndefined
  paper_loading: SceneObject;

  @input
  @allowUndefined
  paper_anim: SceneObject;

  @input
  @allowUndefined
  text_phase2: SceneObject;

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')

  @input
  @hint("Enable lifecycle logging")
  enableLoggingLifecycle: boolean = false;

  private btnContainerInitPos: vec3 = null;
  private logger: Logger;
  private cameraTransform: Transform =
    WorldCameraFinderProvider.getInstance().getTransform();
  private surfacePlacement: SurfacePlacementController =
    SurfacePlacementController.getInstance();

  onAwake(): void {
    this.logger = new Logger("Example", this.enableLoggingLifecycle, true);
    if (this.enableLoggingLifecycle) {
      this.logger.debug("LIFECYCLE: onAwake()");
    }
    this.createEvent("OnStartEvent").bind(this.onStart.bind(this));
  }

  private onStart() {
    if (this.game_container) this.game_container.enabled = false;
    if (this.btn_container) {
      this.btn_container.enabled = false;
      this.btnContainerInitPos = this.btn_container.getTransform().getWorldPosition();
    }
    this.startPlacement();
  }

  startPlacement() {
    if (this.game_container) this.game_container.enabled = false;
    if (this.btn_container)  this.btn_container.enabled  = false;

    (global as any)._paperStartTable = this.start_table   ?? null;
    (global as any)._paperLoading    = this.paper_loading ?? null;
    (global as any)._paperAnim       = this.paper_anim    ?? null;
    (global as any)._paperTextPhase2 = this.text_phase2   ?? null;

    const placementSettings = new PlacementSettings(
      PlacementMode.NEAR_SURFACE,
      false,
      new vec3(2, 2, 0),
      null
    );

    this.surfacePlacement.startSurfacePlacement(
      placementSettings,
      (pos, rot) => this.onSurfaceDetected(pos, rot)
    );
  }

  resetPlacement() {
    this.surfacePlacement.stopSurfacePlacement();
    this.startPlacement();
  }

  private onSurfaceDetected(pos: vec3, rot: quat) {
    const flatRot = (global as any)._paperFlatRotation as quat ?? rot;

    if (this.game_container) {
      this.game_container.enabled = true;
      this.game_container.getTransform().setWorldPosition(pos);
      this.game_container.getTransform().setWorldRotation(flatRot);
    }

    if (this.btn_container) {
      this.btn_container.enabled = true;
      const camWorldTrans = this.cameraTransform.getSceneObject().getTransform();
      const invCam        = camWorldTrans.getInvertedWorldTransform();
      const posInCam      = invCam.multiplyPoint(pos);
      const initPos       = this.btnContainerInitPos
        ?? this.btn_container.getTransform().getWorldPosition();
      const initPosInCam  = invCam.multiplyPoint(initPos);
      const targetWorld   = camWorldTrans.getWorldTransform().multiplyPoint(
        new vec3(posInCam.x, initPosInCam.y, initPosInCam.z)
      );
      const uprightRot = flatRot.multiply(
        quat.fromEulerVec(new vec3(Math.PI / 2, 0, 0))
      );
      this.btn_container.getTransform().setWorldPosition(targetWorld);
      this.btn_container.getTransform().setWorldRotation(uprightRot);
    }

    const pc = (global as any).positionController;
    if (pc && typeof pc.refreshBasePositions === "function") {
      pc.refreshBasePositions();
    }
  }
}