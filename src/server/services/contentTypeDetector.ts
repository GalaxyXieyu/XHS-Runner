/**
 * 内容类型检测服务
 * 自动根据用户消息推断应该使用的内容类型模板
 */

export type ContentType = "edu" | "billboard" | "product" | "story";

export interface ContentTypeDetection {
  type: ContentType;
  confidence: number;
  reasoning: string;
}

/**
 * 检测用户意图，自动推断内容类型
 */
export function detectContentType(message: string): ContentTypeDetection {
  const lowerMessage = message.toLowerCase();

  // 定义各类内容的关键词和模式
  const patterns = {
    edu: {
      keywords: [
        "教程", "教学", "如何", "怎么", "步骤", "教程",
        "技巧", "方法", "教程", "入门", "学习", "科普",
        "知识", "分享", "干货", "教学", "指南",
        " teach", "how to", "tutorial", "learn",
      ],
      patterns: [
        /如何.*\?/,
        /怎么.*\?/,
        /教.*做/,
        /步骤/,
        /教程/,
        /教学/,
      ],
    },
    billboard: {
      keywords: [
        "观点", "看法", "想法", "感受", "情绪", "吐槽",
        "议论", "讨论", "看法", "觉得", "认为",
        " opinion", "thought", "feel", "rant",
      ],
      patterns: [
        /观点/,
        /觉得/,
        /认为/,
        /感受/,
        /情绪/,
        /吐槽/,
        /议论/,
      ],
    },
    product: {
      keywords: [
        "推荐", "种草", "好物", "产品", "餐厅", "美食",
        "地点", "旅行", "酒店", "APP", "工具",
        " recommend", "review", "recommendation", "product",
      ],
      patterns: [
        /推荐/,
        /种草/,
        /好物/,
        /评测/,
        /使用.*感受/,
      ],
    },
    story: {
      keywords: [
        "故事", "经历", "回忆", "心情", "感悟", "游记",
        "生活", "成长", "改变", "心得",
        "story", "experience", "journey", "life",
      ],
      patterns: [
        /故事/,
        /经历/,
        /回忆/,
        /感悟/,
        /心情/,
        /游记/,
        /生活/,
      ],
    },
  };

  // 计算各类内容的匹配分数
  const scores: Record<ContentType, number> = {
    edu: 0,
    billboard: 0,
    product: 0,
    story: 0,
  };

  // 统计关键词匹配
  for (const [type, config] of Object.entries(patterns)) {
    const contentType = type as ContentType;

    // 关键词匹配（权重1）
    for (const keyword of config.keywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        scores[contentType] += 1;
      }
    }

    // 模式匹配（权重3）
    for (const pattern of config.patterns) {
      if (pattern.test(message)) {
        scores[contentType] += 3;
      }
    }
  }

  // 寻找最高分
  let maxScore = 0;
  let bestType: ContentType = "product"; // 默认

  for (const [type, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      bestType = type as ContentType;
    }
  }

  // 计算置信度
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = totalScore > 0 ? maxScore / totalScore : 0.5;

  // 生成推理说明
  const reasoning = generateReasoning(bestType, scores, lowerMessage);

  return {
    type: bestType,
    confidence: Math.min(confidence + 0.3, 0.95), // 提升基础置信度
    reasoning,
  };
}

/**
 * 生成推理说明
 */
function generateReasoning(
  type: ContentType,
  scores: Record<ContentType, number>,
  message: string
): string {
  const typeNames = {
    edu: "科普教学",
    billboard: "大字报",
    product: "种草分享",
    story: "故事叙事",
  };

  const descriptions = {
    edu: "检测到教程、教学、知识分享类关键词",
    billboard: "检测到观点、情绪表达类关键词",
    product: "检测到推荐、种草类关键词",
    story: "检测到故事、经历类关键词",
  };

  // 检查是否有明确的内容类型指示
  if (/\b教程|教学|如何\b/i.test(message)) {
    return "明确检测到教程类内容，使用科普教学模板";
  }
  if (/\b推荐|种草|评测\b/i.test(message)) {
    return "明确检测到推荐类内容，使用种草分享模板";
  }
  if (/\b故事|经历|回忆\b/i.test(message)) {
    return "明确检测到故事类内容，使用故事叙事模板";
  }
  if (/\b观点|感受|吐槽\b/i.test(message)) {
    return "明确检测到观点表达类内容，使用大字报模板";
  }

  return descriptions[type];
}

/**
 * 批量检测（用于分析对话历史）
 */
export function detectContentTypeFromMessages(messages: string[]): ContentTypeDetection {
  if (messages.length === 0) {
    return {
      type: "product",
      confidence: 0.5,
      reasoning: "无消息历史，使用默认种草分享模板",
    };
  }

  // 合并所有消息
  const fullText = messages.join("\n");

  // 检测最近的消息（权重更高）
  const recentMessages = messages.slice(-3);
  const recentScore = detectContentType(recentMessages.join("\n"));

  // 检测整体消息
  const overallScore = detectContentType(fullText);

  // 综合判断（最近的消息权重更高）
  if (recentScore.confidence > overallScore.confidence) {
    return recentScore;
  }

  return overallScore;
}
