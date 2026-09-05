import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'spider-xhs-sidebar-collapsed'

function readStored(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function writeStored(value: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value))
  } catch {
    // noop
  }
}

export function useCollapsibleSidebar() {
  const [isCollapsed, setIsCollapsed] = useState(readStored)

  useEffect(() => {
    writeStored(isCollapsed)
  }, [isCollapsed])

  const toggle = useCallback(() => {
    setIsCollapsed((prev) => !prev)
  }, [])

  return {
    isCollapsed,
    toggle,
    width: isCollapsed ? 68 : 220,
  }
}
