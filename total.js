const cnData = require('./cn-locked-amount.json');
const claData = require('./cla-locked-amount.json');
const rewards = require('./v1-pooled-staking-rewards.json');
const stakes = require('./v1-pooled-staking-stake.json');

function logTotalInEth(name, transactions) {
  const totalWei = transactions.reduce((sum, txn) => sum + BigInt(txn.amount), BigInt(0));
  const totalEth = Number(totalWei) / 10 ** 18;
  console.log(`${name} Total amount in ETH: ${totalEth}`);
}

logTotalInEth('CN', cnData);
logTotalInEth('CLA', claData);
logTotalInEth('REWARDS', rewards);
logTotalInEth('STAKE', stakes);
