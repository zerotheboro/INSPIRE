import { useState } from "react"
import { Link } from "react-router"
import Icon from "./Icon"
import { NavLink } from "react-router"

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <header className="topbar">

      <Link
        to="/"
        className="brand"
        onClick={() => setMobileMenuOpen(false)}
      >
        <span className="brand-mark">
          <Icon name="leaf" size={21} />
        </span>

        <span className="brand-copy">
          <strong>INSPIRE</strong>
          <small>AI · Tham vấn · Nghỉ dưỡng</small>
        </span>
      </Link>


     <nav className={`main-nav ${mobileMenuOpen ? "open" : ""}`}>

    <NavLink
        to="/"
        viewTransition
        className={({ isActive }) =>
        isActive ? "nav-link active" : "nav-link"
        }
        onClick={() => setMobileMenuOpen(false)}
    >
        Trang chủ
    </NavLink>

    <NavLink
        to="/ai-inspire"
        viewTransition
        className={({ isActive }) =>
        isActive ? "nav-link active" : "nav-link"
        }
        onClick={() => setMobileMenuOpen(false)}
    >
        AI Inspire
    </NavLink>

    <NavLink
        to="/tham-van-tam-ly"
        viewTransition
        className={({ isActive }) =>
        isActive ? "nav-link active" : "nav-link"
        }
        onClick={() => setMobileMenuOpen(false)}
    >
        Tham vấn tâm lý
    </NavLink>

    <NavLink
        to="/nghi-duong-duong-sinh"
        viewTransition
        className={({ isActive }) =>
        isActive ? "nav-link active" : "nav-link"
        }
        onClick={() => setMobileMenuOpen(false)}
    >
        Nghỉ dưỡng & dưỡng sinh
    </NavLink>

    </nav>


      <div className="header-actions">

        <Link
          to="/tham-van-tam-ly"
          className="primary-btn compact"
        >
          Đặt lịch
        </Link>

        <button
          className="menu-btn"
          onClick={() =>
            setMobileMenuOpen(prev => !prev)
          }
          aria-label="Mở menu"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

      </div>

    </header>
  )
}