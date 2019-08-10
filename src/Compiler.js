const path = require('path');
const fs = require('fs');
// 解析
const babylon = require('babylon');
// 遍历
const traverse = require('babel-traverse').default;
// 生成
const generate = require('babel-generator').default;
const {SyncHook} = require('tapable')

class Complier {
  constructor(config) {
    this.config = config;
    this.entry = config.entry;
    this.modules = {};
    this.entryId = '';
    this.root = process.cwd(); // 运行命令的位置
    this.hooks = {
      entryOptions: new SyncHook(['compiler']),
      emitFile: new SyncHook(['compiler']),
      parser: new SyncHook(['compiler'])
    }
    config.plugins.forEach(instance => {
      // 不是改this，而是调用插件
      instance.apply(this)
    })
  }
  getSource(modulePath) {
    // {
    //   test: /\.js$/,
    //   loader: ['test-loader']
    // }
    // 文件路径
    // 如果路径匹配到对应的规则，需要执行对应的loader
    let rules = this.config.module.rules;
    for (let i = 0; i < rules.length; i++) {
      let { test: reg, use } = rules[i]
      if (reg.test(modulePath)) {
        // loader从后完前执行的
        let len = use.length - 1;
        function normalLoader () {
          let loader = use[len--];
          if(loader) {
            let l = require(loader);
            source = l(source);
            normalLoader()
          }
        }
        normalLoader()
        // let loader = require(use[0]); // 代码转换的工作
        // source = loader(source);
      }
    }
    let source = fs.readFileSync(modulePath, 'utf8');
    return source
  }
  parser(source, parentDir) {
    // 解析源代码
    const ast = babylon.parse(source);
    let dependencies = [];
    traverse(ast, {
      CallExpression(p) { // 匹配所有的调用表达式
        let node = p.node;
        if (node.callee.name === 'require') {
          node.callee.name = '__webpack_require__';
          let value = node.arguments[0].value;
          let ext = path.extname(value);
          value = ext ? value : `${value}.js`;
          value = path.join(parentDir, value);
          value = './' + value.replace(/\\/g, '/');
          node.arguments[0].value = value;
          dependencies.push(value);
        }
      }
    });
    let r = generate(ast);
    this.hooks.parser.call(this);
    return { r: r.code, dependencies }
  }
  emitFile() {
    let ejs = require('ejs');
    let templateStr = this.getSource(path.resolve(__dirname, './ejs.js'));
    let str = ejs.render(templateStr, {
      entryId: this.entryId,
      modules: this.modules
    })
    let { filename, path: p } = this.config.output;
    // 将内容写到文件中
    // 资源文件库
    this.assets = {
      [filename]: str
    }
    Object.keys(this.assets).forEach(key => {
      fs.writeFileSync(path.join(p, key), this.assets[key]);
    })
    this.hooks.emitFile.call(this);
  }
  run() {
    // 运行时候的图谱 {key: value}
    this.buildModule(path.join(this.root, this.entry), true)

    this.emitFile()
  }
  buildModule(modulePath, isMain) {
    // modulePath是一个绝对路径
    // src/index
    let relativePath = './' + path.relative(this.root, modulePath).replace(/\\/g, '/');
    // src
    let parentDir = path.dirname(relativePath);
    // 拿到文件内容
    let source = this.getSource(modulePath);
    // 需要改路径，路径都是相对于运行命令的目录计算的
    if (isMain) {
      this.entryId = relativePath
    }
    let { r, dependencies } = this.parser(source, parentDir);
    this.modules[relativePath] = r;
    dependencies.forEach(dep => {
      this.buildModule(path.join(this.root, dep), false)
    })
  }
}

module.exports = Complier

// 导出的区别
// export {}
// export default {}

// export {a as default}
// import a from 'xxx'

// export {a} from './a.js'
