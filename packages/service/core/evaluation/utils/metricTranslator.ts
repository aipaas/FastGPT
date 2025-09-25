/**
 * Built-in metric name translation utility for backend export
 */

// Built-in metric translations
const BUILTIN_METRIC_TRANSLATIONS: Record<string, Record<string, string>> = {
  // Simplified Chinese translations
  zh: {
    answer_correctness: '回答准确度',
    answer_similarity: '语义相似度',
    answer_relevancy: '回答相关度',
    faithfulness: '回答忠诚度',
    context_recall: '检索匹配度',
    context_precision: '检索精确度'
  },
  // Traditional Chinese translations
  'zh-hant': {
    answer_correctness: '回答準確度',
    answer_similarity: '語義相似度',
    answer_relevancy: '回答相關度',
    faithfulness: '回答忠誠度',
    context_recall: '檢索匹配度',
    context_precision: '檢索精確度'
  },
  // English translations (default/fallback)
  en: {
    answer_correctness: 'Answer Correctness',
    answer_similarity: 'Answer Similarity',
    answer_relevancy: 'Answer Relevance',
    faithfulness: 'Faithfulness',
    context_recall: 'Context Recall',
    context_precision: 'Context Precision'
  }
};

/**
 * Translate built-in metric name to specified locale
 * @param metricName - The metric name to translate
 * @param locale - Target locale (e.g., 'zh', 'zh-CN', 'zh-Hant', 'en')
 * @returns Translated metric name or original name if not found
 */
export const translateBuiltinMetricName = (metricName: string, locale: string = 'en'): string => {
  // Normalize locale to handle different formats
  const normalizedLocale = locale.toLowerCase();

  // Handle specific locale mappings
  let targetLocale = normalizedLocale;
  if (normalizedLocale === 'zh-cn') {
    targetLocale = 'zh';
  } else if (normalizedLocale === 'zh-hk' || normalizedLocale === 'zh-tw') {
    targetLocale = 'zh-hant';
  } else if (normalizedLocale.startsWith('zh-')) {
    // For other zh variants, try zh-hant first, then fallback to zh
    targetLocale = BUILTIN_METRIC_TRANSLATIONS['zh-hant'] ? 'zh-hant' : 'zh';
  }

  // Get translations for the specified locale, fallback to English
  const translations =
    BUILTIN_METRIC_TRANSLATIONS[targetLocale] || BUILTIN_METRIC_TRANSLATIONS['en'];

  // Return translated name or original if not found
  return translations[metricName] || metricName;
};

/**
 * Check if a metric name is a built-in metric
 * @param metricName - The metric name to check
 * @returns True if it's a built-in metric
 */
export const isBuiltinMetric = (metricName: string): boolean => {
  const englishTranslations = BUILTIN_METRIC_TRANSLATIONS['en'];
  return metricName in englishTranslations;
};
