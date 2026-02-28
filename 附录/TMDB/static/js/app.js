// TMDB 电视剧重命名工具 - 前端JavaScript

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
        this.customRegex = null;
        this.logger = new Logger();
        
        // 弹框状态初始化
        this.seriesModalState = {
            selectedSeries: null,
            selectedSeason: null,
            searchResults: [],
            currentSeriesData: null
        };
        
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
            this.logger.info('[初始化步骤 3/3] 检查 API 密钥');
            this.checkApiKey();
            this.logger.success('[初始化步骤 3/3] ✓ 完成');
        } catch (e) {
            this.logger.error('[初始化步骤 3/3] ✗ 失败', { error: e.message });
        }
        
        this.logger.info('========== 应用初始化完成 ==========');
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

        // 格式分析
        const analyzeBtn = document.getElementById('analyzeFormat');
        if (analyzeBtn) {
            analyzeBtn.addEventListener('click', () => this.analyzeFormat());
            this.logger.debug('✓ 格式分析按钮已绑定');
        } else {
            this.logger.error('✗ analyzeFormat 元素不存在');
        }

        const customRegexInput = document.getElementById('customRegex');
        if (customRegexInput) {
            customRegexInput.addEventListener('change', (e) => {
                this.customRegex = e.target.value;
            });
            this.logger.debug('✓ 自定义正则输入框已绑定');
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
    async analyzeFormat() {
        const example = document.getElementById('exampleFilename').value.trim();

        if (!example) {
            this.showStatus('请输入示例文件名', 'error');
            return;
        }

        try {
            const res = await fetch('/api/extract-format', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ example: example })
            });
            const data = await res.json();

            if (data.error) {
                this.showStatus('✗ ' + data.error, 'error');
                return;
            }

            const patterns = data.detected_patterns || [];
            const patternsHtml = patterns.map((p, idx) => `
                <div class="pattern-item" onclick="app.selectPattern('${this.escapeAttr(p.pattern)}')" style="cursor: pointer;">
                    <div class="pattern-name">${p.name}</div>
                    <div class="pattern-regex">${this.escapeHtml(p.pattern)}</div>
                    <div class="result-item-meta">匹配: ${p.matched} → S${String(p.season).padStart(2, '0')}E${String(p.episode).padStart(2, '0')}</div>
                </div>
            `).join('');

            document.getElementById('detectedPatterns').innerHTML = patternsHtml;
            document.getElementById('formatAnalysis').style.display = 'block';

            if (data.recommended) {
                document.getElementById('customRegex').value = data.recommended.pattern;
                this.customRegex = data.recommended.pattern;
            }
        } catch (e) {
            this.showStatus('✗ 分析失败: ' + e.message, 'error');
        }
    }

    selectPattern(pattern) {
        document.getElementById('customRegex').value = pattern;
        this.customRegex = pattern;
        this.showStatus('✓ 已选择正则表达式', 'success');
    }

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

            if (this.customRegex) {
                params.append('regex', this.customRegex);
            }

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
