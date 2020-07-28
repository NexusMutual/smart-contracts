const BN = require('bn.js');
const ethABI = require('ethereumjs-abi');
const util = require('ethereumjs-util');

const bigNumberToBN = value => new BN(value.toString(), 10);

async function getQuoteValues (...args) {

  const order = {
    amount: args[0][0],
    curr: args[1],
    CP: args[2],
    smartCA: args[3],
    Price: args[0][1],
    price_nxm: args[0][2],
    expire: args[0][3],
    generationTime: args[0][4],
    quotationContract: args[4],
  };

  const orderParts = [
    { value: bigNumberToBN(order.amount), type: 'uint' },
    { value: order.curr, type: 'bytes4' },
    { value: bigNumberToBN(order.CP), type: 'uint16' },
    { value: order.smartCA, type: 'address' },
    { value: bigNumberToBN(order.Price), type: 'uint' },
    { value: bigNumberToBN(order.price_nxm), type: 'uint' },
    { value: bigNumberToBN(order.expire), type: 'uint' },
    { value: bigNumberToBN(order.generationTime), type: 'uint' },
    { value: order.quotationContract, type: 'address' },
  ];

  const types = orderParts.map(o => o.type);
  const values = orderParts.map(o => o.value);

  const message = ethABI.soliditySHA3(types, values);
  const msgHash = util.hashPersonalMessage(message);

  const privateKey = Buffer.from('45571723d6f6fa704623beb284eda724459d76cc68e82b754015d6e7af794cc8', 'hex')
  const sig = util.ecsign(msgHash, privateKey);

  return [
    sig.v,
    '0x' + util.toUnsigned(util.fromSigned(sig.r)).toString('hex'),
    '0x' + util.toUnsigned(util.fromSigned(sig.s)).toString('hex'),
  ];
}

module.exports = { getQuoteValues };
