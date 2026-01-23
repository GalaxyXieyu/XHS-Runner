/**
 * 同步默认 prompts 到 Langfuse
 *
 * 运行: npx tsx scripts/sync-prompts-to-langfuse.ts
 */
import * as fs from "fs";
import * as path from "path";
import { config } from "dotenv";
config({ path: ".env.local" });

import { uploadPromptToLangfuse, getAgentPrompt } from "../src/server/services/promptManager";

const PROMPTS_DIR = path.join(process.cwd(), "prompts");

async function parseYamlPrompt(content: string): Promise<string | null> {
  // Simple parser to extract the prompt block.
  // Assumes format: prompt: |\n  [content]
  const lines = content.split('\n');
  let promptLines: string[] = [];
  let inPrompt = false;
  let baseIndent = 0;

  for (const line of lines) {
    if (!inPrompt) {
      if (line.trim().startsWith('prompt:')) {
        inPrompt = true;
        // Check if it's a block scalar
        if (!line.includes('|')) {
          // Inline prompt (not supported for this basic parser for now as we use blocks)
          const match = line.match(/prompt:\s*(.*)/);
          if (match) return match[1];
        }
      }
    } else {
      // We are in the prompt block
      if (line.trim() === '' && promptLines.length === 0) continue; // Skip initial empty lines

      const currentIndent = line.search(/\S|$/);
      if (line.trim() !== '') {
        if (promptLines.length === 0) {
          baseIndent = currentIndent;
        } else if (currentIndent < baseIndent) {
          break; // Dedented, end of block
        }
      }
      // Remove base indentation
      promptLines.push(line.slice(baseIndent));
    }
  }

  return promptLines.length > 0 ? promptLines.join('\n').trim() : null;
}

async function syncPromptsToLangfuse() {
  console.log("🚀 开始同步 prompts 到 Langfuse...\n");

  if (!fs.existsSync(PROMPTS_DIR)) {
    console.error(`❌ Prompts 目录不存在: ${PROMPTS_DIR}`);
    return;
  }

  const files = fs.readdirSync(PROMPTS_DIR).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  const agentNamesToVerify: string[] = [];

  for (const file of files) {
    const agentName = path.basename(file, path.extname(file));
    agentNamesToVerify.push(agentName);
    const content = fs.readFileSync(path.join(PROMPTS_DIR, file), 'utf-8');

    console.log(`📂 处理文件: ${file} -> Agent: ${agentName}`);

    const prompt = await parseYamlPrompt(content);
    if (!prompt) {
      console.warn(`   ⚠️ 无法解析 prompt 内容: ${file}`);
      continue;
    }

    console.log(`   📤 上传中...`);
    try {
      const success = await uploadPromptToLangfuse(agentName, prompt, true); // true = production label
      if (success) {
        console.log(`   ✅ 成功上传到 Langfuse`);
      } else {
        console.log(`   ⚠️ Langfuse 不可用，已保存到数据库`);
      }
    } catch (error) {
      console.error(`   ❌ 失败:`, error);
    }
  }

  console.log("\n📋 验证已上传的 prompts...\n");

  for (const agentName of agentNamesToVerify) {
    const prompt = await getAgentPrompt(agentName);
    if (prompt) {
      console.log(`✅ ${agentName}: ${prompt.slice(0, 50)}...`);
    } else {
      console.log(`❌ ${agentName}: 未找到`);
    }
  }

  console.log("\n🎉 同步完成！请到 Langfuse 控制台查看。");
}

syncPromptsToLangfuse().catch(console.error);
