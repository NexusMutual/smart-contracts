const swapOperatorAddress = require('./operatorAddress');
const { ethers } = require('hardhat');

const main = async orderUID => {
  const swapOperatorContractName = 'CowSwapOperator';
  const swapOperatorContract = await ethers.getContractAt(swapOperatorContractName, swapOperatorAddress);

  console.log('Sending placeOrder tx');
  const presignTX = await swapOperatorContract.setPreSignature(orderUID, true);
  console.log(`Presign tx hash ${presignTX.hash}`);
  await presignTX.wait();
  console.log('Done');
};

const orderUID = process.env.ORDER_UID;

if (!orderUID) {
  console.log('Pass order ORDER_UID as env var');
  process.exit(0);
}

main(orderUID)
  .then(() => process.exit())
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
