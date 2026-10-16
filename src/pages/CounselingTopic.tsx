import {
  Fragment,
  ReactNode,
  useEffect,
  useRef,
  useState
} from "react"
import {
  Link,
  Navigate,
  useParams
} from "react-router"

import Header from "../components/Header"
import Contact from "../components/Contact"
import Footer from "../components/Footer"
import Icon from "../components/Icon"
import CounselingLongImage from "../components/CounselingLongImage"
import {
  CounselingContentBlock,
  getCounselingTopic
} from "../data/counselingTopics"
import {
  CounselingImageTooTallError,
  downloadCounselingLongImage,
  shareCounselingTopic
} from "../utils/exportCounseling"


function renderInlineFormatting(
  content: string
): ReactNode[] {
  return content
    .split(/(\*\*[\s\S]+?\*\*)/g)
    .filter(Boolean)
    .map((part, index) => {
      const isStrong =
        part.startsWith("**") &&
        part.endsWith("**")

      const text = isStrong
        ? part.slice(2, -2)
        : part

      return isStrong
        ? <strong key={index}>{text}</strong>
        : <Fragment key={index}>{text}</Fragment>
    })
}


function TopicContent({
  blocks
}: {
  blocks: CounselingContentBlock[]
}) {
  return (
    <div className="counseling-article-flow">

      {blocks.map((block, index) => {

        if (block.type === "divider") {
          return (
            <hr
              className="counseling-article-divider"
              key={`divider-${index}`}
            />
          )
        }

        if (block.type === "emphasis") {
          return (
            <p
              className="counseling-article-emphasis"
              key={`emphasis-${index}`}
            >
              {renderInlineFormatting(block.content)}
            </p>
          )
        }

        return (
          <p key={`paragraph-${index}`}>
            {renderInlineFormatting(block.content)}
          </p>
        )

      })}

    </div>
  )
}


export default function CounselingTopic() {

  const { topicSlug } = useParams()
  const topic = getCounselingTopic(topicSlug)
  const exportContainerRef = useRef<HTMLDivElement>(null)
  const feedbackTimerRef = useRef<number | undefined>(undefined)
  const [isGeneratingImages, setIsGeneratingImages] =
    useState(false)
  const [feedback, setFeedback] = useState("")

  useEffect(() => () => {
    window.clearTimeout(feedbackTimerRef.current)
  }, [])

  const showFeedback = (message: string) => {
    window.clearTimeout(feedbackTimerRef.current)
    setFeedback(message)

    feedbackTimerRef.current = window.setTimeout(
      () => setFeedback(""),
      4000
    )
  }

  if (!topic) {
    return (
      <Navigate
        to="/tham-van-tam-ly"
        replace
      />
    )
  }

  const handleDownloadImages = async () => {
    if (isGeneratingImages) return

    setIsGeneratingImages(true)
    setFeedback("")

    try {
      const image =
        exportContainerRef.current?.querySelector<HTMLElement>(
          "[data-counseling-long-image]"
        )

      if (!image) {
        throw new Error(
          "Counseling long-image export was not rendered"
        )
      }

      await downloadCounselingLongImage(
        topic,
        image
      )

      showFeedback("Đã tải ảnh chia sẻ")
    } catch (error) {
      console.error(
        "INSPIRE counseling image export failed:",
        error
      )

      if (error instanceof CounselingImageTooTallError) {
        showFeedback(
          "Bài viết quá dài để xuất thành một ảnh trên trình duyệt này."
        )
      } else {
        showFeedback(
          "Không thể tạo ảnh. Vui lòng thử lại."
        )
      }
    } finally {
      setIsGeneratingImages(false)
    }
  }

  const handleShare = async () => {
    try {
      const result = await shareCounselingTopic(topic)

      if (result === "shared") {
        showFeedback("Đã chia sẻ")
      }

      if (result === "copied") {
        showFeedback("Đã sao chép liên kết")
      }
    } catch (error) {
      console.error(
        "INSPIRE counseling share failed:",
        error
      )

      showFeedback(
        "Không thể chia sẻ. Vui lòng thử lại."
      )
    }
  }

  return (
    <div className="site-shell counseling-topic-page">

      <Header />


      <main>

        <section className="counseling-topic-hero">

          <div className="counseling-topic-hero-inner">

            <Link
              to="/tham-van-tam-ly"
              className="counseling-topic-back"
            >
              <Icon
                name="arrow"
                size={16}
              />

              Tham vấn tâm lý
            </Link>


            <div className="eyebrow">
              CHỦ ĐỀ {topic.number}
            </div>


            <h1>
              {topic.title}
            </h1>


            <p>
              {topic.subtitle}
            </p>


            <div className="counseling-topic-actions">

              <button
                type="button"
                className="counseling-export-button"
                onClick={() => window.print()}
                aria-label="Tải bài viết dưới dạng PDF"
              >
                <Icon name="book" size={18} />
                Tải PDF
              </button>


              <button
                type="button"
                className="counseling-export-button"
                onClick={handleDownloadImages}
                disabled={isGeneratingImages}
                aria-label="Tải bộ ảnh chia sẻ"
              >
                <Icon name="spark" size={18} />

                {isGeneratingImages
                  ? "Đang tạo ảnh..."
                  : "Tải ảnh chia sẻ"}
              </button>


              <button
                type="button"
                className="counseling-export-button"
                onClick={handleShare}
                aria-label="Chia sẻ bài viết"
              >
                <Icon name="arrow" size={18} />
                Chia sẻ
              </button>

            </div>


            <p
              className="counseling-topic-feedback"
              aria-live="polite"
              role="status"
            >
              {feedback}
            </p>

          </div>

        </section>


        <article className="counseling-article">

          <TopicContent blocks={topic.intro} />


          <section className="counseling-suitable-panel">

            <div className="eyebrow light">
              KHI NÀO BẠN CÓ THỂ CẦN KHÔNG GIAN NÀY?
            </div>


            <h2>
              {topic.suitableForTitle}
            </h2>


            <ul>

              {topic.suitableFor.map(item => (

                <li key={item}>

                  <span>
                    <Icon
                      name="check"
                      size={17}
                    />
                  </span>

                  {item}

                </li>

              ))}

            </ul>

          </section>


          <TopicContent blocks={topic.content} />

        </article>


        <section className="counseling-topic-cta">

          <div className="eyebrow">
            BẮT ĐẦU THAM VẤN
          </div>


          <h2>
            Khi bạn muốn nhìn điều này sâu hơn,
            INSPIRE sẵn sàng lắng nghe.
          </h2>


          <p>
            Gửi thông tin cơ bản để INSPIRE liên hệ lại
            và cùng bạn xác nhận một cuộc gặp phù hợp.
          </p>


          <Link
            to="/tham-van-tam-ly#dat-lich"
            className="primary-btn"
          >
            Đặt lịch tham vấn

            <Icon
              name="arrow"
              size={18}
            />
          </Link>

        </section>


        <Contact />

      </main>


      <Footer />


      <div
        className="counseling-long-image-export"
        ref={exportContainerRef}
        aria-hidden="true"
      >

        <CounselingLongImage topic={topic} />

      </div>

    </div>
  )
}
