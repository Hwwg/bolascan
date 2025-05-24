#!/usr/bin/env node

const path = require('path');
const MainModule = require('./modules/main-module');

function parseArguments() {
    const argv = process.argv.slice(2);
    const args = {
        url: '',
        depth: 2,
        output: './results',
        credentials: null,
        format: 'json'
    };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--url' && argv[i + 1]) args.url = argv[++i];
        else if (argv[i] === '--depth' && argv[i + 1]) args.depth = parseInt(argv[++i], 10);
        else if (argv[i] === '--output' && argv[i + 1]) args.output = argv[++i];
        else if (argv[i] === '--username' && argv[i + 1]) {
            if (!args.credentials) args.credentials = {};
            args.credentials.username = argv[++i];
        }
        else if (argv[i] === '--password' && argv[i + 1]) {
            if (!args.credentials) args.credentials = {};
            args.credentials.password = argv[++i];
        }
        else if (argv[i] === '--format' && argv[i + 1]) {
            args.format = argv[++i];
        }
    }
    if (!args.url) {
        console.error('Usage: node index.js --url <target_url> [--depth <max_depth>] [--output <output_path>] [--username <username>] [--password <password>] [--format <json|csv>]');
        process.exit(1);
    }
    return args;
}

function initialize(args) {
    // 可扩展：初始化日志、配置、依赖注入等
    return {
        mainModule: new MainModule({
            startUrl: args.url,
            maxDepth: args.depth,
            outputPath: path.resolve(args.output),
            credentials: args.credentials
        }),
        args
    };
}

async function startScan(mainModule, args) {
    try {
        // 注册进程结束前的保存操作
        process.on('SIGINT', async () => {
            console.log('\n[System] 检测到用户中断，正在保存捕获的请求数据...');
            if (mainModule.requestCapture) {
                await mainModule.requestCapture.saveResults(args.output);
                console.log('[System] 已保存请求数据到', args.output);
            }
            process.exit(0);
        });
        
        // 注册未处理的异常处理器
        process.on('uncaughtException', async (err) => {
            console.error('[System] 未捕获的异常:', err);
            console.log('[System] 正在尝试保存已捕获的请求数据...');
            if (mainModule.requestCapture) {
                await mainModule.requestCapture.saveResults(args.output);
                console.log('[System] 已保存请求数据到', args.output);
            }
            process.exit(1);
        });
        
        await mainModule.scan(mainModule.options.startUrl, mainModule.options.maxDepth);
        mainModule.resultManager.exportResults && mainModule.resultManager.exportResults(args.format);
        console.log('扫描完成！');
    } catch (err) {
        console.error('扫描过程中发生错误:', err);
        // 发生错误时也尝试保存已捕获的请求
        if (mainModule.requestCapture) {
            console.log('[System] 正在保存捕获的请求数据...');
            await mainModule.requestCapture.saveResults(args.output);
            console.log('[System] 已保存请求数据到', args.output);
        }
    }
}

(async () => {
    const { mainModule, args } = initialize(parseArguments());
    await startScan(mainModule, args);
})();