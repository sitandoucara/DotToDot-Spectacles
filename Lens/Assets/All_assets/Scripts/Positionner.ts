// ============================================
// POSITION CONTROLLER - Y & X/Z Drag Buttons
// ============================================
// btnY_emitter → déplacement sur l'axe Y uniquement
// btnZ_emitter → déplacement sur les axes X et Z
//                (gauche/droite + profondeur simultanément)
// ============================================
// GLOBAL :
//   global.positionController.onItemSelected()
//   global.positionController.reset()
// ============================================
// 3 positions distinctes par bouton selon le mode :
//   INIT     → mode home (hors champ)
//   SELECTED → mode dessin actif
//   FINISH   → mode finish
// ============================================

import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { InteractableManipulation } from "SpectaclesInteractionKit.lspkg/Components/Interaction/InteractableManipulation/InteractableManipulation"

declare var global: {
    positionController: any;
};

@component
export class PositionController extends BaseScriptComponent {

    @input
    @hint("Tableau des SceneObjects à déplacer")
    targets: SceneObject[] = [];

    @input btnY: SceneObject;
    @input btnY_emitter: SceneObject;
    @input btnY_texture: SceneObject;
    @input btnY_assets: Texture[] = [];

    @input btnZ: SceneObject;
    @input btnZ_emitter: SceneObject;
    @input btnZ_texture: SceneObject;
    @input btnZ_assets: Texture[] = [];

    // ── Positions btnY selon le mode ──────────────────────────────────────
    private readonly BTN_Y_POS_INIT:     vec3 = new vec3(-16.5661, -17.782,  3.50);
    private readonly BTN_Y_POS_SELECTED: vec3 = new vec3(-19.0071, -21.5559, 0.20); 
    //private readonly BTN_Y_POS_FINISH:   vec3 = new vec3(-16.5661, -17.782,  1.50);

    // ── Positions btnZ selon le mode ──────────────────────────────────────
    private readonly BTN_Z_POS_INIT:     vec3 = new vec3(-10.3792, -17.782,  3.50);
    private readonly BTN_Z_POS_SELECTED: vec3 = new vec3(-12.6392 ,  -21.5559, 0.20);
    //private readonly BTN_Z_POS_FINISH:   vec3 = new vec3(-10.3792, -17.782,  1.50);

    // ── Targets ──────────────────────────────────────────────────────────
    private targetTransforms: Transform[]  = [];
    private targetInitialPositions: vec3[] = [];
    private targetLoadedPositions: vec3[]  = [];

    private btnYTransform: Transform;
    private btnZTransform: Transform;

    private emitterYTransform: Transform;
    private emitterZTransform: Transform;

    // Références world pour le calcul des deltas
    private refWorldY: number = 0;
    private refWorldZ: number = 0;
    private refWorldX: number = 0;

    private currentDeltaY: number = 0;
    private currentDeltaZ: number = 0;
    private currentDeltaX: number = 0;

    // ============================================
    // INIT
    // ============================================

    onAwake() {
        for (let i = 0; i < this.targets.length; i++) {
            if (this.targets[i]) {
                const t = this.targets[i].getTransform();
                this.targetTransforms.push(t);
                this.targetInitialPositions.push(t.getWorldPosition());
                this.targetLoadedPositions.push(t.getWorldPosition());
                print(`🟢 Target[${i}] initialisé`);
            } else {
                print(`⚠️ Target[${i}] est null, ignoré`);
            }
        }

        // --- Btn Y → position INIT ---
        if (this.btnY) {
            this.btnYTransform = this.btnY.getTransform();
            this.btnYTransform.setLocalPosition(this.BTN_Y_POS_INIT);
            this.applyTexture(this.btnY_texture, this.btnY_assets, 0);
            print(`🟢 btnY init → (${this.BTN_Y_POS_INIT.x}, ${this.BTN_Y_POS_INIT.y}, ${this.BTN_Y_POS_INIT.z})`);
        } else {
            print("❌ btnY non assigné");
        }

        if (this.btnY_emitter) {
            this.emitterYTransform = this.btnY_emitter.getTransform();
        }

        // --- Btn Z → position INIT ---
        if (this.btnZ) {
            this.btnZTransform = this.btnZ.getTransform();
            this.btnZTransform.setLocalPosition(this.BTN_Z_POS_INIT);
            this.applyTexture(this.btnZ_texture, this.btnZ_assets, 0);
            print(`🟢 btnZ init → (${this.BTN_Z_POS_INIT.x}, ${this.BTN_Z_POS_INIT.y}, ${this.BTN_Z_POS_INIT.z})`);
        } else {
            print("❌ btnZ non assigné");
        }

        if (this.btnZ_emitter) {
            this.emitterZTransform = this.btnZ_emitter.getTransform();
        }

        global.positionController = this;
        print("🌐 PositionController enregistré sur global ✓");

        this.createEvent("OnStartEvent").bind(() => {
            // btnY_emitter : Y uniquement
            this.setupEmitter(this.btnY_emitter, this.btnY_texture, this.btnY_assets, "Y",
                /*enableY*/ true, /*enableX*/ false, /*enableZ*/ false);

            // btnZ_emitter : X ET Z simultanément ← FIX (enableX était false)
            this.setupEmitter(this.btnZ_emitter, this.btnZ_texture, this.btnZ_assets, "XZ",
                /*enableY*/ false, /*enableX*/ true, /*enableZ*/ true);

            this.syncEmittersToButtons();
            this.saveWorldRefs();
        });

        this.createEvent("UpdateEvent").bind(() => { this.onUpdate(); });

        print("✅ PositionController prêt (btnY=Y | btnZ=X+Z)");
    }

    // ============================================
    // ON ITEM SELECTED → position SELECTED
    // ============================================

    public onItemSelected(): void {
        for (let i = 0; i < this.targetTransforms.length; i++) {
            this.targetInitialPositions[i] = this.targetTransforms[i].getWorldPosition();
        }
        this.currentDeltaY = 0;
        this.currentDeltaZ = 0;
        this.currentDeltaX = 0;

        if (this.btnYTransform) {
            this.btnYTransform.setLocalPosition(this.BTN_Y_POS_SELECTED);
            print(`📍 btnY → SELECTED (${this.BTN_Y_POS_SELECTED.x}, ${this.BTN_Y_POS_SELECTED.y}, ${this.BTN_Y_POS_SELECTED.z})`);
        }
        if (this.btnZTransform) {
            this.btnZTransform.setLocalPosition(this.BTN_Z_POS_SELECTED);
            print(`📍 btnZ → SELECTED (${this.BTN_Z_POS_SELECTED.x}, ${this.BTN_Z_POS_SELECTED.y}, ${this.BTN_Z_POS_SELECTED.z})`);
        }

        this.syncEmittersToButtons();
        this.saveWorldRefs();

        print("🔄 onItemSelected ✓");
    }

    // ============================================
    // RESET → position INIT
    // ============================================

    public reset(): void {
        this.currentDeltaY = 0;
        this.currentDeltaZ = 0;
        this.currentDeltaX = 0;

        if (this.btnYTransform) {
            this.btnYTransform.setLocalPosition(this.BTN_Y_POS_INIT);
            this.applyTexture(this.btnY_texture, this.btnY_assets, 0);
            print(`📍 btnY → INIT`);
        }
        if (this.btnZTransform) {
            this.btnZTransform.setLocalPosition(this.BTN_Z_POS_INIT);
            this.applyTexture(this.btnZ_texture, this.btnZ_assets, 0);
            print(`📍 btnZ → INIT`);
        }

        this.syncEmittersToButtons();
        this.saveWorldRefs();

        for (let i = 0; i < this.targetTransforms.length; i++) {
            const currentPos = this.targetTransforms[i].getWorldPosition();
            this.targetInitialPositions[i] = currentPos;
            this.targetLoadedPositions[i]  = currentPos;
        }

        print("🏠 PositionController.reset() ✓");
    }

    // ============================================
    // REFRESH BASE POSITIONS
    // ============================================

    public refreshBasePositions(): void {
        this.currentDeltaY = 0;
        this.currentDeltaZ = 0;
        this.currentDeltaX = 0;

        this.syncEmittersToButtons();
        this.saveWorldRefs();

        for (let i = 0; i < this.targetTransforms.length; i++) {
            const currentPos = this.targetTransforms[i].getWorldPosition();
            this.targetInitialPositions[i] = currentPos;
            this.targetLoadedPositions[i]  = currentPos;
        }
        print("🔄 refreshBasePositions() ✓");
    }

    // ============================================
    // SYNC ÉMETTEURS → WORLD POSITION DES BOUTONS
    // ============================================

    private syncEmittersToButtons(): void {
        if (this.emitterYTransform && this.btnYTransform) {
            this.emitterYTransform.setWorldPosition(this.btnYTransform.getWorldPosition());
        }
        if (this.emitterZTransform && this.btnZTransform) {
            this.emitterZTransform.setWorldPosition(this.btnZTransform.getWorldPosition());
        }
    }

    private saveWorldRefs(): void {
        if (this.emitterYTransform) {
            this.refWorldY = this.emitterYTransform.getWorldPosition().y;
        }
        if (this.emitterZTransform) {
            const pos      = this.emitterZTransform.getWorldPosition();
            this.refWorldZ = pos.z;
            this.refWorldX = pos.x;
        }
    }

    // ============================================
    // SETUP ÉMETTEUR
    // enableY / enableX / enableZ selon le bouton
    // ============================================

    private setupEmitter(
        emitter: SceneObject,
        textureObj: SceneObject,
        assets: Texture[],
        label: string,
        enableY: boolean,
        enableX: boolean,
        enableZ: boolean
    ): void {
        if (!emitter) { print(`❌ émetteur${label} non assigné`); return; }

        const interactable = emitter.getComponent(Interactable.getTypeName()) as unknown as Interactable;
        if (isNull(interactable)) { print(`❌ Interactable introuvable sur émetteur${label}`); return; }

        const manipulation = emitter.getComponent(InteractableManipulation.getTypeName()) as unknown as InteractableManipulation;
        if (isNull(manipulation)) { print(`❌ InteractableManipulation introuvable sur émetteur${label}`); return; }

        manipulation.enableXTranslation = enableX;
        manipulation.enableYTranslation = enableY;
        manipulation.enableZTranslation = enableZ;
        manipulation.setCanRotate(false);
        manipulation.setCanScale(false);
        manipulation.enableStretchZ = false;

        interactable.onHoverEnter(() => { this.applyTexture(textureObj, assets, 1); });
        interactable.onHoverExit(()  => { this.applyTexture(textureObj, assets, 0); });

        print(`🟢 émetteur${label} branché ✓ (X:${enableX} Y:${enableY} Z:${enableZ})`);
    }

    // ============================================
    // UPDATE
    // btnY_emitter : lit Y → deltaY
    // btnZ_emitter : lit X et Z → deltaX + deltaZ
    // ============================================

    private onUpdate(): void {
        if (!this.emitterYTransform || !this.emitterZTransform) return;
        if (!this.btnYTransform     || !this.btnZTransform)     return;

        const emitterYWorld = this.emitterYTransform.getWorldPosition();
        const emitterZWorld = this.emitterZTransform.getWorldPosition();
        const btnYWorld     = this.btnYTransform.getWorldPosition();
        const btnZWorld     = this.btnZTransform.getWorldPosition();

        // btnY_emitter : libre sur Y, locké sur X et Z au bouton
        this.emitterYTransform.setWorldPosition(
            new vec3(btnYWorld.x, emitterYWorld.y, btnYWorld.z)
        );

        // btnZ_emitter : libre sur X et Z, locké sur Y au bouton
        this.emitterZTransform.setWorldPosition(
            new vec3(emitterZWorld.x, btnZWorld.y, emitterZWorld.z)
        );

        // Deltas world depuis les références sauvegardées
        this.currentDeltaY = emitterYWorld.y - this.refWorldY;
        this.currentDeltaZ = emitterZWorld.z - this.refWorldZ;
        this.currentDeltaX = emitterZWorld.x - this.refWorldX;

        // Application aux targets sur Y, X et Z
        for (let i = 0; i < this.targetTransforms.length; i++) {
            const initPos = this.targetInitialPositions[i];
            this.targetTransforms[i].setWorldPosition(new vec3(
                initPos.x + this.currentDeltaX,
                initPos.y + this.currentDeltaY,
                initPos.z + this.currentDeltaZ
            ));
        }
    }

    // ============================================
    // APPLY TEXTURE
    // ============================================

    private applyTexture(target: SceneObject, assets: Texture[], index: number): void {
        if (!target || !assets || index >= assets.length) return;
        const texture = assets[index];
        if (!texture) return;

        const img = target.getComponent("Component.Image") as Image;
        if (img && img.mainPass) { img.mainPass.baseTex = texture; return; }

        const rmv = target.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        if (rmv && rmv.mainMaterial && rmv.mainMaterial.mainPass) {
            rmv.mainMaterial.mainPass.baseTex = texture;
        }
    }
}