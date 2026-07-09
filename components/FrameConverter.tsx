'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { processFileToCanvas } from '@/lib/imageFit'

type Orientation = 'horizontal' | 'vertical'
type Lang = 'pt' | 'en'

interface Item {
  id: string
  img: HTMLImageElement
  sourceUrl: string
  resultUrl: string
  orientation: Orientation
  filename: string
  outName: string
}

const MAX_FILES = 5
const LIFETIME_MS = 5 * 60 * 1000

const T = {
  pt: {
    subtitle: 'Adiciona moldura branca ou preta para impressão 15×10 sem cortar a foto.',
    dropTitle: 'Arraste até 5 fotos aqui, ou clique para escolher',
    dropSub: 'JPG ou PNG · proporção 16:9 recomendada',
    frameLabel: 'Moldura',
    swatchWhite: 'Branca',
    swatchBlack: 'Preta',
    photos: 'fotos',
    horizontal: 'Horizontal',
    vertical: 'Vertical',
    download: 'Baixar',
    downloadAll: 'Baixar tudo',
    timerPrefix: 'Lote expira em',
    clearNow: 'Apagar agora',
    toastManual: 'Lote apagado.',
    toastAuto: 'Fotos apagadas automaticamente após 5 minutos.',
    toastLimit: 'Limite de 5 fotos por lote atingido.',
    toastRoom: (n: number) => `Só cabem mais ${n} foto(s) neste lote de 5.`,
    toastReadError: (name: string) => `Não consegui ler "${name}".`,
    toastInvalid: (name: string) => `"${name}" não é uma imagem válida.`,
    toastProcessError: 'Erro ao processar a imagem.',
    proCta: 'Quer um lote maior?',
    proCtaLink: 'Plano PRO',
    proModalTitle: 'Em breve',
    proModalBody: 'Esta ferramenta ainda está em fase de testes. O plano PRO chegará em breve. Fique de olho!',
    proModalClose: 'Entendido',
  },
  en: {
    subtitle: 'Adds white or black border for 15×10 printing without cropping your photo.',
    dropTitle: 'Drag up to 5 photos here, or click to choose',
    dropSub: 'JPG or PNG · 16:9 ratio recommended',
    frameLabel: 'Frame',
    swatchWhite: 'White',
    swatchBlack: 'Black',
    photos: 'photos',
    horizontal: 'Horizontal',
    vertical: 'Vertical',
    download: 'Download',
    downloadAll: 'Download all',
    timerPrefix: 'Batch expires in',
    clearNow: 'Clear now',
    toastManual: 'Batch cleared.',
    toastAuto: 'Photos cleared automatically after 5 minutes.',
    toastLimit: 'Batch limit of 5 photos reached.',
    toastRoom: (n: number) => `Only ${n} more photo(s) fit in this batch of 5.`,
    toastReadError: (name: string) => `Could not read "${name}".`,
    toastInvalid: (name: string) => `"${name}" is not a valid image.`,
    toastProcessError: 'Error processing the image.',
    proCta: 'Need a larger batch?',
    proCtaLink: 'PRO plan',
    proModalTitle: 'Coming soon',
    proModalBody: 'This tool is still in testing phase. The PRO plan is on its way. Stay tuned!',
    proModalClose: 'Got it',
  },
}

const SWATCHES: { color: string; labelKey: 'swatchWhite' | 'swatchBlack' }[] = [
  { color: '#f5f2ec', labelKey: 'swatchWhite' },
  { color: '#0d0c0b', labelKey: 'swatchBlack' },
]

function makeId() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9)
}

function formatTime(ms: number) {
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function UploadIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-zinc-400"
    >
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  )
}

function ChevronDown() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4l4 4 4-4" />
    </svg>
  )
}

export default function FrameConverter() {
  const [items, setItems] = useState<Item[]>([])
  const [frameColor, setFrameColor] = useState('#f5f2ec')
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const [toast, setToast] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [lang, setLang] = useState<Lang>('pt')
  const [langMenuOpen, setLangMenuOpen] = useState(false)
  const [proModalOpen, setProModalOpen] = useState(false)
  const langMenuRef = useRef<HTMLDivElement>(null)

  const t = T[lang]

  const frameColorRef = useRef(frameColor)
  frameColorRef.current = frameColor

  const itemsRef = useRef<Item[]>([])
  itemsRef.current = items

  const fileInputRef = useRef<HTMLInputElement>(null)

  const expireFnRef = useRef<(reason?: string) => void>(() => {})
  expireFnRef.current = (reason?: string) => {
    setItems([])
    setExpiresAt(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setToast(reason === 'manual' ? t.toastManual : t.toastAuto)
  }

  const showToast = useCallback((msg: string) => setToast(msg), [])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(''), 2800)
    return () => clearTimeout(id)
  }, [toast])

  useEffect(() => {
    if (!langMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setLangMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [langMenuOpen])

  useEffect(() => {
    setItems(prev => {
      if (prev.length === 0) return prev
      return prev.map(item => ({
        ...item,
        resultUrl: processFileToCanvas(item.img, frameColor, item.orientation).toDataURL('image/jpeg', 0.92),
      }))
    })
  }, [frameColor])

  useEffect(() => {
    if (expiresAt === null) return
    const tick = () => setTimeLeft(Math.max(0, expiresAt - Date.now()))
    tick()
    const intervalId = setInterval(tick, 250)
    const timeoutId = setTimeout(() => expireFnRef.current?.(), Math.max(0, expiresAt - Date.now()))
    return () => { clearInterval(intervalId); clearTimeout(timeoutId) }
  }, [expiresAt])

  const handleOrientationChange = useCallback((id: string, orientation: Orientation) => {
    setItems(prev =>
      prev.map(item => {
        if (item.id !== id || item.orientation === orientation) return item
        const canvas = processFileToCanvas(item.img, frameColorRef.current, orientation)
        return { ...item, orientation, resultUrl: canvas.toDataURL('image/jpeg', 0.92) }
      }),
    )
  }, [])

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList) return
      const incoming = Array.from(fileList).filter(f => f.type.startsWith('image/'))
      if (!incoming.length) return

      const room = MAX_FILES - itemsRef.current.length
      if (room <= 0) { showToast(T[lang].toastLimit); return }
      const toAdd = incoming.slice(0, room)
      if (incoming.length > room) showToast(T[lang].toastRoom(room))

      toAdd.forEach(file => {
        const reader = new FileReader()
        reader.onerror = () => showToast(T[lang].toastReadError(file.name))
        reader.onload = e => {
          const sourceUrl = e.target!.result as string
          const img = new Image()
          img.onerror = () => showToast(T[lang].toastInvalid(file.name))
          img.onload = () => {
            try {
              const orientation: Orientation = 'horizontal'
              const canvas = processFileToCanvas(img, frameColorRef.current, orientation)
              const resultUrl = canvas.toDataURL('image/jpeg', 0.92)
              const base = file.name.replace(/\.[^.]+$/, '')
              setItems(prev => [
                ...prev,
                { id: makeId(), img, sourceUrl, resultUrl, orientation, filename: file.name, outName: `${base}_15x10.jpg` },
              ])
              setExpiresAt(prev => (prev === null ? Date.now() + LIFETIME_MS : prev))
            } catch {
              showToast(T[lang].toastProcessError)
            }
          }
          img.src = sourceUrl
        }
        reader.readAsDataURL(file)
      })
    },
    [lang, showToast],
  )

  const handleBatchDownload = useCallback(() => {
    items.forEach((item, i) => {
      setTimeout(() => {
        const a = document.createElement('a')
        a.href = item.resultUrl
        a.download = item.outName
        a.click()
      }, i * 300)
    })
  }, [items])

  return (
    <div className="min-h-screen bg-zinc-50 font-sans flex flex-col">
      <div className="relative max-w-[880px] w-full mx-auto px-6 pt-10 pb-16 flex-1">

        {/* Language toggle — absolute top-right */}
        <div className="absolute top-10 right-6" ref={langMenuRef}>
          <button
            onClick={() => setLangMenuOpen(o => !o)}
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 transition-colors duration-150 font-medium"
          >
            {lang.toUpperCase()}
            <ChevronDown />
          </button>
          {langMenuOpen && (
            <div className="absolute right-0 mt-1.5 bg-white border border-zinc-200 rounded-lg shadow-sm overflow-hidden min-w-[120px] z-10">
              {(['pt', 'en'] as Lang[]).map(l => (
                <button
                  key={l}
                  onClick={() => { setLang(l); setLangMenuOpen(false) }}
                  className={[
                    'block w-full text-left px-4 py-2.5 text-xs transition-colors duration-150',
                    lang === l
                      ? 'text-zinc-900 font-medium bg-zinc-50'
                      : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50',
                  ].join(' ')}
                >
                  {l === 'pt' ? 'Português' : 'English'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Header */}
        <header className="text-center mb-8">
          <h1
            className="italic font-bold text-zinc-900 leading-none mb-4"
            style={{ fontFamily: 'var(--font-playfair)', fontSize: 'clamp(3rem, 8vw, 5.5rem)' }}
          >
            Moldura
          </h1>
          <p className="text-sm text-zinc-500 max-w-[52ch] leading-relaxed mx-auto">
            {t.subtitle}
          </p>
        </header>

        {/* Dropzone */}
        <div
          className={[
            'rounded-xl border-2 border-dashed py-14 px-8 text-center cursor-pointer transition-all duration-150',
            isDragging
              ? 'border-zinc-700 bg-zinc-100'
              : 'border-zinc-300 hover:border-zinc-400 hover:bg-zinc-100/50',
          ].join(' ')}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragEnter={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={e => { e.preventDefault(); setIsDragging(false) }}
          onDrop={e => {
            e.preventDefault()
            setIsDragging(false)
            if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files)
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => handleFiles(e.target.files)}
          />
          <div className="flex justify-center mb-3">
            <UploadIcon />
          </div>
          <p className="text-sm font-medium text-zinc-700 mb-1">{t.dropTitle}</p>
          <p className="text-xs text-zinc-400">{t.dropSub}</p>
        </div>

        {/* Contador */}
        <div className="text-right mt-2 mb-5">
          <span className="text-xs text-zinc-400 tabular-nums">
            {items.length}/{MAX_FILES} {t.photos}
          </span>
        </div>

        {/* Controls */}
        <div className="flex flex-col items-center gap-3 mb-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-zinc-500">{t.frameLabel}</span>
            {SWATCHES.map(sw => (
              <button
                key={sw.color}
                title={t[sw.labelKey]}
                onClick={() => setFrameColor(sw.color)}
                style={{ background: sw.color }}
                className={[
                  'w-5 h-5 rounded-full transition-all duration-150 cursor-pointer',
                  frameColor === sw.color
                    ? 'ring-2 ring-zinc-900 ring-offset-2 ring-offset-zinc-50'
                    : 'ring-1 ring-zinc-300 hover:ring-zinc-500',
                ].join(' ')}
              />
            ))}
          </div>

          <p className="text-xs text-zinc-400">
            {t.proCta}{' '}
            <button
              onClick={() => setProModalOpen(true)}
              className="text-zinc-600 font-medium hover:text-zinc-900 transition-colors duration-150 underline underline-offset-2"
            >
              {t.proCtaLink}
            </button>
          </p>
        </div>

        {/* Results */}
        {items.length > 0 && (
          <>
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
            >
              {items.map(item => (
                <div
                  key={item.id}
                  className="rounded-xl border border-zinc-200 overflow-hidden bg-white flex flex-col"
                >
                  <div className="bg-zinc-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.resultUrl} alt={item.filename} className="block w-full h-auto" />
                  </div>
                  <div className="p-3 flex flex-col gap-2.5 flex-1">
                    <p className="text-[11px] text-zinc-400 truncate" title={item.filename}>
                      {item.filename}
                    </p>
                    <div className="flex rounded-lg overflow-hidden border border-zinc-200">
                      {(['horizontal', 'vertical'] as Orientation[]).map((orient, i) => (
                        <button
                          key={orient}
                          onClick={() => handleOrientationChange(item.id, orient)}
                          className={[
                            'flex-1 text-[11px] font-medium py-1.5 cursor-pointer transition-colors duration-150',
                            i > 0 ? 'border-l border-zinc-200' : '',
                            item.orientation === orient
                              ? 'bg-zinc-900 text-white'
                              : 'text-zinc-500 hover:text-zinc-900',
                          ].join(' ')}
                        >
                          {orient === 'horizontal' ? t.horizontal : t.vertical}
                        </button>
                      ))}
                    </div>
                    <a
                      href={item.resultUrl}
                      download={item.outName}
                      className="block w-full text-center bg-zinc-900 hover:bg-zinc-700 active:scale-[0.98] text-white font-medium py-2 rounded-lg text-xs no-underline transition-all duration-150"
                    >
                      {t.download}
                    </a>
                  </div>
                </div>
              ))}
            </div>

            {items.length > 1 && (
              <div className="mt-3 flex justify-end">
                <button
                  onClick={handleBatchDownload}
                  className="text-xs font-medium text-zinc-600 hover:text-zinc-900 border border-zinc-200 hover:border-zinc-400 px-4 py-2 rounded-lg transition-all duration-150"
                >
                  {t.downloadAll}
                </button>
              </div>
            )}

            {expiresAt !== null && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-zinc-200 flex-wrap gap-2">
                <span className="text-xs text-zinc-400">
                  {t.timerPrefix}{' '}
                  <span className="font-mono font-medium text-zinc-600">{formatTime(timeLeft)}</span>
                </span>
                <button
                  onClick={() => expireFnRef.current?.('manual')}
                  className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors duration-150"
                >
                  {t.clearNow}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-200 text-center py-6">
        <p className="text-[11px] text-zinc-400">
          kaleu.dev - 2026 All rights reserved ®
        </p>
      </footer>

      {/* Modal PRO */}
      {proModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          onClick={() => setProModalOpen(false)}
        >
          <div className="absolute inset-0 bg-black/20" />
          <div
            className="relative max-w-sm w-full bg-white border border-zinc-200 rounded-2xl p-8 shadow-xl text-center"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-lg font-semibold text-zinc-900 mb-2">
              {t.proModalTitle}
            </p>
            <p className="text-sm text-zinc-500 leading-relaxed mb-6">
              {t.proModalBody}
            </p>
            <button
              onClick={() => setProModalOpen(false)}
              className="bg-zinc-900 hover:bg-zinc-700 active:scale-[0.98] text-white font-medium px-6 py-2.5 rounded-lg text-sm transition-all duration-150"
            >
              {t.proModalClose}
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900 text-white px-4 py-3 rounded-lg text-xs pointer-events-none shadow-lg whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  )
}
