import { useState, useEffect } from 'react'
import { ProjectForm } from './components/ProjectForm'
import type { ProjectSettings } from './components/ProjectForm'
import { UploadZone } from './components/UploadZone'
import { ProgressBar } from './components/ProgressBar'

interface ProjectItem {
  id: string
  name: string
  description: string
  filesCount: number
  quality: 'low' | 'medium' | 'high'
  mode: 'mesh' | 'ortho' | 'both'
  status: 'queued' | 'processing' | 'completed' | 'failed'
  createdAt: string
  progress: number
}

const INITIAL_PROJECTS: ProjectItem[] = [
  {
    id: 'proj-1',
    name: 'Topografia Morro do Ipê',
    description: 'Levantamento altimétrico para condomínio residencial.',
    filesCount: 142,
    quality: 'high',
    mode: 'both',
    status: 'completed',
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleString('pt-BR'),
    progress: 100,
  },
  {
    id: 'proj-2',
    name: 'Volume de Pilha de Brita - Pedreira Sul',
    description: 'Cálculo de volume mensal utilizando câmera RGB.',
    filesCount: 65,
    quality: 'medium',
    mode: 'mesh',
    status: 'processing',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toLocaleString('pt-BR'),
    progress: 45,
  },
]

function App() {
  // State
  const [files, setFiles] = useState<File[]>([])
  const [settings, setSettings] = useState<ProjectSettings>({
    name: '',
    description: '',
    quality: 'medium',
    mode: 'both',
  })
  const [projects, setProjects] = useState<ProjectItem[]>(INITIAL_PROJECTS)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Upload/Process States
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadLogs, setUploadLogs] = useState<string[]>([])
  const [uploadStatusText, setUploadStatusText] = useState('')

  // Simulated project updates for mock feeling
  useEffect(() => {
    const interval = setInterval(() => {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.status === 'processing') {
            const nextProgress = p.progress + Math.floor(Math.random() * 8) + 2
            if (nextProgress >= 100) {
              return { ...p, progress: 100, status: 'completed' }
            }
            return { ...p, progress: nextProgress }
          }
          return p
        })
      )
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  // File Handlers
  const handleFilesAdded = (newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles])
    setErrorMsg(null)
  }

  const handleFileRemoved = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleClearAll = () => {
    setFiles([])
  }

  // Submission handler (Simulates upload and queueing)
  const handleSubmit = () => {
    if (!settings.name.trim()) {
      setErrorMsg('Por favor, informe o nome do projeto.')
      return
    }
    if (files.length === 0) {
      setErrorMsg('Adicione pelo menos um arquivo (imagem ou vídeo) para processar.')
      return
    }

    setErrorMsg(null)
    setIsUploading(true)
    setUploadProgress(0)
    setUploadLogs(['Iniciando rotina de upload de ativos...'])
    setUploadStatusText('Conectando ao DroneMapper Host...')

    // Simulação de passos de upload
    let progress = 0
    const logsList = [
      'Iniciando rotina de upload de ativos...',
      'Estabelecendo conexão segura (HTTPS)... OK',
      `Pré-validando integridade de ${files.length} arquivo(s)...`,
    ]

    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 12) + 3
      if (progress >= 100) {
        progress = 100
        clearInterval(interval)
      }

      setUploadProgress(progress)

      // Adição de logs de simulação por faixa de progresso
      if (progress > 15 && logsList.length === 3) {
        logsList.push('Enviando metadados do projeto...')
        setUploadStatusText('Enviando dados do projeto...')
      }
      if (progress > 30 && logsList.length === 4) {
        logsList.push('Enviando imagens aéreas para o servidor storage...')
        setUploadStatusText('Carregando binários de mídia (upload)...')
      }
      if (progress > 55 && logsList.length === 5) {
        const containsVideo = files.some(
          (f) =>
            f.type.startsWith('video/') ||
            ['mp4', 'mov', 'avi'].includes(f.name.split('.').pop()?.toLowerCase() || '')
        )
        if (containsVideo) {
          logsList.push('Detecção de vídeo ativada: extraindo metadados de quadros...')
          logsList.push('Solicitando fila para FFMPEG Frame Extraction...')
        } else {
          logsList.push('Detecção de imagens: lendo cabeçalhos EXIF geotagged...')
        }
        setUploadStatusText('Processando mídias recebidas...')
      }
      if (progress > 75 && logsList.length < 8) {
        logsList.push('Gerando chaves UUID e salvando no PostgreSQL...')
        setUploadStatusText('Salvando informações no banco...')
      }
      if (progress > 90 && logsList.length < 9) {
        logsList.push('Registrando na fila de processamento OpenDroneMap...')
        logsList.push('Configurando prioridade do Job: IDLE -> QUEUED')
        setUploadStatusText('Enfileirando tarefa de fotogrametria...')
      }
      if (progress === 100) {
        logsList.push('Concluído com sucesso!')
        setUploadStatusText('Todos os arquivos foram salvos e integrados.')
      }

      setUploadLogs([...logsList])
    }, 400)
  }

  const handleUploadComplete = () => {
    // Adiciona o novo projeto simulado à lista
    const newProj: ProjectItem = {
      id: `proj-${Date.now()}`,
      name: settings.name,
      description: settings.description,
      filesCount: files.length,
      quality: settings.quality,
      mode: settings.mode,
      status: 'queued',
      createdAt: new Date().toLocaleString('pt-BR'),
      progress: 0,
    }

    setTimeout(() => {
      setProjects((prev) => [newProj, ...prev])
      setIsUploading(false)
      setFiles([])
      setSettings({
        name: '',
        description: '',
        quality: 'medium',
        mode: 'both',
      })
    }, 1500)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between">
      {/* Header */}
      <header className="border-b border-slate-900 bg-slate-950/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center font-bold text-white shadow-md shadow-indigo-500/20">
              DM
            </div>
            <div>
              <span className="text-lg font-bold bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
                DroneMapper
              </span>
              <span className="text-[10px] block text-slate-500 font-mono -mt-1">Self-Hosted</span>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden sm:flex gap-4 text-xs text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Banco: Conectado</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                <span>Modo ODM: Demo</span>
              </div>
            </div>
            <a
              href="https://github.com/takiguchii/DroneMapper"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-slate-300 hover:text-white transition-colors border border-slate-800 rounded-lg px-3 py-1.5 hover:bg-slate-900"
            >
              GitHub Source
            </a>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-grow w-full grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Form & Upload (Span 7) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Painel de Reconstrução
            </h1>
            <p className="text-sm text-slate-400">
              Envie suas mídias para gerar orçamentos de nuvem de pontos, mesh texturizada e ortofotos.
            </p>
          </div>

          {errorMsg && (
            <div className="flex gap-2 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-sm animate-scaleUp">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <span>{errorMsg}</span>
            </div>
          )}

          {!isUploading ? (
            <div className="space-y-6">
              <ProjectForm settings={settings} onChange={setSettings} />
              <UploadZone
                files={files}
                onFilesAdded={handleFilesAdded}
                onFileRemoved={handleFileRemoved}
                onClearAll={handleClearAll}
              />
              <button
                type="button"
                onClick={handleSubmit}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:via-indigo-500 hover:to-purple-500 text-white font-semibold text-sm shadow-xl hover:shadow-indigo-500/10 cursor-pointer active:scale-[0.99] transition-all"
              >
                Criar Projeto e Iniciar Processamento
              </button>
            </div>
          ) : (
            <ProgressBar
              progress={uploadProgress}
              logs={uploadLogs}
              statusText={uploadStatusText}
              onComplete={handleUploadComplete}
            />
          )}
        </div>

        {/* Right Column: Projects Queue Status (Span 5) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 backdrop-blur-md shadow-xl flex flex-col h-full space-y-6">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-white">Fila de Reconstruções</h2>
              <p className="text-xs text-slate-400">Acompanhe o processamento de fotogrametria ativo.</p>
            </div>

            <div className="space-y-4 max-h-[620px] overflow-y-auto pr-1">
              {projects.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">
                  Nenhum projeto encontrado. Envie imagens para iniciar.
                </div>
              ) : (
                projects.map((p) => (
                  <div
                    key={p.id}
                    className="p-4 rounded-xl bg-slate-950/40 border border-slate-900 hover:border-slate-800 transition-all space-y-3 group"
                  >
                    <div className="flex justify-between items-start">
                      <div className="space-y-0.5 max-w-[70%]">
                        <h3 className="text-sm font-semibold text-white truncate group-hover:text-indigo-400 transition-colors">
                          {p.name}
                        </h3>
                        {p.description && (
                          <p className="text-xs text-slate-400 truncate">{p.description}</p>
                        )}
                      </div>

                      {/* Badges */}
                      <div>
                        {p.status === 'completed' && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold uppercase">
                            Concluído
                          </span>
                        )}
                        {p.status === 'processing' && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 font-semibold uppercase animate-pulse">
                            Processando
                          </span>
                        )}
                        {p.status === 'queued' && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400 font-semibold uppercase">
                            Na Fila
                          </span>
                        )}
                        {p.status === 'failed' && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 font-semibold uppercase">
                            Falhou
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Meta Indicators */}
                    <div className="flex items-center gap-4 text-[10px] text-slate-500 font-mono">
                      <div>📁 {p.filesCount} arquivos</div>
                      <div>⚡ Modo: {p.mode === 'both' ? 'Completo' : p.mode === 'mesh' ? '3D' : '2D'}</div>
                      <div>🕒 {p.createdAt.split(',')[0]}</div>
                    </div>

                    {/* Progress Indicator */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                        <span>Progresso ODM</span>
                        <span>{p.progress}%</span>
                      </div>
                      <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            p.status === 'completed'
                              ? 'bg-emerald-500'
                              : p.status === 'failed'
                              ? 'bg-rose-500'
                              : 'bg-indigo-600'
                          }`}
                          style={{ width: `${p.progress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <p>&copy; {new Date().getFullYear()} DroneMapper. Licenciado sob MIT. Interface responsiva com Tailwind CSS v4.</p>
      </footer>
    </div>
  )
}

export default App
