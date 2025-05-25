const { cssPath } = require('css-path');

class MainModule {
    constructor(options) {
        this.options = options;
        // 预留：初始化依赖模块（如URL管理器、页面封装、元素检测器等）
        // this.urlManager = ...
        // this.pageWrapper = ...
        // this.elementDetector = ...
        // this.resultManager = ...
        this.requestCapture = null; // 请求捕获器
    }

    /**
     * 启动扫描流程
     * @param {string} startUrl - 起始URL
     * @param {number} maxDepth - 最大深度
     */
    async scan(startUrl, maxDepth) {
        this._initModules(startUrl, maxDepth);
        // 登录处理逻辑（仅当用户提供credentials时才尝试登录）
        let actualStartUrl = startUrl; // 默认使用提供的startUrl作为扫描起点
        
        // 先确保页面已初始化
        await this.pageWrapper.goto(startUrl);
        
        // 初始化请求捕获器
        if (!this.requestCapture) {
            const RequestCapture = require('./request-capture');
            console.log(`[MainModule] 初始化请求捕获器，输出路径: ${this.options.outputPath || './results'}`);
            this.requestCapture = new RequestCapture(this.pageWrapper.page);
            this.requestCapture.outputPath = this.options.outputPath || './results';
            console.log(`[MainModule] 请求捕获器状态: ${this.requestCapture ? '已初始化' : '初始化失败'}`);
        }
        
        if (this.options.credentials && this.options.credentials.username && this.options.credentials.password) {
            const LoginModule = require('./login-module');
            const loginModule = new LoginModule(this.pageWrapper.page, this.requestCapture); // 传入请求捕获器                // 启动登录请求捕获
                if (this.requestCapture) {
                    console.log(`[MainModule] 启动登录请求捕获`);
                    await this.requestCapture.startCapture('login-detection', this.options.outputPath);
                }
            
            const needLogin = await loginModule.detectLoginForm();
            console.log('[MainModule] 检测到需要登录:', needLogin);
            
            // 停止登录检测的请求捕获
            if (this.requestCapture) {
                console.log(`[MainModule] 停止登录检测请求捕获`);
                await this.requestCapture.stopCapture();
            }
            
            if (needLogin) {
                // 启动登录过程的请求捕获
                if (this.requestCapture) {
                    console.log(`[MainModule] 启动登录过程请求捕获`);
                    await this.requestCapture.startCapture('login-process');
                }
                
                const loginSuccess = await loginModule.login(startUrl, this.options.credentials);
                
                // 停止登录过程的请求捕获
                if (this.requestCapture) {
                    console.log(`[MainModule] 停止登录过程请求捕获`);
                    await this.requestCapture.stopCapture();
                }
                
                if (!loginSuccess) {
                    console.warn('⚠️ 警告: 登录可能失败，但继续扫描...');
                    // 继续执行，不抛出异常
                    // throw new Error('登录失败，无法继续扫描');
                } else {
                    console.log('[MainModule] 登录成功！');
                    
                    // 额外验证：登录成功后回到首页，检查是否真正登录状态
                    console.log('[MainModule] 返回首页检查登录状态...');
                    
                    // 启动登录验证的请求捕获
                    if (this.requestCapture) {
                        console.log(`[MainModule] 启动登录验证请求捕获`);
                        await this.requestCapture.startCapture('login-verification');
                    }
                    
                    await this.pageWrapper.goto(startUrl);
                    
                    // 停止登录验证的请求捕获
                    if (this.requestCapture) {
                        console.log(`[MainModule] 停止登录验证请求捕获`);
                        await this.requestCapture.stopCapture();
                    }
                    
                    const isStillLoginPage = await this.pageWrapper.page.evaluate(() => {
                        return !!document.querySelector('form input[type="password"]');
                    });
                    
                    if (isStillLoginPage) {
                        console.log('[MainModule] ⚠️ 警告: 返回首页后仍检测到登录表单，可能登录失败');
                    } else {
                        console.log('[MainModule] ✓ 确认登录成功！首页不再显示登录表单');
                        // 截图成功页面
                        await this.pageWrapper.page.screenshot({ path: './results/login-success.png', fullPage: true });
                        
                        // 获取当前URL作为真正的扫描起点
                        actualStartUrl = await this.pageWrapper.page.url();
                        console.log('[MainModule] 使用登录后URL作为扫描起点:', actualStartUrl);
                    }
                }
            }
        }
        
        // 使用actualStartUrl作为扫描起点，而不是原始的startUrl
        this.urlManager.addUrl(actualStartUrl, 0);
        console.log('[MainModule] 开始扫描，起点:', actualStartUrl);
        
        while (this.urlManager.hasMoreUrls()) {
            const { url, depth } = this.urlManager.getNextUrl();
            console.log(`[MainModule] 处理URL: ${url} (深度: ${depth}/${maxDepth})`);
            if (depth > maxDepth) {
                console.log(`[MainModule] 跳过URL: ${url} - 超过最大深度`);
                continue;
            }
            if (this.urlManager.hasUrlBeenProcessed(url)) {
                console.log(`[MainModule] 跳过URL: ${url} - 已处理过`);
                continue;
            }
            console.log(`[MainModule] 加载页面: ${url}`);
            
            // 在页面加载前启动请求捕获
            if (this.requestCapture) {
                console.log(`[MainModule] 启动页面加载请求捕获`);
                await this.requestCapture.startCapture(`page-load-${encodeURIComponent(url)}`);
            }
            
            await this.pageWrapper.goto(url);
            
            // 停止页面加载请求捕获
            if (this.requestCapture) {
                console.log(`[MainModule] 停止页面加载请求捕获`);
                await this.requestCapture.stopCapture();
            }
            console.log(`[MainModule] 开始分析页面元素...`);
            const htmlContent = await this.pageWrapper.evaluatePage('document.documentElement.outerHTML');
            
            // 获取页面上所有元素的CSS选择器
            let allElements = await this._getAllCssSelectors(this.pageWrapper.page);
            console.log(`[MainModule] 获取到 ${allElements.length} 个页面元素的CSS选择器`);
            
            // 保存到实例属性，供_extractFormStructure方法使用
            this.allElements = allElements;
            
            // 过滤出可能是交互式的元素
            let elements = allElements.filter(item => item.isInteractive || this._isLikelyInteractive(item));
            console.log(`[MainModule] 从中筛选出 ${elements.length} 个潜在可交互元素`);
            
            // 将CSS选择器转换为元素检测器期望的格式，同时保留HTML信息
            elements = elements.map(item => ({
                selector: item.selector,
                tag: item.tag,
                text: item.text,
                isVisible: item.isVisible,
                type: this._determineElementType(item),  // 添加一个辅助方法来确定元素类型
                html: item.html  // 保留HTML信息供后续使用
            }));
            
            // 我们仍然使用元素检测器的过滤和优先级功能
            elements = this.elementDetector.filterDuplicates(elements);
            elements = this.elementDetector.prioritizeElements(elements);
            // 对元素进行自定义分类
            const categories = {
                button: elements.filter(e => e.type === 'button'),
                link: elements.filter(e => e.type === 'link'),
                form: elements.filter(e => e.type === 'form'),
                container: elements.filter(e => e.type === 'container'),
                other: elements.filter(e => e.type === 'other')
            };
            
            console.log(`[MainModule] 元素分类统计: 按钮(${categories.button.length}), 链接(${categories.link.length}), 表单(${categories.form.length}), 容器(${categories.container.length}), 其他(${categories.other.length})`);
            const clickResults = [];
            const jumpUrls = [];
            const currentHost = (new URL(url)).host;
            await this._handleClickElements(categories, clickResults, jumpUrls, currentHost, url, depth);
            // await this._handleFormElements(categories, clickResults, jumpUrls, currentHost, url, depth);
            this.resultManager.storeClickResults(url, clickResults);
            console.log(`[MainModule] 标记URL已处理: ${url}`);
            this.urlManager.markUrlProcessed(url);
            console.log(`[MainModule] 处理发现的跳转链接: ${jumpUrls.length} 个`);
            for (const jump of jumpUrls) {
                if (!this.urlManager.hasUrlBeenProcessed(jump.to)) {
                    console.log(`[MainModule] 添加新URL到队列: ${jump.to} (深度: ${depth + 1})`);
                    this.urlManager.addUrl(jump.to, depth + 1);
                } else {
                    console.log(`[MainModule] 跳过已处理的URL: ${jump.to}`);
                }
            }
        }
        console.log(`[MainModule] 所有URL已处理完毕`);
        
        // 保存捕获的请求数据
        if (this.requestCapture) {
            const outputPath = this.options.outputPath || './results';
            console.log(`[MainModule] 保存捕获的所有HTTP请求和响应数据...`);
            console.log(`[MainModule] 共捕获 ${this.requestCapture.requests.length} 个HTTP请求/响应数据`);
            
            // 在保存前打印请求类型统计
            if (this.requestCapture.requests.length > 0) {
                try {
                    const requestCount = this.requestCapture.requests.filter(r => r.type === 'request').length;
                    const responseCount = this.requestCapture.requests.filter(r => r.type === 'response').length;
                    const uniqueUrls = new Set(this.requestCapture.requests.map(r => r.url)).size;
                    
                    console.log(`[MainModule] HTTP请求统计: 请求(${requestCount}), 响应(${responseCount}), 唯一URL(${uniqueUrls})`);
                    
                    // 获取请求方法分布
                    const methodCounts = {};
                    this.requestCapture.requests
                        .filter(r => r.type === 'request')
                        .forEach(req => {
                            methodCounts[req.method] = (methodCounts[req.method] || 0) + 1;
                        });
                    
                    Object.entries(methodCounts).forEach(([method, count]) => {
                        console.log(`[MainModule] ${method} 请求: ${count} 个`);
                    });
                } catch (error) {
                    console.warn(`[MainModule] 生成请求统计时出错:`, error.message);
                }
            }
            
            // 保存请求数据
            this.requestCapture.saveResults(outputPath);
            console.log(`[MainModule] 请求数据已保存到以下文件:`);
            console.log(`[MainModule]  - 主文件: ${outputPath}/http-requests.json`);
            console.log(`[MainModule]  - 分析文件: ${outputPath}/http-analysis.json`);
            console.log(`[MainModule]  - 可读摘要: ${outputPath}/http-summary.md`);
            console.log(`[MainModule]  - 详细请求: ${outputPath}/http-requests/ 目录`);
        } else {
            console.warn(`[MainModule] 警告: 请求捕获器未初始化，无法保存HTTP请求数据`);
        }
        
        // 确保请求捕获器在关闭前保存所有数据
        if (this.requestCapture) {
            console.log(`[MainModule] 扫描结束，保存最终请求数据...`);
            await this.requestCapture.saveResults(this.options.outputPath);
            // 清理定时器
            this.requestCapture.cleanup();
        }
        
        console.log(`[MainModule] 关闭浏览器...`);
        await this.pageWrapper.close && this.pageWrapper.close();
        console.log(`[MainModule] 生成扫描报告...`);
        await this.resultManager.generateScanReport && this.resultManager.generateScanReport();
        
        // 安全获取已处理的URL数量
        let processedCount = 0;
        try {
            processedCount = this.urlManager.getProcessedCount();
        } catch (error) {
            console.warn(`[MainModule] 获取已处理URL数量失败:`, error.message);
        }
        
        console.log(`\n========================================`);
        console.log(`[MainModule] 扫描完成！总共处理了 ${processedCount} 个URL`);
        console.log(`[MainModule] 结果保存在: ${this.options.outputPath || './results'}/scan-report.json`);
        console.log(`========================================\n`);
    }

    _initModules(startUrl, maxDepth) {
        console.log(`[MainModule] 初始化核心模块...`);
        if (!this.urlManager) {
            const UrlManager = require('./url-manager');
            console.log(`[MainModule] 初始化URL管理器 (最大深度: ${maxDepth}, 基础URL: ${startUrl})`);
            this.urlManager = new UrlManager({ maxDepth, baseUrl: startUrl });
        }
        if (!this.pageWrapper) {
            const PageWrapper = require('./page-wrapper');
            console.log(`[MainModule] 初始化页面包装器`);
            this.pageWrapper = new PageWrapper();
        }
        if (!this.elementDetector) {
            const ElementDetector = require('./element-detector');
            console.log(`[MainModule] 初始化元素检测器`);
            this.elementDetector = new ElementDetector({});
        }
        if (!this.resultManager) {
            const ResultManager = require('../storage/result-manager');
            console.log(`[MainModule] 初始化结果管理器 (输出路径: ${this.options.outputPath || '默认'})`);
            this.resultManager = new ResultManager(this.options.outputPath);
        }
        // 请求捕获器会在页面初始化后再创建
        // RequestCapture的创建已移至scan方法中，确保page已经初始化
        console.log(`[MainModule] 所有核心模块初始化完成`);
    }

    async _handleClickElements(categories, clickResults, jumpUrls, currentHost, url, depth) {
        const SPANavigator = require('./spa-navigator');
        const spaNavigator = new SPANavigator(this.pageWrapper.page);
        // 计算所有可点击元素的总数，包括other类别中的可点击元素
        const totalElements = categories.button.length + categories.link.length + (categories.other ? categories.other.length : 0);
        console.log(`[MainModule] 准备测试 ${totalElements} 个可点击元素 (按钮 + 链接 + 其他可交互元素)`);
        let processedCount = 0;
        
        // 合并所有可点击元素：按钮、链接和其他可交互元素
        const allClickableElements = [
            ...categories.button,
            ...categories.link,
            ...(categories.other || [])
        ];
        
        for (const element of allClickableElements) {
            processedCount++;
            console.log(`[MainModule] 检查元素类型:`, JSON.stringify({
                类型: typeof element,
                是否为空: element === null,
                属性: element ? Object.keys(element).join(',') : 'N/A',
                选择器示例: element && element.selector ? element.selector.substring(0, 100) + '...' : 'N/A'
            }, null, 2));
            
            // const isVisible = await this.pageWrapper.checkElementVisibility(element);
            const isVisible = true; // 暂时禁用可见性检查
            console.log(`[MainModule] 元素可见性结果: ${isVisible}`);
            
            if (!isVisible) {
                console.log(`[MainModule] 跳过不可见元素 (${processedCount}/${totalElements})`);
                continue;
            }
            const beforeUrl = await this.pageWrapper.page.url();
            
            // 安全获取元素文本和类型
            let elementText = '未知文本';
            let elementType = '未知类型';
            try {
                if (element && element.selector) {
                    // 判断是CSS选择器还是HTML选择器
                    const isHtmlSelector = element.selector.trim().startsWith('<');
                    
                    if (isHtmlSelector) {
                        // 旧的HTML选择器处理方式
                        const elementInfo = await this.pageWrapper.page.evaluate((selectorHtml) => {
                            try {
                                const tempDiv = document.createElement('div');
                                tempDiv.innerHTML = selectorHtml;
                                const tempEl = tempDiv.firstChild;
                                
                                if (!tempEl) return { text: '无效HTML', type: '未知' };
                                
                                // 尝试查找匹配的元素
                                const matchedElements = document.querySelectorAll(tempEl.tagName);
                                for (const el of matchedElements) {
                                    if (el.outerHTML === selectorHtml) {
                                        return {
                                            text: el.textContent || el.innerText || el.outerHTML.slice(0, 50) + '...',
                                            type: el.tagName
                                        };
                                    }
                                }
                                
                                // 如果没找到精确匹配，返回临时元素的信息
                                return {
                                    text: tempEl.textContent || tempEl.innerText || tempEl.outerHTML.slice(0, 50) + '...',
                                    type: tempEl.tagName
                                };
                            } catch (err) {
                                return { text: '提取元素文本出错', type: '未知' };
                            }
                        }, element.selector);
                        
                        elementText = elementInfo.text;
                        elementType = elementInfo.type;
                    } else {
                        // 新的CSS选择器处理方式
                        const elementInfo = await this.pageWrapper.page.evaluate((cssSelector) => {
                            try {
                                const targetElement = document.querySelector(cssSelector);
                                if (targetElement) {
                                    return {
                                        text: targetElement.textContent || targetElement.innerText || targetElement.outerHTML.slice(0, 50) + '...',
                                        type: targetElement.tagName
                                    };
                                } else {
                                    return { text: '元素不存在', type: '未知' };
                                }
                            } catch (err) {
                                return { text: '提取元素文本出错', type: '未知' };
                            }
                        }, element.selector);
                        
                        elementText = elementInfo.text;
                        elementType = elementInfo.type;
                    }
                } else if (element && element.text) {
                    // 如果元素对象本身有text属性（来自新的_getAllCssSelectors方法）
                    elementText = element.text;
                    elementType = element.tag || '未知类型';
                }
            } catch (error) {
                console.warn(`[MainModule] 提取元素信息时出错:`, error.message);
            }
            
            const elementCategory = element.tag === 'BUTTON' || /button/i.test(element.selector) ? '按钮' :
                                   element.tag === 'A' ? '链接' :
                                   /menu-item|ant-menu-item/i.test(element.selector || '') ? '菜单项' :
                                   '其他可交互元素';
            
            console.log(`[MainModule] 测试点击元素(${processedCount}/${totalElements}): [${elementType}:${elementCategory}] "${elementText.trim()}"`);
            
            // 在点击前启动请求捕获
            if (this.requestCapture) {
                const elementId = `${elementType}-${elementCategory}-${elementText.trim().substring(0, 20)}`;
                console.log(`[MainModule] 启动请求捕获，元素ID: ${elementId}`);
                await this.requestCapture.startCapture(`click-${elementId}-${processedCount}`);
            }
            
            // 使用SPA智能点击，返回包括路由变化信息
            console.log(`[MainModule] 开始点击元素...`);
            let clickResult = await spaNavigator.smartClick(element);
            let afterUrl = clickResult && clickResult.newUrl ? clickResult.newUrl : await this.pageWrapper.page.url();
            
            // 点击后停止请求捕获
            if (this.requestCapture) {
                console.log(`[MainModule] 停止请求捕获`);
                await this.requestCapture.stopCapture();
            }
            
            console.log(`[MainModule] 元素点击完成，检查结果...`);
            
            // 检查是否检测到弹窗（使用新的可重用方法）
            const hasPopup = await this._detectAndHandlePopup(element, clickResults, 'click');
            
            // 识别元素类型的辅助函数
            const getElementTypeDescription = (element) => {
                if (!element) return '未知元素';
                
                const elTag = (element.tag || '').toLowerCase();
                const elSelector = (element.selector || '').toLowerCase();
                const elText = (element.text || '').trim();
                
                if (elTag === 'button' || /button/i.test(elSelector)) {
                    return `按钮 "${elText}"`;
                } else if (elTag === 'a' || /href/i.test(elSelector)) {
                    return `链接 "${elText}"`;
                } else if (/menu-item|ant-menu-item/i.test(elSelector)) {
                    return `菜单项 "${elText}"`;
                } else if (/dropdown|trigger/i.test(elSelector)) {
                    return `下拉菜单 "${elText}"`;
                } else if (elTag === 'li' && /role="menuitem"/i.test(elSelector)) {
                    return `导航项 "${elText}"`;
                } else {
                    return `可交互元素 "${elText}"`;
                }
            };
            
            // 检查是否发生传统跳转
            if (afterUrl && afterUrl !== beforeUrl) {
                const afterHost = (new URL(afterUrl)).host;
                const hostChanged = afterHost !== currentHost;
                const elementDescription = getElementTypeDescription(element);
                jumpUrls.push({
                    from: beforeUrl,
                    to: afterUrl,
                    hostChanged,
                    element,
                    type: 'traditional',
                    description: elementDescription
                });
                console.log(`[MainModule] 检测到页面跳转: ${beforeUrl} -> ${afterUrl}`);
                console.log(`[MainModule] 页面跳转类型: 传统跳转${hostChanged ? ' (跨域)' : ''} (由${elementDescription}触发)`);
            }
            
            // 检查SPA路由变化
            if (clickResult && clickResult.routeChanged) {
                const virtualUrl = await spaNavigator.getVirtualUrl();
                if (virtualUrl && virtualUrl !== beforeUrl) {
                    const elementDescription = getElementTypeDescription(element);
                    jumpUrls.push({
                        from: beforeUrl,
                        to: virtualUrl,
                        hostChanged: false,
                        element,
                        type: 'spa',
                        description: elementDescription
                    });
                    console.log(`[MainModule] 检测到SPA路由变化: ${beforeUrl} -> ${virtualUrl}`);
                    console.log(`[MainModule] 页面跳转类型: SPA路由变化 (无页面刷新) (由${elementDescription}触发)`);
                }
            }
            
            if (afterUrl === beforeUrl && (!clickResult || !clickResult.routeChanged)) {
                console.log(`[MainModule] 点击后URL未变化，可能是页内交互或无效点击`);
            }
            
            // 如果之前没有因为弹窗已经记录过结果，则现在记录
            if (!hasPopup) {
                clickResults.push({ 
                    element, 
                    clickResult: clickResult || { success: false, error: "点击失败或没有结果" } 
                });
            }
            
            // 尝试返回原始URL，以便测试下一个元素
            if (afterUrl !== beforeUrl) {
                try {
                    console.log(`[MainModule] 返回原始页面: ${beforeUrl}`);
                    await this.pageWrapper.goto(beforeUrl);
                    await new Promise(r => setTimeout(r, 500)); // 等待页面加载
                } catch (error) {
                    console.warn(`[MainModule] 返回原始页面失败: ${error.message}`);
                }
            }
        }
    }

    /**
     * 从表单数据中提取必需的字段（处理字段填充失败时的回退策略）
     * @param {Object} formData - 完整的表单数据
     * @returns {Object} - 简化后的必需字段数据
     */
    _getEssentialFormFields(formData) {
        console.log(`[MainModule] 提取必需表单字段...`);
        
        const essentialFields = {};
        const essentialPatterns = [
            // 用户名/邮箱类字段（通常是必需的）
            /username|user|email|account|login|name/i,
            // 密码字段（通常是必需的）
            /password|pwd|pass/i,
            // 手机号（通常是必需的）
            /phone|mobile|tel/i,
            // 验证码（通常是必需的）
            /code|captcha|verify/i,
            // 必需标识
            /required|must|need/i
        ];
        
        // 优先级排序：先处理明显必需的字段
        const prioritizedEntries = Object.entries(formData).sort(([selectorA], [selectorB]) => {
            const aScore = essentialPatterns.reduce((score, pattern) => {
                return score + (pattern.test(selectorA) ? 1 : 0);
            }, 0);
            const bScore = essentialPatterns.reduce((score, pattern) => {
                return score + (pattern.test(selectorB) ? 1 : 0);
            }, 0);
            return bScore - aScore; // 降序排列
        });
        
        // 只保留前3-5个最重要的字段
        let fieldCount = 0;
        const maxFields = 5;
        
        for (const [selector, value] of prioritizedEntries) {
            if (fieldCount >= maxFields) break;
            
            // 检查是否是重要字段
            const isEssential = essentialPatterns.some(pattern => pattern.test(selector)) ||
                               selector.includes('required') ||
                               selector.includes('[required]');
            
            if (isEssential || fieldCount < 3) { // 至少保留前3个字段
                essentialFields[selector] = value;
                fieldCount++;
                console.log(`[MainModule] 保留必需字段: ${selector} = ${value}`);
            }
        }
        
        // 如果没有找到任何必需字段，至少保留前2个字段
        if (Object.keys(essentialFields).length === 0) {
            const firstEntries = prioritizedEntries.slice(0, 2);
            firstEntries.forEach(([selector, value]) => {
                essentialFields[selector] = value;
                console.log(`[MainModule] 回退保留字段: ${selector} = ${value}`);
            });
        }
        
        console.log(`[MainModule] 提取到 ${Object.keys(essentialFields).length} 个必需字段`);
        return essentialFields;
    }

    async _handleFormElements(categories, clickResults, jumpUrls, currentHost, url, depth) {
        const LLMElementHelper = require('../llm/llm-element-helper');
        const llmHelper = new LLMElementHelper();
        console.log(`[MainModule] 准备测试 ${categories.form.length} 个表单元素`);
        let formCount = 0;
        for (const formElement of categories.form) {
            formCount++;
            console.log(`[MainModule] 处理表单 ${formCount}/${categories.form.length}`);
            
            // 使用已经存储在元素中的HTML信息，而不是调用getFormHtml
            let formHtml = '';
            if (formElement.html && formElement.html.outerHTML) {
                formHtml = formElement.html.outerHTML;
                console.log(`[MainModule] 使用已存储的表单HTML信息，长度: ${formHtml.length} 字符`);
            } else {
                // 如果没有HTML信息，尝试通过选择器获取
                console.log(`[MainModule] 元素缺少HTML信息，尝试通过选择器获取...`);
                try {
                    formHtml = await this.pageWrapper.page.evaluate((selector) => {
                        const element = document.querySelector(selector);
                        return element ? element.outerHTML : '<form>表单HTML获取失败</form>';
                    }, formElement.selector);
                    console.log(`[MainModule] 通过选择器获取表单HTML成功，长度: ${formHtml.length} 字符`);
                } catch (error) {
                    console.warn(`[MainModule] 获取表单HTML失败: ${error.message}`);
                    formHtml = '<form>表单HTML获取失败</form>';
                }
            }
            console.log(`[MainModule] 使用LLM生成表单测试数据和提交选择器...`);
            
            // 尝试使用改进的表单结构方法
            let formAnalysisResult = {};
            
            // 提取表单结构（包含输入字段和按钮的CSS选择器）
            console.log(`[MainModule] 提取表单结构...`);
            const formStructure = this._extractFormStructure(formElement, this.allElements);
            
            if (formStructure.inputs.length > 0) {
                // 使用改进的方法：基于表单结构生成数据
                console.log(`[MainModule] 使用改进的表单数据生成方法，基于现有的CSS选择器`);
                formAnalysisResult = await llmHelper.generateFormDataFromStructure(formStructure);
            } else if (this.elementDetector.formTestData && Object.keys(this.elementDetector.formTestData).length > 0) {
                // 回退：使用预先生成的表单数据
                console.log(`[MainModule] 回退：使用预先生成的表单数据`);
                formAnalysisResult.formData = this.elementDetector.formTestData;
                formAnalysisResult.submitSelectors = [];
                formAnalysisResult.recommendedSubmitSelector = '';
                formAnalysisResult.submitStrategy = 'button_click';
            } else {
                // 最后回退：使用旧的LLM方法
                console.log(`[MainModule] 最后回退：使用旧的LLM方法生成表单数据和提交选择器`);
                formAnalysisResult = await llmHelper.generateFormTestDataWithSubmit(formHtml);
            }
            
            console.log(`[MainModule] 表单分析结果:`, JSON.stringify(formAnalysisResult, null, 2));
            console.log(`[MainModule] 表单数据字段数量: ${Object.keys(formAnalysisResult.formData).length}`);
            console.log(`[MainModule] 提交选择器数量: ${formAnalysisResult.submitSelectors.length}`);
            console.log(`[MainModule] 推荐的提交选择器: ${formAnalysisResult.recommendedSubmitSelector}`);
            console.log(`[MainModule] 提交策略: ${formAnalysisResult.submitStrategy}`);
            console.log(`[MainModule] 提交表单数据...`);
            
            // 在表单提交前启动请求捕获
            if (this.requestCapture) {
                const formId = `form-${formCount}`;
                console.log(`[MainModule] 启动请求捕获，表单ID: ${formId}`);
                await this.requestCapture.startCapture(`submit-${formId}`);
            }
            
            let submitResult = await this.pageWrapper.submitFormWithLLMSelectors(
                formElement, 
                formAnalysisResult.formData,
                formAnalysisResult.submitSelectors,
                formAnalysisResult.recommendedSubmitSelector,
                formAnalysisResult.submitStrategy
            );
            
            // 表单提交后停止请求捕获
            if (this.requestCapture) {
                console.log(`[MainModule] 停止请求捕获`);
                await this.requestCapture.stopCapture();
            }
            
            let retryCount = 0;
            const maxRetries = 3;
            
            while (!submitResult.success && retryCount < maxRetries) {
                console.log(`[MainModule] 表单提交失败，第 ${retryCount+1}/${maxRetries} 次重试...`);
                
                // 检查失败原因，如果是字段填充失败，尝试不同的处理策略
                const isFieldError = submitResult.error && (
                    submitResult.error.includes('填充字段失败') ||
                    submitResult.error.includes('not clickable') ||
                    submitResult.error.includes('not an Element')
                );
                
                if (isFieldError) {
                    console.log(`[MainModule] 检测到字段填充错误，尝试简化表单数据...`);
                    // 对于字段填充失败，尝试减少填充的字段数量，只填充必需字段
                    const essentialFields = this._getEssentialFormFields(formAnalysisResult.formData);
                    formAnalysisResult.formData = essentialFields;
                    console.log(`[MainModule] 简化后的表单数据:`, JSON.stringify(formAnalysisResult.formData, null, 2));
                } else {
                    // 普通错误，使用LLM修复
                    const errorFeedback = await this.pageWrapper.getFormErrorFeedback(formElement);
                    console.log(`[MainModule] 获取到表单错误反馈:`, errorFeedback);
                    console.log(`[MainModule] 使用LLM修复表单数据...`);
                    formAnalysisResult.formData = await llmHelper.fixFormTestData(formHtml, formAnalysisResult.formData, errorFeedback);
                    console.log(`[MainModule] 修复后的表单数据:`, JSON.stringify(formAnalysisResult.formData, null, 2));
                }
                
                console.log(`[MainModule] 重新提交表单...`);
                
                // 重试提交前启动请求捕获
                if (this.requestCapture) {
                    const formId = `form-${formCount}-retry-${retryCount+1}`;
                    console.log(`[MainModule] 启动请求捕获，表单重试ID: ${formId}`);
                    await this.requestCapture.startCapture(`submit-retry-${formId}`);
                }
                
                submitResult = await this.pageWrapper.submitFormWithLLMSelectors(
                    formElement, 
                    formAnalysisResult.formData,
                    formAnalysisResult.submitSelectors,
                    formAnalysisResult.recommendedSubmitSelector,
                    formAnalysisResult.submitStrategy
                );
                
                // 重试提交后停止请求捕获
                if (this.requestCapture) {
                    console.log(`[MainModule] 停止请求捕获`);
                    await this.requestCapture.stopCapture();
                }
                retryCount++;
            }
            
            if (submitResult.success) {
                console.log(`[MainModule] 表单提交成功!`);
                
                // 检查表单提交后是否有弹窗
                const hasPopup = await this._detectAndHandlePopup(formElement, clickResults, 'form-submit');
                if (hasPopup) {
                    console.log(`[MainModule] 表单提交后检测到弹窗并已处理`);
                }
            } else {
                console.log(`[MainModule] 表单提交仍然失败，达到最大重试次数，开始强制处理...`);
                
                // 3次重试失败后的强制处理逻辑
                const forceHandled = await this._handleSubmissionFailure(formElement, submitResult, retryCount);
                if (forceHandled) {
                    console.log(`[MainModule] 强制处理完成`);
                } else {
                    console.error(`[MainModule] 强制处理也失败了`);
                }
            }
            let afterUrl = submitResult && submitResult.newUrl ? submitResult.newUrl : await this.pageWrapper.page.url();
            console.log(`[MainModule] 表单提交后URL: ${afterUrl}`);
            if (afterUrl && afterUrl !== url) {
                const afterHost = (new URL(afterUrl)).host;
                const hostChanged = afterHost !== currentHost;
                jumpUrls.push({
                    from: url,
                    to: afterUrl,
                    hostChanged: hostChanged,
                    element: formElement,
                    type: 'form-submit'
                });
                console.log(`[MainModule] 检测到表单提交后页面跳转: ${url} -> ${afterUrl}${hostChanged ? ' (跨域)' : ''}`);
            } else {
                console.log(`[MainModule] 表单提交后URL未变化，可能是AJAX提交或页内处理`);
            }
            clickResults.push({ element: formElement, submitResult });
            console.log(`[MainModule] 表单处理完成，保存结果`);
        }
    }

    /**
     * 获取页面上所有潜在可点击元素的CSS选择器（高质量唯一选择器，模拟DevTools能力）
     * @param {Object} page - Puppeteer页面实例
     * @returns {Promise<Array>} - 返回CSS选择器数组
     */
    async _getAllCssSelectors(page) {
        console.log(`[MainModule] 开始获取页面所有CSS选择器（高质量模式）...`);
        
        try {
            // 在页面中执行脚本，生成高质量CSS选择器
            const results = await page.evaluate(() => {
                // 定义一个内部函数来生成CSS路径（模拟DevTools "Copy Selector"）
                function generateCssPath(element) {
                    if (!element) return null;
                    
                    // 如果有ID，直接使用ID（最高优先级）
                    if (element.id) {
                        const idSelector = `#${element.id}`;
                        // 验证ID选择器的唯一性
                        if (document.querySelectorAll(idSelector).length === 1) {
                            return idSelector;
                        }
                    }
                    
                    // 构建完整路径
                    const path = [];
                    let current = element;
                    
                    while (current && current !== document && current !== document.documentElement) {
                        let selector = current.tagName.toLowerCase();
                        
                        // 添加类名（如果有）
                        if (current.className && typeof current.className === 'string') {
                            const classes = current.className.trim().split(/\s+/)
                                .filter(cls => cls.length > 0 && !cls.includes(' '))
                                .join('.');
                            if (classes) {
                                selector += '.' + classes;
                            }
                        }
                        
                        // 检查在父级中的唯一性
                        if (current.parentElement) {
                            const siblings = Array.from(current.parentElement.children);
                            const sameTagSiblings = siblings.filter(sibling => 
                                sibling.tagName.toLowerCase() === current.tagName.toLowerCase()
                            );
                            
                            // 如果同类型兄弟节点多于1个，需要添加nth-child
                            if (sameTagSiblings.length > 1) {
                                const index = siblings.indexOf(current) + 1;
                                selector += `:nth-child(${index})`;
                            }
                            
                            // 验证当前级别的选择器唯一性
                            try {
                                const testPath = path.length > 0 ? 
                                    selector + ' > ' + path.join(' > ') : 
                                    selector;
                                const matches = current.parentElement.querySelectorAll(`:scope > ${selector}`);
                                if (matches.length !== 1 || matches[0] !== current) {
                                    // 如果仍不唯一，强制使用nth-child
                                    const index = siblings.indexOf(current) + 1;
                                    selector = selector.replace(/:nth-child\(\d+\)/, '') + `:nth-child(${index})`;
                                }
                            } catch (e) {
                                // 如果查询失败，保留原选择器
                            }
                        }
                        
                        path.unshift(selector);
                        current = current.parentElement;
                        
                        // 避免无限循环
                        if (path.length > 20) break;
                    }
                    
                    return path.join(' > ');
                }
                
                // 获取所有元素并生成选择器
                const allElements = document.querySelectorAll('*');
                const results = [];
                let debugCount = 0;
                
                for (const element of allElements) {
                    try {
                        const selector = generateCssPath(element);
                        if (selector) {
                            // 验证选择器的唯一性
                            const matchedElements = document.querySelectorAll(selector);
                            const isUnique = matchedElements.length === 1 && matchedElements[0] === element;
                            
                            if (isUnique) {
                                // 检查元素的基本属性
                                const style = window.getComputedStyle(element);
                                const isVisible = element.offsetWidth > 0 && 
                                                element.offsetHeight > 0 && 
                                                style.display !== 'none' && 
                                                style.visibility !== 'hidden';
                                
                                // 检查是否可能是交互式元素
                                const interactiveTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL', 'SUMMARY'];
                                let isInteractive = interactiveTags.includes(element.tagName);
                                
                                if (!isInteractive) {
                                    const role = element.getAttribute('role');
                                    if (role && ['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio', 'switch', 'menu', 'menubar', 'option'].includes(role.toLowerCase())) {
                                        isInteractive = true;
                                    }
                                }
                                
                                if (!isInteractive) {
                                    if (style.cursor === 'pointer') isInteractive = true;
                                }
                                
                                if (!isInteractive) {
                                    const hasEventHandler = element.hasAttribute('onclick') || 
                                                          element.hasAttribute('ng-click') || 
                                                          element.hasAttribute('@click') || 
                                                          element.hasAttribute('v-on:click') || 
                                                          element.hasAttribute('data-toggle');
                                    if (hasEventHandler) isInteractive = true;
                                }
                                
                                // 调试信息：特别关注ant-menu相关元素
                                if (selector.includes('ant-menu') && debugCount < 5) {
                                    console.log(`[DEBUG] Ant Menu Element - Selector: ${selector}, Tag: ${element.tagName}, Classes: ${element.className}, Text: "${element.textContent?.trim().substring(0, 30)}"`, element);
                                    debugCount++;
                                }
                                
                                // 捕获元素的HTML代码
                                let outerHtml = '';
                                let innerHTML = '';
                                try {
                                    outerHtml = element.outerHTML;
                                    innerHTML = element.innerHTML;
                                    
                                    // 如果HTML太长，进行截断处理
                                    if (outerHtml.length > 1000) {
                                        outerHtml = outerHtml.substring(0, 1000) + '...<!-- HTML截断 -->';
                                    }
                                    if (innerHTML.length > 800) {
                                        innerHTML = innerHTML.substring(0, 800) + '...<!-- 内容截断 -->';
                                    }
                                } catch (e) {
                                    outerHtml = '<!-- 无法获取HTML -->';
                                    innerHTML = '<!-- 无法获取内容 -->';
                                }
                                
                                // 获取元素的关键属性
                                const attributes = {};
                                try {
                                    if (element.attributes) {
                                        for (let i = 0; i < element.attributes.length; i++) {
                                            const attr = element.attributes[i];
                                            attributes[attr.name] = attr.value;
                                        }
                                    }
                                } catch (e) {
                                    // 忽略属性获取错误
                                }

                                results.push({
                                    selector: selector,
                                    tag: element.tagName,
                                    text: (element.textContent || '').trim().substring(0, 50),
                                    isVisible: isVisible,
                                    isInteractive: isInteractive,
                                    html: {
                                        outerHTML: outerHtml,
                                        innerHTML: innerHTML,
                                        attributes: attributes
                                    }
                                });
                            } else {
                                // 调试：记录不唯一的选择器
                                if (selector.includes('ant-menu') && debugCount < 10) {
                                    console.warn(`[DEBUG] Non-unique selector: ${selector}, matched ${matchedElements.length} elements`);
                                    debugCount++;
                                }
                            }
                        }
                    } catch (err) {
                        // 单个元素失败不影响整体
                        if (element.className && element.className.includes('ant-menu')) {
                            console.error(`[DEBUG] Error processing ant-menu element:`, err, element);
                        }
                    }
                }
                
                return results;
            });
            
            console.log(`[MainModule] 获取到 ${results.length} 个元素的高质量CSS选择器`);
            
            // 输出所有选择器的详细信息
            // console.log(`[MainModule] === 所有CSS选择器详细列表 ===`);
            // results.forEach((item, index) => {
            //     console.log(`[${index + 1}] 选择器: ${item.selector}`);
            //     console.log(`    标签: ${item.tag}, 可见: ${item.isVisible}, 可交互: ${item.isInteractive}`);
            //     console.log(`    文本: "${item.text}"`);
            //     if (item.html && item.html.outerHTML) {
            //         const htmlPreview = item.html.outerHTML.length > 100 ? 
            //             item.html.outerHTML.substring(0, 100) + '...' : 
            //             item.html.outerHTML;
            //         console.log(`    HTML: ${htmlPreview}`);
            //     }
            //     console.log(`    ---`);
            // });
            
            // 按类型分组显示
            const interactive = results.filter(r => r.isInteractive);
            const visible = results.filter(r => r.isVisible);
            console.log(`[MainModule] === 统计信息 ===`);
            console.log(`[MainModule] 总元素数: ${results.length}`);
            console.log(`[MainModule] 可交互元素: ${interactive.length}`);
            console.log(`[MainModule] 可见元素: ${visible.length}`);
            
            // 输出所有选择器（纯文本列表，便于复制）
            console.log(`[MainModule] === 纯选择器列表（便于复制） ===`);
            const selectors = results.map(r => r.selector);
            console.log(selectors.join('\n'));
            
            return results;
        } catch (error) {
            console.error(`[MainModule] 获取CSS选择器时出错:`, error);
            return [];
        }
    }
    
    /**
     * 根据元素的特征确定其类型（按钮、链接、表单等）
     * @param {Object} element - 元素对象
     * @returns {string} - 元素类型
     */
    _determineElementType(element) {
        if (!element) return 'other';
        
        const tag = (element.tag || '').toLowerCase();
        const selector = (element.selector || '').toLowerCase();
        const text = (element.text || '').trim();
        
        // 首先优先检查实际的HTML标签，避免被模式匹配误分类
        
        // FORM 标签应该始终被分类为 form
        if (tag === 'form') {
            return 'form';
        }
        
        // A 标签应该始终被分类为 link
        if (tag === 'a') {
            return 'link';
        }
        
        // BUTTON 标签应该始终被分类为 button
        if (tag === 'button') {
            return 'button';
        }
        
        // INPUT、SELECT、TEXTAREA 标签应该被分类为 form
        if (tag === 'input' || tag === 'select' || tag === 'textarea') {
            return 'form';
        }
        
        // 然后进行模式匹配检查（针对没有明确标签的元素）
        
        // 按钮类型元素（基于选择器和文本内容）
        if (/button|btn|submit|reset|toggle/i.test(selector) || 
            /^\s*[\u4e00-\u9fa5]*[提交|确定|保存|确认|取消|登录][\u4e00-\u9fa5]*\s*$/i.test(text) ||
            /[role="button"]/i.test(selector)) {
            return 'button';
        }
        
        // 链接类型元素（基于选择器）
        if (/href=/i.test(selector) || 
            /link|nav-item|menu-item/i.test(selector) || 
            /[role="link"|"menuitem"]/i.test(selector)) {
            return 'link';
        }
        
        // 表单相关元素（基于选择器）
        if (/form|checkbox|radio|switch|dropdown/i.test(selector)) {
            return 'form';
        }
        
        // 文章、卡片、面板等容器元素
        if (/card|post|article|panel|tile|item/i.test(selector) ||
            /ant-card|ant-list-item|ant-collapse-item/i.test(selector)) {
            return 'container';
        }
        
        // 未能确定类型的元素
        return 'other';
    }
    
    /**
     * 根据元素的特征判断是否可能是交互式元素
     * @param {Object} element - 元素对象
     * @returns {boolean} - 是否可能是交互式元素
     */
    _isLikelyInteractive(element) {
        if (!element) return false;
        
        const tag = (element.tag || '').toUpperCase();
        const selector = (element.selector || '').toLowerCase();
        const text = (element.text || '').trim();
        
        // 直接判断表单相关的标签为可交互
        if (['FORM', 'INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(tag)) {
            return true;
        }
        
        // 检查类名中的提示词
        const interactiveClassPatterns = [
            'btn', 'button', 'link', 'nav', 'menu', 'click', 'select',
            'dropdown', 'tab', 'item', 'option', 'trigger', 'toggle', 'control',
            'ant-', 'mui', 'el-', 'mat-', 'interactive', 'action', 'active',
            'expand', 'collapse', 'submit', 'cancel', 'confirm', 'delete',
            'edit', 'save', 'add', 'remove', 'open', 'close', 'show', 'hide',
            'switch', 'checkbox', 'radio', 'slider', 'card'
        ];
        
        if (interactiveClassPatterns.some(pattern => selector.includes(pattern))) {
            return true;
        }
        
        // 常见的可点击文本模式
        const clickableTextPatterns = [
            '登录', '注册', '提交', '确定', '取消', '确认', '发送', '保存', 
            '删除', '编辑', '修改', '查看', '详情', '更多', '下一步', '上一步',
            '继续', '完成', '返回', '关闭', '打开', '展开', '收起'
        ];
        
        if (clickableTextPatterns.some(pattern => text.includes(pattern))) {
            return true;
        }
        
        // li元素通常是菜单项
        if (tag === 'LI' && /menu|nav|list|item/i.test(selector)) {
            return true;
        }
        
        // 特定的组件命名模式
        if (/ant-menu-item|el-menu-item|mui-item|li\.ant-menu-overflow-item/i.test(selector)) {
            return true;
        }
        
        // 特定的属性模式
        if (/href|ng-click|@click|v-on:click|onclick|data-action|data-target|data-toggle/i.test(selector)) {
            return true;
        }
        
        return false;
    }
    
    /**
     * 从现有元素层级数据中提取表单结构
     * @param {Object} formElement - 表单元素
     * @param {Array} allElements - 所有页面元素的CSS选择器数组
     * @returns {Object} 表单结构信息
     */
    _extractFormStructure(formElement, allElements) {
        console.log(`[MainModule] 从层级数据中提取表单结构...`);
        
        // 确保allElements是一个数组
        if (!Array.isArray(allElements)) {
            console.warn(`[MainModule] allElements参数无效，使用空数组作为回退`);
            allElements = [];
        }
        
        const structure = {
            inputs: [],
            buttons: [],
            formElement: formElement
        };
        
        // 从表单HTML中提取子元素
        let formHtml = '';
        if (formElement.html && formElement.html.outerHTML) {
            formHtml = formElement.html.outerHTML;
        } else if (formElement.html && formElement.html.innerHTML) {
            formHtml = formElement.html.innerHTML;
        }
        
        if (!formHtml) {
            console.warn(`[MainModule] 无法获取表单HTML，回退到全页面搜索`);
            // 回退：在所有元素中查找可能的表单相关元素
            if (Array.isArray(allElements)) {
                allElements.forEach(element => {
                    const tag = (element.tag || '').toLowerCase();
                    const selector = element.selector || '';
                    
                    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
                        structure.inputs.push({
                            selector: selector,
                            tag: tag,
                            text: element.text || '',
                            html: element.html || {},
                            type: this._getInputType(element)
                        });
                    } else if (tag === 'button' || (tag === 'input' && selector.includes('submit'))) {
                        structure.buttons.push({
                            selector: selector,
                            tag: tag,
                            text: element.text || '',
                            html: element.html || {}
                        });
                    }
                });
            }
        } else {
            // 从表单HTML中解析子元素，并在allElements中找到对应的完整元素信息
            console.log(`[MainModule] 从表单HTML中提取子元素...`);
            
            // 简单的HTML解析来找到input/button元素
            const inputMatches = formHtml.match(/<(input|textarea|select|button)[^>]*>/gi) || [];
            
            inputMatches.forEach(match => {
                const tag = match.match(/<(\w+)/)[1].toLowerCase();
                
                // 尝试从匹配的HTML中提取关键属性
                const idMatch = match.match(/id\s*=\s*["']([^"']+)["']/i);
                const nameMatch = match.match(/name\s*=\s*["']([^"']+)["']/i);
                const classMatch = match.match(/class\s*=\s*["']([^"']+)["']/i);
                const typeMatch = match.match(/type\s*=\s*["']([^"']+)["']/i);
                
                // 在allElements中查找匹配的元素（确保allElements是数组）
                const matchingElement = Array.isArray(allElements) ? allElements.find(element => {
                    const elTag = (element.tag || '').toLowerCase();
                    if (elTag !== tag) return false;
                    
                    const elHtml = element.html && element.html.outerHTML ? element.html.outerHTML : '';
                    
                    // 多种匹配策略
                    if (idMatch && elHtml.includes(`id="${idMatch[1]}"`)) return true;
                    if (nameMatch && elHtml.includes(`name="${nameMatch[1]}"`)) return true;
                    if (classMatch && elHtml.includes(`class="${classMatch[1]}"`)) return true;
                    if (typeMatch && elHtml.includes(`type="${typeMatch[1]}"`)) return true;
                    
                    return false;
                }) : null;
                
                if (matchingElement) {
                    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
                        structure.inputs.push({
                            selector: matchingElement.selector,
                            tag: tag,
                            text: matchingElement.text || '',
                            html: matchingElement.html || {},
                            type: this._getInputType(matchingElement),
                            attributes: this._extractAttributesFromHtml(match)
                        });
                    } else if (tag === 'button') {
                        structure.buttons.push({
                            selector: matchingElement.selector,
                            tag: tag,
                            text: matchingElement.text || '',
                            html: matchingElement.html || {},
                            attributes: this._extractAttributesFromHtml(match)
                        });
                    }
                }
            });
        }
        
        console.log(`[MainModule] 提取的表单结构: ${structure.inputs.length} 个输入字段, ${structure.buttons.length} 个按钮`);
        return structure;
    }
    
    /**
     * 从HTML字符串中提取属性
     * @param {string} htmlString - HTML字符串
     * @returns {Object} 属性对象
     */
    _extractAttributesFromHtml(htmlString) {
        const attributes = {};
        const attrRegex = /(\w+)\s*=\s*["']([^"']+)["']/gi;
        let match;
        while ((match = attrRegex.exec(htmlString)) !== null) {
            attributes[match[1].toLowerCase()] = match[2];
        }
        return attributes;
    }
    
    /**
     * 获取输入元素的类型
     * @param {Object} element - 元素对象
     * @returns {string} 输入类型
     */
    _getInputType(element) {
        const html = element.html && element.html.outerHTML ? element.html.outerHTML : '';
        const typeMatch = html.match(/type\s*=\s*["']([^"']+)["']/i);
        if (typeMatch) {
            return typeMatch[1].toLowerCase();
        }
        
        const tag = (element.tag || '').toLowerCase();
        if (tag === 'textarea') return 'textarea';
        if (tag === 'select') return 'select';
        
        return 'text'; // 默认类型
    }

    /**
     * 检测并自动处理页面弹窗
     * @param {Object} element - 触发弹窗的元素
     * @param {Array} results - 结果数组，用于记录弹窗信息
     * @param {string} actionType - 动作类型 ('click' 或 'form-submit')
     * @returns {Promise<boolean>} - 是否检测到弹窗
     */
    async _detectAndHandlePopup(element, results, actionType = 'click') {
        try {
            // 检测页面是否有弹窗
            const popupInfo = await this.pageWrapper.page.evaluate(() => {
                // 检查常见的弹窗元素（按优先级排序）
                const popupSelectors = [
                    // Ant Design 弹窗
                    '.ant-modal-wrap:not([style*="display: none"])',
                    '.ant-modal-confirm',
                    '.ant-modal',
                    '.ant-notification',
                    '.ant-message',
                    
                    // Element UI 弹窗
                    '.el-dialog__wrapper:not([style*="display: none"])',
                    '.el-dialog',
                    '.el-notification',
                    '.el-message-box',
                    
                    // 通用弹窗
                    '.modal:not([style*="display: none"])',
                    '.popup:not([style*="display: none"])',
                    '.dialog:not([style*="display: none"])',
                    '.alert:not([style*="display: none"])',
                    '.notification:not([style*="display: none"])',
                    
                    // 其他框架
                    '.layui-layer:not([style*="display: none"])',
                    '.sweet-alert:not([style*="display: none"])',
                    '.swal-modal:not([style*="display: none"])',
                    
                    // 语义化选择器
                    '[role="dialog"]:not([style*="display: none"])',
                    '[role="alertdialog"]:not([style*="display: none"])'
                ];
                
                for (const selector of popupSelectors) {
                    const popup = document.querySelector(selector);
                    if (popup && popup.offsetWidth > 0 && popup.offsetHeight > 0) {
                        // 检查元素是否真的可见
                        const rect = popup.getBoundingClientRect();
                        const style = window.getComputedStyle(popup);
                        
                        if (rect.width > 0 && rect.height > 0 && 
                            style.display !== 'none' && 
                            style.visibility !== 'hidden' &&
                            style.opacity !== '0') {
                            
                            // 尝试获取弹窗文本内容
                            let popupText = popup.textContent || popup.innerText || '';
                            
                            // 特别处理Ant Design确认弹窗
                            const confirmContent = popup.querySelector('.ant-modal-confirm-content, .ant-modal-body');
                            if (confirmContent) {
                                popupText = confirmContent.textContent || confirmContent.innerText || popupText;
                            }
                            
                            // 判断弹窗类型
                            let messageType = 'info';
                            const className = popup.className.toLowerCase();
                            if (className.includes('error') || className.includes('danger')) {
                                messageType = 'error';
                            } else if (className.includes('success')) {
                                messageType = 'success';
                            } else if (className.includes('warning') || className.includes('warn')) {
                                messageType = 'warning';
                            } else if (className.includes('confirm')) {
                                messageType = 'confirm';
                            }
                            
                            console.log(`检测到弹窗: 选择器=${selector}, 类型=${messageType}, 文本=${popupText.slice(0, 50)}...`);
                            
                            return {
                                hasPopup: true,
                                text: popupText.trim(),
                                messageType: messageType,
                                selector: selector,
                                className: popup.className
                            };
                        }
                    }
                }
                
                // 检查JavaScript原生弹窗（alert/confirm等）
                // 注意：这些通常已经被browser自动处理了
                return { hasPopup: false };
            });

            if (popupInfo.hasPopup) {
                console.log(`[MainModule] 检测到${actionType}后出现弹窗！`);
                
                // 安全获取弹窗信息
                const messageType = popupInfo.messageType || '未知';
                const popupText = popupInfo.text || '未能获取弹窗文本';
                const truncatedText = popupText.slice(0, 100) + (popupText.length > 100 ? '...' : '');
                
                console.log(`[MainModule] 弹窗类型: ${messageType}`);
                console.log(`[MainModule] 弹窗内容: ${truncatedText}`);
                
                // 等待弹窗完全加载
                await this._waitForPopupStable(popupInfo.selector);
                
                // 获取弹窗内的所有元素并判断是否包含表单
                const popupFormAnalysis = await this._analyzePopupForForms(popupInfo.selector);
                
                if (popupFormAnalysis.hasForm) {
                    console.log(`[MainModule] 弹窗内检测到表单！开始处理表单...`);
                    
                    // 复用现有表单处理逻辑
                    const formProcessResult = await this._handlePopupForms(popupFormAnalysis, results, element, actionType);
                    
                    if (formProcessResult.success) {
                        console.log(`[MainModule] 弹窗表单处理成功`);
                    } else {
                        console.log(`[MainModule] 弹窗表单处理失败，回退到普通弹窗处理`);
                        await this._autoHandlePopup();
                    }
                } else {
                    console.log(`[MainModule] 弹窗内未检测到表单，进行普通弹窗处理`);
                    
                    // 普通弹窗处理
                    const popupHandled = await this._autoHandlePopup();
                    if (popupHandled) {
                        console.log(`[MainModule] 弹窗已自动处理`);
                    } else {
                        console.log(`[MainModule] 弹窗未能自动处理`);
                    }
                    
                    // 记录普通弹窗结果
                    results.push({
                        element,
                        type: 'popup',
                        actionType,
                        popupInfo: popupInfo
                    });
                }
                
                // 弹窗处理完成后的强制清理
                console.log(`[MainModule] 开始弹窗处理后的强制清理...`);
                await this._performPostPopupCleanup(actionType);
                
                return true;
            }
            
            return false;
        } catch (error) {
            console.warn(`[MainModule] 检测弹窗时出错: ${error.message}`);
            return false;
        }
    }

    /**
     * 简单弹窗检测和处理（只处理按钮，不检测表单，避免无限递归）
     * @param {Object} element - 触发弹窗的元素
     * @param {Array} results - 结果数组，用于记录弹窗信息
     * @param {string} actionType - 动作类型
     * @returns {Promise<boolean>} - 是否检测到弹窗
     */
    async _detectAndHandleSimplePopup(element, results, actionType = 'click') {
        try {
            console.log(`[MainModule] 简单弹窗检测: ${actionType}`);
            
            // 检测页面是否有弹窗
            const popupInfo = await this.pageWrapper.page.evaluate(() => {
                // 检查常见的弹窗元素（按优先级排序）
                const popupSelectors = [
                    // Ant Design 弹窗
                    '.ant-modal-wrap:not([style*="display: none"])',
                    '.ant-modal-confirm',
                    '.ant-modal',
                    '.ant-notification',
                    '.ant-message',
                    
                    // Element UI 弹窗
                    '.el-dialog__wrapper:not([style*="display: none"])',
                    '.el-dialog',
                    '.el-notification',
                    '.el-message-box',
                    
                    // 通用弹窗
                    '.modal:not([style*="display: none"])',
                    '.popup:not([style*="display: none"])',
                    '.dialog:not([style*="display: none"])',
                    '.alert:not([style*="display: none"])',
                    '.notification:not([style*="display: none"])',
                    
                    // 其他框架
                    '.layui-layer:not([style*="display: none"])',
                    '.sweet-alert:not([style*="display: none"])',
                    '.swal-modal:not([style*="display: none"])',
                    
                    // 语义化选择器
                    '[role="dialog"]:not([style*="display: none"])',
                    '[role="alertdialog"]:not([style*="display: none"])'
                ];
                
                for (const selector of popupSelectors) {
                    const popup = document.querySelector(selector);
                    if (popup && popup.offsetWidth > 0 && popup.offsetHeight > 0) {
                        // 检查元素是否真的可见
                        const rect = popup.getBoundingClientRect();
                        const style = window.getComputedStyle(popup);
                        
                        if (rect.width > 0 && rect.height > 0 && 
                            style.display !== 'none' && 
                            style.visibility !== 'hidden' &&
                            style.opacity !== '0') {
                            
                            // 尝试获取弹窗文本内容
                            let popupText = popup.textContent || popup.innerText || '';
                            
                            // 特别处理Ant Design确认弹窗
                            const confirmContent = popup.querySelector('.ant-modal-confirm-content, .ant-modal-body');
                            if (confirmContent) {
                                popupText = confirmContent.textContent || confirmContent.innerText || popupText;
                            }
                            
                            // 判断弹窗类型
                            let messageType = 'info';
                            const className = popup.className.toLowerCase();
                            if (className.includes('error') || className.includes('danger')) {
                                messageType = 'error';
                            } else if (className.includes('success')) {
                                messageType = 'success';
                            } else if (className.includes('warning') || className.includes('warn')) {
                                messageType = 'warning';
                            } else if (className.includes('confirm')) {
                                messageType = 'confirm';
                            }
                            
                            console.log(`检测到简单弹窗: 选择器=${selector}, 类型=${messageType}, 文本=${popupText.slice(0, 50)}...`);
                            
                            return {
                                hasPopup: true,
                                text: popupText.trim(),
                                messageType: messageType,
                                selector: selector,
                                className: popup.className
                            };
                        }
                    }
                }
                
                return { hasPopup: false };
            });

            if (popupInfo.hasPopup) {
                console.log(`[MainModule] 检测到${actionType}后出现简单弹窗！`);
                
                // 安全获取弹窗信息
                const messageType = popupInfo.messageType || '未知';
                const popupText = popupInfo.text || '未能获取弹窗文本';
                const truncatedText = popupText.slice(0, 100) + (popupText.length > 100 ? '...' : '');
                
                console.log(`[MainModule] 简单弹窗类型: ${messageType}`);
                console.log(`[MainModule] 简单弹窗内容: ${truncatedText}`);
                
                // 直接处理弹窗（点击按钮），不检测表单
                const popupHandled = await this._autoHandlePopup();
                if (popupHandled) {
                    console.log(`[MainModule] 简单弹窗已自动处理`);
                } else {
                    console.log(`[MainModule] 简单弹窗未能自动处理`);
                }
                
                // 记录简单弹窗处理结果
                results.push({
                    element,
                    type: 'simple-popup',
                    actionType,
                    popupInfo: popupInfo,
                    handled: popupHandled,
                    timestamp: new Date().toISOString()
                });
                
                return true;
            }
            
            return false;
        } catch (error) {
            console.warn(`[MainModule] 简单弹窗检测时出错: ${error.message}`);
            return false;
        }
    }

    /**
     * 等待弹窗内容稳定（等待动态内容加载完成）
     * @param {string} popupSelector - 弹窗选择器
     * @param {number} maxWait - 最大等待时间（毫秒）
     * @returns {Promise<boolean>} - 是否成功等待到稳定状态
     */
    async _waitForPopupStable(popupSelector, maxWait = 3000) {
        try {
            console.log(`[MainModule] 等待弹窗内容稳定: ${popupSelector}`);
            
            let previousElementCount = 0;
            let stableCount = 0;
            const checkInterval = 300; // 检查间隔
            const requiredStableChecks = 3; // 需要连续稳定的检查次数
            
            const startTime = Date.now();
            
            while (Date.now() - startTime < maxWait) {
                const currentElementCount = await this.pageWrapper.page.evaluate((selector) => {
                    const popup = document.querySelector(selector);
                    if (!popup) return 0;
                    
                    // 统计弹窗内的所有元素数量
                    return popup.querySelectorAll('*').length;
                }, popupSelector);
                
                if (currentElementCount === previousElementCount && currentElementCount > 0) {
                    stableCount++;
                    if (stableCount >= requiredStableChecks) {
                        console.log(`[MainModule] 弹窗内容已稳定，元素数量: ${currentElementCount}`);
                        return true;
                    }
                } else {
                    stableCount = 0; // 重置稳定计数
                }
                
                previousElementCount = currentElementCount;
                await new Promise(resolve => setTimeout(resolve, checkInterval));
            }
            
            console.log(`[MainModule] 弹窗稳定等待超时，当前元素数量: ${previousElementCount}`);
            return true; // 即使超时也继续处理
        } catch (error) {
            console.warn(`[MainModule] 等待弹窗稳定时出错: ${error.message}`);
            return true; // 出错时也继续处理
        }
    }

    /**
     * 自动处理弹窗（点击确定/关闭按钮等）
     * @returns {Promise<boolean>} - 是否成功处理弹窗
     */
    async _autoHandlePopup() {
        try {
            console.log(`[MainModule] 尝试自动处理弹窗...`);
            
            const handled = await this.pageWrapper.page.evaluate(() => {
                // 扩展的选择器列表，按优先级排序
                const standardSelectors = [
                    // Ant Design 特定选择器
                    '.ant-modal-confirm-btns button',
                    '.ant-modal-confirm-btns .ant-btn-primary',
                    '.ant-modal-footer .ant-btn-primary',
                    '.ant-btn-primary',
                    '.ant-modal .ant-btn',
                    
                    // 通用模态框选择器
                    '.modal-footer button',
                    '.modal-footer .btn-primary',
                    '.modal-content button',
                    '.modal button',
                    
                    // Element UI
                    '.el-dialog__footer .el-button--primary',
                    '.el-button--primary',
                    '.el-dialog button',
                    
                    // 通用按钮选择器
                    'button.ok', 
                    'button.confirm', 
                    '.btn-primary', 
                    'button[type="submit"]', 
                    '.confirm-btn', 
                    '.dialog button',
                    '.popup button',
                    'button.close',
                    'button.btn-close',
                    'button.btn-ok',
                    '.modal-footer .btn'
                ];
                
                // 按优先级查找并点击按钮
                for (const selector of standardSelectors) {
                    const buttons = document.querySelectorAll(selector);
                    for (const button of buttons) {
                        // 检查按钮是否可见并可点击
                        if (button.offsetWidth > 0 && button.offsetHeight > 0) {
                            const rect = button.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0) {
                                console.log(`找到弹窗按钮(${selector})，点击中...`);
                                button.click();
                                return true;
                            }
                        }
                    }
                }
                
                // 文本内容查找（更全面的按钮查找）
                const textMatches = ['确定', 'OK', '确认', 'Confirm', '是', 'Yes', '关闭', 'Close', '取消', 'Cancel'];
                
                // 查找所有可能的按钮元素
                const buttonSelectors = [
                    'button', 
                    '.btn', 
                    '[role="button"]',
                    '.ant-btn',
                    '.el-button',
                    'input[type="button"]',
                    'input[type="submit"]'
                ];
                
                for (const btnSelector of buttonSelectors) {
                    const buttons = document.querySelectorAll(btnSelector);
                    for (const button of buttons) {
                        if (button.offsetWidth > 0 && button.offsetHeight > 0) {
                            const rect = button.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0) {
                                // 检查按钮文本内容
                                const buttonText = button.textContent || button.innerText || '';
                                const buttonValue = button.value || '';
                                const allText = (buttonText + ' ' + buttonValue).trim();
                                
                                if (textMatches.some(text => allText.includes(text))) {
                                    console.log(`找到文本匹配的按钮: "${allText}"，选择器: "${btnSelector}"，点击中...`);
                                    button.click();
                                    return true;
                                }
                            }
                        }
                    }
                }
                
                // 特殊情况：查找包含确认类名的父容器中的按钮
                const confirmContainers = document.querySelectorAll('.ant-modal-confirm-btns, .modal-footer, .dialog-footer, .confirm-buttons');
                for (const container of confirmContainers) {
                    const buttons = container.querySelectorAll('button, .btn, [role="button"]');
                    for (const button of buttons) {
                        if (button.offsetWidth > 0 && button.offsetHeight > 0) {
                            console.log(`在确认容器中找到按钮，点击中...`);
                            button.click();
                            return true;
                        }
                    }
                }
                
                // 尝试按ESC键关闭弹窗
                console.log(`没有找到合适的按钮，尝试按ESC键...`);
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27 }));
                document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', keyCode: 27 }));
                
                return false; // ESC键无法确定是否成功，返回false
            });
            
            // 等待弹窗消失
            await new Promise(resolve => setTimeout(resolve, 1000)); // 增加等待时间
            
            return handled;
        } catch (error) {
            console.warn(`[MainModule] 自动处理弹窗失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 分析弹窗内容，判断是否包含表单（复用现有的元素检测逻辑）
     * @param {string} popupSelector - 弹窗选择器
     * @returns {Promise<Object>} - 分析结果
     */
    async _analyzePopupForForms(popupSelector) {
        try {
            console.log(`[MainModule] 分析弹窗内容，查找表单: ${popupSelector}`);
            
            // 复用_getAllCssSelectors的逻辑，但限定在弹窗内
            const popupElements = await this.pageWrapper.page.evaluate((selector) => {
                const popup = document.querySelector(selector);
                if (!popup) return [];
                
                // 复用相同的generateCssPath逻辑
                function generateCssPath(element) {
                    if (!element) return null;
                    
                    // 如果有ID，直接使用ID（最高优先级）
                    if (element.id) {
                        const idSelector = `#${element.id}`;
                        // 验证ID选择器的唯一性
                        if (document.querySelectorAll(idSelector).length === 1) {
                            return idSelector;
                        }
                    }
                    

                    
                    // 构建完整路径
                    const path = [];
                    let current = element;
                    
                    while (current && current !== document && current !== document.documentElement) {
                        let selector = current.tagName.toLowerCase();
                        
                        // 添加类名（如果有）
                        if (current.className && typeof current.className === 'string') {
                            const classes = current.className.trim().split(/\s+/)
                                .filter(cls => cls.length > 0 && !cls.includes(' '))
                                .join('.');
                            if (classes) {
                                selector += '.' + classes;
                            }
                        }
                        
                        // 检查在父级中的唯一性
                        if (current.parentElement) {
                            const siblings = Array.from(current.parentElement.children);
                            const sameTagSiblings = siblings.filter(sibling => 
                                sibling.tagName.toLowerCase() === current.tagName.toLowerCase()
                            );
                            
                            // 如果同类型兄弟节点多于1个，需要添加nth-child
                            if (sameTagSiblings.length > 1) {
                                const index = siblings.indexOf(current) + 1;
                                selector += `:nth-child(${index})`;
                            }
                        }
                        
                        path.unshift(selector);
                        current = current.parentElement;
                        
                        // 避免无限循环
                        if (path.length > 15) break;
                    }
                    
                    return path.join(' > ');
                }
                
                // 获取弹窗内所有元素
                const allElements = popup.querySelectorAll('*');
                const results = [];
                
                for (const element of allElements) {
                    try {
                        const selector = generateCssPath(element);
                        if (selector) {
                            // 验证选择器的唯一性
                            const matchedElements = document.querySelectorAll(selector);
                            const isUnique = matchedElements.length === 1 && matchedElements[0] === element;
                            
                            if (isUnique) {
                                // 检查元素的基本属性
                                const style = window.getComputedStyle(element);
                                const isVisible = element.offsetWidth > 0 && 
                                                element.offsetHeight > 0 && 
                                                style.display !== 'none' && 
                                                style.visibility !== 'hidden';
                                
                                // 检查是否可能是交互式元素
                                const interactiveTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL', 'FORM'];
                                let isInteractive = interactiveTags.includes(element.tagName);
                                
                                if (!isInteractive) {
                                  // 检查是否有点击相关的类名或属性
                                  const classList = element.classList ? Array.from(element.classList) : [];
                                  const hasClickableClass = classList.some(cls => 
                                      /btn|button|click|link|menu|nav|item|toggle|control/.test(cls.toLowerCase())
                                  );
                                  
                                  if (hasClickableClass) {
                                      isInteractive = true;
                                  }
                                }
                                
                                results.push({
                                    selector: selector,
                                    tag: element.tagName,
                                    text: element.textContent || element.innerText || '',
                                    isVisible: isVisible,
                                    isInteractive: isInteractive,
                                    html: {
                                        outerHTML: element.outerHTML,
                                        innerHTML: element.innerHTML
                                    }
                                });
                            }
                        }
                    } catch (err) {
                        // 单个元素失败不影响整体
                        continue;
                    }
                }
                
                return results;
            }, popupSelector);
            
            console.log(`[MainModule] 弹窗内获取到 ${popupElements.length} 个元素`);
            
            // 复用现有的元素分类逻辑
            const elements = popupElements.filter(item => item.isInteractive || this._isLikelyInteractive(item));
            console.log(`[MainModule] 弹窗内筛选出 ${elements.length} 个潜在可交互元素`);
            
            // 复用现有的元素类型判断和分类逻辑
            const categorizedElements = elements.map(item => ({
                selector: item.selector,
                tag: item.tag,
                text: item.text,
                isVisible: item.isVisible,
                type: this._determineElementType(item),
                html: item.html
            }));
            
            // 按类型分类
            const categories = {
                button: categorizedElements.filter(e => e.type === 'button'),
                link: categorizedElements.filter(e => e.type === 'link'),
                form: categorizedElements.filter(e => e.type === 'form'),
                container: categorizedElements.filter(e => e.type === 'container'),
                other: categorizedElements.filter(e => e.type === 'other')
            };
            
            console.log(`[MainModule] 弹窗元素分类: 按钮(${categories.button.length}), 链接(${categories.link.length}), 表单(${categories.form.length}), 容器(${categories.container.length}), 其他(${categories.other.length})`);
            
            return {
                hasForm: categories.form.length > 0,
                categories: categories,
                totalElements: popupElements.length,
                interactiveElements: elements.length
            };
            
        } catch (error) {
            console.warn(`[MainModule] 分析弹窗表单时出错: ${error.message}`);
            return {
                hasForm: false,
                categories: { button: [], link: [], form: [], container: [], other: [] },
                totalElements: 0,
                interactiveElements: 0
            };
        }
    }

    /**
     * 处理弹窗中的表单（最大程度复用_handleFormElements的逻辑）
     * @param {Object} popupFormAnalysis - 弹窗表单分析结果
     * @param {Array} results - 结果数组
     * @param {Object} triggerElement - 触发弹窗的元素
     * @param {string} actionType - 触发动作类型
     * @returns {Promise<Object>} - 处理结果
     */
    async _handlePopupForms(popupFormAnalysis, results, triggerElement, actionType) {
        try {
            console.log(`[MainModule] 开始处理弹窗表单，共 ${popupFormAnalysis.categories.form.length} 个表单元素`);
            
            // 复用LLMElementHelper
            const LLMElementHelper = require('../llm/llm-element-helper');
            const llmHelper = new LLMElementHelper();
            
            let formCount = 0;
            let overallSuccess = false;
            
            for (const formElement of popupFormAnalysis.categories.form) {
                formCount++;
                console.log(`[MainModule] 处理弹窗表单 ${formCount}/${popupFormAnalysis.categories.form.length}`);
                
                // 复用相同的HTML获取逻辑
                let formHtml = '';
                if (formElement.html && formElement.html.outerHTML) {
                    formHtml = formElement.html.outerHTML;
                    console.log(`[MainModule] 使用已存储的弹窗表单HTML信息，长度: ${formHtml.length} 字符`);
                } else {
                    // 尝试通过选择器获取
                    try {
                        formHtml = await this.pageWrapper.page.evaluate((selector) => {
                            const element = document.querySelector(selector);
                            return element ? element.outerHTML : '<form>弹窗表单HTML获取失败</form>';
                        }, formElement.selector);
                    } catch (error) {
                        console.warn(`[MainModule] 获取弹窗表单HTML失败: ${error.message}`);
                        formHtml = '<form>弹窗表单HTML获取失败</form>';
                    }
                }
                
                console.log(`[MainModule] 使用LLM生成弹窗表单测试数据...`);
                
                // 复用相同的表单分析逻辑
                let formAnalysisResult = {};
                
                // 创建临时的allElements（弹窗内的元素）
                const popupAllElements = [
                    ...popupFormAnalysis.categories.form,
                    ...popupFormAnalysis.categories.button,
                    ...popupFormAnalysis.categories.other
                ];
                
                // 复用_extractFormStructure逻辑
                const formStructure = this._extractFormStructure(formElement, popupAllElements);
                
                if (formStructure.inputs.length > 0) {
                     console.log(`[MainModule] 使用改进的弹窗表单数据生成方法`);
                    formAnalysisResult = await llmHelper.generateFormDataFromStructure(formStructure);
                } else {
                    console.log(`[MainModule] 回退：使用LLM方法生成弹窗表单数据`);
                    formAnalysisResult = await llmHelper.generateFormTestDataWithSubmit(formHtml);
                }
                
                console.log(`[MainModule] 弹窗表单分析结果:`, JSON.stringify(formAnalysisResult, null, 2));
                
                // 复用相同的表单提交逻辑
                console.log(`[MainModule] 提交弹窗表单...`);
                
                // 在弹窗表单提交前启动请求捕获
                if (this.requestCapture) {
                    const formId = `popup-form-${formCount}`;
                    console.log(`[MainModule] 启动请求捕获，弹窗表单ID: ${formId}`);
                    await this.requestCapture.startCapture(`popup-submit-${formId}`);
                }
                
                let submitResult = await this.pageWrapper.submitFormWithLLMSelectors(
                    formElement, 
                    formAnalysisResult.formData,
                    formAnalysisResult.submitSelectors,
                    formAnalysisResult.recommendedSubmitSelector,
                    formAnalysisResult.submitStrategy
                );
                
                // 弹窗表单提交后停止请求捕获
                if (this.requestCapture) {
                    console.log(`[MainModule] 停止请求捕获`);
                    await this.requestCapture.stopCapture();
                }
                
                // 复用相同的重试逻辑
                let retryCount = 0;
                const maxRetries = 3;
                
                while (!submitResult.success && retryCount < maxRetries) {
                    retryCount++;
                    console.log(`[MainModule] 弹窗表单提交失败，进行第 ${retryCount}/${maxRetries} 次重试...`);
                    
                    // 检查失败原因，如果是字段填充失败，尝试不同的处理策略
                    const isFieldError = submitResult.error && (
                        submitResult.error.includes('填充字段失败') ||
                        submitResult.error.includes('not clickable') ||
                        submitResult.error.includes('not an Element')
                    );
                    
                    if (isFieldError) {
                        console.log(`[MainModule] 检测到弹窗表单字段填充错误，尝试简化表单数据...`);
                        // 对于字段填充失败，尝试减少填充的字段数量，只填充必需字段
                        const essentialFields = this._getEssentialFormFields(formAnalysisResult.formData);
                        formAnalysisResult.formData = essentialFields;
                        console.log(`[MainModule] 简化后的弹窗表单数据:`, JSON.stringify(formAnalysisResult.formData, null, 2));
                    } else {
                        // 普通错误，重新生成表单数据（可能页面已变化）
                        if (formStructure.inputs.length > 0) {
                            formAnalysisResult = await llmHelper.generateFormDataFromStructure(formStructure);
                        } else {
                            formAnalysisResult = await llmHelper.generateFormTestDataWithSubmit(formHtml);
                        }
                    }
                    
                    // 重新启动请求捕获
                    if (this.requestCapture) {
                        const formId = `popup-form-${formCount}-${actionType}-retry${retryCount}`;
                        await this.requestCapture.startCapture(`popup-submit-${formId}`);
                    }
                    
                    submitResult = await this.pageWrapper.submitFormWithLLMSelectors(
                        formElement, 
                        formAnalysisResult.formData,
                        formAnalysisResult.submitSelectors,
                        formAnalysisResult.recommendedSubmitSelector,
                        formAnalysisResult.submitStrategy
                    );
                    
                    if (this.requestCapture) {
                        await this.requestCapture.stopCapture();
                    }
                    
                    // 短暂等待
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                
                if (submitResult.success) {
                    console.log(`[MainModule] 弹窗表单 ${formCount} 提交成功！`);
                    overallSuccess = true;
                    
                    // 等待提交后的响应
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    // 检测提交后是否出现新弹窗（只处理简单弹窗，不检测表单）
                    console.log(`[MainModule] 检测弹窗表单提交后是否出现新弹窗...`);
                    const hasNewPopup = await this._detectAndHandleSimplePopup(triggerElement, results, 'popup-form-submit');
                    
                    if (hasNewPopup) {
                        console.log(`[MainModule] 弹窗表单提交后出现新弹窗，已处理`);
                    }
                    
                } else {
                    console.error(`[MainModule] 弹窗表单 ${formCount} 提交失败！错误: ${submitResult.error}`);
                    
                    // 弹窗表单提交失败后的强制处理
                    console.log(`[MainModule] 开始对弹窗表单进行强制处理...`);
                    const forceHandled = await this._handlePopupSubmissionFailure(formElement, submitResult, retryCount, actionType);
                    if (forceHandled) {
                        console.log(`[MainModule] 弹窗表单强制处理完成`);
                    } else {
                        console.error(`[MainModule] 弹窗表单强制处理也失败了`);
                    }
                }
                
                // 记录弹窗表单处理结果
                results.push({
                    element: triggerElement,
                    type: 'popup-form',
                    formSelector: formElement.selector,
                    actionType,
                    formData: formAnalysisResult.formData || {},
                    submitResult: submitResult,
                    retryCount: retryCount,
                    forceHandled: submitResult.success ? false : true, // 添加强制处理标记
                    timestamp: new Date().toISOString()
                });
                
                // 表单间添加延迟
                if (formCount < popupFormAnalysis.categories.form.length) {
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
            }
            
            return {
                success: overallSuccess,
                processedForms: formCount,
                totalForms: popupFormAnalysis.categories.form.length
            };
            
        } catch (error) {
            console.error(`[MainModule] 处理弹窗表单时出错: ${error.message}`);
            console.error(`[MainModule] 错误堆栈: ${error.stack}`);
            
            // 记录错误结果
            results.push({
                element: triggerElement,
                type: 'popup-form',
                actionType,
                error: error.message,
                success: false,
                timestamp: new Date().toISOString()
            });
            
            return {
                success: false,
                error: error.message,
                processedForms: 0,
                totalForms: popupFormAnalysis.categories.form ? popupFormAnalysis.categories.form.length : 0
            };
        }
    }

    /**
     * 处理主表单提交失败的强制方法
     * @param {Object} formElement - 表单元素
     * @param {Object} submitResult - 提交结果
     * @param {number} retryCount - 重试次数
     * @returns {Promise<boolean>} - 是否强制处理成功
     */
    async _handleSubmissionFailure(formElement, submitResult, retryCount) {
        try {
            console.log(`[MainModule] 开始表单提交失败的强制处理，重试次数: ${retryCount}`);
            
            // 1. 强制关闭所有弹窗
            console.log(`[MainModule] 强制关闭所有弹窗...`);
            const popupsClosed = await this.pageWrapper.forceClosePopups();
            if (popupsClosed) {
                console.log(`[MainModule] 成功强制关闭弹窗`);
                await new Promise(r => setTimeout(r, 1000));
            }
            
            // 2. 检测页面是否还有弹窗
            const hasRemainingPopups = await this._detectPopupPresence();
            if (hasRemainingPopups) {
                console.log(`[MainModule] 仍有弹窗存在，尝试页面刷新...`);
                await this.pageWrapper.forceRefreshPage();
                await new Promise(r => setTimeout(r, 2000));
            }
            
            // 3. 验证页面稳定性
            const isStable = await this._verifyPageStability();
            if (!isStable) {
                console.log(`[MainModule] 页面不稳定，等待稳定...`);
                await new Promise(r => setTimeout(r, 3000));
            }
            
            // 4. 重新验证表单状态
            const formStillExists = await this.pageWrapper.page.evaluate((selector) => {
                const form = document.querySelector(selector);
                if (form) {
                    const rect = form.getBoundingClientRect();
                    const style = window.getComputedStyle(form);
                    return rect.width > 0 && rect.height > 0 && 
                           style.display !== 'none' && 
                           style.visibility !== 'hidden';
                }
                return false;
            }, formElement.selector);
            
            if (formStillExists) {
                console.log(`[MainModule] 表单仍然存在，强制处理成功`);
                return true;
            } else {
                console.log(`[MainModule] 表单已消失，可能提交成功`);
                return true;
            }
            
        } catch (error) {
            console.error(`[MainModule] 强制处理表单失败时出错: ${error.message}`);
            return false;
        }
    }

    /**
     * 处理弹窗表单提交失败的强制方法
     * @param {Object} formElement - 表单元素
     * @param {Object} submitResult - 提交结果
     * @param {number} retryCount - 重试次数
     * @param {string} actionType - 动作类型
     * @returns {Promise<boolean>} - 是否强制处理成功
     */
    async _handlePopupSubmissionFailure(formElement, submitResult, retryCount, actionType) {
        try {
            console.log(`[MainModule] 开始弹窗表单提交失败的强制处理，动作类型: ${actionType}，重试次数: ${retryCount}`);
            
            // 1. 多次尝试强制关闭弹窗
            let closeAttempts = 0;
            const maxCloseAttempts = 3;
            let popupsClosed = false;
            
            while (!popupsClosed && closeAttempts < maxCloseAttempts) {
                closeAttempts++;
                console.log(`[MainModule] 第 ${closeAttempts}/${maxCloseAttempts} 次尝试强制关闭弹窗...`);
                
                popupsClosed = await this.pageWrapper.forceClosePopups();
                if (popupsClosed) {
                    console.log(`[MainModule] 弹窗强制关闭成功`);
                    await new Promise(r => setTimeout(r, 1000));
                    
                    // 验证弹窗是否真的关闭了
                    const hasPopups = await this._detectPopupPresence();
                    if (!hasPopups) {
                        popupsClosed = true;
                        break;
                    } else {
                        console.log(`[MainModule] 弹窗仍然存在，继续尝试...`);
                        popupsClosed = false;
                    }
                } else {
                    console.log(`[MainModule] 弹窗关闭失败，等待后重试...`);
                    await new Promise(r => setTimeout(r, 1500));
                }
            }
            
            // 2. 如果弹窗仍然存在，尝试页面刷新
            if (!popupsClosed) {
                console.log(`[MainModule] 多次尝试关闭弹窗失败，尝试刷新页面...`);
                await this.pageWrapper.forceRefreshPage();
                await new Promise(r => setTimeout(r, 3000));
                
                // 刷新后验证弹窗状态
                const hasPopupsAfterRefresh = await this._detectPopupPresence();
                if (!hasPopupsAfterRefresh) {
                    console.log(`[MainModule] 页面刷新成功，弹窗已消失`);
                    popupsClosed = true;
                } else {
                    console.warn(`[MainModule] 页面刷新后仍有弹窗残留，可能需要手动处理`);
                }
            }
            
            // 3. 验证页面稳定性
            const isStable = await this._verifyPageStability();
            if (!isStable) {
                console.log(`[MainModule] 页面不稳定，等待恢复...`);
                await new Promise(r => setTimeout(r, 2000));
            }
            
            console.log(`[MainModule] 弹窗表单强制处理完成，结果: ${popupsClosed ? '成功' : '部分成功'}`);
            return popupsClosed;
            
        } catch (error) {
            console.error(`[MainModule] 强制处理弹窗表单失败时出错: ${error.message}`);
            return false;
        }
    }

    /**
     * 检测页面是否存在弹窗
     * @returns {Promise<boolean>} - 是否存在弹窗
     */
    async _detectPopupPresence() {
        try {
            const hasPopups = await this.pageWrapper.page.evaluate(() => {
                const popupSelectors = [
                    // 常见弹窗选择器
                    '.modal', '.ant-modal', '.el-dialog', '.dialog',
                    '.popup', '.overlay', '.modal-backdrop',
                    '.ant-modal-wrap', '.el-dialog__wrapper',
                    '.layui-layer', '.sweet-alert', '.swal-modal',
                    '[role="dialog"]', '[role="alertdialog"]'
                ];
                
                for (const selector of popupSelectors) {
                    const elements = document.querySelectorAll(selector);
                    for (const element of elements) {
                        if (element.offsetParent !== null) { // 检查元素是否可见
                            const rect = element.getBoundingClientRect();
                            const style = window.getComputedStyle(element);
                            
                            if (rect.width > 0 && rect.height > 0 && 
                                style.display !== 'none' && 
                                style.visibility !== 'hidden' && 
                                style.opacity !== '0') {
                                return true;
                            }
                        }
                    }
                }
                return false;
            });
            
            return hasPopups;
        } catch (error) {
            console.warn(`[MainModule] 检测弹窗存在性时出错: ${error.message}`);
            return false;
        }
    }

    /**
     * 验证页面稳定性
     * @param {number} timeout - 等待超时时间（毫秒）
     * @returns {Promise<boolean>} - 页面是否稳定
     */
    async _verifyPageStability(timeout = 5000) {
        try {
            console.log(`[MainModule] 验证页面稳定性...`);
            
            const startTime = Date.now();
            let previousElementCount = 0;
            let stableCount = 0;
            const checkInterval = 500;
            const requiredStableChecks = 3;
            
            while (Date.now() - startTime < timeout) {
                // 检查DOM元素数量
                const currentElementCount = await this.pageWrapper.page.evaluate(() => {
                    return document.querySelectorAll('*').length;
                });
                
                // 检查加载指示器
                const hasLoadingIndicators = await this.pageWrapper.page.evaluate(() => {
                    const loadingSelectors = [
                        '.loading', '.spinner', '.ant-spin', '.loader',
                        '[data-loading="true"]', '.loading-overlay',
                        '.el-loading-mask'
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
                
                if (currentElementCount === previousElementCount && !hasLoadingIndicators) {
                    stableCount++;
                    if (stableCount >= requiredStableChecks) {
                        console.log(`[MainModule] 页面已稳定，元素数量: ${currentElementCount}`);
                        return true;
                    }
                } else {
                    stableCount = 0; // 重置稳定计数
                }
                
                previousElementCount = currentElementCount;
                await new Promise(resolve => setTimeout(resolve, checkInterval));
            }
            
            console.log(`[MainModule] 页面稳定性验证超时，当前元素数量: ${previousElementCount}`);
            return true; // 即使超时也认为稳定，继续处理
        } catch (error) {
            console.warn(`[MainModule] 验证页面稳定性时出错: ${error.message}`);
            return true; // 出错时也认为稳定
        }
    }

    /**
     * 弹窗处理后的强制清理方法
     * @param {string} actionType - 动作类型
     * @returns {Promise<boolean>} - 是否清理成功
     */
    async _performPostPopupCleanup(actionType = 'popup') {
        try {
            console.log(`[MainModule] 开始弹窗处理后的强制清理，动作类型: ${actionType}`);
            
            // 等待DOM稳定
            await new Promise(r => setTimeout(r, 1000));
            
            // 1. 检测是否还有弹窗残留
            console.log(`[MainModule] 检测弹窗残留...`);
            const hasRemainingPopups = await this._detectPopupPresence();
            
            if (hasRemainingPopups) {
                console.log(`[MainModule] 检测到弹窗残留，开始强制清理...`);
                
                // 2. 第一次尝试：强制关闭弹窗
                let clearedSuccessfully = await this.pageWrapper.forceClosePopups();
                await new Promise(r => setTimeout(r, 1500));
                
                // 3. 验证第一次清理效果
                const stillHasPopups = await this._detectPopupPresence();
                if (stillHasPopups) {
                    console.log(`[MainModule] 第一次清理未完全成功，进行第二次尝试...`);
                    
                    // 4. 第二次尝试：更激进的清理
                    await this.pageWrapper.page.evaluate(() => {
                        // 删除所有模态框相关的CSS类和元素
                        const modalClasses = ['modal', 'popup', 'dialog', 'overlay', 'backdrop'];
                        modalClasses.forEach(cls => {
                            const elements = document.querySelectorAll(`.${cls}, [class*="${cls}"]`);
                            elements.forEach(el => {
                                try {
                                    el.remove();
                                } catch (e) {
                                    el.style.display = 'none';
                                }
                            });
                        });
                        
                        // 清理body上的modal相关类
                        document.body.className = document.body.className
                            .split(' ')
                            .filter(cls => !modalClasses.some(modal => cls.includes(modal)))
                            .join(' ');
                            
                        // 恢复body滚动
                        document.body.style.overflow = '';
                        document.documentElement.style.overflow = '';
                    });
                    
                    await new Promise(r => setTimeout(r, 1000));
                    
                    // 5. 第三次验证
                    const finalCheck = await this._detectPopupPresence();
                    if (finalCheck) {
                        console.log(`[MainModule] 强制清理仍未完全成功，尝试页面刷新...`);
                        
                        // 6. 最后手段：页面刷新
                        await this.pageWrapper.forceRefreshPage();
                        await new Promise(r => setTimeout(r, 3000));
                        
                        // 验证刷新后状态
                        const afterRefreshCheck = await this._detectPopupPresence();
                        if (!afterRefreshCheck) {
                            console.log(`[MainModule] 页面刷新后清理成功`);
                        } else {
                            console.warn(`[MainModule] 页面刷新后仍有弹窗残留，可能需要手动处理`);
                        }
                    } else {
                        console.log(`[MainModule] 第二次强制清理成功`);
                    }
                } else {
                    console.log(`[MainModule] 第一次强制清理成功`);
                }
            } else {
                console.log(`[MainModule] 没有检测到弹窗残留，无需清理`);
            }
            
            // 7. 验证页面稳定性
            console.log(`[MainModule] 验证页面稳定性...`);
            const isStable = await this._verifyPageStability();
            if (!isStable) {
                console.log(`[MainModule] 页面不稳定，等待恢复...`);
                await new Promise(r => setTimeout(r, 2000));
            }
            
            // 8. 确保页面处于可操作状态
            console.log(`[MainModule] 确保页面处于可操作状态...`);
            await this._ensurePageOperational();
            
            console.log(`[MainModule] 弹窗处理后的强制清理完成`);
            return true;
            
        } catch (error) {
            console.error(`[MainModule] 弹窗处理后清理时出错: ${error.message}`);
            console.error(`[MainModule] 错误堆栈: ${error.stack}`);
            return false;
        }
    }

    /**
     * 确保页面处于可操作状态
     * @returns {Promise<boolean>} - 页面是否可操作
     */
    async _ensurePageOperational() {
        try {
            console.log(`[MainModule] 检查页面可操作性...`);
            
            // 1. 检查页面基本状态
            const basicStatus = await this.pageWrapper.page.evaluate(() => {
                return {
                    readyState: document.readyState,
                    hasActiveElement: document.activeElement !== null,
                    bodyVisible: document.body && document.body.offsetWidth > 0,
                    noLoadingIndicators: document.querySelectorAll('[class*="loading"], [class*="spinner"]').length === 0
                };
            });
            
            console.log(`[MainModule] 页面基本状态:`, basicStatus);
            
            // 2. 如果页面未完全加载，等待
            if (basicStatus.readyState !== 'complete') {
                console.log(`[MainModule] 页面未完全加载，等待完成...`);
                await this.pageWrapper.page.waitForLoadState('load', { timeout: 10000 });
            }
            
            // 3. 检查是否有阻塞性覆盖层
            const hasBlockingOverlays = await this.pageWrapper.page.evaluate(() => {
                const overlays = document.querySelectorAll('[class*="overlay"], [class*="backdrop"], [class*="mask"]');
                return Array.from(overlays).some(overlay => {
                    const style = window.getComputedStyle(overlay);
                    const rect = overlay.getBoundingClientRect();
                    return style.display !== 'none' && 
                           style.visibility !== 'hidden' && 
                           style.opacity !== '0' &&
                           rect.width > 0 && rect.height > 0 &&
                           style.zIndex > 999;
                });
            });
            
            if (hasBlockingOverlays) {
                console.log(`[MainModule] 检测到阻塞性覆盖层，尝试清除...`);
                await this.pageWrapper.page.evaluate(() => {
                    const overlays = document.querySelectorAll('[class*="overlay"], [class*="backdrop"], [class*="mask"]');
                    overlays.forEach(overlay => {
                        const style = window.getComputedStyle(overlay);
                        if (style.zIndex > 999) {
                            try {
                                overlay.remove();
                            } catch (e) {
                                overlay.style.display = 'none';
                            }
                        }
                    });
                });
            }
            
            // 4. 确保页面焦点正常
            await this.pageWrapper.page.evaluate(() => {
                if (!document.activeElement || document.activeElement === document.body) {
                    // 如果没有活动元素，尝试聚焦到第一个可交互元素
                    const focusableElements = document.querySelectorAll('input, button, select, textarea, a[href], [tabindex]:not([tabindex="-1"])');
                    if (focusableElements.length > 0) {
                        try {
                            focusableElements[0].focus();
                        } catch (e) {
                            // 聚焦失败不是关键问题
                        }
                    }
                }
            });
            
            // 5. 最终检查
            const finalCheck = await this.pageWrapper.page.evaluate(() => {
                // 更全面的模态框检测
                const modalSelectors = [
                    '.modal.show, .modal:not([style*="display: none"])',
                    '.popup[style*="block"], .popup:not([style*="display: none"])',
                    '[aria-modal="true"]',
                    '.ant-modal-wrap:not([style*="display: none"])',
                    '.ant-modal-confirm',
                    '.el-dialog__wrapper:not([style*="display: none"])',
                    '.dialog:not([style*="display: none"])',
                    '.sweet-alert:not([style*="display: none"])',
                    '[role="dialog"]:not([style*="display: none"])'
                ];
                
                let blockingModalsCount = 0;
                
                for (const selector of modalSelectors) {
                    try {
                        const modals = document.querySelectorAll(selector);
                        modals.forEach(modal => {
                            const rect = modal.getBoundingClientRect();
                            const style = window.getComputedStyle(modal);
                            
                            // 检查模态框是否真正可见且阻塞
                            if (rect.width > 0 && rect.height > 0 && 
                                style.display !== 'none' && 
                                style.visibility !== 'hidden' &&
                                style.opacity !== '0' &&
                                parseInt(style.zIndex) > 100) {
                                blockingModalsCount++;
                            }
                        });
                    } catch (e) {
                        // 忽略选择器错误
                    }
                }
                
                return {
                    hasBody: !!document.body,
                    bodyInteractive: document.body && document.body.style.pointerEvents !== 'none',
                    noBlockingModals: blockingModalsCount === 0,
                    blockingModalsCount: blockingModalsCount
                };
            });
            
            const isOperational = finalCheck.hasBody && finalCheck.bodyInteractive && finalCheck.noBlockingModals;
            
            if (!finalCheck.noBlockingModals) {
                console.warn(`[MainModule] 检测到 ${finalCheck.blockingModalsCount} 个阻塞模态框，尝试清理...`);
                
                // 尝试清理阻塞模态框
                await this.pageWrapper.page.evaluate(() => {
                    const modalSelectors = [
                        '.modal.show, .modal:not([style*="display: none"])',
                        '.popup[style*="block"], .popup:not([style*="display: none"])',
                        '[aria-modal="true"]',
                        '.ant-modal-wrap:not([style*="display: none"])',
                        '.ant-modal-confirm',
                        '.el-dialog__wrapper:not([style*="display: none"])',
                        '.dialog:not([style*="display: none"])',
                        '.sweet-alert:not([style*="display: none"])',
                        '[role="dialog"]:not([style*="display: none"])'
                    ];
                    
                    for (const selector of modalSelectors) {
                        try {
                            const modals = document.querySelectorAll(selector);
                            modals.forEach(modal => {
                                const rect = modal.getBoundingClientRect();
                                const style = window.getComputedStyle(modal);
                                
                                if (rect.width > 0 && rect.height > 0 && 
                                    style.display !== 'none' && 
                                    style.visibility !== 'hidden' &&
                                    style.opacity !== '0' &&
                                    parseInt(style.zIndex) > 100) {
                                    
                                    console.log(`清理阻塞模态框: ${selector}`);
                                    try {
                                        modal.remove();
                                    } catch (e) {
                                        modal.style.display = 'none';
                                        modal.style.visibility = 'hidden';
                                    }
                                }
                            });
                        } catch (e) {
                            // 忽略选择器错误
                        }
                    }
                });
                
                // 再次检查清理效果
                await new Promise(r => setTimeout(r, 500));
                const recheckResult = await this.pageWrapper.page.evaluate(() => {
                    const modalSelectors = [
                        '.modal.show, .modal:not([style*="display: none"])',
                        '.popup[style*="block"], .popup:not([style*="display: none"])',
                        '[aria-modal="true"]',
                        '.ant-modal-wrap:not([style*="display: none"])',
                        '.ant-modal-confirm'
                    ];
                    
                    let remainingModals = 0;
                    modalSelectors.forEach(selector => {
                        try {
                            const modals = document.querySelectorAll(selector);
                            modals.forEach(modal => {
                                const rect = modal.getBoundingClientRect();
                                const style = window.getComputedStyle(modal);
                                if (rect.width > 0 && rect.height > 0 && 
                                    style.display !== 'none' && 
                                    parseInt(style.zIndex) > 100) {
                                    remainingModals++;
                                }
                            });
                        } catch (e) {}
                    });
                    return remainingModals;
                });
                
                if (recheckResult === 0) {
                    console.log(`[MainModule] 阻塞模态框清理成功`);
                } else {
                    console.warn(`[MainModule] 仍有 ${recheckResult} 个阻塞模态框未能清理`);
                }
            }
            
            if (isOperational) {
                console.log(`[MainModule] 页面处于可操作状态`);
            } else {
                console.warn(`[MainModule] 页面可能不完全可操作:`, finalCheck);
            }
            
            return isOperational;
            
        } catch (error) {
            console.warn(`[MainModule] 检查页面可操作性时出错: ${error.message}`);
            return false;
        }
    }
}

// 主模块，协调扫描流程
module.exports = MainModule;
