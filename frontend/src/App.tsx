import { useState, useEffect } from 'react'
import { ProjectForm } from './components/ProjectForm'
import type { ProjectSettings } from './components/ProjectForm'
import { UploadZone } from './components/UploadZone'
import { ProgressBar } from './components/ProgressBar'
import { ModelViewer } from './components/ModelViewer'

interface ProjectItem {
  id: string
  name: string
  description: string
  filesCount: number
  quality: 'low' | 'medium' | 'high'
  mode: 'mesh' | 'ortho' | 'both'
  status: 'created' | 'queued' | 'processing' | 'completed' | 'failed'
  createdAt: string
  progress: number
}

const API_BASE = 'http://localhost:8000';

function App() {
  // State
  const [files, setFiles] = useState<File[]>([])
  const [settings, setSettings] = useState<ProjectSettings>({
    name: '',
    description: '',
    quality: 'medium',
    mode: 'both',
  })
  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Visualizador 3D State
  const [viewerProject, setViewerProject] = useState<ProjectItem | null>(null)

  // Rastrear projeto ativo enviado pelo usuário nesta sessão para abrir o 3D automaticamente
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)

  // Upload/Process States
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadLogs, setUploadLogs] = useState<string[]>([])
  const [uploadStatusText, setUploadStatusText] = useState('')

  // Buscar lista de projetos da API real
  const fetchProjects = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/projects`)
      if (res.ok) {
        const data = await res.json()
        setProjects(data)
      } else {
        console.error('Erro na resposta ao carregar projetos:', res.status)
      }
    } catch (err) {
      console.error('Erro de conexão ao buscar projetos:', err)
    }
  }

  // Carregar projetos iniciais e manter polling de 5 segundos para atualizações
  useEffect(() => {
    fetchProjects()
    const interval = setInterval(fetchProjects, 5000)
    return () => clearInterval(interval)
  }, [])

  // Monitorar projeto ativo e abrir visualizador 3D automaticamente quando concluído
  useEffect(() => {
    if (activeProjectId) {
      const activeProj = projects.find((p) => p.id === activeProjectId)
      if (activeProj) {
        if (activeProj.status === 'completed') {
          setViewerProject(activeProj)
          setActiveProjectId(null)
        } else if (activeProj.status === 'failed') {
          setErrorMsg(`O processamento do projeto "${activeProj.name}" falhou. Verifique se os arquivos de mídia são válidos.`)
          setActiveProjectId(null)
        }
      }
    }
  }, [projects, activeProjectId])

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

  // Deletar Projeto
  const handleDeleteProject = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este projeto? Todos os arquivos físicos serão permanentemente removidos.')) {
      return
    }

    try {
      const res = await fetch(`${API_BASE}/api/projects/${id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== id))
        if (viewerProject?.id === id) {
          setViewerProject(null)
        }
      } else {
        const errData = await res.json()
        setErrorMsg(errData.detail || 'Erro ao excluir o projeto do servidor.')
      }
    } catch (err) {
      setErrorMsg('Erro de conexão ao tentar excluir o projeto.')
    }
  }

  // Enviar formulário e fazer upload dos arquivos reais via HTTP
  const handleSubmit = async () => {
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
    setUploadLogs(['Conectando ao servidor para registrar projeto...'])
    setUploadStatusText('Registrando projeto...')

    try {
      // 1. Criar o Projeto (Status inicial: 'created')
      const createRes = await fetch(`${API_BASE}/api/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: settings.name,
          description: settings.description,
          quality: settings.quality,
          mode: settings.mode,
        }),
      })

      if (!createRes.ok) {
        const errData = await createRes.json()
        throw new Error(errData.detail || 'Erro ao registrar o projeto.')
      }

      const projectData = await createRes.json()
      const projectId = projectData.id
      setActiveProjectId(projectId) // Monitorar este projeto para auto-abrir 3D

      setUploadLogs((prev) => [
        ...prev,
        `Projeto criado com sucesso! ID: ${projectId}`,
        `Iniciando upload de ${files.length} arquivo(s)...`,
      ])
      setUploadStatusText('Preparando envio...')

      // 2. Upload de Arquivos reais via XMLHttpRequest para medir progresso
      const formData = new FormData()
      files.forEach((file) => {
        formData.append('files', file)
      })

      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${API_BASE}/api/projects/${projectId}/upload`, true)

      // Monitoramento do progresso real
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = (event.loaded / event.total) * 100
          setUploadProgress(percentComplete * 0.95) // Guarda os últimos 5% para a chamada do enfileiramento
          setUploadStatusText(`Enviando mídias: ${Math.round(percentComplete)}%`)
        }
      }

      xhr.onload = async () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText)
          setUploadLogs((prev) => [
            ...prev,
            `Arquivos enviados com sucesso!`,
            `Status do Storage: ${response.message}`,
            'Enfileirando projeto para processamento...',
          ])
          setUploadStatusText('Enfileirando tarefa...')

          try {
            // 3. Enfileirar o projeto após upload concluído com sucesso
            const processRes = await fetch(`${API_BASE}/api/projects/${projectId}/process`, {
              method: 'POST',
            })

            if (processRes.ok) {
              setUploadLogs((prev) => [
                ...prev,
                'Projeto adicionado com sucesso na fila de reconstrução!',
                'Sucesso!',
              ])
              setUploadProgress(100)
              setUploadStatusText('Upload e enfileiramento concluídos.')
            } else {
              const errData = await processRes.json()
              throw new Error(errData.detail || 'Erro ao enfileirar projeto.')
            }
          } catch (err: any) {
            setUploadLogs((prev) => [...prev, `Erro ao enfileirar: ${err.message}`])
            setIsUploading(false)
            setErrorMsg(`Erro ao iniciar processamento: ${err.message}`)
          }

        } else {
          let errorText = 'Erro no processamento do upload.'
          try {
            const errRes = JSON.parse(xhr.responseText)
            errorText = errRes.detail || errorText
          } catch (_) {
            // ignorar
          }
          setUploadLogs((prev) => [...prev, `Erro: ${errorText} (Código ${xhr.status})`])
          setIsUploading(false)
          setErrorMsg(`Erro ao realizar upload dos arquivos: ${errorText}`)
        }
      }

      xhr.onerror = () => {
        setUploadLogs((prev) => [...prev, 'Erro de conexão/rede ocorrido.'])
        setIsUploading(false)
        setErrorMsg('Erro de rede ao tentar fazer upload dos arquivos.')
      }

      xhr.send(formData)

    } catch (err: any) {
      console.error(err)
      setIsUploading(false)
      setErrorMsg(err.message || 'Ocorreu um erro inesperado ao salvar o projeto.')
    }
  }

  const handleUploadComplete = () => {
    // Carregar a lista atualizada
    fetchProjects()
    
    // Aguardar e resetar estado
    setTimeout(() => {
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
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Banco: Conectado</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
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
                      <div className="space-y-0.5 max-w-[65%]">
                        <h3 className="text-sm font-semibold text-white truncate group-hover:text-indigo-400 transition-colors">
                          {p.name}
                        </h3>
                        {p.description && (
                          <p className="text-xs text-slate-400 truncate">{p.description}</p>
                        )}
                      </div>

                      {/* Badge and Delete Action Container */}
                      <div className="flex items-center gap-2">
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
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400 font-semibold uppercase animate-pulse">
                            Na Fila
                          </span>
                        )}
                        {p.status === 'created' && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-500 font-semibold uppercase">
                            Criado
                          </span>
                        )}
                        {p.status === 'failed' && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 font-semibold uppercase">
                            Falhou
                          </span>
                        )}

                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={() => handleDeleteProject(p.id)}
                          className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                          title="Excluir Projeto"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                            className="w-4 h-4"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Meta Indicators */}
                    <div className="flex items-center gap-4 text-[10px] text-slate-500 font-mono">
                      <div>📁 {p.filesCount} arquivos</div>
                      <div>⚡ Modo: {p.mode === 'both' ? 'Completo' : p.mode === 'mesh' ? '3D' : '2D'}</div>
                      <div>🕒 {p.createdAt.split(' ')[0]}</div>
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

                    {/* Visualizar 3D Button for Completed Projects */}
                    {p.status === 'completed' && (
                      <button
                        type="button"
                        onClick={() => setViewerProject(p)}
                        className="w-full py-2 rounded-lg bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white border border-indigo-600/20 hover:border-indigo-600 font-semibold text-[10px] transition-all cursor-pointer flex items-center justify-center gap-1.5 mt-2"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                        </svg>
                        <span>Visualizar Modelo 3D</span>
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </main>

      {/* 3D Model Viewer Modal */}
      {viewerProject && (
        <ModelViewer
          projectName={viewerProject.name}
          modelUrl={`${API_BASE}/api/storage/projects/${viewerProject.id}/outputs/model.obj`}
          onClose={() => setViewerProject(null)}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <p>&copy; {new Date().getFullYear()} DroneMapper. Licenciado sob MIT. Interface integrada via HTTP API.</p>
      </footer>
    </div>
  )
}

export default App
