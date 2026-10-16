import { useState, type FormEvent } from "react"

import Header from "../components/Header"
import Contact from "../components/Contact"
import Footer from "../components/Footer"

import Icon, { type IconName } from "../components/Icon"

import {
  submitCounselingBooking
} from "../services/formService"




const resortFeatures: Array<{
  icon: IconName
  title: string
  text: string
}> = [

  {
    icon: "bed",
    title: "Phòng nghỉ",
    text:
      "Không gian lưu trú riêng tư, nhẹ nhàng và hiện đại để bạn thực sự có thời gian nghỉ lại."
  },

  {
    icon: "pool",
    title: "Hồ bơi",
    text:
      "Không gian thư giãn giữa thiên nhiên, ánh sáng và nhịp sống chậm hơn."
  },

  {
    icon: "spa",
    title: "Spa",
    text:
      "Khoảng thời gian dành riêng cho cơ thể, sự thư giãn và hồi phục."
  },

  {
    icon: "steam",
    title: "Xông hơi",
    text:
      "Không gian xông hơi khô và ướt dành cho nghỉ ngơi và thư giãn cơ thể."
  },

  {
    icon: "massage",
    title: "Massage",
    text:
      "Thư giãn cơ thể và giảm bớt những căng thẳng tích tụ trong nhịp sống hằng ngày."
  },

  {
    icon: "yoga",
    title: "Thiền & Yoga",
    text:
      "Trở về với hơi thở, sự chú ý và nhịp điệu của cơ thể."
  },

  {
    icon: "book",
    title: "Góc đọc sách",
    text:
      "Một nơi yên tĩnh để đọc, suy ngẫm hoặc đơn giản là dành thời gian cho chính mình."
  },

  {
    icon: "garden",
    title: "Sân vườn",
    text:
      "Đi bộ chậm, ngồi dưới bóng cây và dành thời gian kết nối với thiên nhiên."
  },

  {
    icon: "fish",
    title: "Hồ cá",
    text:
      "Một góc tĩnh lặng cho những khoảng thời gian không cần phải vội."
  },

  {
    icon: "water",
    title: "Không gian ven sông",
    text:
      "Gió, mặt nước và khoảng mở tạo nên một nhịp nghỉ tự nhiên khác với môi trường đô thị."
  },

  {
    icon: "message",
    title: "Không gian tham vấn riêng",
    text:
      "Khi có nhu cầu, trải nghiệm nghỉ dưỡng có thể kết hợp với tham vấn tâm lý tại INSPIRE."
  }

]


export default function NghiDuongDuongSinh() {

  const [bookingForm, setBookingForm] = useState({
    name: "",
    phone: "",
    email: "",
    service: "Nghỉ dưỡng INSPIRE",
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
    event: FormEvent<HTMLFormElement>
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
        service: "Nghỉ dưỡng INSPIRE",
        preferredDate: "",
        preferredTime: "",
        note: ""
      })

    } catch (error) {

      console.error(
        "Accommodation booking error:",
        error
      )

      setBookingStatus("error")

    }

  }


  return (
    <div className="site-shell">

      <Header />

      <main>


        {/* ===================================
            HERO
        =================================== */}

        <section className="retreat-page-hero">

          <div className="retreat-page-copy">

            <div className="eyebrow retreat-eyebrow">

              <Icon
                name="water"
                size={16}
              />

              NGHỈ DƯỠNG & DƯỠNG SINH

            </div>


            <h1>
              Một nơi để
              <span>
                cơ thể và tâm trí chậm lại.
              </span>
            </h1>


            <p>
              INSPIRE là một không gian ven sông
              dành cho việc lưu trú, nghỉ ngơi
              và chăm sóc bản thân — nơi bạn có thể
              tạm rời khỏi nhịp sống quá nhanh và
              dành thời gian cho cơ thể, tinh thần
              và chính mình.
            </p>


            <div className="hero-actions">

              <a
                href="#khong-gian"
                className="primary-btn"
              >
                Khám phá không gian

                <Icon
                  name="arrow"
                  size={18}
                />
              </a>


              <a
                href="#dat-lich-nghi-duong"
                className="retreat-secondary-btn"
              >
                Đặt lịch nghỉ dưỡng
              </a>

            </div>

          </div>


          <div className="retreat-hero-image">

            <img
              src="/retreat/frontyard.jpg"
              alt="Không gian INSPIRE Life"
            />

          </div>

        </section>


        {/* ===================================
            PHOTO GALLERY
        =================================== */}

       <section
  className="section retreat-gallery-section"
  id="khong-gian"
>

  <div className="section-heading centered">

    <div className="eyebrow">
      KHÔNG GIAN & TRẢI NGHIỆM INSPIRE LIFE
    </div>

    <h2>
      Một nơi để ở lại, nghỉ ngơi và hồi phục.
    </h2>

    <p>
      Những khoảng xanh, phòng nghỉ, khu xông hơi
      và không gian ven sông tạo nên một nhịp sống
      chậm hơn giữa thiên nhiên.
    </p>

  </div>


  <div className="retreat-gallery">

    {/* LARGE MAIN PHOTO */}

    <figure className="gallery-large">

      <img
        src="/retreat/backyard.jpg"
        alt="Khuôn viên INSPIRE Life"
      />

      <figcaption>
        <strong>Khuôn viên INSPIRE</strong>
        <span>Khoảng xanh & không gian mở</span>
      </figcaption>

    </figure>


    {/* BEDROOM */}

    <figure>

      <img
        src="/retreat/bedroomlandscape.jpg"
        alt="Phòng nghỉ INSPIRE Life"
        loading="lazy"
      />

      <figcaption>
        <strong>Phòng nghỉ</strong>
        <span>Riêng tư & yên tĩnh</span>
      </figcaption>

    </figure>

    {/* RIVER */}

    <figure className="gallery-wide">

      <img
        src="/retreat/Inspireriver.jpg"
        alt="INSPIRE Life ven sông vào buổi tối"
        loading="lazy"
      />

      <figcaption>
        <strong>Không gian ven sông</strong>
        <span>INSPIRE Life về đêm</span>
      </figcaption>

    </figure>

    {/* SAUNA */}

    <figure>

      <img
        src="/retreat/sauna.jpg"
        alt="Khu xông hơi INSPIRE Life"
        loading="lazy"
      />

      <figcaption>
        <strong>Xông hơi</strong>
        <span>Thư giãn & chăm sóc cơ thể</span>
      </figcaption>

    </figure>


    {/* FRONT GATE */}

    <figure>

      <img
        src="/retreat/frontgate.jpg"
        alt="Cổng vào INSPIRE Life"
        loading="lazy"
      />

      <figcaption>
        <strong>INSPIRE Life</strong>
        <span>Lối vào không gian INSPIRE</span>
      </figcaption>

    </figure>


    {/* OUTSIDE BEDROOM */}

    <figure className="gallery-wide">

      <img
        src="/retreat/outsidebedroom.jpg"
        alt="Không gian bên ngoài phòng nghỉ"
        loading="lazy"
      />

      <figcaption>
        <strong>Không gian nghỉ</strong>
        <span>Ánh sáng, cây xanh & sự yên tĩnh</span>
      </figcaption>

    </figure>


    {/* COUNSELING ROOM */}

    <figure>

      <img
        src="/retreat/counselroom.jpg"
        alt="Phòng tham vấn tâm lý INSPIRE Life"
        loading="lazy"
      />

      <figcaption>
        <strong>Phòng tham vấn</strong>
        <span>Không gian riêng tư & nhẹ nhàng</span>
      </figcaption>

    </figure>

  </div>

</section>


        {/* ===================================
            FACILITIES
        =================================== */}


        {/* ===================================
            FLEXIBLE EXPERIENCE
        =================================== */}

        <section className="section retreat-experience-section">

          <div className="retreat-experience-panel">

            <div className="retreat-experience-copy">

              <span className="mini-label">
                MỘT KHÔNG GIAN · NHIỀU CÁCH SỬ DỤNG
              </span>


              <h2>
                Bạn không cần phải
                sử dụng tất cả mọi thứ.
              </h2>


              <p>
                Một người có thể đến INSPIRE
                chỉ để nghỉ lại.

                Người khác có thể muốn sử dụng
                spa, massage hoặc thiền.

                Có người muốn dành thời gian
                trong thiên nhiên.

                Và khi phù hợp,
                nghỉ dưỡng cũng có thể kết hợp
                với tham vấn tâm lý.
              </p>


              <a
                href="#dat-lich-nghi-duong"
                className="link-btn retreat-link"
              >
                Đặt lịch nghỉ dưỡng

                <Icon
                  name="arrow"
                  size={17}
                />
              </a>

            </div>


            <div className="retreat-experience-options">

              <div>

                <span>01</span>

                <Icon
                  name="bed"
                  size={22}
                />

                <strong>
                  Lưu trú
                </strong>

                <p>
                  Nghỉ lại trong không gian INSPIRE.
                </p>

              </div>


              <div>

                <span>02</span>

                <Icon
                  name="spa"
                  size={22}
                />

                <strong>
                  Dưỡng sinh
                </strong>

                <p>
                  Chăm sóc cơ thể và tạo nhịp nghỉ.
                </p>

              </div>


              <div>

                <span>03</span>

                <Icon
                  name="garden"
                  size={22}
                />

                <strong>
                  Thiên nhiên
                </strong>

                <p>
                  Ở cùng cây xanh, mặt nước và khoảng mở.
                </p>

              </div>


              <div>

                <span>04</span>

                <Icon
                  name="message"
                  size={22}
                />

                <strong>
                  Kết hợp tham vấn
                </strong>

                <p>
                  Có thể thêm tham vấn khi phù hợp.
                </p>

              </div>

            </div>

          </div>

        </section>


        {/* ===================================
            PRICE
        =================================== */}

        <section className="section retreat-price-section">

          <div className="section-heading centered">

            <div className="eyebrow">
              NGHỈ DƯỠNG INSPIRE
            </div>

            <h2>
              Chọn trải nghiệm
              phù hợp với thời gian của bạn.
            </h2>

            <p>
              Giá và gói dịch vụ có thể được
              điều chỉnh theo thời gian lưu trú
              và trải nghiệm được lựa chọn.
            </p>

          </div>


          <div className="retreat-single-price">

            <article className="price-card">

              <span className="price-label">
                NGHỈ DƯỠNG & DƯỠNG SINH
              </span>

              <h3>
                INSPIRE Retreat
              </h3>

              <div className="price">

                Liên hệ

                <small>
                  {" "}/ gói
                </small>

              </div>

              <p>
                Lưu trú và lựa chọn
                các trải nghiệm phù hợp tại INSPIRE.
              </p>

              <ul>

                <li>
                  <Icon
                    name="check"
                    size={16}
                  />
                  Không gian ven sông
                </li>

                <li>
                  <Icon
                    name="check"
                    size={16}
                  />
                  Các tiện ích dưỡng sinh
                </li>

                <li>
                  <Icon
                    name="check"
                    size={16}
                  />
                  Có thể kết hợp tham vấn
                </li>

              </ul>

              <a
                href="#dat-lich-nghi-duong"
                className="primary-btn full"
              >
                Đặt lịch nghỉ dưỡng
              </a>

            </article>

          </div>

        </section>


        {/* ===================================
            ACCOMMODATION BOOKING
        =================================== */}

        <section
          className="booking-section"
          id="dat-lich-nghi-duong"
        >

          <div className="booking-card">

            <div>

              <div className="eyebrow">
                ĐẶT LỊCH NGHỈ DƯỠNG
              </div>

              <h2>
                Bắt đầu lên kế hoạch
                cho thời gian của bạn tại INSPIRE.
              </h2>

              <p>
                Gửi thông tin cơ bản cho INSPIRE.
                Chúng tôi sẽ liên hệ lại
                để xác nhận nhu cầu,
                thời gian và trải nghiệm phù hợp.
              </p>

            </div>


            <form
              className="booking-form"
              onSubmit={handleBookingSubmit}
            >

              <label>
                Họ và tên

                <input
                  type="text"
                  required
                  placeholder="Nguyễn Văn A"
                  value={bookingForm.name}
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
                  value={bookingForm.phone}
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
                  value={bookingForm.email}
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
                  value={bookingForm.service}
                  onChange={e =>
                    setBookingForm({
                      ...bookingForm,
                      service: e.target.value
                    })
                  }
                >

                  <option value="Nghỉ dưỡng INSPIRE">
                    Nghỉ dưỡng INSPIRE
                  </option>

                  <option value="Nghỉ dưỡng + tham vấn">
                    Nghỉ dưỡng + tham vấn
                  </option>

                </select>
              </label>


              <label>
                Ghi chú

                <textarea
                  rows={3}
                  placeholder="Bạn muốn INSPIRE biết gì về nhu cầu lưu trú hoặc trải nghiệm của mình?"
                  value={bookingForm.note}
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
                  bookingStatus === "loading"
                }
              >
                {
                  bookingStatus === "loading"
                    ? "Đang gửi..."
                    : "Gửi yêu cầu đặt lịch"
                }
              </button>


              {
                bookingStatus === "success" && (

                  <span className="form-note">
                    ✓ Yêu cầu nghỉ dưỡng
                    đã được gửi thành công.
                  </span>

                )
              }


              {
                bookingStatus === "error" && (

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