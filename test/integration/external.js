// Developer solves bitcorelib issue with this one weird trick!
// Source: https://github.com/bitpay/bitcore/issues/1457#issuecomment-467594031
Object.defineProperty(global, '_bitcore', { get(){ return undefined }, set(){} }); // eslint-disable-line

const getValue = require('../../nexusmutual-contracts/test/utils/getMCRPerThreshold.js').getValue;
const getQuoteValues = require('../../nexusmutual-contracts/test/utils/getQuote.js').getQuoteValues;

module.exports = {
  getValue,
  getQuoteValues,
};
