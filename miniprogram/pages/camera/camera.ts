import { clipboardStore } from '../../clipboard/clipboard-store'
import { collectionStore } from '../../clipboard/collection-store'
import type { CaptureMode, ClipboardItem, NormalizedRect } from '../../clipboard/clipboard-types'
import { APP_CONFIG } from '../../config'
import { SpatialController } from '../../interaction/spatial-controller'
import type { NormalizedPoint } from '../../vision/hand-tracker'
import { WeChatCameraFrameSource } from '../../vision/camera-frame-source'
import { createVisionKitCameraRenderer } from '../../vision/visionkit-camera-renderer'
import { VisionKitHandSession } from '../../vision/visionkit-hand-session'
import {
  VisionKitHandGestureAdapter,
  type VisionKitHandAnchor,
} from '../../vision/visionkit-hand-tracker'

const spatialController = new SpatialController()
const visionGestureAdapter = new VisionKitHandGestureAdapter()
const visionSession = new VisionKitHandSession(
  (options) => wx.createVKSession(options),
  APP_CONFIG.VISIONKIT_FPS,
)
const frameSource = new WeChatCameraFrameSource(
  () => wx.createCameraContext(),
  APP_CONFIG.CAMERA_FRAME_INTERVAL_MS,
)
let acceptedFrameCount = 0
let visionKitStarting = false
let pageVisible = false
let frameStart: NormalizedPoint | undefined

Page({
  data: {
    mode: 'object' as CaptureMode,
    debugMode: APP_CONFIG.DEBUG_MODE,
    useVisionKit: !APP_CONFIG.USE_MOCK_HAND_TRACKING,
    useMockScene: false,
    cameraReady: false,
    cameraError: '',
    frameStatus: '等待实时画面',
    handStatus: 'VisionKit 初始化中…',
    cursorX: 0.5,
    cursorY: 0.56,
    frameRect: null as NormalizedRect | null,
    gesture: 'HOVERING',
    isFraming: false,
    isCopying: false,
    status: '捏合拖动 · 框住任意物体',
  },

  onShow() {
    pageVisible = true
    spatialController.reset()
    visionGestureAdapter.reset()
    frameStart = undefined
    this.setData({
      cursorX: 0.5,
      cursorY: 0.56,
      frameRect: null,
      gesture: 'HOVERING',
      isFraming: false,
      isCopying: false,
      status: '捏合拖动 · 框住任意物体',
    })
    if (this.data.useVisionKit && !this.data.useMockScene) {
      wx.nextTick(() => this.startVisionKit())
    } else if (this.data.cameraReady && !this.data.useMockScene) {
      this.startCameraFrames()
    }
  },

  onReady() {
    if (this.data.useVisionKit && !this.data.useMockScene) this.startVisionKit()
  },

  onHide() {
    pageVisible = false
    this.stopCameraFrames()
    this.stopVisionKit()
  },

  onUnload() {
    pageVisible = false
    this.stopCameraFrames()
    this.stopVisionKit()
  },

  onModeChange(event: { detail: { mode: CaptureMode } }) {
    this.setData({ mode: event.detail.mode, status: '捏合拖动 · 框住任意物体' })
  },

  onToggleScene() {
    const useMockScene = !this.data.useMockScene
    frameStart = undefined
    if (useMockScene) {
      this.stopCameraFrames()
      this.stopVisionKit()
      this.setData({ useMockScene, handStatus: '触摸调试模式', isFraming: false, frameRect: null })
    } else if (!APP_CONFIG.USE_MOCK_HAND_TRACKING) {
      this.setData({ useMockScene, useVisionKit: true, handStatus: 'VisionKit 初始化中…', isFraming: false, frameRect: null })
      wx.nextTick(() => this.startVisionKit())
    } else if (this.data.cameraReady) {
      this.setData({ useMockScene, isFraming: false, frameRect: null })
      this.startCameraFrames()
    } else {
      this.setData({ useMockScene, isFraming: false, frameRect: null })
    }
  },

  onCameraReady() {
    this.setData({ cameraReady: true, cameraError: '', handStatus: '实时画面 · 触摸框选' })
    if (!this.data.useMockScene) this.startCameraFrames()
  },

  onCameraError(event: { detail?: { errMsg?: string } }) {
    this.stopCameraFrames()
    this.setData({
      cameraReady: false,
      cameraError: event.detail?.errMsg || '摄像头暂不可用',
      useMockScene: true,
      frameStatus: '已切换 Mock 画面',
      handStatus: '已切换 Mock 画面',
    })
  },

  startCameraFrames() {
    acceptedFrameCount = 0
    try {
      frameSource.start((frame) => {
        acceptedFrameCount += 1
        if (acceptedFrameCount === 1 || acceptedFrameCount % 8 === 0) {
          this.setData({
            frameStatus: `实时帧 ${frame.width} × ${frame.height}`,
            handStatus: `实时画面 ${frame.width} × ${frame.height} · 触摸框选`,
          })
        }
      })
    } catch {
      this.setData({ frameStatus: '实时帧需使用真机调试', handStatus: '摄像头 · 触摸框选' })
    }
  },

  stopCameraFrames() {
    frameSource.stop()
  },

  startVisionKit() {
    if (visionKitStarting || !pageVisible || this.data.useMockScene || !this.data.useVisionKit) return
    visionKitStarting = true
    this.setData({ handStatus: 'VisionKit 初始化中…' })

    wx.createSelectorQuery()
      .select('#visionkit-canvas')
      .node()
      .exec((result) => {
        if (!pageVisible || this.data.useMockScene || !this.data.useVisionKit) {
          visionKitStarting = false
          return
        }
        const canvas = result[0]?.node
        if (!canvas) {
          visionKitStarting = false
          this.fallbackToCamera(new Error('VisionKit canvas unavailable'))
          return
        }

        try {
          const windowInfo = wx.getWindowInfo()
          const pixelRatio = windowInfo.pixelRatio || 1
          canvas.width = Math.round(windowInfo.windowWidth * pixelRatio)
          canvas.height = Math.round(windowInfo.windowHeight * pixelRatio)
          const renderer = createVisionKitCameraRenderer(canvas)

          visionSession.start(canvas, renderer, {
            onHand: (anchor) => this.onVisionHand(anchor),
            onReady: () => {
              visionKitStarting = false
              this.setData({ cameraReady: true, cameraError: '', handStatus: '请将手放入画面' })
            },
            onError: (error) => {
              visionKitStarting = false
              this.fallbackToCamera(error)
            },
          })
        } catch (error) {
          visionKitStarting = false
          this.fallbackToCamera(error)
        }
      })
  },

  stopVisionKit() {
    visionKitStarting = false
    visionGestureAdapter.reset()
    visionSession.stop()
  },

  fallbackToCamera(error: unknown) {
    this.stopVisionKit()
    console.warn('VisionKit unavailable, falling back to Camera API', error)
    this.setData({
      useVisionKit: false,
      cameraReady: false,
      handStatus: 'VisionKit 不可用 · 触摸框选',
      status: '拖动 · 框住任意物体',
    })
  },

  onVisionHand(anchor?: VisionKitHandAnchor) {
    if (!anchor) {
      visionGestureAdapter.reset()
      if (!this.data.isCopying && frameStart) this.cancelFraming()
      if (!this.data.isCopying) {
        spatialController.reset()
        this.setData({ isFraming: false, gesture: 'IDLE', handStatus: '请将手放入画面' })
      }
      return
    }

    const result = visionGestureAdapter.update(anchor)
    if (!result.hand.detected || this.data.isCopying) return
    const point = result.hand.cursor
    this.setData({ cursorX: point.x, cursorY: point.y, handStatus: '已检测到手部' })

    if (result.pinch === 'PINCH_START' && !frameStart) {
      this.beginFraming(point)
    } else if (result.pinch === 'PINCH_HOLD' && frameStart) {
      this.updateFraming(point)
    } else if (result.pinch === 'PINCH_END' && frameStart) {
      this.finishFraming()
    }
  },

  onTouchStart(event: MiniProgramTouchEvent) {
    if (this.data.isCopying || frameStart) return
    const touch = event.touches[0]
    if (!touch) return
    this.beginFraming(this.toNormalizedPoint(touch))
  },

  onTouchMove(event: MiniProgramTouchEvent) {
    if (!frameStart || this.data.isCopying) return
    const touch = event.touches[0]
    if (!touch) return
    this.updateFraming(this.toNormalizedPoint(touch))
  },

  onTouchEnd() {
    if (!frameStart || this.data.isCopying) return
    this.finishFraming()
  },

  onTouchCancel() {
    if (frameStart) this.cancelFraming()
  },

  beginFraming(point: NormalizedPoint) {
    frameStart = point
    spatialController.start(point)
    this.setData({
      frameRect: { x: point.x, y: point.y, width: 0, height: 0 },
      gesture: 'GRABBED',
      isFraming: true,
      status: '拖动调整选框 · 松开捕捉',
    })
  },

  updateFraming(point: NormalizedPoint) {
    if (!frameStart) return
    spatialController.move(point)
    this.setData({
      cursorX: point.x,
      cursorY: point.y,
      frameRect: toRect(frameStart, point),
      gesture: 'DRAGGING',
      status: '松开即捕捉框内物体',
    })
  },

  cancelFraming() {
    frameStart = undefined
    spatialController.reset()
    this.setData({ isFraming: false, frameRect: null, gesture: 'HOVERING' })
  },

  finishFraming() {
    if (!frameStart) return
    const rect = this.data.frameRect
    frameStart = undefined
    spatialController.release()
    this.setData({ isFraming: false, gesture: 'RELEASED' })

    if (
      !rect ||
      rect.width < APP_CONFIG.MIN_FRAME_SIZE ||
      rect.height < APP_CONFIG.MIN_FRAME_SIZE
    ) {
      this.setData({ frameRect: null, status: '框选范围太小，请重新框选' })
      wx.showToast({ title: '请框大一些', icon: 'none', duration: 1200 })
      return
    }

    this.captureRegion(rect)
  },

  async captureRegion(rect: NormalizedRect) {
    this.setData({ isCopying: true, status: '正在捕捉现实…' })

    let sourceImage: string | undefined

    if (!this.data.useMockScene) {
      const usingVisionKit = this.data.useVisionKit

      if (usingVisionKit) {
        // VisionKit 模式下 webgl canvas 和 <camera> 互斥
        // 临时切 UI 到 camera 模式 → 等 initdone → takePhoto → 切回来
        console.log('[camera] VisionKit → switching to camera mode for takePhoto')
        this.stopVisionKit()
        this.setData({ useVisionKit: false, cameraReady: false, handStatus: '拍照中…' })
        // 等 camera 组件初始化
        await waitForCameraReady(this, 3000)
        console.log('[camera] camera ready → takePhoto')
      }

      try {
        sourceImage = await raceTimeout(takePhoto(), 5000)
        console.log('[camera] takePhoto ok', sourceImage)
      } catch (err) {
        console.warn('[camera] takePhoto FAIL or TIMEOUT', err)
      } finally {
        if (usingVisionKit) {
          console.log('[camera] switching back to VisionKit')
          this.setData({ useVisionKit: true, handStatus: '恢复手势识别…' })
          wx.nextTick(() => this.startVisionKit())
        }
      }
    }

    if (!sourceImage) {
      console.warn('[camera] capture failed → mock')
    }

    const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    const item: ClipboardItem = sourceImage
      ? {
          id: `capture-${Date.now()}`,
          type: this.data.mode,
          createdAt: Date.now(),
          sourceImage,
          bbox: rect,
          spatial: { x: center.x, y: center.y, scale: 1, rotation: 0 },
        }
      : {
          id: `mock-${this.data.mode}-${Date.now()}`,
          type: this.data.mode,
          createdAt: Date.now(),
          previewImage: 'mock://captured-object',
          bbox: rect,
          spatial: { x: center.x, y: center.y, scale: 1, rotation: 0 },
        }

    clipboardStore.set(item)
    if (sourceImage) {
      // 自动存入收集册（成功捕捉才有意义）
      try { void collectionStore.save(item) } catch { /* ignore */ }
    }
    console.log('[camera] clipboardStore.set → sourceImage', !!item.sourceImage)
    setTimeout(() => {
      wx.navigateTo({ url: '/pages/clipboard/clipboard' })
    }, APP_CONFIG.COPY_ANIMATION_MS)
  },

  toNormalizedPoint(touch: MiniProgramTouch) {
    const system = wx.getWindowInfo()
    return {
      x: clamp01(touch.clientX / system.windowWidth),
      y: clamp01(touch.clientY / system.windowHeight),
    }
  },
})

function toRect(start: NormalizedPoint, end: NormalizedPoint): NormalizedRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(start.x - end.x),
    height: Math.abs(start.y - end.y),
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function takePhoto(): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.createCameraContext().takePhoto({
      quality: 'high',
      success: (res) => {
        if (res.tempImagePath) resolve(res.tempImagePath)
        else reject(new Error('takePhoto returned no image'))
      },
      fail: reject,
    })
  })
}

/** 带超时的 Promise race — 超时后 reject */
function raceTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        reject(new Error(`timeout after ${timeoutMs}ms`))
      }
    }, timeoutMs)
    promise.then(
      (value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

/** 轮询等待 page.data.cameraReady 变为 true — 用于 setData 切 UI 后等 camera 组件 initdone */
function waitForCameraReady(
  page: { data: { cameraReady: boolean }; onCameraReady?: () => void },
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const poll = () => {
      if ((page.data as any).cameraReady) {
        console.log('[waitForCameraReady] cameraReady=true')
        resolve()
        return
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`camera not ready after ${timeoutMs}ms`))
        return
      }
      setTimeout(poll, 100)
    }
    poll()
  })
}

function snapshotVisionCanvas(): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.createSelectorQuery()
      .select('#visionkit-canvas')
      .node()
      .exec((result) => {
        const canvas = result[0]?.node as WechatMiniprogram.CanvasNode | undefined
        if (!canvas) {
          console.warn('[snapshot] canvas node undefined')
          reject(new Error('vision canvas unavailable'))
          return
        }
        console.log('[snapshot] canvas size', { w: canvas.width, h: canvas.height })
        wx.canvasToTempFilePath({
          canvas,
          fileType: 'png',
          x: 0,
          y: 0,
          width: canvas.width,
          height: canvas.height,
          destWidth: canvas.width,
          destHeight: canvas.height,
          success: (res) => {
            console.log('[snapshot] success', res.tempFilePath)
            resolve(res.tempFilePath)
          },
          fail: (err) => {
            console.warn('[snapshot] canvasToTempFilePath fail', err)
            reject(err)
          },
        })
      })
  })
}
