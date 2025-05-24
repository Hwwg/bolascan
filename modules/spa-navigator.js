// SPA导航处理
class SPANavigator {
    constructor(page) {
        this.page = page;
        this.framework = null;
    }

    async detectFramework() {
        // 简单检测主流SPA框架
        const framework = await this.page.evaluate(() => {
            if (window.__VUE__ || window.Vue) return 'vue';
            if (window.React || window.__REACT_DEVTOOLS_GLOBAL_HOOK__) return 'react';
            if (window.ng || window.getAllAngularRootElements) return 'angular';
            return null;
        });
        this.framework = framework;
        return framework;
    }

    async smartClick(element) {
        // 记录点击前的路由信息
        console.log(`[SPANavigator] 准备智能点击元素...`);
        const beforeRoute = await this.getVirtualUrl();
        console.log(`[SPANavigator] 点击前路由: ${beforeRoute}`);
        
        if (!element) {
            console.warn(`[SPANavigator] 错误: 传入的元素为空`);
            return { success: false, error: '传入的元素为空', routeChanged: false };
        }
        
        try {
            // 检查element是否包含selector属性
            if (element && element.selector) {
                console.log(`[SPANavigator] 使用CSS选择器点击元素...`);
                
                // 检查selector是否是有效的字符串
                if (!element.selector || typeof element.selector !== 'string') {
                    throw new Error('无效的选择器: ' + (typeof element.selector));
                }
                
                // 记录选择器的基本信息用于调试
                const selectorInfo = element.selector.substring(0, 100) + (element.selector.length > 100 ? '...' : '');
                console.log(`[SPANavigator] CSS选择器: ${selectorInfo}`);
                
                // 判断选择器类型：如果以<开头，说明是HTML；否则是CSS选择器
                const isHtmlSelector = element.selector.trim().startsWith('<');
                
                if (isHtmlSelector) {
                    // 旧的HTML选择器处理方式（向后兼容）
                    await this.handleHtmlSelector(element.selector);
                } else {
                    // 新的CSS选择器处理方式
                    console.log(`[SPANavigator] 直接使用CSS选择器进行点击: ${element.selector}`);
                    
                    // 直接使用CSS选择器点击
                    await this.page.evaluate((cssSelector) => {
                        const targetElement = document.querySelector(cssSelector);
                        if (targetElement) {
                            console.log(`[Browser] 找到目标元素，进行点击:`, targetElement);
                            targetElement.click();
                            return true;
                        } else {
                            console.warn(`[Browser] 未找到匹配的元素: ${cssSelector}`);
                            throw new Error(`未找到匹配的元素: ${cssSelector}`);
                        }
                    }, element.selector);
                }
            } else {
                // 如果element是puppeteer的ElementHandle
                console.log(`[SPANavigator] 直接点击元素...`);
                await element.click();
            }
        } catch (error) {
            console.warn(`[SPANavigator] 点击元素时出错: ${error.message}`);
            
            // 尝试备用点击策略
            try {
                console.log(`[SPANavigator] 尝试备用点击策略...`);
                if (element && element.selector && !element.selector.trim().startsWith('<')) {
                    // 对于CSS选择器，尝试更多的查找策略
                    const clicked = await this.page.evaluate((cssSelector) => {
                        // 尝试多种查找策略
                        let targetElement = null;
                        
                        // 1. 直接查找
                        targetElement = document.querySelector(cssSelector);
                        if (targetElement && typeof targetElement.click === 'function') {
                            console.log(`[Browser] 备用策略1：直接查找成功`);
                            targetElement.click();
                            return true;
                        }
                        
                        // 2. 如果包含nth-child，尝试移除nth-child再查找
                        if (cssSelector.includes(':nth-child(')) {
                            const simplifiedSelector = cssSelector.replace(/:nth-child\(\d+\)/g, '');
                            const elements = document.querySelectorAll(simplifiedSelector);
                            if (elements.length > 0 && typeof elements[0].click === 'function') {
                                console.log(`[Browser] 备用策略2：简化选择器找到 ${elements.length} 个元素，点击第一个`);
                                elements[0].click();
                                return true;
                            }
                        }
                        
                        // 3. 如果是复合选择器，尝试逐级简化
                        if (cssSelector.includes(' > ')) {
                            const parts = cssSelector.split(' > ');
                            for (let i = parts.length - 1; i >= 0; i--) {
                                const partialSelector = parts.slice(i).join(' > ');
                                const elements = document.querySelectorAll(partialSelector);
                                if (elements.length > 0 && typeof elements[0].click === 'function') {
                                    console.log(`[Browser] 备用策略3：部分选择器 "${partialSelector}" 找到元素`);
                                    elements[0].click();
                                    return true;
                                }
                            }
                        }
                        
                        return false;
                    }, element.selector);
                    
                    if (!clicked) {
                        throw new Error('所有备用策略都失败了');
                    }
                }
            } catch (backupError) {
                console.warn(`[SPANavigator] 备用点击也失败: ${backupError.message}`);
            }
        }
        
        // 等待可能的路由变化
        console.log(`[SPANavigator] 等待可能的路由变化...`);
        // 使用setTimeout和Promise替换waitForTimeout
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 检查是否出现了弹窗
        console.log(`[SPANavigator] 检查是否出现弹窗...`);
        const hasPopup = await this.detectPopup();
        console.log(`[SPANavigator] 检测到弹窗: ${hasPopup}`);
        
        const afterRoute = await this.getVirtualUrl();
        console.log(`[SPANavigator] 点击后路由: ${afterRoute}`);
        const routeChanged = beforeRoute !== afterRoute;
        console.log(`[SPANavigator] 路由是否变化: ${routeChanged}`);
        
        // 检查页面URL是否有实际变化
        const beforeUrl = await this.page.url();
        await new Promise(resolve => setTimeout(resolve, 300));
        const afterUrl = await this.page.url();
        const urlChanged = beforeUrl !== afterUrl;
        
        if (urlChanged) {
            console.log(`[SPANavigator] 检测到URL实际变化: ${beforeUrl} -> ${afterUrl}`);
        }
        
        // 如果检测到弹窗，尝试获取弹窗信息
        let popupInfo = null;
        if (hasPopup) {
            popupInfo = await this.getPopupInfo();
            console.log(`[SPANavigator] 弹窗信息: `, popupInfo);
        }
        
        return {
            success: true,
            routeChanged,
            urlChanged,
            beforeUrl: beforeRoute,
            newUrl: afterRoute,
            realUrl: afterUrl,
            hasPopup,
            popupInfo
        };
    }

    // 处理HTML选择器的旧方法（向后兼容）
    async handleHtmlSelector(selectorHtml) {
        console.log(`[SPANavigator] 使用HTML选择器处理方式...`);
        
        // 对于"other"类型的元素，如菜单项、导航菜单等，使用更精确的选择策略
        const isMenuItem = /menu-item|ant-menu-item|li.*role="menuitem"/i.test(selectorHtml || '');
        const isDropdownTrigger = /dropdown-trigger|ant-dropdown-trigger|aria-haspopup="true"/i.test(selectorHtml || '');
        
        // 尝试使用选择器在页面中找到并点击元素
        await this.page.evaluate((selectorHtml, isMenuItem, isDropdownTrigger) => {
            // 从HTML创建临时元素，然后使用querySelector找到匹配的元素
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = selectorHtml;
            
            if (!tempDiv.innerHTML || tempDiv.innerHTML.trim() === '') {
                throw new Error('选择器HTML为空');
            }
            
            const tempEl = tempDiv.firstChild;
            
            if (!tempEl || tempEl.nodeType !== Node.ELEMENT_NODE) {
                throw new Error('选择器HTML未能生成有效的元素节点');
            }

            // 特殊类型元素的处理
            if (isMenuItem || isDropdownTrigger) {
                // 先尝试更精确的选择器
                if (tempEl.hasAttribute && tempEl.hasAttribute('data-menu-id')) {
                    const menuId = tempEl.getAttribute('data-menu-id');
                    const menuItem = document.querySelector(`[data-menu-id="${menuId}"]`);
                    if (menuItem && typeof menuItem.click === 'function') {
                        console.log(`找到菜单项(通过data-menu-id="${menuId}")，点击中...`);
                        menuItem.click();
                        return;
                    }
                }
                
                // 尝试通过文本内容匹配
                const menuText = tempEl.textContent ? tempEl.textContent.trim() : '';
                if (menuText) {
                    const menuItems = document.querySelectorAll(isMenuItem ? 
                        'li.ant-menu-item, [role="menuitem"], .menu-item' : 
                        '.dropdown-trigger, [aria-haspopup="true"], .ant-dropdown-trigger');
                    
                    for (const item of menuItems) {
                        if (item.textContent && item.textContent.trim() === menuText && typeof item.click === 'function') {
                            console.log(`找到${isMenuItem ? '菜单项' : '下拉触发器'}(通过文本内容"${menuText}")，点击中...`);
                            item.click();
                            return;
                        }
                    }
                }
            }
            
            // 尝试查找匹配的元素
            if (tempEl.tagName) {
                const matchedElements = document.querySelectorAll(tempEl.tagName);
                for (const el of matchedElements) {
                    if (el.outerHTML === selectorHtml && typeof el.click === 'function') {
                        console.log('找到精确匹配元素，点击中...');
                        el.click();
                        return;
                    }
                }
            }
            
            throw new Error('未找到匹配的元素');
        }, selectorHtml, isMenuItem, isDropdownTrigger);
    }
    
    async detectPopup() {
        // 检测页面中是否存在弹窗(modal, dialog, alert等)
        try {
            console.log(`[SPANavigator] 开始检测弹窗...`);
            const hasPopup = await this.page.evaluate(() => {
                try {
                    // 尝试捕获浏览器是否存在对话框
                    if (window.alert._orig || window.confirm._orig || window.prompt._orig) {
                        console.log('检测到可能的原生对话框拦截');
                        return true;
                    }
                } catch (e) {} // 忽略错误
                
                // 检测各种可能的弹窗元素
                const popupSelectors = [
                    // 常见弹窗选择器
                    '.modal', '.dialog', '.popup', '[role="dialog"]', '[aria-modal="true"]',
                    // Bootstrap弹窗
                    '.modal.show', '.modal-dialog', '.modal-content',
                    // 其他常见框架的弹窗
                    '.ant-modal', '.el-dialog', '.v-dialog', '.MuiDialog-root', '.ReactModal__Content',
                    '.ui-dialog', '.ui-modal', '.a-modal', '.modal-open .modal',
                    // 移动框架弹窗
                    '.weui-dialog', '.van-dialog', '.mint-popup', '.am-modal',
                    // 通用样式特征
                    'div[style*="z-index"][style*="position: fixed"]',
                    'div[style*="z-index: 10"][style*="position: absolute"]',
                    'div.overlay', '.toast', '.notification', '.toast-container .toast-message', 
                    '.notification-content', '.tip', '.tips', '.popover-content',
                    // 成功/错误信息框
                    '.alert', '.message-box', '.success-message', '.error-message', 
                    '.success-box', '.error-box', '.info-box', '.warning-box',
                    '[class*="message"][class*="success"]', '[class*="message"][class*="error"]',
                    // 常见组件库的消息框
                    '.ant-message', '.el-message', '.el-message-box', '.ant-notification',
                    '.toast-success', '.toast-error', '.toast-info', '.toast-warning',
                    // 特定框架的弹窗/提示
                    '[class*="popup"]', '[class*="modal"]', '[class*="dialog"]', 
                    '[class*="alert"]', '[class*="toast"]', '[class*="notification"]'
                ];
                
                // 通用检测逻辑 - 基于选择器
                for (const selector of popupSelectors) {
                    try {
                        const elements = document.querySelectorAll(selector);
                        for (const el of elements) {
                            // 检查元素是否可见
                            const style = window.getComputedStyle(el);
                            if (el.offsetWidth > 10 && // 忽略太小的元素
                                el.offsetHeight > 10 && 
                                style.visibility !== 'hidden' && 
                                style.display !== 'none' &&
                                style.opacity !== '0') {
                                // 检查内容是否有意义
                                if (el.innerText && el.innerText.trim().length > 0) {
                                    return true;
                                }
                            }
                        }
                    } catch (err) {
                        // 忽略单个选择器的错误
                    }
                }
                
                // 检测原生浏览器alert、confirm、prompt (不能直接检测，但可以检查是否有遮罩层)
                try {
                    const overlaySelectors = [
                        '.overlay', '.mask', '.backdrop', '.modal-backdrop',
                        '[style*="background-color: rgba"][style*="position: fixed"]',
                        '[class*="overlay"]', '[class*="mask"]', '[class*="backdrop"]',
                        'div[style*="opacity"][style*="background"][style*="fixed"]'
                    ];
                    
                    for (const selector of overlaySelectors) {
                        const overlays = document.querySelectorAll(selector);
                        for (const overlay of overlays) {
                            const style = window.getComputedStyle(overlay);
                            if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity > 0.1) {
                                return true;
                            }
                        }
                    }
                } catch (e) {}
                
                // 检测文档主体的变化，可能表示有模态框/弹窗
                try {
                    if (document.body.style.overflow === 'hidden' ||
                        document.body.style.position === 'fixed' || 
                        document.documentElement.style.overflow === 'hidden') {
                        // 这些通常表示有模态对话框
                        return true;
                    }
                } catch (e) {}
                
                return false;
            });
            
            console.log(`[SPANavigator] 弹窗检测结果: ${hasPopup}`);
            return hasPopup;
        } catch (error) {
            console.warn(`[SPANavigator] 检测弹窗时出错: ${error.message}`);
            return false;
        }
    }
    
    async getPopupInfo() {
        // 获取弹窗的详细信息
        try {
            console.log(`[SPANavigator] 获取弹窗信息...`);
            const popupInfo = await this.page.evaluate(() => {
                // 寻找弹窗元素
                const popupSelectors = [
                    '.modal', '.dialog', '.popup', '[role="dialog"]', '[aria-modal="true"]',
                    '.modal.show', '.modal-dialog', '.modal-content',
                    '.ant-modal', '.el-dialog', '.v-dialog',
                    'div[style*="z-index"][style*="position: fixed"]',
                    'div[style*="z-index: 1"][style*="position: absolute"]',
                    '.overlay', '.toast', '.notification',
                    '.alert', '.message-box', '.success-message', '.error-message'
                ];
                
                let popupElement = null;
                
                // 找出第一个可见的弹窗元素
                for (const selector of popupSelectors) {
                    const elements = document.querySelectorAll(selector);
                    for (const el of elements) {
                        const style = window.getComputedStyle(el);
                        if (el.offsetWidth && 
                            el.offsetHeight && 
                            style.visibility !== 'hidden' && 
                            style.display !== 'none') {
                            popupElement = el;
                            break;
                        }
                    }
                    if (popupElement) break;
                }
                
                if (!popupElement) return null;
                
                // 提取弹窗信息
                const info = {
                    type: popupElement.tagName.toLowerCase(),
                    className: popupElement.className,
                    id: popupElement.id,
                    text: popupElement.innerText || popupElement.textContent,
                    htmlContent: popupElement.innerHTML,
                    hasCloseButton: !!popupElement.querySelector('button.close, .btn-close, [aria-label="Close"], .closebtn'),
                    hasConfirmButton: !!popupElement.querySelector('button[type="submit"], button.submit, button.confirm, .btn-primary, .confirm-btn'),
                    hasCancelButton: !!popupElement.querySelector('button[type="reset"], button.cancel, .btn-secondary, .cancel-btn'),
                };
                
                // 识别弹窗类型
                if (info.text.toLowerCase().includes('success') || 
                    info.className.toLowerCase().includes('success') ||
                    popupElement.querySelector('.success-icon, .icon-success')) {
                    info.messageType = 'success';
                } else if (info.text.toLowerCase().includes('error') || 
                           info.className.toLowerCase().includes('error') ||
                           popupElement.querySelector('.error-icon, .icon-error')) {
                    info.messageType = 'error';
                } else if (info.text.toLowerCase().includes('warning') || 
                           info.className.toLowerCase().includes('warning') ||
                           popupElement.querySelector('.warning-icon, .icon-warning')) {
                    info.messageType = 'warning';
                } else if (info.text.toLowerCase().includes('info') || 
                           info.className.toLowerCase().includes('info') ||
                           popupElement.querySelector('.info-icon, .icon-info')) {
                    info.messageType = 'info';
                } else {
                    info.messageType = 'unknown';
                }
                
                return info;
            });
            
            console.log(`[SPANavigator] 获取到弹窗信息`);
            return popupInfo;
        } catch (error) {
            console.warn(`[SPANavigator] 获取弹窗信息时出错: ${error.message}`);
            return null;
        }
    }

    async detectRouteChange() {
        // 检查路由是否发生变化
        const before = await this.getVirtualUrl();
        // 使用setTimeout和Promise替换waitForTimeout
        await new Promise(resolve => setTimeout(resolve, 500));
        const after = await this.getVirtualUrl();
        return before !== after;
    }

    async getVirtualUrl() {
        // 获取SPA虚拟路径
        return await this.page.evaluate(() => {
            try {
                // 检测各种SPA框架路由信息
                
                // React Router (v5/v6)
                if (window.__REACT_ROUTER_GLOBAL_HISTORY__) {
                    return window.location.origin + window.__REACT_ROUTER_GLOBAL_HISTORY__.location.pathname;
                }
                
                // Next.js
                if (window.__NEXT_DATA__ && window.__NEXT_DATA__.page) {
                    return window.location.origin + window.__NEXT_DATA__.page;
                }
                
                // Vue Router
                if (window.$nuxt && window.$nuxt.$route) {
                    return window.location.origin + window.$nuxt.$route.fullPath;
                }
                
                // Angular Router
                const angularRoot = document.querySelector('[ng-version]');
                if (angularRoot && angularRoot.getAttribute('ng-version')) {
                    const baseElm = document.querySelector('base');
                    const basePath = baseElm ? baseElm.getAttribute('href') : '/';
                    return window.location.origin + basePath + window.location.pathname;
                }
                
                // 检查基于hash的路由
                if (window.location.hash && window.location.hash.length > 1) {
                    return window.location.origin + window.location.pathname + window.location.hash;
                }
                
                // Next.js 路由状态
                if (window.history && window.history.state && window.history.state.as) {
                    return window.location.origin + window.history.state.as;
                }
                
                // 检查页面中的路由标记 (常见于自定义SPA)
                const routeMarker = document.querySelector('[data-route], [data-current-route], .current-route, #current-route');
                if (routeMarker) {
                    const routeValue = routeMarker.getAttribute('data-route') || 
                                      routeMarker.getAttribute('data-current-route') ||
                                      routeMarker.textContent.trim();
                    if (routeValue) {
                        return window.location.origin + routeValue;
                    }
                }
                
                // 无法检测到SPA路由，使用普通URL
                return window.location.href;
            } catch (error) {
                console.error("获取虚拟URL时出错:", error);
                return window.location.href;
            }
        });
    }

    async navigateWithRouteInfo(element, routeInfo) {
        // 可根据routeInfo进行导航，简单实现为点击元素
        await element.click();
        // 使用setTimeout和Promise替换waitForTimeout
        await new Promise(resolve => setTimeout(resolve, 500));
    }
}

module.exports = SPANavigator;
