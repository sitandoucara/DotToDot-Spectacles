// ============================================
// HOME CONTROLLER
// Bouton Home → remet tout à l'état initial
// ============================================
// GLOBAL FLAGS lus dans UpdateEvent :
//   global.isSelectedMode → true = mode selected
//   global.isFinishMode   → true = mode finish
// ============================================
// Positions du btn_home selon le mode :
//   SELECTED → POS_SELECTED
//   FINISH   → POS_FINISH
//   INIT     → position sauvegardée depuis l'inspecteur
// ============================================
// home_assets[] :
//   [0] = selected base
//   [1] = selected hover
//   [2] = finish base
//   [3] = finish hover
// ============================================

import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"

declare var global: {
    dotPickerController: any;
    positionController: any;
    scaleSlider: any;
    finishController: any;
    isSelectedMode: boolean;
    isFinishMode: boolean;
};

@component
export class HomeController extends BaseScriptComponent {

    @input
    @hint("Le bouton Home")
    btn_home: SceneObject;

    @input
    @hint("SceneObject qui reçoit la texture du bouton Home")
    home_texture: SceneObject;

    @input
    @hint("[0] selected base | [1] selected hover | [2] finish base | [3] finish hover")
    home_assets: Texture[] = [];

    // ============================================
    // CONSTANTES - POSITIONS SELON MODE
    // ============================================

    private readonly POS_SELECTED: vec3 = new vec3(-286.1801, -43.1649, 0.0);
    private readonly POS_FINISH:   vec3 = new vec3(-213.0752, -325.1287, 0.0); 

    // ============================================
    // VARIABLES
    // ============================================

    private btnTransform: Transform;
    private posInit: vec3;
    private currentMode: string = "init"; // "init" | "selected" | "finish"

    // ============================================
    // INIT
    // ============================================

    onAwake() {
        global.isSelectedMode = false;
        global.isFinishMode   = false;
        print("🌐 HomeController — flags globaux initialisés");

        this.createEvent("OnStartEvent").bind(() => {
            if (this.btn_home) {
                this.btnTransform = this.btn_home.getTransform();
                this.posInit      = this.btnTransform.getLocalPosition();
                print(`📍 posInit → (${this.posInit.x}, ${this.posInit.y}, ${this.posInit.z})`);
            } else {
                print("⚠️ btn_home non assigné");
            }

            this.setupBtn();
        });

        this.createEvent("UpdateEvent").bind(() => {
            this.onUpdate();
        });

        print("✅ HomeController prêt");
    }

    // ============================================
    // UPDATE — repositionne + texture selon le mode
    // ============================================

    private onUpdate(): void {
        if (!this.btnTransform) return;

        if (global.isFinishMode && this.currentMode !== "finish") {
            this.currentMode = "finish";
            this.btnTransform.setLocalPosition(this.POS_FINISH);
            this.applyTexture(2); // finish base
            print(`📍 btn_home → FINISH`);

        } else if (global.isSelectedMode && !global.isFinishMode && this.currentMode !== "selected") {
            this.currentMode = "selected";
            this.btnTransform.setLocalPosition(this.POS_SELECTED);
            this.applyTexture(0); // selected base
            print(`📍 btn_home → SELECTED`);

        } else if (!global.isSelectedMode && !global.isFinishMode && this.currentMode !== "init") {
            this.currentMode = "init";
            this.btnTransform.setLocalPosition(this.posInit);
            // En mode init le bouton est caché donc pas de texture à appliquer
            print(`📍 btn_home → INIT`);
        }
    }

    // ============================================
    // SETUP BTN HOME
    // ============================================

    private setupBtn(): void {
        if (!this.btn_home) return;

        let collider = this.btn_home.getComponent("ColliderComponent") as ColliderComponent;
        if (isNull(collider)) collider = this.btn_home.createComponent("ColliderComponent") as ColliderComponent;

        let interactable = this.btn_home.getComponent(Interactable.getTypeName()) as unknown as Interactable;
        if (isNull(interactable)) interactable = this.btn_home.createComponent(Interactable.getTypeName()) as unknown as Interactable;

        interactable.ignoreInteractionPlane = true;

        // --- Hover Enter → texture hover selon le mode courant ---
        interactable.onHoverEnter(() => {
            if (this.currentMode === "finish")   this.applyTexture(3); // finish hover
            else                                  this.applyTexture(1); // selected hover
            print(`✨ Hover ENTER btn_home [${this.currentMode}]`);
        });

        // --- Hover Exit → texture base selon le mode courant ---
        interactable.onHoverExit(() => {
            if (this.currentMode === "finish")   this.applyTexture(2); // finish base
            else                                  this.applyTexture(0); // selected base
            print(`✨ Hover EXIT btn_home [${this.currentMode}]`);
        });

        // --- Tap → reset all ---
        interactable.onTriggerEnd(() => {
            print("🏠 Tap btn_home → reset all");

            global.isSelectedMode = false;
            global.isFinishMode   = false;

            this.resetAll();
        });

        print("🟢 btn_home branché ✓");
    }

    // ============================================
    // APPLY TEXTURE
    // [0] selected base | [1] selected hover
    // [2] finish base   | [3] finish hover
    // ============================================

    private applyTexture(index: number): void {
        if (!this.home_texture) { print("⚠️ home_texture non assigné"); return; }
        if (!this.home_assets || index >= this.home_assets.length) return;

        const texture = this.home_assets[index];
        if (!texture) return;

        const img = this.home_texture.getComponent("Component.Image") as Image;
        if (img && img.mainPass) { img.mainPass.baseTex = texture; return; }

        const rmv = this.home_texture.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        if (rmv && rmv.mainMaterial && rmv.mainMaterial.mainPass) {
            rmv.mainMaterial.mainPass.baseTex = texture;
        }
    }

    // ============================================
    // RESET ALL
    // ============================================

    private resetAll(): void {
        if (global.finishController?.reset) {
            global.finishController.reset();
            print("🌐 finishController.reset() ✓");
        } else {
            print("⚠️ global.finishController non disponible");
        }

        if (global.scaleSlider?.reset) {
            global.scaleSlider.reset();
            print("🌐 scaleSlider.reset() ✓");
        } else {
            print("⚠️ global.scaleSlider non disponible");
        }

        if (global.positionController?.reset) {
            global.positionController.reset();
            print("🌐 positionController.reset() ✓");
        } else {
            print("⚠️ global.positionController non disponible");
        }

        if (global.dotPickerController?.reset) {
            global.dotPickerController.reset();
            print("🌐 dotPickerController.reset() ✓");
        } else {
            print("⚠️ global.dotPickerController non disponible");
        }

        print("✅ Reset complet → retour mode Home");
    }
}