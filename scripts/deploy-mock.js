require('dotenv').config();

const { ether } = require('@openzeppelin/test-helpers');

const { init, deployerFactory, updateOzConfig } = require('./utils');
const { ParamType, Role } = require('../test/utils/constants');
const { hex } = require('../test/utils/helpers');

async function run () {

  const { account, loader } = await init();
  const deploy = deployerFactory(loader);

  console.log('Deploying contracts');
  const master = await deploy('MasterMock');
  const staking = await deploy('PooledStaking');
  const token = await deploy('TokenMock');
  const tokenController = await deploy('TokenControllerMock');

  const mintAmount = '10000';
  console.log(`Minting ${mintAmount} NXM to ${account}`);
  await token.mint(account, ether(mintAmount));

  // set contract addresses
  console.log('Adding contracts to master');
  await master.setTokenAddress(token.address);
  await master.setLatestAddress(hex('TC'), tokenController.address);

  console.log('Enrolling addresses');
  await master.enrollInternal(staking.address);
  await master.enrollMember(account, Role.Owner);
  await master.enrollGovernance(account);

  // set master address
  console.log('Setting up contracts');
  await staking.changeMasterAddress(master.address);
  await tokenController.changeMasterAddress(master.address);
  await staking.changeDependentContractAddress();
  await tokenController.changeDependentContractAddress();

  // revert initialized values for unit tests
  console.log('Set pooled staking parameters');
  await staking.updateUintParameters(ParamType.MIN_STAKE, 20);
  await staking.updateUintParameters(ParamType.MIN_UNSTAKE, 20);
  await staking.updateUintParameters(ParamType.MAX_EXPOSURE, 2);
  await staking.updateUintParameters(ParamType.UNSTAKE_LOCK_TIME, 300); // 5 minutes

  updateOzConfig({
    MasterMock: master.address,
    PooledStaking: staking.address,
    TokenMock: token.address,
    TokenControllerMock: tokenController.address,
  });
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('An unexpected error encountered:', error);
    process.exit(1);
  });
