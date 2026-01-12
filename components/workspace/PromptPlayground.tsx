import { useState } from 'react';
import { Play, Plus, Loader, Copy, Check, ChevronDown } from 'lucide-react';

interface PromptTemplate {
  id: number;
  name: string;
  system_prompt: string;
  user_template: string;
  category: string;
  description: string;
}

interface PlaygroundResult {
  promptId: number;
  output: string;
  loading: boolean;
  error?: string;
}

interface PromptPlaygroundProps {
  prompts: PromptTemplate[];
}

export function PromptPlayground({ prompts }: PromptPlaygroundProps) {
  const [input, setInput] = useState('一款平价好用的防晒霜，学生党友好');
  const [selectedPrompts, setSelectedPrompts] = useState<number[]>([]);
  const [results, setResults] = useState<PlaygroundResult[]>([]);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const handleTogglePrompt = (promptId: number) => {
    if (selectedPrompts.includes(promptId)) {
      setSelectedPrompts(selectedPrompts.filter(id => id !== promptId));
    } else {
      setSelectedPrompts([...selectedPrompts, promptId]);
    }
  };

  const handleRun = () => {
    // Initialize results with loading state
    const newResults: PlaygroundResult[] = selectedPrompts.map(promptId => ({
      promptId,
      output: '',
      loading: true
    }));
    setResults(newResults);

    // Simulate API calls
    selectedPrompts.forEach((promptId, index) => {
      setTimeout(() => {
        setResults(prev => prev.map(r => 
          r.promptId === promptId 
            ? {
                ...r,
                loading: false,
                output: generateMockOutput(promptId, input)
              }
            : r
        ));
      }, 1000 + index * 500);
    });
  };

  const generateMockOutput = (promptId: number, input: string): string => {
    const outputs: Record<number, string> = {
      1: `🔥学生党必看！这款防晒霜太绝了！\n\n姐妹们，我发现了一款超级适合学生党的防晒霜！💕 价格不到50块，但是效果真的不输大牌！清爽不油腻，而且防晒指数SPF50+，夏天出门完全不怕晒黑～\n\n#学生党好物 #平价防晒 #夏日必备`,
      2: `防晒霜测评 | 学生党平价之选\n\n产品信息：\n- 价格：¥39.9\n- 规格：50ml\n- 防晒指数：SPF50+ PA++++\n- 质地：乳液状，清爽不油腻\n\n使用感受：\n这款防晒霜真的很适合学生党，价格亲民效果好。涂上去很快成膜，不会搓泥，也不会假白。坚持使用一个夏天，真的没怎么晒黑！`,
      3: `平价防晒霜推荐 💰\n\n一款性价比超高的防晒产品，特别适合预算有限的学生党。防护力强，使用感受舒适，日常通勤完全够用。建议配合其他防晒措施使用效果更佳～`
    };
    return outputs[promptId] || `基于"${input}"生成的内容...`;
  };

  const handleCopy = (text: string, id: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Input Section */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="max-w-6xl mx-auto">
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-900 mb-2">
              测试输入 <span className="text-gray-500 font-normal">（所有选中的提示词将使用相同输入）</span>
            </label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={2}
              placeholder="输入要测试的内容..."
              className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-xs text-gray-500">
                已选择 {selectedPrompts.length} 个提示词
              </div>
            </div>
            <button
              onClick={handleRun}
              disabled={selectedPrompts.length === 0 || !input}
              className="flex items-center gap-1.5 px-4 py-2 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              <Play className="w-3 h-3" />
              运行测试
            </button>
          </div>
        </div>
      </div>

      {/* Prompt Selection & Results */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-6xl mx-auto">
          {/* Prompt Selection */}
          <div className="mb-4">
            <h3 className="text-xs font-medium text-gray-900 mb-2">选择提示词</h3>
            <div className="relative">
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded bg-white hover:border-gray-300 transition-colors flex items-center justify-between"
              >
                <span className="text-gray-700">
                  {selectedPrompts.length === 0 
                    ? '点击选择要测试的提示词...' 
                    : `已选择 ${selectedPrompts.length} 个提示词`}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform ${
                  showDropdown ? 'rotate-180' : ''
                }`} />
              </button>

              {showDropdown && (
                <>
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setShowDropdown(false)}
                  />
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-20 max-h-64 overflow-y-auto">
                    {prompts.map((prompt) => (
                      <button
                        key={prompt.id}
                        onClick={() => handleTogglePrompt(prompt.id)}
                        className="w-full px-3 py-2 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors"
                      >
                        <div className="flex items-start gap-2">
                          <div className={`w-3.5 h-3.5 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center ${
                            selectedPrompts.includes(prompt.id)
                              ? 'bg-red-500 border-red-500'
                              : 'border-gray-300'
                          }`}>
                            {selectedPrompts.includes(prompt.id) && (
                              <Check className="w-2.5 h-2.5 text-white" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-medium text-gray-900">{prompt.name}</span>
                              <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-xs rounded">
                                {prompt.category}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 line-clamp-1">
                              {prompt.system_prompt.substring(0, 80)}...
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Selected Prompts Tags */}
            {selectedPrompts.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {selectedPrompts.map(promptId => {
                  const prompt = prompts.find(p => p.id === promptId);
                  return (
                    <div
                      key={promptId}
                      className="flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 text-xs rounded"
                    >
                      <span>{prompt?.name}</span>
                      <button
                        onClick={() => handleTogglePrompt(promptId)}
                        className="hover:bg-red-100 rounded"
                      >
                        <Check className="w-3 h-3 rotate-45" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Results */}
          {results.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-gray-900 mb-3">对比结果</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                {results.map((result) => {
                  const prompt = prompts.find(p => p.id === result.promptId);
                  return (
                    <div key={result.promptId} className="bg-white border border-gray-200 rounded">
                      {/* Header */}
                      <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                        <div className="text-xs font-medium text-gray-900">{prompt?.name}</div>
                        {!result.loading && result.output && (
                          <button
                            onClick={() => handleCopy(result.output, result.promptId)}
                            className="p-1 hover:bg-gray-100 rounded transition-colors"
                            title="复制"
                          >
                            {copiedId === result.promptId ? (
                              <Check className="w-3 h-3 text-green-500" />
                            ) : (
                              <Copy className="w-3 h-3 text-gray-500" />
                            )}
                          </button>
                        )}
                      </div>

                      {/* Output */}
                      <div className="p-3">
                        {result.loading ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader className="w-5 h-5 text-red-500 animate-spin" />
                          </div>
                        ) : (
                          <div className="text-xs text-gray-700 whitespace-pre-wrap min-h-[120px]">
                            {result.output}
                          </div>
                        )}
                      </div>

                      {/* Stats */}
                      {!result.loading && result.output && (
                        <div className="px-3 py-2 border-t border-gray-100 flex items-center gap-3 text-xs text-gray-500">
                          <span>{result.output.length} 字符</span>
                          <span>·</span>
                          <span>用时 ~1.2s</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty State */}
          {results.length === 0 && (
            <div className="bg-white border border-gray-200 rounded p-8 text-center">
              <Play className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <div className="text-xs text-gray-600 mb-1">准备测试提示词</div>
              <div className="text-xs text-gray-500">选择提示词并输入测试内容后，点击"运行测试"查看结果</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}