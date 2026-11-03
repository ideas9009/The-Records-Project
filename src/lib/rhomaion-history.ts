import type { AiChat } from "./rhomaion";
let opened: Promise<IDBDatabase> | undefined;
function database() {
  if (!opened)
    opened = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("records-rhomaion-local", 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore("chats", {
          keyPath: "key",
        });
        store.createIndex("uid", "uid");
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          opened = undefined;
        };
        resolve(request.result);
      };
      request.onerror = () => {
        opened = undefined;
        reject(Error("Local chat storage could not be opened."));
      };
    });
  return opened;
}
async function transact<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore, done: (value: T) => void) => void,
): Promise<T> {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction("chats", mode);
    let result: T;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () =>
      reject(Error("Local chat storage could not be updated."));
    tx.onerror = () =>
      reject(Error("Local chat storage could not be updated."));
    work(tx.objectStore("chats"), (value) => {
      result = value;
    });
  });
}
export function readAiChats(uid: string) {
  return transact<AiChat[]>("readonly", (store, done) => {
    const r = store.index("uid").getAll(uid);
    r.onsuccess = () =>
      done(
        r.result
          .map(({ key, ...chat }) => chat as AiChat)
          .sort((a, b) => b.updatedAt - a.updatedAt),
      );
  });
}
export function saveAiChat(uid: string, chat: AiChat) {
  if (chat.uid !== uid)
    throw Error("This conversation belongs to another account.");
  return transact<void>("readwrite", (store, done) => {
    store.put({
      ...chat,
      messages: chat.messages.slice(-200).map(message=>({...message,previews:message.previews?.map(preview=>preview.kind === "player" ? {...preview,record:{}} : preview)})),
      key: uid + ":" + chat.id,
    });
    done(undefined);
  });
}
export function deleteAiChat(uid: string, id: string) {
  return transact<void>("readwrite", (store, done) => {
    store.delete(uid + ":" + id);
    done(undefined);
  });
}
export function clearAiChats(uid: string) {
  return transact<void>("readwrite", (store, done) => {
    const r = store.index("uid").openCursor(IDBKeyRange.only(uid));
    r.onsuccess = () => {
      const cursor = r.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else done(undefined);
    };
  });
}
