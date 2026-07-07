export const TARGET_W = 15
export const TARGET_H = 10

export function computeFit(iw: number, ih: number, tw: number, th: number) {
  const targetRatio = tw / th
  const inputRatio = iw / ih
  let canvasW: number, canvasH: number, offsetX: number, offsetY: number
  if (inputRatio > targetRatio) {
    canvasW = iw
    canvasH = Math.round(iw / targetRatio)
    offsetX = 0
    offsetY = Math.round((canvasH - ih) / 2)
  } else {
    canvasH = ih
    canvasW = Math.round(ih * targetRatio)
    offsetY = 0
    offsetX = Math.round((canvasW - iw) / 2)
  }
  return { canvasW, canvasH, offsetX, offsetY }
}

export function getOrientedSource(img: HTMLImageElement, orientation: 'horizontal' | 'vertical') {
  const iw = img.naturalWidth
  const ih = img.naturalHeight
  if (orientation !== 'vertical') {
    return { source: img as CanvasImageSource, w: iw, h: ih }
  }
  const rotated = document.createElement('canvas')
  rotated.width = ih
  rotated.height = iw
  const rctx = rotated.getContext('2d')!
  rctx.translate(rotated.width / 2, rotated.height / 2)
  rctx.rotate((90 * Math.PI) / 180)
  rctx.drawImage(img, -iw / 2, -ih / 2, iw, ih)
  return { source: rotated as CanvasImageSource, w: rotated.width, h: rotated.height }
}

export function processFileToCanvas(
  img: HTMLImageElement,
  color: string,
  orientation: 'horizontal' | 'vertical',
) {
  const oriented = getOrientedSource(img, orientation)
  const fit = computeFit(oriented.w, oriented.h, TARGET_W, TARGET_H)
  const canvas = document.createElement('canvas')
  canvas.width = fit.canvasW
  canvas.height = fit.canvasH
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = color
  ctx.fillRect(0, 0, fit.canvasW, fit.canvasH)
  ctx.drawImage(oriented.source, fit.offsetX, fit.offsetY, oriented.w, oriented.h)
  return canvas
}

export function drawSyntheticScene(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, '#5b7c99')
  grad.addColorStop(0.55, '#a9c4d4')
  grad.addColorStop(0.56, '#7a9a5f')
  grad.addColorStop(1, '#4d6b3d')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
  ctx.beginPath()
  ctx.arc(w * 0.78, h * 0.3, h * 0.12, 0, Math.PI * 2)
  ctx.fillStyle = '#f2d98a'
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(0, h * 0.62)
  ctx.quadraticCurveTo(w * 0.3, h * 0.45, w * 0.6, h * 0.58)
  ctx.quadraticCurveTo(w * 0.8, h * 0.66, w, h * 0.56)
  ctx.lineTo(w, h)
  ctx.lineTo(0, h)
  ctx.closePath()
  ctx.fillStyle = '#3f5c32'
  ctx.fill()
}
