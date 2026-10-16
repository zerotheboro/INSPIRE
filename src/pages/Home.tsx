import { Link } from "react-router"

import Header from "../components/Header"
import Contact from "../components/Contact"
import Footer from "../components/Footer"
import Icon from "../components/Icon"


const mainServices = [
  {
    number: "01",
    icon: "heart" as const,

    title: "Tham vấn tâm lý",

    description:
      "Một không gian riêng tư để đi sâu hơn vào cảm xúc, suy nghĩ, mối quan hệ và những vấn đề đang ảnh hưởng đến cuộc sống.",

    points: [
      "Trao đổi trực tiếp 1–1",
      "Có người thật đồng hành",
      "Dành cho vấn đề cần chiều sâu"
    ],

    link: "/tham-van-tam-ly",

    button: "Khám phá tham vấn"
  },

  {
    number: "02",
    icon: "spark" as const,

    title: "AI INSPIRE",

    description:
      "Bắt đầu bằng một cuộc trò chuyện với AI để diễn đạt vấn đề, sắp xếp suy nghĩ và nhận phản hồi ban đầu.",

    points: [
      "Trò chuyện ngay khi bạn cần",
      "Gợi mở và làm rõ vấn đề",
      "Định hướng bước tiếp theo"
    ],

    link: "/ai-inspire",

    button: "Khám phá AI Inspire"
  },

  

  {
    number: "03",
    icon: "water" as const,

    title: "Nghỉ dưỡng & dưỡng sinh",

    description:
      "Một không gian ven sông để nghỉ ngơi, chăm sóc cơ thể và tạm rời khỏi nhịp sống quá nhanh.",

    points: [
      "Không gian lưu trú",
      "Spa, xông hơi và massage",
      "Thiền, yoga và thiên nhiên"
    ],

    link: "/nghi-duong-duong-sinh",

    button: "Khám phá không gian"
  }
]


export default function Home() {

  return (
    <div className="site-shell">
      <Header />

      <main>
     
        {/* ================= HERO ================= */}

        <section className="hero home-hero">

          <div className="hero-glow hero-glow-one"></div>
          <div className="hero-glow hero-glow-two"></div>


          <div className="hero-content">

            <div className="eyebrow">

              <Icon
                name="spark"
                size={16}
              />

              BA CON ĐƯỜNG · MỘT INSPIRE

            </div>


            <h1>

              Chăm sóc bản thân
              <br />

              <span>
                theo cách phù hợp với bạn.
              </span>

            </h1>


            <p>

              INSPIRE kết nối ba hình thức hỗ trợ độc lập:
              công nghệ AI, tham vấn tâm lý với con người
              và không gian nghỉ dưỡng & dưỡng sinh.

              Bạn có thể bắt đầu từ bất kỳ nơi nào phù hợp
              với nhu cầu của mình.

            </p>


            <div className="hero-actions">

              <a
                href="#dich-vu"
                className="primary-btn"
              >

                Khám phá 3 dịch vụ

                <Icon
                  name="arrow"
                  size={18}
                />

              </a>


              {/*<Link
                to="/ai-inspire"
                className="secondary-btn"
              >

                Thử AI Inspire

              </Link>*/}

            </div>


            <div className="hero-trust">


              <span>

                <Icon
                  name="heart"
                  size={17}
                />

                Bạn tự chọn cách bắt đầu

              </span>

            </div>

          </div>


          {/* ================= HERO VISUAL ================= */}

          <div
            className="hero-visual home-service-visual"
            aria-hidden="true"
          >

            <div className="visual-card main-card">

              <span className="mini-label">
                INSPIRE
              </span>


              <h3>

                Công nghệ.
                <br />

                Con người.
                <br />

                Không gian.

              </h3>


              <div className="home-visual-services">

                <div>
                  <Icon
                    name="spark"
                    size={24}
                  />

                  <span>AI</span>
                </div>


                <div>
                  <Icon
                    name="heart"
                    size={24}
                  />

                  <span>Tham vấn</span>
                </div>


                <div>
                  <Icon
                    name="water"
                    size={24}
                  />

                  <span>Nghỉ dưỡng</span>
                </div>

              </div>


              <div className="river-art">

                <div className="sun"></div>

                <div className="tree tree-one"></div>

                <div className="tree tree-two"></div>

                <div className="river-wave wave-one"></div>

                <div className="river-wave wave-two"></div>

              </div>

            </div>

          </div>

        </section>



        {/* ================= THREE SERVICES ================= */}

        <section
          className="section home-services"
          id="dich-vu"
        >

          <div className="section-heading centered">

            <div className="eyebrow">
              DỊCH VỤ INSPIRE
            </div>


            <h2>
              Ba cách khác nhau để bắt đầu.
            </h2>


            <p>

              Mỗi dịch vụ có một vai trò riêng.
              Bạn không cần phải đi theo một trình tự cố định —
              hãy chọn nơi phù hợp nhất với điều bạn đang cần.

            </p>

          </div>


          <div className="main-service-grid">

            {mainServices.map((service) => (
              
              <Link
                to={service.link}
                key={service.title}
              >
                
              <article
                className="main-service-card"
              >
                

                <div className="service-card-top">

                  <span className="service-number">
                    {service.number}
                  </span>


                  <div className="icon-box">

                    <Icon
                      name={service.icon}
                      size={25}
                    />

                  </div>

                </div>


                <h3>
                  {service.title}
                </h3>


                <p className="main-service-description">
                  {service.description}
                </p>


                <ul>

                  {service.points.map((point) => (

                    <li key={point}>

                      <Icon
                        name="check"
                        size={16}
                      />

                      {point}

                    </li>

                  ))}

                </ul>


                <span className="service-link">

                  {service.button}

                  <Icon
                    name="arrow"
                    size={17}
                  />

                </span>

              </article>
              </Link>

            ))}

          </div>

        </section>



        {/* ================= HOW THEY CONNECT ================= */}

        <section className="section">

          <div className="inspire-system-panel">

            <div className="system-intro">

              <span className="mini-label">
                MỘT HỆ SINH THÁI · BA DỊCH VỤ
              </span>


              <h2>
                Bạn có thể dùng riêng từng dịch vụ —
                hoặc kết nối chúng khi cần.
              </h2>


              <p>

                INSPIRE không buộc bạn phải đi qua một
                hành trình cố định.

                Có người chỉ cần một cuộc trò chuyện với AI.
                Có người muốn gặp người tham vấn.
                Có người đơn giản cần một nơi để nghỉ lại.

                Khi phù hợp, ba dịch vụ cũng có thể bổ trợ
                cho nhau.

              </p>

            </div>


            <div className="system-path">

              <div className="system-step">

                <span>01</span>

                <Icon
                  name="spark"
                  size={22}
                />

                <div>

                  <strong>
                    AI Inspire
                  </strong>

                  <p>
                    Bắt đầu chia sẻ và làm rõ điều đang diễn ra.
                  </p>

                </div>

              </div>


              <div className="system-arrow">
                ↓
              </div>


              <div className="system-step">

                <span>02</span>

                <Icon
                  name="heart"
                  size={22}
                />

                <div>

                  <strong>
                    Tham vấn tâm lý
                  </strong>

                  <p>
                    Đi sâu hơn khi vấn đề cần một con người đồng hành.
                  </p>

                </div>

              </div>


              <div className="system-arrow">
                ↓
              </div>


              <div className="system-step">

                <span>03</span>

                <Icon
                  name="water"
                  size={22}
                />

                <div>

                  <strong>
                    Nghỉ dưỡng & dưỡng sinh
                  </strong>

                  <p>
                    Tạo không gian cho cơ thể và tâm trí chậm lại.
                  </p>

                </div>

              </div>

            </div>

          </div>

        </section>



        {/* ================= PRICING ================= */}

        <section
          className="section pricing-section"
          id="pricing"
        >

          <div className="section-heading centered">

            <div className="eyebrow">
              THAM KHẢO DỊCH VỤ
            </div>


            <h2>
              Bắt đầu theo cách phù hợp với bạn.
            </h2>

          </div>


          <div className="pricing-grid">


            {/* AI */}

            <article className="price-card">

              <span className="price-label">
                AI INSPIRE
              </span>


              <h3>
                Trò chuyện AI
              </h3>


              <div className="price">

                Miễn phí

                <small>
                  {" "}/ hiện tại
                </small>

              </div>


              <p>
                Dành cho việc chia sẻ và định hướng ban đầu.
              </p>


              <ul>

                <li>
                  <Icon name="check" size={16}/>
                  Trò chuyện AI
                </li>

                <li>
                  <Icon name="check" size={16}/>
                  Gợi mở câu hỏi
                </li>

                <li>
                  <Icon name="check" size={16}/>
                  Định hướng bước tiếp theo
                </li>

              </ul>


              <Link
                className="secondary-btn full"
                to="/ai-inspire"
              >
                Trò chuyện ngay
              </Link>

            </article>



            {/* COUNSELING */}

            <article className="price-card featured">

              <span className="price-label">
                THAM VẤN
              </span>


              <h3>
                Tham vấn riêng
              </h3>


              <div className="price">

                XXX.000đ

                <small>
                  {" "}/ buổi
                </small>

              </div>


              <p>
                Một cuộc trò chuyện riêng với người dẫn hoặc chuyên gia.
              </p>


              <ul>

                <li>
                  <Icon name="check" size={16}/>
                  Không gian riêng tư
                </li>

                <li>
                  <Icon name="check" size={16}/>
                  Đồng hành 1–1
                </li>

                <li>
                  <Icon name="check" size={16}/>
                  Đi sâu vào vấn đề
                </li>

              </ul>


              <Link
                className="primary-btn full"
                to="/tham-van-tam-ly"
              >
                Tìm hiểu tham vấn
              </Link>

            </article>



            {/* ACCOMMODATION */}

            <article className="price-card">

              <span className="price-label">
                NGHỈ DƯỠNG
              </span>


              <h3>
                Nghỉ dưỡng & dưỡng sinh
              </h3>


              <div className="price">

                Liên hệ

                <small>
                  {" "}/ gói
                </small>

              </div>


              <p>
                Lưu trú, nghỉ ngơi và trải nghiệm chăm sóc tại INSPIRE.
              </p>


              <ul>

                <li>
                  <Icon name="check" size={16}/>
                  Không gian ven sông
                </li>

                <li>
                  <Icon name="check" size={16}/>
                  Wellness facilities
                </li>

                <li>
                  <Icon name="check" size={16}/>
                  Có thể kết hợp tham vấn
                </li>

              </ul>


              <Link
                className="secondary-btn full"
                to="/nghi-duong-duong-sinh"
              >
                Khám phá không gian
              </Link>

            </article>

          </div>

        </section>



        {/* ================= SHARED CONTACT ================= */}

        <Contact />

      </main>


      <Footer />

    </div>
  )
}
