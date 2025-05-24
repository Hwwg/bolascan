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
                console.log(`[SPANavigator] 使用选择器点击元素...`);
                
                // 检查selector是否是有效的HTML字符串
                if (!element.selector || typeof element.selector !== 'string') {
                    throw new Error('无效的选择器: ' + (typeof element.selector));
                }
                
                // 记录选择器的基本信息用于调试
                const selectorInfo = element.selector.substring(0, 100) + (element.selector.length > 100 ? '...' : '');
                console.log(`[SPANavigator] 选择器内容: ${selectorInfo}`);
                
                // 对于"other"类型的元素，如菜单项、导航菜单等，使用更精确的选择策略
                const isMenuItem = /menu-item|ant-menu-item|li.*role="menuitem"/i.test(element.selector || '');
                const isDropdownTrigger = /dropdown-trigger|ant-dropdown-trigger|aria-haspopup="true"/i.test(element.selector || '');
                
                // 尝试使用选择器在页面中找到并点击元素
                await this.page.evaluate((selectorHtml, isMenuItem, isDropdownTrigger) => {
                    // 打印调试信息
                    console.log(`浏览器内调试: 尝试处理选择器，长度 ${selectorHtml.length}`);
                    
                    // 从HTML创建临时元素，然后使用querySelector找到匹配的元素
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = selectorHtml;
                    
                    // 检查tempDiv中是否有有效内容
                    if (!tempDiv.innerHTML || tempDiv.innerHTML.trim() === '') {
                        console.log('选择器HTML为空');
                        throw new Error('选择器HTML为空');
                    }
                    
                    const tempEl = tempDiv.firstChild;
                    console.log(`浏览器内调试: 临时元素类型: ${tempEl ? tempEl.nodeType : 'null'}`);
                    if (tempEl) {
                        console.log(`浏览器内调试: 节点名称: ${tempEl.nodeName}, 类型: ${tempEl.nodeType}`);
                    }
                    
                    // 检查tempEl是否是一个有效的元素节点
                    if (!tempEl || tempEl.nodeType !== Node.ELEMENT_NODE) {
                        console.log('选择器HTML未生成有效的元素节点');
                        throw new Error('选择器HTML未能生成有效的元素节点');
                    }

                    // 特殊类型元素的处理
                    if (isMenuItem || isDropdownTrigger) {
                        // 先尝试更精确的选择器
                        if (tempEl.hasAttribute && tempEl.hasAttribute('data-menu-id')) {
                            const menuId = tempEl.getAttribute('data-menu-id');
                            const menuItem = document.querySelector(`[data-menu-id="${menuId}"]`);
                            if (menuItem) {
                                console.log(`找到菜单项(通过data-menu-id="${menuId}")，点击中...`);
                                menuItem.click();
                                return;
                            }
                        }
                        
                        // 尝试通过文本内容匹配
                        const menuText = tempEl.textContent ? tempEl.textContent.trim() : '';
                        if (menuText) {
                            // 查找具有相同文本的菜单项
                            const menuItems = document.querySelectorAll(isMenuItem ? 
                                'li.ant-menu-item, [role="menuitem"], .menu-item' : 
                                '.dropdown-trigger, [aria-haspopup="true"], .ant-dropdown-trigger');
                            
                            for (const item of menuItems) {
                                if (item.textContent && item.textContent.trim() === menuText) {
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
                            if (el.outerHTML === selectorHtml) {
                                console.log('找到精确匹配元素，点击中...');
                                el.click();
                                return;
                            }
                        }
                    } else {
                        console.log('选择器没有有效的tagName属性');
                    }
                    
                    // 如果没有精确匹配，尝试更宽松的匹配
                    if (tempEl.className) {
                        const classNames = typeof tempEl.className === 'string' ? tempEl.className.split(' ') : [];
                        if (classNames.length > 0) {
                            const mainClass = classNames[0];
                            try {
                                const similarElements = document.querySelectorAll(`.${mainClass}`);
                                if (similarElements.length > 0) {
                                    console.log(`找到类似元素(通过类名.${mainClass})，点击中...`);
                                    similarElements[0].click();
                                    return;
                                }
                            } catch (err) {
                                console.log(`使用类名选择器出错: ${err.message}`);
                            }
                        }
                    }
                    
                    // 添加最后的备用策略 - 通过数据属性和常见属性查找
                    const dataAttributeSelectors = [
                        '[data-testid]',
                        '[data-qa]',
                        '[data-cy]',
                        '[data-test]',
                        '[data-e2e]',
                        '[data-ui]',
                        '[data-click]'
                    ];
                    
                    for (const selector of dataAttributeSelectors) {
                        const elements = document.querySelectorAll(selector);
                        if (elements.length > 0) {
                            console.log(`备用策略: 找到数据属性元素 ${selector}，点击第一个`);
                            elements[0].click();
                            return;
                        }
                    }
                    
                    // 如果是可能的链接文本，尝试查找包含该文本的链接
                    if (tempEl.textContent) {
                        const linkText = tempEl.textContent.trim();
                        const links = Array.from(document.querySelectorAll('a'));
                        const matchingLink = links.find(a => a.textContent.trim().includes(linkText));
                        if (matchingLink) {
                            console.log(`备用策略: 找到匹配文本的链接 "${linkText}"，点击中...`);
                            matchingLink.click();
                            return;
                        }
                    }
                    
                    // 最后的尝试 - 尝试通过ID、name或其他常见属性查找
                    if (tempEl.id) {
                        const elById = document.getElementById(tempEl.id);
                        if (elById) {
                            console.log(`备用策略: 通过ID "${tempEl.id}" 找到元素，点击中...`);
                            elById.click();
                            return;
                        }
                    }

                    throw new Error('未找到匹配的元素');
                }, element.selector, isMenuItem, isDropdownTrigger);
            } else {
                // 如果element是puppeteer的ElementHandle
                console.log(`[SPANavigator] 直接点击元素...`);
                await element.click();
            }
        } catch (error) {
            console.warn(`[SPANavigator] 点击元素时出错: ${error.message}`);
            
            // 尝试备用点击策略 - 使用CSS选择器
            try {
                console.log(`[SPANavigator] 尝试备用点击策略...`);
                if (element && element.tag) {
                    const tag = element.tag.toLowerCase();
                    let cssSelector = tag;
                    
                    // 添加类名选择器（如果有）
                    if (element.class) {
                        cssSelector += `.${element.class.split(' ')[0]}`;
                    }
                    
                    console.log(`[SPANavigator] 使用备用CSS选择器: ${cssSelector}`);
                    await this.page.evaluate(selector => {
                        try {
                            const elements = document.querySelectorAll(selector);
                            if (elements && elements.length > 0) {
                                console.log(`找到 ${elements.length} 个匹配元素，点击第一个`);
                                elements[0].click();
                                return true;
                            }
                        } catch (err) {
                            console.log(`备用选择器错误: ${err.message}`);
                        }
                        return false;
                    }, cssSelector);
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
