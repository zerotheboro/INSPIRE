import counselingTopicsSource from "../../docs/counseling-topics-source.md?raw"


export type CounselingContentBlock =
  | {
      type: "paragraph" | "emphasis"
      content: string
    }
  | {
      type: "divider"
    }


export type CounselingTopic = {
  slug: string
  number: string
  title: string
  subtitle: string
  intro: CounselingContentBlock[]
  suitableForTitle: string
  suitableFor: string[]
  content: CounselingContentBlock[]
}


const topicMetadata: Record<
  string,
  Pick<CounselingTopic, "slug" | "number" | "title">
> = {
  "QUAN HỆ VỚI CHÍNH MÌNH": {
    slug: "quan-he-voi-chinh-minh",
    number: "01",
    title: "Quan hệ với chính mình"
  },
  "ĐỜI SỐNG NỘI TÂM": {
    slug: "doi-song-noi-tam",
    number: "02",
    title: "Đời sống nội tâm"
  },
  "QUAN HỆ VỚI NGƯỜI KHÁC": {
    slug: "quan-he-voi-nguoi-khac",
    number: "03",
    title: "Quan hệ với người khác"
  },
  "VẬN HÀNH VÀ HÀNH ĐỘNG": {
    slug: "van-hanh-va-hanh-dong",
    number: "04",
    title: "Vận hành và hành động"
  },
  "PHƯƠNG HƯỚNG, GIÁ TRỊ VÀ LỰA CHỌN": {
    slug: "phuong-huong-gia-tri-va-lua-chon",
    number: "05",
    title: "Phương hướng, giá trị và lựa chọn"
  },
  "Ý NGHĨA VÀ CÁCH SỐNG": {
    slug: "y-nghia-va-cach-song",
    number: "06",
    title: "Ý nghĩa và cách sống"
  }
}


function normalizeExportArtifacts(sourceLine: string) {
  let line = sourceLine
    .replace(/&#xA0;/gi, " ")
    .replace(/\\([*_-])/g, "$1")

  const trimmed = line.trim()

  if (/^\*\*---\*\*$/.test(trimmed)) {
    return "---"
  }

  const wrappedHeading = trimmed.match(
    /^\*\*(#{1,6}\s+.*?)\*\*$/
  )

  if (wrappedHeading) {
    line = wrappedHeading[1]
  }

  return line.replace(/\s+$/, "")
}


function isSuitableForHeading(content: string) {
  return (
    content.startsWith("Dịch vụ này có thể phù hợp nếu bạn") ||
    content === "Có thể bạn cần không gian này khi:"
  )
}


function createTextBlock(
  content: string
): CounselingContentBlock {
  const trimmed = content.trim()
  const isEmphasis =
    trimmed.startsWith("**") &&
    trimmed.endsWith("**")

  return {
    type: isEmphasis ? "emphasis" : "paragraph",
    content: trimmed
  }
}


function parseCounselingTopics(
  source: string
): CounselingTopic[] {
  const topics: CounselingTopic[] = []
  let currentTopic: CounselingTopic | undefined
  let paragraphLines: string[] = []
  let afterSuitableFor = false
  let readingSuitableForList = false

  const flushParagraph = () => {
    if (!currentTopic || paragraphLines.length === 0) {
      paragraphLines = []
      return
    }

    const content = paragraphLines.join("\n").trim()
    paragraphLines = []

    if (!content) return

    if (isSuitableForHeading(content)) {
      currentTopic.suitableForTitle = content
      afterSuitableFor = true
      readingSuitableForList = true
      return
    }

    const target = afterSuitableFor
      ? currentTopic.content
      : currentTopic.intro

    target.push(createTextBlock(content))
  }

  const finishTopic = () => {
    flushParagraph()

    if (currentTopic) {
      topics.push(currentTopic)
    }
  }

  source
    .split(/\r?\n/)
    .map(normalizeExportArtifacts)
    .forEach((line) => {
      const headingMatch = line.match(/^#\s+(.+)$/)

      if (headingMatch) {
        flushParagraph()

        const sourceTitle = headingMatch[1].trim()
        const metadata = topicMetadata[sourceTitle]

        if (!metadata) return

        const isDuplicateHeading =
          currentTopic?.slug === metadata.slug &&
          !currentTopic.subtitle &&
          currentTopic.intro.length === 0

        if (isDuplicateHeading) return

        if (currentTopic) {
          topics.push(currentTopic)
        }

        currentTopic = {
          ...metadata,
          subtitle: "",
          intro: [],
          suitableForTitle: "Dịch vụ này có thể phù hợp nếu bạn:",
          suitableFor: [],
          content: []
        }

        afterSuitableFor = false
        readingSuitableForList = false
        return
      }

      if (!currentTopic) return

      const subtitleMatch = line.match(/^###\s+(.+)$/)

      if (subtitleMatch) {
        flushParagraph()
        currentTopic.subtitle = subtitleMatch[1].trim()
        return
      }

      if (line.trim() === "---") {
        flushParagraph()

        const target = afterSuitableFor
          ? currentTopic.content
          : currentTopic.intro

        target.push({ type: "divider" })
        readingSuitableForList = false
        return
      }

      const listItemMatch = line.match(/^\s*-\s+(.+)$/)

      if (listItemMatch && readingSuitableForList) {
        flushParagraph()
        currentTopic.suitableFor.push(
          listItemMatch[1].trim()
        )
        return
      }

      if (!line.trim()) {
        flushParagraph()
        return
      }

      if (
        readingSuitableForList &&
        currentTopic.suitableFor.length > 0
      ) {
        readingSuitableForList = false
      }

      paragraphLines.push(line)
    })

  finishTopic()

  return topics
}


export const counselingTopics =
  parseCounselingTopics(counselingTopicsSource)


export function getCounselingTopic(
  topicSlug: string | undefined
) {
  return counselingTopics.find(
    topic => topic.slug === topicSlug
  )
}
