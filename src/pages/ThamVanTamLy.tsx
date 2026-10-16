import { useState } from "react"
import { Link } from "react-router"

import Header from "../components/Header"
import Contact from "../components/Contact"
import Footer from "../components/Footer"
import Icon, { IconName } from "../components/Icon"

import {
  submitCounselingBooking
} from "../services/formService"


const counselingTopics: Array<{
  number: string
  icon: IconName
  title: string
  text: string
  link: string
}> = [
  {
    number: "01",
    icon: "user",
    title: "Quan hệ với chính mình",
    text:
      "Cách bạn nhìn nhận, đánh giá, chấp nhận và đối xử với chính mình.",
    link: "/tham-van-tam-ly/quan-he-voi-chinh-minh"
  },

  {
    number: "02",
    icon: "heart",
    title: "Đời sống nội tâm",
    text:
      "Cảm xúc, suy nghĩ, cơ thể và những trải nghiệm đang diễn ra bên trong bạn.",
    link: "/tham-van-tam-ly/doi-song-noi-tam"
  },

  {
    number: "03",
    icon: "message",
    title: "Quan hệ với người khác",
    text:
      "Gần gũi, ranh giới, nhu cầu, kết nối và những mẫu khó khăn trong quan hệ.",
    link: "/tham-van-tam-ly/quan-he-voi-nguoi-khac"
  },

  {
    number: "04",
    icon: "arrow",
    title: "Vận hành và hành động",
    text:
      "Khoảng cách giữa điều bạn hiểu, điều bạn muốn và điều bạn thực sự có thể làm.",
    link: "/tham-van-tam-ly/van-hanh-va-hanh-dong"
  },

  {
    number: "05",
    icon: "spark",
    title: "Phương hướng, giá trị và lựa chọn",
    text:
      "Khi bạn đứng trước những lựa chọn và cần hiểu điều gì thực sự quan trọng với mình.",
    link: "/tham-van-tam-ly/phuong-huong-gia-tri-va-lua-chon"
  },

  {
    number: "06",
    icon: "leaf",
    title: "Ý nghĩa và cách sống",
    text:
      "Những câu hỏi về ý nghĩa, mất mát, thay đổi và cách bạn muốn sống phần đời của mình.",
    link: "/tham-van-tam-ly/y-nghia-va-cach-song"
  }
]


export default function ThamVanTamLy() {

  const [bookingForm, setBookingForm] = useState({
    name: "",
    phone: "",
    email: "",
    service: "Tham vấn riêng",
    preferredDate: "",
    preferredTime: "",
    note: ""
  })


  const [bookingStatus, setBookingStatus] =
    useState<
      "idle" |
      "loading" |
      "success" |
      "error"
    >("idle")


  async function handleBookingSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {

    event.preventDefault()


    try {

      setBookingStatus("loading")


      await submitCounselingBooking(
        bookingForm
      )


      setBookingStatus("success")


      setBookingForm({
        name: "",
        phone: "",
        email: "",
        service: "Tham vấn riêng",
        preferredDate: "",
        preferredTime: "",
        note: ""
      })

    } catch (error) {

      console.error(
        "Booking error:",
        error
      )

      setBookingStatus("error")

    }
  }



  return (
    <div className="site-shell">

      <Header />


      <main>


        {/* ==================================
            HERO
        ================================== */}

        <section className="counseling-page-hero">


          <div className="counseling-hero-copy">


            <div className="eyebrow">

              <Icon
                name="heart"
                size={16}
              />

              THAM VẤN TÂM LÝ INSPIRE

            </div>


            <h1>

              Một không gian
              <br />

              <span>
                để được lắng nghe sâu hơn.
              </span>

            </h1>


            <p>

              Tham vấn tại INSPIRE là một không gian
              dành cho những điều khó diễn đạt,
              những cảm xúc chưa được hiểu rõ,
              những mối quan hệ đang tạo áp lực
              hoặc những giai đoạn trong cuộc sống
              mà bạn chưa biết nên đi tiếp như thế nào.

            </p>


            <div className="hero-actions">

              <a
                href="#dat-lich"
                className="primary-btn"
              >

                Đặt lịch tham vấn

                <Icon
                  name="arrow"
                  size={18}
                />

              </a>


              <a
                href="#tham-van-la-gi"
                className="secondary-btn"
              >

                Tìm hiểu thêm

              </a>

            </div>


            <div className="hero-trust">

              <span>

                <Icon
                  name="heart"
                  size={17}
                />

                Không gian riêng tư

              </span>


              <span>

                <Icon
                  name="shield"
                  size={17}
                />

                Tôn trọng giới hạn của từng người

              </span>

            </div>

          </div>



          {/* ==================================
              VISUAL
          ================================== */}

          <div
            className="counseling-hero-visual"
            aria-hidden="true"
          >

            <div className="conversation-visual">


              <div className="conversation-person person-one">

                <Icon
                  name="user"
                  size={29}
                />

              </div>


              <div className="conversation-line">

                <Icon
                  name="message"
                  size={29}
                />

              </div>


              <div className="conversation-person person-two">

                <Icon
                  name="heart"
                  size={29}
                />

              </div>


              <div className="conversation-label">

                <span className="mini-label">
                  INSPIRE
                </span>

                <strong>
                  Một cuộc trò chuyện
                  có chiều sâu.
                </strong>

              </div>

            </div>

          </div>

        </section>



        {/* ==================================
            WHAT IS COUNSELING
        ================================== */}

        <section
          className="section counseling counseling-topics-section"
          id="tham-van-la-gi"
        >


          <div className="section-heading counseling-topics-intro">


            <div>

              <div className="eyebrow">

                THAM VẤN TẠI INSPIRE

              </div>


              <h2>

                Có điều gì trong đời sống của bạn
                đang cần được hiểu rõ hơn?

              </h2>

            </div>


            <p>

              Tham vấn không chỉ dành cho lúc một vấn đề
              đã trở nên quá lớn. Đó cũng có thể là một
              không gian để bạn nhìn rõ hơn điều đang diễn ra
              trong mình, trong các mối quan hệ, trong cách
              mình hành động và trong những lựa chọn đang
              định hình đời sống.

            </p>

          </div>



          <div className="counseling-topics-grid">

            {counselingTopics.map(
              topic => (

                <article
                  className="counseling-topic-card"
                  key={topic.number}
                >

                  <Link to={topic.link}>

                    <div className="counseling-topic-card-top">

                      <span className="counseling-topic-number">
                        {topic.number}
                      </span>

                      <span className="counseling-topic-icon">
                        <Icon
                          name={topic.icon}
                        />
                      </span>

                    </div>


                    <h3>
                      {topic.title}
                    </h3>


                    <p>
                      {topic.text}
                    </p>


                    <span className="counseling-topic-link">

                      Tìm hiểu

                      <Icon
                        name="arrow"
                        size={17}
                      />

                    </span>

                  </Link>

                </article>

              )
            )}

          </div>

        </section>



        {/* ==================================
            PROCESS
        ================================== */}

        <section className="section counseling-process-section">


          <div className="flow-panel">


            <div className="flow-copy">

              <span className="mini-label">

                HÀNH TRÌNH THAM VẤN

              </span>


              <h3>

                Bắt đầu từ điều
                bạn đang thực sự cần.

              </h3>


              <p>

                Bạn không cần phải hiểu rõ
                toàn bộ vấn đề trước khi đến.

                Cuộc gặp đầu tiên có thể bắt đầu
                đơn giản bằng việc mô tả điều
                khiến bạn muốn tìm đến INSPIRE.

              </p>


              <a
                className="link-btn"
                href="#dat-lich"
              >

                Đặt lịch với INSPIRE

                <Icon
                  name="arrow"
                  size={17}
                />

              </a>

            </div>



            <div className="flow-steps">


              <div className="flow-step">

                <span>
                  01
                </span>

                <div>

                  <strong>
                    Chia sẻ ban đầu
                  </strong>

                  <p>

                    Bạn mô tả điều đang khiến
                    mình quan tâm hoặc gặp khó khăn.

                  </p>

                </div>

              </div>



              <div className="flow-step">

                <span>
                  02
                </span>

                <div>

                  <strong>
                    Cùng nhìn lại
                  </strong>

                  <p>

                    Người đồng hành cùng bạn
                    làm rõ những yếu tố liên quan
                    đến trải nghiệm hiện tại.

                  </p>

                </div>

              </div>



              <div className="flow-step">

                <span>
                  03
                </span>

                <div>

                  <strong>
                    Xác định điều cần thiết
                  </strong>

                  <p>

                    Từ cuộc trò chuyện,
                    hai bên có thể hiểu rõ hơn
                    điều gì cần được tiếp tục khám phá.

                  </p>

                </div>

              </div>



              <div className="flow-step">

                <span>
                  04
                </span>

                <div>

                  <strong>
                    Đồng hành tiếp theo
                  </strong>

                  <p>

                    Bạn quyết định có tiếp tục
                    các buổi sau hoặc lựa chọn
                    hướng hỗ trợ phù hợp khác.

                  </p>

                </div>

              </div>


            </div>

          </div>

        </section>



        {/* ==================================
            PRICE
        ================================== */}

        <section className="section counseling-price-section">


          <div className="section-heading centered">

            <div className="eyebrow">

              DỊCH VỤ THAM VẤN

            </div>


            <h2>

              Một cuộc trò chuyện
              dành riêng cho bạn.

            </h2>

          </div>



          <div className="counseling-single-price">


            <article className="price-card featured">


              <span className="price-label">

                THAM VẤN RIÊNG

              </span>


              <h3>

                Tham vấn 1–1

              </h3>


              <div className="price">

                XXX.000đ

                <small>
                  {" "}/ buổi
                </small>

              </div>


              <p>

                Không gian trò chuyện riêng
                với người dẫn hoặc chuyên gia phù hợp.

              </p>


              <ul>

                <li>

                  <Icon
                    name="check"
                    size={16}
                  />

                  Không gian riêng tư

                </li>


                <li>

                  <Icon
                    name="check"
                    size={16}
                  />

                  Trao đổi trực tiếp 1–1

                </li>


                <li>

                  <Icon
                    name="check"
                    size={16}
                  />

                  Có thể tiếp tục theo tiến trình

                </li>

              </ul>


              <a
                href="#dat-lich"
                className="primary-btn full"
              >

                Đặt lịch tham vấn

              </a>

            </article>


          </div>

        </section>



        {/* ==================================
            ACTUAL BOOKING BACKEND
        ================================== */}

        <section
          className="booking-section"
          id="dat-lich"
        >


          <div className="booking-card">


            <div>

              <div className="eyebrow">
                ĐẶT LỊCH THAM VẤN
              </div>


              <h2>

                Bắt đầu bằng
                một cuộc gặp phù hợp với bạn.

              </h2>


              <p>

                Điền thông tin bên cạnh.
                INSPIRE sẽ tiếp nhận yêu cầu
                và liên hệ lại để xác nhận lịch.

              </p>

            </div>



            <form
              className="booking-form"
              onSubmit={
                handleBookingSubmit
              }
            >


              <label>

                Họ và tên

                <input
                  type="text"
                  required

                  placeholder="Nguyễn Văn A"

                  value={
                    bookingForm.name
                  }

                  onChange={e =>
                    setBookingForm({
                      ...bookingForm,
                      name: e.target.value
                    })
                  }
                />

              </label>



              <label>

                Số điện thoại

                <input
                  type="tel"
                  required

                  placeholder="Số điện thoại"

                  value={
                    bookingForm.phone
                  }

                  onChange={e =>
                    setBookingForm({
                      ...bookingForm,
                      phone: e.target.value
                    })
                  }
                />

              </label>



              <label>

                Email

                <input
                  type="email"
                  required

                  placeholder="inspirelife@gmail.com"

                  value={
                    bookingForm.email
                  }

                  onChange={e =>
                    setBookingForm({
                      ...bookingForm,
                      email: e.target.value
                    })
                  }
                />

              </label>



              <label>

                Dịch vụ

                <select
                  value={
                    bookingForm.service
                  }

                  onChange={e =>
                    setBookingForm({
                      ...bookingForm,
                      service: e.target.value
                    })
                  }
                >

                  <option value="Tham vấn riêng">

                    Tham vấn riêng

                  </option>

                </select>

              </label>



              <label>

                Ghi chú

                <textarea
                  rows={3}

                  placeholder=
                    "Bạn muốn INSPIRE biết điều gì trước cuộc hẹn?"

                  value={
                    bookingForm.note
                  }

                  onChange={e =>
                    setBookingForm({
                      ...bookingForm,
                      note: e.target.value
                    })
                  }
                />

              </label>



              <button
                className="primary-btn full"
                type="submit"

                disabled={
                  bookingStatus ===
                  "loading"
                }
              >

                {
                  bookingStatus ===
                  "loading"

                    ? "Đang gửi..."

                    : "Gửi yêu cầu đặt lịch"
                }

              </button>



              {
                bookingStatus ===
                "success" && (

                  <span className="form-note">

                    ✓ Yêu cầu đặt lịch
                    đã được gửi thành công.

                  </span>

                )
              }



              {
                bookingStatus ===
                "error" && (

                  <span className="form-note">

                    Không thể gửi yêu cầu.
                    Vui lòng thử lại.

                  </span>

                )
              }


            </form>

          </div>

        </section>



        <Contact />


      </main>


      <Footer />


    </div>
  )
}
