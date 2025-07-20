const selfsigned = require('selfsigned');
const fs = require('fs');

const attrs = [{ name: 'commonName', value: 'localhost' }];
const pems = selfsigned.generate(attrs, { days: 365 });

fs.writeFileSync('server.key', pems.private);
fs.writeFileSync('server.cert', pems.cert);

console.log('已成功產生 server.key 和 server.cert 檔案！');
console.log('這些檔案可以用於本地 HTTPS 開發。'); 