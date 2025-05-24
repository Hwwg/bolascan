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
            let elements = await this.elementDetector.detectStaticElements(this.pageWrapper);
            console.log(`[MainModule] 检测到 ${elements.length} 个静态元素`);
            
            // 获取LLM检测的元素（现在返回的是数组）
            const llmElements = await this.elementDetector.detectWithLLM(htmlContent);
            console.log(`[MainModule] 通过LLM额外检测到 ${llmElements ? llmElements.length : 0} 个元素`);
            
            // 安全地合并数组
            elements = elements.concat(llmElements || []);
            elements = this.elementDetector.filterDuplicates(elements);
            elements = this.elementDetector.prioritizeElements(elements);
            const categories = this.elementDetector.categorizeElements(elements);
            console.log(`[MainModule] 元素分类统计: 按钮(${categories.button.length}), 链接(${categories.link.length}), 表单(${categories.form.length}), 其他(${categories.other.length})`);
            const clickResults = [];
            const jumpUrls = [];
            const currentHost = (new URL(url)).host;
            await this._handleClickElements(categories, clickResults, jumpUrls, currentHost, url, depth);
            await this._handleFormElements(categories, clickResults, jumpUrls, currentHost, url, depth);
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
                    // 使用selector来查找元素
                    const elementInfo = await this.pageWrapper.page.evaluate((selectorHtml) => {
                        try {
                            // 创建临时元素来寻找匹配
                            const tempDiv = document.createElement('div');
                            tempDiv.innerHTML = selectorHtml;
                            const tempEl = tempDiv.firstChild;
                            
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
                } else if (element && element.text) {
                    // 如果元素对象本身有text属性
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
            
            // 检查是否检测到弹窗
            if (clickResult && clickResult.hasPopup) {
                console.log(`[MainModule] 检测到点击后出现弹窗！`);
                if (clickResult.popupInfo) {
                    // 安全获取弹窗信息
                    const messageType = clickResult.popupInfo.messageType || '未知';
                    const popupText = clickResult.popupInfo.text || '未能获取弹窗文本';
                    const truncatedText = popupText.slice(0, 100) + (popupText.length > 100 ? '...' : '');
                    
                    console.log(`[MainModule] 弹窗类型: ${messageType}`);
                    console.log(`[MainModule] 弹窗内容: ${truncatedText}`);
                    
                    // 将弹窗信息记录到结果中
                    clickResults.push({
                        element,
                        type: 'popup',
                        popupInfo: clickResult.popupInfo
                    });
                    
                    // 可以在这里添加自动处理弹窗的逻辑，例如点击确定按钮等
                    try {
                        console.log(`[MainModule] 尝试自动处理弹窗...`);
                        await this.pageWrapper.page.evaluate(() => {
                            // 尝试点击确定按钮 - 使用标准CSS选择器
                            const standardSelectors = [
                                'button.ok', 
                                'button.confirm', 
                                '.btn-primary', 
                                'button[type="submit"]', 
                                '.confirm-btn', 
                                '.modal-footer button',
                                '.modal button',
                                '.dialog button',
                                '.popup button',
                                'button.close',
                                'button.btn-close',
                                'button.btn-ok',
                                '.modal-footer .btn'
                            ];
                            
                            // 标准选择器查找
                            for (const selector of standardSelectors) {
                                const button = document.querySelector(selector);
                                if (button) {
                                    console.log('找到确定按钮，点击中...');
                                    button.click();
                                    return true;
                                }
                            }
                            
                            // 文本内容查找（无法使用:contains选择器，改为遍历）
                            const textMatches = ['确定', 'OK', '确认', 'Confirm', '是', 'Yes'];
                            const buttons = document.querySelectorAll('button');
                            for (const button of buttons) {
                                const buttonText = button.textContent.trim();
                                if (textMatches.some(text => buttonText.includes(text))) {
                                    console.log(`找到文本匹配的按钮: "${buttonText}"，点击中...`);
                                    button.click();
                                    return true;
                                }
                            }
                            return false;
                        });
                        console.log(`[MainModule] 自动处理弹窗完成`);
                    } catch (error) {
                        console.warn(`[MainModule] 自动处理弹窗失败: ${error.message}`);
                    }
                }
            }
            
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
            // 需要先检查clickResult是否存在，以及是否有hasPopup属性
            if (!clickResult || !clickResult.hasPopup || !clickResults.some(r => r.element === element && r.type === 'popup')) {
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

    async _handleFormElements(categories, clickResults, jumpUrls, currentHost, url, depth) {
        const LLMElementHelper = require('../llm/llm-element-helper');
        const llmHelper = new LLMElementHelper();
        console.log(`[MainModule] 准备测试 ${categories.form.length} 个表单元素`);
        let formCount = 0;
        for (const formElement of categories.form) {
            formCount++;
            console.log(`[MainModule] 处理表单 ${formCount}/${categories.form.length}`);
            const formHtml = await this.pageWrapper.getFormHtml(formElement);
            console.log(`[MainModule] 获取表单HTML成功，长度: ${formHtml.length} 字符`);
            console.log(`[MainModule] 使用LLM生成表单测试数据...`);
            
            // 尝试使用预先生成的表单数据（如果有）
            let formData = {};
            if (this.elementDetector.formTestData && Object.keys(this.elementDetector.formTestData).length > 0) {
                console.log(`[MainModule] 使用预先生成的表单数据`);
                formData = this.elementDetector.formTestData;
            } else {
                formData = await llmHelper.generateFormTestData(formHtml);
            }
            console.log(`[MainModule] 生成的表单数据:`, JSON.stringify(formData, null, 2));
            console.log(`[MainModule] 提交表单数据...`);
            
            // 在表单提交前启动请求捕获
            if (this.requestCapture) {
                const formId = `form-${formCount}`;
                console.log(`[MainModule] 启动请求捕获，表单ID: ${formId}`);
                await this.requestCapture.startCapture(`submit-${formId}`);
            }
            
            let submitResult = await this.pageWrapper.submitForm(formElement, formData);
            
            // 表单提交后停止请求捕获
            if (this.requestCapture) {
                console.log(`[MainModule] 停止请求捕获`);
                await this.requestCapture.stopCapture();
            }
            
            let retryCount = 0;
            while (!submitResult.success && retryCount < 2) {
                console.log(`[MainModule] 表单提交失败，第 ${retryCount+1} 次重试...`);
                const errorFeedback = await this.pageWrapper.getFormErrorFeedback(formElement);
                console.log(`[MainModule] 获取到表单错误反馈:`, errorFeedback);
                console.log(`[MainModule] 使用LLM修复表单数据...`);
                formData = await llmHelper.fixFormTestData(formHtml, formData, errorFeedback);
                console.log(`[MainModule] 修复后的表单数据:`, JSON.stringify(formData, null, 2));
                console.log(`[MainModule] 重新提交表单...`);
                
                // 重试提交前启动请求捕获
                if (this.requestCapture) {
                    const formId = `form-${formCount}-retry-${retryCount+1}`;
                    console.log(`[MainModule] 启动请求捕获，表单重试ID: ${formId}`);
                    await this.requestCapture.startCapture(`submit-retry-${formId}`);
                }
                
                submitResult = await this.pageWrapper.submitForm(formElement, formData);
                
                // 重试提交后停止请求捕获
                if (this.requestCapture) {
                    console.log(`[MainModule] 停止请求捕获`);
                    await this.requestCapture.stopCapture();
                }
                retryCount++;
            }
            if (submitResult.success) {
                console.log(`[MainModule] 表单提交成功!`);
            } else {
                console.log(`[MainModule] 表单提交仍然失败，达到最大重试次数`);
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
}

// 主模块，协调扫描流程
module.exports = MainModule;
