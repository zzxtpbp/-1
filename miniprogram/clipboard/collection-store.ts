import type { ClipboardItem } from './clipboard-types'

const STORAGE_KEY = 'world_collection_items'
const DIR_NAME = 'collection'

export type CollectionEntry = {
  id: string
  type: ClipboardItem['type']
  createdAt: number
  previewPath: string
  cutoutPath?: string
  sourcePath?: string
  bbox?: ClipboardItem['bbox']
  color?: { hex: string; rgb: [number, number, number] }
}

let cache: CollectionEntry[] | null = null

function ensureDir(): void {
  try {
    const fs = wx.getFileSystemManager()
    const dirPath = `${wx.env.USER_DATA_PATH}/${DIR_NAME}`
    try {
      fs.accessSync(dirPath)
    } catch {
      fs.mkdirSync(dirPath, true)
    }
  } catch (err) {
    console.warn('[collection] ensureDir fail', err)
  }
}

export const collectionStore = {
  /** 保存一个捕捉到的物体到收集册 — 复制 sourceImage / cutoutImage 到持久路径 */
  async save(item: ClipboardItem): Promise<CollectionEntry | null> {
    if (!item.sourceImage) return null
    ensureDir()
    const fs = wx.getFileSystemManager()
    const ts = Date.now()
    const baseName = `${item.id || ts}`
    const targetDir = `${wx.env.USER_DATA_PATH}/${DIR_NAME}`

    let previewPath = ''
    let cutoutPath = ''
    let sourcePath = ''
    try {
      // 源图
      const srcDest = `${targetDir}/${baseName}-src.png`
      fs.copyFileSync(item.sourceImage, srcDest)
      sourcePath = srcDest
      // 预览图 — 优先 cutout，否则 source
      if (item.cutoutImage) {
        const cutDest = `${targetDir}/${baseName}-cut.png`
        fs.copyFileSync(item.cutoutImage, cutDest)
        cutoutPath = cutDest
        previewPath = cutDest
      } else {
        previewPath = srcDest
      }
    } catch (err) {
      console.warn('[collection] copyFileSync fail', err)
      return null
    }

    const entry: CollectionEntry = {
      id: `${baseName}`,
      type: item.type,
      createdAt: ts,
      previewPath,
      cutoutPath: cutoutPath || undefined,
      sourcePath: sourcePath,
      bbox: item.bbox,
      color: item.color,
    }

    const list = collectionStore.getAll()
    list.unshift(entry)
    try {
      wx.setStorageSync(STORAGE_KEY, list)
      cache = list
    } catch (err) {
      console.warn('[collection] setStorageSync fail', err)
    }
    return entry
  },

  getAll(): CollectionEntry[] {
    if (cache) return cache
    try {
      const raw = wx.getStorageSync(STORAGE_KEY)
      if (Array.isArray(raw)) {
        cache = raw as CollectionEntry[]
        return cache!
      }
    } catch { /* ignore */ }
    cache = []
    return cache
  },

  getById(id: string): CollectionEntry | undefined {
    return collectionStore.getAll().find((e) => e.id === id)
  },

  remove(id: string): void {
    const list = collectionStore.getAll().filter((e) => e.id !== id)
    try {
      wx.setStorageSync(STORAGE_KEY, list)
    } catch { /* ignore */ }
    // 删除文件
    const entry = cache?.find((e) => e.id === id)
    if (entry) {
      const fs = wx.getFileSystemManager()
      ;[entry.previewPath, entry.cutoutPath, entry.sourcePath].forEach((p) => {
        if (!p) return
        try { fs.unlinkSync(p) } catch { /* ignore */ }
      })
    }
    cache = list
  },

  clear(): void {
    const list = collectionStore.getAll()
    const fs = wx.getFileSystemManager()
    list.forEach((entry) => {
      ;[entry.previewPath, entry.cutoutPath, entry.sourcePath].forEach((p) => {
        if (!p) return
        try { fs.unlinkSync(p) } catch { /* ignore */ }
      })
    })
    try { wx.removeStorageSync(STORAGE_KEY) } catch { /* ignore */ }
    cache = []
  },
}
