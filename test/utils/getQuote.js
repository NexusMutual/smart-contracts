var _ = require('lodash');
var BN = require('bn.js');
var ethABI = require('ethereumjs-abi');
var util = require('ethereumjs-util');
const wallet = require('eth-lightwallet').keystore;
var lightwallet = require('eth-lightwallet');
var _password = 'Venkatesh';
var _seedPhrase =
  'mandate arrest tent matrix egg attract dentist chapter minimum finish unveil useless'; //seedPhrase for metamask
var _hdPathString = "m/44'/60'/0'/0";

async function getQuoteValues(args, callback) {
  var order = {
    amount: args[0],
    curr: args[1],
    CP: args[2],
    smartCA: args[3],
    Price: args[4],
    price_nxm: args[5],
    expire: args[6],
    generationTime: args[7],
    quotationContract: args[8]
  };
  var orderParts = [
    { value: bigNumberToBN(order.amount), type: 'uint' },
    { value: order.curr, type: 'bytes4' },
    { value: bigNumberToBN(order.CP), type: 'uint16' },
    { value: order.smartCA, type: 'address' },
    { value: bigNumberToBN(order.Price), type: 'uint' },
    { value: bigNumberToBN(order.price_nxm), type: 'uint' },
    { value: bigNumberToBN(order.expire), type: 'uint' },
    { value: bigNumberToBN(order.generationTime), type: 'uint' },
    { value: order.quotationContract, type: 'address' }
  ];

  var types = _.map(orderParts, function(o) {
    return o.type;
  });
  var values = _.map(orderParts, function(o) {
    return o.value;
  });
  var hashBuff = ethABI.soliditySHA3(types, values);
  var hashHex = util.bufferToHex(hashBuff);

  console.log('===)))))', wallet);
  await wallet.createVault(
    {
      password: _password,
      seedPhrase: _seedPhrase, // Optionally provide a 12-word seed phrase
      hdPathString: _hdPathString // Optional custom HD Path String
    },
    function(err, ks) {
      if (!err) {
        console.log('hmmmm');
        // Some methods will require providing the `pwDerivedKey`,
        // Allowing you to only decrypt private keys on an as-needed basis.
        // You can generate that value with this convenient method:
        ks.keyFromPassword(_password, function(err, pwDerivedKey) {
          if (err) throw err;

          // generate five new address/private key pairs
          // the corresponding private keys are also encrypted
          ks.generateNewAddress(pwDerivedKey, 1);
          console.log(
            'privatekey---->',
            ks,
            ' =======',
            pwDerivedKey.toString()
          );
          var addr = ks.getAddresses();
          console.log(addr);
          ks.passwordProvider = function(callback) {
            var pw = prompt('Please enter password', 'Password');
            callback(null, pw);
          };

          const orderHashBuff = util.toBuffer(hashHex);
          const msgHashBuff = util.hashPersonalMessage(orderHashBuff);
          const sig = lightwallet.signing.signMsgHash(
            ks,
            pwDerivedKey,
            msgHashBuff,
            ks.addresses[0]
          );

          console.log(
            sig.v,
            ' ',
            util.toUnsigned(util.fromSigned(sig.r)).toString('hex'),
            '  ',
            util.toUnsigned(util.fromSigned(sig.s)).toString('hex')
          );
          callback(null, sig);
          return sig;
        });
      } else {
        callback(err, null);
      }
    }
  );
}

function bigNumberToBN(value) {
  return new BN(value.toString(), 10);
}

module.exports = { getQuoteValues };
