#!/usr/bin/env node

/**
 * 测试脚本：验证修复后的CSS选择器生成和点击功能
 */

const PageWrapper = require('./modules/page-wrapper');
const MainModule = require('./modules/main-module');

async function testCssSelectorGeneration() {
    console.log('=== CSS选择器生成测试 ===');
    
    const pageWrapper = new PageWrapper();
    
    try {
        await pageWrapper.init();
        
        // 访问一个有Ant Design组件的测试页面
        const testUrl = 'https://ant.design/components/menu-cn'; // Ant Design Menu组件页面
        
        console.log(`访问测试页面: ${testUrl}`);
        await pageWrapper.goto(testUrl);
        
        // 等待页面加载
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // 创建MainModule实例来测试_getAllCssSelectors方法
        const mainModule = new MainModule({});
        mainModule.pageWrapper = pageWrapper;
        
        console.log('开始生成CSS选择器...');
        const allSelectors = await mainModule._getAllCssSelectors(pageWrapper.page);
        
        console.log(`\n总共生成了 ${allSelectors.length} 个CSS选择器`);
        
        // 特别查看包含"menu"的选择器
        const menuSelectors = allSelectors.filter(item => 
            item.selector.includes('menu') || 
            item.selector.includes('ant-') ||
            item.selector.includes(':nth-child(')
        );
        
        console.log(`\n包含menu或ant-或nth-child的选择器数量: ${menuSelectors.length}`);
        
        // 显示前10个这样的选择器
        console.log('\n前10个相关选择器:');
        menuSelectors.slice(0, 10).forEach((item, index) => {
            console.log(`${index + 1}. ${item.selector}`);
            console.log(`   标签: ${item.tag}, 文本: "${item.text.substring(0, 30)}${item.text.length > 30 ? '...' : ''}"`);
            console.log(`   可见: ${item.isVisible}, 可交互: ${item.isInteractive}`);
            console.log('');
        });
        
        // 测试一个具体的选择器
        if (menuSelectors.length > 0) {
            const testSelector = menuSelectors[0];
            console.log(`\n测试选择器: ${testSelector.selector}`);
            
            try {
                // 验证选择器在页面中是否唯一
                const verifyResult = await pageWrapper.page.evaluate((selector) => {
                    const elements = document.querySelectorAll(selector);
                    return {
                        count: elements.length,
                        exists: elements.length > 0,
                        isUnique: elements.length === 1,
                        text: elements.length > 0 ? (elements[0].textContent || '').trim() : ''
                    };
                }, testSelector.selector);
                
                console.log('验证结果:', verifyResult);
                
                if (verifyResult.exists && verifyResult.isUnique) {
                    console.log('✅ 选择器验证成功：存在且唯一');
                } else if (verifyResult.exists) {
                    console.log('⚠️  选择器存在但不唯一');
                } else {
                    console.log('❌ 选择器不存在');
                }
            } catch (error) {
                console.error('验证选择器时出错:', error.message);
            }
        }
        
        console.log('\n=== 测试完成 ===');
        
    } catch (error) {
        console.error('测试过程中出错:', error);
    } finally {
        await pageWrapper.close();
    }
}

// 运行测试
testCssSelectorGeneration().catch(console.error);
