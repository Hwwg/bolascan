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
                const selector = element.selector;
                const isHtmlSelector = selector.trim().startsWith('<');
                
                if (isHtmlSelector) {
                    // 旧的HTML选择器处理方式
                    await this.page.evaluate((selectorHtml) => {
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = selectorHtml;
                        const tempEl = tempDiv.firstChild;
                        
                        if (!tempEl) return false;
                        
                        // 尝试查找匹配的元素
                        const matchedElements = document.querySelectorAll(tempEl.tagName);
                        for (const el of matchedElements) {
                            if (el.outerHTML === selectorHtml) {
                                el.click();
                                return true;
                            }
                        }
                        return false;
                    }, selector);
                } else {
                    // 新的CSS选择器处理方式
                    await this.page.click(selector);
                }
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
                
                // 判断是HTML选择器还是CSS选择器
                const isHtmlSelector = selector.trim().startsWith('<');
                
                if (isHtmlSelector) {
                    // 旧的HTML选择器处理方式
                    isVisible = await this.page.evaluate(selectorHtml => {
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = selectorHtml;
                        const tempEl = tempDiv.firstChild;
                        
                        if (!tempEl) return false;
                        
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
                } else {
                    // 新的CSS选择器处理方式
                    isVisible = await this.page.evaluate(cssSelector => {
                        const el = document.querySelector(cssSelector);
                        if (!el) return false;
                        const style = window.getComputedStyle(el);
                        return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && 
                               style.visibility !== 'hidden' && 
                               style.display !== 'none';
                    }, selector);
                }
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

    async submitForm(formElement, formData) {
        // 提交表单，使用传入的表单数据
        if (!this.page) {
            await this.init();
        }
        
        try {
            console.log(`[PageWrapper] 开始填充并提交表单...`);
            
            // 记录提交前的URL
            const beforeUrl = await this.page.url();
            
            // 填充表单数据
            for (const [selector, value] of Object.entries(formData)) {
                try {
                    console.log(`[PageWrapper] 填充字段: ${selector} = ${value}`);
                    
                    // 尝试找到并填充字段
                    const element = await this.page.$(selector);
                    if (element) {
                        // 清空并填充新值
                        await element.click({ clickCount: 3 }); // 选中所有文本
                        await element.type(value.toString(), { delay: 50 });
                        
                        // 触发事件
                        await this.page.evaluate((sel) => {
                            const el = document.querySelector(sel);
                            if (el) {
                                el.dispatchEvent(new Event('input', { bubbles: true }));
                                el.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        }, selector);
                    } else {
                        console.warn(`[PageWrapper] 字段不存在: ${selector}`);
                    }
                } catch (fieldError) {
                    console.warn(`[PageWrapper] 填充字段失败 ${selector}: ${fieldError.message}`);
                }
            }
            
            // 等待一下让表单数据生效
            await new Promise(r => setTimeout(r, 500));
            
            // 提交表单
            let submitted = false;
            try {
                // 1. 尝试找到提交按钮
                const submitSelectors = [
                    'button[type="submit"]',
                    'input[type="submit"]',
                    'form button:not([type="button"]):not([type="reset"])',
                    '.submit-btn',
                    '.btn-submit',
                    'button.primary',
                    'form button:last-child'
                ];
                
                for (const selector of submitSelectors) {
                    try {
                        const submitBtn = await this.page.$(selector);
                        if (submitBtn) {
                            console.log(`[PageWrapper] 找到提交按钮: ${selector}`);
                            await submitBtn.click();
                            submitted = true;
                            break;
                        }
                    } catch (btnError) {
                        continue;
                    }
                }
                
                // 2. 如果没找到按钮，尝试表单submit方法
                if (!submitted) {
                    console.log(`[PageWrapper] 未找到提交按钮，尝试表单submit方法`);
                    await this.page.evaluate(() => {
                        const forms = document.querySelectorAll('form');
                        if (forms.length > 0) {
                            forms[0].submit();
                            return true;
                        }
                        return false;
                    });
                    submitted = true;
                }
                
                // 3. 如果还是失败，按Enter键
                if (!submitted) {
                    console.log(`[PageWrapper] 尝试按Enter键提交`);
                    await this.page.keyboard.press('Enter');
                    submitted = true;
                }
            } catch (submitError) {
                console.warn(`[PageWrapper] 提交表单时出错: ${submitError.message}`);
            }
            
            // 等待可能的页面跳转或反应
            await new Promise(r => setTimeout(r, 2000));
            
            // 检查提交结果
            const afterUrl = await this.page.url();
            const urlChanged = afterUrl !== beforeUrl;
            
            // 检查是否有错误信息
            const hasErrors = await this.page.evaluate(() => {
                const errorSelectors = [
                    '.error', '.alert-error', '.form-error', '.invalid-feedback',
                    '.ant-form-item-explain-error', '.field-error', '.validation-error'
                ];
                
                for (const selector of errorSelectors) {
                    const errorEl = document.querySelector(selector);
                    if (errorEl && errorEl.textContent.trim()) {
                        return true;
                    }
                }
                return false;
            });
            
            return {
                success: submitted && !hasErrors,
                newUrl: urlChanged ? afterUrl : null,
                urlChanged: urlChanged,
                hasErrors: hasErrors,
                submitted: submitted
            };
            
        } catch (error) {
            console.error(`[PageWrapper] 提交表单时出错: ${error.message}`);
            return {
                success: false,
                error: error.message,
                newUrl: null,
                urlChanged: false,
                hasErrors: true,
                submitted: false
            };
        }
    }
    
    async getFormErrorFeedback(formElement) {
        // 获取表单错误反馈信息
        if (!this.page) {
            await this.init();
        }
        
        try {
            const errorFeedback = await this.page.evaluate(() => {
                const errorSelectors = [
                    '.error', '.alert-error', '.form-error', '.invalid-feedback',
                    '.ant-form-item-explain-error', '.field-error', '.validation-error',
                    '.help-block.error', '.form-control-feedback', '.text-danger',
                    '[role="alert"]', '.alert', '.message-error'
                ];
                
                const errors = [];
                
                for (const selector of errorSelectors) {
                    const errorElements = document.querySelectorAll(selector);
                    errorElements.forEach(el => {
                        const text = el.textContent.trim();
                        if (text && !errors.includes(text)) {
                            errors.push(text);
                        }
                    });
                }
                
                return errors.length > 0 ? errors.join('; ') : '未检测到具体错误信息';
            });
            
            console.log(`[PageWrapper] 获取到表单错误反馈: ${errorFeedback}`);
            return errorFeedback;
            
        } catch (error) {
            console.warn(`[PageWrapper] 获取表单错误反馈时出错: ${error.message}`);
            return '获取错误反馈失败';
        }
    }
    
    async submitFormWithLLMSelectors(formElement, formData, submitSelectors = [], recommendedSubmitSelector = '', submitStrategy = 'button_click') {
        // 使用LLM生成的提交选择器提交表单
        if (!this.page) {
            await this.init();
        }
        
        try {
            console.log(`[PageWrapper] 开始填充并提交表单（使用LLM提交选择器）...`);
            console.log(`[PageWrapper] 推荐的提交选择器: ${recommendedSubmitSelector}`);
            console.log(`[PageWrapper] 提交策略: ${submitStrategy}`);
            console.log(`[PageWrapper] 备选提交选择器:`, submitSelectors);
            
            // 记录提交前的URL
            const beforeUrl = await this.page.url();
            
            // 填充表单数据
            for (const [selector, value] of Object.entries(formData)) {
                try {
                    console.log(`[PageWrapper] 填充字段: ${selector} = ${value}`);
                    
                    // 尝试找到并填充字段
                    const element = await this.page.$(selector);
                    if (element) {
                        // 检查元素类型
                        const elementInfo = await this.page.evaluate((el) => {
                            return {
                                tagName: el.tagName,
                                type: el.type,
                                disabled: el.disabled,
                                readonly: el.readOnly
                            };
                        }, element);
                        
                        if (elementInfo.disabled || elementInfo.readonly) {
                            console.warn(`[PageWrapper] 字段 ${selector} 被禁用或只读，跳过填充`);
                            continue;
                        }
                        
                        // 根据元素类型选择填充方式
                        if (elementInfo.type === 'select-one' || elementInfo.type === 'select-multiple' || elementInfo.tagName === 'SELECT') {
                            await this.page.select(selector, value.toString());
                        } else if (elementInfo.type === 'checkbox' || elementInfo.type === 'radio') {
                            await element.click();
                        } else {
                            await element.focus();
                            await element.click({ clickCount: 3 }); // 选中所有文本
                            await this.page.keyboard.press('Delete'); // 清空内容
                            await element.type(value.toString(), { delay: 50 });
                        }
                        
                        // 触发事件
                        await this.page.evaluate((sel) => {
                            const el = document.querySelector(sel);
                            if (el) {
                                ['input', 'change', 'blur', 'keyup'].forEach(eventType => {
                                    el.dispatchEvent(new Event(eventType, { bubbles: true }));
                                });
                            }
                        }, selector);
                        
                        console.log(`[PageWrapper] 成功填充字段: ${selector}`);
                    } else {
                        console.warn(`[PageWrapper] 字段不存在: ${selector}`);
                    }
                } catch (fieldError) {
                    console.warn(`[PageWrapper] 填充字段失败 ${selector}: ${fieldError.message}`);
                    
                    // 对特定错误进行重试和回退处理
                    if (fieldError.message.includes('not clickable') || fieldError.message.includes('not an Element')) {
                        console.log(`[PageWrapper] 尝试回退策略填充字段: ${selector}`);
                        try {
                            await this._fallbackFillField(selector, value);
                            console.log(`[PageWrapper] 回退策略成功填充字段: ${selector}`);
                        } catch (fallbackError) {
                            console.error(`[PageWrapper] 回退策略也失败 ${selector}: ${fallbackError.message}`);
                        }
                    }
                }
            }
            
            // 等待一下让表单数据生效
            await new Promise(r => setTimeout(r, 500));
            
            // 提交表单
            let submitted = false;
            
            try {
                // 1. 首先尝试推荐的提交选择器
                if (recommendedSubmitSelector && !submitted) {
                    console.log(`[PageWrapper] 尝试推荐的提交选择器: ${recommendedSubmitSelector}`);
                    try {
                        const submitBtn = await this.page.$(recommendedSubmitSelector);
                        if (submitBtn) {
                            const isVisible = await this.page.evaluate((btn) => {
                                const rect = btn.getBoundingClientRect();
                                const style = window.getComputedStyle(btn);
                                return rect.width > 0 && rect.height > 0 && 
                                       style.display !== 'none' && 
                                       style.visibility !== 'hidden' &&
                                       !btn.disabled;
                            }, submitBtn);
                            
                            if (isVisible) {
                                console.log(`[PageWrapper] 使用推荐的提交按钮: ${recommendedSubmitSelector}`);
                                await submitBtn.click();
                                submitted = true;
                            } else {
                                console.log(`[PageWrapper] 推荐的提交按钮不可用: ${recommendedSubmitSelector}`);
                            }
                        }
                    } catch (btnError) {
                        console.log(`[PageWrapper] 推荐的提交选择器失败: ${btnError.message}`);
                    }
                }
                
                // 2. 尝试其他LLM生成的提交选择器
                if (!submitted && submitSelectors.length > 0) {
                    console.log(`[PageWrapper] 尝试其他LLM生成的提交选择器...`);
                    for (const selector of submitSelectors) {
                        if (selector === recommendedSubmitSelector) continue; // 跳过已尝试的推荐选择器
                        
                        try {
                            const submitBtn = await this.page.$(selector);
                            if (submitBtn) {
                                const isVisible = await this.page.evaluate((btn) => {
                                    const rect = btn.getBoundingClientRect();
                                    const style = window.getComputedStyle(btn);
                                    return rect.width > 0 && rect.height > 0 && 
                                           style.display !== 'none' && 
                                           style.visibility !== 'hidden' &&
                                           !btn.disabled;
                                }, submitBtn);
                                
                                if (isVisible) {
                                    console.log(`[PageWrapper] 找到可用的LLM提交按钮: ${selector}`);
                                    await submitBtn.click();
                                    submitted = true;
                                    break;
                                } else {
                                    console.log(`[PageWrapper] LLM提交按钮不可用: ${selector}`);
                                }
                            }
                        } catch (btnError) {
                            console.log(`[PageWrapper] LLM提交选择器失败: ${selector} - ${btnError.message}`);
                            continue;
                        }
                    }
                }
                
                // 3. 根据提交策略执行相应操作
                if (!submitted) {
                    console.log(`[PageWrapper] 根据提交策略执行: ${submitStrategy}`);
                    switch (submitStrategy) {
                        case 'form_submit':
                            await this.page.evaluate(() => {
                                const forms = document.querySelectorAll('form');
                                if (forms.length > 0) {
                                    forms[0].submit();
                                    return true;
                                }
                                return false;
                            });
                            submitted = true;
                            break;
                        case 'enter_key':
                            await this.page.keyboard.press('Enter');
                            submitted = true;
                            break;
                        default: // 'button_click'
                            // 降级到原有的静态选择器方法
                            console.log(`[PageWrapper] 降级到原有的静态选择器方法...`);
                            return await this.submitForm(formElement, formData);
                    }
                }
                
            } catch (submitError) {
                console.warn(`[PageWrapper] 提交表单时出错: ${submitError.message}`);
            }
            
            // 等待可能的页面跳转或反应
            await new Promise(r => setTimeout(r, 2000));
            
            // 检查提交结果
            const afterUrl = await this.page.url();
            const urlChanged = afterUrl !== beforeUrl;
            
            // 增强的提交验证机制
            const validationResult = await this._validateSubmissionSuccess(beforeUrl, afterUrl, submitted);
            
            return {
                success: validationResult.success,
                newUrl: urlChanged ? afterUrl : null,
                urlChanged: urlChanged,
                hasErrors: validationResult.hasErrors,
                submitted: submitted,
                usedSelector: recommendedSubmitSelector, // 记录使用的选择器
                submitStrategy: submitStrategy,
                validationDetails: validationResult // 添加详细验证信息
            };
            
        } catch (error) {
            console.error(`[PageWrapper] 提交表单时出错: ${error.message}`);
            return {
                success: false,
                error: error.message,
                newUrl: null,
                urlChanged: false,
                hasErrors: true,
                submitted: false,
                usedSelector: '',
                submitStrategy: submitStrategy
            };
        }
    }
    
    /**
     * 回退策略填充表单字段（处理元素不可点击或无效的情况）
     * @param {string} selector - CSS选择器
     * @param {string} value - 要填充的值
     * @returns {Promise<boolean>} - 是否成功填充
     */
    async _fallbackFillField(selector, value) {
        if (!this.page) {
            await this.init();
        }
        
        try {
            console.log(`[PageWrapper] 执行回退填充策略: ${selector}`);
            
            // 策略1: 使用evaluate直接设置value属性
            const strategy1Success = await this.page.evaluate((sel, val) => {
                try {
                    const element = document.querySelector(sel);
                    if (element) {
                        // 直接设置value属性
                        element.value = val;
                        
                        // 触发各种事件来模拟用户输入
                        ['focus', 'input', 'change', 'blur', 'keyup', 'keydown'].forEach(eventType => {
                            try {
                                const event = new Event(eventType, { bubbles: true, cancelable: true });
                                element.dispatchEvent(event);
                            } catch (e) {
                                // 忽略事件触发失败
                            }
                        });
                        
                        // 对于React组件，尝试触发React的change事件
                        try {
                            const reactEvent = new Event('input', { bubbles: true });
                            Object.defineProperty(reactEvent, 'target', { value: element });
                            element.dispatchEvent(reactEvent);
                        } catch (e) {
                            // 忽略React事件触发失败
                        }
                        
                        return true;
                    }
                    return false;
                } catch (e) {
                    console.error('策略1失败:', e.message);
                    return false;
                }
            }, selector, value.toString());
            
            if (strategy1Success) {
                console.log(`[PageWrapper] 策略1成功: 直接设置value属性`);
                return true;
            }
            
            // 策略2: 尝试滚动到元素并等待可见后再点击
            console.log(`[PageWrapper] 策略1失败，尝试策略2: 滚动到元素`);
            const strategy2Success = await this.page.evaluate((sel, val) => {
                try {
                    const element = document.querySelector(sel);
                    if (element) {
                        // 滚动到元素
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        
                        // 等待一小段时间让滚动完成
                        return new Promise(resolve => {
                            setTimeout(() => {
                                try {
                                    // 尝试focus
                                    element.focus();
                                    
                                    // 清空并设置新值
                                    element.value = '';
                                    element.value = val;
                                    
                                    // 触发事件
                                    ['focus', 'input', 'change', 'blur'].forEach(eventType => {
                                        const event = new Event(eventType, { bubbles: true });
                                        element.dispatchEvent(event);
                                    });
                                    
                                    resolve(true);
                                } catch (e) {
                                    resolve(false);
                                }
                            }, 500);
                        });
                    }
                    return false;
                } catch (e) {
                    return false;
                }
            }, selector, value.toString());
            
            if (strategy2Success) {
                console.log(`[PageWrapper] 策略2成功: 滚动到元素后填充`);
                return true;
            }
            
            // 策略3: 尝试使用不同的选择器匹配策略
            console.log(`[PageWrapper] 策略2失败，尝试策略3: 模糊选择器匹配`);
            const strategy3Success = await this.page.evaluate((sel, val) => {
                try {
                    // 尝试通过name属性匹配
                    const selectorParts = sel.split(/[#\.\[\]:]/);
                    const nameHint = selectorParts.find(part => part && part.length > 2);
                    
                    if (nameHint) {
                        // 尝试多种选择器组合
                        const alternativeSelectors = [
                            `input[name*="${nameHint}"]`,
                            `input[id*="${nameHint}"]`,
                            `input[placeholder*="${nameHint}"]`,
                            `textarea[name*="${nameHint}"]`,
                            `select[name*="${nameHint}"]`,
                            `*[name="${nameHint}"]`
                        ];
                        
                        for (const altSel of alternativeSelectors) {
                            const element = document.querySelector(altSel);
                            if (element && element.offsetParent !== null) { // 检查可见性
                                element.value = val;
                                
                                ['input', 'change', 'blur'].forEach(eventType => {
                                    const event = new Event(eventType, { bubbles: true });
                                    element.dispatchEvent(event);
                                });
                                
                                return true;
                            }
                        }
                    }
                    
                    return false;
                } catch (e) {
                    return false;
                }
            }, selector, value.toString());
            
            if (strategy3Success) {
                console.log(`[PageWrapper] 策略3成功: 模糊选择器匹配`);
                return true;
            }
            
            console.log(`[PageWrapper] 所有回退策略都失败了`);
            return false;
            
        } catch (error) {
            console.error(`[PageWrapper] 回退填充策略执行失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 增强的提交验证机制 - 检测表单是否被正确提交
     * @param {string} beforeUrl - 提交前的URL
     * @param {string} afterUrl - 提交后的URL  
     * @param {boolean} submitted - 是否已执行提交操作
     * @returns {Promise<Object>} - 验证结果详情
     */
    async _validateSubmissionSuccess(beforeUrl, afterUrl, submitted) {
        try {
            const validationChecks = {
                urlChanged: beforeUrl !== afterUrl,
                hasErrors: false,
                hasSuccessIndicators: false,
                formStillVisible: false,
                loadingIndicators: false
            };

            // 1. 检查错误信息
            validationChecks.hasErrors = await this.page.evaluate(() => {
                const errorSelectors = [
                    '.error', '.alert-error', '.form-error', '.invalid-feedback',
                    '.ant-form-item-explain-error', '.field-error', '.validation-error',
                    '.help-block.error', '.form-control-feedback', '.text-danger',
                    '[role="alert"]', '.alert-danger', '.message-error'
                ];
                
                for (const selector of errorSelectors) {
                    const errorEl = document.querySelector(selector);
                    if (errorEl && errorEl.textContent.trim()) {
                        return true;
                    }
                }
                return false;
            });

            // 2. 检查成功指示器
            validationChecks.hasSuccessIndicators = await this.page.evaluate(() => {
                const successSelectors = [
                    '.success', '.alert-success', '.form-success', '.valid-feedback',
                    '.ant-message-success', '.message-success', '.alert-success',
                    '[role="status"]', '.notification-success', '.toast-success'
                ];
                
                const successTexts = [
                    '成功', '提交成功', '保存成功', '操作成功', 'success', 'submitted',
                    'saved', 'completed', '已提交', '已保存', '感谢', 'thank'
                ];
                
                // 检查成功元素
                for (const selector of successSelectors) {
                    const successEl = document.querySelector(selector);
                    if (successEl && successEl.textContent.trim()) {
                        return true;
                    }
                }
                
                // 检查页面文本中的成功指示
                const bodyText = document.body.textContent.toLowerCase();
                return successTexts.some(text => bodyText.includes(text.toLowerCase()));
            });

            // 3. 检查表单是否仍然可见（如果表单消失可能表示提交成功）
            validationChecks.formStillVisible = await this.page.evaluate(() => {
                const forms = document.querySelectorAll('form');
                return forms.length > 0 && Array.from(forms).some(form => {
                    const rect = form.getBoundingClientRect();
                    const style = window.getComputedStyle(form);
                    return rect.width > 0 && rect.height > 0 && 
                           style.display !== 'none' && 
                           style.visibility !== 'hidden';
                });
            });

            // 4. 检查加载指示器
            validationChecks.loadingIndicators = await this.page.evaluate(() => {
                const loadingSelectors = [
                    '.loading', '.spinner', '.ant-spin', '.loader',
                    '[data-loading="true"]', '.loading-overlay'
                ];
                
                for (const selector of loadingSelectors) {
                    const loadingEl = document.querySelector(selector);
                    if (loadingEl) {
                        const style = window.getComputedStyle(loadingEl);
                        if (style.display !== 'none' && style.visibility !== 'hidden') {
                            return true;
                        }
                    }
                }
                return false;
            });

            // 综合判断提交是否成功
            let success = false;
            
            if (validationChecks.hasErrors) {
                // 有错误信息，明确失败
                success = false;
            } else if (validationChecks.hasSuccessIndicators || validationChecks.urlChanged) {
                // 有成功指示器或URL变化，可能成功
                success = true;
            } else if (submitted && !validationChecks.formStillVisible && !validationChecks.loadingIndicators) {
                // 表单已提交且不再可见，可能成功
                success = true;
            } else if (submitted && validationChecks.formStillVisible && !validationChecks.loadingIndicators) {
                // 表单仍可见且无加载指示器，可能失败
                success = false;
            } else {
                // 其他情况根据是否执行了提交操作判断
                success = submitted;
            }

            console.log(`[PageWrapper] 提交验证结果:`, {
                success,
                checks: validationChecks,
                submitted
            });

            return {
                success,
                hasErrors: validationChecks.hasErrors,
                details: validationChecks
            };

        } catch (error) {
            console.error(`[PageWrapper] 提交验证时出错: ${error.message}`);
            return {
                success: submitted, // 默认根据是否执行提交操作判断
                hasErrors: true,
                details: { error: error.message }
            };
        }
    }

    /**
     * 强制关闭弹窗的方法
     * @returns {Promise<boolean>} - 是否成功关闭弹窗
     */
    async forceClosePopups() {
        try {
            console.log(`[PageWrapper] 尝试强制关闭所有弹窗...`);
            
            const closed = await this.page.evaluate(() => {
                let closedCount = 0;
                
                // 常见的关闭按钮选择器
                const closeSelectors = [
                    '.close', '.close-btn', '.btn-close', '.modal-close',
                    '.ant-modal-close', '.ant-modal-close-x', '.el-dialog__close',
                    '[aria-label="close"]', '[aria-label="Close"]', 
                    '[title="关闭"]', '[title="Close"]',
                    '.fa-times', '.fa-close', '.icon-close',
                    'button[type="button"]'
                ];
                
                // 尝试点击关闭按钮
                for (const selector of closeSelectors) {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(el => {
                        if (el.offsetParent !== null) { // 检查元素是否可见
                            try {
                                // 对于button元素，额外检查文本内容
                                if (selector === 'button[type="button"]') {
                                    const text = el.textContent || el.innerText || '';
                                    const closeTexts = ['×', '关闭', '取消', 'Cancel', 'Close', '✕', '✖'];
                                    if (closeTexts.some(closeText => text.includes(closeText))) {
                                        el.click();
                                        closedCount++;
                                    }
                                } else {
                                    el.click();
                                    closedCount++;
                                }
                            } catch (e) {
                                // 忽略点击失败
                            }
                        }
                    });
                }
                
                // 尝试删除模态框/弹窗容器
                const modalSelectors = [
                    '.modal', '.ant-modal', '.el-dialog', '.dialog',
                    '.popup', '.overlay', '.modal-backdrop',
                    '[role="dialog"]', '[role="alertdialog"]'
                ];
                
                for (const selector of modalSelectors) {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(el => {
                        try {
                            el.remove();
                            closedCount++;
                        } catch (e) {
                            // 忽略删除失败
                        }
                    });
                }
                
                // 尝试按ESC键
                try {
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27 }));
                    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', keyCode: 27 }));
                } catch (e) {
                    // 忽略ESC失败
                }
                
                return closedCount > 0;
            });
            
            if (closed) {
                console.log(`[PageWrapper] 成功强制关闭弹窗`);
                await new Promise(r => setTimeout(r, 1000)); // 等待弹窗关闭动画
            } else {
                console.log(`[PageWrapper] 未找到可关闭的弹窗`);
            }
            
            return closed;
            
        } catch (error) {
            console.error(`[PageWrapper] 强制关闭弹窗时出错: ${error.message}`);
            return false;
        }
    }

    /**
     * 强制刷新页面
     * @returns {Promise<boolean>} - 是否成功刷新
     */
    /**
     * 强制刷新页面的方法
     * @returns {Promise<boolean>} - 是否成功刷新页面
     */
    async forceRefreshPage() {
        try {
            console.log(`[PageWrapper] 强制刷新页面...`);
            await this.page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
            console.log(`[PageWrapper] 页面刷新完成`);
            return true;
        } catch (error) {
            console.error(`[PageWrapper] 强制刷新页面失败: ${error.message}`);
            return false;
        }
    }

    // ...existing code...
}

module.exports = PageWrapper;