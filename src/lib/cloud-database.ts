import { collection as firebaseCollection, doc as firebaseDoc, type CollectionReference, type DocumentReference, type Firestore } from "firebase/firestore";
import { db } from "./firebase";
import { cloudPath } from "./cloud-path";
export { db };
export { onSnapshot, query, where, orderBy, limit, addDoc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, runTransaction, writeBatch, arrayUnion, arrayRemove, increment, serverTimestamp, deleteField } from "firebase/firestore";
export function collection(parent: Firestore | DocumentReference | CollectionReference, path: string, ...segments: string[]) {
 return firebaseCollection(parent as Firestore, parent === db ? cloudPath([path, ...segments].join("/")) : [path, ...segments].join("/"));
}
export function doc(parent: Firestore | DocumentReference | CollectionReference, path?: string, ...segments: string[]) {
 if (path === undefined) return firebaseDoc(parent as CollectionReference);
 return firebaseDoc(parent as Firestore, parent === db ? cloudPath([path, ...segments].join("/")) : [path, ...segments].join("/"));
}
