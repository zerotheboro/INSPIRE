import {useCallback, useEffect, useRef, useState} from "react"
import type {FormEvent} from "react"
import {accountCall, emailIdentity, googleIdentity, leaveIdentity, reconnectLocalGuest, watchIdentity} from "../services/inspireIdentity"
import type {AccountView, Preferences} from "../services/inspireIdentity"

const labels: Record<keyof Preferences, string> = {
  name: "Tên muốn được gọi", address: "Cách xưng hô", language: "Ngôn ngữ",
  ageRange: "Khoảng tuổi", context: "Bối cảnh bạn muốn chia sẻ", desiredSupport: "Điều bạn mong được hỗ trợ",
}
export default function InspireAccountPanel({onIdentity}: {onIdentity: (key: string | null) => void}) {
  const [account, setAccount] = useState<AccountView | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [register, setRegister] = useState(false)
  const [preferences, setPreferences] = useState<Preferences | null>(null)
  const [notice, setNotice] = useState("")
  const identity = useRef<string | null>(null)
  const refresh = useCallback(async () => {
    try {
      const next = await accountCall<AccountView>("account")
      if (identity.current !== next.uid) return
      setAccount(next)
      onIdentity(next.uid + (next.registered ? ":registered" : ":guest"))
    } catch (e) { setError((e as Error).message) }
  }, [onIdentity])
  useEffect(() => {
    const stop = watchIdentity((user) => {
      const changed = identity.current !== (user?.uid ?? null)
      identity.current = user?.uid ?? null
      if (changed || !user) {
        setAccount(null); setPreferences(null); setShowProfile(false)
        onIdentity(null)
      }
      if (user) void refresh()
      else setShowAuth(true)
    }, setError)
    const listener = () => { if (identity.current) void refresh() }
    window.addEventListener("inspire-account-refresh", listener)
    return () => { stop(); window.removeEventListener("inspire-account-refresh", listener) }
  }, [refresh, onIdentity])
  async function act(action: () => Promise<unknown>) {
    if (busy) return
    setBusy(true); setError(""); setNotice("")
    try { await action(); await refresh(); setShowAuth(false) }
    catch { setError("Không thể hoàn tất. Kiểm tra email, mật khẩu (ít nhất 6 ký tự) hoặc thử đăng nhập tài khoản đã có.") }
    finally { setBusy(false) }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    void act(() => emailIdentity(String(data.get("email")), String(data.get("password")), register))
  }
  return <section className="ip-account" aria-label="Tài khoản và hạn mức">
    <div className="ip-account-summary">
      <div><strong>{account ? account.registered ? "Tài khoản INSPIRE" : "Đang dùng với tư cách khách" : "Kết nối tài khoản cục bộ"}</strong>
        {account && <p data-testid="quota">Còn <b>{account.quota.remaining}</b> / {account.quota.limit} lượt phản hồi{account.quota.pending ? ` · ${account.quota.pending} lượt chờ xác minh` : ""}.
          {account.quota.nextReset ? ` Làm mới lúc ${new Intl.DateTimeFormat("vi-VN", {timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short", hourCycle: "h23"}).format(new Date(account.quota.nextReset))} (giờ Việt Nam).` : " Hạn mức khách không đặt lại định kỳ."}</p>}
      </div>
      <div className="ip-account-actions">
        {account?.registered ? <><button onClick={() => { void leaveIdentity().catch(() => setError("Chưa đăng xuất được. Vui lòng thử lại.")) }}>Đăng xuất</button></> : <button disabled={busy} onClick={() => setShowAuth(!showAuth)}>Đăng nhập / Đăng ký</button>}
        {account && <button onClick={() => { setShowProfile(!showProfile); setPreferences(account.preferences) }}>Tùy chọn của bạn</button>}
      </div>
    </div>
    {account && !account.registered && <p className="ip-account-explainer">10 phản hồi hoàn tất cho danh tính khách này. Danh tính có thể thay đổi khi đổi thiết bị hoặc xóa dữ liệu trình duyệt; không nhận diện người dùng bằng dấu vân tay thiết bị.</p>}
    {account && account.quota.remaining === 0 && <p className="ip-quota-limit" role="status">{account.registered ? "Hạn mức đã dùng hết hoặc đang chờ đối soát. Bạn có thể xem lại cuộc trò chuyện và ngày làm mới phía trên." : "Hạn mức khách đã hết hoặc đang chờ đối soát. Đăng nhập để dùng 30 lượt phản hồi mỗi tháng; lượt khách không cộng vào hạn mức này."}</p>}
    {showAuth && <form className="ip-auth-form" onSubmit={submit} aria-label="Đăng nhập bằng email">
      <div><h2>{register ? "Tạo tài khoản" : "Chào bạn trở lại"}</h2><p>Chỉ sử dụng tài khoản giả định. Google và email ở đây đều qua Firebase Auth Emulator.</p></div>
      <label>Email<input name="email" type="email" autoComplete="email" required disabled={busy} /></label>
      <label>Mật khẩu<input name="password" type="password" autoComplete={register ? "new-password" : "current-password"} minLength={6} required disabled={busy} /></label>
      <div className="ip-account-actions"><button disabled={busy} type="submit">{busy ? "Đang kết nối…" : register ? "Đăng ký bằng email" : "Đăng nhập bằng email"}</button>
        <button disabled={busy} type="button" onClick={() => void act(googleIdentity)}>Tiếp tục với Google</button>
        <button disabled={busy} type="button" onClick={() => setRegister(!register)}>{register ? "Đã có tài khoản? Đăng nhập" : "Chưa có tài khoản? Đăng ký"}</button></div>
    </form>}
    {showProfile && preferences && <form className="ip-preferences" aria-label="Tùy chọn trò chuyện" onSubmit={(event) => {
      event.preventDefault(); if (busy) return
      setBusy(true); setError("")
      void accountCall("preferences", {value: preferences}).then(() => { setNotice("Đã lưu tùy chọn của bạn."); return refresh() }).catch((e) => setError(e.message)).finally(() => setBusy(false))
    }}><h2>Bạn muốn được đồng hành thế nào?</h2><p>Mọi mục đều tùy chọn, có thể để trống hoặc xóa. Đây là thông tin bạn tự chia sẻ, không phải đánh giá tâm lý. Dữ liệu thử nghiệm chỉ được lưu trong Firestore Emulator cục bộ.</p>
      <div className="ip-profile-grid">{(Object.keys(labels) as (keyof Preferences)[]).map((key) => <label key={key}>{labels[key]}
        {key === "ageRange" ? <select value={preferences[key]} onChange={(event) => setPreferences({...preferences, [key]: event.target.value})}><option value="">Chưa chia sẻ</option>{["under18", "18-29", "30-44", "45-59", "60+"].map((range) => <option key={range} value={range}>{range === "under18" ? "Dưới 18" : range}</option>)}</select> :
          key === "context" || key === "desiredSupport" ? <textarea maxLength={1000} rows={3} value={preferences[key]} onChange={(event) => setPreferences({...preferences, [key]: event.target.value})} /> :
            <input maxLength={100} value={preferences[key]} onChange={(event) => setPreferences({...preferences, [key]: event.target.value})} />}</label>)}</div>
      <button disabled={busy} type="submit">{busy ? "Đang lưu…" : "Lưu tùy chọn"}</button></form>}
    {error && <div className="ip-error" role="alert">{error}<button disabled={busy} onClick={() => void act(reconnectLocalGuest)}>Kết nối lại</button></div>}
    {notice && <p role="status">{notice}</p>}
  </section>
}
