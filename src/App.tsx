import { Routes, Route } from "react-router"

import Home from "./pages/Home"
import AIInspire from "./pages/AIInspire"
import ThamVanTamLy from "./pages/ThamVanTamLy"
import CounselingTopic from "./pages/CounselingTopic"
import NghiDuongDuongSinh from "./pages/NghiDuongDuongSinh"

import ScrollToTop from "./components/ScrollToTop"



function App() {
  return (
    <>

    <ScrollToTop />

    <Routes>

      <Route
        path="/"
        element={<Home />}
      />

      <Route
        path="/ai-inspire"
        element={<AIInspire />}
      />

      <Route
        path="/tham-van-tam-ly"
        element={<ThamVanTamLy />}
      />

      <Route
        path="/tham-van-tam-ly/:topicSlug"
        element={<CounselingTopic />}
      />

      <Route
        path="/nghi-duong-duong-sinh"
        element={<NghiDuongDuongSinh />}
      />

    </Routes>
    </>
  )
}

export default App
