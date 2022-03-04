const { ethers } = require('hardhat');
const { swapOperator: swapOperatorAddress } = require('./addresses');

const fs = require('fs');

const main = async () => {

  const swapOperatorContract = await ethers.getContractAt('CowSwapOperator', swapOperatorAddress);

  const contractOrder = JSON.parse(fs.readFileSync('./contractOrder.json'));

  console.log('Closing order', JSON.stringify(contractOrder, null, 2));
  const closeTx = await swapOperatorContract.closeOrder(contractOrder);
  console.log('Close order tx', closeTx.hash);
  await closeTx.wait();
  console.log('Done');
};

main()
  .then(() => process.exit())
  .catch(e => {
    if (e.isAxiosError) {
      console.error(`HTTP Error: Status ${e.response.status}. ${JSON.stringify(e.response.data, null, 2)}`);
    } else {
      console.error(e);
    }
    process.exit(1);
  });
