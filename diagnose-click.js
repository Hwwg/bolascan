const puppeteer = require('puppeteer');
const ElementDetector = require('./modules/element-detector');
const PageWrapper = require('./modules/page-wrapper');
const SPANavigator = require('./modules/spa-navigator');

/**
 * 专门诊断元素点击问题
 */
async function diagnoseClickIssue() {
    let browser = null;
    
    try {
        console.log('🔍 启动元素点击问题诊断...');
        browser = await puppeteer.launch({ 
            headless: false,
            devtools: false,
            args: ['--no-sandbox']
        });
        
        const page = await browser.newPage();
        
        await page.setContent(`
            <!DOCTYPE html>
            <html>
            <body>
                <h1>元素点击诊断</h1>
                <button id="test-btn" class="btn">测试按钮</button>
                <a href="#" id="test-link">测试链接</a>
                <div id="result">等待点击...</div>
                
                <script>
                    document.getElementById('test-btn').addEventListener('click', () => {
                        document.getElementById('result').textContent = '按钮被点击了！';
                    });
                    
                    document.getElementById('test-link').addEventListener('click', (e) => {
                        e.preventDefault();
                        document.getElementById('result').textContent = '链接被点击了！';
                    });
                </script>
            </body>
            </html>
        `);
        
        console.log('📄 页面设置完成');
        
        // 初始化我们的模块
        const pageWrapper = new PageWrapper(page);
        await pageWrapper.init();
        
        const elementDetector = new ElementDetector();
        const spaNavigator = new SPANavigator(page);
        
        // 使用ElementDetector检测元素
        console.log('\n🔍 使用ElementDetector检测元素...');
        const detectedElements = await elementDetector.detectStaticElements(pageWrapper);
        
        console.log(`检测到 ${detectedElements.length} 个元素:`);
        detectedElements.forEach((el, index) => {
            console.log(`  ${index + 1}. ${el.tag} - "${el.text}" - ${el.selector}`);
        });
        
        // 测试每个检测到的元素
        for (let i = 0; i < detectedElements.length && i < 2; i++) {
            const element = detectedElements[i];
            console.log(`\n🖱️ 测试点击元素 ${i + 1}: ${element.tag}`);
            console.log(`   选择器: ${element.selector}`);
            console.log(`   文本: "${element.text}"`);
            
            try {
                console.log('   调用 SPANavigator.smartClick...');
                const result = await spaNavigator.smartClick(element);
                console.log('   ✅ 点击结果:', result);
                
                // 检查页面状态
                await new Promise(resolve => setTimeout(resolve, 500));
                const resultText = await page.$eval('#result', el => el.textContent);
                console.log(`   📄 页面反应: "${resultText}"`);
                
            } catch (error) {
                console.log(`   ❌ 点击失败: ${error.message}`);
                console.log(`   错误堆栈:`, error.stack);
            }
        }
        
        console.log('\n🎯 诊断完成！');
        
    } catch (error) {
        console.error('❌ 诊断失败:', error);
        console.error('错误堆栈:', error.stack);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

if (require.main === module) {
    diagnoseClickIssue().catch(console.error);
}

module.exports = diagnoseClickIssue;
