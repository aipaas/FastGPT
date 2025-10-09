import { MongoEvalItem } from '../../task/schema';
import { Types } from '../../../../common/mongo';
import { addLog } from '../../../../common/system/log';

export enum LanguageType {
  English = 'en',
  SimplifiedChinese = 'zh-CN',
  TraditionalChinese = 'zh-TW'
}

interface LanguageDetectionResult {
  language: LanguageType;
  englishRatio: number;
  simplifiedChineseRatio: number;
  traditionalChineseRatio: number;
  totalCharacters: number;
}

function isEnglishChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isSimplifiedChineseChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 0x4e00 && code <= 0x9fa5;
}

function isTraditionalChineseChar(char: string): boolean {
  const code = char.charCodeAt(0);
  if (code >= 0x3400 && code <= 0x4dbf) return true;
  if (code >= 0xf900 && code <= 0xfaff) return true;
  return false;
}

function analyzeTextLanguage(text: string): {
  englishCount: number;
  simplifiedChineseCount: number;
  traditionalChineseCount: number;
  totalCount: number;
} {
  let englishCount = 0;
  let simplifiedChineseCount = 0;
  let traditionalChineseCount = 0;
  let totalCount = 0;

  for (const char of text) {
    if (/\s/.test(char) || /[^\w\u4e00-\u9fa5\u3400-\u4dbf\uf900-\ufaff]/.test(char)) {
      continue;
    }

    totalCount++;

    if (isEnglishChar(char)) {
      englishCount++;
    } else if (isTraditionalChineseChar(char)) {
      traditionalChineseCount++;
    } else if (isSimplifiedChineseChar(char)) {
      simplifiedChineseCount++;
    }
  }

  return {
    englishCount,
    simplifiedChineseCount,
    traditionalChineseCount,
    totalCount
  };
}

// Detect primary language of evaluation user inputs
export async function detectEvaluationLanguage(evalId: string): Promise<LanguageDetectionResult> {
  try {
    addLog.info('[LanguageUtil] Starting language detection', { evalId });

    const evalItems = await MongoEvalItem.find(
      { evalId: new Types.ObjectId(evalId) },
      { 'dataItem.userInput': 1 }
    ).lean();

    if (!evalItems || evalItems.length === 0) {
      addLog.warn('[LanguageUtil] No evaluation items found', { evalId });
      return {
        language: LanguageType.SimplifiedChinese,
        englishRatio: 0,
        simplifiedChineseRatio: 0,
        traditionalChineseRatio: 0,
        totalCharacters: 0
      };
    }

    const allUserInputs = evalItems
      .map((item) => item.dataItem?.userInput || '')
      .filter((input) => input.trim().length > 0)
      .join(' ');

    if (allUserInputs.length === 0) {
      addLog.warn('[LanguageUtil] No user input text found', { evalId });
      return {
        language: LanguageType.SimplifiedChinese,
        englishRatio: 0,
        simplifiedChineseRatio: 0,
        traditionalChineseRatio: 0,
        totalCharacters: 0
      };
    }

    const { englishCount, simplifiedChineseCount, traditionalChineseCount, totalCount } =
      analyzeTextLanguage(allUserInputs);

    const englishRatio = totalCount > 0 ? Math.round((englishCount / totalCount) * 100) : 0;
    const simplifiedChineseRatio =
      totalCount > 0 ? Math.round((simplifiedChineseCount / totalCount) * 100) : 0;
    const traditionalChineseRatio =
      totalCount > 0 ? Math.round((traditionalChineseCount / totalCount) * 100) : 0;

    let language = LanguageType.SimplifiedChinese;
    const maxRatio = Math.max(englishRatio, simplifiedChineseRatio, traditionalChineseRatio);

    if (maxRatio === englishRatio) {
      language = LanguageType.English;
    } else if (maxRatio === traditionalChineseRatio) {
      language = LanguageType.TraditionalChinese;
    } else {
      language = LanguageType.SimplifiedChinese;
    }

    addLog.info('[LanguageUtil] Language detection completed', {
      evalId,
      language,
      englishRatio,
      simplifiedChineseRatio,
      traditionalChineseRatio,
      totalCharacters: totalCount
    });

    return {
      language,
      englishRatio,
      simplifiedChineseRatio,
      traditionalChineseRatio,
      totalCharacters: totalCount
    };
  } catch (error) {
    addLog.error('[LanguageUtil] Language detection failed', {
      evalId,
      error
    });
    return {
      language: LanguageType.SimplifiedChinese,
      englishRatio: 0,
      simplifiedChineseRatio: 0,
      traditionalChineseRatio: 0,
      totalCharacters: 0
    };
  }
}
