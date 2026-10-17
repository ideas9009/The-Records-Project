import { initializeApp } from "firebase/app";
import { initializeAuth, browserLocalPersistence } from "firebase/auth";
import { initializeFirestore, memoryLocalCache } from "firebase/firestore";
// Public client identifiers; access is enforced by Authentication and Firestore rules.
export const firebaseConfig = {
 apiKey: "AIzaSyDX7KTdJ_Jw5SUMlNu-QBTYddQbIL2J8Pc",
 authDomain: "the-records-project-plus.firebaseapp.com",
 projectId: "the-records-project-plus",
 storageBucket: "the-records-project-plus.firebasestorage.app",
 messagingSenderId: "1015142517127",
 appId: "1:1015142517127:web:6cfa2b8b357179dd83eb22",
};
const app = initializeApp(firebaseConfig);
export const auth = initializeAuth(app, {persistence:browserLocalPersistence});
export const db = initializeFirestore(app, { localCache: memoryLocalCache() });
