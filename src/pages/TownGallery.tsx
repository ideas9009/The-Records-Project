import { SyncStatus } from "../components/SmartSync";
import { Spinner, LoadingStatus } from "../components/Loading";
import { useEffect, useRef, useState } from "react";
import { PREVIEW_MODE } from "../lib/runtime-mode";
import { useAuth } from "../lib/auth-context";
import { canPerform } from "../lib/access";
import {
  watchTownPhotos,
  saveTownPhotos,
  prepareTownPhoto,
  updateTownPhoto,
  MAX_TOWN_PHOTOS,
  type TownPhoto,
} from "../lib/town-gallery";
import { TownIcon } from "./TownRegistry";
export default function TownGallery({
  town,
}: {
  town: {
    id: string;
    name: string;
    mayor: string;
    mayorUid: string;
    mayorUids?: string[];
  };
}) {
  const [photos, setPhotos] = useState<TownPhoto[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirmRemove, setConfirmRemove] = useState(false),
    [selected, setSelected] = useState<TownPhoto | null>(null);
  const picker = useRef<HTMLInputElement>(null),
    dialog = useRef<HTMLDialogElement>(null),
    replacementPicker = useRef<HTMLInputElement>(null);
  const { account } = useAuth();
  const isMayor =
    !PREVIEW_MODE &&
    !!account &&
    (account.uid === town.mayorUid ||
      !!town.mayorUids?.includes(account.uid)) &&
    canPerform(account, "upload-town-image");
  useEffect(() => {
    if (PREVIEW_MODE) {
      setPhotos([]);
      setLoading(false);
      return;
    }
    return watchTownPhotos(
      town.id,
      (items) => {
        setPhotos(items);
        setLoading(false);
      },
      () => {
        setPhotos([]);
        setError("Gallery could not be loaded from Firebase.");
        setLoading(false);
      },
    );
  }, [town.id]);
  useEffect(() => {
    if (selected) dialog.current?.showModal();
  }, [selected]);
  async function upload(files: File[]) {
    if (!files.length || !isMayor || busy) return;
    setError("");
    setBusy(true);
    try {
      if (photos.length + files.length > MAX_TOWN_PHOTOS)
        throw Error("A town gallery can contain up to 12 images.");
      const incoming: TownPhoto[] = [];
      for (const file of files)
        incoming.push({
          id: crypto.randomUUID(),
          src: await prepareTownPhoto(file),
          uploadedBy: account!.username,
          createdAt: new Date().toISOString(),
        });
      setPhotos(await saveTownPhotos(town.id, incoming, account!.username));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Images could not be saved. Please try again.",
      );
    } finally {
      setBusy(false);
      if (picker.current) picker.current.value = "";
    }
  }
  async function changePhoto(action: "replace"|"remove", file?: File) {
    if(!selected || !isMayor || busy || (action==="replace" && !file))return;
    const previous=selected;
    setBusy(true);setError("");
    try {
      const src=file ? await prepareTownPhoto(file) : undefined;
      const items=await updateTownPhoto(town.id,previous,action,src);
      setPhotos(items);setConfirmRemove(false);
      if(action==="remove"){dialog.current?.close();setSelected(null)}
      else setSelected(items.find(photo=>photo.id===previous.id)||null);
    } catch(reason) {
      setError(reason instanceof Error ? reason.message : "The gallery could not be updated.");
    } finally {setBusy(false);if(replacementPicker.current)replacementPicker.current.value="";}
  }
  return (
    <section
      className="card town-gallery"
      aria-labelledby="town-gallery-heading"
      aria-busy={busy || loading}
    >
      <div className="town-gallery-header">
        <h2 id="town-gallery-heading">Town gallery</h2>
        {isMayor && (
          <button
            disabled={loading || busy || photos.length >= MAX_TOWN_PHOTOS}
            onClick={() => picker.current?.click()}
          >
            {busy ? <Spinner /> : <TownIcon name="add_photo_alternate" />}
            {busy ? "Saving…" : "Add images"}
          </button>
        )}
      </div>
      <input
        ref={picker}
        className="town-gallery-input"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        aria-label="Upload town images"
        onChange={(event) => void upload(Array.from(event.target.files ?? []))}
      />
      <p className="town-gallery-storage">Gallery images keep their original resolution. If an image cannot fit the storage limit, it will not be uploaded.</p>
      <SyncStatus path={"/api/towns/" + town.id + "/photos"} />
      {error && (
        <p className="town-gallery-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <LoadingStatus>Loading gallery…</LoadingStatus>
      ) : photos.length ? (
        <div className="town-gallery-grid">
          {photos.map((photo, index) => (
            <button
              key={photo.id}
              className="town-gallery-photo"
              aria-label={"View town image " + (index + 1)}
              onClick={() => {setConfirmRemove(false);setError("");setSelected(photo)}}
            >
              <img
                src={photo.src}
                alt={town.name + " — image " + (index + 1)}
                loading="lazy"
              />
            </button>
          ))}
        </div>
      ) : (
        <p className="town-gallery-empty">No images added.</p>
      )}

      {PREVIEW_MODE && (
        <p className="town-gallery-storage">
          Gallery uploads are paused in preview mode.
        </p>
      )}
      <dialog
        ref={dialog}
        className="town-photo-dialog"
        aria-label={town.name + " gallery image"}
        onCancel={event=>{if(busy)event.preventDefault()}}
        onClose={() => {setSelected(null);setConfirmRemove(false)}}
        onClick={(event) => {
          if (!busy && event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <button
          className="town-photo-close"
          disabled={busy}
          aria-label="Close image"
          onClick={() => dialog.current?.close()}
        >
          <TownIcon name="close" />
        </button>
        {selected && <img src={selected.src} alt={town.name} />}
        {isMayor && selected && <div className="town-photo-actions">
          <input ref={replacementPicker} className="town-gallery-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Replace gallery image" onChange={event=>void changePhoto("replace",event.target.files?.[0])}/>
          <button disabled={busy} onClick={()=>{setConfirmRemove(false);replacementPicker.current?.click()}}>Replace image</button>
          <button disabled={busy} onClick={()=>setConfirmRemove(true)}>Remove image</button>
          {busy && <span role="status">Saving…</span>}
          {confirmRemove && <div className="town-photo-confirm">
            <p>Remove this image permanently from the town gallery?</p>
            <button disabled={busy} onClick={()=>void changePhoto("remove")}>Confirm removal</button>
            <button disabled={busy} onClick={()=>setConfirmRemove(false)}>Keep image</button>
          </div>}
          {error && <p role="alert" className="town-gallery-error">{error}</p>}
        </div>}
      </dialog>
    </section>
  );
}
