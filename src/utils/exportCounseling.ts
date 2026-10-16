import { CounselingTopic } from "../data/counselingTopics"


export const COUNSELING_LONG_IMAGE_WIDTH = 1080

// Most current browsers cap a canvas dimension near this value.
// A future opt-in fallback could split unusually long articles, but the
// intended export remains one continuous image.
const MAX_SAFE_CANVAS_HEIGHT = 32767


type ShareApi = {
  share?: (data: ShareData) => Promise<void>
  clipboard?: {
    writeText: (text: string) => Promise<void>
  }
}


export type CounselingShareResult =
  | "shared"
  | "copied"
  | "cancelled"


export class CounselingImageTooTallError extends Error {
  height: number

  constructor(height: number, options?: ErrorOptions) {
    super(
      `Counseling image height ${height}px exceeds this browser's canvas limit`,
      options
    )

    this.name = "CounselingImageTooTallError"
    this.height = height
  }
}


function isLikelyCanvasSizeError(error: unknown) {
  if (!(error instanceof Error)) return false

  return (
    error.name === "IndexSizeError" ||
    /canvas|dimension|too large|maximum size|out of memory/i.test(
      error.message
    )
  )
}


function downloadDataUrl(
  dataUrl: string,
  filename: string
) {
  const link = document.createElement("a")

  link.href = dataUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
}


export async function downloadCounselingLongImage(
  topic: CounselingTopic,
  imageElement: HTMLElement
) {
  await document.fonts.ready
  await new Promise<void>(resolve =>
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => resolve())
    )
  )

  const imageRect = imageElement.getBoundingClientRect()
  const imageWidth = Math.round(imageRect.width)
  const imageHeight = Math.ceil(
    Math.max(imageRect.height, imageElement.scrollHeight)
  )

  if (imageWidth !== COUNSELING_LONG_IMAGE_WIDTH) {
    throw new Error(
      `Counseling image has invalid width: ${imageWidth}px`
    )
  }

  if (imageHeight > MAX_SAFE_CANVAS_HEIGHT) {
    throw new CounselingImageTooTallError(imageHeight)
  }

  const imageModule = await import("html-to-image")
  const fontEmbedCSS = await imageModule.getFontEmbedCSS(
    imageElement
  )

  try {
    const dataUrl = await imageModule.toPng(
      imageElement,
      {
        width: COUNSELING_LONG_IMAGE_WIDTH,
        height: imageHeight,
        canvasWidth: COUNSELING_LONG_IMAGE_WIDTH,
        canvasHeight: imageHeight,
        pixelRatio: 1,
        cacheBust: true,
        backgroundColor: "#f6f1e8",
        fontEmbedCSS
      }
    )

    downloadDataUrl(
      dataUrl,
      `INSPIRE-${topic.slug}.png`
    )

    return {
      width: COUNSELING_LONG_IMAGE_WIDTH,
      height: imageHeight
    }
  } catch (error) {
    if (isLikelyCanvasSizeError(error)) {
      throw new CounselingImageTooTallError(
        imageHeight,
        { cause: error }
      )
    }

    throw error
  }
}


export async function shareCounselingTopic(
  topic: CounselingTopic,
  currentUrl = window.location.href,
  shareApi: ShareApi = navigator
): Promise<CounselingShareResult> {
  if (shareApi.share) {
    try {
      await shareApi.share({
        title: topic.title,
        text: `${topic.title} - Tham vấn tâm lý tại INSPIRE`,
        url: currentUrl
      })

      return "shared"
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        return "cancelled"
      }
    }
  }

  if (!shareApi.clipboard?.writeText) {
    throw new Error("Sharing and clipboard APIs are unavailable")
  }

  await shareApi.clipboard.writeText(currentUrl)

  return "copied"
}
