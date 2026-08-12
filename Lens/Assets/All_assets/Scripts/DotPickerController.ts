// ============================================
// DOT PICKER CONTROLLER
// ============================================
// GLOBAL :
//   global.lastSelectedIndex
//   global.isSelectedMode
//   global.positionController.onItemSelected()
//   global.scaleSlider.setActive()
//   global.wiggleEye.setDotIndex(i)
//   global.dotPickerController.reset()
//   global.dotPickerController.applyFilter(min, max)
//   global.scaleInfo      → référence à scale_info (lu par ScaleSlider)
//   global.scaleInfoDone  → true = slider utilisé = ne plus jamais afficher
// ============================================
// scale_info :
//   Visible UNE SEULE FOIS au tap sur un dot
//   Disparaît dès que ScaleSlider détecte un drag
//   Plus jamais affiché même sur les taps suivants
// ============================================
// no_range :
//   Invisible par défaut.
//   Devient visible UNIQUEMENT quand la plage choisie ne contient
//   aucun dot (filteredIndices.length === 0). Se recache dès qu'il
//   y a au moins un dot dans la plage.
// ============================================

import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"

declare var global: {
    positionController: any;
    scaleSlider: any;
    wiggleEye: any;
    lastSelectedIndex: number;
    dotPickerController: any;
    isSelectedMode: boolean;
    scaleInfo: SceneObject | null;
    scaleInfoDone: boolean;
};

@component
export class DotPickerController extends BaseScriptComponent {

    @input
    @hint("Tous les boutons de la grille, groupes de 6")
    items: SceneObject[] = [];

    @input
    @hint("Objet qui se place sur le bouton de grille survolé")
    hoverItem: SceneObject;

    @input
    @hint("Nombre de dots par item — même ordre que items[]")
    itemDotCounts: number[] = [];

    @input
    @hint("Objets qui deviennent VISIBLES au tap sur un item")
    item_visible: SceneObject[] = [];

    @input
    @hint("Objets qui deviennent INVISIBLES au tap sur un item")
    item_novisible: SceneObject[] = [];

    @input
    @hint("SceneObject qui affiche le dessin dot sélectionné")
    show_dot: SceneObject;

    @input
    @hint("Textures dans le même ordre que items[]")
    showdot_assets: Texture[] = [];

    @input
    @hint("SceneObject affiché sur la feuille")
    on_paper: SceneObject;

    @input
    @hint("Textures dans le même ordre que items[]")
    onpaper_assets: Texture[] = [];

    @input
    @hint("Bouton page suivante")
    nextButton: SceneObject;

    @input
    @hint("SceneObject qui reçoit la texture du bouton Next")
    btnNextAsset: SceneObject;

    @input
    @hint("Textures bouton Next : [0] = base, [1] = hover")
    btnNextAssets: Texture[] = [];

    @input
    @hint("Bouton page précédente")
    previousButton: SceneObject;

    @input
    @hint("SceneObject qui reçoit la texture du bouton Previous")
    btnPrevAsset: SceneObject;

    @input
    @hint("Textures bouton Previous : [0] = base, [1] = hover")
    btnPrevAssets: Texture[] = [];

    @input
    @hint("Texte qui affiche le nom du dot sélectionné")
    labelText: Text;

    @input
    @hint("Noms des dots dans le même ordre que items[]")
    itemLabels: string[] = [];

    // ============================================
    // INPUT - SCALE INFO
    // Visible une seule fois au premier tap sur un dot
    // Disparaît dès que ScaleSlider détecte un drag
    // ============================================

    @input
    @hint("Indication pour le slider de scale — visible une seule fois au premier tap")
    scale_info: SceneObject;

    // ============================================
    // INPUT - NO RANGE
    // Invisible par défaut. Visible uniquement quand la plage
    // choisie ne contient aucun dot (0 résultat).
    // ============================================

    @input
    @hint("Image affichée UNIQUEMENT quand aucun dot n'est dans la plage choisie (invisible sinon)")
    no_range: SceneObject;

    // ============================================
    // POSITIONS GRILLE
    // ============================================

    private readonly POS_ROW1 = [
        new vec3(-11.5525,  4.9304, 2.6362),
        new vec3(  0.5932,  4.9304, 2.6362),
        new vec3( 11.8636,  4.9304, 2.6362),
    ];

    private readonly POS_ROW2 = [
        new vec3(-11.5525, -4.8556, 2.6362),
        new vec3(  0.5932, -4.8556, 2.6362),
        new vec3( 11.8636, -4.8556, 2.6362),
    ];

    // ============================================
    // VARIABLES
    // ============================================

    private readonly PAGE_SIZE: number = 6;
    private readonly ROW_SIZE: number  = 3;

    private currentPage: number = 0;
    private totalPages: number  = 0;

    private onPaperInitialTexture: Texture | null = null;
    private filteredIndices: number[] = [];

    // ============================================
    // INIT
    // ============================================

    onAwake() {
        global.lastSelectedIndex   = 0;
        global.dotPickerController = this;
        global.scaleInfo           = null;
        global.scaleInfoDone       = false;
        print("🌐 DotPickerController enregistré sur global ✓");

        this.createEvent("OnStartEvent").bind(() => {

            if (this.hoverItem) this.hoverItem.enabled = false;

            // scale_info invisible par défaut + enregistrement global
            if (this.scale_info) {
                this.scale_info.enabled = false;
                global.scaleInfo = this.scale_info;
                print("🟢 scale_info assigné sur global ✓");
            } else {
                print("⚠️ scale_info non assigné");
            }

            // no_range invisible par défaut
            if (this.no_range) {
                this.no_range.enabled = false;
                print("🟢 no_range prêt (invisible par défaut) ✓");
            } else {
                print("⚠️ no_range non assigné");
            }

            this.applyNavTexture(this.btnNextAsset, this.btnNextAssets, 0);
            this.applyNavTexture(this.btnPrevAsset, this.btnPrevAssets, 0);

            this.saveOnPaperInitialTexture();

            this.buildFilteredIndices(15, 64);
            this.applyPositions();
            this.applyShowDotAsset(0);

            this.showFilteredPage(this.currentPage);
            this.updateNavVisibility();
            this.setupItems();
            this.setupNavButtons();

            print(`📊 Items : ${this.items.length} | Filtrés : ${this.filteredIndices.length}`);
        });
    }

    // ============================================
    // APPLY FILTER
    // ============================================

    public applyFilter(minDots: number, maxDots: number): void {
        this.buildFilteredIndices(minDots, maxDots);
        this.currentPage = 0;
        this.applyPositions();
        this.showFilteredPage(0);
        this.updateNavVisibility();
        print(`🔍 Filtre [${minDots}→${maxDots}] → ${this.filteredIndices.length} items`);
    }

    // ============================================
    // BUILD FILTERED INDICES
    // ============================================

    private buildFilteredIndices(minDots: number, maxDots: number): void {
        this.filteredIndices = [];
        for (let i = 0; i < this.items.length; i++) {
            const dots = this.itemDotCounts[i] ?? 0;
            if (dots >= minDots && dots <= maxDots) {
                this.filteredIndices.push(i);
            }
        }
        this.totalPages = Math.ceil(this.filteredIndices.length / this.PAGE_SIZE);
        if (this.totalPages === 0) this.totalPages = 1;

        // Met à jour l'image "no_range" : visible seulement si 0 dot dans la plage.
        this.updateNoRangeVisibility();
    }

    // ============================================
    // NO RANGE VISIBILITY
    // Visible uniquement quand la plage ne contient aucun dot.
    // ============================================

    private updateNoRangeVisibility(): void {
        if (!this.no_range) return;
        const empty = this.filteredIndices.length === 0;
        this.no_range.enabled = empty;
        if (empty) {
            print("🚫 no_range visible (0 dot dans la plage choisie)");
        }
    }

    // ============================================
    // NAV VISIBILITY
    // ============================================

    private updateNavVisibility(): void {
        const showNav = this.filteredIndices.length > this.PAGE_SIZE;
        if (this.nextButton)     this.nextButton.enabled     = showNav;
        if (this.previousButton) this.previousButton.enabled = showNav;
    }

    // ============================================
    // RESET
    // ============================================

    public reset(): void {
        this.currentPage = 0;

        this.buildFilteredIndices(15, 64);
        this.applyPositions();
        this.showFilteredPage(0);
        this.updateNavVisibility();

        for (let i = 0; i < this.item_novisible.length; i++) {
            if (this.item_novisible[i]) this.item_novisible[i].enabled = true;
        }
        for (let i = 0; i < this.item_visible.length; i++) {
            if (this.item_visible[i]) this.item_visible[i].enabled = false;
        }

        if (this.on_paper) {
            this.on_paper.enabled = true;
            if (this.onPaperInitialTexture) {
                this.applyTexture(this.on_paper, this.onPaperInitialTexture);
            }
        }

        this.applyShowDotAsset(0);
        this.applyNavTexture(this.btnNextAsset, this.btnNextAssets, 0);
        this.applyNavTexture(this.btnPrevAsset, this.btnPrevAssets, 0);

        if (this.labelText) this.labelText.text = "";
        if (this.hoverItem) this.hoverItem.enabled = false;

        // Reset scale_info
        if (this.scale_info) this.scale_info.enabled = false;
        global.scaleInfoDone = false;

        if (global.wiggleEye?.setDotIndex) global.wiggleEye.setDotIndex(0);
        global.lastSelectedIndex = 0;

        print("🏠 DotPickerController.reset() ✓");
    }

    // ============================================
    // POSITIONS
    // ============================================

    private applyPositions(): void {
        for (let i = 0; i < this.items.length; i++) {
            if (this.items[i]) this.items[i].enabled = false;
        }
        for (let f = 0; f < this.filteredIndices.length; f++) {
            const localIndex = f % this.PAGE_SIZE;
            const col        = localIndex % this.ROW_SIZE;
            const isRow2     = localIndex >= this.ROW_SIZE;
            const obj = this.items[this.filteredIndices[f]];
            if (obj) obj.getTransform().setLocalPosition(isRow2 ? this.POS_ROW2[col] : this.POS_ROW1[col]);
        }
    }

    // ============================================
    // SHOW FILTERED PAGE
    // ============================================

    private showFilteredPage(pageIndex: number): void {
        for (let i = 0; i < this.items.length; i++) {
            if (this.items[i]) this.items[i].enabled = false;
        }
        const start = pageIndex * this.PAGE_SIZE;
        const end   = Math.min(start + this.PAGE_SIZE, this.filteredIndices.length);
        for (let f = start; f < end; f++) {
            const obj = this.items[this.filteredIndices[f]];
            if (obj) obj.enabled = true;
        }
        if (this.hoverItem) this.hoverItem.enabled = false;
        print(`📄 Page : ${pageIndex + 1}/${this.totalPages}`);
    }

    // ============================================
    // SAUVEGARDE TEXTURE INITIALE DE ON_PAPER
    // ============================================

    private saveOnPaperInitialTexture(): void {
        if (!this.on_paper) return;
        const img = this.on_paper.getComponent("Component.Image") as Image;
        if (img && img.mainPass) { this.onPaperInitialTexture = img.mainPass.baseTex; return; }
        const rmv = this.on_paper.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        if (rmv && rmv.mainMaterial && rmv.mainMaterial.mainPass) {
            this.onPaperInitialTexture = rmv.mainMaterial.mainPass.baseTex;
        }
    }

    private applyItemLabel(index: number): void {
        if (!this.labelText || !this.itemLabels || index >= this.itemLabels.length) return;
        this.labelText.text = this.itemLabels[index];
    }

    private applyTapVisibility(): void {
        for (let i = 0; i < this.item_visible.length; i++) {
            if (this.item_visible[i]) this.item_visible[i].enabled = true;
        }
        for (let i = 0; i < this.item_novisible.length; i++) {
            if (this.item_novisible[i]) this.item_novisible[i].enabled = false;
        }
    }

    // ============================================
    // HELPERS - TEXTURES
    // ============================================

    private applyTexture(target: SceneObject, texture: Texture): void {
        if (!target || !texture) return;
        const img = target.getComponent("Component.Image") as Image;
        if (img && img.mainPass) { img.mainPass.baseTex = texture; return; }
        const rmv = target.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        if (rmv && rmv.mainMaterial && rmv.mainMaterial.mainPass) {
            rmv.mainMaterial.mainPass.baseTex = texture;
        }
    }

    private applyNavTexture(target: SceneObject, assets: Texture[], index: number): void {
        if (!target || !assets || index >= assets.length) return;
        this.applyTexture(target, assets[index]);
    }

    private applyShowDotAsset(index: number): void {
        if (!this.showdot_assets || index >= this.showdot_assets.length) return;
        this.applyTexture(this.show_dot, this.showdot_assets[index]);
    }

    private applyOnPaperAsset(index: number): void {
        if (!this.onpaper_assets || index >= this.onpaper_assets.length) return;
        this.applyTexture(this.on_paper, this.onpaper_assets[index]);
    }

    // ============================================
    // HELPER - SETUP INTERACTABLE
    // ============================================

    private setupInteractable(obj: SceneObject, label: string): Interactable | null {
        if (!obj) return null;
        let collider = obj.getComponent("ColliderComponent") as ColliderComponent;
        if (isNull(collider)) collider = obj.createComponent("ColliderComponent") as ColliderComponent;
        let interactable = obj.getComponent(Interactable.getTypeName()) as unknown as Interactable;
        if (isNull(interactable)) interactable = obj.createComponent(Interactable.getTypeName()) as unknown as Interactable;
        interactable.ignoreInteractionPlane = true;
        return interactable;
    }

    // ============================================
    // SETUP ITEMS
    // ============================================

    private setupItems(): void {
        for (let i = 0; i < this.items.length; i++) {
            const obj = this.items[i];
            if (!obj) continue;

            const capturedIndex = i;
            const interactable  = this.setupInteractable(obj, `items[${i}]`);
            if (!interactable) continue;

            interactable.onHoverEnter(() => {
                if (this.hoverItem) {
                    this.hoverItem.getTransform().setLocalPosition(
                        this.items[capturedIndex].getTransform().getLocalPosition()
                    );
                    this.hoverItem.enabled = true;
                }
            });

            interactable.onHoverExit(() => {
                if (this.hoverItem) this.hoverItem.enabled = false;
            });

            interactable.onTriggerEnd(() => {
                print(`👆 Tap items[${capturedIndex}] (${this.itemDotCounts[capturedIndex] ?? '?'} dots)`);

                global.lastSelectedIndex = capturedIndex;
                global.isSelectedMode    = true;

                this.applyTapVisibility();
                this.applyShowDotAsset(capturedIndex);
                this.applyOnPaperAsset(capturedIndex);
                this.applyItemLabel(capturedIndex);

                // scale_info → visible une seule fois (si pas encore été caché par le slider)
                if (this.scale_info && !global.scaleInfoDone) {
                    this.scale_info.enabled = true;
                    print("💡 scale_info visible (tap dot)");
                }

                if (global.wiggleEye?.setDotIndex) {
                    global.wiggleEye.setDotIndex(capturedIndex);
                }
                if (global.positionController?.onItemSelected) global.positionController.onItemSelected();
                if (global.scaleSlider?.setActive)             global.scaleSlider.setActive();

                print(`🌐 lastSelectedIndex=${capturedIndex} | isSelectedMode=true`);
            });
        }
        print("🟢 Items branchés ✓");
    }

    // ============================================
    // SETUP NAV BUTTONS
    // ============================================

    private setupNavButtons(): void {
        const nextInteractable = this.setupInteractable(this.nextButton, "nextButton");
        if (nextInteractable) {
            nextInteractable.onHoverEnter(() => { this.applyNavTexture(this.btnNextAsset, this.btnNextAssets, 1); });
            nextInteractable.onHoverExit(()  => { this.applyNavTexture(this.btnNextAsset, this.btnNextAssets, 0); });
            nextInteractable.onTriggerEnd(() => {
                this.applyNavTexture(this.btnNextAsset, this.btnNextAssets, 0);
                this.currentPage = (this.currentPage + 1) % this.totalPages;
                const delay = this.createEvent("DelayedCallbackEvent");
                delay.bind(() => { this.showFilteredPage(this.currentPage); });
                delay.reset(0.2);
                print(`⏩ Next → page ${this.currentPage + 1}/${this.totalPages}`);
            });
        }

        const prevInteractable = this.setupInteractable(this.previousButton, "previousButton");
        if (prevInteractable) {
            prevInteractable.onHoverEnter(() => { this.applyNavTexture(this.btnPrevAsset, this.btnPrevAssets, 1); });
            prevInteractable.onHoverExit(()  => { this.applyNavTexture(this.btnPrevAsset, this.btnPrevAssets, 0); });
            prevInteractable.onTriggerEnd(() => {
                this.applyNavTexture(this.btnPrevAsset, this.btnPrevAssets, 0);
                this.currentPage = (this.currentPage - 1 + this.totalPages) % this.totalPages;
                const delay = this.createEvent("DelayedCallbackEvent");
                delay.bind(() => { this.showFilteredPage(this.currentPage); });
                delay.reset(0.2);
                print(`⏪ Back → page ${this.currentPage + 1}/${this.totalPages}`);
            });
        }
    }
}