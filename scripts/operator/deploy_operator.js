const { ethers } = require('hardhat');
const addresses = require('./addresses.json');
const { etherscanVerification } = require('./helper');
const fs = require('fs');

const SETTLEMENT_ADDRESS = '0x9008D19f58AAbD9eD0D60971565AA8510560ab41';

const WETH_ADDRESS = '0xc778417E063141139Fce010982780140Aa0cD5Ab';

const main = async () => {
  const signer = (await ethers.getSigners())[0];
  const signerAddress = await signer.getAddress();

  console.log('deploying swap operator');
  const args = [
    SETTLEMENT_ADDRESS,
    signerAddress,
    addresses.master,
    WETH_ADDRESS,
    addresses.twap,
  ];
  const swapOperator = await (await ethers.getContractFactory('CowSwapOperator')).deploy(...args);
  await swapOperator.deployTransaction.wait();
  console.log(`Operator: ${swapOperator.address}`);

  console.log('setting pool swapOperator');
  const poolContract = await ethers.getContractAt('Pool', addresses.pool);
  await (
    await poolContract.updateAddressParameters(
      ethers.utils.hexlify(ethers.utils.toUtf8Bytes('SWP_OP')) + '0000', // needs 8 bytes
      swapOperator.address,
    )
  ).wait();

  const newAddresses = {
    ...addresses,
    swapOperator: swapOperator.address,
  };

  fs.writeFileSync('./scripts/operator/addresses.json', JSON.stringify(newAddresses, null, 2));
  console.log('wrote addresses.json');

  await etherscanVerification(swapOperator.address, args);
};

main()
  .then(() => process.exit())
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
