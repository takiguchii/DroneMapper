import React, { useRef, useState } from 'react'

interface UploadZoneProps {
  files: File[]
  onFilesAdded: (newFiles: File[]) => void
  onFileRemoved: (index: number) => void
  onClearAll: () => void
  disabled?: boolean
}

export const UploadZone: React.FC<UploadZoneProps> = ({
  files,
  onFilesAdded,
  onFileRemoved,
  onClearAll,
  disabled = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragActive, setIsDragActive] = useState(false)

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (disabled) return

    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true)
    } else if (e.type === 'dragleave') {
      setIsDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)
    if (disabled) return

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files)
      validateAndAddFiles(droppedFiles)
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files)
      validateAndAddFiles(selectedFiles)
    }
  }

  const validateAndAddFiles = (list: File[]) => {
    // Validar extensões (Imagens: jpg, jpeg, png. Vídeos: mp4, mov, avi, mkv)
    const validExtensions = ['jpg', 'jpeg', 'png', 'mp4', 'mov', 'avi', 'mkv']
    const validFiles = list.filter((file) => {
      const ext = file.name.split('.').pop()?.toLowerCase()
      return ext && validExtensions.includes(ext)
    })

    if (validFiles.length > 0) {
      onFilesAdded(validFiles)
    }
  }

  const triggerFileInput = () => {
    if (disabled) return
    fileInputRef.current?.click()
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const isVideo = (file: File) => {
    return file.type.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv'].includes(file.name.split('.').pop()?.toLowerCase() || '')
  }

  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 backdrop-blur-md shadow-xl flex flex-col space-y-6">
      <div className="flex justify-between items-center">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-white">Upload de Arquivos</h2>
          <p className="text-xs text-slate-400">
            Arraste fotos aéreas (JPEG/PNG) ou vídeos (MP4/MOV) para processamento.
          </p>
        </div>
        {files.length > 0 && (
          <button
            type="button"
            disabled={disabled}
            onClick={onClearAll}
            className="text-xs font-semibold text-rose-400 hover:text-rose-300 transition-colors disabled:opacity-50 cursor-pointer"
          >
            Limpar Todos ({files.length})
          </button>
        )}
      </div>

      {/* Drag Area */}
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={triggerFileInput}
        className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 relative overflow-hidden group min-h-[180px] ${
          isDragActive
            ? 'border-indigo-500 bg-indigo-500/5 shadow-inner'
            : 'border-slate-800 hover:border-slate-700 bg-slate-950/40'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          disabled={disabled}
          onChange={handleFileInputChange}
          accept=".jpg,.jpeg,.png,.mp4,.mov,.avi,.mkv"
          className="hidden"
        />

        {/* Pulsing Gradient Layer on Drag */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

        <div className="text-center space-y-3 z-10">
          <div className="mx-auto w-12 h-12 rounded-full bg-indigo-900/30 border border-indigo-700/30 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-6 h-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"
              />
            </svg>
          </div>

          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-200">
              {isDragActive ? 'Solte seus arquivos aqui...' : 'Arraste e solte seus arquivos ou clique para buscar'}
            </p>
            <p className="text-xs text-slate-500">
              Formatos suportados: .JPG, .PNG, .MP4, .MOV (Máx 2GB/arquivo)
            </p>
          </div>
        </div>
      </div>

      {/* File Queue List */}
      {files.length > 0 && (
        <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider sticky top-0 bg-slate-900/40 py-1">
            Fila de Envio ({files.length} arquivos)
          </div>

          <div className="grid grid-cols-1 gap-2">
            {files.map((file, index) => {
              const fileIsVideo = isVideo(file)
              return (
                <div
                  key={`${file.name}-${index}`}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-950/40 border border-slate-900 hover:border-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    {/* Icon */}
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center border shrink-0 ${
                        fileIsVideo
                          ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                          : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      }`}
                    >
                      {fileIsVideo ? (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                          className="w-5 h-5"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a1.5 1.5 0 001.5-1.5v-9a1.5 1.5 0 00-1.5-1.5h-9A1.5 1.5 0 003 8.25v9a1.5 1.5 0 001.5 1.5z"
                          />
                        </svg>
                      ) : (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                          className="w-5 h-5"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                          />
                        </svg>
                      )}
                    </div>

                    {/* Meta info */}
                    <div className="overflow-hidden">
                      <div className="text-sm font-medium text-slate-200 truncate">{file.name}</div>
                      <div className="text-xs text-slate-400">{formatFileSize(file.size)}</div>
                    </div>
                  </div>

                  {/* Remove Button */}
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={(e) => {
                      e.stopPropagation()
                      onFileRemoved(index)
                    }}
                    className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-5 h-5"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
