// ============================================
// MUSIC TOGGLE
// Un bouton pour jouer / mettre en pause la musique
// btn_music  : le bouton (collider + interactable)
// btn_asset  : l'objet qui reçoit la texture
// ============================================
// assets[] :
//   [0] = musique ON  (base)
//   [1] = musique OFF (base)
//   [2] = hover musique ON
//   [3] = hover musique OFF
// ============================================
// 3 POSITIONS selon mode (lues depuis global) :
//   INIT     → POS_INIT
//   SELECTED → POS_SELECTED
//   FINISH   → POS_FINISH
// ============================================

import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"

declare var global: {
    isSelectedMode: boolean;
    isFinishMode: boolean;
};

@component
export class MusicToggle extends BaseScriptComponent {

    @input
    @hint("Le bouton musique (collider + interaction)")
    btn_music: SceneObject;

    @input
    @hint("L'objet qui reçoit la texture")
    btn_asset: SceneObject;

    @input
    @hint("Composant audio à contrôler")
    audio: AudioComponent;

    @input
    @hint("[0] ON base | [1] OFF base | [2] hover ON | [3] hover OFF")
    assets: Texture[] = [];

    // ============================================
    // POSITIONS — une vec3 par mode
    // ============================================

    private readonly POS_INIT:     vec3 = new vec3( 15.6773, 12.8690, 0.20);
    private readonly POS_SELECTED: vec3 = new vec3( 15.6773, 18.0845, 0.20);
    private readonly POS_FINISH:   vec3 = new vec3( 15.6773, 18.0845, 0.20);

    // ============================================
    // VARIABLES
    // ============================================

    private isOn: boolean = true;
    private btnTransform: Transform;
    private currentMode: string = "init"; // "init" | "selected" | "finish"

    // ============================================
    // INIT
    // ============================================

    onAwake() {
        this.createEvent("OnStartEvent").bind(() => {

            if (this.btn_music) {
                this.btnTransform = this.btn_music.getTransform();
                this.btnTransform.setLocalPosition(this.POS_INIT);
                print(`📍 MusicToggle init → POS_INIT`);
            }

            if (this.audio && !this.audio.isPlaying()) {
                this.audio.play(-1);
                print("🎵 Musique démarrée en boucle");
            }

            this.applyTexture(0);
            this.setupInteractable();
        });

        this.createEvent("UpdateEvent").bind(() => {
            this.onUpdate();
        });

        print("✅ MusicToggle prêt");
    }

    // ============================================
    // UPDATE — repositionne selon les flags globaux
    // ============================================

    private onUpdate(): void {
        if (!this.btnTransform) return;

        if (global.isFinishMode && this.currentMode !== "finish") {
            this.currentMode = "finish";
            this.btnTransform.setLocalPosition(this.POS_FINISH);
            print(`📍 MusicToggle → POS_FINISH`);

        } else if (global.isSelectedMode && !global.isFinishMode && this.currentMode !== "selected") {
            this.currentMode = "selected";
            this.btnTransform.setLocalPosition(this.POS_SELECTED);
            print(`📍 MusicToggle → POS_SELECTED`);

        } else if (!global.isSelectedMode && !global.isFinishMode && this.currentMode !== "init") {
            this.currentMode = "init";
            this.btnTransform.setLocalPosition(this.POS_INIT);
            print(`📍 MusicToggle → POS_INIT`);
        }
    }

    // ============================================
    // SETUP INTERACTABLE
    // ============================================

    private setupInteractable(): void {
        if (!this.btn_music) return;

        let collider = this.btn_music.getComponent("ColliderComponent") as ColliderComponent;
        if (isNull(collider)) {
            collider = this.btn_music.createComponent("ColliderComponent") as ColliderComponent;
            print("🟡 ColliderComponent créé dynamiquement");
        } else {
            print("🟢 ColliderComponent détecté ✓");
        }

        let interactable = this.btn_music.getComponent(Interactable.getTypeName()) as unknown as Interactable;
        if (isNull(interactable)) {
            interactable = this.btn_music.createComponent(Interactable.getTypeName()) as unknown as Interactable;
            print("🟡 Interactable créé dynamiquement");
        } else {
            print("🟢 Interactable détecté ✓");
        }

        interactable.ignoreInteractionPlane = true;

        interactable.onHoverEnter(() => {
            this.applyTexture(this.isOn ? 2 : 3);
            print(`✨ Hover ENTER → ${this.isOn ? "hover ON" : "hover OFF"}`);
        });

        interactable.onHoverExit(() => {
            this.applyTexture(this.isOn ? 0 : 1);
            print(`✨ Hover EXIT → ${this.isOn ? "base ON" : "base OFF"}`);
        });

        interactable.onTriggerEnd(() => {
            this.isOn = !this.isOn;

            if (this.isOn) {
                if (this.audio && this.audio.isPaused()) this.audio.resume();
                else if (this.audio && !this.audio.isPlaying()) this.audio.play(-1);
                this.applyTexture(0);
                print("👆 Musique ON 🎵");
            } else {
                if (this.audio && this.audio.isPlaying()) this.audio.pause();
                this.applyTexture(1);
                print("👆 Musique OFF 🔇");
            }
        });

        print("🟢 MusicToggle Interactable prêt ✓");
    }

    // ============================================
    // APPLY TEXTURE sur btn_asset
    // ============================================

    private applyTexture(index: number): void {
        if (!this.btn_asset) { print("⚠️ btn_asset non assigné"); return; }
        if (!this.assets || index >= this.assets.length) return;

        const texture = this.assets[index];
        if (!texture) return;

        const img = this.btn_asset.getComponent("Component.Image") as Image;
        if (img && img.mainPass) { img.mainPass.baseTex = texture; return; }

        const rmv = this.btn_asset.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        if (rmv && rmv.mainMaterial && rmv.mainMaterial.mainPass) {
            rmv.mainMaterial.mainPass.baseTex = texture;
        }
    }
}