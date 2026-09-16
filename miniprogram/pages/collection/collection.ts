import { collectionStore, type CollectionEntry } from '../../clipboard/collection-store'

Page({
  data: {
    items: [] as Array<CollectionEntry & { timeLabel: string }>,
    empty: true,
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const list = collectionStore.getAll()
    const decorated = list.map((e) => ({
      ...e,
      timeLabel: formatRelative(e.createdAt),
    }))
    this.setData({ items: decorated, empty: decorated.length === 0 })
  },

  onBack() {
    wx.navigateBack({ delta: 1 })
  },

  onOpenDetail(event: { currentTarget: { dataset: { id: string } } }) {
    const id = event.currentTarget.dataset.id
    const entry = collectionStore.getById(id)
    if (!entry) return
    // 直接预览图片（小程序预览 API）
    wx.previewImage({
      current: entry.previewPath,
      urls: [entry.previewPath],
    })
  },

  onDelete(event: { currentTarget: { dataset: { id: string } } }) {
    const id = event.currentTarget.dataset.id
    wx.showModal({
      title: '删除这个物体？',
      content: '此操作不可恢复',
      success: (res) => {
        if (!res.confirm) return
        collectionStore.remove(id)
        this.refresh()
        wx.showToast({ title: '已删除', icon: 'success' })
      },
    })
  },

  onClearAll() {
    if (this.data.empty) return
    wx.showModal({
      title: '清空收集册？',
      content: '所有已收集的物体将被永久删除',
      confirmText: '清空',
      success: (res) => {
        if (!res.confirm) return
        collectionStore.clear()
        this.refresh()
        wx.showToast({ title: '已清空', icon: 'success' })
      },
    })
  },
})

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}秒前`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}小时前`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}天前`
  const d = new Date(ts)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
