export default function ThemeManagement({ themes, selectedThemeId, onSelectTheme }) {
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900">主题管理</h2>
        <button
          type="button"
          className="px-3 py-1.5 text-xs rounded bg-red-500 text-white hover:bg-red-600"
        >
          新建主题
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {themes.map((theme) => {
          const isSelected = theme.id === selectedThemeId;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => onSelectTheme(theme)}
              className={`text-left rounded border p-3 transition ${
                isSelected ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-900">{theme.name}</span>
                <span className="text-[11px] text-gray-400">{theme.status}</span>
              </div>
              <p className="text-xs text-gray-500 line-clamp-2">{theme.description}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {theme.keywords.map((keyword) => (
                  <span key={keyword} className="px-1.5 py-0.5 text-[11px] bg-gray-100 rounded text-gray-600">
                    {keyword}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
