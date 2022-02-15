const { ethers } = require('hardhat');
const { BigNumber, Contract } = require('ethers');
const fs = require('fs');

const SETTLEMENT_ADDRESS = '0x9008D19f58AAbD9eD0D60971565AA8510560ab41';
const VAULT_RELAYER_ADDRESS = '0xC92E8bdf79f0507f65a392b0ab4667716BFE0110';

const main = async () => {
  const signer = (await ethers.getSigners())[0];
  const contractName = 'CowSwapOperator';
  const constructorArgs = [SETTLEMENT_ADDRESS, VAULT_RELAYER_ADDRESS];

  console.log(`Deploying ${contractName} with args ${constructorArgs}`);

  const contract = await (await ethers.getContractFactory(contractName)).deploy(...constructorArgs);

  console.log(`Deployed at address ${contract.address}`);

  fs.writeFileSync('./scripts/operator/operatorAddress.js', `module.exports = '${contract.address}';`);
};

main()
  .then(() => process.exit())
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
