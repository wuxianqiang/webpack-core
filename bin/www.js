#! /usr/bin/env node
const path = require('path');
// 配置文件的路径

let configPath = path.resolve('webpack.config.js');
let config = require(configPath);

let Compiler = require('../src/Compiler');
let compiler = new Compiler(config);
// 开始打包
compiler.run()
