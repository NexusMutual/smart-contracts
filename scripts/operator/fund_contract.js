const { pool } = require('./addresses.json');
const { ethers } = require('hardhat');
const { BigNumber, Contract } = require('ethers');

const main = async () => {
  const signer = (await ethers.getSigners())[0];
  const signerAddress = await signer.getAddress();

  const minBalance = ethers.utils.parseEther('1');

  const poolBalance = await ethers.provider.getBalance(pool);
  const signerBalance = await ethers.provider.getBalance(signerAddress);

  console.log({ poolBalance, signerBalance });

  if (poolBalance.lt(minBalance)) {
    if (signerBalance.gt(minBalance)) {
      console.log('Sending eth to pool contract');
      await (await signer.sendTransaction({ to: pool, value: minBalance })).wait();
      console.log('Done');
    } else {
      console.log('not enough eth to send');
    }
  } else {
    console.log('no need to fund');
  }
};

main()
  .then(() => process.exit())
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
