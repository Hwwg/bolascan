// 元素检测器
class ElementDetector {
    constructor(config = {}) {
        this.config = config;
        // 可扩展：加载静态规则、LLM配置等
    }

    /**
     * 应用静态规则检测页面可交互元素
     * @param {PageWrapper} pageWrapper
     * @param {string} htmlContent
     * @returns {Promise<Array>} 元素数组
     */
    async detectStaticElements(pageWrapper) {
        // 直接在页面上下文中用静态规则查找可交互元素
        if (!pageWrapper.page) {
            await pageWrapper.init();
        }
        return await pageWrapper.page.evaluate(() => {
            const selectors = [
                // 基本可交互元素
                'a[href]', 'button', 'input[type="button"]', 'input[type="submit"]',
                '[role="button"]', '[onclick]', '[tabindex]',
                
                // 扩展的导航和菜单元素
                '[role="menuitem"]', '[role="menu"] li', '[role="tab"]', 
                '.ant-menu-item', '.dropdown-trigger', '.nav-item', '.menu-item',
                '[aria-haspopup="true"]', '.ant-dropdown-trigger', 
                
                // 可交互的列表项
                'li[tabindex]', 'li[data-menu-id]', 'li.ant-menu-item',
                'li.nav-item', 'li.item', 'li[role]'
            ];
            
            /**
             * 生成高质量的CSS选择器
             * @param {Element} element - DOM元素
             * @returns {string} CSS选择器
             */
            function generateCSSSelector(element) {
                if (!element || element.nodeType !== Node.ELEMENT_NODE) {
                    return '';
                }
                
                // 如果有唯一的ID，优先使用
                if (element.id && document.querySelectorAll('#' + element.id).length === 1) {
                    return '#' + element.id;
                }
                
                // 构建选择器路径
                const path = [];
                let current = element;
                
                while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
                    let selector = current.tagName.toLowerCase();
                    
                    // 添加class信息（选择有意义的class）
                    if (current.className && typeof current.className === 'string') {
                        const classes = current.className.split(/\s+/).filter(cls => 
                            cls && !cls.match(/^(ng-|v-|_|css-)/)); // 过滤框架生成的class
                        if (classes.length > 0) {
                            selector += '.' + classes.slice(0, 2).join('.'); // 最多使用2个class
                        }
                    }
                    
                    // 添加关键属性
                    if (current.getAttribute('role')) {
                        selector += '[role="' + current.getAttribute('role') + '"]';
                    }
                    if (current.getAttribute('data-testid')) {
                        selector += '[data-testid="' + current.getAttribute('data-testid') + '"]';
                    }
                    
                    // 如果当前选择器已经唯一，就停止
                    const tempPath = [selector, ...path].join(' > ');
                    if (document.querySelectorAll(tempPath).length === 1) {
                        return tempPath;
                    }
                    
                    // 添加nth-child（作为最后手段）
                    const siblings = Array.from(current.parentNode?.children || []);
                    const index = siblings.indexOf(current);
                    if (index >= 0 && siblings.length > 1) {
                        selector += ':nth-child(' + (index + 1) + ')';
                    }
                    
                    path.unshift(selector);
                    current = current.parentElement;
                    
                    // 防止路径过长
                    if (path.length > 6) break;
                }
                
                return path.join(' > ');
            }
            
            const nodes = Array.from(document.querySelectorAll(selectors.join(',')));
            return nodes.map(node => {
                const cssSelector = generateCSSSelector(node);
                return {
                    tag: node.tagName,
                    selector: cssSelector || node.tagName.toLowerCase(), // 使用CSS选择器而不是outerHTML
                    visible: !!(node.offsetWidth || node.offsetHeight || node.getClientRects().length),
                    text: (node.innerText || node.value || '').trim().substring(0, 100), // 限制文本长度
                    outerHTML: node.outerHTML.substring(0, 200) + '...' // 保留HTML用于调试，但限制长度
                };
            });
        });
    }

    /**
     * 使用LLM检测页面可交互元素
     * @param {PageWrapper} pageWrapper
     * @param {string} htmlContent
     * @returns {Promise<Array>} 元素数组
     */
    async detectWithLLM(htmlContent) {
    const LLMElementHelper = require('../llm/llm-element-helper');
    const llmHelper = new LLMElementHelper();
    let selectors = [];
    let formTestData = {};
    try {
        selectors = await llmHelper.getClickableSelectors(htmlContent);
        // 新增：自动生成表单测试数据
        formTestData = await llmHelper.generateFormTestData(htmlContent);
        console.log(`[ElementDetector] LLM检测到 ${selectors.length} 个可点击元素`);
    } catch (e) {
        console.error('[ElementDetector] LLM元素检测失败:', e);
        selectors = []; // 确保在出错时也是空数组
    }
    
    // 转换为标准元素对象数组格式，与detectStaticElements保持一致
    const clickableElements = selectors.map(sel => ({
        tag: '',
        selector: sel,
        visible: true,
        text: ''
    }));
    
    // 存储表单测试数据，供后续使用
    this.formTestData = formTestData;
    
    // 只返回可点击元素数组，与detectStaticElements保持一致的返回格式
    return clickableElements;
}

    /**
     * 过滤重复元素
     * @param {Array} elements
     * @returns {Array}
     */
    filterDuplicates(elements) {
        const seen = new Set();
        return elements.filter(el => {
            const key = el.selector || el.tag + JSON.stringify(el);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    /**
     * 元素分类（按钮、链接、表单等）
     * @param {Array} elements
     * @returns {Object} 分类结果
     */
    categorizeElements(elements) {
        const categories = { button: [], link: [], form: [], other: [] };
        for (const el of elements) {
            const elTagLower = (el.tag || '').toLowerCase();
            const elSelectorLower = (el.selector || '').toLowerCase();
            
            if (el.tag === 'BUTTON' || /button/i.test(el.selector) || el.tag === 'INPUT' && /button|submit/i.test(elSelectorLower)) {
                categories.button.push(el);
            } else if (el.tag === 'A' || /href/i.test(el.selector)) {
                categories.link.push(el);
            } else if (el.tag === 'FORM' || /form/i.test(el.selector)) {
                categories.form.push(el);
            } else if (/input|select|textarea/i.test(elTagLower)) {
                categories.form.push(el);
            } else {
                // 改进的其他可交互元素检测
                const isClickable = (
                    /tabindex/i.test(elSelectorLower) || 
                    /role="(menuitem|button|link|option|tab)"/i.test(elSelectorLower) ||
                    /onclick/i.test(elSelectorLower) ||
                    /ant-menu-item|dropdown-trigger|menu-item/i.test(elSelectorLower) ||
                    /li\s+class="[^"]*item/i.test(elSelectorLower)
                );
                
                if (isClickable) {
                    categories.other.push(el);
                }
            }
        }
        return categories;
    }

    /**
     * 元素优先级排序
     * @param {Array} elements
     * @returns {Array}
     */
    prioritizeElements(elements) {
        // 简单优先级：按钮 > 链接 > 其他
        const priority = el => {
            if (el.tag === 'BUTTON' || /button/i.test(el.selector)) return 1;
            if (el.tag === 'A') return 2;
            return 3;
        };
        return elements.slice().sort((a, b) => priority(a) - priority(b));
    }
}

module.exports = ElementDetector;
