// URL管理与队列
class UrlManager {
    constructor(options = {}) {
        this.maxDepth = options.maxDepth || 2;
        this.baseUrl = options.baseUrl || '';
        this.queue = [];
        this.processed = new Set();
        this.baseDomain = this._extractDomain(this.baseUrl);
        console.log(`[UrlManager] 初始化，基础域名: ${this.baseDomain}`);
    }

    _extractDomain(url) {
        try {
            const parsed = new URL(url);
            return parsed.hostname;
        } catch (e) {
            return '';
        }
    }

    processUrlBeforeAdd(url) {
        // 如果URL是相对路径，转为绝对URL
        try {
            return new URL(url, this.baseUrl).href;
        } catch (e) {
            return null;
        }
    }

    addUrl(url, depth) {
        if (!url) return;
        
        // 预处理URL
        const processedUrl = this.processUrlBeforeAdd(url);
        if (!processedUrl) return;
        
        // 检查是否已处理过
        if (this.hasUrlBeenProcessed(processedUrl)) return;
        
        // 检查是否同域名
        const urlDomain = this._extractDomain(processedUrl);
        if (this.baseDomain && urlDomain !== this.baseDomain) {
            console.log(`[UrlManager] 跳过不同域URL: ${processedUrl}`);
            return;
        }
        
        console.log(`[UrlManager] 添加URL到队列: ${processedUrl} (深度: ${depth})`);
        this.queue.push({ url: processedUrl, depth });
    }

    getNextUrl() {
        return this.queue.shift();
    }

    markUrlProcessed(url) {
        this.processed.add(url);
    }

    hasUrlBeenProcessed(url) {
        return this.processed.has(url);
    }

    hasMoreUrls() {
        return this.queue.length > 0;
    }

    checkSameDomain(url, baseUrl = this.baseUrl) {
        try {
            const u = new URL(url, baseUrl);
            const b = new URL(baseUrl);
            return u.hostname === b.hostname;
        } catch {
            return false;
        }
    }
    
    /**
     * 获取已处理的URL数量
     * @returns {number} 已处理的URL数量
     */
    getProcessedCount() {
        return this.processed.size;
    }
}

module.exports = UrlManager;
