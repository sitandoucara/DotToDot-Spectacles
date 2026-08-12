/**
 * Specs Inc. 2026
 */
import { PlacementSettings } from "./PlacementSettings";
import { SIK } from "SpectaclesInteractionKit.lspkg/SIK";
import { SurfaceDetector } from "../Scripts/SurfaceDetector";
import { SurfaceSlider } from "../Scripts/SurfaceSlider";
import TrackedHand from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/TrackedHand";

const HAND_OFFSET             = 2;
const MOVEMENT_THRESHOLD      = 1.5;
const ANGLE_THRESHOLD         = 0.25;
const HEIGHT_THRESHOLD        = 6;
const DEFAULT_SCREEN_DISTANCE = 70;
const CALIBRATION_FRAME_COUNT = 60;

const GIF_TOTAL_FRAMES = 9;
const GIF_LAST_FRAME   = GIF_TOTAL_FRAMES - 1;

const phase2Text        = "Keep your hand on the paper";
const mobileText        = "Move mobile \n device to \n a flat surface";
const mobileConfirmText = "Tap \n to confirm \n placement";

@component
export class TableTop extends SurfaceDetector {

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">UI Configuration</span>')

  @input
  instructTextObj: SceneObject;

  @input
  @allowUndefined
  sliderPrefab: ObjectPrefab;

  @input
  @allowUndefined
  start_table: SceneObject;

  @input
  @allowUndefined
  paper_loading: SceneObject;

  @input
  @allowUndefined
  text_phase2: SceneObject;

  private rightHand = SIK.HandInputData.getHand("right");
  private leftHand  = SIK.HandInputData.getHand("left");
  private desiredPosition = vec3.zero();
  private desiredRotation = quat.quatIdentity();

  private textTrans       = null;
  private instructionText = null;
  private phase2Text_comp = null;
  private camComp         = null;

  private calibrationFrames = 0;
  private canCalibrate      = false;
  private leftPosHistory    = [];
  private rightPosHistory   = [];
  private interpolateSpeed: number = 10;
  private isAnyPoseValid    = false;
  private tapEvent          = null;

  private surfaceSlider: SurfaceSlider = null;
  private useAdjustmentWidget = false;
  private widgetOffset = new vec3(2, 2, 0);

  private loadingPosition: vec3 = vec3.zero();
  private loadingAnimProvider   = null;
  private paperAnimObj: SceneObject | null = null;

  onAwake() {
    super.onAwake();
    this.textTrans       = this.instructTextObj.getTransform();
    this.instructionText = this.instructTextObj.getComponent("Text");
    this.camComp         = this.cameraTransform.getSceneObject().getComponent("Camera");

    this.instructTextObj.enabled = false;

    if (this.start_table)   this.start_table.enabled   = false;
    if (this.paper_loading) this.paper_loading.enabled  = false;
    if (this.text_phase2)   this.text_phase2.enabled    = false;
  }

  onDestroy() {
    super.onDestroy();
    if (this.surfaceSlider) {
      this.surfaceSlider.getSceneObject().destroy();
      this.surfaceSlider = null;
    }
  }

  setOptions(settings: PlacementSettings) {
    this.useAdjustmentWidget = settings.useAdjustmentWidget;
    this.widgetOffset = settings.adjustmentWidgetOffset;
    if (this.useAdjustmentWidget && this.sliderPrefab) {
      const sliderObj = this.sliderPrefab.instantiate(null);
      this.surfaceSlider = sliderObj.getComponent(SurfaceSlider.getTypeName());
      this.surfaceSlider.init(this.widgetOffset, settings.onSliderUpdate);
      this.surfaceSlider.resetSlider();
    }
  }

  startSurfaceCalibration(callback: (pos: vec3, rot: quat) => void): void {
    if (!this.start_table   && (global as any)._paperStartTable)
      this.start_table   = (global as any)._paperStartTable;
    if (!this.paper_loading && (global as any)._paperLoading)
      this.paper_loading = (global as any)._paperLoading;
    if (!this.text_phase2   && (global as any)._paperTextPhase2)
      this.text_phase2   = (global as any)._paperTextPhase2;

    const paperAnimObj: SceneObject | null = (global as any)._paperAnim ?? null;
    if (paperAnimObj) {
      this.paperAnimObj        = paperAnimObj;
      this.loadingAnimProvider = this.getAnimProvider(paperAnimObj);
      if (this.loadingAnimProvider) {
        try {
          this.loadingAnimProvider.stop();
          if (this.loadingAnimProvider.pauseAtFrame) {
            this.loadingAnimProvider.pauseAtFrame(0);
          }
        } catch (e) {}
      }
    }

    if (this.text_phase2)
      this.phase2Text_comp = this.text_phase2.getComponent("Text");
    if (this.phase2Text_comp) this.phase2Text_comp.text = phase2Text;

    this.handHintController.disableHint();
    this.calibrationFrames = 0;
    this.canCalibrate      = true;
    this.isAnyPoseValid    = false;
    super.startSurfaceCalibration(callback);
    this.tapEvent = this.createEvent("TapEvent");
    this.tapEvent.bind(this.onMobileTap.bind(this));
    this.circleAnim.setLoadingAmount(0);
    this.setCircleColor(false);
    if (this.useAdjustmentWidget && this.surfaceSlider) {
      this.surfaceSlider.resetSlider();
    }

    this.circleAnim.getSceneObject().enabled = false;
    if (this.paper_loading) this.paper_loading.enabled = false;
    if (this.text_phase2)   this.text_phase2.enabled   = false;
    if (this.paperAnimObj)  this.paperAnimObj.enabled  = false;
    if (this.start_table)   this.start_table.enabled   = true;
  }

  private getAnimProvider(obj: SceneObject): any {
    if (!obj) return null;
    const visual =
      obj.getComponent("Component.Image") ||
      obj.getComponent("Component.RenderMeshVisual") ||
      obj.getComponent("Component.MaterialMeshVisual");
    if (!visual) return null;
    const tex = (visual as any).mainPass?.baseTex;
    if (!tex || !tex.control) return null;
    return tex.control;
  }

  private syncGifFrame(progress: number) {
    if (!this.loadingAnimProvider) return;
    const frame = Math.floor(progress * GIF_LAST_FRAME);
    try {
      this.loadingAnimProvider.stop();
      if (this.loadingAnimProvider.pauseAtFrame) {
        this.loadingAnimProvider.pauseAtFrame(frame);
      }
    } catch (e) {}
  }

  private enterPhase2() {
    if (this.start_table)   this.start_table.enabled   = false;
    if (this.paper_loading) this.paper_loading.enabled = true;
    if (this.text_phase2)   this.text_phase2.enabled   = true;
    if (this.paperAnimObj)  this.paperAnimObj.enabled  = true;

    if (this.loadingAnimProvider) {
      try {
        this.loadingAnimProvider.stop();
        if (this.loadingAnimProvider.pauseAtFrame) {
          this.loadingAnimProvider.pauseAtFrame(0);
        }
      } catch (e) {}
    }
  }

  private enterPhase1() {
    if (this.paper_loading) this.paper_loading.enabled = false;
    if (this.text_phase2)   this.text_phase2.enabled   = false;
    if (this.paperAnimObj)  this.paperAnimObj.enabled  = false;
    if (this.start_table)   this.start_table.enabled   = true;
    this.calibrationFrames = 0;
    this.circleAnim.setLoadingAmount(0);
    this.syncGifFrame(0);
  }

  private onPoseStateChanged() {
    if (!this.isAnyPoseValid) {
      this.handHintController.disableHint();
    }
  }

  onMobileTap() {
    if (global.deviceInfoSystem.isEditor()) { this.startCalibrationComplete(); return; }
    if (this.isCalibrationRunning && this.isAnyPoseValid) this.startCalibrationComplete();
  }

  private setCircleColor(isTracking: boolean) {
    const dotColor = isTracking ? new vec4(1, 1, 0, 1) : new vec4(1, 1, 1, 1);
    this.circleAnim.setCircleColor(dotColor);
    this.circleAnim.enableScanAnimation(isTracking);
  }

  protected onMobileConnnectionStateChange(isConnected: boolean) {
    super.onMobileConnnectionStateChange(isConnected);
    this.instructionText.text = isConnected ? mobileText : phase2Text;
    this.interpolateSpeed = isConnected ? 15 : 8;
  }

  private startCalibrationComplete() {
    this.removeEvent(this.tapEvent);
    this.tapEvent             = null;
    this.canCalibrate         = false;
    this.isCalibrationRunning = false;

    if (this.loadingAnimProvider) {
      try {
        this.loadingAnimProvider.stop();
        if (this.loadingAnimProvider.pauseAtFrame) {
          this.loadingAnimProvider.pauseAtFrame(GIF_LAST_FRAME);
        }
      } catch (e) {}
    }

    const finalPos: vec3 = this.paper_loading
      ? this.paper_loading.getTransform().getWorldPosition()
      : this.loadingPosition;

    const finalRot: quat = this.paper_loading
      ? this.paper_loading.getTransform().getWorldRotation()
      : this.desiredRotation;

    if (this.start_table)   this.start_table.enabled   = false;
    if (this.paper_loading) this.paper_loading.enabled  = false;
    if (this.text_phase2)   this.text_phase2.enabled    = false;
    if (this.paperAnimObj)  this.paperAnimObj.enabled   = false;

    try {
      const visualParent = this.getSceneObject().getChild(0);
      if (visualParent) visualParent.getTransform().setLocalScale(vec3.zero());
    } catch (e) {}

    const delay = this.createEvent("DelayedCallbackEvent");
    delay.bind(() => {
      if (this.hitTestSession) {
        this.hitTestSession.stop();
        this.hitTestSession = null;
      }
    });
    delay.reset(0.1);

    (global as any)._paperFlatRotation = finalRot;
    this.onCompleteCallback(finalPos, finalRot);

    if (this.useAdjustmentWidget && this.surfaceSlider) {
      this.surfaceSlider.showSlider(this.circleAnim.getTransform());
    }
  }

  private getHandUpVector(hand: TrackedHand): vec3 {
    const hndForward = hand.wrist.position.sub(hand.middleTip.position).normalize();
    let handRight = hand.thumbBaseJoint.position.sub(hand.pinkyKnuckle.position).normalize();
    if (hand.handType == "right") handRight = handRight.uniformScale(-1);
    return hndForward.cross(handRight).normalize();
  }

  private updateHandPosition(hand: TrackedHand) {
    if (hand.isTracked()) {
      if (hand.handType != "right") {
        this.leftPosHistory.push(hand.thumbTip.position);
        if (this.leftPosHistory.length > CALIBRATION_FRAME_COUNT / 2) this.leftPosHistory.shift();
      } else {
        this.rightPosHistory.push(hand.thumbTip.position);
        if (this.rightPosHistory.length > CALIBRATION_FRAME_COUNT / 2) this.rightPosHistory.shift();
      }
    }
  }

  private isHandMoving(list: any[]) {
    if (list.length < 2) return true;
    return list[0].distance(list[list.length - 1]) > MOVEMENT_THRESHOLD;
  }

  private isHandWithinAngleThreshold(hand: TrackedHand) {
    return vec3.up().angleTo(this.getHandUpVector(hand)) < ANGLE_THRESHOLD;
  }

  private addHandPoints(hand: TrackedHand, list: number[]) {
    list.push(hand.thumbTip.position.y);
    list.push(hand.indexTip.position.y);
    list.push(hand.pinkyTip.position.y);
  }

  private updateCalibration(leftHandValid: boolean, rightHandValid: boolean) {
    const leftAngleValid  = this.isHandWithinAngleThreshold(this.leftHand)  && leftHandValid;
    const rightAngleValid = this.isHandWithinAngleThreshold(this.rightHand) && rightHandValid;
    const isWithinAngle   = leftAngleValid || rightAngleValid;

    const jointPositions = [];
    if (leftHandValid)  this.addHandPoints(this.leftHand,  jointPositions);
    if (rightHandValid) this.addHandPoints(this.rightHand, jointPositions);

    const heightDiff     = Math.abs(Math.max(...jointPositions) - Math.min(...jointPositions));
    const isWithinHeight = heightDiff < HEIGHT_THRESHOLD;

    const isLeftStopped  = !this.isHandMoving(this.leftPosHistory)  && leftHandValid;
    const isRightStopped = !this.isHandMoving(this.rightPosHistory) && rightHandValid;

    if (isWithinAngle && isWithinHeight && (isLeftStopped || isRightStopped)) {
      this.calibrationFrames++;
      const progress = this.calibrationFrames / CALIBRATION_FRAME_COUNT;
      this.syncGifFrame(progress);
      if (this.calibrationFrames > CALIBRATION_FRAME_COUNT) {
        this.canCalibrate = false;
        this.startCalibrationComplete();
      }
    } else {
      if (this.calibrationFrames > 0) {
        this.calibrationFrames = 0;
        this.syncGifFrame(0);
      }
    }
    this.circleAnim.setLoadingAmount(this.calibrationFrames / CALIBRATION_FRAME_COUNT);
  }

  protected update() {
    super.update();
    if (!this.canCalibrate) return;

    let poseValid = false;
    const camPos  = this.cameraTransform.getWorldPosition();
    let textPos   = new vec3(0, 0, 1);
    let textRot   = quat.quatIdentity();

    if (this.isMobileConnected()) {
      const phoneForward   = SIK.MobileInputData.rotation.multiplyVec3(vec3.up());
      const mobilePosition = SIK.MobileInputData.position.add(phoneForward.uniformScale(20));
      poseValid = this.camComp.isSphereVisible(mobilePosition, 2);
      this.instructionText.text = poseValid ? mobileConfirmText : mobileText;
      if (poseValid) {
        this.desiredPosition = mobilePosition;
        const worldPhoneForward = phoneForward.cross(vec3.up()).normalize();
        this.desiredRotation = quat.lookAt(worldPhoneForward, vec3.up())
          .multiply(quat.fromEulerVec(new vec3(-Math.PI / 2, -Math.PI / 2, 0)));
        textPos = new vec3(0, 10, 6);
        this.trans.setWorldPosition(this.desiredPosition);
        this.trans.setWorldRotation(this.desiredRotation);
      } else {
        this.desiredPosition = camPos.add(
          this.cameraTransform.forward.uniformScale(-DEFAULT_SCREEN_DISTANCE)
        );
        this.desiredRotation = quat.lookAt(this.cameraTransform.forward, vec3.up());
      }
      this.setCircleColor(poseValid);
      textRot = poseValid
        ? quat.fromEulerVec(new vec3(Math.PI / 4, 0, 0))
        : quat.quatIdentity();

    } else {
      const rightHandValid = this.rightHand.isTracked()
        && this.camComp.isSphereVisible(this.rightHand.thumbTip.position, 2);
      const leftHandValid  = this.leftHand.isTracked()
        && this.camComp.isSphereVisible(this.leftHand.thumbTip.position, 2);
      const isEitherHandValid = rightHandValid || leftHandValid;

      this.setCircleColor(isEitherHandValid);

      if (leftHandValid)  this.updateHandPosition(this.leftHand);
      if (rightHandValid) this.updateHandPosition(this.rightHand);

      if (isEitherHandValid) {
        if (!this.isAnyPoseValid) this.enterPhase2();

        const thumbCenter = this.rightHand.thumbTip.position
          .add(this.leftHand.thumbTip.position).uniformScale(0.5);
        const indexCenter = this.rightHand.pinkyTip.position
          .add(this.leftHand.pinkyTip.position).uniformScale(0.5);

        let handRight = this.cameraTransform.right;

        if (leftHandValid && rightHandValid) {
          this.desiredPosition = thumbCenter.add(indexCenter).uniformScale(0.5);
          this.loadingPosition = this.desiredPosition;
          handRight = this.rightHand.getPalmCenter()
            .sub(this.leftHand.getPalmCenter()).normalize();
        } else {
          const palmCenter = leftHandValid
            ? this.leftHand.getPalmCenter()
            : this.rightHand.getPalmCenter();
          this.loadingPosition = palmCenter;

          const handPos = leftHandValid
            ? this.leftHand.thumbTip.position.add(this.leftHand.indexTip.position).uniformScale(0.5)
            : this.rightHand.thumbTip.position.add(this.rightHand.indexTip.position).uniformScale(0.5);
          const offset = leftHandValid ? 7 : -7;
          this.desiredPosition = handPos.add(this.cameraTransform.right.uniformScale(offset));
        }

        const handForward = handRight.cross(vec3.up()).normalize();
        this.desiredRotation = quat.lookAt(handForward, vec3.up())
          .multiply(quat.fromEulerVec(new vec3(-Math.PI / 2, 0, 0)));

        textPos   = new vec3(0, 10, 6);
        textRot   = quat.fromEulerVec(new vec3(Math.PI / 4, 0, 0));
        poseValid = true;

      } else {
        if (this.isAnyPoseValid) this.enterPhase1();

        this.desiredPosition = camPos.add(
          this.cameraTransform.forward.uniformScale(-DEFAULT_SCREEN_DISTANCE)
        );
        this.desiredRotation = quat.lookAt(this.cameraTransform.forward, vec3.up());
      }

      if (isEitherHandValid) {
        this.desiredPosition.y -= HAND_OFFSET;
        this.loadingPosition = new vec3(
          this.loadingPosition.x,
          this.loadingPosition.y - HAND_OFFSET,
          this.loadingPosition.z
        );
        this.updateCalibration(leftHandValid, rightHandValid);
      }
    }

    if (this.isAnyPoseValid != poseValid) {
      this.isAnyPoseValid = poseValid;
      this.onPoseStateChanged();
    }

    this.textTrans.setLocalPosition(
      vec3.lerp(this.textTrans.getLocalPosition(), textPos, getDeltaTime() * this.interpolateSpeed)
    );
    this.textTrans.setLocalRotation(
      quat.slerp(this.textTrans.getLocalRotation(), textRot, getDeltaTime() * this.interpolateSpeed)
    );

    this.trans.setWorldPosition(
      vec3.lerp(this.trans.getWorldPosition(), this.desiredPosition, getDeltaTime() * this.interpolateSpeed)
    );
    this.trans.setWorldRotation(
      quat.slerp(this.trans.getWorldRotation(), this.desiredRotation, getDeltaTime() * this.interpolateSpeed)
    );

    if (this.paper_loading && this.paper_loading.enabled) {
      this.paper_loading.getTransform().setWorldPosition(
        vec3.lerp(
          this.paper_loading.getTransform().getWorldPosition(),
          this.loadingPosition,
          getDeltaTime() * this.interpolateSpeed
        )
      );
      this.paper_loading.getTransform().setWorldRotation(this.desiredRotation);

      if (this.paperAnimObj && this.paperAnimObj.enabled) {
        this.paperAnimObj.getTransform().setWorldPosition(
          this.paper_loading.getTransform().getWorldPosition()
        );
        this.paperAnimObj.getTransform().setWorldRotation(this.desiredRotation);
      }
    }

    if (this.text_phase2 && this.text_phase2.enabled && this.paper_loading) {
      const loaderPos   = this.paper_loading.getTransform().getWorldPosition();
      const loaderRot   = this.paper_loading.getTransform().getWorldRotation();
      const localOffset = new vec3(0, 10, 6);
      const worldOffset = loaderRot.multiplyVec3(localOffset);
      this.text_phase2.getTransform().setWorldPosition(loaderPos.add(worldOffset));
      const tiltRot = quat.fromEulerVec(new vec3(Math.PI / 4, 0, 0));
      this.text_phase2.getTransform().setWorldRotation(loaderRot.multiply(tiltRot));
    }

    if (this.start_table && this.start_table.enabled) {
      const floatPos = camPos.add(
        this.cameraTransform.forward.uniformScale(-DEFAULT_SCREEN_DISTANCE)
      );
      this.start_table.getTransform().setWorldPosition(
        vec3.lerp(
          this.start_table.getTransform().getWorldPosition(),
          floatPos,
          getDeltaTime() * this.interpolateSpeed
        )
      );
      this.start_table.getTransform().setWorldRotation(this.cameraTransform.getWorldRotation());
    }
  }
}