import { FormEvent, useState } from "react"
import { Link } from "react-router"

import Header from "../components/Header"
import Contact from "../components/Contact"
import Footer from "../components/Footer"
import Icon from "../components/Icon"

import { askInspireAI } from "../services/InspireAIconnect"


type ChatMessage = {
  id: number
  role: "assistant" | "user"
  text: string
}


const suggestions = [
  "Tôi đang cảm thấy căng thẳng",
  "Tôi muốn hiểu cảm xúc của mình",
  "Tôi đang gặp vấn đề trong một mối quan hệ",
]


export default function AIInspire() {

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: "assistant",
      text:
        "Chào bạn. Bạn có thể bắt đầu bằng cách kể điều đang khiến bạn suy nghĩ hoặc cảm thấy khó khăn gần đây."
    }
  ])

  const [input, setInput] = useState("")
  const [isSending, setIsSending] = useState(false)


  async function sendMessage(text: string) {

    const clean = text.trim()

    if (!clean || isSending) return


    const id = Date.now()


    const userMessage: ChatMessage = {
      id,
      role: "user",
      text: clean
    }


    setMessages(prev => [
      ...prev,
      userMessage
    ])


    setInput("")
    setIsSending(true)


    try {

      const answer = await askInspireAI(clean)


      const assistantMessage: ChatMessage = {
        id: id + 1,
        role: "assistant",
        text: answer
      }


      setMessages(prev => [
        ...prev,
        assistantMessage
      ])

    } catch (error) {

      console.error(
        "INSPIRE AI error:",
        error
      )


      setMessages(prev => [
        ...prev,
        {
          id: id + 1,
          role: "assistant",
          text:
            "Xin lỗi, AI INSPIRE hiện chưa thể phản hồi. Vui lòng thử lại."
        }
      ])

    } finally {

      setIsSending(false)

    }
  }



  function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {

    event.preventDefault()

    void sendMessage(input)

  }



  return (
    <div className="site-shell">

      <Header />


      <main>


        {/* =========================
            AI HERO
        ========================== */}

        <section className="ai-page-hero">

          <div className="ai-page-hero-copy">

            <div className="eyebrow">

              <Icon
                name="spark"
                size={16}
              />

              AI INSPIRE

            </div>


            <h1>
              Một nơi để bắt đầu
              <span> nói ra điều đang diễn ra.</span>
            </h1>


            <p>

              AI INSPIRE giúp bạn diễn đạt vấn đề,
              sắp xếp suy nghĩ và nhận phản hồi ban đầu
              khi bạn chưa biết nên bắt đầu từ đâu.

            </p>


            <div className="hero-trust">

              <span>

                <Icon
                  name="shield"
                  size={17}
                />

                Không thay thế chuyên gia

              </span>


              <span>

                <Icon
                  name="heart"
                  size={17}
                />

                Bạn quyết định điều muốn chia sẻ

              </span>

            </div>


            <a
              href="#tro-chuyen"
              className="primary-btn"
            >

              Bắt đầu trò chuyện

              <Icon
                name="arrow"
                size={18}
              />

            </a>

          </div>


          <div className="ai-page-hero-visual">

            <div className="ai-orbit">

              <div className="ai-center-icon">

                <Icon
                  name="spark"
                  size={35}
                />

              </div>


              <div className="ai-orbit-card card-one">

                <Icon
                  name="message"
                  size={19}
                />

                <span>
                  Chia sẻ
                </span>

              </div>


              <div className="ai-orbit-card card-two">

                <Icon
                  name="book"
                  size={19}
                />

                <span>
                  Làm rõ
                </span>

              </div>


              <div className="ai-orbit-card card-three">

                <Icon
                  name="arrow"
                  size={19}
                />

                <span>
                  Định hướng
                </span>

              </div>

            </div>

          </div>

        </section>



        {/* =========================
            WHAT AI DOES
        ========================== */}

        <section className="section">

          <div className="section-heading centered">

            <div className="eyebrow">
              AI INSPIRE CÓ THỂ LÀM GÌ?
            </div>


            <h2>
              Hỗ trợ bước đầu,
              không thay thế chiều sâu của con người.
            </h2>


            <p>

              AI có thể hữu ích khi bạn cần diễn đạt
              điều đang xảy ra, nhìn vấn đề từ một góc khác
              hoặc xác định bước tiếp theo.

            </p>

          </div>


          <div className="ai-explain-grid">


            <article className="service-card">

              <div className="icon-box">

                <Icon name="message" />

              </div>

              <h3>
                Lắng nghe thông tin ban đầu
              </h3>

              <p>

                Bạn có thể mô tả cảm xúc,
                suy nghĩ, tình huống hoặc câu hỏi
                bằng ngôn ngữ tự nhiên.

              </p>

            </article>



            <article className="service-card">

              <div className="icon-box">

                <Icon name="spark" />

              </div>

              <h3>
                Giúp làm rõ vấn đề
              </h3>

              <p>

                AI có thể phản hồi,
                đặt câu hỏi gợi mở và giúp bạn
                sắp xếp những điều đang cảm thấy rối.

              </p>

            </article>



            <article className="service-card">

              <div className="icon-box">

                <Icon name="arrow" />

              </div>

              <h3>
                Gợi ý bước tiếp theo
              </h3>

              <p>

                Khi phù hợp, AI có thể gợi ý
                tiếp tục tự quan sát hoặc cân nhắc
                tìm sự hỗ trợ từ người thật.

              </p>

            </article>

          </div>

        </section>



        {/* =========================
            IMPORTANT LIMIT
        ========================== */}

        <section className="section ai-limit-wrapper">

          <div className="ai-limit-panel">

            <div className="ai-limit-icon">

              <Icon
                name="shield"
                size={30}
              />

            </div>


            <div>

              <span className="mini-label">
                GIỚI HẠN CỦA AI
              </span>


              <h2>
                Có những vấn đề cần một con người thật.
              </h2>


              <p>

                AI INSPIRE chỉ hỗ trợ phản hồi
                và định hướng ở mức ban đầu.

                AI không thể thay thế việc đánh giá,
                chẩn đoán hoặc trị liệu chuyên môn.

                Khi vấn đề cần được hiểu sâu hơn,
                kéo dài, phức tạp hoặc ảnh hưởng đáng kể
                đến cuộc sống, một người tham vấn hoặc
                chuyên gia phù hợp có thể đồng hành
                với bạn trực tiếp.

              </p>


              <Link
                to="/tham-van-tam-ly"
                className="link-btn ai-human-link"
              >

                Tìm hiểu tham vấn tâm lý

                <Icon
                  name="arrow"
                  size={17}
                />

              </Link>

            </div>

          </div>

        </section>



        {/* =========================
            ACTUAL AI CHAT
        ========================== */}

        <section
          className="section chat-section"
          id="tro-chuyen"
        >

          <div className="chat-intro">

            <div className="eyebrow light">

              AI INSPIRE · TRÒ CHUYỆN

            </div>


            <h2>
              Bạn muốn bắt đầu từ đâu?
            </h2>


            <p>

              Không cần phải diễn đạt hoàn hảo.

              Bạn có thể chỉ đơn giản kể điều
              đang khiến mình suy nghĩ,
              cảm thấy khó chịu hoặc chưa hiểu rõ.

            </p>


            <ul className="feature-list">

              <li>

                <Icon
                  name="check"
                  size={17}
                />

                Chia sẻ bằng ngôn ngữ tự nhiên

              </li>


              <li>

                <Icon
                  name="check"
                  size={17}
                />

                Nhận phản hồi và câu hỏi gợi mở

              </li>


              <li>

                <Icon
                  name="check"
                  size={17}
                />

                Có thể chuyển sang tham vấn khi cần

              </li>

            </ul>

          </div>



          <div className="chat-window">


            <div className="chat-header">

              <div className="chat-avatar">

                <Icon
                  name="spark"
                  size={19}
                />

              </div>


              <div>

                <strong>
                  AI INSPIRE
                </strong>

                <span>

                  <i></i>

                  Đang hoạt động

                </span>

              </div>


              <span className="beta-pill">
                AI
              </span>

            </div>



            <div className="chat-messages">

              {messages.map(message => (

                <div
                  key={message.id}
                  className={
                    `message-row ${message.role}`
                  }
                >

                  {message.role === "assistant" && (

                    <div className="message-avatar">

                      <Icon
                        name="leaf"
                        size={15}
                      />

                    </div>

                  )}


                  <div className="message-bubble">

                    {message.text}

                  </div>

                </div>

              ))}


              {isSending && (

                <div className="message-row assistant">

                  <div className="message-avatar">

                    <Icon
                      name="leaf"
                      size={15}
                    />

                  </div>


                  <div className="message-bubble">

                    AI INSPIRE đang phản hồi...

                  </div>

                </div>

              )}

            </div>



            <div className="suggestion-row">

              {suggestions.map(suggestion => (

                <button

                  key={suggestion}

                  onClick={() =>
                    void sendMessage(suggestion)
                  }

                  disabled={isSending}

                >

                  {suggestion}

                </button>

              ))}

            </div>



            <form
              className="chat-input"
              onSubmit={handleSubmit}
            >

              <input

                value={input}

                onChange={e =>
                  setInput(e.target.value)
                }

                placeholder="Chia sẻ điều bạn đang nghĩ..."

                aria-label="Tin nhắn cho AI INSPIRE"

              />


              <button

                type="submit"

                aria-label="Gửi tin nhắn"

                disabled={
                  isSending ||
                  !input.trim()
                }

              >

                <Icon
                  name="arrow"
                  size={18}
                />

              </button>

            </form>



            <p className="chat-note">

              AI INSPIRE hỗ trợ thông tin và phản hồi
              ban đầu, không thay thế bác sĩ,
              nhà tâm lý hoặc chuyên gia có thẩm quyền.

            </p>

          </div>

        </section>



        <Contact />

      </main>


      <Footer />

    </div>
  )
}