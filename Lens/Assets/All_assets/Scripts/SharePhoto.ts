// ============================================
// PHOTO UPLOAD + READBACK → SUPABASE  (VERSION DÉMO)
// ============================================
// FLOW :
//   1. Tap btn_trigger (bouton SHARE)
//   2. VÉRIF ANTI-DOUBLON : si cette photo a déjà été partagée,
//      on affiche "Photo shared!" et on s'arrête là.
//   3. EXTRACT la texture de sourceImageObject
//   4. Base64.encodeTextureAsync() → JPEG base64
//   5. InternetModule.fetch() POST → Edge Function → { url }
//   6. Si applyDownloadedTexture est ON : retélécharge l'image depuis
//      Supabase et la réaffiche (preuve visuelle pour la démo).
//      Si OFF : upload seul, l'image affichée ne change pas.
//
// ============================================
// ANTI-DOUBLON — PAR IDENTIFIANT, PAS PAR RÉFÉRENCE
//
//   PhotoCapture incrémente global.dotPhotoId à chaque nouvelle photo
//   (et le remet à 0 quand il relâche la photo courante).
//   On mémorise ici le dernier id partagé et on compare.
//
//   ⚠️ POURQUOI PAS EN COMPARANT LES TEXTURES (version précédente) :
//      garder un pointeur sur la texture d'une capture empêche la
//      libération de son buffer caméra natif. La capture SUIVANTE se
//      heurtait alors à l'ancienne, d'où les erreurs
//      "Media state changed to error 255" et
//      "Last trigger of unfinished task is lost" au 2e déclenchement.
//      Un simple nombre ne retient rien.
//
//   Ce fichier va donc AVEC la version de PhotoCapture qui publie
//   global.dotPhotoId. Les deux doivent être remplacés ensemble.
// ============================================
//
// ⚠️ Désactive l'ancien composant PhotoUpload sur le même bouton, sinon
//    les deux scripts s'abonnent à btn_trigger → deux uploads par tap.
// ============================================

import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"

@component
export class PhotoUploadDemo extends BaseScriptComponent {

    // ============================================
    // INPUT - DÉCLENCHEUR (bouton SHARE) + SES TEXTURES
    // ============================================

    @input
    @hint("Le bouton SHARE qui déclenche l'upload de la photo déjà capturée")
    btn_trigger: SceneObject;

    @input
    @allowUndefined
    @hint("SceneObject qui reçoit la texture du bouton trigger. Laisser vide pour utiliser btn_trigger lui-même.")
    btn_trigger_asset: SceneObject;

    @input
    @hint("Textures bouton trigger : [0] = init, [1] = hover")
    btn_trigger_assets: Texture[] = [];

    // ============================================
    // INPUT - SOURCE DE LA PHOTO (déjà capturée par PhotoCapture)
    // ============================================

    @input
    @hint("Le SceneObject photoImage sur lequel PhotoCapture a appliqué la photo. On lit sa texture, puis on y réinjecte celle téléchargée.")
    sourceImageObject: SceneObject;

    @input
    @hint("ON = la photo remplit tout le cadre en gardant le ratio (rogne le surplus). OFF = la photo rentre entière. Doit matcher le réglage de PhotoCapture.")
    fillFrame: boolean = true;

    // ============================================
    // INPUT - LE TRICK DÉMO
    // ============================================

    @input
    @hint("ON = après l'upload, retélécharge la photo depuis Supabase et la réaffiche (preuve visuelle pour la démo). OFF = upload simple.")
    applyDownloadedTexture: boolean = true;

    @input
    @hint("Ajoute ?t=<timestamp> à l'URL pour garantir un vrai téléchargement réseau (pas un cache).")
    cacheBust: boolean = true;

    @input
    @hint("Nombre de tentatives de téléchargement. Le CDN Supabase peut mettre une seconde à servir un fichier tout juste uploadé.")
    downloadRetries: number = 3;

    @input
    @hint("Attente entre deux tentatives de téléchargement (secondes).")
    retryDelaySeconds: number = 0.8;

    // ============================================
    // INPUT - TEXTE DE STATUT / LOADING
    // ============================================

    @input
    @allowUndefined
    @hint("Texte affiché pendant encode/upload/download et pour succès/erreur")
    loadingText: Text;

    @input
    @hint("Message pendant l'encodage + l'envoi")
    msgProcessing: string = "Uploading photo...";

    @input
    @hint("Message pendant le retéléchargement depuis Supabase")
    msgDownloading: string = "Fetching from cloud...";

    @input
    @hint("Message final quand l'image affichée vient de Supabase")
    msgDownloaded: string = "Loaded from cloud!";

    @input
    @hint("Message final quand applyDownloadedTexture est OFF (upload seul)")
    msgSuccess: string = "Saved!";

    @input
    @hint("Message quand on retape SHARE sur une photo déjà partagée (2e, 3e tap...)")
    msgAlreadyShared: string = "Photo shared!";

    @input
    @hint("Message en cas d'erreur")
    msgError: string = "Upload failed";

    @input
    @hint("Cacher le texte de statut X secondes après succès (0 = laisser affiché)")
    hideAfterSeconds: number = 2.0;

    // ============================================
    // INPUT - SUPABASE
    // ============================================

    @input
    @hint("Module Internet (Asset). Requis pour fetch() et makeResourceFromUrl().")
    internetModule: InternetModule;

    @input
    @hint("Remote Media Module (Asset). Requis pour convertir l'URL en Texture.")
    remoteMediaModule: RemoteMediaModule;

    @input
    @hint("URL complète de ta Supabase Edge Function (https://<project>.supabase.co/functions/v1/<name>)")
    edgeFunctionUrl: string = "";

    @input
    @hint("Clé anon/api Supabase (envoyée en Authorization: Bearer + apikey)")
    supabaseAnonKey: string = "";

    // ============================================
    // INPUT - ENCODAGE
    // ============================================

    @input
    @hint("Qualité JPEG : 0=MaxCompression, 1=Low, 2=Intermediate, 3=High, 4=MaxQuality. 2 = bon compromis vitesse/taille.")
    jpegQuality: number = 2;

    // ============================================
    // INPUT - MODE TEST (éditeur, sans caméra ni photo prise)
    // ============================================

    @input
    @hint("ON = utilise testImage au lieu de lire sourceImageObject (test du pipeline dans le preview). OFF = vraie texture capturée.")
    useTestImage: boolean = false;

    @input
    @allowUndefined
    @hint("Texture source utilisée quand useTestImage est ON.")
    testImage: Texture;

    // ============================================
    // VARIABLES
    // ============================================

    private isBusy: boolean = false;

    // Anti-doublon : on retient un NOMBRE, jamais une texture.
    // Retenir une texture de capture bloquerait la capture suivante.
    private lastSharedPhotoId: number = -1;
    private lastUrl: string = "";

    // ============================================
    // INIT
    // ============================================

    onAwake(): void {
        if (this.loadingText) this.loadingText.getSceneObject().enabled = false;

        // Texture idle du bouton dès le départ.
        this.applyButtonTexture(0);

        // SIK : les abonnements Interactable doivent être branchés dans OnStartEvent.
        this.createEvent("OnStartEvent").bind(() => this.setupTriggerBtn());

        print("✅ PhotoUploadDemo prêt (trick démo = "
            + (this.applyDownloadedTexture ? "ON" : "OFF") + ")");
    }

    // ============================================
    // SETUP BTN TRIGGER (+ hover)
    // ============================================

    private setupTriggerBtn(): void {
        if (!this.btn_trigger) { print("⚠️ btn_trigger non assigné"); return; }

        const interactable = this.getOrCreateInteractable(this.btn_trigger, "btn_trigger");
        if (!interactable) return;

        this.subscribe((interactable as any).onHoverEnter, () => {
            this.applyButtonTexture(1);
        });

        this.subscribe((interactable as any).onHoverExit, () => {
            this.applyButtonTexture(0);
        });

        this.subscribe((interactable as any).onTriggerEnd, () => {
            if (this.isBusy) { print("… déjà en cours, tap ignoré"); return; }
            this.onSharePressed();
        });

        print("🟢 btn_trigger branché ✓");
    }

    // ============================================
    // TAP SHARE — vérification anti-doublon AVANT tout le reste
    // ============================================

    private onSharePressed(): void {
        const currentId = this.getCurrentPhotoId();

        if (currentId > 0 && currentId === this.lastSharedPhotoId) {
            print("ℹ️ Photo already uploaded and downloaded — aucun renvoi (photo #" + currentId + ")");
            if (this.lastUrl) print("   URL : " + this.lastUrl);

            // Retour visuel : sans ça l'utilisateur taperait dans le vide.
            this.setStatus(this.msgAlreadyShared);
            this.scheduleHide();
            return;
        }

        print("📤 Trigger SHARE → extract + upload"
            + (this.applyDownloadedTexture ? " + readback" : ""));
        this.runFlow(currentId);
    }

    // Identifiant publié par PhotoCapture. 0 = aucune photo courante.
    private getCurrentPhotoId(): number {
        const id = (global as any).dotPhotoId;
        return typeof id === "number" ? id : 0;
    }

    // ============================================
    // FLOW PRINCIPAL : extract → encode → upload → (download → réaffichage)
    // ============================================

    private async runFlow(photoId: number): Promise<void> {
        this.isBusy = true;
        this.setStatus(this.msgProcessing);
        this.applyButtonTexture(0);

        // ---- 1) VALIDATION CONFIG ----
        if (!this.internetModule) {
            this.fail("internetModule non assigné (glisser un InternetModule dans l'inspecteur)");
            return;
        }
        if (!this.edgeFunctionUrl) {
            this.fail("edgeFunctionUrl vide");
            return;
        }
        if (this.applyDownloadedTexture && !this.remoteMediaModule) {
            this.fail("remoteMediaModule non assigné — requis pour le retéléchargement (ou décoche applyDownloadedTexture)");
            return;
        }

        // ---- 2) SOURCE TEXTURE ----
        let texture: Texture;
        if (this.useTestImage) {
            if (!this.testImage) {
                this.fail("useTestImage est ON mais testImage n'est pas assignée");
                return;
            }
            texture = this.testImage;
            print("🧪 MODE TEST — testImage utilisée : "
                + texture.getWidth() + "x" + texture.getHeight());
        } else {
            if (!this.sourceImageObject) {
                this.fail("sourceImageObject non assigné (glisser le SceneObject photoImage de PhotoCapture)");
                return;
            }
            const extracted = this.extractTexture(this.sourceImageObject);
            if (!extracted) {
                this.fail("aucune texture sur sourceImageObject — prends d'abord une photo avant de partager");
                return;
            }
            texture = extracted;
            print("🖼️ Texture extraite depuis sourceImageObject : "
                + texture.getWidth() + "x" + texture.getHeight());
        }

        // ---- 3) ENCODAGE JPEG BASE64 ----
        let base64: string;
        try {
            const quality = this.resolveQuality(this.jpegQuality);
            print("⏳ Encodage JPEG démarré (qualité niveau " + this.jpegQuality
                + ", source " + texture.getWidth() + "x" + texture.getHeight() + ")...");
            base64 = await this.encodeJpegBase64(texture, quality);
            print("✅ Encodage terminé — base64 length = " + base64.length
                + " (~" + Math.round(base64.length * 0.75 / 1024) + " KB image)");
        } catch (error) {
            this.fail("encodage échoué : " + error);
            return;
        }

        // ---- 4) UPLOAD VERS EDGE FUNCTION ----
        let publicUrl: string;
        try {
            print("📤 Envoi vers : " + this.edgeFunctionUrl);
            const body = JSON.stringify({
                image_base64: base64,
                content_type: "image/jpeg",
            });

            const response = await this.internetModule.fetch(this.edgeFunctionUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + this.supabaseAnonKey,
                    "apikey": this.supabaseAnonKey,
                },
                body: body,
            });

            print("📥 HTTP status : " + response.status + (response.ok ? " (OK)" : " (ERREUR)"));

            if (!response.ok) {
                const errText = await this.safeText(response);
                this.fail("HTTP " + response.status + " : " + errText);
                return;
            }

            const json = await response.json();
            const url = json && json.url ? json.url : null;

            if (!url) {
                this.fail("réponse sans champ 'url' : " + JSON.stringify(json));
                return;
            }

            publicUrl = url;
            print("🔗 URL retournée : " + publicUrl);
        } catch (error) {
            this.fail("requête HTTP échouée : " + error);
            return;
        }

        // L'upload a réussi : on marque cette PHOTO comme partagée, par son
        // id. Aucune référence à la texture n'est conservée.
        this.lastSharedPhotoId = photoId;
        this.lastUrl = publicUrl;

        // ---- 5) TRICK DÉMO : on retélécharge et on réaffiche ----
        if (!this.applyDownloadedTexture) {
            this.succeed(this.msgSuccess, publicUrl);
            return;
        }

        this.setStatus(this.msgDownloading);

        let downloaded: Texture;
        try {
            downloaded = await this.downloadWithRetry(publicUrl);
            print("⬇️ Texture téléchargée depuis Supabase : "
                + downloaded.getWidth() + "x" + downloaded.getHeight());
        } catch (error) {
            // L'upload a réussi, seul l'affichage a échoué.
            this.isBusy = false;
            this.setStatus(this.msgSuccess);
            print("⚠️ Upload OK mais retéléchargement échoué : " + error);
            print("   → l'image reste celle de la caméra. URL = " + publicUrl);
            this.scheduleHide();
            return;
        }

        // ---- 6) RÉINJECTION DANS LE CADRE ----
        if (this.sourceImageObject) {
            const applied = this.applyPhotoTexture(this.sourceImageObject, downloaded);
            if (applied) {
                // Pas besoin de mémoriser cette texture : l'id de la photo n'a
                // pas changé, donc le prochain tap sera bien vu comme un doublon.
                print("✅ Image affichée = fichier Supabase ✓ (aller-retour complet)");
            } else {
                print("⚠️ Impossible d'appliquer la texture sur sourceImageObject");
            }
        } else {
            print("⚠️ sourceImageObject non assigné — texture téléchargée mais pas affichée");
        }

        this.succeed(this.msgDownloaded, publicUrl);
    }

    // ============================================
    // DOWNLOAD : URL → Texture, avec retries
    // ============================================

    private async downloadWithRetry(url: string): Promise<Texture> {
        const attempts = Math.max(1, Math.round(this.downloadRetries));
        let lastError: any = null;

        for (let i = 1; i <= attempts; i++) {
            const finalUrl = this.cacheBust ? this.appendCacheBuster(url) : url;
            print("⬇️ Téléchargement tentative " + i + "/" + attempts + " : " + finalUrl);

            try {
                return await this.loadTextureFromUrl(finalUrl);
            } catch (error) {
                lastError = error;
                print("   … tentative " + i + " échouée : " + error);
                if (i < attempts) await this.delay(this.retryDelaySeconds);
            }
        }

        throw lastError || new Error("téléchargement échoué");
    }

    private loadTextureFromUrl(url: string): Promise<Texture> {
        return new Promise<Texture>((resolve, reject) => {
            let resource: any = null;
            try {
                resource = this.internetModule.makeResourceFromUrl(url);
            } catch (e) {
                reject(new Error("makeResourceFromUrl a jeté : " + e));
                return;
            }

            if (!resource) {
                reject(new Error("makeResourceFromUrl a renvoyé null"));
                return;
            }

            this.remoteMediaModule.loadResourceAsImageTexture(
                resource,
                (texture: Texture) => resolve(texture),
                (errorMsg: string) => reject(new Error(errorMsg || "loadResourceAsImageTexture onFailure"))
            );
        });
    }

    private appendCacheBuster(url: string): string {
        const stamp = Date.now();
        return url + (url.indexOf("?") >= 0 ? "&" : "?") + "t=" + stamp;
    }

    // ============================================
    // EXTRACT : lit la texture appliquée sur un SceneObject
    // ============================================

    private extractTexture(obj: SceneObject): Texture | null {
        if (!obj) return null;

        const img = obj.getComponent("Component.Image") as Image;
        if (img && img.mainPass && img.mainPass.baseTex) {
            return img.mainPass.baseTex;
        }

        const rmv = obj.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        if (rmv && rmv.mainMaterial && rmv.mainMaterial.mainPass && rmv.mainMaterial.mainPass.baseTex) {
            return rmv.mainMaterial.mainPass.baseTex;
        }

        return null;
    }

    // ============================================
    // ENCODAGE
    // ============================================

    private encodeJpegBase64(texture: Texture, quality: CompressionQuality): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            Base64.encodeTextureAsync(
                texture,
                (encoded: string) => resolve(encoded),
                () => reject(new Error("encodeTextureAsync onFailure")),
                quality,
                EncodingType.Jpg
            );
        });
    }

    private resolveQuality(level: number): CompressionQuality {
        const lvls: CompressionQuality[] = [
            CompressionQuality.MaximumCompression, // 0
            CompressionQuality.LowQuality,         // 1
            CompressionQuality.IntermediateQuality,// 2
            CompressionQuality.HighQuality,        // 3
            CompressionQuality.MaximumQuality,     // 4
        ];
        let i = Math.round(level);
        if (i < 0) i = 0;
        if (i > 4) i = 4;
        return lvls[i];
    }

    // ============================================
    // STATUT / SUCCÈS / ERREUR
    // ============================================

    private setStatus(msg: string): void {
        if (!this.loadingText) return;
        this.loadingText.getSceneObject().enabled = true;
        this.loadingText.text = msg;
    }

    private succeed(message: string, url: string): void {
        this.isBusy = false;
        this.setStatus(message);
        print("✅ Terminé ✓ URL = " + url);
        this.scheduleHide();
    }

    private scheduleHide(): void {
        if (this.hideAfterSeconds > 0 && this.loadingText) {
            const delay = this.createEvent("DelayedCallbackEvent");
            delay.bind(() => {
                if (this.loadingText) this.loadingText.getSceneObject().enabled = false;
            });
            delay.reset(this.hideAfterSeconds);
        }
    }

    private fail(reason: string): void {
        this.isBusy = false;
        this.setStatus(this.msgError);
        print("❌ " + reason);
    }

    private async safeText(response: Response): Promise<string> {
        try {
            return await response.text();
        } catch (e) {
            return "(corps illisible : " + e + ")";
        }
    }

    private delay(seconds: number): Promise<void> {
        return new Promise<void>((resolve) => {
            const ev = this.createEvent("DelayedCallbackEvent");
            ev.bind(() => resolve());
            ev.reset(seconds);
        });
    }

    // ============================================
    // TEXTURES DU BOUTON (idle / hover)
    // Même logique que PhotoCapture : Component.Image → mainPass.baseTex,
    // fallback RenderMeshVisual. RIEN d'autre.
    //   - PAS de stretchMode : c'est un réglage de cadre photo, pas de bouton.
    //   - PAS de récursion dans les enfants : on peindrait le mauvais objet.
    // C'était le bug de la version précédente.
    // ============================================

    private applyButtonTexture(index: number): void {
        const target = this.btn_trigger_asset ? this.btn_trigger_asset : this.btn_trigger;
        if (!target) return;
        if (!this.btn_trigger_assets || index < 0 || index >= this.btn_trigger_assets.length) return;

        const texture = this.btn_trigger_assets[index];
        if (!texture) return;

        const img = target.getComponent("Component.Image") as Image;
        if (img && img.mainPass) { img.mainPass.baseTex = texture; return; }

        const rmv = target.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        if (rmv && rmv.mainMaterial && rmv.mainMaterial.mainPass) {
            rmv.mainMaterial.mainPass.baseTex = texture;
        }
    }

    // ============================================
    // APPLIQUER UNE PHOTO SUR LE CADRE
    // Ici stretchMode a du sens : c'est bien un cadre photo.
    // ============================================

    private applyPhotoTexture(obj: SceneObject, texture: Texture): boolean {
        if (!obj || !texture) return false;

        const img = obj.getComponent("Component.Image") as Image;
        if (img && img.mainPass) {
            img.mainPass.baseTex = texture;
            img.stretchMode = this.fillFrame ? StretchMode.FillAndCut : StretchMode.Fit;
            return true;
        }

        const rmv = obj.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        if (rmv && rmv.mainMaterial && rmv.mainMaterial.mainPass) {
            rmv.mainMaterial.mainPass.baseTex = texture;
            return true;
        }

        return false;
    }

    // ============================================
    // HELPERS SIK
    // ============================================

    private subscribe(api: any, callback: () => void): void {
        if (!api) return;

        if (typeof api.add === "function") {
            api.add(callback);
            return;
        }

        if (typeof api === "function") {
            api(callback);
            return;
        }

        print("⚠️ Impossible de s'abonner à un événement SIK (forme d'API inconnue)");
    }

    private getOrCreateInteractable(obj: SceneObject, label: string): Interactable | null {
        let collider = obj.getComponent("ColliderComponent") as ColliderComponent;
        if (isNull(collider)) collider = obj.createComponent("ColliderComponent") as ColliderComponent;

        let interactable = obj.getComponent(Interactable.getTypeName()) as unknown as Interactable;
        if (isNull(interactable)) {
            interactable = obj.createComponent(Interactable.getTypeName()) as unknown as Interactable;
        }

        interactable.ignoreInteractionPlane = true;
        print(`🟢 [${label}] Interactable prêt ✓`);
        return interactable;
    }
}