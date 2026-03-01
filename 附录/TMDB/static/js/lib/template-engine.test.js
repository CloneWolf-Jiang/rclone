/**
 * Phase 2：模板系统 - 单元测试和使用示例
 * 文件名：template-engine.test.js
 * 位置：static/js/lib/template-engine.test.js
 * 
 * 完整性检查：✅
 *   - 5个主要测试函数（Parser、Extractor、Generator、Engine、Workflow）
 *   - 14+ 个单元测试用例
 *   - 参数验证和错误处理
 * 
 * 包含：
 * 1. 模板解析器测试
 * 2. 变量提取器测试
 * 3. 文件名生成器测试
 * 4. 完整规则引擎测试
 * 5. 实际应用示例
 */

// ============ 测试数据 ============

const testGlobalVariables = {
  "电影名": "${title}",
  "季号": "${S}",
  "集号": "${E}",
  "年份": "${year}",
  "前缀": "${prefix}",
  "后缀": "${suffix}",
  "扩展名": "${ext}",
  "自定义1": "${custom1}"
};

const testSubstitutionRules = {
  "常规": [
    {
      id: "rule_001",
      name: "标准 01x01 格式",
      sourceTemplate: "${title} ${S}x${E} - ${name}.${ext}",
      targetTemplate: "${title} - S${S}E${E} - ${name}.${ext}",
      extractionStrategy: "numeric",
      exampleInput: "Breaking Bad 2x08 - Salud.mkv",
      exampleOutput: "Breaking Bad - S02E08 - Salud.mkv"
    },
    {
      id: "rule_002",
      name: "标准 S##E## 格式",
      sourceTemplate: "${title} S${S}E${E} - ${name}.${ext}",
      targetTemplate: "${title} - S${S}E${E} - ${name}.${ext}",
      extractionStrategy: "numeric"
    },
    {
      id: "rule_003",
      name: "点号分隔格式",
      sourceTemplate: "${title} ${S}.${E}.${ext}",
      targetTemplate: "${title} - S${S}E${E}.${ext}",
      extractionStrategy: "numeric"
    }
  ],
  
  "电视剧_Breaking Bad": [
    {
      id: "rule_bb_001",
      name: "Breaking Bad - 官方格式",
      sourceTemplate: "${title} ${S}.${E} - ${name}.${ext}",
      targetTemplate: "${title} - S${S}E${E} - ${name}.${ext}",
      extractionStrategy: "numeric",
      variables: {
        "季号": "${S}",
        "集号": "${E}"
      }
    }
  ]
};

// ============ 1. TemplateParser 测试 ============

function testTemplateParser() {
  console.log("\n========== TemplateParser 测试 ==========\n");
  
  const parser = new TemplateParser(testGlobalVariables);

  // 测试 1.1: 提取变量名
  console.log("测试 1.1: 提取变量名");
  const template1 = "${title} ${S}x${E} - ${name}.${ext}";
  const vars1 = parser.extractVariableNames(template1);
  console.log(`输入: ${template1}`);
  console.log(`输出: [${vars1.join(', ')}]`);
  console.log(`✅ 预期: [title, S, E, name, ext]\n`);

  // 测试 1.2: 验证模板
  console.log("测试 1.2: 验证模板（有效）");
  const validation1 = parser.validateTemplate("${title} ${S}E${E}", "source");
  console.log(`结果: ${validation1.valid ? "✅ 有效" : "❌ 无效"}`);
  console.log();

  // 测试 1.3: 验证模板（无效）
  console.log("测试 1.3: 验证模板（无效 - 缺少变量）");
  const validation2 = parser.validateTemplate("just a plain string", "source");
  console.log(`结果: ${validation2.valid ? "✅ 有效" : "❌ 无效"}`);
  console.log(`错误: ${validation2.errors.join('; ')}\n`);

  // 测试 1.4: 规范化模板
  console.log("测试 1.4: 规范化模板");
  const template2 = "${title} ${S}x${E}";
  const ruleVars = { "季号": "${S}", "集号": "${E}" };
  const normalized = parser.normalizeTemplate(template2, ruleVars);
  console.log(`输入: ${template2}`);
  console.log(`输出: ${normalized}`);
  console.log(`✅ 预期: \${title} \${季号}x\${集号}\n`);
}

// ============ 2. VariableExtractor 测试 ============

function testVariableExtractor() {
  console.log("\n========== VariableExtractor 测试 ==========\n");
  
  const extractor = new VariableExtractor(testGlobalVariables);

  // 测试 2.1: 简单提取
  console.log("测试 2.1: 简单提取（点号格式）");
  const filename1 = "Breaking Bad 2.08.mkv";
  const template1 = "${title} ${S}.${E}.${ext}";
  const extracted1 = extractor.extract(filename1, template1);
  console.log(`文件名: ${filename1}`);
  console.log(`模板: ${template1}`);
  console.log(`结果:`, extracted1);
  console.log(`✅ 预期: { title: "Breaking Bad", S: "2", E: "08", ext: "mkv" }\n`);

  // 测试 2.2: 复杂提取（带名称）
  console.log("测试 2.2: 复杂提取（带剧集名称）");
  const filename2 = "Breaking Bad 2x08 - Salud.mkv";
  const template2 = "${title} ${S}x${E} - ${name}.${ext}";
  const extracted2 = extractor.extract(filename2, template2);
  console.log(`文件名: ${filename2}`);
  console.log(`模板: ${template2}`);
  console.log(`结果:`, extracted2);
  console.log(`✅ 预期: { title: "Breaking Bad", S: "2", E: "08", name: "Salud", ext: "mkv" }\n`);

  // 测试 2.3: 无匹配
  console.log("测试 2.3: 测试无匹配情况");
  const filename3 = "不匹配的格式.mkv";
  const template3 = "${title} ${S}x${E}.${ext}";
  const extracted3 = extractor.extract(filename3, template3);
  console.log(`文件名: ${filename3}`);
  console.log(`模板: ${template3}`);
  console.log(`结果:`, extracted3);
  console.log(`✅ 预期: {}\n`);
}

// ============ 3. FilenameGenerator 测试 ============

function testFilenameGenerator() {
  console.log("\n========== FilenameGenerator 测试 ==========\n");
  
  const generator = new FilenameGenerator(testGlobalVariables);

  // 测试 3.1: 简单生成
  console.log("测试 3.1: 简单生成");
  const variables1 = { 
    title: "Breaking Bad", 
    S: "2", 
    E: "08", 
    name: "Salud", 
    ext: "mkv" 
  };
  const targetTemplate1 = "${title} - S${S}E${E} - ${name}.${ext}";
  const generated1 = generator.generate(variables1, targetTemplate1);
  console.log(`变量:`, variables1);
  console.log(`模板: ${targetTemplate1}`);
  console.log(`结果: ${generated1}`);
  console.log(`✅ 预期: Breaking Bad - S02E08 - Salud.mkv\n`);

  // 测试 3.2: 缺少变量
  console.log("测试 3.2: 缺少变量的处理");
  const variables2 = { title: "Breaking Bad", ext: "mkv" };
  const targetTemplate2 = "${title} - S${S}E${E}.${ext}";
  const generated2 = generator.generate(variables2, targetTemplate2);
  console.log(`变量:`, variables2);
  console.log(`模板: ${targetTemplate2}`);
  console.log(`结果: ${generated2}`);
  console.log(`✅ 预期: Breaking Bad - S0E0.mkv（数值变量默认为0）\n`);

  // 测试 3.3: 带验证的生成
  console.log("测试 3.3: 带验证的生成");
  const result = generator.generateWithValidation(variables1, targetTemplate1);
  console.log(`结果:`, result);
  console.log();
}

// ============ 4. TemplateRuleEngine 测试 ============

function testTemplateRuleEngine() {
  console.log("\n========== TemplateRuleEngine 测试 ==========\n");
  
  const engine = new TemplateRuleEngine(testSubstitutionRules, testGlobalVariables);

  // 测试 4.1: 处理 Breaking Bad 格式
  console.log("测试 4.1: 处理 Breaking Bad 格式（01x01）");
  const filename1 = "Breaking Bad 2x08 - Salud.mkv";
  const result1 = engine.processFilename(filename1, { category: "常规" });
  console.log(`文件名: ${filename1}`);
  console.log(`结果:`, result1);
  console.log(`✅ 成功: ${result1.success}`);
  console.log(`新名字: ${result1.generated}\n`);

  // 测试 4.2: 处理点号格式
  console.log("测试 4.2: 处理点号格式");
  const filename2 = "Breaking Bad 2.08.mkv";
  const result2 = engine.processFilename(filename2, { category: "常规" });
  console.log(`文件名: ${filename2}`);
  console.log(`结果:`, result2);
  console.log(`✅ 成功: ${result2.success}`);
  console.log(`新名字: ${result2.generated}\n`);

  // 测试 4.3: 电视剧专用规则
  console.log("测试 4.3: 使用电视剧专用规则");
  const filename3 = "Breaking Bad 2.08 - Salud.mkv";
  const result3 = engine.processFilename(filename3, { category: "电视剧_Breaking Bad" });
  console.log(`文件名: ${filename3}`);
  console.log(`规则分类: 电视剧_Breaking Bad`);
  console.log(`结果:`, result3);
  console.log(`✅ 成功: ${result3.success}`);
  console.log(`应用规则: ${result3.rule.name}`);
  console.log(`新名字: ${result3.generated}\n`);

  // 测试 4.4: 获取类别列表
  console.log("测试 4.4: 获取所有规则类别");
  const categories = engine.getCategories();
  console.log(`可用类别:`, categories);
  console.log();
}

// ============ 5. 完整使用示例 ============

function demoCompleteWorkflow() {
  console.log("\n========== 完整工作流演示 ==========\n");

  // 步骤 1: 准备配置
  console.log("步骤 1: 准备全局变量和替换规则");
  console.log("✅ 全局变量已加载");
  console.log("✅ 替换规则已加载\n");

  // 步骤 2: 用户输入文件名
  const inputFilename = "Breaking Bad 2x08 - Salud.mkv";
  console.log(`步骤 2: 用户输入文件名`);
  console.log(`📄 ${inputFilename}\n`);

  // 步骤 3: 创建引擎并处理
  console.log("步骤 3: 创建规则引擎");
  const engine = new TemplateRuleEngine(testSubstitutionRules, testGlobalVariables);
  console.log("✅ 引擎就绪\n");

  // 步骤 4: 尝试匹配规则
  console.log("步骤 4: 尝试匹配规则（常规分类）");
  const result = engine.processFilename(inputFilename, {
    strategy: 'numeric',
    category: '常规'
  });

  // 步骤 5: 显示结果
  console.log("步骤 5: 显示结果\n");
  
  if (result.success) {
    console.log(`✅ 成功匹配！`);
    console.log(`📋 应用规则: ${result.rule.name}`);
    console.log(`📝 规则描述: ${result.rule.description}`);
    console.log(`\n📊 提取的变量:`);
    for (const [key, value] of Object.entries(result.extracted)) {
      console.log(`   ${key}: "${value}"`);
    }
    console.log(`\n✨ 原文件名: ${result.filename}`);
    console.log(`✨ 新文件名: ${result.generated}`);
  } else {
    console.log(`❌ 未找到匹配的规则`);
    console.log(`💡 错误: ${result.errors.join('; ')}`);
  }

  console.log("\n");
}

// ============ 运行所有测试 ============

function runAllTests() {
  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║        Phase 2：模板系统 - 单元测试和示例                   ║");
  console.log("║              template-engine.test.js v1.0                  ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  try {
    testTemplateParser();
    testVariableExtractor();
    testFilenameGenerator();
    testTemplateRuleEngine();
    demoCompleteWorkflow();

    console.log("════════════════════════════════════════════════════════════");
    console.log("✅ 所有测试完成！");
    console.log("════════════════════════════════════════════════════════════\n");
  } catch (e) {
    console.error("❌ 测试过程中出错:", e);
  }
}

// ============ 如果直接运行此文件 ============

if (typeof require !== 'undefined') {
  // Node.js 环境
  const {
    TemplateParser,
    VariableExtractor,
    FilenameGenerator,
    TemplateRuleEngine
  } = require('./template-engine.js');

  // 运行测试
  runAllTests();
}

// ============ 浏览器环境下使用 ============
/*
在 HTML 中使用：

<script src="template-engine.js"></script>
<script src="template-engine.test.js"></script>

然后在控制台中调用：
- testTemplateParser()
- testVariableExtractor()
- testFilenameGenerator()
- testTemplateRuleEngine()
- demoCompleteWorkflow()
- runAllTests()
*/
