import { clipboardStore } from '../../clipboard/clipboard-store'
import type { ClipboardItem } from '../../clipboard/clipboard-types'
import { APP_CONFIG } from '../../config'
import {
  generateMockPerler,
  generatePerlerFromPixels,
} from '../../plugins/perler/perler-generator'
import type { PerlerResult } from '../../plugins/perler/perler-types'
import { sampleNeighborhoodColor } from '../../vision/color-picker'
import { extractObject, mapPreviewRectToImage } from '../../vision/object-extractor'
import {
  generatePixelArtFromPixels,
  renderPixelArtSheet,
  type PixelArtResult,
} from '../../plugins/pixel-art/index'
import {
  generateLegoFromPixels,
  renderLegoSheet,
  type LegoResult,
} from '../../plugins/lego/index'
import {
  generateCrossStitchFromPixels,
  renderCrossStitchSheet,
  type CrossStitchResult,
} from '../../plugins/cross-stitch/index'
import {
  renderStickerSheet,
  STICKER_PLUGIN_AVAILABLE,
  type StickerResult,
} from '../../plugins/sticker/index'
import { createRelief3D, type Relief3DHandle } from '../../plugins/relief-3d/index'

type TemplateKind = 'perler' | 'sticker' | 'pixel' | 'lego' | 'cross' | 'relief'

const ALL_TEMPLATES = [
  { id: 'perler', label: '拼豆模板', disabled: false, widthClass: 'third' },
  { id: 'sticker', label: '贴纸', disabled: !STICKER_PLUGIN_AVAILABLE, widthClass: 'third' },
  { id: 'pixel', label: '像素画', disabled: false, widthClass: 'third' },
  { id: 'lego', label: 'LEGO 模板', disabled: false, widthClass: 'half' },
  { id: 'cross', label: '十字绣', disabled: false, widthClass: 'half' },
  { id: 'relief', label: '3D 模型', disabled: false, widthClass: 'full' },
]

const CROP_TIMEOUT_MS = 5000
const CROP_MAX_EDGE = 384

type GridCells = Array<{ key: string; color: string; empty: boolean; symbol?: string }>

Page({
  cropCanvas: null as WechatMiniprogram.CanvasNode | null,
  cropCtx: null as WechatMiniprogram.CanvasRenderingContext2D | null,
  resultCanvas: null as WechatMiniprogram.CanvasNode | null,
  reliefCanvas: null as WechatMiniprogram.CanvasNode | null,
  reliefHandle: null as Relief3DHandle | null,
  cropReady: false,
  resultReady: false,
  cropResolved: false,
  cropTimer: null as ReturnType<typeof setTimeout> | null,
  pendingItem: null as ClipboardItem | null,
  objectPixels: null as { data: Uint8ClampedArray; width: number; height: number } | null,

  // 3D 手势状态
  reliefRotX: 0.25,
  reliefRotY: 0,
  reliefScale: 0.85,
  reliefTouchStart: null as { x: number; y: number; rotY: number; rotX: number; scale: number } | null,

  data: {
    item: createFallbackItem(),
    typeLabel: '物体',
    colorHex: '#6E747A',
    rgbText: '110, 116, 122',
    cutoutImage: '',
    hasRealCapture: false,
    templates: ALL_TEMPLATES.map((t) => ({ ...t, active: false })),
    showResult: false,
    templateKind: '' as TemplateKind | '',
    gridCols: 0,
    gridRows: 0,
    gridCells: [] as GridCells,
    gridColors: [] as Array<{ id: string; name: string; hex: string; count: number; symbol?: string }>,
    gridTotalCells: 0,
    crossSymbolMap: {} as Record<string, string>,
    stickerImage: '',
    canSave: false,
    saving: false,
    reliefVisible: false,
  },

  onShow() {
    console.log('[clipboard] onShow')
    const item = clipboardStore.get() || createFallbackItem()
    const color = item.color || { hex: '#6E747A', rgb: [110, 116, 122] as [number, number, number] }
    const hasRealCapture = Boolean(item.sourceImage && item.bbox)
    this.objectPixels = null
    this.cropResolved = false
    this.pendingItem = hasRealCapture ? item : null
    this.setData({
      item,
      typeLabel: getTypeLabel(item.type),
      colorHex: color.hex,
      rgbText: color.rgb.join(', '),
      cutoutImage: '',
      hasRealCapture,
      showResult: false,
      templateKind: '',
      gridCols: 0,
      gridRows: 0,
      gridCells: [],
      gridColors: [],
      gridTotalCells: 0,
      crossSymbolMap: {},
      stickerImage: '',
      canSave: false,
      saving: false,
      templates: ALL_TEMPLATES.map((t) => ({ ...t, active: false })),
    })
    console.log('[clipboard] state', { hasRealCapture, cropReady: this.cropReady, resultReady: this.resultReady })
    if (hasRealCapture && this.cropReady) {
      console.log('[clipboard] crop ready → start prepare')
      this.prepareRealCapture(item)
    }
  },

  onReady() {
    console.log('[clipboard] onReady')
    wx.createSelectorQuery()
      .select('#crop-canvas')
      .node()
      .exec((cropRes) => {
        const cropCanvas = cropRes[0]?.node as WechatMiniprogram.CanvasNode | undefined
        if (!cropCanvas) {
          console.warn('[clipboard] crop-canvas unavailable')
          return
        }
        this.cropCanvas = cropCanvas
        this.cropCtx = cropCanvas.getContext('2d')
        this.cropReady = true
        console.log('[clipboard] crop-canvas ready')
        this.maybeStartCapture()
      })
    wx.createSelectorQuery()
      .select('#result-canvas')
      .node()
      .exec((res) => {
        const resultCanvas = res[0]?.node as WechatMiniprogram.CanvasNode | undefined
        if (!resultCanvas) {
          console.warn('[clipboard] result-canvas unavailable')
          return
        }
        this.resultCanvas = resultCanvas
        this.resultReady = true
        console.log('[clipboard] result-canvas ready')
      })
    wx.createSelectorQuery()
      .select('#relief-canvas')
      .node()
      .exec((res) => {
        const reliefCanvas = res[0]?.node as WechatMiniprogram.CanvasNode | undefined
        if (!reliefCanvas) {
          console.warn('[clipboard] relief-canvas unavailable')
          return
        }
        this.reliefCanvas = reliefCanvas
        // 初始化 relief handle（用 mock 数据占位，等 renderReliefBranch 喂真实数据）
        const mock = buildMockCutout('object')
        this.reliefHandle = createRelief3D(reliefCanvas, mock, 64, 64)
        console.log('[clipboard] relief-canvas ready')
      })
  },

  maybeStartCapture() {
    const item = this.pendingItem
    if (!item || !this.cropCanvas || !this.cropCtx) return
    console.log('[clipboard] maybeStartCapture → prepareRealCapture')
    this.prepareRealCapture(item)
  },

  prepareRealCapture(item: ClipboardItem) {
    if (!item.sourceImage || !item.bbox || !this.cropCanvas || !this.cropCtx) return
    if (this.cropResolved) return
    this.cropResolved = true

    // 5s 超时保护
    if (this.cropTimer) clearTimeout(this.cropTimer)
    this.cropTimer = setTimeout(() => {
      if (this.cropResolved && !this.objectPixels) {
        console.warn('[clipboard] prepareRealCapture timed out → fallback mock')
        this.objectPixels = { data: buildMockCutout(item.type), width: 64, height: 64 }
      }
    }, CROP_TIMEOUT_MS)

    console.log('[clipboard] prepareRealCapture start', { bbox: item.bbox, sourceImage: item.sourceImage })
    const canvas = this.cropCanvas
    const ctx = this.cropCtx
    const image = canvas.createImage()
    image.onload = () => {
      console.log('[clipboard] image loaded', { width: image.width, height: image.height })
      try {
        const windowInfo = wx.getWindowInfo()
        const sourceRect = mapPreviewRectToImage(
          item.bbox as NonNullable<ClipboardItem['bbox']>,
          image.width,
          image.height,
          windowInfo.windowWidth,
          windowInfo.windowHeight,
        )
        const scale = Math.min(
          1,
          CROP_MAX_EDGE / Math.max(sourceRect.width, sourceRect.height),
        )
        const targetWidth = Math.max(4, Math.round(sourceRect.width * scale))
        const targetHeight = Math.max(4, Math.round(sourceRect.height * scale))
        console.log('[clipboard] draw', { sourceRect, targetWidth, targetHeight })
        canvas.width = targetWidth
        canvas.height = targetHeight
        ctx.clearRect(0, 0, targetWidth, targetHeight)
        ctx.drawImage(
          image,
          sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height,
          0, 0, targetWidth, targetHeight,
        )

        const frame = ctx.getImageData(0, 0, targetWidth, targetHeight)
        const frameData = frame.data as unknown as Uint8ClampedArray
        console.log('[clipboard] raw frame', { length: frameData.length, w: targetWidth, h: targetHeight })
        const extracted = extractObject(frameData, targetWidth, targetHeight)
        console.log('[clipboard] extractObject', { coverage: extracted.coverage, w: extracted.width, h: extracted.height })

        this.objectPixels = { data: extracted.data, width: extracted.width, height: extracted.height }

        if (item.type === 'color') {
          const sampled = sampleNeighborhoodColor(
            extracted.data, extracted.width, extracted.height, 0.5, 0.5,
            Math.max(2, Math.round(Math.min(extracted.width, extracted.height) * 0.1)),
          )
          item.color = sampled
          clipboardStore.set(item)
          this.setData({ colorHex: sampled.hex, rgbText: sampled.rgb.join(', ') })
        }

        // 导出 bbox 原图作为 hero 预览（不做抠图，避免 putImageData 真机兼容问题）
        wx.canvasToTempFilePath({
          canvas,
          fileType: 'png',
          success: (res) => {
            console.log('[clipboard] cutoutImage saved', res.tempFilePath)
            item.cutoutImage = res.tempFilePath
            clipboardStore.set(item)
            this.setData({ cutoutImage: res.tempFilePath })
          },
          fail: (err) => {
            console.warn('[clipboard] canvasToTempFilePath fail', err)
          },
        })
      } catch (error) {
        console.error('[clipboard] prepareRealCapture error', error)
        this.cropResolved = false
      }
    }
    image.onerror = (error: unknown) => {
      console.error('[clipboard] image load error', error)
      this.cropResolved = false
      this.objectPixels = { data: buildMockCutout(item.type), width: 64, height: 64 }
    }
    image.src = item.sourceImage
  },

  onBack() {
    wx.navigateBack({ delta: 1 })
  },

  onOpenCollection() {
    wx.navigateTo({ url: '/pages/collection/collection' })
  },

  onTemplateSelect(event: { detail: { id: TemplateKind } }) {
    const id = event.detail.id
    const template = ALL_TEMPLATES.find((t) => t.id === id)
    console.log('[clipboard] onTemplateSelect', id, { hasRealCapture: this.data.hasRealCapture, hasPixels: !!this.objectPixels })
    if (!template || template.disabled) return

    if (this.data.hasRealCapture && !this.objectPixels) {
      wx.showToast({ title: '实物解析中，请稍候', icon: 'none' })
      return
    }

    const item = this.data.item as ClipboardItem
    const pixels = this.objectPixels
    const width = pixels?.width ?? 64
    const height = pixels?.height ?? 64
    const rgba = pixels?.data ?? buildMockCutout(item.type)

    console.log('[clipboard] input', { w: width, h: height, len: rgba.length })

    this.setData({
      templates: ALL_TEMPLATES.map((t) => ({ ...t, active: t.id === id })),
      showResult: true,
      templateKind: id,
      reliefVisible: id === 'relief',
    })

    const start = Date.now()
    try {
      switch (id) {
        case 'perler': this.renderPerlerBranch(rgba, width, height, item.type); break
        case 'pixel': this.renderPixelBranch(rgba, width, height); break
        case 'lego': this.renderLegoBranch(rgba, width, height); break
        case 'cross': this.renderCrossBranch(rgba, width, height); break
        case 'sticker': this.renderStickerBranch(rgba, width, height); return
        case 'relief': this.renderReliefBranch(rgba, width, height); break
      }
    } catch (error) {
      console.error('[clipboard] render error', error)
      wx.showToast({ title: '生成图纸失败', icon: 'none' })
      return
    }

    const cost = Date.now() - start
    console.log('[clipboard] render done', id, cost + 'ms')
    wx.showToast({ title: `生成耗时 ${cost}ms`, icon: 'none', duration: 1200 })
    setTimeout(() => wx.pageScrollTo({ selector: '#result-section', duration: 360 }), 80)
  },

  renderPerlerBranch(rgba: Uint8ClampedArray, width: number, height: number, type: ClipboardItem['type']) {
    const result = this.objectPixels
      ? generatePerlerFromPixels(rgba, width, height, type)
      : generateMockPerler(type)
    this.renderPerlerSheet(result)
    this.setData({
      gridCols: result.cols,
      gridRows: result.rows,
      gridCells: result.cells.map((c) => ({ ...c })),
      gridColors: result.colors.map((c) => ({ ...c })),
      gridTotalCells: result.totalBeads,
      canSave: true,
    })
  },

  renderPixelBranch(rgba: Uint8ClampedArray, width: number, height: number) {
    const result: PixelArtResult = generatePixelArtFromPixels(rgba, width, height)
    if (this.resultCanvas) renderPixelArtSheet(this.resultCanvas, result)
    this.setData({
      gridCols: result.cols,
      gridRows: result.rows,
      gridCells: result.cells.map((c, idx) => ({
        key: `${idx % result.cols}-${Math.floor(idx / result.cols)}`,
        color: c?.hex ?? '#E5E8EC',
        empty: c === null,
      })),
      gridColors: result.colors.map((c) => ({ ...c })),
      gridTotalCells: result.totalCells,
      canSave: true,
    })
  },

  renderLegoBranch(rgba: Uint8ClampedArray, width: number, height: number) {
    const result: LegoResult = generateLegoFromPixels(rgba, width, height)
    if (this.resultCanvas) renderLegoSheet(this.resultCanvas, result)
    this.setData({
      gridCols: result.cols,
      gridRows: result.rows,
      gridCells: result.cells.map((c, idx) => ({
        key: `${idx % result.cols}-${Math.floor(idx / result.cols)}`,
        color: c?.hex ?? '#B0B0B0',
        empty: c === null,
      })),
      gridColors: result.colors.map((c) => ({ ...c })),
      gridTotalCells: result.totalCells,
      canSave: true,
    })
  },

  renderCrossBranch(rgba: Uint8ClampedArray, width: number, height: number) {
    const result: CrossStitchResult = generateCrossStitchFromPixels(rgba, width, height)
    if (this.resultCanvas) renderCrossStitchSheet(this.resultCanvas, result)
    const symbolMap: Record<string, string> = {}
    for (const color of result.colors) symbolMap[color.id] = result.symbolMap[color.id]
    this.setData({
      gridCols: result.cols,
      gridRows: result.rows,
      gridCells: result.cells.map((c, idx) => ({
        key: `${idx % result.cols}-${Math.floor(idx / result.cols)}`,
        color: c?.hex ?? '#FFFFFF',
        empty: c === null,
        symbol: c ? result.symbolMap[c.id] : '',
      })),
      gridColors: result.colors.map((c) => ({ ...c, symbol: result.symbolMap[c.id] })),
      gridTotalCells: result.totalCells,
      crossSymbolMap: symbolMap,
      canSave: true,
    })
  },

  renderStickerBranch(rgba: Uint8ClampedArray, width: number, height: number) {
    if (!this.resultCanvas) return
    const sticker: StickerResult = renderStickerSheet(this.resultCanvas, rgba, width, height)
    void sticker
    wx.canvasToTempFilePath({
      canvas: this.resultCanvas,
      fileType: 'png',
      success: (res) => {
        console.log('[clipboard] sticker saved', res.tempFilePath)
        this.setData({ stickerImage: res.tempFilePath, canSave: true })
      },
      fail: (err) => {
        console.error('[clipboard] sticker fail', err)
        wx.showToast({ title: '贴纸生成失败', icon: 'none' })
      },
    })
  },

  renderReliefBranch(rgba: Uint8ClampedArray, width: number, height: number) {
    if (!this.reliefHandle || !this.reliefCanvas) {
      console.warn('[clipboard] relief not ready yet')
      return
    }
    // 重置视角
    this.reliefRotX = 0.25
    this.reliefRotY = 0
    this.reliefScale = 0.85
    this.reliefHandle.setRotation(this.reliefRotX, this.reliefRotY)
    this.reliefHandle.setScale(this.reliefScale)
    this.reliefHandle.updatePixels(rgba, width, height)
    this.reliefHandle.render()
    this.setData({ canSave: true })
  },

  // ===== 3D 手势事件 =====
  onReliefTouchStart(event: { touches: Array<{ x: number; y: number }> }) {
    const t = event.touches
    if (!t || t.length === 0) return
    this.reliefTouchStart = {
      x: t[0].x,
      y: t[0].y,
      rotY: this.reliefRotY,
      rotX: this.reliefRotX,
      scale: this.reliefScale,
    }
  },

  onReliefTouchMove(event: { touches: Array<{ x: number; y: number }> }) {
    const start = this.reliefTouchStart
    const t = event.touches
    if (!start || !t || t.length === 0 || !this.reliefHandle) return

    const dx = t[0].x - start.x
    const dy = t[0].y - start.y
    // 单指拖拽 → 旋转
    if (t.length === 1) {
      this.reliefRotY = start.rotY + dx * 0.008
      this.reliefRotX = start.rotX + dy * 0.006
      this.reliefHandle.setRotation(this.reliefRotX, this.reliefRotY)
    }
    // 双指缩放（简化版：用 y 偏移做缩放）
    else if (t.length === 2) {
      const pincy = (t[0].y + t[1].y) / 2 - start.y
      this.reliefScale = start.scale + pincy * 0.002
      this.reliefHandle.setScale(this.reliefScale)
    }
  },

  onReliefTouchEnd() {
    this.reliefTouchStart = null
  },

  renderPerlerSheet(perler: PerlerResult) {
    if (!this.resultCanvas) return
    const canvas = this.resultCanvas
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const cell = 24
    const padding = 36
    const width = padding * 2 + perler.cols * cell
    const height = padding * 2 + perler.rows * cell
    canvas.width = width
    canvas.height = height

    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, width, height)

    // 先画所有珠子的投影阴影（一次性）
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.22)'
    ctx.shadowBlur = 4
    ctx.shadowOffsetX = 1
    ctx.shadowOffsetY = 2
    for (const bead of perler.cells) {
      if (bead.empty) continue
      const [x, y] = bead.key.split('-').map(Number)
      const cx = padding + x * cell + cell / 2
      const cy = padding + y * cell + cell / 2
      ctx.beginPath()
      ctx.arc(cx, cy, cell * 0.42, 0, Math.PI * 2)
      ctx.fillStyle = bead.color
      ctx.fill()
    }
    ctx.restore()

    // 再画所有珠子的高光（单独 pass，不受 shadow 影响）
    for (const bead of perler.cells) {
      if (bead.empty) continue
      const [x, y] = bead.key.split('-').map(Number)
      const cx = padding + x * cell + cell / 2
      const cy = padding + y * cell + cell / 2
      const r = cell * 0.42
      // 上小高光弧
      ctx.beginPath()
      ctx.arc(cx - r * 0.35, cy - r * 0.4, r * 0.32, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)'
      ctx.fill()
      // 下大半环高光（半圆）
      ctx.beginPath()
      ctx.arc(cx, cy, r * 0.75, Math.PI * 0.7, Math.PI * 1.3)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)'
      ctx.lineWidth = Math.max(1, cell * 0.08)
      ctx.stroke()
    }
  },

  onSave() {
    if (!this.data.canSave || this.data.saving || !this.resultCanvas) return
    this.setData({ saving: true })
    const canvas = this.resultCanvas
    wx.canvasToTempFilePath({
      canvas,
      fileType: 'png',
      success: (res) => this.saveToAlbum(res.tempFilePath),
      fail: (err) => {
        console.error('[clipboard] save canvasToTempFilePath fail', err)
        this.setData({ saving: false })
        wx.showToast({ title: '图纸生成失败', icon: 'none' })
      },
    })
  },

  saveToAlbum(filePath: string) {
    wx.saveImageToPhotosAlbum({
      filePath,
      success: () => {
        this.setData({ saving: false })
        wx.showToast({ title: '已保存到手机', icon: 'success' })
      },
      fail: (error) => {
        this.setData({ saving: false })
        if (isAuthDenied(error)) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中允许保存图片到相册',
            confirmText: '去设置',
            cancelText: '取消',
            success: (modal) => {
              if (!modal.confirm) return
              wx.openSetting()
            },
          })
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' })
        }
      },
    })
  },
})

function isAuthDenied(error: unknown): boolean {
  const message = String((error as { errMsg?: string })?.errMsg || error)
  return /auth|deny|authorize/i.test(message)
}

function getTypeLabel(type: ClipboardItem['type']): string {
  if (type === 'color') return '颜色'
  if (type === 'contour') return '轮廓'
  return '物体'
}

function createFallbackItem(): ClipboardItem {
  return {
    id: 'fallback-object',
    type: 'object',
    createdAt: Date.now(),
    previewImage: 'mock://cat-object',
    maskImage: 'mock://cat-mask',
    bbox: { x: 0.3, y: 0.28, width: 0.4, height: 0.48 },
    spatial: { x: 0.5, y: 0.56, scale: 1, rotation: 0 },
  }
}

function buildMockCutout(type: ClipboardItem['type']): Uint8ClampedArray {
  const size = 64
  const rgba = new Uint8ClampedArray(size * size * 4)
  const cx = size / 2
  const cy = size * 0.55
  const rx = size * 0.32
  const ry = size * 0.38
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const inside = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
      const i = (y * size + x) * 4
      if (!inside) continue
      if (type === 'contour') {
        const edge = !isInside(x - 1, y, cx, cy, rx, ry) || !isInside(x + 1, y, cx, cy, rx, ry)
        if (!edge) continue
      }
      rgba[i] = 200; rgba[i + 1] = 160; rgba[i + 2] = 120; rgba[i + 3] = 255
    }
  }
  return rgba
}

function isInside(x: number, y: number, cx: number, cy: number, rx: number, ry: number): boolean {
  return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
}
