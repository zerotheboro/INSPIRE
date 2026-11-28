/// <reference types="vite/client" />
import {getApp, getApps, initializeApp} from "firebase/app"
import {connectAuthEmulator, getAuth, GoogleAuthProvider, EmailAuthProvider,
  linkWithCredential, linkWithPopup, onAuthStateChanged, signInAnonymously,
  signInWithEmailAndPassword, signInWithPopup, signOut} from "firebase/auth"
import type {Auth, User} from "firebase/auth"
import {ChatError} from "../../functions/src/inspireChatContract"
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
// Refresh the SDK's existing user only. Never sign in or replace an identity to
// recover authentication for an already-bound request.
export async function currentIdentityToken(auth: Pick<Auth, "currentUser" | "authStateReady">) {
  await auth.authStateReady()
  const user = auth.currentUser
  if (!user) throw new ChatError("UNAUTHENTICATED", "Vui lòng đăng nhập lại cùng tài khoản để kiểm tra lượt gửi.", "replay", 401)
  let token: string
  try { token = await user.getIdToken(true) }
  catch { throw new ChatError("AUTH_REFRESH_FAILED", "Chưa làm mới được xác thực. Chưa gửi thêm yêu cầu tới AI; bạn có thể kiểm tra lại đúng lượt.", "replay", 401) }
  if (auth.currentUser?.uid !== user.uid) throw new ChatError("IDENTITY_CHANGED", "Tài khoản đã thay đổi. Không gửi tiếp lượt của tài khoản trước.", "none", 403)
  return token
}
export async function chatToken() {
  return currentIdentityToken(localAuth())
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

// Explicit operator recovery after an Auth Emulator reset. A healthy identity
// is retained; network failure never creates a replacement or extra quota.
export async function reconnectLocalGuest() {
  const auth = localAuth()
  await auth.authStateReady()
  const user = auth.currentUser
  if (user) {
    try { await user.getIdToken(true); return }
    catch (error) {
      if (!user.isAnonymous || !["auth/user-not-found", "auth/user-token-expired", "auth/invalid-user-token"].includes((error as {code?: string}).code ?? "")) throw error
    }
  }
  localStorage.setItem(marker, "1")
  await signOut(auth)
  await signInAnonymously(auth)
}

export type {Preferences}
