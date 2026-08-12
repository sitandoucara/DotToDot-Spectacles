// ============================================
// WIGGLE EYE — 8 directions + centre
// 16 tableaux séparés, un par dot (dot0 → dot15)
// ============================================
// TRACKING : Main dominante (index tip) UNIQUEMENT.
//   Main détectée hors zone morte → l'oeil regarde vers le doigt.
//   Doigt dans la zone morte OU pas de main → oeil au centre.
// ============================================
// FLUIDITÉ :
//   - Direction lissée (moyenne glissante) → supprime le jitter du tracking.
//   - Hystérésis de secteur → l'oeil "tient" sa direction, plus de flicker
//     entre deux directions voisines.
//   - Hystérésis de zone morte → plus de clignotement centre <-> mouvement.
// ============================================
// eyes_info :
//   Dès que la texture change vers une direction non-centre
//   → global.eyesInfo.enabled = false (une seule fois)
// ============================================

import { HandInputData } from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/HandInputData"

declare var global: {
    wiggleEye: any;
    eyesInfo: SceneObject | null;
};

@component
export class WiggleEye extends BaseScriptComponent {

    @input
    @hint("SceneObject de l'oeil qui reçoit la texture")
    eye: SceneObject;

    @input @hint("Dot 0  — [0]A [1]B [2]C [3]D [4]E [5]F [6]G [7]H [8]I") dot0:  Texture[] = [];
    @input @hint("Dot 1  — [0]A [1]B [2]C [3]D [4]E [5]F [6]G [7]H [8]I") dot1:  Texture[] = [];
    @input @hint("Dot 2  — [0]A [1]B [2]C [3]D [4]E [5]F [6]G [7]H [8]I") dot2:  Texture[] = [];
    @input @hint("Dot 3  — [0]A [1]B [2]C [3]D [4]E [5]F [6]G [7]H [8]I") dot3:  Texture[] = [];
    @input @hint("Dot 4  — [0]A [1]B [2]C [3]D [4]E [5]F [6]G [7]H [8]I") dot4:  Texture[] = [];
    @input @hint("Dot 5  — [0]A [1]B [2]C [3]D [4]E [5]F [6]G [7]H [8]I") dot5:  Texture[] = [];
    @input @hint("Dot 6  — [0]A [1]B [2]C [3]D [4]E [5]F [6]G [7]H [8]I") dot6:  Texture[] = [];
    @input @hint("Dot 7  — [0]A [1]B [2]C [3]D [4]E [5]F [6]G [7]H [8]I") dot7:  Texture[] = [];
    @input @hint("Dot 8  — [0]A [1]B [2]C [3]D [4]E [5]F [6]G [7]H [8]I") dot8:  Texture[] = [];
    @input @hint("Dot 9  — [0]A [1]B [2]C [3]D [4]E [5]F [6]G [7]H [8]I") dot9:  Texture[] = [];
    @input @hint("Dot 10 — [0]A [1]B [2]C [3]D [4]E [5]F [6]G [7]H [8]I") dot10: Texture[] = [];
    @input @hint("Dot 11 — [0]A [1]B [2]C [3]D [4]E [5]F [6]G [7]H [8]I") dot11: Texture[] = [];
    @input @hint("Dot 12 — [0]A [1]B [2]C [3]D [4]E [5]F [6]G [7]H [8]I") dot12: Texture[] = [];
    @input @hint("Dot 13 — [0]A [1]B [2]C [3]D [4]E [5]F [6]G [7]H [8]I") dot13: Texture[] = [];
    @input @hint("Dot 14 — [0]A [1]B [2]C [3]D [4]E [5]F [6]G [7]H [8]I") dot14: Texture[] = [];
    @input @hint("Dot 15 — [0]A [1]B [2]C [3]D [4]E [5]F [6]G [7]H [8]I") dot15: Texture[] = [];

    @input
    @hint("Distance minimale du doigt pour que l'oeil bouge (zone morte main)")
    deadZone: number = 5.0;

    @input
    @hint("Lissage de la direction : plus grand = plus réactif, plus petit = plus doux (5-30). Défaut 15.")
    directionSmooth: number = 15.0;

    @input
    @hint("Marge anti-flicker aux frontières de directions, en degrés (0-20). Plus grand = l'oeil tient mieux sa direction. Défaut 8.")
    hysteresisDeg: number = 8.0;

    @input
    @hint("Marge de la zone morte pour éviter le clignotement centre <-> mouvement. Défaut 1.5.")
    deadZoneMargin: number = 1.5;

    private readonly SECTOR_TO_OFFSET: number[] = [4, 3, 2, 1, 0, 7, 6, 5];
    private readonly CENTER_OFFSET: number = 8;

    private eyeTransform: Transform;
    private handData: HandInputData;

    private currentDotIndex: number = 0;
    private currentOffset: number   = -1;
    private dotSets: Texture[][] = [];

    // État de lissage / hystérésis
    private smoothX: number = 0;
    private smoothY: number = 0;
    private currentSector: number = -1;
    private isMoving: boolean = false;

    onAwake() {
        if (this.eye) {
            this.eyeTransform = this.eye.getTransform();
            print("WiggleEye eye OK");
        }

        this.handData = HandInputData.getInstance();

        this.dotSets = [
            this.dot0,  this.dot1,  this.dot2,  this.dot3,
            this.dot4,  this.dot5,  this.dot6,  this.dot7,
            this.dot8,  this.dot9,  this.dot10, this.dot11,
            this.dot12, this.dot13, this.dot14, this.dot15,
        ];

        global.wiggleEye = this;
        print("WiggleEye enregistre sur global");

        this.applyOffset(this.CENTER_OFFSET);

        this.createEvent("UpdateEvent").bind(() => { this.onUpdate(); });

        print("WiggleEye pret - 16 dots | main uniquement (lissé)");
    }

    public setDotIndex(index: number): void {
        this.currentDotIndex = Math.max(0, Math.min(15, index));
        this.currentOffset   = -1;
        // reset de l'état de lissage pour repartir propre sur le nouveau dot
        this.currentSector = -1;
        this.smoothX = 0;
        this.smoothY = 0;
        this.isMoving = false;
        this.applyOffset(this.CENTER_OFFSET);
        print("WiggleEye dot " + this.currentDotIndex);
    }

    private onUpdate(): void {
        if (!this.eyeTransform) return;

        // TRACKING : Main / Doigt uniquement
        const hand = this.handData?.getDominantHand();
        if (hand && hand.isTracked()) {
            const fingerPos = hand.indexTip.position;
            const eyePos    = this.eyeTransform.getWorldPosition();
            const rawX = fingerPos.x - eyePos.x;
            const rawY = fingerPos.y - eyePos.y;

            // 1) Lissage exponentiel de la direction (filtre le jitter du tracking).
            const t = Math.min(1, getDeltaTime() * this.directionSmooth);
            this.smoothX += (rawX - this.smoothX) * t;
            this.smoothY += (rawY - this.smoothY) * t;

            const dist = Math.sqrt(this.smoothX * this.smoothX + this.smoothY * this.smoothY);

            // 2) Hystérésis centre <-> mouvement (évite le clignotement au bord de la zone morte).
            if (this.isMoving) {
                if (dist < this.deadZone - this.deadZoneMargin) this.isMoving = false;
            } else {
                if (dist > this.deadZone + this.deadZoneMargin) this.isMoving = true;
            }

            if (!this.isMoving) {
                this.applyOffset(this.CENTER_OFFSET);
            } else {
                this.applyFromDirection(this.smoothX, this.smoothY);
            }
            return;
        }

        // Pas de main détectée → oeil au centre + reset lissage
        this.smoothX = 0;
        this.smoothY = 0;
        this.isMoving = false;
        this.applyOffset(this.CENTER_OFFSET);
    }

    private applyFromDirection(dx: number, dy: number): void {
        let angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);
        if (angleDeg < 0) angleDeg += 360;

        // 3) Hystérésis de secteur : tant que l'angle reste dans la plage élargie
        //    du secteur courant, on ne change pas de texture -> plus de flicker.
        if (this.currentSector >= 0) {
            const center = this.currentSector * 45;
            let d = angleDeg - center;
            while (d > 180)  d -= 360;
            while (d < -180) d += 360;
            if (Math.abs(d) <= 22.5 + this.hysteresisDeg) {
                this.applyOffset(this.SECTOR_TO_OFFSET[this.currentSector]);
                return;
            }
        }

        // Sinon on (re)calcule le secteur nominal.
        const sector = Math.floor(((angleDeg + 22.5) % 360) / 45);
        this.currentSector = sector;
        this.applyOffset(this.SECTOR_TO_OFFSET[sector]);
    }

    private applyOffset(offset: number): void {
        if (offset === this.currentOffset) return;
        this.currentOffset = offset;

        // Dès que l'oeil bouge vers une direction non-centre → cache eyes_info
        if (offset !== this.CENTER_OFFSET && global.eyesInfo && global.eyesInfo.enabled) {
            global.eyesInfo.enabled = false;
            print("💡 eyes_info caché (premier mouvement détecté)");
        }

        const set = this.dotSets[this.currentDotIndex];
        if (!set || offset >= set.length) return;

        const texture = set[offset];
        if (!texture) return;

        const img = this.eye.getComponent("Component.Image") as Image;
        if (img && img.mainPass) { img.mainPass.baseTex = texture; return; }

        const rmv = this.eye.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        if (rmv && rmv.mainMaterial && rmv.mainMaterial.mainPass) {
            rmv.mainMaterial.mainPass.baseTex = texture;
        }
    }
}