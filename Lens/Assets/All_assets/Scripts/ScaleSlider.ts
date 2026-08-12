// ============================================
// SCALE SLIDER
// Script sur un objet neutre (pas sur la boule)
// slider    : la boule qu'on pince/glisse sur X
// on_paper  : SceneObject #1 dont le scale change
// on_paper2 : SceneObject #2 dont le scale change (même logique)
// info      : SceneObject d'indication → invisible au premier drag
// ============================================
// GLOBAL :
//   global.scaleSlider.setActive()
//   global.scaleSlider.reset()
// ============================================

import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { InteractableManipulation } from "SpectaclesInteractionKit.lspkg/Components/Interaction/InteractableManipulation/InteractableManipulation"

declare var global: {
    scaleSlider: any;
};

@component
export class ScaleSlider extends BaseScriptComponent {

    @input
    @hint("La boule du slider (doit avoir Interactable + InteractableManipulation)")
    slider: SceneObject;

    @input
    @hint("SceneObject #1 dont le scale change selon la position du slider")
    on_paper: SceneObject;

    @input
    @hint("SceneObject #2 dont le scale change selon la position du slider (même logique)")
    on_paper2: SceneObject;

    @input
    @hint("Textures du slider : [0] = base, [1] = hover")
    assets: Texture[] = [];

    @input
    @hint("SceneObject d'indication — devient invisible dès que le user déplace le curseur")
    info: SceneObject;

    private readonly MIN_X: number = -523.1653;
    private readonly MAX_X: number =  510.9901;
    private readonly CENTER_X: number = (-523.1653 + 510.9901) / 2;

    private readonly FIXED_Y: number = -20.0815;
    private readonly FIXED_Z: number =   2.50;

    @input
    @hint("Scale quand la boule est à gauche (min)")
    scaleMin: number = 0.5;

    @input
    @hint("Scale quand la boule est à droite (max)")
    scaleMax: number = 2.0;

    private readonly ON_PAPER_SCALE_INIT: number = 28.0;

    private sliderTransform: Transform;
    private onPaperTransform: Transform;
    private onPaper2Transform: Transform;

    private interactable: Interactable;
    private manipulation: InteractableManipulation;

    private isActive: boolean = false;
    // true après le premier drag → info caché définitivement jusqu'au reset
    private infoHidden: boolean = false;

    // ============================================
    // INIT
    // ============================================

    onAwake() {
        if (this.slider) {
            this.sliderTransform = this.slider.getTransform();
            this.sliderTransform.setLocalPosition(new vec3(this.CENTER_X, this.FIXED_Y, this.FIXED_Z));
            print(`📍 Boule init → centre X: ${this.CENTER_X}`);
        } else {
            print("❌ slider non assigné");
        }

        if (this.on_paper) {
            this.onPaperTransform = this.on_paper.getTransform();
            print("🟢 on_paper assigné ✓");
        } else {
            print("❌ on_paper non assigné");
        }

        if (this.on_paper2) {
            this.onPaper2Transform = this.on_paper2.getTransform();
            print("🟢 on_paper2 assigné ✓");
        } else {
            print("⚠️ on_paper2 non assigné");
        }

        // info visible par défaut
        if (this.info) {
            this.info.enabled = true;
            print("🟢 info assigné ✓");
        } else {
            print("⚠️ info non assigné");
        }

        this.applyTexture(0);

        global.scaleSlider = this;
        print("🌐 ScaleSlider enregistré sur global ✓");

        this.createEvent("OnStartEvent").bind(() => {
            this.setupManipulation();
        });

        this.createEvent("UpdateEvent").bind(() => {
            this.onUpdate();
        });

        print(`✅ ScaleSlider prêt (inactif) — X: [${this.MIN_X} → ${this.MAX_X}]`);
    }

    // ============================================
    // SET ACTIVE
    // ============================================

    public setActive(): void {
        this.isActive   = true;
        this.infoHidden = false; // reset du flag info à chaque nouvelle sélection

        if (this.sliderTransform) {
            this.sliderTransform.setLocalPosition(new vec3(this.CENTER_X, this.FIXED_Y, this.FIXED_Z));
        }

        // Rend info visible à nouveau (nouvel item sélectionné)
        if (this.info) this.info.enabled = true;

        const centerScale = this.scaleMin + (this.scaleMax - this.scaleMin) * 0.5;

        if (this.onPaperTransform) {
            this.onPaperTransform.setLocalScale(new vec3(centerScale, centerScale, centerScale));
        }
        if (this.onPaper2Transform) {
            this.onPaper2Transform.setLocalScale(new vec3(centerScale, centerScale, centerScale));
        }

        print(`▶️ ScaleSlider activé — centre | scale: ${centerScale}`);
    }

    // ============================================
    // RESET
    // ============================================

    public reset(): void {
        this.isActive   = false;
        this.infoHidden = false;

        if (this.onPaperTransform) {
            this.onPaperTransform.setLocalScale(
                new vec3(this.ON_PAPER_SCALE_INIT, this.ON_PAPER_SCALE_INIT, this.ON_PAPER_SCALE_INIT)
            );
        }
        if (this.onPaper2Transform) {
            this.onPaper2Transform.setLocalScale(
                new vec3(this.ON_PAPER_SCALE_INIT, this.ON_PAPER_SCALE_INIT, this.ON_PAPER_SCALE_INIT)
            );
        }

        if (this.sliderTransform) {
            this.sliderTransform.setLocalPosition(new vec3(this.CENTER_X, this.FIXED_Y, this.FIXED_Z));
        }

        // Cache info au reset (on est en mode home)
        if (this.info) this.info.enabled = false;

        this.applyTexture(0);

        print(`🏠 ScaleSlider.reset() ✓`);
    }

    // ============================================
    // SETUP MANIPULATION + HOVER TEXTURE
    // ============================================

    private setupManipulation(): void {
        if (!this.slider) return;

        this.interactable = this.slider.getComponent(Interactable.getTypeName()) as unknown as Interactable;
        if (isNull(this.interactable)) { print("❌ Interactable non trouvé"); return; }
        print("🟢 Interactable ✓");

        this.manipulation = this.slider.getComponent(InteractableManipulation.getTypeName()) as unknown as InteractableManipulation;
        if (isNull(this.manipulation)) { print("❌ InteractableManipulation non trouvé"); return; }
        print("🟢 InteractableManipulation ✓");

        this.manipulation.enableXTranslation = true;
        this.manipulation.enableYTranslation = false;
        this.manipulation.enableZTranslation = false;
        this.manipulation.setCanRotate(false);
        this.manipulation.setCanScale(false);
        this.manipulation.enableStretchZ = false;

        this.manipulation.onTranslationUpdate.add(() => {
            if (!this.isActive) return;

            // Dès le premier mouvement → cache info définitivement
            if (!this.infoHidden && this.info) {
                this.info.enabled = false;
                this.infoHidden   = true;
                print("💡 info caché (premier drag détecté)");
            }

            // Cache scale_info de DotPickerController (une seule fois)
            if ((global as any).scaleInfo && (global as any).scaleInfo.enabled) {
                (global as any).scaleInfo.enabled   = false;
                (global as any).scaleInfoDone        = true;
                print("💡 scale_info caché (drag slider détecté)");
            }

            const pos = this.sliderTransform.getLocalPosition();
            const clampedX = Math.max(this.MIN_X, Math.min(this.MAX_X, pos.x));
            this.sliderTransform.setLocalPosition(new vec3(clampedX, this.FIXED_Y, this.FIXED_Z));
        });

        this.interactable.onHoverEnter(() => {
            this.applyTexture(1);
            print("✨ Hover ENTER slider");
        });

        this.interactable.onHoverExit(() => {
            this.applyTexture(0);
            print("✨ Hover EXIT slider");
        });

        print("🎯 X only + clamp + hover + info configurés ✓");
    }

    // ============================================
    // UPDATE
    // ============================================

    private onUpdate(): void {
        if (!this.isActive) return;

        const pos = this.sliderTransform?.getLocalPosition();
        if (!pos) return;

        const progress = (pos.x - this.MIN_X) / (this.MAX_X - this.MIN_X);
        const scale    = this.scaleMin + (this.scaleMax - this.scaleMin) * progress;

        if (this.onPaperTransform) {
            this.onPaperTransform.setLocalScale(new vec3(scale, scale, scale));
        }
        if (this.onPaper2Transform) {
            this.onPaper2Transform.setLocalScale(new vec3(scale, scale, scale));
        }
    }

    // ============================================
    // APPLY TEXTURE
    // ============================================

    private applyTexture(index: number): void {
        if (!this.slider || !this.assets || index >= this.assets.length) return;
        const texture = this.assets[index];
        if (!texture) return;

        const img = this.slider.getComponent("Component.Image") as Image;
        if (img && img.mainPass) { img.mainPass.baseTex = texture; return; }

        const rmv = this.slider.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        if (rmv && rmv.mainMaterial && rmv.mainMaterial.mainPass) {
            rmv.mainMaterial.mainPass.baseTex = texture;
        }
    }
}