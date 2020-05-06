const { ether } = require('@openzeppelin/test-helpers');

const toWei = value => ether(value.toString()).toString();
const toHex = string => '0x' + Buffer.from(string).toString('hex');

module.exports = {
  ether,
  toWei,
  toHex,
};
