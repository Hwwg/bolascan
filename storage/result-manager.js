const fs = require('fs');
const path = require('path');

class ResultManager {
    constructor(outputPath) {
        this.outputPath = outputPath;
        this.clickResults = {};
        this.httpRequests = {};
        this.popupResults = {}; // 新增弹窗结果存储
        if (!fs.existsSync(outputPath)) {
            fs.mkdirSync(outputPath, { recursive: true });
        }
    }

    storeClickResults(url, results) {
        // 将弹窗信息单独存储
        const popups = results.filter(item => item.type === 'popup');
        if (popups.length > 0) {
            this.popupResults[url] = this.popupResults[url] || [];
            this.popupResults[url].push(...popups);
            this._saveToFile('popup-results.json', this.popupResults);
        }
        
        // 存储其他点击结果
        this.clickResults[url] = results;
        this._saveToFile('click-results.json', this.clickResults);
    }

    storeHttpRequests(url, requests) {
        this.httpRequests[url] = requests;
        this._saveToFile('http-requests.json', this.httpRequests);
    }

    generateScanReport() {
        // 简单统计信息
        const report = {
            totalUrls: Object.keys(this.clickResults).length,
            totalClicks: Object.values(this.clickResults).reduce((sum, arr) => sum + arr.length, 0),
            totalRequests: Object.values(this.httpRequests).reduce((sum, arr) => sum + arr.length, 0),
            totalPopups: Object.values(this.popupResults).reduce((sum, arr) => sum + arr.length, 0) // 添加弹窗统计
        };
        this._saveToFile('scan-report.json', report);
    }

    exportResults(format = 'json') {
        // 仅支持json/csv两种格式
        if (format === 'csv') {
            const csv = this._toCSV();
            this._saveToFile('results.csv', csv, false);
        } else {
            this._saveToFile('results.json', {
                clickResults: this.clickResults,
                httpRequests: this.httpRequests,
                popupResults: this.popupResults // 添加弹窗结果导出
            });
        }
    }

    _saveToFile(filename, data, json = true) {
        const filePath = path.join(this.outputPath, filename);
        if (json) {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        } else {
            fs.writeFileSync(filePath, data);
        }
    }

    _toCSV() {
        // 简单实现：导出点击结果和弹窗结果
        let rows = ['url,element,action,result,hasPopup,popupInfo'];
        for (const [url, results] of Object.entries(this.clickResults)) {
            for (const r of results) {
                const hasPopup = r.type === 'popup' || (r.clickResult && r.clickResult.hasPopup);
                const popupInfo = r.popupInfo || (r.clickResult && r.clickResult.popupInfo ? JSON.stringify(r.clickResult.popupInfo) : '');
                
                rows.push(`${url},${JSON.stringify(r.element)},${r.type === 'popup' ? 'popup' : (r.clickResult ? 'click' : 'submit')},${JSON.stringify(r.clickResult || r.submitResult || '')},${hasPopup},${popupInfo}`);
            }
        }
        return rows.join('\n');
    }
}

module.exports = ResultManager;
