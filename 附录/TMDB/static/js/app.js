// TMDB 电视剧重命名工具 - 前端JavaScript

/**
 * ========================================================================
 * Phase 2 规则引擎 - 集中处理所有正则式和文件名转换逻辑
 * ========================================================================
 * 
 * 设计理念：最大化兼容性
 * - 定义"集号(E)"和"季号+集号(SE)"为主体信息
 * - 当主体被成功匹配时，允许其他变量为空
 * - 允许返回 "E08.mkv"、"S02E08.mkv"、"E08" 等简化结果
 * 
 * 核心功能：
 * 1. generateRegexPattern(sourceTemplate, targetTemplate)
 *    - 功能：根据源模板生成灵活的正则式
 *    - 输入：源模板、目标模板
 *    - 返回：正则式对象，包含pattern、variables等
 *    - 特点：自动区分括号形式 ${year}、(${year})、( ${year} ) 等
 *
 * 2. applyRegexToFilename(filename, regexInfo, episodeOffset = -1)
 *    - 功能：使用正则式匹配文件名并生成新文件名，支持集号偏移
 *    - 输入：原文件名、正则式信息对象、集号偏移值
 *    - 返回：转换后的文件名（包含至少集号），或 null（无集号）
 *    - 要求：必须至少匹配到集号(E)；其他变量可为空
 *    - 集号偏移算法：新集号 = 原集号 - 1 + 参数（当参数 >= 0 时）
 *      • 参数 < 0（如 -1）：保持原集号，不进行偏移 ✓
 *      • 参数 = 0：改名为 E0、E1、E2...（从0开始）✓
 *      • 参数 > 0（如 3）：改名为 E3、E4、E5...（从参数值开始）✓
 *    
 *    集号偏移验证示例：
 *    ┌─────────────┬──────────┬───────────┬──────────────────┐
 *    │ 原集号 E1   │ 参数 -1  │ 参数 0    │ 参数 3           │
 *    ├─────────────┼──────────┼───────────┼──────────────────┤
 *    │ 1           │ 1（原值）│ 0         │ 3                │
 *    │ 2           │ 2（原值）│ 1         │ 4                │
 *    │ 8           │ 8（原值）│ 7         │ 10               │
 *    └─────────────┴──────────┴───────────┴──────────────────┘
 *    
 *    使用示例：
 *      • 原文件："S01E08" + 参数 0 → "S01E07"（从E0开始计数）
 *      • 原文件："S01E08" + 参数 3 → "S01E10"（从E3开始计数）
 *      • 原文件："S01E08" + 参数 -1 → "S01E08"（保持原值）
 *
 * 使用示例：
 *   const sourceTemplate = "${title} ${S}x${E} - ${name}.${ext}";
 *   const targetTemplate = "${title} - S${S}E${E}.${ext}";
 *   const regexInfo = Phase2RuleEngine.generateRegexPattern(sourceTemplate, targetTemplate);
 *   
 *   // 案例1：完整匹配，不偏移集号
 *   const result1 = Phase2RuleEngine.applyRegexToFilename(
 *       "Breaking Bad 02x08 - Salud.mkv", 
 *       regexInfo,
 *       -1  // 不偏移
 *   );
 *   // 结果: "Breaking Bad - S02E08.mkv"
 *   
 *   // 案例2：仅集号，从 E0 开始计数
 *   const result2 = Phase2RuleEngine.applyRegexToFilename(
 *       "02x08.mkv", 
 *       regexInfo,
 *       0  // 从 E0 开始
 *   );
 *   // 结果: "S02E07.mkv" （原 E8，偏移后为 8 - 1 + 0 = 7）
 *   
 *   // 案例3：仅集号，从 E3 开始计数
 *   const result3 = Phase2RuleEngine.applyRegexToFilename(
 *       "01x01.mkv", 
 *       regexInfo,
 *       3  // 从 E3 开始
 *   );
 *   // 结果: "S01E03.mkv" （原 E1，偏移后为 1 - 1 + 3 = 3）
 * ========================================================================
 */

// Phase 2 规则引擎 - 集中处理所有正则式和文件名转换逻辑
const Phase2RuleEngine = {
    
    /**
     * 主函数1：根据源模板生成正则式
     * @param {string} sourceTemplate - 源模板，如 "${title} ${S}x${E} - ${name}.${ext}"
     * @param {string} targetTemplate - 目标模板，如 "${title} - S${S}E${E} - ${name}.${ext}"
     * @returns {object} 包含正则式和元数据的对象
     *   - pattern: 正则式字符串
     *   - variables: 变量列表
     *   - priorityVariables: 优先级变量(S, E)
     *   - sourceTemplate: 源模板
     *   - targetTemplate: 目标模板
     */
    generateRegexPattern: function(sourceTemplate, targetTemplate) {
        const variables = (sourceTemplate.match(/\$\{([^}]+)\}/g) || [])
            .map(m => m.replace(/\$\{|\}/g, ''));
        
        let pattern = sourceTemplate;
        
        // 步骤1: 对所有变量占位符进行标记和保护
        const varPlaceholders = {};
        const sortedVars = sourceTemplate.match(/\$\{[^}]+\}/g) || [];
        sortedVars.forEach((placeholder, index) => {
            const varName = placeholder.replace(/\$\{|\}/g, '');
            varPlaceholders[placeholder] = { varName, index, placeholder };
            // 临时替换为特殊标记，避免被转义
            pattern = pattern.replace(placeholder, `__VAR_${index}__`);
        });
        
        // 步骤2: 对非变量的字符进行转义
        pattern = pattern
            .replace(/\./g, '\\.')
            .replace(/\$/g, '\\$')
            .replace(/\^/g, '\\^')
            .replace(/\+/g, '\\+')
            .replace(/\?/g, '\\?')
            .replace(/\*/g, '\\*')
            .replace(/\|/g, '\\|')
            .replace(/\(/g, '\\(')
            .replace(/\)/g, '\\)')
            .replace(/\[/g, '\\[')
            .replace(/\]/g, '\\]')
            .replace(/\{/g, '\\{')
            .replace(/\}/g, '\\}');
        
        // 步骤3: 还原变量占位符，但转换为正则捾获组
        sortedVars.forEach((placeholder, index) => {
            const varName = placeholder.replace(/\$\{|\}/g, '');
            let regexPart;
            
            if (varName === 'S' || varName === 'E') {
                // 季号和集号：1-2位数字
                regexPart = '(\\d{1,2})';
            } else if (varName === 'ext') {
                // 扩展名：字母数字
                regexPart = '([\\w]+)';
            } else if (varName === 'year') {
                // 年份：4位数字，可能在括号中
                regexPart = '(\\d{4})';
            } else {
                // 其他变量：非贪心匹配，可能为空
                regexPart = '([^.]*?)';
            }
            
            pattern = pattern.replace(`__VAR_${index}__`, regexPart);
        });
        
        // 步骤4: 处理空格 - 多个连续空格替换为 \s*
        pattern = pattern.replace(/\s+/g, '\\s*');
        
        return {
            pattern: '^' + pattern + '$',
            variables: variables,
            priorityVariables: ['S', 'E'].filter(v => variables.includes(v)),
            sourceTemplate: sourceTemplate,
            targetTemplate: targetTemplate
        };
    },
    
    /**
     * 辅助函数：提取文件名中的变量值（降级方法）
     * @param {string} filename - 文件名
     * @param {string} sourceTemplate - 源模板
     * @returns {object} 提取的变量及其值
     */
    extractVariablesFromFilename: function(filename, sourceTemplate) {
        let regexPattern = sourceTemplate
            .replace(/\$/g, '\\$')
            .replace(/\{/g, '\\{')
            .replace(/\}/g, '\\}');
        
        const variables = {};
        const varMatches = sourceTemplate.match(/\$\{([^}]+)\}/g) || [];
        
        varMatches.forEach((match, index) => {
            const varName = match.replace(/\$\{|\}/g, '');
            regexPattern = regexPattern.replace(
                '\\$\\{' + varName + '\\}',
                `(?<${varName}>[^.]+?)`
            );
            variables[varName] = '';
        });
        
        try {
            regexPattern = '^' + regexPattern + '$';
            const regex = new RegExp(regexPattern);
            const match = filename.match(regex);
            
            if (match && match.groups) {
                return match.groups;
            }
        } catch (e) {
            // 正则表达式匹配失败
            return variables;
        }
        
        return variables;
    },
    
    /**
     * 主函数2：基于正则式匹配文件名并生成新文件名
     * 为了最大兼容性，定义"集号(E)"、"季号+集号(SE)"为主体
     * 当主体被成功匹配时，允许返回结果，即使其他变量为空
     * 例如：E08.mkv、S02E08.mkv、E08 都是有效的返回值
     * 
     * @param {string} filename - 原文件名
     * @param {object} regexInfo - 正则式信息对象（由generateRegexPattern返回）
     * @param {number} episodeOffset - 集号偏移值，默认为 -1
     *        - 参数 < 0：保持原集号不变
     *        - 参数 = 0：改名为 E0、E1、E2...（从0开始）
     *        - 参数 > 0：改名为 E3、E4、E5...（从参数值开始）
     *        - 算法：新集号 = 原集号 - 1 + 参数（当参数 >= 0 时）
     *        
     *        验证示例：
     *        • 原集号 1，参数 -1：返回 1（原集号）✓
     *        • 原集号 1，参数 0：1 - 1 + 0 = 0 → E0 ✓
     *        • 原集号 1，参数 3：1 - 1 + 3 = 3 → E3 ✓
     *        • 原集号 8，参数 0：8 - 1 + 0 = 7 → E7 ✓  
     *        • 原集号 8，参数 3：8 - 1 + 3 = 10 → E10 ✓
     * 
     * @returns {string|null} 转换后的文件名，失败返回null
     */
    applyRegexToFilename: function(filename, regexInfo, episodeOffset = -1) {
        if (!regexInfo || !regexInfo.pattern) {
            return null;
        }
        
        try {
            // 使用生成的正则式进行匹配
            const regex = new RegExp(regexInfo.pattern, 'i');
            const match = filename.match(regex);
            
            if (!match) {
                return null;
            }
            
            // 提取变量值
            const extractedVars = {};
            const variables = regexInfo.variables || [];
            for (let i = 0; i < variables.length && i < match.length - 1; i++) {
                extractedVars[variables[i]] = match[i + 1] || '';
            }
            
            // 检查主体变量 - 集号(E)是必须的
            const hasE = variables.includes('E');
            const hasS = variables.includes('S');
            
            // 如果规则包含E，则必须匹配到E
            if (hasE && !extractedVars.E) {
                // 尝试降级匹配
                const fallbackVars = this.extractVariablesFromFilename(filename, regexInfo.sourceTemplate);
                if (!fallbackVars.E) {
                    // 未能匹配到集号，返回null
                    return null;
                }
                Object.assign(extractedVars, fallbackVars);
            }
            
            // 应用集号偏移
            if (hasE && extractedVars.E) {
                const originalEpisode = parseInt(extractedVars.E);
                if (!isNaN(originalEpisode)) {
                    if (episodeOffset >= 0) {
                        // 应用偏移算法：原集号 - 1 + 参数
                        const newEpisode = originalEpisode - 1 + episodeOffset;
                        // 保持原有的格式（如 01、001、1 等）
                        const padding = extractedVars.E.length;
                        extractedVars.E = String(newEpisode).padStart(padding, '0');
                    }
                    // 否则保持原集号不变
                }
            }
            
            // 使用目标模板进行替换
            // 关键改动：允许其他变量为空，只要集号(E)或季号+集号(SE)被匹配
            let resultFilename = regexInfo.targetTemplate;
            for (const [key, value] of Object.entries(extractedVars)) {
                // 将所有变量替换为对应的值（可以为空字符串）
                resultFilename = resultFilename.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value || '');
            }
            
            // 清理生成的文件名中可能产生的多余空格和特殊字符
            // 例如："   - S02E08.mkv" → "S02E08.mkv"
            resultFilename = resultFilename
                .replace(/^\s*-\s*/, '') // 移除前导的 "-"
                .replace(/\s{2,}/g, ' ') // 多个空格替换为单个空格
                .trim();
            
            // 验证结果不为空且包含至少主体信息（E或SE）
            if (!resultFilename) {
                return null;
            }
            
            // 检查结果中是否包含主体信息（E和/或S）
            const hasEInResult = extractedVars.E;
            const hasSInResult = extractedVars.S;
            
            // 允许返回的情况：只要有集号(E)就返回
            if (hasEInResult) {
                return resultFilename;
            }
            
            return null;
        } catch (e) {
            return null;
        }
    },
    
    /**
     * 辅助函数：验证正则式是否有效
     * @param {string} pattern - 正则式字符串
     * @returns {boolean} 正则式是否有效
     */
    validateRegexPattern: function(pattern) {
        try {
            new RegExp(pattern);
            return true;
        } catch (e) {
            return false;
        }
    }
};

// 客户端日志系统
class Logger {
    constructor() {
        this.logs = [];
        this.maxLogs = 500;
    }

    log(level, message, data = null) {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = {
            timestamp,
            level,
            message,
            data
        };
        
        this.logs.push(logEntry);
        
        // 限制日志数量
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        // 输出到控制台
        const style = {
            'info': 'color: #0066cc; font-weight: bold;',
            'debug': 'color: #888888;',
            'error': 'color: #cc0000; font-weight: bold;',
            'success': 'color: #008000; font-weight: bold;',
            'warn': 'color: #ff9900; font-weight: bold;'
        };

        const consoleMethod = level === 'error' ? 'error' : level === 'debug' ? 'log' : 'log';
        console[consoleMethod](
            `%c[${level.toUpperCase()}] ${timestamp}`,
            style[level] || 'color: #000;',
            message,
            data || ''
        );
    }

    info(msg, data) { this.log('info', msg, data); }
    debug(msg, data) { this.log('debug', msg, data); }
    error(msg, data) { this.log('error', msg, data); }
    success(msg, data) { this.log('success', msg, data); }
    warn(msg, data) { this.log('warn', msg, data); }

    getLogs(level = null) {
        if (!level) return this.logs;
        return this.logs.filter(l => l.level === level);
    }

    clear() {
        this.logs = [];
    }
}

class TMDBRenamer {
    constructor() {
        this.selectedSeries = null;
        this.selectedFiles = new Map();
        this.previewData = new Map();
        this.logger = new Logger();
        
        // 弹框状态初始化
        this.seriesModalState = {
            selectedSeries: null,
            selectedSeason: null,
            searchResults: [],
            currentSeriesData: null
        };
        
        // Phase 2 规则数据
        this.phase2Rules = {};
        this.phase2GlobalVariables = {};
        this.currentPhase2Rule = null;      // 当前选中的规则（用于编辑）
        this.selectedPhase2Rule = null;     // 最终应用的规则
        this.phase2FocusedTextarea = null;  // 追踪当前focus的textarea
        this.episodeOffset = -1;            // 集号偏移值，默认 -1（不偏移）
        
        this.logger.info('TMDB 重命名工具已初始化');
        this.init();
    }

    init() {
        this.logger.info('========== 应用初始化开始 ==========');
        
        try {
            this.logger.info('[初始化步骤 1/3] 设置事件监听器');
            this.setupEventListeners();
            this.logger.success('[初始化步骤 1/3] ✓ 完成');
        } catch (e) {
            this.logger.error('[初始化步骤 1/3] ✗ 失败', { error: e.message });
        }
        
        try {
            this.logger.info('[初始化步骤 2/3] 加载目录树');
            this.loadDirectoryTree();
            this.logger.success('[初始化步骤 2/3] ✓ 完成');
        } catch (e) {
            this.logger.error('[初始化步骤 2/3] ✗ 失败', { error: e.message });
        }
        
        try {
            this.logger.info('[初始化步骤 3/3] 检查 API 密钥和 Phase 2 状态');
            this.checkApiKey();
            this.checkPhase2Status();
            this.logger.success('[初始化步骤 3/3] ✓ 完成');
        } catch (e) {
            this.logger.error('[初始化步骤 3/3] ✗ 失败', { error: e.message });
        }
        
        this.logger.info('========== 应用初始化完成 ==========');
    }

    checkPhase2Status() {
        /**检查 Phase 2 引擎状态 */
        fetch('/api/phase2/status')
            .then(res => res.json())
            .then(data => {
                const statusDiv = document.getElementById('phase2Status');
                if (statusDiv) {
                    if (data.enabled) {
                        statusDiv.innerHTML = `<span style="color: green;">✓ 可用 (${data.rules_count} 个规则分类)</span>`;
                        this.logger.info(`✓ Phase 2 引擎已加载，${data.rules_count} 个规则分类可用`);
                    } else {
                        statusDiv.innerHTML = '<span style="color: #ff9900;">⚠️ Phase 2 暂不可用</span>';
                        this.logger.warn('⚠ Phase 2 引擎暂不可用');
                    }
                }
            })
            .catch(e => {
                const statusDiv = document.getElementById('phase2Status');
                if (statusDiv) {
                    statusDiv.innerHTML = '<span style="color: #888;">检测中...</span>';
                }
                this.logger.warn('检查 Phase 2 状态异常', { error: e.message });
            });
    }

    setupEventListeners() {
        this.logger.info('初始化事件监听器');
        
        // API密钥
        const toggleBtn = document.getElementById('toggleApiKey');
        const saveBtn = document.getElementById('saveApiKey');
        
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggleApiKey());
            this.logger.debug('✓ API密钥显示切换按钮已绑定');
        } else {
            this.logger.error('✗ toggleApiKey 元素不存在');
        }
        
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveApiKey());
            this.logger.debug('✓ API密钥保存按钮已绑定');
        } else {
            this.logger.error('✗ saveApiKey 元素不存在');
        }

        // 搜索电视剧 - searchSeries 按钮（注：seriesSearch 输入框已删除）
        const searchBtn = document.getElementById('searchSeries');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                this.logger.info('点击打开电视剧选择按钮');
                this.searchSeries();
            });
            this.logger.debug('✓ 电视剧选择按钮已绑定');
        } else {
            this.logger.error('✗ searchSeries 按钮不存在');
        }

        // 文件选择
        const refreshBtn = document.getElementById('refreshTree');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.loadDirectoryTree());
            this.logger.debug('✓ 刷新目录树按钮已绑定');
        }

        const showAllCheckbox = document.getElementById('showAllFiles');
        if (showAllCheckbox) {
            showAllCheckbox.addEventListener('change', () => this.loadDirectoryTree());
            this.logger.debug('✓ 显示所有文件复选框已绑定');
        }

        const selectAllBtn = document.getElementById('selectAll');
        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', () => this.selectAll());
            this.logger.debug('✓ 全选按钮已绑定');
        }

        const clearSelBtn = document.getElementById('clearSelection');
        if (clearSelBtn) {
            clearSelBtn.addEventListener('click', () => this.clearSelection());
            this.logger.debug('✓ 清除选择按钮已绑定');
        }

        // 重命名
        const renameBtn = document.getElementById('renameFiles');
        if (renameBtn) {
            renameBtn.addEventListener('click', () => this.confirmRename());
            this.logger.debug('✓ 重命名按钮已绑定');
        }

        // 模态框关闭按钮
        document.querySelectorAll('.modal-close').forEach((btn, idx) => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                if (modal) {
                    modal.style.display = 'none';
                    this.logger.info(`[模态框关闭] 通过关闭按钮`, { modalId: modal.id });
                }
            });
        });
        this.logger.debug(`✓ 已绑定 ${document.querySelectorAll('.modal-close').length} 个模态框关闭按钮`);

        const confirmCancelBtn = document.getElementById('confirmCancel');
        if (confirmCancelBtn) {
            confirmCancelBtn.addEventListener('click', () => {
                document.getElementById('confirmModal').style.display = 'none';
                this.logger.info('[模态框关闭] confirmModal');
            });
            this.logger.debug('✓ 确认对话框取消按钮已绑定');
        }

        const confirmRenameBtn = document.getElementById('confirmRename');
        if (confirmRenameBtn) {
            confirmRenameBtn.addEventListener('click', () => this.executeRename());
            this.logger.debug('✓ 确认重命名按钮已绑定');
        }

        const resultCloseBtn = document.getElementById('resultClose');
        if (resultCloseBtn) {
            resultCloseBtn.addEventListener('click', () => {
                document.getElementById('resultModal').style.display = 'none';
                this.logger.info('[模态框关闭] resultModal');
            });
            this.logger.debug('✓ 结果对话框关闭按钮已绑定');
        }

        // 背景点击关闭模态框
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                    this.logger.info(`[模态框关闭] 通过背景点击`, { modalId: modal.id });
                }
            });
        });
        this.logger.debug(`✓ 已为 ${document.querySelectorAll('.modal').length} 个模态框绑定背景点击关闭`);

        // Phase 2 规则管理按钮
        const phase2RulesBtn = document.getElementById('openPhase2RulesBtn');
        if (phase2RulesBtn) {
            phase2RulesBtn.addEventListener('click', () => this.openPhase2RulesModal());
            this.logger.debug('✓ Phase 2 规则管理按钮已绑定');
        } else {
            this.logger.warn('⚠ Phase 2 规则管理按钮不存在');
        }

        // Phase 2 规则弹框关闭按钮
        const phase2RulesClose = document.getElementById('phase2RulesClose');
        if (phase2RulesClose) {
            phase2RulesClose.addEventListener('click', () => {
                document.getElementById('phase2RulesModal').style.display = 'none';
                this.logger.info('[模态框关闭] phase2RulesModal');
            });
            this.logger.debug('✓ Phase 2 规则弹框关闭按钮已绑定');
        }
        
        // Phase 2 模态框拖动功能
        this.initPhase2ModalDraggable();

        // Phase 2 测试区 - 源文件名输入
        const phase2TestSourceFilename = document.getElementById('phase2TestSourceFilename');
        if (phase2TestSourceFilename) {
            phase2TestSourceFilename.addEventListener('input', () => this.updatePhase2TestPreview());
            this.logger.debug('✓ Phase 2 源文件名输入已绑定');
        }

        // Phase 2 测试区 - 手动前缀/后缀输入
        const phase2TestPrefixManual = document.getElementById('phase2TestPrefixManual');
        const phase2TestSuffixManual = document.getElementById('phase2TestSuffixManual');
        if (phase2TestPrefixManual) {
            phase2TestPrefixManual.addEventListener('input', () => this.updatePhase2TestPreview());
        }
        if (phase2TestSuffixManual) {
            phase2TestSuffixManual.addEventListener('input', () => this.updatePhase2TestPreview());
        }

        // Phase 2 测试区 - 前缀/后缀源选择（radio）
        const prefixRadios = document.querySelectorAll('input[name="phase2PrefixSource"]');
        const suffixRadios = document.querySelectorAll('input[name="phase2SuffixSource"]');
        
        prefixRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                const manualInput = document.getElementById('phase2TestPrefixManual');
                const extractedDiv = document.getElementById('phase2TestPrefixExtracted');
                if (radio.value === 'manual') {
                    manualInput.style.display = 'block';
                    extractedDiv.style.display = 'none';
                } else {
                    manualInput.style.display = 'none';
                    extractedDiv.style.display = 'block';
                }
                this.updatePhase2TestPreview();
            });
        });

        suffixRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                const manualInput = document.getElementById('phase2TestSuffixManual');
                const extractedDiv = document.getElementById('phase2TestSuffixExtracted');
                if (radio.value === 'manual') {
                    manualInput.style.display = 'block';
                    extractedDiv.style.display = 'none';
                } else {
                    manualInput.style.display = 'none';
                    extractedDiv.style.display = 'block';
                }
                this.updatePhase2TestPreview();
            });
        });

        // Phase 2 确认并关闭按钮
        const phase2ConfirmRules = document.getElementById('phase2ConfirmRules');
        if (phase2ConfirmRules) {
            phase2ConfirmRules.addEventListener('click', () => {
                if (this.currentPhase2Rule) {
                    const rule = this.currentPhase2Rule.rule;
                    
                    // 保存选中的规则及其正则式到程序中
                    this.selectedPhase2Rule = {
                        category: this.currentPhase2Rule.category,
                        ruleIndex: this.currentPhase2Rule.ruleIndex,
                        ruleName: rule.name,
                        ruleId: rule.id,
                        sourceTemplate: rule.sourceTemplate,
                        targetTemplate: rule.targetTemplate,
                        extractionStrategy: rule.extractionStrategy,
                        generatedRegex: rule.generatedRegex,
                        extractedVariables: rule.extractedVariables,
                        description: rule.description
                    };
                    
                    this.showStatus(`✓ 已确认并应用规则: ${rule.name}（包含智能正则式）`, 'success');
                    this.logger.info('规则已确认并保存', { rule: this.selectedPhase2Rule });
                    document.getElementById('phase2RulesModal').style.display = 'none';
                } else {
                    this.showStatus('请先选择一个规则后再确认', 'warning');
                }
            });
            this.logger.debug('✓ Phase 2 确认按钮已绑定');
        }
        
        this.logger.success('事件监听器初始化完成');
    }

    // API密钥管理
    toggleApiKey() {
        const input = document.getElementById('apiKey');
        const btn = document.getElementById('toggleApiKey');
        if (input.type === 'password') {
            input.type = 'text';
            btn.textContent = '🙈';
        } else {
            input.type = 'password';
            btn.textContent = '👁️';
        }
    }

    async checkApiKey() {
        this.logger.info('[初始化] 检查 API Key 状态...');
        try {
            this.logger.debug('发送请求到: /api/get-api-key');
            const res = await fetch('/api/get-api-key');
            
            this.logger.debug(`API响应状态码: ${res.status}`);
            
            if (!res.ok) {
                this.logger.error(`HTTP错误: ${res.status} ${res.statusText}`);
                this.showStatus('检查 API 密钥失败 (HTTP错误)', 'error', 'apiKeyStatus');
                return;
            }
            
            const data = await res.json();
            this.logger.debug('API响应数据', data);
            
            if (data.has_api_key) {
                this.logger.success('✓ 已检测到保存的 API 密钥');
                this.showStatus('✓ 已保存 API 密钥', 'success', 'apiKeyStatus');
                
                const apiKeyInput = document.getElementById('apiKey');
                if (apiKeyInput) {
                    apiKeyInput.value = data.api_key;
                    this.logger.info(`✓ API Key 已自动填充 (${data.api_key.substring(0, 10)}...)`);
                } else {
                    this.logger.error('apiKey 输入框不存在');
                }
            } else {
                this.logger.warn('⚠ 未检测到保存的 API 密钥');
                this.showStatus('请设置 API 密钥', 'warning', 'apiKeyStatus');
            }
        } catch (e) {
            this.logger.error('[初始化] 检查 API 密钥异常', { error: e.message, stack: e.stack });
            this.showStatus('检查 API 密钥失败: ' + e.message, 'error', 'apiKeyStatus');
        }
    }

    async saveApiKey() {
        const apiKey = document.getElementById('apiKey').value.trim();

        if (!apiKey) {
            this.showStatus('请输入 API 密钥', 'error', 'apiKeyStatus');
            return;
        }

        try {
            const res = await fetch('/api/save-api-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: apiKey })
            });
            const data = await res.json();

            if (data.success) {
                this.showStatus('✓ API 密钥已保存', 'success', 'apiKeyStatus');
            } else {
                this.showStatus('✗ ' + (data.error || '保存失败'), 'error', 'apiKeyStatus');
            }
        } catch (e) {
            this.showStatus('✗ 保存失败: ' + e.message, 'error', 'apiKeyStatus');
        }
    }

    // 搜索电视剧（打开弹框）
    searchSeries() {
        this.logger.info('[主页面] 用户点击"打开电视剧选择"按钮');
        try {
            this.openSeriesSelectionModal('');
        } catch (e) {
            this.logger.error('[主页面] 打开弹框异常', { error: e.message, stack: e.stack });
        }
    }

    // 格式分析
    // 目录树管理
    async loadDirectoryTree() {
        try {
            const res = await fetch('/api/directory-tree');
            const tree = await res.json();

            if (tree.error) {
                document.getElementById('originalTreeContainer').innerHTML = 
                    `<div class="loading">错误: ${tree.error}</div>`;
                return;
            }

            const treeHtml = this.buildTreeHtml(tree);
            document.getElementById('originalTreeContainer').innerHTML = treeHtml;

            // 添加点击事件
            this.setupTreeNodeEvents();
        } catch (e) {
            document.getElementById('originalTreeContainer').innerHTML = 
                `<div class="loading">加载失败: ${e.message}</div>`;
        }
    }

    buildTreeHtml(node, showAll = false) {
        const isFile = node.type === 'file';
        const showAllFiles = document.getElementById('showAllFiles').checked;

        if (isFile) {
            return `
                <div class="tree-node" data-path="${this.escapeAttr(node.path)}">
                    <div class="tree-node-label">
                        <span class="tree-node-icon">📄</span>
                        <span class="tree-node-name">${this.escapeHtml(node.name)}</span>
                        <span class="tree-node-size">${this.formatFileSize(node.size)}</span>
                    </div>
                    <div class="tree-node-path">${this.escapeHtml(node.path)}</div>
                </div>
            `;
        }

        let childrenHtml = '';
        if (node.children && node.children.length > 0) {
            const children = showAllFiles ? node.children : 
                node.children.filter(c => c.type === 'file' || c.children?.length > 0);
            
            childrenHtml = children.map(child => this.buildTreeHtml(child, showAll)).join('');
        }

        const hasChildren = childrenHtml.length > 0;

        return `
            <div class="tree-node">
                <div class="tree-node-label">
                    <span class="tree-node-icon">${hasChildren ? '📁' : '📂'}</span>
                    <span class="tree-node-name">${this.escapeHtml(node.name)}</span>
                </div>
                <div class="tree-node-path">${this.escapeHtml(node.path)}</div>
                ${childrenHtml ? `<div class="tree-children">${childrenHtml}</div>` : ''}
            </div>
        `;
    }

    setupTreeNodeEvents() {
        document.querySelectorAll('[data-path]').forEach(node => {
            node.addEventListener('click', (e) => {
                e.stopPropagation();
                const path = node.getAttribute('data-path');
                const isFile = path.includes('.');

                if (isFile) {
                    this.selectFile(path, node);
                }
            });
        });
    }

    // 文件选择
    selectFile(path, element) {
        if (this.selectedFiles.has(path)) {
            this.selectedFiles.delete(path);
            element.querySelector('.tree-node-label').classList.remove('selected');
        } else {
            this.selectedFiles.set(path, true);
            element.querySelector('.tree-node-label').classList.add('selected');
        }

        this.updateSelectedCount();
        this.generatePreviews();
    }

    selectAll() {
        document.querySelectorAll('[data-path]').forEach(node => {
            const path = node.getAttribute('data-path');
            if (path.includes('.')) {
                this.selectedFiles.set(path, true);
                node.querySelector('.tree-node-label').classList.add('selected');
            }
        });
        this.updateSelectedCount();
        this.generatePreviews();
    }

    clearSelection() {
        this.selectedFiles.clear();
        document.querySelectorAll('.tree-node-label.selected').forEach(el => {
            el.classList.remove('selected');
        });
        this.updateSelectedCount();
    }

    updateSelectedCount() {
        const count = this.selectedFiles.size;
        document.getElementById('selectedCount').textContent = count;
        document.getElementById('renameFiles').disabled = count === 0;

        if (count > 0) {
            document.getElementById('selectAll').style.display = 'inline-block';
            document.getElementById('clearSelection').style.display = 'inline-block';
        }
    }

    // 预览生成
    async generatePreviews() {
        const fileList = document.getElementById('fileList');
        fileList.innerHTML = '';

        if (this.selectedFiles.size === 0) {
            fileList.innerHTML = '<div class="empty-state"><p>选择要重命名的文件</p></div>';
            return;
        }

        const count = Math.min(this.selectedFiles.size, parseInt(document.getElementById('previewCount').value));
        let processed = 0;

        for (const [path] of this.selectedFiles) {
            if (processed >= count) break;
            await this.previewFile(path, fileList);
            processed++;
        }
    }

    async previewFile(path, container) {
        if (!this.selectedSeries) {
            this.showStatus('请先选择电视剧', 'warning');
            return;
        }

        const filename = path.split('/').pop();

        try {
            const params = new URLSearchParams({
                filename: filename,
                series_name: this.selectedSeries.name,
                series_id: this.selectedSeries.id
            });

            const res = await fetch(`/api/preview-rename?${params}`);
            const data = await res.json();

            if (data.error) {
                this.addFileItem(container, filename, `错误: ${data.error}`, false);
                return;
            }

            this.previewData.set(path, data);
            this.addFileItem(container, filename, data.new_name, true);
        } catch (e) {
            this.addFileItem(container, filename, `失败: ${e.message}`, false);
        }
    }

    addFileItem(container, original, newName, success) {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.innerHTML = `
            <input type="checkbox" class="file-checkbox" checked>
            <div class="file-item-content">
                <div class="file-item-name">📄 ${this.escapeHtml(original)}</div>
                <div class="file-item-preview">
                    → <span class="file-item-new">${this.escapeHtml(newName)}</span>
                </div>
            </div>
        `;

        if (!success) {
            item.style.opacity = '0.5';
            item.querySelector('input').disabled = true;
        }

        container.appendChild(item);
    }

    updatePreviews() {
        if (this.selectedFiles.size > 0) {
            this.generatePreviews();
        }
    }

    // 重命名执行
    confirmRename() {
        const count = this.selectedFiles.size;

        if (count === 0) {
            this.showStatus('请先选择文件', 'warning');
            return;
        }

        const modal = document.getElementById('confirmModal');
        document.getElementById('confirmCount').textContent = count;

        const confirmList = document.getElementById('confirmList');
        confirmList.innerHTML = '';

        let processed = 0;
        for (const [path] of this.selectedFiles) {
            if (processed >= 20) break;

            const preview = this.previewData.get(path);
            if (preview) {
                const item = document.createElement('div');
                item.className = 'confirm-item';
                item.innerHTML = `
                    <div class="confirm-original">${this.escapeHtml(preview.original)}</div>
                    <div class="confirm-arrow">↓</div>
                    <div class="confirm-new">${this.escapeHtml(preview.new_name)}</div>
                `;
                confirmList.appendChild(item);
            }

            processed++;
        }

        if (count > 20) {
            const more = document.createElement('div');
            more.className = 'confirm-item';
            more.textContent = `... 及 ${count - 20} 个其他文件`;
            confirmList.appendChild(more);
        }

        modal.style.display = 'flex';
    }

    async executeRename() {
        const files = [];

        for (const [path] of this.selectedFiles) {
            const preview = this.previewData.get(path);
            if (preview) {
                files.push({
                    original_path: path,
                    new_name: preview.new_name
                });
            }
        }

        try {
            const res = await fetch('/api/rename-files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: files })
            });
            const result = await res.json();

            document.getElementById('confirmModal').style.display = 'none';

            // 显示结果
            document.getElementById('resultSuccess').textContent = result.success || 0;
            document.getElementById('resultFailed').textContent = result.failed || 0;

            const errorsList = document.getElementById('resultErrors');
            errorsList.innerHTML = '';

            if (result.errors && result.errors.length > 0) {
                result.errors.slice(0, 10).forEach(error => {
                    const item = document.createElement('div');
                    item.className = 'error-item';
                    item.textContent = error;
                    errorsList.appendChild(item);
                });
            }

            document.getElementById('resultModal').style.display = 'flex';

            // 刷新目录树
            setTimeout(() => this.loadDirectoryTree(), 1000);

            // 清除选择
            this.clearSelection();
        } catch (e) {
            this.showStatus('✗ 重命名失败: ' + e.message, 'error');
        }
    }

    // 工具函数
    showStatus(message, type = 'info', elementId = 'apiKeyStatus') {
        const el = document.getElementById(elementId);
        if (!el) return;

        el.textContent = message;
        el.className = `status-message ${type}`;

        if (type !== 'error') {
            setTimeout(() => {
                el.className = 'status-message';
            }, 3000);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    escapeAttr(text) {
        return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    formatFileSize(bytes) {
        if (!bytes) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIdx = 0;

        while (size >= 1024 && unitIdx < units.length - 1) {
            size /= 1024;
            unitIdx++;
        }

        return `${size.toFixed(1)} ${units[unitIdx]}`;
    }

    // ========== 电视剧选择弹框功能 ==========

    openSeriesSelectionModal(initialQuery = '') {
        this.logger.info('[弹框] 打开电视剧选择弹框');
        
        try {
            const modal = document.getElementById('seriesSelectionModal');
            if (!modal) {
                this.logger.error('[弹框] ✗ seriesSelectionModal 元素不存在');
                return;
            }
            
            modal.style.display = 'flex';
            this.logger.debug('[弹框] ✓ display 设为 flex');
            
            // 只清空选择状态，保留搜索结果
            this.clearSeriesSelectionOnly();
            this.logger.debug('[弹框] 清空了选择，但保留搜索记录');
            
            const searchInput = document.getElementById('seriesSearchInput');
            if (!searchInput) {
                this.logger.error('[弹框] ✗ seriesSearchInput 输入框不存在');
                return;
            }
            
            // 若有新查询则替换，否则保留之前的搜索词
            if (initialQuery.trim()) {
                searchInput.value = initialQuery.trim();
                this.logger.debug('[弹框] 搜索框已填充新查询词', { initialQuery });
            }
            
            searchInput.focus();
            this.logger.debug('[弹框] ✓ 搜索输入框已获焦');

            // 如果有初始查询，自动搜索
            if (initialQuery.trim()) {
                this.logger.info('[弹框] 自动执行搜索', { query: initialQuery });
                setTimeout(() => {
                    this.searchSeriesInModal(initialQuery);
                }, 100);
            }
            
            this.logger.success('[弹框] 打开完成');
        } catch (e) {
            this.logger.error('[弹框] 打开异常', { error: e.message, stack: e.stack });
        }
    }

    // 仅清空选择状态，保留搜索结果
    clearSeriesSelectionOnly() {
        this.logger.debug('[弹框] 清空选择状态（保留搜索结果）');
        try {
            this.seriesModalState.selectedSeries = null;
            this.seriesModalState.selectedSeason = null;
            this.seriesModalState.currentSeriesData = null;

            const seasonListContainer = document.getElementById('seasonListContainer');
            const seriesDetailsContainer = document.getElementById('seriesDetailsContainer');
            const confirmBtn = document.getElementById('seriesSelectConfirm');
            
            if (seasonListContainer) {
                seasonListContainer.innerHTML = '<div class="empty-state">选择一个电视剧</div>';
            }
            
            if (seriesDetailsContainer) {
                seriesDetailsContainer.innerHTML = '<div class="empty-state">选择一个电视剧和季份</div>';
            }
            
            if (confirmBtn) {
                confirmBtn.disabled = true;
            }
            
            this.logger.debug('[弹框] ✓ 选择状态已清空');
        } catch (e) {
            this.logger.error('[弹框] 清空选择状态异常', { error: e.message });
        }
    }

    clearSeriesModalState(clearSearchResults = true) {
        this.logger.debug('[弹框] 清空全部状态', { clearSearchResults });
        try {
            this.seriesModalState = {
                selectedSeries: null,
                selectedSeason: null,
                searchResults: clearSearchResults ? [] : this.seriesModalState.searchResults || [],
                currentSeriesData: null
            };

            const seriesListContainer = document.getElementById('seriesListContainer');
            const seasonListContainer = document.getElementById('seasonListContainer');
            const seriesDetailsContainer = document.getElementById('seriesDetailsContainer');
            const confirmBtn = document.getElementById('seriesSelectConfirm');
            
            if (clearSearchResults) {
                if (seriesListContainer) {
                    seriesListContainer.innerHTML = '<div class="empty-state">输入名称后点击搜索</div>';
                }
            }
            
            if (seasonListContainer) {
                seasonListContainer.innerHTML = '<div class="empty-state">选择一个电视剧</div>';
            }
            
            if (seriesDetailsContainer) {
                seriesDetailsContainer.innerHTML = '<div class="empty-state">选择一个电视剧和季份</div>';
            }
            
            if (confirmBtn) {
                confirmBtn.disabled = true;
            }
            
            this.logger.debug('[弹框] ✓ 状态清空完成', { cleared: clearSearchResults });
        } catch (e) {
            this.logger.error('[弹框] 清空状态异常', { error: e.message });
        }
    }

    async searchSeriesInModal(query) {
        if (!query.trim()) {
            this.logger.warn('搜索词为空');
            document.getElementById('seriesListContainer').innerHTML = '<div class="empty-state">输入名称后点击搜索</div>';
            return;
        }

        this.logger.info('[弹框搜索] 开始', { query });
        document.getElementById('seriesListContainer').innerHTML = '<div class="loading">搜索中...</div>';

        try {
            const apiUrl = `/api/search-series?q=${encodeURIComponent(query)}`;
            this.logger.debug(`[网络请求] 发送GET请求`, { url: apiUrl });
            
            const res = await fetch(apiUrl);
            
            this.logger.debug(`[网络响应] 状态码: ${res.status}`, { ok: res.ok });
            
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            }
            
            const data = await res.json();
            this.logger.debug(`[API数据] 接收完成`, { hasError: !!data.error, hasResults: !!data.results });

            if (data.error) {
                this.logger.error('[搜索失败] API返回错误', { error: data.error });
                document.getElementById('seriesListContainer').innerHTML = 
                    `<div class="empty-state">错误: ${data.error}</div>`;
                return;
            }

            const results = data.results || [];
            this.logger.info(`[搜索结果] 共找到 ${results.length} 部电视剧`, { query, count: results.length });

            if (results.length === 0) {
                document.getElementById('seriesListContainer').innerHTML = 
                    '<div class="empty-state">未找到匹配的电视剧</div>';
                return;
            }

            this.logger.success('[搜索完成] 结果已显示', { count: results.length });
            this.seriesModalState.searchResults = results;

            const seriesHtml = results.map((series, idx) => `
                <div class="series-list-item" data-series-idx="${idx}">
                    <div class="series-list-item-name">${this.escapeHtml(series.name)}</div>
                    <div class="series-list-item-meta">
                        ${series.first_air_date ? series.first_air_date.substring(0, 4) : 'N/A'}
                    </div>
                </div>
            `).join('');

            document.getElementById('seriesListContainer').innerHTML = seriesHtml;
            this.logger.debug('[DOM更新] 搜索结果HTML已插入');

            // 添加点击事件
            const items = document.querySelectorAll('.series-list-item');
            this.logger.debug(`[事件绑定] 为 ${items.length} 项添加点击事件`);
            
            items.forEach(item => {
                item.addEventListener('click', () => {
                    const idx = parseInt(item.dataset.seriesIdx);
                    this.logger.info(`[项目点击] 用户点击了第 ${idx} 个电视剧`);
                    this.selectSeriesInModal(results[idx], idx);
                });
            });

        } catch (e) {
            this.logger.error('[搜索异常] 网络或解析错误', { error: e.message, query, stack: e.stack });
            document.getElementById('seriesListContainer').innerHTML = 
                `<div class="empty-state">搜索失败: ${e.message}</div>`;
        }
    }

    selectSeriesInModal(series, idx) {
        this.logger.info('选择电视剧', { name: series.name, id: series.id });
        
        // 更新选中状态
        document.querySelectorAll('.series-list-item').forEach((item, i) => {
            if (i === idx) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });

        this.seriesModalState.selectedSeries = series;
        this.seriesModalState.selectedSeason = null;

        // 获取季份信息并显示季份列表
        this.loadSeasonsInModal(series.id);
        this.displaySeriesDetails(series);
    }

    async loadSeasonsInModal(seriesId) {
        this.logger.info('加载电视剧季份信息', { seriesId });
        document.getElementById('seasonListContainer').innerHTML = '<div class="loading">加载季份中...</div>';

        try {
            // 获取电视剧详细信息，包括季份列表
            const res = await fetch(`/api/series-details?series_id=${seriesId}`);
            const data = await res.json();

            if (data.error) {
                this.logger.error('加载季份失败', { seriesId, error: data.error });
                document.getElementById('seasonListContainer').innerHTML = 
                    `<div class="empty-state">加载失败: ${data.error}</div>`;
                return;
            }

            this.seriesModalState.currentSeriesData = data;

            const seasons = data.seasons || [];

            if (seasons.length === 0) {
                this.logger.warn('无季份数据', { seriesId });
                document.getElementById('seasonListContainer').innerHTML = 
                    '<div class="empty-state">无季份数据</div>';
                return;
            }

            this.logger.success('加载季份成功', { seriesId, seasonCount: seasons.length });

            const seasonsHtml = seasons.map((season, idx) => `
                <div class="season-item" data-season-idx="${idx}">
                    <div class="season-item-name">第 ${season.season_number} 季</div>
                    <div class="season-item-episodes">${season.episode_count || 0} 集</div>
                </div>
            `).join('');

            document.getElementById('seasonListContainer').innerHTML = seasonsHtml;

            // 添加点击事件
            document.querySelectorAll('.season-item').forEach(item => {
                item.addEventListener('click', () => {
                    const idx = parseInt(item.dataset.seasonIdx);
                    this.selectSeasonInModal(seasons[idx], idx);
                });
            });

        } catch (e) {
            this.logger.error('加载季份异常', { seriesId, error: e.message });
            document.getElementById('seasonListContainer').innerHTML = 
                `<div class="empty-state">加载失败: ${e.message}</div>`;
        }
    }

    async selectSeasonInModal(season, idx) {
        this.logger.info('[季份选择] 用户选择了季份', { season: season.season_number, episodes: season.episode_count });
        
        try {
            // 更新选中状态
            document.querySelectorAll('.season-item').forEach((item, i) => {
                if (i === idx) {
                    item.classList.add('selected');
                    this.logger.debug(`[季份选择] 第${idx}项已高亮`);
                } else {
                    item.classList.remove('selected');
                }
            });

            this.seriesModalState.selectedSeason = season;
            
            // 异步加载季份详情和集名
            await this.displaySeasonDetails(season);

            // 启用确认按钮
            if (this.seriesModalState.selectedSeries && this.seriesModalState.selectedSeason) {
                document.getElementById('seriesSelectConfirm').disabled = false;
                this.logger.debug('[季份选择] ✓ 确认按钮已启用');
            }
        } catch (e) {
            this.logger.error('[季份选择] 异常', { error: e.message });
        }
    }

    displaySeriesDetails(series) {
        const html = `
            <div class="series-details-content">
                <div class="series-details-title">${this.escapeHtml(series.name)}</div>
                <div class="series-details-item">
                    <div class="series-details-label">首映日期</div>
                    <div class="series-details-value">${series.first_air_date || 'N/A'}</div>
                </div>
                <div class="series-details-item">
                    <div class="series-details-label">TMDB ID</div>
                    <div class="series-details-value">${series.id}</div>
                </div>
                <div class="series-details-item">
                    <div class="series-details-label">简介</div>
                    <div class="series-details-value">${this.escapeHtml(series.overview || '暂无介绍')}</div>
                </div>
            </div>
        `;

        document.getElementById('seriesDetailsContainer').innerHTML = html;
    }

    async displaySeasonDetails(season) {
        const seriesName = this.seriesModalState.selectedSeries.name;
        const seriesId = this.seriesModalState.selectedSeries.id;
        const seasonNumber = season.season_number;
        const episodeCount = season.episode_count || 0;

        this.logger.info('[季份详情] 开始加载', { 
            series: seriesName, 
            seasonNumber,
            episodeCount
        });

        const html = `
            <div class="series-details-content">
                <div class="series-details-title">${this.escapeHtml(seriesName)}</div>
                <div class="series-details-item">
                    <div class="series-details-label">季号</div>
                    <div class="series-details-value">第 ${seasonNumber} 季</div>
                </div>
                <div class="series-details-item">
                    <div class="series-details-label">集数</div>
                    <div class="series-details-value">${episodeCount} 集</div>
                </div>
                <div class="series-details-item">
                    <div class="series-details-label">集详情</div>
                    <div class="episode-list-container" id="episodeListPlaceholder">
                        <div class="loading">加载集名信息中...</div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('seriesDetailsContainer').innerHTML = html;
        this.logger.debug('[季份详情] HTML已渲染');

        // 异步获取每集详细信息
        await this.generateEpisodesListWithNames(seriesId, seasonNumber, episodeCount);
    }

    async generateEpisodesListWithNames(seriesId, seasonNumber, episodeCount) {
        this.logger.info('[集号列表] 开始获取每集集名', { seriesId, seasonNumber, episodeCount });
        
        try {
            const apiUrl = `/api/get-episodes?series_id=${seriesId}&season=${seasonNumber}`;
            this.logger.debug('[网络请求] 获取集名', { url: apiUrl });
            
            const res = await fetch(apiUrl);
            
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            
            const data = await res.json();
            const episodes = data.episodes || [];
            
            this.logger.info('[集名数据] 获取成功', { count: episodes.length });

            let html = '';
            for (let i = 1; i <= episodeCount; i++) {
                const episode = episodes.find(ep => ep.episode_number === i);
                const episodeName = episode ? episode.name : `第 ${i} 集`;
                const displayNum = String(seasonNumber).padStart(2, '0') + String(i).padStart(2, '0');
                
                html += `
                    <div class="episode-item" title="${this.escapeHtml(episodeName)}">
                        <span class="episode-item-number">S${displayNum}</span>
                        <span class="episode-item-name">${this.escapeHtml(episodeName)}</span>
                    </div>
                `;
            }

            const container = document.getElementById('episodeListPlaceholder');
            if (container) {
                container.innerHTML = html;
                this.logger.success('[集号列表] 已渲染完整集名');
            }
        } catch (e) {
            this.logger.warn('[集号列表] 获取集名失败，显示默认格式', { error: e.message });
            
            // 如果API失败，使用默认格式（仅集号）
            let html = '';
            for (let i = 1; i <= episodeCount; i++) {
                const displayNum = String(seasonNumber).padStart(2, '0') + String(i).padStart(2, '0');
                html += `
                    <div class="episode-item">
                        <span class="episode-item-number">S${displayNum}</span>
                        <span class="episode-item-name">第 ${i} 集</span>
                    </div>
                `;
            }
            
            const container = document.getElementById('episodeListPlaceholder');
            if (container) {
                container.innerHTML = html;
            }
        }
    }

    generateEpisodesList(seasonNumber, episodeCount) {
        this.logger.info('生成集号列表', { seasonNumber, episodeCount });
        
        let html = '';
        for (let i = 1; i <= episodeCount; i++) {
            const displayNum = String(seasonNumber).padStart(2, '0') + String(i).padStart(2, '0');
            html += `
                <div class="episode-item">
                    <span class="episode-item-number">S${displayNum}</span>
                    <span class="episode-item-name">第 ${i} 集</span>
                </div>
            `;
        }
        
        this.logger.debug('集号列表已生成', { count: episodeCount, sample: html.substring(0, 100) });
        return html;
    }

    confirmSeriesSelection() {
        const selected = this.seriesModalState.selectedSeries;
        const season = this.seriesModalState.selectedSeason;

        if (!selected || !season) {
            this.logger.warn('确认选择失败', { reason: '未选择电视剧或季份' });
            this.showStatus('请选择电视剧和季份', 'error');
            return;
        }

        // 保存选择到 selectedSeries 属性
        this.selectedSeries = {
            ...selected,
            selected_season: season.season_number
        };

        this.logger.success('电视剧选择已确认', { 
            series: selected.name, 
            season: season.season_number 
        });

        // 更新左侧面板显示"已选择"部分
        const selectedSeriesDiv = document.getElementById('selectedSeries');
        document.getElementById('selectedSeriesName').textContent = 
            `${selected.name} - 第 ${season.season_number} 季 (ID: ${selected.id})`;
        document.getElementById('selectedSeriesDate').textContent = 
            `首映: ${selected.first_air_date || 'N/A'}`;
        
        // 显示"已选择"部分
        selectedSeriesDiv.style.display = 'block';
        this.logger.success('[已选择] ✓ 已显示选择的电视剧和季份');

        // 关闭弹框
        document.getElementById('seriesSelectionModal').style.display = 'none';

        this.showStatus('✓ 已选择: ' + selected.name, 'success');
    }

    // ==================== Phase 2 规则管理 ====================
    
    async openPhase2RulesModal() {
        this.logger.info('打开 Phase 2 规则管理弹框');
        const modal = document.getElementById('phase2RulesModal');
        if (!modal) {
            this.logger.error('phase2RulesModal 元素不存在');
            return;
        }
        
        modal.style.display = 'block';
        
        // 加载规则分类和状态
        try {
            await this.loadPhase2Rules();
            
            // 初始化右侧面板：始终显示，默认显示占位提示
            document.getElementById('phase2NoRuleSelected').style.display = 'flex';
            document.getElementById('phase2RuleSelected').style.display = 'none';
            this.currentPhase2Rule = null;
            
            // 初始化分类操作的事件监听
            this.initPhase2CategoryOperations();
            
            // 初始化规则操作的事件监听
            this.initPhase2RuleOperations();
            
            const statusDiv = document.getElementById('phase2Status');
            if (statusDiv) {
                statusDiv.innerHTML = '<span style="color: green;">✓ Phase 2 规则管理系统已就绪</span>';
            }
            

        } catch (e) {
            this.logger.error('加载 Phase 2 规则失败', { error: e.message });
            const statusDiv = document.getElementById('phase2Status');
            if (statusDiv) {
                statusDiv.innerHTML = '<span style="color: red;">✗ Phase 2 规则加载失败: ' + e.message + '</span>';
            }
        }
    }



    async loadPhase2Rules() {
        this.logger.info('加载 Phase 2 规则信息');
        try {
            const res = await fetch('/api/phase2/rules');
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            
            const data = await res.json();
            this.logger.info('Phase 2 规则加载成功', { categories: Object.keys(data.rules || {}) });
            
            // 保存数据到实例变量供后续使用
            this.phase2Rules = data.rules || {};
            this.phase2GlobalVariables = data.globalVariables || {};
            
            // 更新规则分类列表
            this.updatePhase2CategoriesList(data.rules, data.globalVariables);
        } catch (e) {
            this.logger.error('加载 Phase 2 规则异常', { error: e.message });
            throw e;
        }
    }

    updatePhase2CategoriesList(rules, globalVariables) {
        const container = document.getElementById('phase2CategoriesList');
        if (!container) return;
        
        if (!rules || Object.keys(rules).length === 0) {
            container.innerHTML = '<p class="empty-state">没有可用的规则分类</p>';
            return;
        }
        
        // 生成分类按钮（左列）
        let html = '';
        for (const [category, ruleList] of Object.entries(rules)) {
            const count = Array.isArray(ruleList) ? ruleList.length : 0;
            html += `
                <button class="category-btn" onclick="app.selectPhase2Category('${category}'); return false;" 
                    style="padding: 10px; margin: 0; border: 1px solid #ddd; border-radius: 4px; 
                           background: #f9f9f9; cursor: pointer; text-align: left; width: 100%;
                           transition: all 0.2s ease;"
                    onmouseover="if (!this.classList.contains('selected')) this.style.background='#e8e8e8'; if (!this.classList.contains('selected')) this.style.borderColor='#0066cc';"
                    onmouseout="if (!this.classList.contains('selected')) { this.style.background='#f9f9f9'; this.style.borderColor='#ddd'; }"
                    data-category="${category}">
                    <div><strong>${category}</strong></div>
                    <div style="font-size: 12px; color: #888; margin-top: 4px;">${count} 条规则</div>
                </button>
            `;
        }
        container.innerHTML = html;
    }

    selectPhase2Category(category) {
        this.logger.info(`选择 Phase 2 规则分类: ${category}`);
        
        // 高亮选中的分类
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.classList.remove('selected');
            btn.style.background = '#f9f9f9';
            btn.style.borderColor = '#ddd';
            btn.style.fontWeight = 'normal';
        });
        const selectedBtn = Array.from(document.querySelectorAll('.category-btn'))
            .find(btn => btn.querySelector('div strong').textContent === category);
        if (selectedBtn) {
            selectedBtn.classList.add('selected');
            selectedBtn.style.background = '#bbdefb';
            selectedBtn.style.borderColor = '#0066cc';
            selectedBtn.style.fontWeight = 'bold';
        }
        
        // 在中列显示该分类的规则列表（只显示 name）
        const rulesList = document.getElementById('phase2RulesList');
        if (rulesList) {
            const rules = this.phase2Rules[category] || [];
            if (Array.isArray(rules) && rules.length > 0) {
                let html = '';
                rules.forEach((rule, index) => {
                    html += `
                        <button class="rule-name-btn" data-category="${category}" data-index="${index}" 
                            style="padding: 10px; margin: 0 0 6px 0; border: 1px solid #ddd; border-radius: 4px;
                                   background: #fff; cursor: pointer; text-align: left; width: 100%;
                                   transition: all 0.2s ease;"
                            onmouseover="if (!this.classList.contains('selected')) this.style.background='#f0f0f0'; if (!this.classList.contains('selected')) this.style.borderColor='#0066cc';"
                            onmouseout="if (!this.classList.contains('selected')) { this.style.background='#fff'; this.style.borderColor='#ddd'; }"
                            onclick="app.selectPhase2Rule('${category}', ${index}); return false;">
                            <div style="font-size: 14px; word-break: break-word;">${rule.name}</div>
                            <div style="font-size: 11px; color: #999; margin-top: 4px;">ID: ${rule.id}</div>
                        </button>
                    `;
                });
                rulesList.innerHTML = html;
            } else {
                rulesList.innerHTML = '<div class="empty-state">该分类下没有规则</div>';
            }
        }
        
        // 清空右侧面板，显示占位提示
        document.getElementById('phase2NoRuleSelected').style.display = 'flex';
        document.getElementById('phase2RuleSelected').style.display = 'none';
        // 清除当前选中的规则
        this.currentPhase2Rule = null;
    }
    
    selectPhase2Rule(category, ruleIndex) {
        this.logger.info(`选择规则: ${category} - 规则 ${ruleIndex}`);
        
        const rules = this.phase2Rules[category] || [];
        if (ruleIndex < 0 || ruleIndex >= rules.length) {
            this.logger.error('规则索引无效');
            return;
        }
        
        // 显示规则详情，隐藏占位提示
        document.getElementById('phase2NoRuleSelected').style.display = 'none';
        document.getElementById('phase2RuleSelected').style.display = 'flex';
        
        const rule = rules[ruleIndex];
        this.currentPhase2Rule = { category, ruleIndex, rule };
        
        // 清除所有规则的选中样式
        document.querySelectorAll('.rule-name-btn').forEach(btn => {
            btn.classList.remove('selected');
            btn.style.background = '#fff';
            btn.style.borderColor = '#ddd';
            btn.style.fontWeight = 'normal';
        });
        
        // 高亮选中的规则
        const selectedBtn = document.querySelector(`.rule-name-btn[data-category="${category}"][data-index="${ruleIndex}"]`);
        if (selectedBtn) {
            selectedBtn.classList.add('selected');
            selectedBtn.style.background = '#bbdefb';
            selectedBtn.style.borderColor = '#0066cc';
            selectedBtn.style.fontWeight = 'bold';
        }
        
        // 保存当前的测试文件名（不清空）
        const currentTestFilename = document.getElementById('phase2TestSourceFilename').value.trim();
        
        // 仅在没有测试文件名时重置结果显示
        if (!currentTestFilename) {
            document.getElementById('phase2TestResultFilename').textContent = '[等待输入]';
            document.getElementById('phase2TestResultFilename').style.color = '#999';
        }
        
        // 初始化变量状态存储（用于保留手动输入）
        this.ph2VariableValues = {};
        
        // 根据源模板和目标模板生成正则式（使用规则引擎）
        const regexInfo = Phase2RuleEngine.generateRegexPattern(rule.sourceTemplate, rule.targetTemplate);
        rule.generatedRegex = regexInfo.pattern;
        rule.extractedVariables = regexInfo.variables;
        this.logger.debug('生成的正则式', { pattern: regexInfo.pattern, variables: regexInfo.variables });
        
        // 添加textarea的focus事件监听，用于追踪当前focus的textarea
        setTimeout(() => {
            const sourceTextarea = document.getElementById('phase2DetailSource');
            const targetTextarea = document.getElementById('phase2DetailTarget');
            
            if (sourceTextarea) {
                sourceTextarea.addEventListener('focus', () => {
                    this.phase2FocusedTextarea = sourceTextarea;
                });
            }
            if (targetTextarea) {
                targetTextarea.addEventListener('focus', () => {
                    this.phase2FocusedTextarea = targetTextarea;
                });
            }
        }, 0);
        
        // 动态生成变量区域
        this.generateDynamicVariables(rule);
        
        // 填充规则详情
        this.renderPhase2RuleDetail(rule);
        
        // 如果有测试文件名，自动重新匹配
        if (currentTestFilename) {
            setTimeout(() => {
                this.updatePhase2TestPreview();
                this.logger.info('自动重新执行规则匹配', { filename: currentTestFilename, rule: rule.name });
            }, 0);
        }
        
        this.logger.info('已选中规则并更新右侧面板');
    }
    
    generateDynamicVariables(rule) {
        // 从源模板中提取所有变量，除了${S}和${E}
        const sourceTemplate = rule.sourceTemplate || '';
        const varMatches = sourceTemplate.match(/\$\{([^}]+)\}/g) || [];
        
        const variables = [];
        varMatches.forEach(match => {
            const varName = match.replace(/\$\{|\}/g, '');
            if (varName !== 'S' && varName !== 'E') {
                variables.push(varName);
            }
        });
        
        // 生成UI
        const container = document.getElementById('phase2DynamicVariables');
        container.innerHTML = '';
        
        if (variables.length === 0) {
            container.innerHTML = '<div style="font-size: 10px; color: #999; padding: 8px; text-align: center;">无需手动配置的变量</div>';
            return;
        }
        
        // 创建列数 (最多两列)
        const columns = Math.min(2, Math.ceil(variables.length / 2));
        const gridTemplate = columns === 1 ? '1fr' : '1fr 1fr';
        
        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = gridTemplate;
        grid.style.gap = '8px';
        
        variables.forEach(varName => {
            const varDiv = document.createElement('div');
            varDiv.id = `phase2Var_${varName}`;
            
            // 获取变量的中文名称（用于placeholder）
            const varLabelMap = {
                'title': '电影名', 'name': '标题', 'year': '年份', 'ext': '扩展名',
                'prefix': '前缀', 'suffix': '后缀', 'custom1': '自定义1'
            };
            const varLabel = varLabelMap[varName] || varName;
            
            varDiv.innerHTML = `
                <label style="font-weight: bold; font-size: 11px; display: block; margin-bottom: 2px;">\${${varName}}:</label>
                <div style="font-size: 10px; color: #666; margin-bottom: 2px;">
                    <label style="margin-right: 8px;">
                        <input type="radio" name="phase2Var${varName}Source" value="extract" checked 
                               style="margin-right: 2px;"> 提取
                    </label>
                    <label>
                        <input type="radio" name="phase2Var${varName}Source" value="manual" 
                               style="margin-right: 2px;"> 手动
                    </label>
                </div>
                <input type="text" id="phase2Var${varName}Manual" class="form-control" 
                       placeholder="${varLabel}" style="font-size: 13px; display: none; padding: 3px; margin-bottom: 2px;">
                <div id="phase2Var${varName}Extracted" style="padding: 3px; background: #fff; border: 1px solid #ddd; 
                     border-radius: 2px; font-size: 9px; color: #666; cursor: not-allowed;">未匹配</div>
            `;
            grid.appendChild(varDiv);
            
            // 获取元素引用
            const radioButtons = varDiv.querySelectorAll(`input[name="phase2Var${varName}Source"]`);
            const manualInput = varDiv.querySelector(`#phase2Var${varName}Manual`);
            const extractedDiv = varDiv.querySelector(`#phase2Var${varName}Extracted`);
            
            // Radio按钮change事件
            radioButtons.forEach(radio => {
                radio.addEventListener('change', (e) => {
                    if (e.target.value === 'manual') {
                        // 切换到手动模式
                        manualInput.style.display = 'block';
                        extractedDiv.style.display = 'none';
                        // 如果之前有手动输入，恢复它；否则显示当前提取到的值
                        if (this.ph2VariableValues[varName] !== undefined) {
                            manualInput.value = this.ph2VariableValues[varName];
                        } else {
                            manualInput.value = extractedDiv.textContent === '未匹配' ? '' : extractedDiv.textContent;
                        }
                        manualInput.focus();
                    } else {
                        // 切换到提取模式
                        manualInput.style.display = 'none';
                        extractedDiv.style.display = 'block';
                        // 保存当前手动输入的值
                        this.ph2VariableValues[varName] = manualInput.value;
                    }
                    app.updatePhase2TestPreview();
                });
            });
            
            // 手动输入变化监听 - 实时保存
            manualInput.addEventListener('input', () => {
                this.ph2VariableValues[varName] = manualInput.value;
                app.updatePhase2TestPreview();
            });
        });
        
        container.appendChild(grid);
    }
    
    renderPhase2RuleDetail(rule) {
        // 填充详情字段
        document.getElementById('phase2DetailName').textContent = rule.name || '-';
        document.getElementById('phase2DetailDescription').textContent = rule.description || '-';
        document.getElementById('phase2DetailSource').value = rule.sourceTemplate || '';
        document.getElementById('phase2DetailTarget').value = rule.targetTemplate || '';
        
        // 渲染全局变量
        this.renderPhase2GlobalVariables();
        
        this.logger.info('已渲染规则详情');
    }
    
    renderPhase2GlobalVariables() {
        const container = document.getElementById('phase2GlobalVariables');
        container.innerHTML = '';
        
        if (!this.phase2GlobalVariables || Object.keys(this.phase2GlobalVariables).length === 0) {
            container.innerHTML = '<span style="font-size: 10px; color: #999;">暂无全局变量</span>';
            return;
        }
        
        Object.entries(this.phase2GlobalVariables).forEach(([varLabel, varPlaceholder]) => {
            const btn = document.createElement('button');
            btn.style.cssText = 'padding: 4px 8px; font-size: 10px; border: 1px solid #0066cc; background: #fff; ' +
                               'color: #0066cc; border-radius: 3px; cursor: pointer; transition: all 0.2s; ' +
                               'position: relative; white-space: nowrap;';
            btn.textContent = varLabel;
            
            // 悬停显示tooltip
            btn.title = varPlaceholder;
            
            // 点击时插入到当前focus的textarea
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                
                // 查找focus的textarea - 优先使用已追踪的，否则查找最后focus的
                let targetTextarea = this.phase2FocusedTextarea;
                
                if (!targetTextarea) {
                    // 如果还没有追踪到textarea，尝试找focus状态的
                    const sourceTextarea = document.getElementById('phase2DetailSource');
                    const targetTextareaEl = document.getElementById('phase2DetailTarget');
                    
                    // 检查哪个TextArea最近被focus过（通过检查是否为activeElement的父容器）
                    if (document.activeElement === sourceTextarea) {
                        targetTextarea = sourceTextarea;
                    } else if (document.activeElement === targetTextareaEl) {
                        targetTextarea = targetTextareaEl;
                    } else {
                        targetTextarea = sourceTextarea; // 默认插入到源模板
                    }
                }
                
                if (targetTextarea && (targetTextarea.id === 'phase2DetailSource' || targetTextarea.id === 'phase2DetailTarget')) {
                    // 获取光标位置
                    const start = targetTextarea.selectionStart;
                    const end = targetTextarea.selectionEnd;
                    const text = targetTextarea.value;
                    
                    // 在光标位置插入变量
                    const newText = text.substring(0, start) + varPlaceholder + text.substring(end);
                    targetTextarea.value = newText;
                    
                    // 恢复光标位置
                    targetTextarea.selectionStart = targetTextarea.selectionEnd = start + varPlaceholder.length;
                    targetTextarea.focus();
                    
                    this.logger.info('已插入变量', { varLabel, varPlaceholder, textarea: targetTextarea.id });
                } else {
                    this.logger.warn('请先在源模板或目标模板中点击以获得焦点');
                }
            });
            
            // 悬停效果
            btn.addEventListener('mouseover', () => {
                btn.style.background = '#0066cc';
                btn.style.color = '#fff';
            });
            btn.addEventListener('mouseout', () => {
                btn.style.background = '#fff';
                btn.style.color = '#0066cc';
            });
            
            container.appendChild(btn);
        });
    }
    
    // ========== Phase 2 规则分类 CRUD 操作 ==========
    
    /**
     * 初始化分类操作的事件监听
     */
    initPhase2CategoryOperations() {
        // 新增按钮
        document.getElementById('phase2AddCategory')?.addEventListener('click', () => {
            this.handleAddCategory();
        });
        
        // 编辑按钮
        document.getElementById('phase2EditCategory')?.addEventListener('click', () => {
            this.handleEditCategory();
        });
        
        // 删除按钮
        document.getElementById('phase2DeleteCategory')?.addEventListener('click', () => {
            this.handleDeleteCategory();
        });
        
        // 新增编辑区的确定按钮
        document.getElementById('phase2ConfirmAddCategory')?.addEventListener('click', () => {
            this.confirmAddCategory();
        });
        
        // 新增编辑区的取消按钮
        document.getElementById('phase2CancelAddCategory')?.addEventListener('click', () => {
            this.cancelAddCategory();
        });
        
        // 编辑编辑区的确定按钮
        document.getElementById('phase2ConfirmEditCategory')?.addEventListener('click', () => {
            this.confirmEditCategory();
        });
        
        // 编辑编辑区的取消按钮
        document.getElementById('phase2CancelEditCategory')?.addEventListener('click', () => {
            this.cancelEditCategory();
        });
        
        // 新增编辑区的输入框回车处理
        document.getElementById('phase2NewCategoryName')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.confirmAddCategory();
            }
        });
        
        // 编辑编辑区的输入框回车处理
        document.getElementById('phase2EditCategoryName')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.confirmEditCategory();
            }
        });
        
        this.logger.debug('✓ Phase 2 分类操作事件已绑定');
    }
    
    /**
     * 处理新增分类
     */
    handleAddCategory() {
        const editor = document.getElementById('phase2AddCategoryEditor');
        if (!editor) return;
        
        // 显示新增编辑区
        editor.style.display = 'flex';
        
        // 清空输入框并聚焦
        const input = document.getElementById('phase2NewCategoryName');
        if (input) {
            input.value = '';
            setTimeout(() => input.focus(), 100);
        }
        
        this.logger.info('显示新增分类编辑区');
    }
    
    /**
     * 确认新增分类
     */
    confirmAddCategory() {
        const input = document.getElementById('phase2NewCategoryName');
        const editor = document.getElementById('phase2AddCategoryEditor');
        
        if (!input || !editor) return;
        
        const categoryName = input.value.trim();
        
        if (!categoryName) {
            this.logger.warn('分类名称不能为空');
            alert('分类名称不能为空');
            input.focus();
            return;
        }
        
        // 检查分类是否已存在
        if (this.phase2Rules[categoryName]) {
            this.logger.warn('分类已存在', { categoryName });
            alert(`分类"${categoryName}"已存在`);
            input.focus();
            return;
        }
        
        // 添加新分类
        this.phase2Rules[categoryName] = [];
        this.logger.info('📝 本地新增分类', { categoryName });
        
        // 刷新分类列表
        this.updatePhase2CategoriesList(this.phase2Rules, this.phase2GlobalVariables);
        
        // 隐藏编辑区
        editor.style.display = 'none';
        input.value = '';
        
        // 保存到后台
        this.savePhase2RulesToBackend(categoryName, 'add').then(success => {
            if (success) {
                this.logger.info('✓ 新增分类成功', { categoryName });
                alert(`✓ 分类"${categoryName}"已添加成功`);
            } else {
                // 撤销本地修改
                delete this.phase2Rules[categoryName];
                this.updatePhase2CategoriesList(this.phase2Rules, this.phase2GlobalVariables);
                this.logger.error('✗ 新增分类失败，已回滚', { categoryName });
                alert(`✗ 新增分类失败，请重试`);
            }
        });
    }
    
    /**
     * 取消新增分类
     */
    cancelAddCategory() {
        const editor = document.getElementById('phase2AddCategoryEditor');
        const input = document.getElementById('phase2NewCategoryName');
        
        if (editor) {
            editor.style.display = 'none';
        }
        if (input) {
            input.value = '';
        }
        
        this.logger.info('已取消新增分类');
    }
    
    /**
     * 处理编辑分类
     */
    handleEditCategory() {
        // 检查是否选中了分类
        const selectedCategoryBtn = document.querySelector('.category-btn.selected');
        if (!selectedCategoryBtn) {
            alert('请先选择要编辑的分类');
            this.logger.warn('编辑分类：未选中任何分类');
            return;
        }
        
        // 获取当前选中的分类名称
        const currentCategoryName = selectedCategoryBtn.querySelector('div strong').textContent;
        
        // 显示编辑编辑区
        const editor = document.getElementById('phase2EditCategoryEditor');
        const input = document.getElementById('phase2EditCategoryName');
        
        if (!editor || !input) return;
        
        editor.style.display = 'flex';
        input.value = currentCategoryName;
        
        // 保存原分类名，用于后续验证
        input.dataset.originalName = currentCategoryName;
        
        setTimeout(() => input.focus(), 100);
        
        this.logger.info('显示编辑分类编辑区', { categoryName: currentCategoryName });
    }
    
    /**
     * 确认编辑分类
     */
    confirmEditCategory() {
        const input = document.getElementById('phase2EditCategoryName');
        const editor = document.getElementById('phase2EditCategoryEditor');
        
        if (!input || !editor) return;
        
        const newName = input.value.trim();
        const originalName = input.dataset.originalName || '';
        
        if (!newName) {
            alert('分类名称不能为空');
            input.focus();
            return;
        }
        
        if (newName === originalName) {
            // 名称未变化
            editor.style.display = 'none';
            input.value = '';
            this.logger.info('分类名称未变化，已取消编辑');
            return;
        }
        
        // 检查新分类名是否已存在
        if (this.phase2Rules[newName]) {
            alert(`分类"${newName}"已存在`);
            input.focus();
            return;
        }
        
        // 保存原数据，用于回滚
        const backupRules = JSON.parse(JSON.stringify(this.phase2Rules));
        
        // 重命名分类
        if (this.phase2Rules[originalName]) {
            this.phase2Rules[newName] = this.phase2Rules[originalName];
            delete this.phase2Rules[originalName];
        }
        
        this.logger.info('📝 本地编辑分类', { originalName, newName });
        
        // 刷新分类列表
        this.updatePhase2CategoriesList(this.phase2Rules, this.phase2GlobalVariables);
        
        // 隐藏编辑区
        editor.style.display = 'none';
        input.value = '';
        delete input.dataset.originalName;
        
        // 保存到后台
        this.savePhase2RulesToBackend(originalName, 'edit', newName).then(success => {
            if (success) {
                this.logger.info('✓ 编辑分类成功', { originalName, newName });
                alert(`✓ 分类已重命名为"${newName}"`);
            } else {
                // 撤销本地修改
                this.phase2Rules = backupRules;
                this.updatePhase2CategoriesList(this.phase2Rules, this.phase2GlobalVariables);
                this.logger.error('✗ 编辑分类失败，已回滚', { originalName, newName });
                alert(`✗ 编辑分类失败，请重试`);
            }
        });
    }
    
    /**
     * 取消编辑分类
     */
    cancelEditCategory() {
        const editor = document.getElementById('phase2EditCategoryEditor');
        const input = document.getElementById('phase2EditCategoryName');
        
        if (editor) {
            editor.style.display = 'none';
        }
        if (input) {
            input.value = '';
            delete input.dataset.originalName;
        }
        
        this.logger.info('已取消编辑分类');
    }
    
    /**
     * 处理删除分类
     */
    handleDeleteCategory() {
        // 检查是否选中了分类
        const selectedCategoryBtn = document.querySelector('.category-btn.selected');
        if (!selectedCategoryBtn) {
            alert('请先选择要删除的分类');
            this.logger.warn('删除分类：未选中任何分类');
            return;
        }
        
        const categoryName = selectedCategoryBtn.querySelector('div strong').textContent;
        
        // 显示确认对话框
        this.confirmDeleteCategory(categoryName);
    }
    
    /**
     * 删除分类确认
     */
    confirmDeleteCategory(categoryName) {
        const ruleCount = this.phase2Rules[categoryName]?.length || 0;
        const message = ruleCount > 0 
            ? `确定删除分类"${categoryName}"及其${ruleCount}条规则吗？此操作不可撤销。`
            : `确定删除分类"${categoryName}"吗？此操作不可撤销。`;
        
        if (confirm(message)) {
            // 保存原数据，用于回滚
            const backupRules = JSON.parse(JSON.stringify(this.phase2Rules));
            
            // 删除分类
            delete this.phase2Rules[categoryName];
            
            this.logger.info('📝 本地删除分类', { categoryName, ruleCount });
            
            // 刷新分类列表
            this.updatePhase2CategoriesList(this.phase2Rules, this.phase2GlobalVariables);
            
            // 清空中列和右列
            const rulesList = document.getElementById('phase2RulesList');
            if (rulesList) {
                rulesList.innerHTML = '<div class="empty-state">请选择分类</div>';
            }
            
            const ruleSelected = document.getElementById('phase2RuleSelected');
            if (ruleSelected) {
                ruleSelected.innerHTML = '';
            }
            
            this.currentPhase2Rule = null;
            
            // 保存到后台
            this.savePhase2RulesToBackend(categoryName, 'delete').then(success => {
                if (success) {
                    this.logger.info('✓ 删除分类成功', { categoryName, ruleCount });
                    alert(`✓ 分类"${categoryName}"已删除`);
                } else {
                    // 撤销本地修改
                    this.phase2Rules = backupRules;
                    this.updatePhase2CategoriesList(this.phase2Rules, this.phase2GlobalVariables);
                    
                    const selectedBtn = Array.from(document.querySelectorAll('.category-btn'))
                        .find(btn => btn.querySelector('div strong').textContent === categoryName);
                    if (selectedBtn) {
                        this.selectPhase2Category(categoryName);
                    }
                    
                    this.logger.error('✗ 删除分类失败，已回滚', { categoryName });
                    alert(`✗ 删除分类失败，请重试`);
                }
            });
        } else {
            this.logger.info('已取消删除分类');
        }
    }
    
    /**
     * 保存规则到后台
     * @param {string} categoryName - 分类名称
     * @param {string} operation - 操作类型：add/edit/delete
     * @param {string} newName - 编辑时的新名称（可选）
     * @returns {Promise<boolean>} 保存是否成功
     */
    async savePhase2RulesToBackend(categoryName, operation, newName = null) {
        const timestamp = new Date().toLocaleString('zh-CN');
        
        try {
            this.logger.debug('🌐 发送后台保存请求', { 
                operation, 
                categoryName, 
                newName, 
                timestamp,
                totalRules: Object.keys(this.phase2Rules).length 
            });
            
            const response = await fetch('/api/phase2/rules', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    rules: this.phase2Rules,
                    globalVariables: this.phase2GlobalVariables,
                    operation: operation,
                    categoryName: categoryName,
                    newName: newName,
                    timestamp: timestamp
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            
            if (result.success) {
                // 分类操作
                if (['add', 'edit', 'delete'].includes(operation)) {
                    this.logger.info(`✓ [后台] ${operation === 'add' ? '新增' : operation === 'edit' ? '编辑' : '删除'}分类成功`, {
                        categoryName,
                        newName,
                        message: result.message || '操作成功'
                    });
                } 
                // 规则操作
                else if (operation.startsWith('rule_')) {
                    const opName = operation === 'rule_add' ? '新增' : operation === 'rule_edit' ? '编辑' : '删除';
                    this.logger.info(`✓ [后台] ${opName}规则成功`, {
                        categoryName,
                        ruleName: newName,
                        message: result.message || '操作成功'
                    });
                }
                return true;
            } else {
                // 分类操作
                if (['add', 'edit', 'delete'].includes(operation)) {
                    this.logger.error(`✗ [后台] ${operation === 'add' ? '新增' : operation === 'edit' ? '编辑' : '删除'}分类失败`, {
                        categoryName,
                        newName,
                        message: result.message || '未知错误'
                    });
                } 
                // 规则操作
                else if (operation.startsWith('rule_')) {
                    const opName = operation === 'rule_add' ? '新增' : operation === 'rule_edit' ? '编辑' : '删除';
                    this.logger.error(`✗ [后台] ${opName}规则失败`, {
                        categoryName,
                        ruleName: newName,
                        message: result.message || '未知错误'
                    });
                }
                return false;
            }
        } catch (error) {
            // 分类操作
            if (['add', 'edit', 'delete'].includes(operation)) {
                this.logger.error(`✗ [后台] 保存分类异常`, {
                    operation,
                    categoryName,
                    newName,
                    error: error.message
                });
            } 
            // 规则操作
            else if (operation.startsWith('rule_')) {
                const opName = operation === 'rule_add' ? '新增' : operation === 'rule_edit' ? '编辑' : '删除';
                this.logger.error(`✗ [后台] ${opName}规则异常`, {
                    operation,
                    categoryName,
                    ruleName: newName,
                    error: error.message
                });
            }
            return false;
        }
    }
    
    // ========== Phase 2 规则列表 CRUD 操作 ==========
    
    /**
     * 初始化规则操作的事件监听
     */
    initPhase2RuleOperations() {
        // 新增按钮
        document.getElementById('phase2AddRule')?.addEventListener('click', () => {
            this.handleAddRule();
        });
        
        // 编辑按钮
        document.getElementById('phase2EditRule')?.addEventListener('click', () => {
            this.handleEditRule();
        });
        
        // 删除按钮
        document.getElementById('phase2DeleteRule')?.addEventListener('click', () => {
            this.handleDeleteRule();
        });
        
        // 新增规则编辑区的按钮
        document.getElementById('phase2ConfirmAddRule')?.addEventListener('click', () => {
            this.confirmAddRule();
        });
        
        document.getElementById('phase2CancelAddRule')?.addEventListener('click', () => {
            this.cancelAddRule();
        });
        
        // 编辑规则编辑区的按钮
        document.getElementById('phase2ConfirmEditRule')?.addEventListener('click', () => {
            this.confirmEditRule();
        });
        
        document.getElementById('phase2CancelEditRule')?.addEventListener('click', () => {
            this.cancelEditRule();
        });
        
        // 回车快捷键
        document.getElementById('phase2NewRuleSource')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.confirmAddRule();
            }
        });
        
        document.getElementById('phase2EditRuleSource')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.confirmEditRule();
            }
        });
        
        this.logger.debug('✓ Phase 2 规则操作事件已绑定');
    }
    
    /**
     * 处理新增规则
     */
    handleAddRule() {
        // 检查是否选中了分类
        const selectedCategoryBtn = document.querySelector('.category-btn.selected');
        if (!selectedCategoryBtn) {
            alert('请先选择一个分类');
            this.logger.warn('新增规则：未选中任何分类');
            return;
        }
        
        const editor = document.getElementById('phase2AddRuleEditor');
        if (!editor) return;
        
        // 显示新增编辑区
        editor.style.display = 'flex';
        
        // 清空输入框并聚焦
        document.getElementById('phase2NewRuleName').value = '';
        document.getElementById('phase2NewRuleDesc').value = '';
        document.getElementById('phase2NewRuleSource').value = '';
        document.getElementById('phase2NewRuleTarget').value = '';
        
        setTimeout(() => document.getElementById('phase2NewRuleName').focus(), 100);
        
        this.logger.info('显示新增规则编辑区');
    }
    
    /**
     * 确认新增规则
     */
    confirmAddRule() {
        const selectedCategoryBtn = document.querySelector('.category-btn.selected');
        if (!selectedCategoryBtn) {
            alert('请先选择一个分类');
            return;
        }
        
        const categoryName = selectedCategoryBtn.querySelector('div strong').textContent;
        const ruleName = document.getElementById('phase2NewRuleName').value.trim();
        const ruleDesc = document.getElementById('phase2NewRuleDesc').value.trim();
        const sourceTemplate = document.getElementById('phase2NewRuleSource').value.trim();
        const targetTemplate = document.getElementById('phase2NewRuleTarget').value.trim();
        const editor = document.getElementById('phase2AddRuleEditor');
        
        if (!ruleName) {
            alert('规则名称不能为空');
            document.getElementById('phase2NewRuleName').focus();
            return;
        }
        
        if (!sourceTemplate || !targetTemplate) {
            alert('源模板和目标模板不能为空');
            return;
        }
        
        // 检查该分类是否存在
        if (!this.phase2Rules[categoryName]) {
            alert('所选分类不存在');
            this.logger.warn('新增规则：分类不存在', { categoryName });
            return;
        }
        
        // 检查规则名是否重复
        const rules = this.phase2Rules[categoryName] || [];
        if (rules.some(r => r.name === ruleName)) {
            alert(`规则"${ruleName}"在此分类中已存在`);
            document.getElementById('phase2NewRuleName').focus();
            return;
        }
        
        // 创建新规则对象
        const newRule = {
            id: `rule_${Date.now()}`,
            name: ruleName,
            description: ruleDesc,
            sourceTemplate: sourceTemplate,
            targetTemplate: targetTemplate,
            createdAt: new Date().toLocaleString('zh-CN')
        };
        
        // 添加规则到分类
        this.phase2Rules[categoryName].push(newRule);
        
        this.logger.info('📝 本地新增规则', { categoryName, ruleName });
        
        // 刷新规则列表
        this.selectPhase2Category(categoryName);
        
        // 隐藏编辑区
        editor.style.display = 'none';
        
        // 保存到后台
        this.savePhase2RulesToBackend(categoryName, 'rule_add', ruleName).then(success => {
            if (success) {
                this.logger.info('✓ 新增规则成功', { categoryName, ruleName });
                alert(`✓ 规则"${ruleName}"已添加成功`);
            } else {
                // 撤销本地修改
                const idx = this.phase2Rules[categoryName].findIndex(r => r.name === ruleName);
                if (idx >= 0) {
                    this.phase2Rules[categoryName].splice(idx, 1);
                }
                this.selectPhase2Category(categoryName);
                this.logger.error('✗ 新增规则失败，已回滚', { categoryName, ruleName });
                alert(`✗ 新增规则失败，请重试`);
            }
        });
    }
    
    /**
     * 取消新增规则
     */
    cancelAddRule() {
        const editor = document.getElementById('phase2AddRuleEditor');
        if (editor) {
            editor.style.display = 'none';
        }
        document.getElementById('phase2NewRuleName').value = '';
        document.getElementById('phase2NewRuleDesc').value = '';
        document.getElementById('phase2NewRuleSource').value = '';
        document.getElementById('phase2NewRuleTarget').value = '';
        
        this.logger.info('已取消新增规则');
    }
    
    /**
     * 处理编辑规则
     */
    handleEditRule() {
        const selectedRuleBtn = document.querySelector('.rule-name-btn.selected');
        if (!selectedRuleBtn) {
            alert('请先选择要编辑的规则');
            this.logger.warn('编辑规则：未选中任何规则');
            return;
        }
        
        if (!this.currentPhase2Rule) {
            alert('规则数据丢失');
            return;
        }
        
        const rule = this.currentPhase2Rule.rule;
        const editor = document.getElementById('phase2EditRuleEditor');
        
        if (!editor) return;
        
        // 填充当前规则数据到编辑框
        document.getElementById('phase2EditRuleName').value = rule.name;
        document.getElementById('phase2EditRuleDesc').value = rule.description || '';
        document.getElementById('phase2EditRuleSource').value = rule.sourceTemplate;
        document.getElementById('phase2EditRuleTarget').value = rule.targetTemplate;
        
        // 保存原规则数据用于回滚
        editor.dataset.originalRuleId = rule.id;
        
        editor.style.display = 'flex';
        
        setTimeout(() => document.getElementById('phase2EditRuleName').focus(), 100);
        
        this.logger.info('显示编辑规则编辑区', { ruleName: rule.name });
    }
    
    /**
     * 确认编辑规则
     */
    confirmEditRule() {
        if (!this.currentPhase2Rule) {
            alert('规则数据丢失');
            return;
        }
        
        const { category, ruleIndex, rule } = this.currentPhase2Rule;
        const editor = document.getElementById('phase2EditRuleEditor');
        
        const newName = document.getElementById('phase2EditRuleName').value.trim();
        const newDesc = document.getElementById('phase2EditRuleDesc').value.trim();
        const newSource = document.getElementById('phase2EditRuleSource').value.trim();
        const newTarget = document.getElementById('phase2EditRuleTarget').value.trim();
        
        if (!newName || !newSource || !newTarget) {
            alert('规则名称和模板不能为空');
            return;
        }
        
        // 检查新名称是否与其他规则重复
        const sameCategoryRules = this.phase2Rules[category] || [];
        const isDuplicate = sameCategoryRules.some((r, idx) => r.name === newName && idx !== ruleIndex);
        if (isDuplicate) {
            alert(`规则"${newName}"在此分类中已存在`);
            return;
        }
        
        // 保存原数据用于回滚
        const backupRule = JSON.parse(JSON.stringify(rule));
        
        // 更新规则
        rule.name = newName;
        rule.description = newDesc;
        rule.sourceTemplate = newSource;
        rule.targetTemplate = newTarget;
        rule.modifiedAt = new Date().toLocaleString('zh-CN');
        
        this.logger.info('📝 本地编辑规则', { category, ruleName: newName });
        
        // 刷新规则列表
        this.selectPhase2Category(category);
        
        // 隐藏编辑区
        editor.style.display = 'none';
        
        // 保存到后台
        this.savePhase2RulesToBackend(category, 'rule_edit', newName).then(success => {
            if (success) {
                this.logger.info('✓ 编辑规则成功', { category, ruleName: newName });
                alert(`✓ 规则"${newName}"已编辑成功`);
            } else {
                // 撤销修改
                Object.assign(rule, backupRule);
                this.selectPhase2Category(category);
                this.logger.error('✗ 编辑规则失败，已回滚', { category, ruleName: newName });
                alert(`✗ 编辑规则失败，请重试`);
            }
        });
    }
    
    /**
     * 取消编辑规则
     */
    cancelEditRule() {
        const editor = document.getElementById('phase2EditRuleEditor');
        if (editor) {
            editor.style.display = 'none';
            delete editor.dataset.originalRuleId;
        }
        
        this.logger.info('已取消编辑规则');
    }
    
    /**
     * 处理删除规则
     */
    handleDeleteRule() {
        const selectedRuleBtn = document.querySelector('.rule-name-btn.selected');
        if (!selectedRuleBtn) {
            alert('请先选择要删除的规则');
            this.logger.warn('删除规则：未选中任何规则');
            return;
        }
        
        if (!this.currentPhase2Rule) {
            alert('规则数据丢失');
            return;
        }
        
        const { category, rule } = this.currentPhase2Rule;
        this.confirmDeleteRule(category, rule.name);
    }
    
    /**
     * 删除规则确认
     */
    confirmDeleteRule(category, ruleName) {
        const message = `确定删除规则"${ruleName}"吗？此操作不可撤销。`;
        
        if (confirm(message)) {
            const rules = this.phase2Rules[category] || [];
            const ruleIndex = rules.findIndex(r => r.name === ruleName);
            
            if (ruleIndex < 0) {
                alert('规则不存在');
                return;
            }
            
            // 保存原数据用于回滚
            const backupRules = JSON.parse(JSON.stringify(rules));
            
            // 删除规则
            rules.splice(ruleIndex, 1);
            
            this.logger.info('📝 本地删除规则', { category, ruleName });
            
            // 刷新规则列表
            this.selectPhase2Category(category);
            
            // 清空右侧内容
            const ruleSelected = document.getElementById('phase2RuleSelected');
            if (ruleSelected) {
                ruleSelected.innerHTML = '';
            }
            
            this.currentPhase2Rule = null;
            
            // 保存到后台
            this.savePhase2RulesToBackend(category, 'rule_delete', ruleName).then(success => {
                if (success) {
                    this.logger.info('✓ 删除规则成功', { category, ruleName });
                    alert(`✓ 规则"${ruleName}"已删除`);
                } else {
                    // 撤销删除
                    this.phase2Rules[category] = backupRules;
                    this.selectPhase2Category(category);
                    this.logger.error('✗ 删除规则失败，已回滚', { category, ruleName });
                    alert(`✗ 删除规则失败，请重试`);
                }
            });
        } else {
            this.logger.info('已取消删除规则');
        }
    }
    
    updatePhase2TestPreview() {
        if (!this.currentPhase2Rule) return;
        
        const rule = this.currentPhase2Rule.rule;
        const sourceFilename = document.getElementById('phase2TestSourceFilename').value.trim();
        
        if (!sourceFilename) {
            document.getElementById('phase2TestResultFilename').textContent = '[等待输入]';
            document.getElementById('phase2TestResultFilename').style.color = '#999';
            return;
        }
        
        try {
            // 使用生成的正则式进行匹配
            const regexPattern = rule.generatedRegex || '';
            let extractedVars = {};
            let matchSuccess = false;
            
            if (regexPattern) {
                try {
                    const regex = new RegExp(regexPattern, 'i'); // 忽略大小写
                    const match = sourceFilename.match(regex);
                    
                    if (match) {
                        // 将捕获组与变量名对应
                        const variables = rule.extractedVariables || [];
                        for (let i = 0; i < variables.length && i < match.length - 1; i++) {
                            extractedVars[variables[i]] = match[i + 1] || '';
                        }
                        matchSuccess = true;
                        this.logger.debug('正则式匹配成功', { filename: sourceFilename, extracted: extractedVars });
                    }
                } catch (regexError) {
                    this.logger.warn('正则式执行异常，尝试降级匹配', { error: regexError.message });
                }
            }
            
            // 如果正则式匹配失败，尝试简单的模板匹配作为备选
            if (!matchSuccess) {
                extractedVars = Phase2RuleEngine.extractVariablesFromFilename(sourceFilename, rule.sourceTemplate);
                matchSuccess = Object.keys(extractedVars).some(k => extractedVars[k] !== '');
            }
            
            // 获取源模板中的所有变量（除${S}和${E}）
            const sourceTemplate = rule.sourceTemplate || '';
            const varMatches = sourceTemplate.match(/\$\{([^}]+)\}/g) || [];
            
            // 用于最终目标文件名替换的变量集合
            const finalVars = { ...extractedVars };
            
            // 处理动态变量的提取/手动切换
            varMatches.forEach(match => {
                const varName = match.replace(/\$\{|\}/g, '');
                if (varName !== 'S' && varName !== 'E') {
                    const sourceOption = document.querySelector(`input[name="phase2Var${varName}Source"]:checked`);
                    const sourceValue = sourceOption ? sourceOption.value : 'extract';
                    
                    const manualInput = document.getElementById(`phase2Var${varName}Manual`);
                    const extractedDiv = document.getElementById(`phase2Var${varName}Extracted`);
                    
                    if (sourceValue === 'extract') {
                        // 提取模式：显示extractedDiv，隐藏manualInput
                        if (manualInput) manualInput.style.display = 'none';
                        if (extractedDiv) {
                            const extractedValue = extractedVars[varName] || '';
                            extractedDiv.style.display = 'block';
                            extractedDiv.textContent = extractedValue || '未匹配';
                            extractedDiv.style.cursor = 'not-allowed';
                        }
                        finalVars[varName] = extractedVars[varName] || '';
                    } else {
                        // 手动模式：显示manualInput，隐藏extractedDiv
                        if (manualInput) {
                            manualInput.style.display = 'block';
                            finalVars[varName] = manualInput.value;
                        }
                        if (extractedDiv) {
                            extractedDiv.style.display = 'none';
                        }
                    }
                }
            });
            
            // 检查主体变量（集号E）- 这是最低要求
            const hasE = rule.extractedVariables && rule.extractedVariables.includes('E');
            const eMatched = hasE && finalVars.E;
            
            // 如果规则包含E但未匹配到，返回错误
            if (hasE && !eMatched) {
                document.getElementById('phase2TestResultFilename').textContent = '[无法匹配集号]';
                document.getElementById('phase2TestResultFilename').style.color = '#ff9800';
                return;
            }
            
            // 生成目标文件名
            // 注意：其他变量为空时会被替换为空字符串，这是为了最大兼容性
            let targetFilename = rule.targetTemplate;
            for (const [key, value] of Object.entries(finalVars)) {
                targetFilename = targetFilename.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value || '');
            }
            
            // 清理文件名中可能产生的多余空格和特殊字符
            targetFilename = targetFilename
                .replace(/^\s*-\s*/, '') // 移除前导的 "-"
                .replace(/\s{2,}/g, ' ')  // 多个空格替换为单个空格
                .trim();
            
            document.getElementById('phase2TestResultFilename').textContent = targetFilename || '[无法生成]';
            document.getElementById('phase2TestResultFilename').style.color = '#228a22';
        } catch (e) {
            this.logger.error('规则测试异常', { error: e.message });
            document.getElementById('phase2TestResultFilename').textContent = '[测试异常: ' + e.message + ']';
            document.getElementById('phase2TestResultFilename').style.color = '#d32f2f';
        }
    }
    
    // 应用Phase 2规则进行文件名转换（用于主页面操作）
    applyPhase2RuleToFilename(filename, episodeOffset = -1) {
        /**
         * 使用保存的Phase 2规则（包括生成的正则式）对文件名进行转换
         * @param {string} filename - 原始文件名
         * @param {number} episodeOffset - 集号偏移值，默认为 -1（不偏移）
         * @returns {string|null} - 转换后的文件名，失败时返回null
         */
        if (!this.selectedPhase2Rule) {
            this.logger.warn('未选择Phase 2规则');
            return null;
        }
        
        const rule = this.selectedPhase2Rule;
        
        // 构建规则引擎需要的对象格式
        const regexInfo = {
            pattern: rule.generatedRegex,
            variables: rule.extractedVariables,
            sourceTemplate: rule.sourceTemplate,
            targetTemplate: rule.targetTemplate
        };
        
        // 使用规则引擎进行文件名转换（支持集号偏移）
        const resultFilename = Phase2RuleEngine.applyRegexToFilename(filename, regexInfo, episodeOffset);
        
        if (resultFilename) {
            this.logger.info('Phase 2规则应用成功', { 
                original: filename, 
                result: resultFilename,
                rule: rule.ruleName,
                episodeOffset: episodeOffset > -1 ? episodeOffset : '未偏移'
            });
        } else {
            this.logger.warn('无法使用规则转换文件名', { filename, rule: rule.ruleName });
        }
        
        return resultFilename;
    }
    
    // 模态框拖动功能初始化
    initPhase2ModalDraggable() {
        const modal = document.getElementById('phase2RulesModal');
        const modalContent = document.querySelector('.phase2-modal-content');
        const modalHeader = document.querySelector('.modal-header');
        
        if (!modal || !modalContent || !modalHeader) return;
        
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let initialLeft = 0;
        let initialTop = 0;
        
        // 鼠标按下时开始拖动
        modalHeader.addEventListener('mousedown', (e) => {
            // 避免拖动时选中文本
            e.preventDefault();
            
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            
            // 获取当前位置
            const rect = modalContent.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;
            
            modalHeader.style.cursor = 'grabbing';
            document.body.style.userSelect = 'none';
        });
        
        // 鼠标移动时更新位置
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            const newLeft = initialLeft + deltaX;
            const newTop = initialTop + deltaY;
            
            // 约束在视口范围内
            const maxLeft = window.innerWidth - modalContent.offsetWidth;
            const maxTop = window.innerHeight - modalContent.offsetHeight;
            
            const constrainedLeft = Math.max(0, Math.min(newLeft, maxLeft));
            const constrainedTop = Math.max(0, Math.min(newTop, maxTop));
            
            modalContent.style.left = constrainedLeft + 'px';
            modalContent.style.top = constrainedTop + 'px';
        });
        
        // 鼠标释放时停止拖动
        document.addEventListener('mouseup', () => {
            if (!isDragging) return;
            
            isDragging = false;
            modalHeader.style.cursor = 'grab';
            document.body.style.userSelect = 'auto';
        });
        
        this.logger.debug('✓ Phase 2 模态框拖动功能已初始化');
    }

    
    phase2DetailTestRule() {
        if (!this.currentPhase2Rule) {
            this.logger.warn('未选择规则');
            return;
        }
        
        const testInput = document.getElementById('phase2DetailTestInput').value.trim();
        if (!testInput) {
            this.showStatus('请输入测试文件名', 'warning');
            return;
        }
        
        const rule = this.currentPhase2Rule.rule;
        const result = document.getElementById('phase2DetailTestResult');
        const resultContent = document.getElementById('phase2DetailTestResultContent');
        
        // 模拟规则测试（实际需要后端支持）
        try {
            // 简单的测试：检查源模板是否匹配
            const sourceRegex = rule.sourceTemplate.replace(/\$\{[^}]+\}/g, '(.+?)');
            const testRegex = new RegExp('^' + sourceRegex + '$');
            
            if (testRegex.test(testInput)) {
                resultContent.innerHTML = `<span style="color: green;">✓ 匹配成功</span><br/>源模板: ${rule.sourceTemplate}<br/>目标将应用: ${rule.targetTemplate}`;
            } else {
                resultContent.innerHTML = `<span style="color: red;">✗ 不匹配源模板</span><br/>期望格式: ${rule.sourceTemplate}`;
            }
            result.style.display = 'block';
        } catch (e) {
            resultContent.innerHTML = `<span style="color: red;">✗ 测试异常: ${e.message}</span>`;
            result.style.display = 'block';
        }
    }
    
    phase2ApplyRule() {
        if (!this.currentPhase2Rule) {
            this.logger.warn('未选择规则');
            return;
        }
        
        const { category, rule } = this.currentPhase2Rule;
        this.logger.info(`应用规则: ${rule.name} (分类: ${category})`);
        
        // 保存选中的规则到程序中（实际应通过 API 保存）
        this.selectedPhase2Rule = {
            category,
            ruleName: rule.name,
            sourceTemplate: rule.sourceTemplate,
            targetTemplate: rule.targetTemplate,
            extractionStrategy: rule.extractionStrategy,
            id: rule.id
        };
        
        this.showStatus(`✓ 已应用规则: ${rule.name}`, 'success');
        this.logger.success(`已应用规则: ${rule.name}`);
    }

}

// 初始化
const app = new TMDBRenamer();

// 电视剧选择弹框事件监听
document.addEventListener('DOMContentLoaded', () => {
    // 搜索框回车触发搜索
    const seriesSearchInput = document.getElementById('seriesSearchInput');
    if (seriesSearchInput) {
        seriesSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                app.searchSeriesInModal(e.target.value);
            }
        });
    }

    // 搜索按钮点击事件
    const seriesSearchBtn = document.getElementById('seriesSearchBtn');
    if (seriesSearchBtn) {
        seriesSearchBtn.addEventListener('click', () => {
            const query = document.getElementById('seriesSearchInput').value;
            app.logger.info('点击搜索按钮', { query });
            app.searchSeriesInModal(query);
        });
    }

    // 取消按钮
    document.getElementById('seriesSelectCancel').addEventListener('click', () => {
        document.getElementById('seriesSelectionModal').style.display = 'none';
        app.logger.info('关闭电视剧选择弹框');
    });

    // 确认按钮
    document.getElementById('seriesSelectConfirm').addEventListener('click', () => {
        app.confirmSeriesSelection();
    });

    // 弹框关闭按钮
    try {
        const closeBtn = document.querySelector('#seriesSelectionModal .modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                const modal = document.getElementById('seriesSelectionModal');
                if (modal) {
                    modal.style.display = 'none';
                    app.logger.info('[弹框关闭] ✓ 点击关闭按钮已关闭');
                } else {
                    app.logger.error('[弹框关闭] seriesSelectionModal 元素不存在');
                }
            });
            app.logger.info('[初始化] ✓ 弹框关闭按钮已绑定');
        } else {
            app.logger.error('[初始化] ✗ 弹框中的关闭按钮 (.modal-close) 不存在');
        }
    } catch (e) {
        app.logger.error('[初始化] 弹框关闭按钮绑定异常', { error: e.message });
    }

    // 背景点击关闭
    try {
        const modal = document.getElementById('seriesSelectionModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                // 仅当点击背景（modal本身）时关闭，不是modal-content内的任何元素
                if (e.target.id === 'seriesSelectionModal') {
                    modal.style.display = 'none';
                    app.logger.info('[弹框关闭] ✓ 背景点击已关闭');
                }
            });
            app.logger.info('[初始化] ✓ 弹框背景点击关闭已绑定');
        } else {
            app.logger.error('[初始化] ✗ seriesSelectionModal 元素不存在');
        }
    } catch (e) {
        app.logger.error('[初始化] 弹框背景点击关闭绑定异常', { error: e.message });
    }
});
