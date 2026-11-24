/// <reference types="vite/client" />
import {getApp, getApps, initializeApp} from "firebase/app"
import {connectAuthEmulator, getAuth, GoogleAuthProvider, EmailAuthProvider,
  linkWithCredential, linkWithPopup, onAuthStateChanged, signInAnonymously,
  signInWithEmailAndPassword, signInWithPopup, signOut} from "firebase/auth"
import type {User} from "firebase/auth"
import type {Preferences} from "../../functions/src/inspireAccount"

export type AccountView = {
  uid: string; registered: boolean; email: string | null; providers: string[]
  quota: {limit: number; completed: number; pending: number; remaining: number; period: string; nextReset: string | null}
  preferences: Preferences
}
const marker = "inspire-known-account"
let connected = false
let creatingGuest: Promise<unknown> | undefined
function localAuth() {
  if (!import.meta.env.DEV || import.meta.env.MODE !== "development") throw Error("Kết nối tài khoản chưa được mở trên bản xuất bản.")
  const app = getApps().some((a) => a.name === "inspire-local") ? getApp("inspire-local") : initializeApp({
    projectId: "demo-inspire", apiKey: "demo-inspire-local-only", authDomain: "demo-inspire.firebaseapp.com",
  }, "inspire-local")
  const auth = getAuth(app)
  if (!connected) { connectAuthEmulator(auth, "http://127.0.0.1:9099", {disableWarnings: true}); connected = true }
  return auth
}
export async function chatToken() {
  const user = localAuth().currentUser
  if (!user) throw Error("Vui lòng đăng nhập để tiếp tục.")
  return user.getIdToken(true)
}
export async function accountCall<T>(kind: string, fields: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch("/api/inspire-prototype", {method: "POST", headers: {
    "Content-Type": "application/json", Authorization: `Bearer ${await chatToken()}`,
  }, body: JSON.stringify({kind, ...fields}), cache: "no-store"})
  const data = await response.json()
  if (!response.ok) throw Error(data.error?.message ?? "Không thể kết nối tài khoản.")
  return data as T
}
export function watchIdentity(callback: (user: User | null) => void, error: (message: string) => void) {
  const auth = localAuth()
  return onAuthStateChanged(auth, async (user) => {
    if (user && !user.isAnonymous) localStorage.setItem(marker, "1")
    if (!user && !localStorage.getItem(marker)) {
      try { creatingGuest ??= signInAnonymously(auth); await creatingGuest }
      catch { error("Chưa kết nối được danh tính khách. Hãy kiểm tra trình mô phỏng và tải lại trang.") }
      finally { creatingGuest = undefined }
      return
    }
    callback(user)
  })
}
export async function emailIdentity(email: string, password: string, register: boolean) {
  const auth = localAuth(), previous = auth.currentUser
  const guestToken = previous?.isAnonymous ? await previous.getIdToken() : undefined
  if (register && previous?.isAnonymous) {
    await linkWithCredential(previous, EmailAuthProvider.credential(email, password))
  } else {
    if (register) {
      const {createUserWithEmailAndPassword} = await import("firebase/auth")
      await createUserWithEmailAndPassword(auth, email, password)
    } else await signInWithEmailAndPassword(auth, email, password)
  }
  localStorage.setItem(marker, "1")
  if (guestToken && previous?.uid !== auth.currentUser?.uid) await accountCall("link-guest", {previousToken: guestToken})
}
export async function googleIdentity() {
  const auth = localAuth(), previous = auth.currentUser
  const guestToken = previous?.isAnonymous ? await previous.getIdToken() : undefined
  const provider = new GoogleAuthProvider()
  if (previous?.isAnonymous) {
    try { await linkWithPopup(previous, provider) }
    catch (error) {
      const code = (error as {code?: string}).code
      if (code !== "auth/credential-already-in-use") throw error
      const credential = GoogleAuthProvider.credentialFromError(error as Parameters<typeof GoogleAuthProvider.credentialFromError>[0])
      if (!credential) throw error
      const {signInWithCredential} = await import("firebase/auth")
      await signInWithCredential(auth, credential)
    }
  } else await signInWithPopup(auth, provider)
  localStorage.setItem(marker, "1")
  if (guestToken && previous?.uid !== auth.currentUser?.uid) await accountCall("link-guest", {previousToken: guestToken})
}
export async function leaveIdentity() {
  // A normal sign-out never automatically creates another anonymous identity.
  localStorage.setItem(marker, "1")
  await signOut(localAuth())
}

export type {Preferences}
