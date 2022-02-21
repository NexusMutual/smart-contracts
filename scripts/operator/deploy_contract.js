const { ethers } = require('hardhat');
const { BigNumber, Contract } = require('ethers');
const fs = require('fs');

const SETTLEMENT_ADDRESS = '0x9008D19f58AAbD9eD0D60971565AA8510560ab41';
const VAULT_RELAYER_ADDRESS = '0xC92E8bdf79f0507f65a392b0ab4667716BFE0110';

const WETH_ADDRESS = '0xc778417E063141139Fce010982780140Aa0cD5Ab';

const DAI_ADDRESS = '';
const DAI_DECIMALS = 18;
const DAI_MIN = 1000;
const DAI_MAX = 5000;
const DAI_SLIPPAGE = 100; // 1%

const main = async () => {
  const signer = (await ethers.getSigners())[0];
  const signerAddress = await signer.getAddress();

  const contractName = 'CowSwapOperator';
  const constructorArgs = [SETTLEMENT_ADDRESS, VAULT_RELAYER_ADDRESS];

  console.log('deploying master mock');
  const master = await (await ethers.getContractFactory('MasterMockForCowSwap')).deploy();

  console.log('deploying pool');
  const pool = await (await ethers.getContractFactory('Pool')).deploy([
    [DAI_ADDRESS],
    [DAI_DECIMALS],
    [DAI_MIN],
    [DAI_MAX],
    [DAI_SLIPPAGE],
    master.address,
    ethers.constants.AddressZero,
    ethers.constants.AddressZero,
  ]);

  console.log('setting pool on master');
  await (await master.setPool(pool.address)).wait();

  console.log('deploying twap mock');
  const twap = await (await ethers.getContractFactory('TwapMockForCowSwap')).deploy();

  console.log('adding price for weth -> dai');
  await (await twap.addPrice(WETH_ADDRESS, DAI_ADDRESS, 5000 * 10000)).wait();

  console.log('deploying swap operator');
  const swapOperator = await (await ethers.getContractFactory('CowSwapOperator')).deploy([
    SETTLEMENT_ADDRESS,
    VAULT_RELAYER_ADDRESS,
    signerAddress,
    master.address,
    WETH_ADDRESS,
    twap.address,
  ]);

  const addresses = {
    master: master.address,
    pool: pool.address,
    twap: twap.address,
    swapOperator: swapOperator.address,
  };

  console.log(`Master: ${master.address}`);
  console.log(`Pool: ${pool.address}`);
  console.log(`Twap: ${twap.address}`);
  console.log(`Operator: ${swapOperator.address}`);

  fs.writeFileSync('./scripts/operator/addresses.json', JSON.stringify(addresses, null, 2));
  console.log('wrote addresses.json');
};

main()
  .then(() => process.exit())
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
