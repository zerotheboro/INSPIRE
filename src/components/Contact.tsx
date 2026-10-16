import Icon, { IconName } from "./Icon"

const socialLinks: Array<{
  icon: IconName
  label: string
  value: string
}> = [
  {
    icon: "facebook",
    label: "Facebook",
    value: "https://www.facebook.com/share/1HRcPpdE9z/?mibextid=wwXIfr"
  },
  {
    icon: "instagram",
    label: "Instagram",
    value: "https://www.instagram.com/dieutritamlyinspire/"
  },
  {
    icon: "tiktok",
    label: "Tiktok",
    value: "https://www.tiktok.com/@inspirelife79?_r=1&_t=ZS-99rGXQOHDrG"
  },
  {
    icon: "youtube",
    label: "Youtube",
    value: "https://www.youtube.com/@InspireLifeBusiness"
  },
  {
    icon: "zalo",
    label: "Zalo",
    value: "https://zalo.me/0903183418"
  },
]

export default function Contact() {
  return (
    <section className="section contact-section">

      <div className="contact-copy">

        <div className="eyebrow">
          LIÊN HỆ INSPIRE
        </div>

        <h2>
          Khi bạn muốn hỏi thêm,
          <br />
          hãy bắt đầu từ đây.
        </h2>

        <p>
          Kết nối với INSPIRE để tìm hiểu thêm
          về AI Inspire, tham vấn tâm lý hoặc
          nghỉ dưỡng & dưỡng sinh.
        </p>


        <div className="contact-info">

          <a href="tel:+84903183418">
            <span>
              <Icon name="phone" />
            </span>

            <div>
              <small>Điện thoại</small>
              <strong>0903 183 418</strong>
            </div>
          </a>


          <a href="mailto:dieutritamlyinspire@gmail.com">
            <span>
              <Icon name="mail" />
            </span>

            <div>
              <small>Email</small>
              <strong>
                dieutritamlyinspire@gmail.com
              </strong>
            </div>
          </a>


          <a
            href="https://maps.app.goo.gl/Aqno7dVDGaoqrz5P6"
            target="_blank"
            rel="noreferrer"
          >
            <span>
              <Icon name="pin" />
            </span>

            <div>
              <small>Địa chỉ</small>

              <strong>
                K2/16C Bửu Hoà 1,
                Biên Hoà, Đồng Nai
              </strong>
            </div>
          </a>

        </div>
      </div>


      <div className="social-panel">

        <span className="mini-label">
          MẠNG XÃ HỘI
        </span>

        <h3>Kết nối với INSPIRE</h3>


        <div className="social-list">

          {socialLinks.map((social) => (

            <a
              href={social.value}
              target="_blank"
              key={social.label}
            >

              <span className="social-icon">
                <Icon name={social.icon} />
              </span>

              <div>
                <strong>{social.label}</strong>
              </div>

              <Icon name="arrow" size={17} />

            </a>

          ))}

        </div>

      </div>

    </section>
  )
}
