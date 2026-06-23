import React from 'react'

export interface ProjectSettings {
  name: string
  description: string
  quality: 'low' | 'medium' | 'high'
  mode: 'mesh' | 'ortho' | 'both'
}

interface ProjectFormProps {
  settings: ProjectSettings
  onChange: (settings: ProjectSettings) => void
  disabled?: boolean
}

export const ProjectForm: React.FC<ProjectFormProps> = ({
  settings,
  onChange,
  disabled = false,
}) => {
  const handleChange = (
    field: keyof ProjectSettings,
    value: string
  ) => {
    onChange({
      ...settings,
      [field]: value,
    })
  }

  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 backdrop-blur-md shadow-xl space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-white">Configurações do Projeto</h2>
        <p className="text-xs text-slate-400">Configure os parâmetros básicos e de qualidade de processamento.</p>
      </div>

      <div className="space-y-4">
        {/* Nome do Projeto */}
        <div className="space-y-1.5">
          <label htmlFor="project-name" className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Nome do Projeto
          </label>
          <input
            id="project-name"
            type="text"
            placeholder="Ex: Mapeamento Fazenda Primavera"
            value={settings.name}
            onChange={(e) => handleChange('name', e.target.value)}
            disabled={disabled}
            className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all disabled:opacity-50"
          />
        </div>

        {/* Descrição */}
        <div className="space-y-1.5">
          <label htmlFor="project-desc" className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Descrição (Opcional)
          </label>
          <textarea
            id="project-desc"
            placeholder="Detalhes adicionais sobre o voo, drone utilizado ou área mapeada..."
            value={settings.description}
            onChange={(e) => handleChange('description', e.target.value)}
            disabled={disabled}
            rows={3}
            className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all disabled:opacity-50 resize-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Qualidade do Processamento */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Qualidade do Processamento
            </label>
            <div className="grid grid-cols-3 gap-2 bg-slate-950/60 border border-slate-800 p-1 rounded-xl">
              {(['low', 'medium', 'high'] as const).map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleChange('quality', q)}
                  className={`py-2 rounded-lg text-xs font-medium capitalize cursor-pointer transition-all ${
                    settings.quality === q
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {q === 'low' ? 'Baixa' : q === 'medium' ? 'Média' : 'Alta'}
                </button>
              ))}
            </div>
          </div>

          {/* Tipo de Reconstrução */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Tipo de Reconstrução
            </label>
            <select
              value={settings.mode}
              disabled={disabled}
              onChange={(e) => handleChange('mode', e.target.value as any)}
              className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all disabled:opacity-50 cursor-pointer h-[38px]"
            >
              <option value="both">Modelo 3D & Ortofoto (Ambos)</option>
              <option value="mesh">Apenas Modelo 3D (Mesh)</option>
              <option value="ortho">Apenas Ortofoto (Mapa 2D)</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}
