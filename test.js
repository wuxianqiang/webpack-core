const path = require('path');

let str = path.join('src', './src/index');
console.log(str.replace(/\\/g, '\\\\'))
