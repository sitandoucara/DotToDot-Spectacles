// ============================================
// PHOTO CAPTURE — CAPTURE FIABLE (flux caméra maintenu actif)
// ============================================
// LE VRAI BUG (corrigé ici)
//
//   requestCamera() renvoie une Texture dont le provider est PILOTÉ PAR LA
//   DEMANDE : tant que personne ne consomme cette texture (aucun rendu,
//   aucun listener onNewFrame), le pipeline caméra peut ne jamais commencer
//   à produire de frames. Le "📹 Flux caméra ouvert ✓" ne prouve que la
//   RÉSERVATION de la caméra, jamais qu'elle STREAME.
//
//   Conséquences observées, toutes issues de cette seule cause :
//     • encodeTextureAsync échoue sur la texture live → elle est vide.
//     • requestImage() échoue → la still-capture s'appuie sur un pipeline
//       qui ne tourne pas ; la tâche native ne se termine jamais, d'où
//       "Last trigger of unfinished task is lost" (message générique du
//       planificateur de tâches, pas une erreur caméra).
//     • La 2e tentative relance requestImage() PENDANT que la 1re tâche est
//       encore inachevée → exactement le même message, en boucle.
//
//   L'ancienne explication (« il faut relâcher la texture précédente,
//   sinon son buffer natif bloque la capture suivante ») était fausse :
//   garder une référence sur une Texture ne bloque pas la caméra. On garde
//   quand même releasePreviousPhoto(), mais pour la bonne raison : garantir
//   qu'aucune image périmée ne reste affichable/partageable en cas d'échec.
//
// LES CORRECTIFS
//   1. onNewFrame : un listener est branché en permanence sur le provider.
//      C'est lui qui maintient le pipeline caméra chaud (cf. ClothingScanner
//      qui obtient le même effet en affichant la texture + en faisant
//      tourner une DepthFrameSession).
//   2. On ne demande JAMAIS une capture avant d'avoir vu passer une frame
//      caméra fraîche (waitForCameraFrame). Plus de course au démarrage.
//   3. Une seule requestImage() en vol à la fois (stillRequestInFlight), et
//      on attend une nouvelle frame entre deux tentatives : on ne re-trigger
//      plus une tâche inachevée.
//   4. Le freeze de secours utilise Texture.copyFrame() — snapshot SYNCHRONE,
//      sans tâche média asynchrone, donc sans "encodeTextureAsync onFailure".
//      L'encode/decode JPEG ne sert plus que de 3e filet (freezeQuality).
//   5. Garde de ré-entrance (captureGeneration) : un countdown abandonné
//      (tap home puis re-tap trigger) ne peut plus déclencher une 2e capture
//      concurrente.
//
// LES 3 VOIES (inchangées côté utilisateur)
//   1. requestImage() → capture HD native.
//   2. Si échec : copyFrame() du flux live = photo figée.
//   3. Si les deux échouent : rien n'est affiché, dotPhotoId reste à 0.
// ============================================

import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";

@component
export class PhotoCapture extends BaseScriptComponent {

    // ============================================
    // INPUT - BOUTON TRIGGER (prise de photo)
    // ============================================

    @input
    @hint("Le bouton pour déclencher la photo")
    btn_trigger: SceneObject;

    @input
    @hint("SceneObject qui reçoit la texture du bouton trigger")
    btn_trigger_asset: SceneObject;

    @input
    @hint("Textures bouton trigger : [0] = init, [1] = hover")
    btn_trigger_assets: Texture[] = [];

    // ============================================
    // INPUT - BOUTON HOME (retour mode selected)
    // ============================================

    @input
    @hint("Le bouton home affiché dans l'écran de capture")
    btn_home: SceneObject;

    @input
    @hint("SceneObject qui reçoit la texture du bouton home")
    btn_home_asset: SceneObject;

    @input
    @hint("Textures bouton home : [0] = init, [1] = hover")
    btn_home_assets: Texture[] = [];

    // ============================================
    // INPUT - TEXTE COUNTDOWN
    // ============================================

    @input
    @hint("Texte affichant le message puis 3, 2, 1, Go!")
    labelText: Text;

    // ============================================
    // INPUT - SUIVI DU TEXTE (follow head)
    // ============================================

    @input
    @hint("Le texte du countdown suit la tête (reste visible en regardant le dessin en bas).")
    labelFollowsHead: boolean = true;

    @input
    @hint("Distance du texte devant la caméra (cm).")
    labelDistance: number = 70;

    @input
    @hint("Vitesse de suivi du texte (plus = plus rapide).")
    labelFollowSpeed: number = 10;

    @input
    @hint("Décalage vertical du texte (cm) : positif = plus haut, pour ne pas couvrir le dessin. 0 = centré.")
    labelHeightOffset: number = 0;

    // ============================================
    // INPUT - IMAGE POUR LA PHOTO (ratio A4 : 1:1.414)
    // ============================================

    @input
    @hint("SceneObject Image qui affiche la photo (ratio A4 1:1.414)")
    photoImage: SceneObject;

    @input
    @hint("Verrouille l'échelle du cadre photo à une valeur fixe (voir Photo Scale ci-dessous).")
    lockPhotoScale: boolean = true;

    @input
    @hint("Échelle fixe du cadre photo (x, y, z).")
    photoScale: vec3 = new vec3(287.4613, 414.3897, 133.3333);

    @input
    @hint("ON = la photo remplit tout le cadre en gardant le ratio (rogne le surplus). OFF = la photo rentre entière (bandes vides).")
    fillFrame: boolean = true;

    // ============================================
    // INPUTS - VISIBILITÉ
    // ============================================

    @input
    @hint("Objets invisibles pendant le countdown — redeviennent visibles au tap home")
    elements_hide: SceneObject[] = [];

    @input
    @hint("Objets visibles après la photo — redeviennent invisibles au tap home")
    elements_show: SceneObject[] = [];

    // ============================================
    // ===== INPUTS CAPTURE =====
    // ============================================

    @input
    @hint("Ouvre le flux caméra au démarrage et le garde ouvert. OBLIGATOIRE : c'est ce flux, maintenu actif, qui rend requestImage() fiable.")
    keepCameraOpen: boolean = true;

    @input
    @hint("Nombre de tentatives de capture haute résolution avant de passer au freeze du flux live.")
    stillAttempts: number = 2;

    @input
    @hint("Délai (s) entre deux tentatives de capture. On attend en plus une nouvelle frame caméra, pour ne pas re-déclencher une tâche inachevée.")
    retryDelay: number = 1.0;

    @input
    @hint("Délai (s) après avoir relâché l'ancienne photo, avant de demander la nouvelle.")
    releaseDelay: number = 0.35;

    @input
    @hint("Si la capture HD échoue : fige le flux live (copyFrame — snapshot synchrone de la frame courante).")
    freezeLiveFallback: boolean = true;

    @input
    @hint("Qualité JPEG du freeze de dernier recours (encode/decode) : 0=MaxCompression, 1=Low, 2=Intermediate, 3=High, 4=MaxQuality. Utilisé seulement si copyFrame() échoue.")
    freezeQuality: number = 3;

    @input
    @hint("Message affiché si aucune image n'a pu être obtenue.")
    msgCaptureFailed: string = "Capture failed — try again";

    // ============================================
    // ===== NOUVEAUX INPUTS (ajoutés en fin de liste) =====
    // ============================================

    @input
    @allowUndefined
    @hint("OPTIONNEL — SceneObject Image qui affiche le flux caméra live (viewfinder). Non requis : le listener onNewFrame suffit à garder la caméra active. À renseigner si tu veux voir le flux, ou en ceinture-bretelles.")
    livePreviewImage: SceneObject = null;

    @input
    @hint("Temps max (s) d'attente d'une frame caméra fraîche avant de tenter une capture. 0 = ne pas attendre (déconseillé).")
    cameraWarmupTimeout: number = 3.0;

    @input
    @hint("OPTIONNEL — démarre aussi une DepthFrameSession pour maintenir le pipeline caméra actif (ce que fait ClothingScanner). Normalement INUTILE ici, et coûteux en énergie. À activer seulement si la capture reste capricieuse.")
    useDepthSessionKeepAlive: boolean = false;

    // ============================================
    // VARIABLES
    // ============================================

    private cameraModule: CameraModule = require("LensStudio:CameraModule");
    private cameraTransform: Transform = null;
    private isBusy: boolean = false;

    // Flux caméra live (texture VIVANTE, elle se rafraîchit sans cesse).
    private cameraTexture: Texture = null;
    private cameraProvider: CameraTextureProvider = null;
    private frameRegistration: any = null;

    // Compteur de frames reçues : preuve que le pipeline caméra STREAME.
    private cameraFrameCount: number = 0;

    // Maintien optionnel du pipeline via depth (cf. ClothingScanner).
    private depthSession: DepthFrameSession = null;

    // Une seule still-capture native en vol à la fois.
    private stillRequestInFlight: boolean = false;

    // Dernière photo capturée. Gardée uniquement pour pouvoir la relâcher.
    private lastPhotoTexture: Texture = null;

    // Compteur de photos, publié sur global pour PhotoUpload.
    private photoCounter: number = 0;

    // Garde de ré-entrance : chaque séquence a son numéro. Une séquence
    // abandonnée (tap home) ne peut plus rien appliquer.
    private captureGeneration: number = 0;

    // ============================================
    // INIT
    // ============================================

    onAwake() {
        if (this.labelText)  this.labelText.getSceneObject().enabled = false;
        if (this.photoImage) this.photoImage.enabled = false;

        for (let i = 0; i < this.elements_show.length; i++) {
            if (this.elements_show[i]) this.elements_show[i].enabled = false;
        }

        this.applyTexture(this.btn_trigger_asset, this.btn_trigger_assets, 0);
        this.applyTexture(this.btn_home_asset, this.btn_home_assets, 0);

        // Aucune photo au départ.
        (global as any).dotPhotoId = 0;

        // createCameraRequest() est interdit dans onAwake → OnStartEvent.
        this.createEvent("OnStartEvent").bind(() => {
            this.startCameraStream();
            this.setupTriggerBtn();
            this.setupHomeBtn();
        });

        this.createEvent("UpdateEvent").bind(() => this.updateLabelFollow());

        this.createEvent("OnDestroyEvent").bind(() => this.cleanup());

        print("✅ PhotoCapture prêt");
    }

    private cleanup(): void {
        try {
            if (this.cameraProvider && this.frameRegistration) {
                this.cameraProvider.onNewFrame.remove(this.frameRegistration);
            }
        } catch (e) { /* rien à faire à la destruction */ }

        try {
            if (this.depthSession) this.depthSession.stop();
        } catch (e) { /* idem */ }
    }

    // ============================================
    // FLUX CAMÉRA PERMANENT — ET SURTOUT : CONSOMMÉ
    // ============================================

    private startCameraStream(): void {
        if (!this.keepCameraOpen) {
            print("⚠️ keepCameraOpen OFF — le pipeline caméra ne sera pas maintenu actif.");
            print("   requestImage() redeviendra intermittent. Laisse cette option ON.");
            return;
        }

        try {
            const cameraRequest = CameraModule.createCameraRequest();
            cameraRequest.cameraId = CameraModule.CameraId.Default_Color;
            this.cameraTexture = this.cameraModule.requestCamera(cameraRequest);
            print("📹 Flux caméra réservé ✓");

            // ---- LE POINT CLÉ ----
            // Un listener onNewFrame donne un consommateur au provider : le
            // pipeline se met réellement à produire des frames, et on sait
            // quand. Sans ça, la texture peut rester vide indéfiniment.
            this.cameraProvider = this.cameraTexture.control as CameraTextureProvider;
            this.frameRegistration = this.cameraProvider.onNewFrame.add(() => {
                this.cameraFrameCount++;
            });
            print("🔌 Listener onNewFrame branché ✓ (pipeline maintenu actif)");

            // Consommateur visuel optionnel — même rôle que cameraFrameImage
            // dans ClothingScanner.
            if (this.livePreviewImage) {
                this.setBaseTex(this.livePreviewImage, this.cameraTexture);
                print("🖥️ Viewfinder live branché ✓");
            }

            if (this.useDepthSessionKeepAlive) this.startDepthKeepAlive();

        } catch (error) {
            print("❌ requestCamera() a échoué : " + error);
            print("   → Project Settings → Permissions : caméra autorisée ?");
        }
    }

    private startDepthKeepAlive(): void {
        try {
            const depthModule: DepthModule = require("LensStudio:DepthModule");
            this.depthSession = depthModule.createDepthFrameSession();
            this.depthSession.onNewFrame.add(() => { /* keep-alive seulement */ });
            this.depthSession.start();
            print("🌊 DepthFrameSession démarrée (keep-alive)");
        } catch (e) {
            print("⚠️ DepthFrameSession indisponible (sans gravité) : " + e);
        }
    }

    /**
     * Attend qu'une frame caméra FRAÎCHE arrive. Renvoie false si le flux ne
     * produit rien dans le délai imparti — dans ce cas, inutile d'appeler
     * requestImage() : la tâche native ne se terminerait pas.
     */
    private async waitForCameraFrame(timeoutSeconds: number): Promise<boolean> {
        if (!this.cameraTexture || !this.cameraProvider) return false;
        if (timeoutSeconds <= 0) return this.cameraFrameCount > 0;

        const target = this.cameraFrameCount + 1;
        const step = 0.05;
        const maxSteps = Math.max(1, Math.ceil(timeoutSeconds / step));

        for (let i = 0; i < maxSteps; i++) {
            if (this.cameraFrameCount >= target) return true;
            await this.delay(step);
        }

        return this.cameraFrameCount >= target;
    }

    // ============================================
    // SETUP BOUTONS
    // ============================================

    private setupTriggerBtn(): void {
        if (!this.btn_trigger) { print("⚠️ btn_trigger non assigné"); return; }

        const interactable = this.getOrCreateInteractable(this.btn_trigger, "btn_trigger");
        if (!interactable) return;

        this.bindEvent(interactable.onHoverEnter, () => {
            this.applyTexture(this.btn_trigger_asset, this.btn_trigger_assets, 1);
        });
        this.bindEvent(interactable.onHoverExit, () => {
            this.applyTexture(this.btn_trigger_asset, this.btn_trigger_assets, 0);
        });
        this.bindEvent(interactable.onTriggerEnd, () => {
            if (this.isBusy) { print("… capture déjà en cours, tap ignoré"); return; }
            print("📸 Trigger → countdown");
            this.startSequence();
        });

        print("🟢 btn_trigger branché ✓");
    }

    private setupHomeBtn(): void {
        if (!this.btn_home) { print("⚠️ btn_home non assigné"); return; }

        const interactable = this.getOrCreateInteractable(this.btn_home, "btn_home");
        if (!interactable) return;

        this.bindEvent(interactable.onHoverEnter, () => {
            this.applyTexture(this.btn_home_asset, this.btn_home_assets, 1);
        });
        this.bindEvent(interactable.onHoverExit, () => {
            this.applyTexture(this.btn_home_asset, this.btn_home_assets, 0);
        });
        this.bindEvent(interactable.onTriggerEnd, () => {
            print("🏠 btn_home → retour mode selected");
            this.returnToSelected();
        });

        print("🟢 btn_home branché ✓");
    }

    // ============================================
    // RETURN TO SELECTED
    // ============================================

    private returnToSelected(): void {
        // Invalide toute séquence en cours : un countdown ou une capture déjà
        // lancés ne pourront plus rien afficher.
        this.captureGeneration++;
        this.isBusy = false;

        this.releasePreviousPhoto();

        if (this.photoImage) this.photoImage.enabled = false;
        if (this.labelText) this.labelText.getSceneObject().enabled = false;

        for (let i = 0; i < this.elements_show.length; i++) {
            if (this.elements_show[i]) this.elements_show[i].enabled = false;
        }

        for (let i = 0; i < this.elements_hide.length; i++) {
            if (this.elements_hide[i]) this.elements_hide[i].enabled = true;
        }

        this.applyTexture(this.btn_trigger_asset, this.btn_trigger_assets, 0);
        this.applyTexture(this.btn_home_asset,    this.btn_home_assets,    0);

        print("✅ Retour mode selected ✓");
    }

    // ============================================
    // LIBÉRATION DE LA PHOTO PRÉCÉDENTE
    // Ce n'est PAS ce qui débloque la caméra (contrairement à ce que disait
    // l'ancienne version) : c'est ce qui garantit qu'aucune image périmée ne
    // reste affichée ou partageable si la capture suivante échoue.
    // ============================================

    private releasePreviousPhoto(): void {
        if (this.photoImage) this.setBaseTex(this.photoImage, null);

        if (this.lastPhotoTexture) {
            this.lastPhotoTexture = null;
            print("🧹 Photo précédente relâchée");
        }

        // Plus aucune photo courante : PhotoUpload le saura.
        (global as any).dotPhotoId = 0;
    }

    // ============================================
    // SEQUENCE CAPTURE
    // ============================================

    private startSequence(): void {
        this.isBusy = true;
        this.captureGeneration++;
        const gen = this.captureGeneration;

        this.applyTexture(this.btn_trigger_asset, this.btn_trigger_assets, 0);

        // On vide le cadre tout de suite : la photo précédente disparaît dès
        // le tap, et ne pourra pas être confondue avec la nouvelle.
        this.releasePreviousPhoto();

        for (let i = 0; i < this.elements_hide.length; i++) {
            if (this.elements_hide[i]) this.elements_hide[i].enabled = false;
        }

        if (this.labelText) {
            this.labelText.getSceneObject().enabled = true;
            this.labelText.text = "Look at your drawing!";
            this.positionLabelInFront(true);
        }

        this.scheduleCountdown(3, gen);
    }

    private scheduleCountdown(count: number, gen: number): void {
        const delay = this.createEvent("DelayedCallbackEvent");

        delay.bind(() => {
            // Séquence abandonnée entre-temps → on ne fait plus rien.
            if (gen !== this.captureGeneration) return;

            if (count > 0) {
                if (this.labelText) this.labelText.text = `${count}`;
                print(`⏳ ${count}`);
                this.scheduleCountdown(count - 1, gen);
            } else {
                if (this.labelText) this.labelText.text = "Go!";
                print("📸 Go!");
                const captureDelay = this.createEvent("DelayedCallbackEvent");
                captureDelay.bind(() => {
                    if (gen !== this.captureGeneration) return;
                    this.runCapture(gen);
                });
                captureDelay.reset(0.3);
            }
        });

        delay.reset(1.0);
    }

    // ============================================
    // LABEL FOLLOW
    // ============================================

    private getCameraTransform(): Transform {
        if (!this.cameraTransform) {
            this.cameraTransform = WorldCameraFinderProvider.getInstance().getTransform();
        }
        return this.cameraTransform;
    }

    private updateLabelFollow(): void {
        if (!this.labelFollowsHead || !this.labelText) return;
        const labelObj = this.labelText.getSceneObject();
        if (!labelObj || !labelObj.enabled) return;
        this.positionLabelInFront(false);
    }

    private positionLabelInFront(snap: boolean): void {
        if (!this.labelFollowsHead || !this.labelText) return;

        const cam = this.getCameraTransform();
        if (!cam) return;

        const labelObj = this.labelText.getSceneObject();
        if (!labelObj) return;

        const camPos = cam.getWorldPosition();
        let targetPos = camPos.add(cam.forward.uniformScale(-this.labelDistance));

        if (this.labelHeightOffset !== 0) {
            targetPos = targetPos.add(cam.up.uniformScale(this.labelHeightOffset));
        }

        const t = labelObj.getTransform();

        if (snap) {
            t.setWorldPosition(targetPos);
        } else {
            t.setWorldPosition(
                vec3.lerp(
                    t.getWorldPosition(),
                    targetPos,
                    getDeltaTime() * this.labelFollowSpeed
                )
            );
        }

        t.setWorldRotation(cam.getWorldRotation());
    }

    // ============================================
    // TAKE PHOTO
    // ============================================

    private async runCapture(gen: number): Promise<void> {

        if (this.releaseDelay > 0) {
            await this.delay(this.releaseDelay);
            if (gen !== this.captureGeneration) return;
        }

        // ---- ÉTAPE 0 : le flux caméra streame-t-il VRAIMENT ? ----
        // Sans cette vérification, on lançait requestImage() sur un pipeline
        // endormi : la tâche native ne se terminait jamais, et la tentative
        // suivante la re-déclenchait → "Last trigger of unfinished task is lost".
        const streaming = await this.waitForCameraFrame(this.cameraWarmupTimeout);
        if (gen !== this.captureGeneration) return;

        if (!streaming) {
            print("⚠️ Aucune frame caméra reçue en " + this.cameraWarmupTimeout
                + "s — le flux ne produit rien.");
        } else {
            print("📹 Flux caméra actif ✓ (" + this.cameraFrameCount + " frames reçues)");
        }

        // ---- VOIE 1 : capture HD ----
        const stillTexture = await this.requestStillCaptureTexture(this.stillAttempts, gen);
        if (gen !== this.captureGeneration) return;

        if (stillTexture) {
            this.applyPhotoToImage(stillTexture);
            print("✅ Capture HD → photoImage ✓ ("
                + stillTexture.getWidth() + "x" + stillTexture.getHeight() + ")");
            this.finishSequence();
            return;
        }

        // ---- VOIE 2 : freeze du flux live ----
        // copyFrame() prend un instantané SYNCHRONE de la frame courante :
        // pas de tâche média asynchrone, donc rien qui puisse "onFailure".
        if (this.freezeLiveFallback && this.cameraTexture && streaming) {
            print("⚠️ Capture HD indisponible → freeze du flux live...");

            const frozen = await this.freezeLiveTexture();
            if (gen !== this.captureGeneration) return;

            if (frozen) {
                this.applyPhotoToImage(frozen);
                print("✅ Freeze OK → photoImage ✓ ("
                    + frozen.getWidth() + "x" + frozen.getHeight() + ") — image figée");
                this.finishSequence();
                return;
            }
        } else if (this.freezeLiveFallback && !streaming) {
            print("⛔ Freeze impossible : la texture live est vide (aucune frame reçue).");
        }

        // ---- VOIE 3 : rien ----
        print("❌ Aucune image disponible");
        this.failSequence();
    }

    private async requestStillCaptureTexture(maxAttempts: number, gen: number): Promise<Texture | null> {
        if (this.stillRequestInFlight) {
            print("⛔ Une still-capture est déjà en vol — on n'en empile pas une seconde.");
            return null;
        }

        const attempts = Math.max(1, Math.round(maxAttempts));
        this.stillRequestInFlight = true;

        try {
            for (let attempt = 1; attempt <= attempts; attempt++) {
                if (gen !== this.captureGeneration) return null;

                try {
                    print("📷 Capture HD tentative " + attempt + "/" + attempts + "...");
                    // ⚠️ On ne touche PAS à imageRequest.resolution : natif imposé.
                    const imageRequest = CameraModule.createImageRequest();
                    const imageFrame = await this.cameraModule.requestImage(imageRequest);

                    if (imageFrame && imageFrame.texture) {
                        return imageFrame.texture;
                    }
                    print("   … frame ou texture nulle");
                } catch (err) {
                    print("   … échec : " + err);
                }

                if (attempt < attempts) {
                    // Deux précautions avant de retenter :
                    //  - laisser le temps à la tâche native précédente de se défaire,
                    //  - exiger une frame caméra fraîche, preuve que le pipeline
                    //    tourne encore, pour ne pas re-trigger une tâche inachevée.
                    await this.delay(Math.max(0.1, this.retryDelay));
                    if (gen !== this.captureGeneration) return null;

                    const alive = await this.waitForCameraFrame(this.cameraWarmupTimeout);
                    if (!alive) {
                        print("   ⛔ Flux caméra muet — on arrête les tentatives HD.");
                        return null;
                    }
                }
            }
        } finally {
            this.stillRequestInFlight = false;
        }

        return null;
    }

    // ============================================
    // FREEZE : texture vivante → texture statique
    // ============================================

    /**
     * 1) copyFrame() — snapshot synchrone, le chemin normal.
     * 2) encode JPEG → decode — filet de dernier recours (utilise freezeQuality).
     */
    private async freezeLiveTexture(): Promise<Texture | null> {
        try {
            const snapshot = this.cameraTexture.copyFrame();
            if (snapshot) return snapshot;
            print("   … copyFrame() a renvoyé null");
        } catch (e) {
            print("   … copyFrame() a échoué : " + e);
        }

        try {
            print("   … repli encode/decode JPEG");
            const quality = this.resolveQuality(this.freezeQuality);
            const base64 = await this.encodeJpeg(this.cameraTexture, quality);
            print("   📦 Encodé — " + Math.round(base64.length * 0.75 / 1024) + " KB");
            return await this.decodeTexture(base64);
        } catch (e) {
            print("   ❌ Freeze échoué : " + e);
            return null;
        }
    }

    private encodeJpeg(texture: Texture, quality: CompressionQuality): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            try {
                Base64.encodeTextureAsync(
                    texture,
                    (s: string) => resolve(s),
                    () => reject(new Error("encodeTextureAsync onFailure")),
                    quality,
                    EncodingType.Jpg
                );
            } catch (e) {
                reject(e);
            }
        });
    }

    private decodeTexture(base64: string): Promise<Texture> {
        return new Promise<Texture>((resolve, reject) => {
            try {
                Base64.decodeTextureAsync(
                    base64,
                    (t: Texture) => resolve(t),
                    () => reject(new Error("decodeTextureAsync onFailure"))
                );
            } catch (e) {
                reject(e);
            }
        });
    }

    private resolveQuality(level: number): CompressionQuality {
        const lvls: CompressionQuality[] = [
            CompressionQuality.MaximumCompression,
            CompressionQuality.LowQuality,
            CompressionQuality.IntermediateQuality,
            CompressionQuality.HighQuality,
            CompressionQuality.MaximumQuality,
        ];
        let i = Math.round(level);
        if (i < 0) i = 0;
        if (i > 4) i = 4;
        return lvls[i];
    }

    private delay(seconds: number): Promise<void> {
        return new Promise<void>((resolve) => {
            const ev = this.createEvent("DelayedCallbackEvent") as any;
            ev.bind(() => resolve());
            ev.reset(seconds);
        });
    }

    // ============================================
    // APPLY PHOTO
    // ============================================

    private applyPhotoToImage(texture: Texture): void {
        if (!this.photoImage || !texture) return;

        if (this.lockPhotoScale) {
            this.photoImage.getTransform().setLocalScale(this.photoScale);
        }

        const img = this.photoImage.getComponent("Component.Image") as Image;
        if (img && img.mainPass) {
            img.mainPass.baseTex = texture;
            img.stretchMode = this.fillFrame ? StretchMode.FillAndCut : StretchMode.Fit;
        } else {
            const rmv = this.photoImage.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
            if (rmv && rmv.mainMaterial && rmv.mainMaterial.mainPass) {
                rmv.mainMaterial.mainPass.baseTex = texture;
                print("⚠️ photoImage n'a pas de Component.Image : stretchMode non appliqué.");
            }
        }

        // Référence gardée UNIQUEMENT pour pouvoir la relâcher plus tard.
        this.lastPhotoTexture = texture;

        // Nouvel identifiant : PhotoUpload saura que c'est une photo inédite.
        this.photoCounter += 1;
        (global as any).dotPhotoId = this.photoCounter;
        print("🆔 Photo #" + this.photoCounter);
    }

    // ============================================
    // FINISH / FAIL
    // ============================================

    private finishSequence(): void {
        if (this.labelText) this.labelText.getSceneObject().enabled = false;
        if (this.photoImage) this.photoImage.enabled = true;

        for (let i = 0; i < this.elements_show.length; i++) {
            if (this.elements_show[i]) this.elements_show[i].enabled = true;
        }

        this.isBusy = false;
        print("✅ Photo affichée — btn_home disponible pour retour");
    }

    private failSequence(): void {
        // Rien à afficher : aucune image périmée ne peut être partagée.
        this.releasePreviousPhoto();

        if (this.photoImage) this.photoImage.enabled = false;

        for (let i = 0; i < this.elements_show.length; i++) {
            if (this.elements_show[i]) this.elements_show[i].enabled = false;
        }

        for (let i = 0; i < this.elements_hide.length; i++) {
            if (this.elements_hide[i]) this.elements_hide[i].enabled = true;
        }

        if (this.labelText) {
            this.labelText.getSceneObject().enabled = true;
            this.labelText.text = this.msgCaptureFailed;

            const gen = this.captureGeneration;
            const hide = this.createEvent("DelayedCallbackEvent");
            hide.bind(() => {
                if (gen !== this.captureGeneration) return;
                if (this.labelText) this.labelText.getSceneObject().enabled = false;
            });
            hide.reset(2.5);
        }

        this.applyTexture(this.btn_trigger_asset, this.btn_trigger_assets, 0);
        this.isBusy = false;
    }

    // ============================================
    // HELPERS
    // ============================================

    /** Écrit une texture (ou null) sur le premier visuel trouvé du SceneObject. */
    private setBaseTex(target: SceneObject, texture: Texture | null): void {
        if (!target) return;

        const img = target.getComponent("Component.Image") as Image;
        if (img && img.mainPass) {
            img.mainPass.baseTex = texture as unknown as Texture;
            return;
        }

        const rmv = target.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        if (rmv && rmv.mainMaterial && rmv.mainMaterial.mainPass) {
            rmv.mainMaterial.mainPass.baseTex = texture as unknown as Texture;
        }
    }

    private applyTexture(target: SceneObject, assets: Texture[], index: number): void {
        if (!target || !assets || index >= assets.length) return;
        const texture = assets[index];
        if (!texture) return;
        this.setBaseTex(target, texture);
    }

    /**
     * SIK expose ses events tantôt comme PublicApi ({add, remove}), tantôt
     * comme fonction directement appelable selon la version. On accepte les
     * deux formes pour ne dépendre d'aucune version précise.
     */
    private bindEvent(evt: any, callback: () => void): void {
        if (!evt) return;
        if (typeof evt.add === "function") { evt.add(callback); return; }
        if (typeof evt === "function") { evt(callback); return; }
        print("⚠️ Event SIK non reconnu — impossible de brancher le callback.");
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
