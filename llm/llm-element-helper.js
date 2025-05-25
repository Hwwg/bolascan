// LLM元素处理相关方法模块
const LLMBridge = require('./llm-client');
const PromptSynthesizer = require('./prompt-synthesis');

class LLMElementHelper {
    constructor() {
        this.llm = new LLMBridge();
        this.promptSynthesizer = new PromptSynthesizer();
    }

    /**
     * 通过LLM分析HTML，获取可交互元素的CSS选择器
     * @param {string} htmlContent
     * @returns {Promise<Array<string>>}
     */
    async getClickableSelectors(htmlContent) {
        const messages = this.promptSynthesizer.synthesizePrompt('element_generation', {
            test_object_information: htmlContent
        });
        let selectors = [];
        let retry = 0;
        const maxRetry = 2;
        while (retry <= maxRetry) {
            try {
                const reply = await this.llm.query(messages);
                const match = reply.match(/```json([\s\S]*?)```/);
                let selectorStr = match ? match[1] : reply;
                selectorStr = selectorStr.replace(/[`\n\r\s]+/g, '');
                selectors = selectorStr.split(',').filter(Boolean);
                if (selectors.length > 0 && selectors.every(sel => sel.length > 1 && !sel.includes(' '))) {
                    break;
                } else {
                    throw new Error('LLM返回格式不正确，重试...');
                }
            } catch (e) {
                retry++;
                if (retry > maxRetry) {
                    console.error('LLM元素检测失败，已重试多次:', e);
                    selectors = [];
                    break;
                }
                console.warn(`LLM返回格式异常，正在第${retry}次重试...`);
            }
        }
        return selectors;
    }

    /**
     * 通过LLM分析表单HTML，生成表单测试数据
     * @param {string} formHtml
     * @returns {Promise<Object>} 形如 {selector: value, ...}
     */
    async generateFormTestData(formHtml) {
        const messages = this.promptSynthesizer.synthesizePrompt('form_fill', {
            form_html: formHtml
        });
        let testData = {};
        let retry = 0;
        const maxRetry = 2;
        while (retry <= maxRetry) {
            try {
                const reply = await this.llm.query(messages);
                const match = reply.match(/```json([\s\S]*?)```/);
                let jsonStr = match ? match[1] : reply;
                testData = JSON.parse(jsonStr);
                if (testData && typeof testData === 'object') {
                    break;
                } else {
                    throw new Error('LLM表单数据返回格式不正确，重试...');
                }
            } catch (e) {
                retry++;
                if (retry > maxRetry) {
                    console.error('LLM表单数据生成失败，已重试多次:', e);
                    testData = {};
                    break;
                }
                console.warn(`LLM表单数据返回格式异常，正在第${retry}次重试...`);
            }
        }
        return testData;
    }

    /**
 * 根据表单HTML、上次填写数据和错误反馈，调用LLM修正表单数据
 * @param {string} formHtml
 * @param {Object} lastData
 * @param {string} errorFeedback
 * @returns {Promise<Object>} 修正后的表单数据
 */
async fixFormTestData(formHtml, lastData, errorFeedback) {
    const messages = this.promptSynthesizer.synthesizePrompt('form_fix', {
        form_html: formHtml,
        last_data: JSON.stringify(lastData, null, 2),
        error_feedback: errorFeedback
    });
    let testData = {};
    let retry = 0;
    const maxRetry = 2;
    while (retry <= maxRetry) {
        try {
            const reply = await this.llm.query(messages);
            const match = reply.match(/```json([\s\S]*?)```/);
            let jsonStr = match ? match[1] : reply;
            testData = JSON.parse(jsonStr);
            if (testData && typeof testData === 'object') {
                break;
            } else {
                throw new Error('LLM表单修正数据返回格式不正确，重试...');
            }
        } catch (e) {
            retry++;
            if (retry > maxRetry) {
                console.error('LLM表单修正数据生成失败，已重试多次:', e);
                testData = {};
                break;
            }
            console.warn(`LLM表单修正数据返回格式异常，正在第${retry}次重试...`);
        }
    }
    return testData;
}

    /**
     * 使用表单结构信息生成仅包含值的表单数据（不生成选择器）
     * @param {Object} formStructure - 表单结构信息
     * @returns {Promise<Object>} 形如 {fieldName: value, ...}
     */
    async generateFormValuesOnly(formStructure) {
        // 构建字段信息描述
        const fieldsInfo = formStructure.inputs.map(input => {
            const attributes = input.attributes || {};
            const name = attributes.name || attributes.id || input.selector.split(/[#\.\[\]:]/).pop();
            
            return {
                fieldName: name,
                type: input.type,
                selector: input.selector,
                placeholder: attributes.placeholder || '',
                required: attributes.required || false,
                htmlPreview: (input.html.outerHTML || '').substring(0, 200)
            };
        });
        
        const messages = this.promptSynthesizer.synthesizePrompt('form_fill_values_only', {
            form_fields_info: JSON.stringify(fieldsInfo, null, 2)
        });
        
        let result = {};
        let retry = 0;
        const maxRetry = 2;
        
        while (retry <= maxRetry) {
            try {
                const reply = await this.llm.query(messages);
                console.log(`[LLMElementHelper] LLM表单值生成回复:`, reply.substring(0, 300) + '...');
                
                const match = reply.match(/```json([\s\S]*?)```/);
                let jsonStr = match ? match[1] : reply;
                const parsedResult = JSON.parse(jsonStr);
                
                if (parsedResult && typeof parsedResult === 'object') {
                    result = parsedResult;
                    console.log(`[LLMElementHelper] 表单值生成成功，找到 ${Object.keys(result).length} 个字段值`);
                    break;
                } else {
                    throw new Error('LLM表单值生成返回格式不正确，重试...');
                }
            } catch (e) {
                retry++;
                if (retry > maxRetry) {
                    console.error('LLM表单值生成失败，已重试多次:', e);
                    result = {};
                    break;
                }
                console.warn(`LLM表单值生成返回格式异常，正在第${retry}次重试...`);
            }
        }
        
        return result;
    }

    /**
     * 将字段名映射到CSS选择器创建最终的表单数据
     * @param {Object} fieldValues - 字段名到值的映射 {fieldName: value}
     * @param {Object} formStructure - 表单结构信息
     * @returns {Object} 形如 {selector: value, ...}
     */
    mapFieldValuesToSelectors(fieldValues, formStructure) {
        const mappedData = {};
        
        formStructure.inputs.forEach(input => {
            const attributes = input.attributes || {};
            const name = attributes.name || attributes.id || input.selector.split(/[#\.\[\]:]/).pop();
            
            // 尝试多种匹配策略
            let value = null;
            
            // 1. 精确匹配字段名
            if (fieldValues[name]) {
                value = fieldValues[name];
            }
            
            // 2. 忽略大小写匹配
            if (!value) {
                const lowerName = name.toLowerCase();
                for (const [fieldName, fieldValue] of Object.entries(fieldValues)) {
                    if (fieldName.toLowerCase() === lowerName) {
                        value = fieldValue;
                        break;
                    }
                }
            }
            
            // 3. 模糊匹配（包含关系）
            if (!value) {
                const lowerName = name.toLowerCase();
                for (const [fieldName, fieldValue] of Object.entries(fieldValues)) {
                    const lowerFieldName = fieldName.toLowerCase();
                    if (lowerName.includes(lowerFieldName) || lowerFieldName.includes(lowerName)) {
                        value = fieldValue;
                        break;
                    }
                }
            }
            
            // 4. 基于类型的通用匹配
            if (!value) {
                if (input.type === 'email' && fieldValues['email']) {
                    value = fieldValues['email'];
                } else if (input.type === 'password' && fieldValues['password']) {
                    value = fieldValues['password'];
                } else if (input.type === 'text' && fieldValues['username']) {
                    value = fieldValues['username'];
                }
            }
            
            if (value) {
                mappedData[input.selector] = value;
                console.log(`[LLMElementHelper] 映射字段: ${name} -> ${input.selector} = ${value}`);
            } else {
                console.warn(`[LLMElementHelper] 未找到字段 ${name} 的值`);
            }
        });
        
        return mappedData;
    }    /**
     * 使用改进的方法：基于表单结构生成表单数据和提交选择器
     * @param {Object} formStructure - 表单结构信息
     * @returns {Promise<Object>} 形如 {formData: {selector: value}, submitSelectors: [], recommendedSubmitSelector: '', submitStrategy: ''}
     */
    async generateFormDataFromStructure(formStructure) {
        console.log(`[LLMElementHelper] 使用改进的表单数据生成方法...`);
        
        const result = {
            formData: {},
            submitSelectors: [],
            recommendedSubmitSelector: '',
            submitStrategy: 'button_click'
        };
        
        try {
            // 1. 生成表单字段值（只生成值，不生成选择器）
            const fieldValues = await this.generateFormValuesOnly(formStructure);
            
            // 2. 将字段值映射到CSS选择器
            result.formData = this.mapFieldValuesToSelectors(fieldValues, formStructure);
            
            // 3. 从表单结构中提取提交按钮选择器
            const submitButtons = formStructure.buttons.filter(button => {
                const html = button.html.outerHTML || '';
                const text = (button.text || '').toLowerCase();
                
                // 检查是否是提交按钮
                return html.includes('type="submit"') || 
                       text.includes('提交') || 
                       text.includes('submit') || 
                       text.includes('确定') || 
                       text.includes('保存') || 
                       text.includes('登录') || 
                       text.includes('save') || 
                       text.includes('confirm');
            });
            
            // 按优先级排序提交按钮
            const prioritizedButtons = submitButtons.sort((a, b) => {
                const aHtml = a.html.outerHTML || '';
                const bHtml = b.html.outerHTML || '';
                
                // type="submit" 最高优先级
                if (aHtml.includes('type="submit"') && !bHtml.includes('type="submit"')) return -1;
                if (!aHtml.includes('type="submit"') && bHtml.includes('type="submit"')) return 1;
                
                // UI框架样式按钮次优先级
                const aIsPrimary = aHtml.includes('primary') || aHtml.includes('btn-primary');
                const bIsPrimary = bHtml.includes('primary') || bHtml.includes('btn-primary');
                if (aIsPrimary && !bIsPrimary) return -1;
                if (!aIsPrimary && bIsPrimary) return 1;
                
                return 0;
            });
            
            result.submitSelectors = prioritizedButtons.map(btn => btn.selector);
            result.recommendedSubmitSelector = prioritizedButtons.length > 0 ? prioritizedButtons[0].selector : '';
            
            // 如果没有找到提交按钮，添加通用的提交选择器
            if (result.submitSelectors.length === 0) {
                result.submitSelectors = [
                    'button[type="submit"]',
                    'input[type="submit"]',
                    'form button:not([type="button"]):not([type="reset"])',
                    '.btn-primary',
                    '.ant-btn-primary'
                ];
                result.recommendedSubmitSelector = 'button[type="submit"]';
                result.submitStrategy = 'form_submit'; // 降级到表单提交
            }
            
            console.log(`[LLMElementHelper] 改进方法生成成功：${Object.keys(result.formData).length} 个字段，${result.submitSelectors.length} 个提交选择器`);
            
        } catch (error) {
            console.error(`[LLMElementHelper] 改进方法生成失败:`, error);
            // 降级到原有方法
            console.log(`[LLMElementHelper] 降级到原有方法...`);
            const formHtml = formStructure.formElement.html && formStructure.formElement.html.outerHTML 
                ? formStructure.formElement.html.outerHTML 
                : '<form>表单HTML不可用</form>';
            return await this.generateFormTestDataWithSubmit(formHtml);
        }
        
        return result;
    }

    /**
     * 通过LLM分析表单HTML，生成表单测试数据和提交按钮选择器
     * @param {string} formHtml
     * @returns {Promise<Object>} 形如 {formData: {selector: value}, submitSelectors: [], recommendedSubmitSelector: '', submitStrategy: ''}
     */
    async generateFormTestDataWithSubmit(formHtml) {
        const messages = this.promptSynthesizer.synthesizePrompt('form_fill_with_submit', {
            form_html: formHtml
        });
        let result = {
            formData: {},
            submitSelectors: [],
            recommendedSubmitSelector: '',
            submitStrategy: 'button_click'
        };
        let retry = 0;
        const maxRetry = 2;
        
        while (retry <= maxRetry) {
            try {
                const reply = await this.llm.query(messages);
                console.log(`[LLMElementHelper] LLM表单分析回复:`, reply.substring(0, 500) + '...');
                
                const match = reply.match(/```json([\s\S]*?)```/);
                let jsonStr = match ? match[1] : reply;
                const parsedResult = JSON.parse(jsonStr);
                
                if (parsedResult && typeof parsedResult === 'object') {
                    // 验证返回结果的结构
                    if (parsedResult.formData && typeof parsedResult.formData === 'object') {
                        result.formData = parsedResult.formData;
                    }
                    if (Array.isArray(parsedResult.submitSelectors)) {
                        result.submitSelectors = parsedResult.submitSelectors;
                    }
                    if (parsedResult.recommendedSubmitSelector) {
                        result.recommendedSubmitSelector = parsedResult.recommendedSubmitSelector;
                    }
                    if (parsedResult.submitStrategy) {
                        result.submitStrategy = parsedResult.submitStrategy;
                    }
                    console.log(`[LLMElementHelper] 表单分析成功，找到 ${Object.keys(result.formData).length} 个字段和 ${result.submitSelectors.length} 个提交选择器`);
                    break;
                } else {
                    throw new Error('LLM表单分析返回格式不正确，重试...');
                }
            } catch (e) {
                retry++;
                if (retry > maxRetry) {
                    console.error('LLM表单分析失败，已重试多次:', e);
                    // 降级为原有的方法
                    console.log(`[LLMElementHelper] 降级使用原有的表单数据生成方法...`);
                    result.formData = await this.generateFormTestData(formHtml);
                    break;
                }
                console.warn(`LLM表单分析返回格式异常，正在第${retry}次重试...`);
            }
        }
        return result;
    }

    // 可继续扩展：如文件上传、日期控件等
}

module.exports = LLMElementHelper;
