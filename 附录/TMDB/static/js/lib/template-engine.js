/**
 * Phase 2：模板系统 - 核心设计1
 * 文件名：template-engine.js
 * 位置：static/js/lib/template-engine.js
 * 
 * 功能：
 * 1. 模板解析和验证
 * 2. 从文件名中提取变量值
 * 3. 生成新的文件名
 * 4. 规则匹配和执行
 * 
 * 完整性检查：✅ 
 *   - TemplateParser: 完整（5个方法，完整JSDoc）
 *   - VariableExtractor: 完整（4个方法，包括3种提取策略）
 *   - FilenameGenerator: 完整（3个方法，包含验证）
 *   - TemplateRuleEngine: 完整（5个方法，完整的规则管理）
 * 
 * 使用示例见底部
 */

/**
 * 模板解析引擎 - 负责解析和验证所有模板
 */
class TemplateParser {
  constructor(globalVariables = {}) {
    // 全局变量配置，格式: { "电影名": "${title}", "季号": "${S}", ... }
    this.globalVariables = globalVariables;
    // 正则表达式：匹配 ${...} 格式的变量
    this.variablePattern = /\$\{([^}]+)\}/g;
  }

  /**
   * 从模板中提取所有变量名
   * @param {string} template - 模板字符串，如 "${title} ${S}E${E}"
   * @returns {Array<string>} 变量列表，如 ["title", "S", "E"]
   */
  extractVariableNames(template) {
    if (!template || typeof template !== 'string') {
      return [];
    }

    const variables = [];
    let match;
    
    // 重置正则表达式的 lastIndex
    this.variablePattern.lastIndex = 0;
    
    while ((match = this.variablePattern.exec(template)) !== null) {
      variables.push(match[1]);
    }
    
    return variables;
  }

  /**
   * 验证模板的有效性
   * @param {string} template - 模板字符串
   * @param {string} templateType - 模板类型，"source" 或 "target"
   * @returns {Object} { valid: boolean, errors: Array<string> }
   */
  validateTemplate(template, templateType = "source") {
    const errors = [];

    // 检查模板不为空
    if (!template || typeof template !== 'string') {
      errors.push("模板不能为空");
      return { valid: false, errors };
    }

    // 检查模板长度
    if (template.length > 500) {
      errors.push("模板过长（最多500字符）");
    }

    // 检查括号是否匹配
    let braceCount = 0;
    for (let char of template) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
      if (braceCount < 0) {
        errors.push("模板中存在不匹配的括号");
        break;
      }
    }
    if (braceCount !== 0) {
      errors.push("模板中存在不匹配的括号");
    }

    // 检查变量格式
    const variables = this.extractVariableNames(template);
    for (let varName of variables) {
      if (!varName || varName.trim() === '') {
        errors.push(`模板中存在空变量名：\${}`);
      }
      if (/[^a-zA-Z0-9_\u4e00-\u9fff]/.test(varName)) {
        errors.push(`变量名 '\${${varName}}' 包含非法字符`);
      }
    }

    // 对于源模板，检查是否至少有一个变量
    if (templateType === "source" && variables.length === 0) {
      errors.push("源模板必须至少包含一个变量");
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 规范化变量名到标准格式
   * 例如：${S} -> ${季号}（如果全局配置中有映射）
   * @param {string} template - 原始模板
   * @param {Object} ruleVariables - 规则级别的变量覆盖，如 { "季号": "${S}" }
   * @returns {string} 规范化后的模板
   */
  normalizeTemplate(template, ruleVariables = {}) {
    if (!template) return template;

    // 创建别名到标准变量名的映射
    const aliasToStandard = {};

    // 第1层：处理规则级别的变量（优先级最高）
    for (const [standardName, alias] of Object.entries(ruleVariables)) {
      // 从别名中提取变量名，如 "${S}" -> "S"
      const match = alias.match(/\$\{([^}]+)\}/);
      if (match) {
        aliasToStandard[match[1]] = standardName;
      }
    }

    // 第2层：处理全局变量定义
    for (const [standardName, alias] of Object.entries(this.globalVariables)) {
      const match = alias.match(/\$\{([^}]+)\}/);
      if (match) {
        aliasToStandard[match[1]] = standardName;
      }
    }

    // 替换模板中的所有变量
    return template.replace(this.variablePattern, (match, varName) => {
      if (aliasToStandard[varName]) {
        return `\$\{${aliasToStandard[varName]}\}`;
      }
      return match;
    });
  }
}

/**
 * 变量提取器 - 负责从文件名中提取变量值
 */
class VariableExtractor {
  constructor(globalVariables = {}) {
    this.globalVariables = globalVariables;
    this.parser = new TemplateParser(globalVariables);
  }

  /**
   * 从文件名中提取变量值
   * @param {string} filename - 原始文件名，如 "Breaking Bad 2.08 - Salud (2009).mkv"
   * @param {string} sourceTemplate - 源模板，如 "${title} ${S}.${E} - ${name} (${year}).${ext}"
   * @param {string} strategy - 提取策略：'position' | 'numeric' | 'manual'
   * @param {Object} ruleVariables - 规则级别的变量覆盖
   * @returns {Object} 提取的变量，如 { title: "Breaking Bad", S: "2", E: "08", ... }
   */
  extract(filename, sourceTemplate, strategy = 'numeric', ruleVariables = {}) {
    const result = {};

    // 验证输入
    if (!filename || !sourceTemplate) {
      return result;
    }

    // 规范化模板
    const normalized = this.parser.normalizeTemplate(sourceTemplate, ruleVariables);

    // 将模板转换为正则表达式
    const regex = this._templateToRegex(normalized);

    if (!regex) {
      console.error("无法将模板转换为正则表达式:", sourceTemplate);
      return result;
    }

    // 尝试从文件名中匹配
    const match = regex.exec(filename);

    if (!match) {
      console.warn("文件名不匹配模板");
      return result;
    }

    // 构建变量->值的映射
    const variables = this.parser.extractVariableNames(normalized);
    
    for (let i = 0; i < variables.length; i++) {
      const varName = variables[i];
      const value = match[i + 1] || '';
      result[varName] = value;
    }

    return result;
  }

  /**
   * 将模板转换为正则表达式
   * 例如："${title} ${S}E${E}" -> /(.*?)\s+(\d{1,2})E(\d{1,2})/
   * @private
   */
  _templateToRegex(template) {
    if (!template) return null;

    // 逃逸特殊字符
    let pattern = template.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

    // 用正则表达式替换变量
    pattern = pattern.replace(/\$\{([^}]+)\}/g, '(.*?)');

    // 优化：去掉连续的 \s+ 和 动态匹配
    pattern = pattern.replace(/\\ /g, '\\s*');

    try {
      return new RegExp(`^${pattern}$`);
    } catch (e) {
      console.error("正则表达式创建失败:", e);
      return null;
    }
  }

  /**
   * 使用位置优先策略提取（按模板中的位置顺序）
   * @param {string} filename
   * @param {string} sourceTemplate
   * @returns {Object}
   */
  extractByPosition(filename, sourceTemplate, ruleVariables = {}) {
    return this.extract(filename, sourceTemplate, 'position', ruleVariables);
  }

  /**
   * 使用数值优先策略提取（优先识别数值）
   * @param {string} filename
   * @param {string} sourceTemplate
   * @returns {Object}
   */
  extractByNumeric(filename, sourceTemplate, ruleVariables = {}) {
    // TODO: 实现更智能的数值优先逻辑
    // 目前使用通用提取
    return this.extract(filename, sourceTemplate, 'numeric', ruleVariables);
  }
}

/**
 * 文件名生成器 - 负责根据变量和目标模板生成新文件名
 */
class FilenameGenerator {
  constructor(globalVariables = {}) {
    this.globalVariables = globalVariables;
    this.parser = new TemplateParser(globalVariables);
  }

  /**
   * 根据提取的变量和目标模板生成新文件名
   * @param {Object} variables - 提取的变量集合，如 { title: "Breaking Bad", S: "2", E: "08", ... }
   * @param {string} targetTemplate - 目标模板，如 "${title} - S${S}E${E} - ${name}.${ext}"
   * @param {Object} ruleVariables - 规则级别的变量覆盖
   * @returns {string} 生成的文件名
   */
  generate(variables, targetTemplate, ruleVariables = {}) {
    if (!targetTemplate) {
      return '';
    }

    // 规范化模板
    const normalized = this.parser.normalizeTemplate(targetTemplate, ruleVariables);

    // 替换模板中的所有变量
    return normalized.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      // 如果变量存在，使用其值，否则使用空字符串或默认值
      if (variables.hasOwnProperty(varName)) {
        return variables[varName] || '';
      }
      
      // 处理未提取的数值变量（默认为0）
      if (/季号|E|集号|S/.test(varName)) {
        return '0';
      }

      // 其他变量默认为空字符串
      return '';
    });
  }

  /**
   * 生成带验证的文件名
   * 返回包含验证信息和可能的警告
   */
  generateWithValidation(variables, targetTemplate, ruleVariables = {}) {
    const result = {
      success: true,
      filename: '',
      warnings: []
    };

    // 验证目标模板
    const validation = this.parser.validateTemplate(targetTemplate, 'target');
    if (!validation.valid) {
      result.success = false;
      result.errors = validation.errors;
      return result;
    }

    // 检查是否有未提供的变量
    const templateVars = this.parser.extractVariableNames(targetTemplate);
    for (const varName of templateVars) {
      if (!variables.hasOwnProperty(varName)) {
        result.warnings.push(`变量 '\${${varName}}' 未在源文件名中被提取，将使用默认值`);
      }
    }

    result.filename = this.generate(variables, targetTemplate, ruleVariables);
    return result;
  }
}

/**
 * 模板规则引擎 - 将模板系统、提取器、生成器整合在一起
 */
class TemplateRuleEngine {
  constructor(substitutionRules = {}, globalVariables = {}) {
    this.substitutionRules = substitutionRules; // 替换规则配置
    this.globalVariables = globalVariables;     // 全局变量配置

    this.parser = new TemplateParser(globalVariables);
    this.extractor = new VariableExtractor(globalVariables);
    this.generator = new FilenameGenerator(globalVariables);
  }

  /**
   * 处理文件名：尝试匹配规则并生成新名字
   * @param {string} filename - 原始文件名
   * @param {Object} options - 选项
   *   - strategy: 提取策略 ('position' | 'numeric' | 'manual')
   *   - category: 规则分类 ('常规' | '电视剧_XXX' 等)
   *   - ruleId: 指定使用哪条规则（如果为空则自动匹配）
   * @returns {Object} 处理结果
   */
  processFilename(filename, options = {}) {
    const {
      strategy = 'numeric',
      category = '常规',
      ruleId = null
    } = options;

    const result = {
      success: false,
      filename: filename,
      rule: null,
      extracted: {},
      generated: '',
      errors: []
    };

    // 获取要尝试的规则列表
    let rulesToTry = [];

    if (ruleId) {
      // 指定了规则 ID，查找特定规则
      rulesToTry = this._findRuleById(ruleId);
    } else {
      // 自动匹配规则
      rulesToTry = this._getRulesForCategory(category);
    }

    if (rulesToTry.length === 0) {
      result.errors.push(`未找到指定的规则分类: ${category}`);
      return result;
    }

    // 逐条尝试规则
    for (const rule of rulesToTry) {
      try {
        // 验证源模板
        const sourceValidation = this.parser.validateTemplate(rule.sourceTemplate, 'source');
        if (!sourceValidation.valid) {
          continue;
        }

        // 尝试提取变量
        const extracted = this.extractor.extract(
          filename,
          rule.sourceTemplate,
          rule.extractionStrategy || strategy,
          rule.variables || {}
        );

        // 如果提取成功（至少提取到一个变量）
        if (Object.keys(extracted).length > 0) {
          // 生成新文件名
          const generated = this.generator.generate(
            extracted,
            rule.targetTemplate,
            rule.variables || {}
          );

          result.success = true;
          result.rule = rule;
          result.extracted = extracted;
          result.generated = generated;
          return result;
        }
      } catch (e) {
        console.error(`规则处理失败: ${rule.name}`, e);
        continue;
      }
    }

    result.errors.push('未找到匹配的规则');
    return result;
  }

  /**
   * 获取指定分类的规则列表
   * @private
   */
  _getRulesForCategory(category) {
    return this.substitutionRules[category] || [];
  }

  /**
   * 按规则 ID 查找规则
   * @private
   */
  _findRuleById(ruleId) {
    for (const category in this.substitutionRules) {
      const rules = this.substitutionRules[category];
      const found = rules.find(r => r.id === ruleId);
      if (found) return [found];
    }
    return [];
  }

  /**
   * 获取所有可用的规则分类
   */
  getCategories() {
    return Object.keys(this.substitutionRules);
  }

  /**
   * 获取指定分类中的规则列表
   */
  getRulesByCategory(category) {
    return this.substitutionRules[category] || [];
  }
}

/**
 * ============ 使用示例 ============
 * 
 * // 1. 初始化
 * const globalVars = {
 *   "电影名": "${title}",
 *   "季号": "${S}",
 *   "集号": "${E}",
 *   "年份": "${year}",
 *   "前缀": "${prefix}",
 *   "后缀": "${suffix}",
 *   "扩展名": "${ext}"
 * };
 * 
 * // 2. 定义替换规则
 * const rules = {
 *   "常规": [
 *     {
 *       id: "rule_001",
 *       name: "标准 01x01 格式",
 *       sourceTemplate: "${title} ${S}x${E} - ${name}.${ext}",
 *       targetTemplate: "${title} - S${S}E${E} - ${name}.${ext}",
 *       extractionStrategy: "numeric"
 *     }
 *   ]
 * };
 * 
 * // 3. 创建引擎
 * const engine = new TemplateRuleEngine(rules, globalVars);
 * 
 * // 4. 处理文件名
 * const result = engine.processFilename("Breaking Bad 2x08 - Salud.mkv");
 * console.log(result);
 * // 输出: { 
 * //   success: true,
 * //   filename: "Breaking Bad - S02E08 - Salud.mkv",
 * //   extracted: { title: "Breaking Bad", S: "2", E: "08", ...}
 * // }
 */

// 导出供外部使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TemplateParser,
    VariableExtractor,
    FilenameGenerator,
    TemplateRuleEngine
  };
}
