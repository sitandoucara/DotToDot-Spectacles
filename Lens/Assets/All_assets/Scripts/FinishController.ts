// ============================================
// FINISH CONTROLLER
// ============================================
// GLOBAL FLAGS :
//   global.isFinishMode  → true au tap finish
//   global.finishController.reset()
//   global.eyesInfo → référence à eyes_info (lu par WiggleEye)
// ============================================
// finish_assets[] : [0] base / [1] hover btn_finish
// showhide_assets[] :
//   [0] show eyes base | [1] hide eyes base
//   [2] hover show     | [3] hover hide
// ============================================
// eyes_info :
//   Visible UNE SEULE FOIS quand le user ouvre les yeux
//   Disparaît dès que WiggleEye détecte un mouvement
//   Plus jamais affiché même au toggle suivant
// ============================================

import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"

declare var global: {
    lastSelectedIndex: number;
    finishController: any;
    isFinishMode: boolean;
    eyesInfo: SceneObject | null;
};

@component
export class FinishController extends BaseScriptComponent {

    // ============================================
    // INPUT - BTN FINISH
    // ============================================

    @input
    @hint("Le bouton Finish")
    btn_finish: SceneObject;

    @input
    @hint("SceneObject qui reçoit la texture du bouton Finish")
    finish_texture: SceneObject;

    @input
    @hint("Textures bouton Finish : [0] = base, [1] = hover")
    finish_assets: Texture[] = [];

    // ============================================
    // INPUT - BTN SHOW/HIDE EYES
    // ============================================

    @input
    @hint("Le bouton show/hide eyes")
    btn_show_hide: SceneObject;

    @input
    @hint("[0] show eyes base | [1] hide eyes base | [2] hover show | [3] hover hide")
    showhide_assets: Texture[] = [];

    // ============================================
    // INPUTS - VISIBILITÉ AU TAP FINISH
    // ============================================

    @input
    @hint("Objets qui deviennent VISIBLES au tap sur Finish")
    finish_visible: SceneObject[] = [];

    @input
    @hint("Objets qui deviennent INVISIBLES au tap sur Finish")
    finish_novisible: SceneObject[] = [];

    // ============================================
    // INPUTS - ON PAPER
    // ============================================

    @input
    @hint("Le SceneObject on_paper dont la texture change au tap Finish")
    on_paper: SceneObject;

    @input
    @hint("Texture déco appliquée sur on_paper au tap Finish")
    onpaper_deco_asset: Texture;

    // ============================================
    // INPUT - BONUS OBJECT
    // ============================================

    @input
    @hint("SceneObject bonus — visible dès le tap Finish")
    bonus_object: SceneObject;

    @input
    @hint("Textures bonus — même ordre que items[] dans DotPickerController")
    bonus_assets: Texture[] = [];

    // ============================================
    // INPUT - DOT EYES
    // ============================================

    @input
    @hint("SceneObject des yeux — togglé par le btn show/hide")
    dot_eyes: SceneObject;

    // ============================================
    // INPUT - EYES INFO
    // Visible une seule fois quand le user ouvre les yeux
    // Disparaît dès que WiggleEye détecte un mouvement
    // ============================================

    @input
    @hint("Indication pour les yeux — visible une seule fois à l'ouverture")
    eyes_info: SceneObject;

    // ============================================
    // VARIABLES
    // ============================================

    private isShowingEyes: boolean  = false;
    private eyesInfoShown: boolean  = false; // true = ne plus jamais montrer eyes_info
    private onPaperInitialTexture: Texture | null = null;

    // ============================================
    // INIT
    // ============================================

    onAwake() {
        global.finishController = this;
        global.isFinishMode     = false;
        global.eyesInfo         = null;
        print("🌐 FinishController enregistré sur global ✓");

        this.createEvent("OnStartEvent").bind(() => {
            if (this.bonus_object) this.bonus_object.enabled = false;
            if (this.dot_eyes)     this.dot_eyes.enabled     = false;
            if (this.eyes_info)    this.eyes_info.enabled    = false;

            // Enregistre eyes_info sur global pour WiggleEye
            global.eyesInfo = this.eyes_info ?? null;

            this.saveOnPaperInitialTexture();
            this.applyFinishTexture(0);
            this.applyShowHideTexture(0);
            this.setupFinishBtn();
            this.setupShowHideBtn();
        });

        print("✅ FinishController prêt");
    }

    // ============================================
    // RESET
    // ============================================

    public reset(): void {
        if (this.on_paper) {
            this.on_paper.enabled = true;
            if (this.onPaperInitialTexture) {
                this.applyTexture(this.on_paper, this.onPaperInitialTexture, "on_paper reset");
            }
        }

        if (this.bonus_object) this.bonus_object.enabled = false;
        if (this.dot_eyes)     this.dot_eyes.enabled     = false;
        if (this.eyes_info)    this.eyes_info.enabled    = false;

        this.applyFinishTexture(0);
        this.applyShowHideTexture(0);
        this.isShowingEyes  = false;
        this.eyesInfoShown  = false; // reset → info peut réapparaître au prochain mode finish
        global.isFinishMode = false;

        for (let i = 0; i < this.finish_visible.length; i++) {
            if (this.finish_visible[i]) this.finish_visible[i].enabled = false;
        }
        for (let i = 0; i < this.finish_novisible.length; i++) {
            if (this.finish_novisible[i]) this.finish_novisible[i].enabled = true;
        }

        print("🏠 FinishController.reset() ✓");
    }

    // ============================================
    // SAUVEGARDE TEXTURE INITIALE DE ON_PAPER
    // ============================================

    private saveOnPaperInitialTexture(): void {
        if (!this.on_paper) return;
        const img = this.on_paper.getComponent("Component.Image") as Image;
        if (img && img.mainPass) {
            this.onPaperInitialTexture = img.mainPass.baseTex;
            print("💾 on_paper texture initiale sauvegardée (Image)");
            return;
        }
        const rmv = this.on_paper.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        if (rmv && rmv.mainMaterial && rmv.mainMaterial.mainPass) {
            this.onPaperInitialTexture = rmv.mainMaterial.mainPass.baseTex;
            print("💾 on_paper texture initiale sauvegardée (RenderMeshVisual)");
        }
    }

    // ============================================
    // SETUP BTN FINISH
    // ============================================

    private setupFinishBtn(): void {
        if (!this.btn_finish) { print("⚠️ btn_finish non assigné"); return; }

        const interactable = this.getOrCreateInteractable(this.btn_finish, "btn_finish");
        if (!interactable) return;

        interactable.onHoverEnter(() => { this.applyFinishTexture(1); });
        interactable.onHoverExit(()  => { this.applyFinishTexture(0); });

        interactable.onTriggerEnd(() => {
            print("👆 Tap btn_finish");
            this.applyFinishTexture(0);
            global.isFinishMode = true;

            this.applyFinishVisibility();
            this.applyDecoTexture();

            if (this.bonus_object) {
                this.bonus_object.enabled = true;
                this.applyBonusTexture();
                print("🎁 bonus_object visible ✓");
            }
        });

        print("🟢 btn_finish branché ✓");
    }

    // ============================================
    // SETUP BTN SHOW/HIDE EYES
    // eyes_info : visible UNE SEULE FOIS à la première ouverture
    // ============================================

    private setupShowHideBtn(): void {
        if (!this.btn_show_hide) { print("⚠️ btn_show_hide non assigné"); return; }

        const interactable = this.getOrCreateInteractable(this.btn_show_hide, "btn_show_hide");
        if (!interactable) return;

        interactable.onHoverEnter(() => {
            this.applyShowHideTexture(this.isShowingEyes ? 3 : 2);
        });
        interactable.onHoverExit(() => {
            this.applyShowHideTexture(this.isShowingEyes ? 1 : 0);
        });

        interactable.onTriggerEnd(() => {
            this.isShowingEyes = !this.isShowingEyes;
            this.applyShowHideTexture(this.isShowingEyes ? 1 : 0);

            if (this.dot_eyes) {
                this.dot_eyes.enabled = this.isShowingEyes;
            }

            // eyes_info : visible une seule fois à la première ouverture
            if (this.isShowingEyes && !this.eyesInfoShown && this.eyes_info) {
                this.eyes_info.enabled = true;
                this.eyesInfoShown     = true;
                print("💡 eyes_info affiché (première ouverture)");
            }
            // Si isShowingEyes = false ou eyesInfoShown = true → eyes_info reste caché
            if (!this.isShowingEyes && this.eyes_info) {
                this.eyes_info.enabled = false;
            }

            print(`👆 Toggle eyes → isShowingEyes: ${this.isShowingEyes}`);
        });

        print("🟢 btn_show_hide (eyes) branché ✓");
    }

    // ============================================
    // VISIBILITÉ FINISH
    // ============================================

    private applyFinishVisibility(): void {
        for (let i = 0; i < this.finish_visible.length; i++) {
            if (this.finish_visible[i]) this.finish_visible[i].enabled = true;
        }
        for (let i = 0; i < this.finish_novisible.length; i++) {
            if (this.finish_novisible[i]) this.finish_novisible[i].enabled = false;
        }
        print("✅ Finish → finish_visible ON / finish_novisible OFF");
    }

    private applyDecoTexture(): void {
        this.applyTexture(this.on_paper, this.onpaper_deco_asset, "on_paper deco");
    }

    private applyFinishTexture(index: number): void {
        if (!this.finish_assets || index >= this.finish_assets.length) return;
        this.applyTexture(this.finish_texture, this.finish_assets[index], `finish_texture[${index}]`);
    }

    private applyShowHideTexture(index: number): void {
        if (!this.showhide_assets || index >= this.showhide_assets.length) return;
        this.applyTexture(this.btn_show_hide, this.showhide_assets[index], `showhide[${index}]`);
    }

    private applyBonusTexture(): void {
        const index = (typeof global.lastSelectedIndex === "number") ? global.lastSelectedIndex : 0;
        if (!this.bonus_assets || index >= this.bonus_assets.length) { print(`⚠️ bonus_assets[${index}] absent`); return; }
        this.applyTexture(this.bonus_object, this.bonus_assets[index], `bonus[${index}]`);
        print(`🎁 Bonus texture → index ${index}`);
    }

    private applyTexture(target: SceneObject, texture: Texture, label: string): void {
        if (!target)  { print(`⚠️ [${label}] SceneObject non assigné`); return; }
        if (!texture) { print(`⚠️ [${label}] texture null`); return; }
        const img = target.getComponent("Component.Image") as Image;
        if (img && img.mainPass) { img.mainPass.baseTex = texture; return; }
        const rmv = target.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        if (rmv && rmv.mainMaterial && rmv.mainMaterial.mainPass) {
            rmv.mainMaterial.mainPass.baseTex = texture;
        }
    }

    private getOrCreateInteractable(obj: SceneObject, label: string): Interactable | null {
        let collider = obj.getComponent("ColliderComponent") as ColliderComponent;
        if (isNull(collider)) collider = obj.createComponent("ColliderComponent") as ColliderComponent;
        let interactable = obj.getComponent(Interactable.getTypeName()) as unknown as Interactable;
        if (isNull(interactable)) interactable = obj.createComponent(Interactable.getTypeName()) as unknown as Interactable;
        interactable.ignoreInteractionPlane = true;
        print(`🟢 [${label}] Interactable prêt ✓`);
        return interactable;
    }
}