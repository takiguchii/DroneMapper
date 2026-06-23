import { useState } from 'react'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 bg-clip-text text-transparent">
              DroneMapper
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
              v0.1.0
            </span>
          </div>
          <nav className="flex gap-4">
            <a href="#" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">
              Projetos
            </a>
            <a href="https://github.com/takiguchii/DroneMapper" target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">
              GitHub
            </a>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-grow flex flex-col items-center justify-center">
        <div className="text-center max-w-3xl space-y-6">
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white">
            Reconstrução 3D por Fotogrametria{' '}
            <span className="block bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent mt-2">
              Self-Hosted & Open Source
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto">
            Faça o upload de fotos de drone ou vídeos, extraia frames, processe com OpenDroneMap e visualize modelos 3D interativos e ortofotos.
          </p>

          <div className="pt-6 flex flex-wrap justify-center gap-4">
            <button
              onClick={() => setCount((c) => c + 1)}
              className="px-6 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium shadow-lg hover:shadow-indigo-500/20 transition-all cursor-pointer"
            >
              Testar Contador: {count}
            </button>
            <a
              href="#upload"
              className="px-6 py-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-200 font-medium transition-all"
            >
              Ver Projetos
            </a>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-sm text-slate-500">
        <p>&copy; {new Date().getFullYear()} DroneMapper. Desenvolvido para processamento de fotogrametria self-hosted.</p>
      </footer>
    </div>
  )
}

export default App
