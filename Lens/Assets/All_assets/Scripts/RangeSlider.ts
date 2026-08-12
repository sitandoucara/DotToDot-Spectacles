// ============================================
// RANGE SLIDER
// Deux boules sur le même axe X
// sliderMin → boule gauche (valeur min)
// sliderMax → boule droite (valeur max)
// ============================================
// CLAMP via onTranslationUpdate
//   → MIN_GAP entre les deux boules en permanence
//   → si contact → bloqué + print "🚫 no range"
// ============================================
// FILL BAR — pivot centre (0,0)
//   position X = midpoint(sliderMin.x, sliderMax.x)
//   scale X    = gap actuel / gap total × scale initial
//   → fonctionne quel que soit le curseur déplacé
// ============================================
// DOTS : min = 15 / max = 64
// assets[] partagé : [0] = base / [1] = hover
// ============================================

import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { InteractableManipulation } from "SpectaclesInteractionKit.lspkg/Components/Interaction/InteractableManipulation/InteractableManipulation"

declare var global: {
    rangeSlider: any;
    dotPickerController: any;
};

@component
export class RangeSlider extends BaseScriptComponent {

    // ============================================
    // INPUTS - LES DEUX BOULES
    // ============================================

    @input
    @hint("Boule gauche — valeur minimum (Interactable + InteractableManipulation)")
    sliderMin: SceneObject;

    @input
    @hint("Boule droite — valeur maximum (Interactable + InteractableManipulation)")
    sliderMax: SceneObject;

    // ============================================
    // INPUT - FILL BAR (pivot centre 0,0)
    // ============================================

    @input
    @hint("Barre de remplissage entre les deux curseurs (pivot centre 0,0)")
    fill_bar: SceneObject;

    // ============================================
    // INPUTS - TEXTES
    // ============================================

    @input
    @hint("Texte affichant la valeur min de dots")
    textMinDots: Text;

    @input
    @hint("Texte affichant la valeur max de dots")
    textMaxDots: Text;

    // ============================================
    // INPUTS - ASSETS PARTAGÉS [0] base / [1] hover
    // ============================================

    @input
    @hint("Textures des boules : [0] = base, [1] = hover")
    assets: Texture[] = [];

    // ============================================
    // CONSTANTES - LIMITES DU SLIDER (local X)
    // ============================================

    private readonly MIN_X: number = -523.1653;
    private readonly MAX_X: number =  510.9901;

    private readonly FIXED_Y: number = -20.0815;
    private readonly FIXED_Z: number =   2.50;

    // ============================================
    // CONSTANTE - GAP MINIMUM ENTRE LES DEUX BOULES
    // ≈ 1 dot de différence minimum
    // ============================================

    private readonly MIN_GAP: number = 21.0;

    // ============================================
    // INPUT - ESPACE DE TOLÉRANCE VISUELLE
    // S'additionne au MIN_GAP
    // Augmente si les boules se touchent encore visuellement
    // ============================================

    @input
    @hint("Tolérance de collision en unités (augmente si les boules se touchent encore, ex: 20, 40, 60...)")
    collisionSpace: number = 20.0;

    // ============================================
    // CONSTANTES - VALEURS DOTS
    // ============================================

    private readonly DOTS_MIN: number = 15;
    private readonly DOTS_MAX: number = 64;

    // ============================================
    // VARIABLES
    // ============================================

    private sliderMinTransform: Transform;
    private sliderMaxTransform: Transform;
    private fillBarTransform: Transform;

    // Scale X initial de la fill bar (sauvegardé au OnStart, quand elle couvre toute la largeur)
    private fillBarInitialScaleX: number = 1.0;

    // Largeur totale du slider
    private readonly TOTAL_WIDTH: number = 510.9901 - (-523.1653);

    private lastDotsMin: number    = -1;
    private lastDotsMax: number    = -1;
    private noRangePrinted: boolean = false;

    // ============================================
    // INIT
    // ============================================

    onAwake() {
        if (this.sliderMin) {
            this.sliderMinTransform = this.sliderMin.getTransform();
            this.sliderMinTransform.setLocalPosition(new vec3(this.MIN_X, this.FIXED_Y, this.FIXED_Z));
            this.applyTexture(this.sliderMin, 0);
            print(`📍 sliderMin init → X: ${this.MIN_X}`);
        } else {
            print("❌ sliderMin non assigné");
        }

        if (this.sliderMax) {
            this.sliderMaxTransform = this.sliderMax.getTransform();
            this.sliderMaxTransform.setLocalPosition(new vec3(this.MAX_X, this.FIXED_Y, this.FIXED_Z));
            this.applyTexture(this.sliderMax, 0);
            print(`📍 sliderMax init → X: ${this.MAX_X}`);
        } else {
            print("❌ sliderMax non assigné");
        }

        global.rangeSlider = this;
        print("🌐 RangeSlider enregistré sur global ✓");

        this.updateTexts();

        this.createEvent("OnStartEvent").bind(() => {

            // Sauvegarde le scale X initial de la fill bar (doit couvrir toute la largeur à l'init)
            if (this.fill_bar) {
                this.fillBarTransform    = this.fill_bar.getTransform();
                this.fillBarInitialScaleX = this.fillBarTransform.getLocalScale().x;
                print(`📏 fill_bar scale initial X: ${this.fillBarInitialScaleX}`);
            } else {
                print("⚠️ fill_bar non assigné");
            }

            this.setupSlider(this.sliderMin, "Min", false);
            this.setupSlider(this.sliderMax, "Max", true);

            // Applique le fill initial (pleine largeur)
            this.updateFillBar();
        });

        this.createEvent("UpdateEvent").bind(() => {
            this.onUpdate();
        });

        print(`✅ RangeSlider prêt — dots: [${this.DOTS_MIN} → ${this.DOTS_MAX}] | gap min: ${this.MIN_GAP}u`);
    }

    // ============================================
    // RESET
    // ============================================

    public reset(): void {
        if (this.sliderMinTransform) {
            this.sliderMinTransform.setLocalPosition(new vec3(this.MIN_X, this.FIXED_Y, this.FIXED_Z));
        }
        if (this.sliderMaxTransform) {
            this.sliderMaxTransform.setLocalPosition(new vec3(this.MAX_X, this.FIXED_Y, this.FIXED_Z));
        }
        this.lastDotsMin    = -1;
        this.lastDotsMax    = -1;
        this.noRangePrinted = false;
        this.updateFillBar();
        this.updateTexts();
        print("🏠 RangeSlider.reset() ✓");
    }

    // ============================================
    // SETUP SLIDER
    // ============================================

    private setupSlider(container: SceneObject, label: string, isMax: boolean): void {
        if (!container) { print(`❌ slider${label} non assigné`); return; }

        const interactable = container.getComponent(Interactable.getTypeName()) as unknown as Interactable;
        if (isNull(interactable)) { print(`❌ Interactable introuvable sur slider${label}`); return; }

        const manipulation = container.getComponent(InteractableManipulation.getTypeName()) as unknown as InteractableManipulation;
        if (isNull(manipulation)) { print(`❌ InteractableManipulation introuvable sur slider${label}`); return; }

        manipulation.enableXTranslation = true;
        manipulation.enableYTranslation = false;
        manipulation.enableZTranslation = false;
        manipulation.setCanRotate(false);
        manipulation.setCanScale(false);
        manipulation.enableStretchZ = false;

        const t = container.getTransform();

        manipulation.onTranslationUpdate.add(() => {
            const pos = t.getLocalPosition();
            let clampedX: number;
            let hitBoundary: boolean = false;

            // Gap effectif = gap minimum (1 dot) + tolérance visuelle réglable
            const effectiveGap = this.MIN_GAP + this.collisionSpace;

            if (isMax) {
                const minBound = this.sliderMinTransform
                    ? this.sliderMinTransform.getLocalPosition().x + effectiveGap
                    : this.MIN_X + effectiveGap;
                clampedX    = Math.max(minBound, Math.min(this.MAX_X, pos.x));
                hitBoundary = (pos.x < minBound);
            } else {
                const maxBound = this.sliderMaxTransform
                    ? this.sliderMaxTransform.getLocalPosition().x - effectiveGap
                    : this.MAX_X - effectiveGap;
                clampedX    = Math.max(this.MIN_X, Math.min(maxBound, pos.x));
                hitBoundary = (pos.x > maxBound);
            }

            t.setLocalPosition(new vec3(clampedX, this.FIXED_Y, this.FIXED_Z));

            if (hitBoundary && !this.noRangePrinted) {
                this.noRangePrinted = true;
                print("🚫 no range");
            } else if (!hitBoundary) {
                this.noRangePrinted = false;
            }
        });

        interactable.onHoverEnter(() => {
            this.applyTexture(container, 1);
            print(`✨ Hover ENTER slider${label}`);
        });

        interactable.onHoverExit(() => {
            this.applyTexture(container, 0);
            print(`✨ Hover EXIT slider${label}`);
        });

        print(`🟢 slider${label} branché ✓`);
    }

    // ============================================
    // UPDATE
    // ============================================

    private onUpdate(): void {
        if (!this.sliderMinTransform || !this.sliderMaxTransform) return;

        this.updateFillBar();
        this.updateTexts();

        const currentMin = this.getMinDots();
        const currentMax = this.getMaxDots();

        if (currentMin !== this.lastDotsMin || currentMax !== this.lastDotsMax) {
            this.lastDotsMin = currentMin;
            this.lastDotsMax = currentMax;

            if (global.dotPickerController?.applyFilter) {
                global.dotPickerController.applyFilter(currentMin, currentMax);
                print(`🔍 Filtre → [${currentMin} → ${currentMax}] dots`);
            }
        }
    }

    // ============================================
    // UPDATE FILL BAR
    // pivot centre (0,0) → position + scale ensemble
    //
    // posX  = midpoint des deux curseurs
    // scaleX = (gap actuel / gap total) × scale initial
    // ============================================

    private updateFillBar(): void {
        if (!this.fillBarTransform || !this.sliderMinTransform || !this.sliderMaxTransform) return;

        const xMin = this.sliderMinTransform.getLocalPosition().x;
        const xMax = this.sliderMaxTransform.getLocalPosition().x;

        // Centre entre les deux curseurs → position X de la fill bar
        const midX = (xMin + xMax) / 2;

        // Proportion du gap actuel par rapport à la largeur totale
        const gap      = xMax - xMin;
        const ratio    = gap / this.TOTAL_WIDTH;
        const newScale = this.fillBarInitialScaleX * ratio;

        // Applique position + scale (Y et Z inchangés)
        const currentPos   = this.fillBarTransform.getLocalPosition();
        const currentScale = this.fillBarTransform.getLocalScale();

        this.fillBarTransform.setLocalPosition(new vec3(midX, currentPos.y, currentPos.z));
        this.fillBarTransform.setLocalScale(new vec3(newScale, currentScale.y, currentScale.z));
    }

    // ============================================
    // TEXTES
    // ============================================

    private updateTexts(): void {
        if (this.textMinDots) this.textMinDots.text = `${this.getMinDots()}`;
        if (this.textMaxDots) this.textMaxDots.text = `${this.getMaxDots()}`;
    }

    // ============================================
    // CONVERSION X → DOTS
    // ============================================

    private xToDots(x: number): number {
        const progress = (x - this.MIN_X) / (this.MAX_X - this.MIN_X);
        return Math.round(this.DOTS_MIN + (this.DOTS_MAX - this.DOTS_MIN) * progress);
    }

    // ============================================
    // GETTERS PUBLICS
    // ============================================

    public getMinDots(): number {
        if (!this.sliderMinTransform) return this.DOTS_MIN;
        return this.xToDots(this.sliderMinTransform.getLocalPosition().x);
    }

    public getMaxDots(): number {
        if (!this.sliderMaxTransform) return this.DOTS_MAX;
        return this.xToDots(this.sliderMaxTransform.getLocalPosition().x);
    }

    // ============================================
    // APPLY TEXTURE
    // ============================================

    private applyTexture(target: SceneObject, index: number): void {
        if (!target || !this.assets || index >= this.assets.length) return;
        const texture = this.assets[index];
        if (!texture) return;

        const img = target.getComponent("Component.Image") as Image;
        if (img && img.mainPass) { img.mainPass.baseTex = texture; return; }

        const rmv = target.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        if (rmv && rmv.mainMaterial && rmv.mainMaterial.mainPass) {
            rmv.mainMaterial.mainPass.baseTex = texture;
        }
    }
}