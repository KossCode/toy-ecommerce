import { useEffect } from 'react'

/** Nested modals share one body lock — unlock only when the last overlay closes. */
let lockCount = 0
let previousOverflow = ''
let previousPaddingRight = ''

function lockBody() {
  if (lockCount === 0) {
    const scrollbar = window.innerWidth - document.documentElement.clientWidth
    previousOverflow = document.body.style.overflow
    previousPaddingRight = document.body.style.paddingRight
    document.body.style.overflow = 'hidden'
    if (scrollbar > 0) {
      document.body.style.paddingRight = `${scrollbar}px`
    }
  }
  lockCount += 1
}

function unlockBody() {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0) {
    document.body.style.overflow = previousOverflow
    document.body.style.paddingRight = previousPaddingRight
  }
}

function isInsideModalScroll(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('[data-modal-scroll]'))
}

/** Prevent background page scroll while a modal/overlay is open. */
export function useBodyScrollLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    lockBody()

    const onWheel = (e: WheelEvent) => {
      if (!isInsideModalScroll(e.target)) e.preventDefault()
    }
    const onTouchMove = (e: TouchEvent) => {
      if (!isInsideModalScroll(e.target)) e.preventDefault()
    }

    document.addEventListener('wheel', onWheel, { passive: false })
    document.addEventListener('touchmove', onTouchMove, { passive: false })

    return () => {
      document.removeEventListener('wheel', onWheel)
      document.removeEventListener('touchmove', onTouchMove)
      unlockBody()
    }
  }, [enabled])
}
