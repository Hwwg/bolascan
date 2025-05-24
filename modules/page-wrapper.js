const puppeteer = require('puppeteer');

// 页面交互封装

class PageWrapper {
    constructor(browserInstance = null) {
        this.browser = browserInstance;
        this.page = null;
    }

    async init() {
        if (!this.browser) {
            this.browser = await puppeteer.launch({ headless: false });
        }
        if (!this.page) {
            this.page = await this.browser.newPage();
        }
    }

    async goto(url) {
        // 确保页面已初始化，导航到指定URL，等待页面加载完成
        if (!this.page) {
            await this.init();
        }
        
        try {
            // 设置更长的超时时间，并使用domcontentloaded作为备选加载策略
            await this.page.goto(url, { 
                waitUntil: ['networkidle2', 'domcontentloaded'], 
                timeout: 30000 
            });
            console.log(`[PageWrapper] 页面加载完成: ${url}`);
        } catch (error) {
            console.warn(`[PageWrapper] 页面加载超时或出错: ${error.message}`);
            // 尝试使用只等待DOM内容加载的方式重试
            try {
                await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
                console.log(`[PageWrapper] 使用备选策略加载页面成功: ${url}`);
            } catch (retryError) {
                console.error(`[PageWrapper] 页面加载彻底失败: ${retryError.message}`);
                // 继续执行，不抛出异常，以免中断整个扫描流程
            }
        }
    }

    async getAllClickableElements() {
        // 在页面中查找所有可能可点击的元素，返回元素的基本信息（如标签、选择器、可见性等）
        if (!this.page) {
            await this.init();
        }
        const selectors = [
            'a[href]', 'button', 'input[type="button"]', 'input[type="submit"]',
            '[role="button"]', '[onclick]', '[tabindex]'
        ];
        return await this.page.$$eval(selectors.join(','), nodes =>
            nodes.map(node => ({
                tag: node.tagName,
                selector: node.outerHTML,
                visible: !!(node.offsetWidth || node.offsetHeight || node.getClientRects().length),
                text: node.innerText || node.value || ''
            }))
        );
    }

    async clickElement(element) {
        // 根据传入的元素信息，定位并点击该元素，等待页面跳转或内容变化，返回点击结果和新URL
        if (!this.page) {
            await this.init();
        }
        
        console.log(`[PageWrapper] 尝试点击元素...`);
        let result = { clicked: false, newUrl: null, error: null };
        
        try {
            if (typeof element === 'string') {
                // 如果element是CSS选择器
                await this.page.click(element);
                result.clicked = true;
            } else if (element && element.selector) {
                // 如果element是我们内部使用的元素对象格式
                await this.page.evaluate((selectorHtml) => {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = selectorHtml;
                    const tempEl = tempDiv.firstChild;
                    
                    // 尝试查找匹配的元素
                    const matchedElements = document.querySelectorAll(tempEl.tagName);
                    for (const el of matchedElements) {
                        if (el.outerHTML === selectorHtml) {
                            el.click();
                            return true;
                        }
                    }
                    return false;
                }, element.selector);
                result.clicked = true;
            }
            
            // 等待可能的导航完成
            try {
                await this.waitForNavigation();
                result.newUrl = await this.page.url();
            } catch (navError) {
                console.log(`[PageWrapper] 点击后没有发生导航，可能是页内交互`);
            }
        } catch (error) {
            console.error(`[PageWrapper] 点击元素时出错:`, error.message);
            result.error = error.message;
        }
        
        return result;
    }

    async fillInput(selector, value) {
        // 在页面中找到指定的输入框，并填充指定的内容
        if (!this.page) {
            await this.init();
        }
        
        try {
            if (typeof selector === 'string') {
                // 如果selector是CSS选择器
                await this.page.type(selector, value.toString());
                return true;
            } else if (selector && selector.selector) {
                // 如果selector是我们内部使用的元素对象格式
                const result = await this.page.evaluate((selectorHtml, inputValue) => {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = selectorHtml;
                    const tempEl = tempDiv.firstChild;
                    
                    // 尝试查找匹配的元素
                    const matchedElements = document.querySelectorAll(tempEl.tagName);
                    for (const el of matchedElements) {
                        if (el.outerHTML === selectorHtml) {
                            el.value = inputValue;
                            // 触发input和change事件，模拟用户输入
                            const event = new Event('input', { bubbles: true });
                            el.dispatchEvent(event);
                            const changeEvent = new Event('change', { bubbles: true });
                            el.dispatchEvent(changeEvent);
                            return true;
                        }
                    }
                    return false;
                }, selector.selector, value.toString());
                return result;
            }
        } catch (error) {
            console.error(`[PageWrapper] 填充输入框时出错:`, error.message);
            return false;
        }
    }

    async waitForNavigation(options = {}) {
        // 等待页面发生导航（如跳转、刷新等），设置超时时间，防止长时间等待
        if (!this.page) {
            await this.init();
        }
        
        const defaultOptions = {
            timeout: 5000,  // 5秒超时
            waitUntil: 'networkidle2'
        };
        
        const mergedOptions = { ...defaultOptions, ...options };
        
        try {
            await this.page.waitForNavigation(mergedOptions);
            return true;
        } catch (error) {
            if (error.name === 'TimeoutError') {
                // 导航超时，可能是页内交互
                console.log(`[PageWrapper] 导航等待超时，可能没有页面跳转`);
                return false;
            }
            console.error(`[PageWrapper] 等待导航时出错:`, error.message);
            throw error;
        }
    }

    async evaluatePage(script) {
        // 在页面上下文中执行传入的脚本，返回执行结果
        // script 应为字符串，如 'document.documentElement.outerHTML'
        if (!this.page) {
            await this.init();
        }
        return await this.page.evaluate(new Function('return ' + script));
    }

    async checkElementVisibility(element) {
        // 检查元素在页面上是否可见，避免对不可见元素进行操作
        if (!this.page) {
            await this.init();
        }
        
        try {
            // 使用puppeteer的isVisible方法检查元素可见性
            // 如果element是一个选择器字符串，先尝试找到元素
            let isVisible = false;
            
            if (typeof element === 'string') {
                // 如果element是CSS选择器
                isVisible = await this.page.evaluate(selector => {
                    const el = document.querySelector(selector);
                    if (!el) return false;
                    const style = window.getComputedStyle(el);
                    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && 
                           style.visibility !== 'hidden' && 
                           style.display !== 'none';
                }, element);
            } else if (element && element.selector) {
                // 如果element是我们内部使用的元素对象格式
                const selector = element.selector;
                console.log(`[PageWrapper] 检查元素可见性，选择器: ${selector.slice(0, 50)}...`);
                
                isVisible = await this.page.evaluate(selectorHtml => {
                    // 从HTML创建临时元素，然后使用querySelector找到匹配的元素
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = selectorHtml;
                    const tempEl = tempDiv.firstChild;
                    
                    // 尝试查找匹配的元素
                    const matchedElements = document.querySelectorAll(tempEl.tagName);
                    for (const el of matchedElements) {
                        if (el.outerHTML === selectorHtml) {
                            const style = window.getComputedStyle(el);
                            return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && 
                                   style.visibility !== 'hidden' && 
                                   style.display !== 'none';
                        }
                    }
                    return false;
                }, selector);
            }
            
            console.log(`[PageWrapper] 元素可见性检查结果: ${isVisible}`);
            return isVisible;
        } catch (error) {
            console.warn(`[PageWrapper] 检查元素可见性时出错: ${error.message}`);
            // 默认返回true，在出错的情况下尝试点击元素
            return true;
        }
    }

    async close() {
        if (this.page) {
            await this.page.close();
            this.page = null;
        }
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}
    module.exports = PageWrapper;