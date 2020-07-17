const advanceBlock = async () => new Promise((resolve, reject) => {
  web3.currentProvider.send(
    { jsonrpc: '2.0', method: 'evm_mine', id: Date.now() },
    (err, res) => err ? reject(err) : resolve(res),
  )
});

const advanceToBlock = async number => {

  let currentBlock = await web3.eth.getBlock();

  if (currentBlock > number) {
    throw new Error(`Block number ${number} is in the past (current is ${currentBlock})`);
  }

  while (currentBlock < number) {
    await advanceBlock();
    currentBlock = await web3.eth.getBlock();
  }
};

module.exports = {
  advanceBlock,
  advanceToBlock,
};
