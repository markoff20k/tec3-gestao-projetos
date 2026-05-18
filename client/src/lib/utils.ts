import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

type SaveFilePickerOptions = {
  suggestedName?: string
  types?: Array<{
    description?: string
    accept: Record<string, string[]>
  }>
}

type SaveFilePickerHandle = {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>
    close: () => Promise<void>
  }>
}

type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<SaveFilePickerHandle>
}

export async function saveCsvFile(fileName: string, content: string): Promise<void> {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const savePicker = (window as SaveFilePickerWindow).showSaveFilePicker

  if (savePicker) {
    try {
      const handle = await savePicker({
        suggestedName: fileName,
        types: [
          {
            description: 'Arquivo CSV',
            accept: { 'text/csv': ['.csv'] },
          },
        ],
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return
    } catch (error) {
      const name = error instanceof DOMException ? error.name : ''
      if (name === 'AbortError') {
        return
      }
    }
  }

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}
