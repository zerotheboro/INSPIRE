import { Fragment, ReactNode } from "react"

import Icon from "./Icon"
import {
  CounselingContentBlock,
  CounselingTopic
} from "../data/counselingTopics"


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


function LongImageContent({
  blocks
}: {
  blocks: CounselingContentBlock[]
}) {
  return (
    <div className="counseling-long-image-flow">

      {blocks.map((block, index) => {

        if (block.type === "divider") {
          return (
            <hr key={`divider-${index}`} />
          )
        }

        return (
          <p
            className={
              block.type === "emphasis"
                ? "counseling-long-image-emphasis"
                : undefined
            }
            key={`${block.type}-${index}`}
          >
            {renderInlineFormatting(block.content)}
          </p>
        )

      })}

    </div>
  )
}


export default function CounselingLongImage({
  topic
}: {
  topic: CounselingTopic
}) {
  return (
    <article
      className="counseling-long-image"
      data-counseling-long-image
    >

      <header className="counseling-long-image-header">

        <span className="counseling-long-image-brand-mark">
          <Icon name="leaf" size={30} />
        </span>

        <div>
          <strong>INSPIRE</strong>
          <span>Tham vấn tâm lý</span>
        </div>

      </header>


      <section className="counseling-long-image-hero">

        <span>CHỦ ĐỀ {topic.number}</span>

        <h1>{topic.title}</h1>

        <p>{topic.subtitle}</p>

      </section>


      <section className="counseling-long-image-article">

        <LongImageContent blocks={topic.intro} />


        <section className="counseling-long-image-suitable">

          <span>
            KHI NÀO BẠN CÓ THỂ CẦN KHÔNG GIAN NÀY?
          </span>

          <h2>{topic.suitableForTitle}</h2>

          <ul>

            {topic.suitableFor.map(item => (
              <li key={item}>

                <span>
                  <Icon name="check" size={23} />
                </span>

                {item}
              </li>
            ))}

          </ul>

        </section>


        <LongImageContent blocks={topic.content} />

      </section>


      <footer className="counseling-long-image-footer">

        <div>
          <strong>INSPIRE</strong>
          <span>Tham vấn tâm lý</span>
        </div>

        <span>Một không gian để hiểu mình sâu hơn.</span>

      </footer>

    </article>
  )
}
