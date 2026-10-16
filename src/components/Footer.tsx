import { Link } from "react-router"
import Icon from "./Icon"

export default function Footer() {
  return (
    <footer>

      <div className="footer-brand">

        <span className="brand-mark">
          <Icon name="leaf" size={21} />
        </span>

        <div>
          <strong>INSPIRE</strong>

          <small>
            AI · Tham vấn tâm lý ·
            Nghỉ dưỡng & dưỡng sinh
          </small>
        </div>

      </div>


      <p>
        © {new Date().getFullYear()} INSPIRE.
      </p>


      <div className="footer-links">

        <Link to="/ai-inspire">
          AI Inspire
        </Link>

        <Link to="/tham-van-tam-ly">
          Tham vấn tâm lý
        </Link>

        <Link to="/nghi-duong-duong-sinh">
          Nghỉ dưỡng
        </Link>

      </div>

    </footer>
  )
}