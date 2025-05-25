# HTTP 请求和响应捕获摘要
生成时间: 5/25/2025, 8:06:12 PM

## 概述
- 总请求数: 80
- 独立端点数: 13

## 按上下文分类
### login-process
- 请求数量: 20
- HTTP方法分布:
  - GET: 9次
  - POST: 1次

### login-verification
- 请求数量: 12
- HTTP方法分布:
  - GET: 6次

### page-load-http%3A%2F%2F10.15.196.160%3A8888%2Fverify-vehicle
- 请求数量: 12
- HTTP方法分布:
  - GET: 6次

### click-DIV-其他可交互元素-crAPI-14
- 请求数量: 4
- HTTP方法分布:
  - GET: 2次

### click-LI-菜单项-Dashboard-17
- 请求数量: 4
- HTTP方法分布:
  - GET: 2次

### click-SPAN-菜单项-Dashboard-18
- 请求数量: 4
- HTTP方法分布:
  - GET: 2次

### click-LI-菜单项-Shop-19
- 请求数量: 6
- HTTP方法分布:
  - GET: 3次

### click-SPAN-菜单项-Shop-20
- 请求数量: 6
- HTTP方法分布:
  - GET: 3次

### click-LI-菜单项-Community-21
- 请求数量: 4
- HTTP方法分布:
  - GET: 2次

### click-SPAN-菜单项-Community-22
- 请求数量: 4
- HTTP方法分布:
  - GET: 2次

### click-SPAN-其他可交互元素-<span class="ant-ava-35
- 请求数量: 2
- HTTP方法分布:
  - GET: 1次

### click-IMG-其他可交互元素-<img src="/static/me-36
- 请求数量: 2
- HTTP方法分布:
  - GET: 1次

## 主要API端点
### 1. GET /static/media/default_profile_pic.24d66af2.png (调用7次)
- 调用上下文:
  - login-process: 1次
  - login-verification: 1次
  - page-load-http%3A%2F%2F10.15.196.160%3A8888%2Fverify-vehicle: 1次
  - click-LI-菜单项-Community-21: 1次
  - click-SPAN-菜单项-Community-22: 1次
  - click-SPAN-其他可交互元素-<span class="ant-ava-35: 1次
  - click-IMG-其他可交互元素-<img src="/static/me-36: 1次
- 常见请求头:

### 2. GET /identity/api/v2/user/dashboard (调用5次)
- 调用上下文:
  - login-process: 2次
  - click-DIV-其他可交互元素-crAPI-14: 1次
  - click-LI-菜单项-Dashboard-17: 1次
  - click-SPAN-菜单项-Dashboard-18: 1次
- 常见请求头:
  - content-type: application/json
  - authorization: Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMDQ1MjI1NjM5QHFxLmNvbSIsImlhdCI6MTc0ODE3NDY2NCwiZXhwIjoxNzQ4Nzc5NDY0LCJyb2xlIjoidXNlciJ9.p-UsZz5iM2PrVmLhBCa-KDAWXceQFAO9Sr4pg2_Wxqfj8O6IgpyWIXU2KJ2LytayQdGl7eOhVAWi37nwV-ls5vcTtfEzOqPUAfymihnuDXXD5gy-K1OsSyH1NBO42b48idFz91wuNSKuVESOLeb9vHYeHdPhyhCQVYNYkrgPX3H0IzCun_uqSHELKy5N4wbfOBZay1Xs8tHS0IxMbiHLoYEPo56lSrqd9Byz2xoFOlhH1BRHLUayJvvZS3z9-VMMv-4UxPuYkXsQs-7p_2lEElFt3MH2fuJsqwPUU0zqlacnRsZWS9GXu96kxM7EH_lgFwUiJ7_cnGiVIhilXievtw

### 3. GET /identity/api/v2/vehicle/vehicles (调用4次)
- 调用上下文:
  - login-process: 1次
  - click-DIV-其他可交互元素-crAPI-14: 1次
  - click-LI-菜单项-Dashboard-17: 1次
  - click-SPAN-菜单项-Dashboard-18: 1次
- 常见请求头:
  - content-type: application/json
  - authorization: Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMDQ1MjI1NjM5QHFxLmNvbSIsImlhdCI6MTc0ODE3NDY2NCwiZXhwIjoxNzQ4Nzc5NDY0LCJyb2xlIjoidXNlciJ9.p-UsZz5iM2PrVmLhBCa-KDAWXceQFAO9Sr4pg2_Wxqfj8O6IgpyWIXU2KJ2LytayQdGl7eOhVAWi37nwV-ls5vcTtfEzOqPUAfymihnuDXXD5gy-K1OsSyH1NBO42b48idFz91wuNSKuVESOLeb9vHYeHdPhyhCQVYNYkrgPX3H0IzCun_uqSHELKy5N4wbfOBZay1Xs8tHS0IxMbiHLoYEPo56lSrqd9Byz2xoFOlhH1BRHLUayJvvZS3z9-VMMv-4UxPuYkXsQs-7p_2lEElFt3MH2fuJsqwPUU0zqlacnRsZWS9GXu96kxM7EH_lgFwUiJ7_cnGiVIhilXievtw

### 4. GET /verify-vehicle (调用3次)
- 调用上下文:
  - login-process: 1次
  - login-verification: 1次
  - page-load-http%3A%2F%2F10.15.196.160%3A8888%2Fverify-vehicle: 1次
- 常见请求头:

### 5. GET /static/css/2.07102e08.chunk.css (调用3次)
- 调用上下文:
  - login-process: 1次
  - login-verification: 1次
  - page-load-http%3A%2F%2F10.15.196.160%3A8888%2Fverify-vehicle: 1次
- 常见请求头:

### 6. GET /static/css/main.4ac450fe.chunk.css (调用3次)
- 调用上下文:
  - login-process: 1次
  - login-verification: 1次
  - page-load-http%3A%2F%2F10.15.196.160%3A8888%2Fverify-vehicle: 1次
- 常见请求头:

### 7. GET /static/js/2.b8091b3e.chunk.js (调用3次)
- 调用上下文:
  - login-process: 1次
  - login-verification: 1次
  - page-load-http%3A%2F%2F10.15.196.160%3A8888%2Fverify-vehicle: 1次
- 常见请求头:

### 8. GET /static/js/main.8115eeff.chunk.js (调用3次)
- 调用上下文:
  - login-process: 1次
  - login-verification: 1次
  - page-load-http%3A%2F%2F10.15.196.160%3A8888%2Fverify-vehicle: 1次
- 常见请求头:

### 9. GET /workshop/api/shop/products (调用2次)
- 调用上下文:
  - click-LI-菜单项-Shop-19: 1次
  - click-SPAN-菜单项-Shop-20: 1次
- 查询参数:
  - limit
  - offset
- 常见请求头:
  - content-type: application/json
  - authorization: Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMDQ1MjI1NjM5QHFxLmNvbSIsImlhdCI6MTc0ODE3NDY2NCwiZXhwIjoxNzQ4Nzc5NDY0LCJyb2xlIjoidXNlciJ9.p-UsZz5iM2PrVmLhBCa-KDAWXceQFAO9Sr4pg2_Wxqfj8O6IgpyWIXU2KJ2LytayQdGl7eOhVAWi37nwV-ls5vcTtfEzOqPUAfymihnuDXXD5gy-K1OsSyH1NBO42b48idFz91wuNSKuVESOLeb9vHYeHdPhyhCQVYNYkrgPX3H0IzCun_uqSHELKy5N4wbfOBZay1Xs8tHS0IxMbiHLoYEPo56lSrqd9Byz2xoFOlhH1BRHLUayJvvZS3z9-VMMv-4UxPuYkXsQs-7p_2lEElFt3MH2fuJsqwPUU0zqlacnRsZWS9GXu96kxM7EH_lgFwUiJ7_cnGiVIhilXievtw

### 10. GET /images/wheel.svg (调用2次)
- 调用上下文:
  - click-LI-菜单项-Shop-19: 1次
  - click-SPAN-菜单项-Shop-20: 1次
- 常见请求头:

## 如何使用此数据
- 详细JSON数据位于 `http-requests.json` 和 `http-requests` 文件夹中
- 请求模式分析位于 `http-analysis.json` 中
- 可根据上下文筛选请求，每个上下文的请求都保存在单独的JSON文件中
