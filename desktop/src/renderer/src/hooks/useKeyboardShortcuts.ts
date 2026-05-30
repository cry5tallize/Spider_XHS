import { useEffect } from 'react'
import type { PageKey } from '../types'

interface ShortcutActions {
  setActivePage: (page: PageKey) => void
  closeDrawer: () => void
}

function isInputFocused(): boolean {
  const tag = document.activeElement?.tagName?.toLowerCase() ?? ''
  const isEditable = document.activeElement?.getAttribute('contenteditable') === 'true'
  return tag === 'input' || tag === 'textarea' || tag === 'select' || isEditable
}

export function useKeyboardShortcuts({ setActivePage, closeDrawer }: ShortcutActions) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isInputFocused()) return

      const ctrl = e.ctrlKey || e.metaKey
      const shift = e.shiftKey

      // Ctrl+N → New Task
      if (ctrl && !shift && e.key === 'n') {
        e.preventDefault()
        setActivePage('newTask')
        return
      }

      // Ctrl+W → Note Workbench
      if (ctrl && !shift && e.key === 'w') {
        e.preventDefault()
        setActivePage('noteWorkbench')
        return
      }

      // Ctrl+, → Settings
      if (ctrl && !shift && e.key === ',') {
        e.preventDefault()
        setActivePage('settings')
        return
      }

      // Ctrl+Shift+D → Dashboard
      if (ctrl && shift && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault()
        setActivePage('dashboard')
        return
      }

      // Ctrl+Shift+T → Tasks
      if (ctrl && shift && (e.key === 't' || e.key === 'T')) {
        e.preventDefault()
        setActivePage('tasks')
        return
      }

      // Escape → close drawer / deselect
      if (e.key === 'Escape') {
        closeDrawer()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setActivePage, closeDrawer])
}
