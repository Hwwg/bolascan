// 动态元素检测器 - 使用MutationObserver和DOM快照对比进行检测
class DynamicElementDetector {
    constructor(page) {
        this.page = page;
        this.domSnapshotBefore = null;
        this.domSnapshotAfter = null;
        this.mutationObserverData = [];
        this.isMonitoring = false;
    }

    /**
     * 初始化动态元素检测
     * 注入MutationObserver和相关监听代码到页面中
     */
    async initializeDetection() {
        console.log('[DynamicElementDetector] 初始化动态元素检测...');
        
        try {
            // 在页面中注入MutationObserver监听代码
            await this.page.evaluate(() => {
                // 清理之前的监听器
                if (window.__dynamicElementObserver) {
                    window.__dynamicElementObserver.disconnect();
                }
                if (window.__eventHooks) {
                    window.__eventHooks.forEach(hook => hook.restore());
                }

                // 存储新增的DOM元素
                window.__dynamicNewElements = [];
                window.__domChanges = [];
                window.__eventHooks = [];

                // 1. MutationObserver监听DOM变化
                window.__dynamicElementObserver = new MutationObserver((mutations) => {
                    mutations.forEach((mutation) => {
                        if (mutation.type === 'childList') {
                            mutation.addedNodes.forEach((node) => {
                                if (node.nodeType === Node.ELEMENT_NODE) {
                                    const element = node;
                                    // 检查是否是有意义的元素（有尺寸、可见、非脚本）
                                    if (element.tagName && 
                                        element.tagName !== 'SCRIPT' && 
                                        element.tagName !== 'STYLE') {
                                        
                                        const rect = element.getBoundingClientRect();
                                        const style = window.getComputedStyle(element);
                                        
                                        // 记录所有新增的元素，包括可能的下拉框、弹窗等
                                        const elementInfo = {
                                            timestamp: Date.now(),
                                            type: 'added',
                                            tagName: element.tagName,
                                            className: element.className || '',
                                            id: element.id || '',
                                            innerHTML: element.innerHTML.slice(0, 200),
                                            textContent: (element.textContent || '').slice(0, 100),
                                            isVisible: rect.width > 0 && rect.height > 0 && 
                                                      style.display !== 'none' && 
                                                      style.visibility !== 'hidden',
                                            position: {
                                                x: rect.x,
                                                y: rect.y,
                                                width: rect.width,
                                                height: rect.height
                                            },
                                            zIndex: style.zIndex,
                                            position_style: style.position,
                                            // 检查是否可能是交互元素
                                            isInteractive: this.isLikelyInteractive(element),
                                            cssSelector: this.generateCSSSelector(element)
                                        };
                                        
                                        window.__dynamicNewElements.push(elementInfo);
                                        window.__domChanges.push(elementInfo);
                                    }
                                }
                            });
                        }
                        
                        // 监听属性变化（如style, class变化可能显示隐藏元素）
                        if (mutation.type === 'attributes' && 
                            ['style', 'class', 'aria-hidden', 'hidden'].includes(mutation.attributeName)) {
                            const element = mutation.target;
                            if (element.nodeType === Node.ELEMENT_NODE) {
                                const rect = element.getBoundingClientRect();
                                const style = window.getComputedStyle(element);
                                
                                window.__domChanges.push({
                                    timestamp: Date.now(),
                                    type: 'attribute_changed',
                                    attributeName: mutation.attributeName,
                                    tagName: element.tagName,
                                    className: element.className || '',
                                    id: element.id || '',
                                    isVisible: rect.width > 0 && rect.height > 0 && 
                                              style.display !== 'none' && 
                                              style.visibility !== 'hidden',
                                    cssSelector: this.generateCSSSelector(element)
                                });
                            }
                        }
                    });
                });

                // 2. 劫持DOM插入API
                const originalAppendChild = Element.prototype.appendChild;
                const originalInsertBefore = Element.prototype.insertBefore;
                const originalReplaceChild = Element.prototype.replaceChild;

                Element.prototype.appendChild = function(child) {
                    const result = originalAppendChild.call(this, child);
                    if (child instanceof HTMLElement) {
                        window.__domChanges.push({
                            timestamp: Date.now(),
                            type: 'appendChild_hook',
                            parentTag: this.tagName,
                            childTag: child.tagName,
                            childClass: child.className || '',
                            childId: child.id || '',
                            cssSelector: window.__dynamicElementObserver.generateCSSSelector ? 
                                        window.__dynamicElementObserver.generateCSSSelector(child) : ''
                        });
                    }
                    return result;
                };

                Element.prototype.insertBefore = function(newNode, referenceNode) {
                    const result = originalInsertBefore.call(this, newNode, referenceNode);
                    if (newNode instanceof HTMLElement) {
                        window.__domChanges.push({
                            timestamp: Date.now(),
                            type: 'insertBefore_hook',
                            parentTag: this.tagName,
                            childTag: newNode.tagName,
                            childClass: newNode.className || '',
                            cssSelector: window.__dynamicElementObserver.generateCSSSelector ? 
                                        window.__dynamicElementObserver.generateCSSSelector(newNode) : ''
                        });
                    }
                    return result;
                };

                // 存储恢复函数
                window.__eventHooks.push({
                    restore: () => {
                        Element.prototype.appendChild = originalAppendChild;
                        Element.prototype.insertBefore = originalInsertBefore;
                        Element.prototype.replaceChild = originalReplaceChild;
                    }
                });

                // 3. 生成CSS选择器的辅助函数
                window.__dynamicElementObserver.generateCSSSelector = function(element) {
                    if (!element || !element.tagName) return '';
                    
                    // 简化版CSS选择器生成
                    let selector = element.tagName.toLowerCase();
                    
                    if (element.id) {
                        return `#${element.id}`;
                    }
                    
                    if (element.className && typeof element.className === 'string') {
                        const classes = element.className.trim().split(/\s+/).filter(cls => cls.length > 0).slice(0, 3);
                        if (classes.length > 0) {
                            selector += '.' + classes.join('.');
                        }
                    }
                    
                    return selector;
                };

                // 4. 检查元素是否可能是交互的
                window.__dynamicElementObserver.isLikelyInteractive = function(element) {
                    if (!element) return false;
                    
                    const tag = element.tagName.toLowerCase();
                    const className = (element.className || '').toLowerCase();
                    const role = element.getAttribute('role');
                    
                    // 基本交互元素
                    if (['button', 'a', 'input', 'select', 'textarea'].includes(tag)) {
                        return true;
                    }
                    
                    // 有交互相关role的元素
                    if (role && ['button', 'link', 'menuitem', 'option', 'tab'].includes(role.toLowerCase())) {
                        return true;
                    }
                    
                    // 有交互相关类名的元素
                    if (/btn|button|link|menu|dropdown|click|select|item|option|trigger|toggle/.test(className)) {
                        return true;
                    }
                    
                    // 有点击事件的元素
                    if (element.onclick || element.hasAttribute('onclick') || 
                        element.hasAttribute('ng-click') || element.hasAttribute('@click')) {
                        return true;
                    }
                    
                    // pointer cursor
                    const style = window.getComputedStyle(element);
                    if (style.cursor === 'pointer') {
                        return true;
                    }
                    
                    return false;
                };

                // 开始监听
                window.__dynamicElementObserver.observe(document.body, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['style', 'class', 'aria-hidden', 'hidden']
                });

                console.log('[Browser] 动态元素检测器已初始化，开始监听DOM变化');
                return true;
            });

            this.isMonitoring = true;
            console.log('[DynamicElementDetector] 初始化完成');
            return true;
        } catch (error) {
            console.error('[DynamicElementDetector] 初始化失败:', error);
            return false;
        }
    }

    /**
     * 拍摄DOM快照
     */
    async captureSnapshot(label = '') {
        console.log(`[DynamicElementDetector] 拍摄DOM快照: ${label}`);
        
        try {
            const snapshot = await this.page.evaluate(() => {
                const elements = [];
                const allElements = document.querySelectorAll('*');
                
                for (let i = 0; i < allElements.length; i++) {
                    const el = allElements[i];
                    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
                    
                    const rect = el.getBoundingClientRect();
                    const style = window.getComputedStyle(el);
                    
                    elements.push({
                        tagName: el.tagName,
                        className: el.className || '',
                        id: el.id || '',
                        textContent: (el.textContent || '').slice(0, 50),
                        isVisible: rect.width > 0 && rect.height > 0 && 
                                  style.display !== 'none' && 
                                  style.visibility !== 'hidden',
                        position: {
                            x: Math.round(rect.x),
                            y: Math.round(rect.y),
                            width: Math.round(rect.width),
                            height: Math.round(rect.height)
                        },
                        zIndex: style.zIndex,
                        position_style: style.position,
                        outerHTML: el.outerHTML.slice(0, 200)
                    });
                }
                
                return {
                    timestamp: Date.now(),
                    label: arguments[0] || '',
                    elements: elements,
                    totalElements: elements.length
                };
            }, label);

            return snapshot;
        } catch (error) {
            console.error('[DynamicElementDetector] 拍摄快照失败:', error);
            return null;
        }
    }

    /**
     * 开始监控（在执行动作前调用）
     */
    async startMonitoring() {
        if (!this.isMonitoring) {
            await this.initializeDetection();
        }
        
        // 清空之前的记录
        await this.page.evaluate(() => {
            window.__dynamicNewElements = [];
            window.__domChanges = [];
        });
        
        // 拍摄初始快照
        this.domSnapshotBefore = await this.captureSnapshot('before_action');
        console.log('[DynamicElementDetector] 开始监控，已拍摄初始快照');
    }

    /**
     * 停止监控并分析变化（在执行动作后调用）
     */
    async stopMonitoringAndAnalyze() {
        console.log('[DynamicElementDetector] 停止监控并分析变化...');
        
        // 等待DOM稳定
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 拍摄最终快照
        this.domSnapshotAfter = await this.captureSnapshot('after_action');
        
        // 获取MutationObserver收集的数据
        const mutationData = await this.page.evaluate(() => {
            return {
                newElements: window.__dynamicNewElements || [],
                allChanges: window.__domChanges || []
            };
        });

        // 分析变化
        const analysis = this.analyzeChanges(this.domSnapshotBefore, this.domSnapshotAfter, mutationData);
        
        console.log(`[DynamicElementDetector] 检测到 ${analysis.newElements.length} 个新增元素，${analysis.modifiedElements.length} 个修改元素`);
        
        return analysis;
    }

    /**
     * 分析DOM变化
     */
    analyzeChanges(beforeSnapshot, afterSnapshot, mutationData) {
        if (!beforeSnapshot || !afterSnapshot) {
            return {
                newElements: [],
                modifiedElements: [],
                removedElements: [],
                interactiveElements: [],
                dropdownElements: [],
                popupElements: []
            };
        }

        // 创建元素映射便于比较
        const beforeMap = new Map();
        beforeSnapshot.elements.forEach(el => {
            const key = `${el.tagName}_${el.className}_${el.id}_${el.textContent}`.replace(/\s+/g, '');
            beforeMap.set(key, el);
        });

        const afterMap = new Map();
        afterSnapshot.elements.forEach(el => {
            const key = `${el.tagName}_${el.className}_${el.id}_${el.textContent}`.replace(/\s+/g, '');
            afterMap.set(key, el);
        });

        // 找出新增元素
        const newElements = [];
        for (const [key, element] of afterMap) {
            if (!beforeMap.has(key) && element.isVisible) {
                newElements.push({
                    ...element,
                    detectionMethod: 'snapshot_comparison'
                });
            }
        }

        // 合并MutationObserver检测到的新增元素
        const mutationNewElements = mutationData.newElements
            .filter(el => el.isVisible && el.isInteractive)
            .map(el => ({
                ...el,
                detectionMethod: 'mutation_observer'
            }));

        // 所有新增的交互元素
        const allNewElements = [...newElements, ...mutationNewElements];

        // 分类检测到的元素
        const interactiveElements = allNewElements.filter(el => 
            this.isElementInteractive(el) || el.isInteractive);
        
        const dropdownElements = allNewElements.filter(el => 
            this.isDropdownElement(el));
        
        const popupElements = allNewElements.filter(el => 
            this.isPopupElement(el));

        // 检测修改的元素（位置或可见性变化）
        const modifiedElements = [];
        for (const [key, beforeEl] of beforeMap) {
            const afterEl = afterMap.get(key);
            if (afterEl && this.isElementModified(beforeEl, afterEl)) {
                modifiedElements.push({
                    before: beforeEl,
                    after: afterEl,
                    detectionMethod: 'snapshot_comparison'
                });
            }
        }

        return {
            newElements: allNewElements,
            modifiedElements,
            removedElements: [], // 暂不实现删除检测
            interactiveElements,
            dropdownElements,
            popupElements,
            mutationData,
            summary: {
                totalNew: allNewElements.length,
                totalInteractive: interactiveElements.length,
                totalDropdown: dropdownElements.length,
                totalPopup: popupElements.length
            }
        };
    }

    /**
     * 判断元素是否是交互式元素
     */
    isElementInteractive(element) {
        const tag = (element.tagName || '').toLowerCase();
        const className = (element.className || '').toLowerCase();
        
        // 基本交互元素
        if (['button', 'a', 'input', 'select', 'textarea'].includes(tag)) {
            return true;
        }
        
        // 有交互相关类名
        if (/btn|button|link|menu|dropdown|click|select|item|option|trigger|toggle|interactive/.test(className)) {
            return true;
        }
        
        // 可能的列表项
        if (tag === 'li' && /menu|nav|list|item/.test(className)) {
            return true;
        }
        
        return false;
    }

    /**
     * 判断元素是否是下拉框元素
     */
    isDropdownElement(element) {
        const className = (element.className || '').toLowerCase();
        const textContent = (element.textContent || '').toLowerCase();
        
        // 类名匹配
        if (/dropdown|select|menu|list|option|combo/.test(className)) {
            return true;
        }
        
        // 位置和样式特征
        if (element.position_style === 'absolute' || element.position_style === 'fixed') {
            if (element.position && element.position.height > 50 && 
                /menu|option|item|list/.test(className + textContent)) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * 判断元素是否是弹窗元素
     */
    isPopupElement(element) {
        const className = (element.className || '').toLowerCase();
        const zIndex = parseInt(element.zIndex) || 0;
        
        // 高z-index的fixed或absolute定位元素
        if ((element.position_style === 'fixed' || element.position_style === 'absolute') && 
            zIndex > 100) {
            return true;
        }
        
        // 典型弹窗类名
        if (/modal|dialog|popup|overlay|alert|toast|notification/.test(className)) {
            return true;
        }
        
        // 大尺寸的遮罩层
        if (element.position && element.position.width > 200 && element.position.height > 100 && 
            /mask|backdrop|overlay/.test(className)) {
            return true;
        }
        
        return false;
    }

    /**
     * 判断元素是否被修改
     */
    isElementModified(beforeEl, afterEl) {
        // 可见性变化
        if (beforeEl.isVisible !== afterEl.isVisible) {
            return true;
        }
        
        // 位置变化
        if (beforeEl.position && afterEl.position) {
            const positionChanged = 
                Math.abs(beforeEl.position.x - afterEl.position.x) > 5 ||
                Math.abs(beforeEl.position.y - afterEl.position.y) > 5 ||
                Math.abs(beforeEl.position.width - afterEl.position.width) > 5 ||
                Math.abs(beforeEl.position.height - afterEl.position.height) > 5;
            
            if (positionChanged) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * 生成检测到的新元素的CSS选择器
     */
    async generateSelectorsForNewElements(elements) {
        if (!elements || elements.length === 0) return [];
        
        console.log('[DynamicElementDetector] 为新元素生成CSS选择器...');
        
        const selectors = await this.page.evaluate((elementsData) => {
            const selectors = [];
            
            elementsData.forEach(elementData => {
                try {
                    // 尝试通过类名和标签生成选择器
                    let selector = elementData.tagName.toLowerCase();
                    
                    if (elementData.id) {
                        selectors.push(`#${elementData.id}`);
                        return;
                    }
                    
                    if (elementData.className) {
                        const classes = elementData.className.trim().split(/\s+/)
                            .filter(cls => cls.length > 0 && !cls.match(/\d{4,}/)) // 排除看起来像随机生成的类名
                            .slice(0, 3);
                        if (classes.length > 0) {
                            selector += '.' + classes.join('.');
                        }
                    }
                    
                    // 验证选择器有效性
                    try {
                        const matchedElements = document.querySelectorAll(selector);
                        if (matchedElements.length > 0 && matchedElements.length <= 10) {
                            selectors.push(selector);
                        }
                    } catch (e) {
                        // 选择器无效，跳过
                    }
                } catch (error) {
                    // 单个元素处理失败，继续下一个
                }
            });
            
            return [...new Set(selectors)]; // 去重
        }, elements);
        
        console.log(`[DynamicElementDetector] 生成了 ${selectors.length} 个CSS选择器`);
        return selectors;
    }

    /**
     * 清理资源
     */
    async cleanup() {
        if (this.isMonitoring) {
            try {
                await this.page.evaluate(() => {
                    if (window.__dynamicElementObserver) {
                        window.__dynamicElementObserver.disconnect();
                    }
                    if (window.__eventHooks) {
                        window.__eventHooks.forEach(hook => hook.restore());
                    }
                    
                    // 清理全局变量
                    delete window.__dynamicElementObserver;
                    delete window.__dynamicNewElements;
                    delete window.__domChanges;
                    delete window.__eventHooks;
                });
                
                this.isMonitoring = false;
                console.log('[DynamicElementDetector] 资源清理完成');
            } catch (error) {
                console.warn('[DynamicElementDetector] 清理资源时出错:', error);
            }
        }
    }
}

module.exports = DynamicElementDetector;
