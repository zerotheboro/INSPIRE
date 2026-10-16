import { useEffect } from "react"
import { useLocation } from "react-router"

export default function ScrollToTop() {

  const { pathname, hash } = useLocation()

  useEffect(() => {

    if (hash) {

      const frame = window.requestAnimationFrame(() => {

        const target = document.getElementById(
          decodeURIComponent(hash.slice(1))
        )

        target?.scrollIntoView({
          behavior: "auto",
          block: "start"
        })

      })

      return () => window.cancelAnimationFrame(frame)
    }

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "instant"
    })

  }, [pathname, hash])

  return null
}
