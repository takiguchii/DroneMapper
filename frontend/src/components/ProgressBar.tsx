import React, { useEffect, useState } from 'react'

interface ProgressBarProps {
  progress: number
  logs: string[]
  statusText: string
  onComplete?: () => void
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  logs,
  statusText,
  onComplete,
}) => {
  const [showTick, setShowTick] = useState(false)

  useEffect(() => {
    if (progress >= 100) {
      const timer = setTimeout(() => {
        setShowTick(true)
        if (onComplete) onComplete()
      }, 500)
      return () => clearTimeout(timer)
    } else {
      setShowTick(false)
    }
  }, [progress, onComplete])

  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 backdrop-blur-md shadow-xl space-y-6">
      <div className="flex justify-between items-center">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-white">
            {progress < 100 ? 'Processando Envio' : 'Envio Concluído!'}
          </h2>
          <p className="text-xs text-slate-400">{statusText}</p>
        </div>
        <span className="text-2xl font-black bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent font-mono">
          {Math.round(progress)}%
        </span>
      </div>

      {/* Progress Bar Container */}
      <div className="w-full bg-slate-950/60 border border-slate-900 h-4 rounded-full overflow-hidden relative p-[2px]">
        <div
          className="bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 h-full rounded-full transition-all duration-300 relative shadow-[0_0_12px_rgba(99,102,241,0.5)]"
          style={{ width: `${progress}%` }}
        >
          {/* Animated Light Pulse */}
          {progress < 100 && (
            <div className="absolute right-0 top-0 bottom-0 w-8 bg-white/20 blur-sm animate-pulse" />
          )}
        </div>
      </div>

      {/* Console Logs */}
      <div className="space-y-2">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Logs do Console
        </div>
        <div className="w-full bg-slate-950 border border-slate-900 rounded-xl p-4 font-mono text-xs text-indigo-300 space-y-1.5 h-[140px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
          {logs.map((log, index) => (
            <div key={index} className="flex gap-2 items-start animate-fadeIn">
              <span className="text-indigo-600 select-none">&gt;</span>
              <span className={index === logs.length - 1 ? 'text-indigo-100 font-bold' : 'text-indigo-400/80'}>
                {log}
              </span>
            </div>
          ))}
          {progress < 100 && (
            <div className="flex gap-1.5 items-center text-indigo-500 animate-pulse text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
              <span>Aguardando próxima instrução...</span>
            </div>
          )}
        </div>
      </div>

      {/* Tick animation for completion */}
      {showTick && (
        <div className="flex justify-center items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl animate-scaleUp">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
            className="w-5 h-5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          <span className="text-xs font-semibold">Projeto adicionado à fila de processamento com sucesso!</span>
        </div>
      )}
    </div>
  )
}
