class LoginModule {
    constructor(page, requestCapture) {
        this.page = page;
        this.requestCapture = requestCapture;
        this.hasRefreshed = false; // 标记是否已经刷新过页面
    }

    async detectLoginForm() {
        // 检测页面是否存在登录表单（简单实现，可扩展）
        const formInfo = await this.page.evaluate(() => {
            const pwdInput = document.querySelector('form input[type="password"]');
            let result = {
                hasPasswordInput: !!pwdInput,
                formStructure: null,
                buttonText: null,
                loginButtons: []
            };
            
            if (pwdInput && pwdInput.form) {
                // 获取表单结构
                const form = pwdInput.form;
                const inputs = Array.from(form.querySelectorAll('input')).map(input => ({
                    type: input.type,
                    name: input.name,
                    id: input.id,
                    placeholder: input.placeholder
                }));
                
                // 获取所有可能的登录按钮
                const buttons = Array.from(form.querySelectorAll('button, input[type="submit"], input[type="button"]'));
                result.loginButtons = buttons.map(btn => ({
                    type: btn.tagName.toLowerCase(),
                    text: btn.innerText || btn.value || btn.textContent || '',
                    id: btn.id,
                    className: btn.className
                })).filter(btn => {
                    const text = btn.text.toLowerCase();
                    return text.includes('login') || 
                           text.includes('log in') || 
                           text.includes('sign in') || 
                           text.includes('提交') || 
                           text.includes('登录');
                });
                
                // 获取默认按钮文本
                const button = form.querySelector('button[type="submit"], input[type="submit"]');
                result.buttonText = button ? (button.innerText || button.value || '') : null;
                result.formStructure = inputs;
            }
            
            return result;
        });
        
        console.log('[LoginModule] 表单分析:', JSON.stringify(formInfo, null, 2));
        return formInfo.hasPasswordInput;
    }

    async login(url, credentials) {
        console.log('[LoginModule] 跳转到登录页:', url);
        this.originalUrl = url;  // 保存原始URL以便后续比较
        await this.page.goto(url);
        const hasForm = await this.detectLoginForm();
        console.log('[LoginModule] 检测到登录表单:', hasForm);
        if (!hasForm) return true; // 无需登录
        await this.fillLoginForm(credentials);
        console.log('[LoginModule] 已填充表单');
        await this.submitLoginForm();
        console.log('[LoginModule] 已提交表单，等待验证...');
        const result = await this.verifyLogin();
        console.log('[LoginModule] 登录验证结果:', result);
        return result;
    }

    async fillLoginForm(credentials) {
        const userSelector = 'input[type="text"], input[name*="user"], input[id*="user"], input[type="email"]';
        const passSelector = 'input[type="password"]';
        const userInput = await this.page.$(userSelector);
        const passInput = await this.page.$(passSelector);
        if (userInput) {
            await userInput.click({ clickCount: 3 });
            await userInput.type(credentials.username, { delay: 30 });
            // 触发input和change事件
            await this.page.evaluate(el => {
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }, userInput);
            console.log('[LoginModule] 用户名已输入');
        } else {
            console.log('[LoginModule] 未找到用户名输入框');
        }
        if (passInput) {
            await passInput.click({ clickCount: 3 });
            await passInput.type(credentials.password, { delay: 30 });
            await this.page.evaluate(el => {
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }, passInput);
            console.log('[LoginModule] 密码已输入');
        } else {
            console.log('[LoginModule] 未找到密码输入框');
        }
    }

    async submitLoginForm() {
        // 记录登录前的URL和标题
        const beforeUrl = this.page.url();
        const beforeTitle = await this.page.title();
        console.log('[LoginModule] 登录前URL:', beforeUrl);
        console.log('[LoginModule] 登录前标题:', beforeTitle);
        
        // 监听跳转
        let redirectDetected = false;
        let navigationPromise = this.page.waitForNavigation({ timeout: 5000 })
            .catch(e => console.log('[LoginModule] 未检测到明确的页面跳转'));
        
        // 尝试多种方式找到并点击登录按钮
        try {
            // 1. 首先尝试找到标有"Login"文本的按钮
            const loginBtnSelector = [
                'form button:not([aria-label="close"]):not([type="reset"])',
                'form input[type="submit"]',
                'form .ant-btn',  // Ant Design按钮样式
                'form button.primary',
                'form button.submit',
                'form button:last-child'  // 通常表单最后一个按钮是提交按钮
            ].join(', ');
            
            const buttons = await this.page.$$(loginBtnSelector);
            console.log(`[LoginModule] 找到 ${buttons.length} 个可能的登录按钮`);
            
            let clicked = false;
            
            // 截图所有按钮，方便调试
            for (let i = 0; i < buttons.length; i++) {
                const btn = buttons[i];
                const box = await btn.boundingBox();
                if (!box) continue;
                
                // 获取按钮文本
                const text = await this.page.evaluate(el => el.innerText || el.value || '', btn);
                console.log(`[LoginModule] 按钮 ${i+1}: "${text}"`);
                
                // 优先点击明显的登录按钮
                if (!clicked && 
                    (text.toLowerCase().includes('login') || 
                     text.toLowerCase().includes('log in') ||
                     text.toLowerCase().includes('sign in'))) {
                    console.log(`[LoginModule] 点击登录按钮: "${text}"`);
                    await btn.click();
                    clicked = true;
                }
            }
            
            // 如果没有明显的登录按钮，点击最后一个按钮（通常是提交按钮）
            if (!clicked && buttons.length > 0) {
                const lastBtn = buttons[buttons.length - 1];
                console.log('[LoginModule] 点击最后一个按钮（可能是提交按钮）');
                await lastBtn.click();
                clicked = true;
            }
            
            // 如果上述方法都失败，尝试传统的表单提交
            if (!clicked) {
                const formHandle = await this.page.$('form input[type="password"]');
                if (formHandle) {
                    const form = await this.page.evaluateHandle(el => el.form, formHandle);
                    if (form) {
                        console.log('[LoginModule] 使用表单submit方法提交');
                        await form.evaluate(f => f.submit());
                        clicked = true;
                    }
                }
            }
            
            // 如果仍然失败，尝试按Enter键
            if (!clicked) {
                console.log('[LoginModule] 尝试在表单上按Enter键');
                await this.page.keyboard.press('Enter');
            }
        } catch (e) {
            console.error('[LoginModule] 提交表单时出错:', e.message);
        }
        
        // 等待页面跳转或内容变化
        try {
            await navigationPromise;
        } catch (e) {
            // 使用fallback方法检测变化
        }
        
        // 再等待1秒，确保页面渲染
        await new Promise(r => setTimeout(r, 1000));
        
        // 检查URL和标题是否已变化
        const afterUrl = this.page.url();
        const afterTitle = await this.page.title(); 
        console.log('[LoginModule] 登录后URL:', afterUrl);
        console.log('[LoginModule] 登录后标题:', afterTitle);
        
        if (afterUrl !== beforeUrl) {
            console.log('[LoginModule] ✓ 检测到URL变化，可能已登录成功');
        }
        if (afterTitle !== beforeTitle) {
            console.log('[LoginModule] ✓ 检测到页面标题变化，可能已登录成功');
        }
        
        // 登录后截图，便于调试
        await this.page.screenshot({ path: './results/login-debug.png', fullPage: true });
        console.log('[LoginModule] 已截图 ./results/login-debug.png');
    }

    async verifyLogin() {
        // 存储页面状态信息，便于决策
        let loginStateInfo = {
            hasPasswordField: false,
            hasSuccessIndicators: false,
            originalUrl: this.originalUrl,
            currentUrl: this.page.url(),
            urlChanged: false,
            titleChanged: false
        };
        
        // 检查URL是否变化（可能是登录成功的标志）
        if (this.originalUrl && this.originalUrl !== loginStateInfo.currentUrl) {
            loginStateInfo.urlChanged = true;
            console.log('[LoginModule] URL已变化:', this.originalUrl, '->', loginStateInfo.currentUrl);
        }
        
        // 登录成功判据1：页面上不再有密码输入框
        const formInfo = await this.page.evaluate(() => {
            const pwdInput = document.querySelector('form input[type="password"]');
            return {
                hasPasswordInput: !!pwdInput
            };
        });
        loginStateInfo.hasPasswordField = formInfo.hasPasswordInput;
        console.log('[LoginModule] 页面是否还有密码框:', loginStateInfo.hasPasswordField);
        
        // 如果没有密码框，考虑为登录成功
        if (!loginStateInfo.hasPasswordField) {
            console.log('[LoginModule] ✓ 页面上不再有密码框，可能已登录成功');
            return true;
        }
        
        // 登录成功判据2：检查常见登录成功标志
        const pageAnalysis = await this.page.evaluate(() => {
            const text = document.body.innerText;
            const successIndicators = /退出|个人中心|我的账户|安全退出|log\s*out|sign\s*out|profile|welcome|dashboard/i;
            return {
                title: document.title,
                url: window.location.href,
                hasLoginSuccessText: successIndicators.test(text),
                bodyTextExcerpt: text.substring(0, 200) + '...'
            };
        });
        
        loginStateInfo.hasSuccessIndicators = pageAnalysis.hasLoginSuccessText;
        console.log('[LoginModule] 页面分析:', pageAnalysis);
        
        // 综合判断登录结果
        let loginSuccess = 
            !loginStateInfo.hasPasswordField ||  // 无密码框
            loginStateInfo.hasSuccessIndicators ||  // 有成功标志
            loginStateInfo.urlChanged;  // URL已变化
            
        // 如果判断为登录失败但还未刷新页面，尝试刷新页面再检查一次
        if (!loginSuccess && !this.hasRefreshed) {
            console.log('[LoginModule] ⚠️ 登录判断结果为失败，但尝试刷新页面再检查...');
            this.hasRefreshed = true;
            await this.page.reload({ waitUntil: 'networkidle2' });
            console.log('[LoginModule] 页面已刷新，重新检查登录状态');
            
            // 截图记录刷新后状态
            await this.page.screenshot({ path: './results/login-after-refresh.png', fullPage: true });
            
            // 刷新后再次检查
            return await this.verifyLogin();
        }
        
        console.log('[LoginModule] 综合判断登录结果:', loginSuccess ? '成功' : '失败');
        return loginSuccess;
    }
}

module.exports = LoginModule;
