const { ethers } = require('hardhat');
const { BigNumber, Contract } = require('ethers');
const fs = require('fs');
const addresses = require('./addresses.json');
const { etherscanVerification } = require('./helper');
const { hex } = require('../../lib/helpers');

const WETH_ADDRESS = '0xc778417E063141139Fce010982780140Aa0cD5Ab';

const DAI_ADDRESS = '0x5592ec0cfb4dbc12d3ab100b257153436a1f0fea';
const DAI_DECIMALS = 18;
const DAI_MIN = ethers.utils.parseEther('1');
const DAI_MAX = ethers.utils.parseEther('10000000000');
const DAI_SLIPPAGE = 100; // 1%

const main = async () => {
  const signer = (await ethers.getSigners())[0];

  console.log('deploying master mock');
  const master = await (await ethers.getContractFactory('MasterMock')).deploy();
  await master.deployTransaction.wait();

  console.log('deploying qd');
  const qd = await (await ethers.getContractFactory('CSMockQuotationData')).deploy();
  await qd.deployTransaction.wait();

  console.log('deploying mcr');
  const mcr = await (await ethers.getContractFactory('MCR')).deploy(master.address);
  await mcr.deployTransaction.wait();

  console.log('deploying pool');
  const poolArgs = [
    [DAI_ADDRESS],
    [DAI_DECIMALS],
    [DAI_MIN],
    [DAI_MAX],
    [DAI_SLIPPAGE],
    master.address,
    ethers.constants.AddressZero,
    ethers.constants.AddressZero,
  ];
  const pool = await (await ethers.getContractFactory('Pool')).deploy(...poolArgs);
  await pool.deployTransaction.wait();

  // console.log('setting pool on master');
  // await (await master.setPool(pool.address)).wait();
  // Setup master, pool and mcr connections
  console.log('Setting up governance and dependencies');
  await (await master.enrollGovernance(signer.address)).wait();
  await (await master.setLatestAddress(hex('QD'), qd.address)).wait();
  await (await master.setLatestAddress(hex('MC'), mcr.address)).wait();
  await (await master.setLatestAddress(hex('P1'), pool.address)).wait();

  await (await pool.changeDependentContractAddress()).wait();
  await (await mcr.changeDependentContractAddress()).wait();

  console.log('deploying twap mock');
  const twap = await (await ethers.getContractFactory('CSMockTwapOracle')).deploy();
  await twap.deployTransaction.wait();

  console.log('adding price for weth -> dai');
  await (await twap.addPrice(WETH_ADDRESS, DAI_ADDRESS, 5000 * 10000)).wait();

  console.log(`Master: ${master.address}`);
  console.log(`Pool: ${pool.address}`);
  console.log(`Twap: ${twap.address}`);

  const newAddresses = {
    ...addresses,
    pool: pool.address,
    twap: twap.address,
    master: master.address,
  };

  fs.writeFileSync('./scripts/operator/addresses.json', JSON.stringify(newAddresses, null, 2));
  console.log('wrote addresses.json');

  await etherscanVerification(master.address, []);
  await etherscanVerification(twap.address, []);
  await etherscanVerification(pool.address, poolArgs);
};

main()
  .then(() => process.exit())
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
