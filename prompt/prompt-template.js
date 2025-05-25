const PROMPTS = {
    element_generation: {
        system: `
作为专业前端工程师，请从以下HTML代码中提取所有可点击元素的CSS选择器，用于Puppeteer等自动化测试工具。

提取指南:
• 确保包含所有类型的可点击元素，包括但不限于:
  - 按钮元素: button, input[type="button|submit|reset"]
  - 链接元素: a, area
  - 表单元素: select, option, input[type="checkbox|radio"], label
  - 下拉菜单: .dropdown, select, [role="listbox"]
  - SPA路由组件: [routerLink], .nav-link, .menu-item, .ant-menu-item, li[role="menuitem"], [data-menu-id]
  - 带有事件监听属性的元素: [onclick], [data-click]
  - ARIA角色元素: [role="button"], [role="link"], [role="tab"], [role="menuitem"]
  - 菜单导航元素: nav a, .sidebar a, .menu li, li.ant-menu-item, .ant-menu-title-content
  - 选项卡和折叠面板: .tab, .accordion, .collapse-trigger, .card-header
  - 模态框触发器: .modal-trigger, [data-toggle="modal"]
  - 交互式控件: .slider, .toggle, .checkbox, .radio
  - 自定义组件: 任何具有交互视觉指示的元素(指针样式、悬停效果等)
  - 内容卡片/面板: .card, .post, .panel, .ant-card, .article, div.ant-col > div, .card-body, .post-item, article
  - 列表项容器: .list-item, .item-container, li.list-group-item, .ant-list-item, .result-item

特别注意:
• 生成的选择器必须是有效的标准CSS3选择器
• 不要使用:has()或:contains()等伪类
• 优先使用ID、类名、属性等进行精确定位
• 对于触发页面状态变化的元素要特别关注
• 特别注意现代UI框架(如Ant Design、Element UI、Material UI等)的组件结构
  - Ant Design特别关注: .ant-card, .ant-list-item, .ant-col > div, .ant-collapse-item, .ant-tabs-tab
  - Material UI特别关注: .MuiCard, .MuiListItem, .MuiPaper
• 对于嵌套层级复杂的元素，要分析其DOM结构，找出最准确的选择器
• 内容类页面(如论坛、帖子列表、新闻列表)中的卡片或面板通常整体可点击，即使没有明显的视觉指示

输出格式:
\`\`\`json
<selector1>,<selector2>,<selector3>,
\`\`\`
示例:
\`\`\`json
button, a.nav-link, .btn, input[type="submit"], .dropdown-toggle, [role="button"], .menu-item, .card-header[data-toggle], .tab, li.ant-menu-item, li[role="menuitem"], .ant-menu-title-content, [data-menu-id],
\`\`\`
        `,
        user: `
请分析以下HTML代码并提取所有可交互元素的CSS选择器:

HTML代码:
{test_object_information}

要求:
1. 确保选择器能准确定位目标元素
2. 特别关注隐藏的交互元素和SPA导航元素
3. 提供具体而非过于通用的选择器
4. 仅输出有效的CSS选择器，不要使用非标准语法
5. 务必识别各种UI框架的导航组件，包括Ant Design的菜单项(ant-menu-item)、具有role="menuitem"属性的元素
6. 对于嵌套在复杂DOM结构中的可点击文本，如<span class="ant-menu-title-content">内的文本，应确保能够准确定位
7. 特别注意内容展示页面(如论坛、博客、新闻列表)中的卡片/面板元素，即使没有明确的交互视觉指示，也应识别为可点击元素
8. 对于使用栅格系统的布局(如.ant-col, .col, .column)中的内容容器，应考虑其可能具有的可点击性质
        `
    },
    form_fill: {
        system: `
你是Web自动化测试专家。请根据以下HTML片段，推断每个表单控件的类型、约束和上下文，并为每个控件生成合理的测试输入值。

要求：
- 识别所有input、select、textarea等表单控件，包括隐藏字段和动态生成的控件。
- 根据控件的type、name、placeholder、label、aria-label、数据校验属性、上下文文本等，推断应填写的内容类型（如邮箱、手机号、日期、金额、验证码、用户名、密码、地址、数字、URL等）。
- 对于有格式要求的控件（如日期、金额、邮箱、手机号等），请生成符合格式的测试数据。
- 对于下拉菜单、单选/多选框，请选择合理的选项。
- 对于密码、验证码等敏感字段，生成合理的测试值。
- 对于文件上传控件，生成合适的文件名（如test.jpg、test.pdf等）。
- 输出内容必须为标准JSON对象，key为唯一CSS选择器，value为填写的内容。

输出格式：
\`\`\`json
{
  "selector1": "value1",
  "selector2": "value2"
}
\`\`\`
        `,
        user: `
请为以下表单控件生成合适的测试输入值，注意遵循控件的类型、约束和上下文：

HTML代码：
{form_html}
        `
    },
    form_fill_with_submit: {
        system: `
你是Web自动化测试专家。请根据以下表单HTML片段，完成两个任务：
1. 为表单控件生成合适的测试输入值
2. 识别最合适的提交按钮或提交方式

**表单填充要求：**
- 识别所有input、select、textarea等表单控件，包括隐藏字段和动态生成的控件
- 根据控件的type、name、placeholder、label、aria-label、数据校验属性、上下文文本等，推断应填写的内容类型
- 对于有格式要求的控件（如日期、金额、邮箱、手机号等），请生成符合格式的测试数据
- 对于下拉菜单、单选/多选框，请选择合理的选项
- 对于密码、验证码等敏感字段，生成合理的测试值

**提交按钮识别要求：**
- 分析表单内及表单附近的所有可能的提交元素
- 优先级顺序：
  1. button[type="submit"] 或 input[type="submit"]
  2. 表单内的button元素（没有明确type的）
  3. 包含提交文本的按钮（如"提交"、"确定"、"保存"、"Submit"、"Save"、"Add"、"Create"等）
  4. UI框架的提交按钮（如.ant-btn-primary、.btn-primary等）
  5. 自定义样式的提交元素（通过文本内容判断）
- 分析按钮的上下文和位置，选择最可能触发表单提交的元素
- 生成精确的CSS选择器，确保能唯一定位到目标按钮

输出格式：
\`\`\`json
{
  "formData": {
    "selector1": "value1",
    "selector2": "value2"
  },
  "submitSelectors": [
    "button[type='submit']",
    ".ant-btn-primary",
    "button:contains('提交')"
  ],
  "recommendedSubmitSelector": "button[type='submit']",
  "submitStrategy": "button_click"
}
\`\`\`

其中：
- formData: 表单字段的CSS选择器和对应的填充值
- submitSelectors: 所有可能的提交按钮选择器，按优先级排序
- recommendedSubmitSelector: 推荐使用的提交按钮选择器
- submitStrategy: 提交策略 ("button_click" | "form_submit" | "enter_key")
        `,
        user: `
请分析以下表单HTML，生成表单填充数据和提交按钮选择器：

HTML代码：
{form_html}
        `
    },
    form_fill_values_only: {
        system: `
你是Web自动化测试专家。请为已识别的表单控件生成合适的测试输入值。

**重要说明：**
- 我已经为你提供了表单中所有输入字段的CSS选择器和类型信息
- 你只需要为每个字段生成合适的值，不需要生成CSS选择器
- 根据字段的类型、名称、占位符等信息推断应填写的内容

**填写规则：**
- 文本输入框：生成符合上下文的测试数据
- 邮箱字段：生成有效的邮箱地址（如test@example.com）
- 密码字段：生成安全的测试密码（如TestPass123!）
- 手机号字段：生成符合格式的手机号
- 日期字段：生成合理的日期（如2024-01-15）
- 数字字段：生成合理的数字
- 下拉菜单：选择合理的选项值
- 复选框/单选框：填写true/false或选项值
- 文本域：生成多行文本内容

**输出格式：**
只输出JSON对象，键为字段名（不是选择器），值为要填写的内容：
\`\`\`json
{
  "字段名1": "填写值1",
  "字段名2": "填写值2"
}
\`\`\`
        `,
        user: `
请为以下表单字段生成合适的测试输入值：

表单字段信息：
{form_fields_info}
        `
    },
    form_fix: {
    system: `
你是Web自动化表单测试专家。用户尝试提交表单时遇到错误，请根据表单HTML、上次填写的数据和错误反馈，推断原因并生成新的更合理的测试数据。

要求：
- 结合表单控件的所有属性（type、pattern、min、max、step、placeholder、label、aria-*等）和错误提示内容，修正不合规的输入。
- 只修正有问题的字段，其他字段保持不变。
- 输出内容为标准JSON对象，key为唯一CSS选择器，value为填写的内容。

输出格式:
\`\`\`json
{
  "selector1": "value1",
  "selector2": "value2"
}
\`\`\`
    `,
    user: `
表单HTML：
{form_html}

上次填写数据：
{last_data}

错误反馈：
{error_feedback}
    `
},
};
    
module.exports = PROMPTS;