require('dotenv').config();

const { ether } = require('@openzeppelin/test-helpers');

const { init, deployerFactory, proxyDeployerFactory, transferProxyOwnershipFactory } = require('./utils');
const { ParamType, Role } = require('../test/utils/constants');
const { hex } = require('../test/utils/helpers');

const QE = '0x51042c4d8936a7764d18370a6a0762b860bb8e07';
const INITIAL_SUPPLY = ether('1500000');
const EXCHANGE_TOKEN = ether('10000');
const EXCHANGE_ETHER = ether('10');
const POOL_ETHER = ether('3500');
const POOL_DAI = ether('900000');

async function run () {

  const { account: owner, loader } = await init();
  const deploy = deployerFactory(loader);
  const deployAsProxy = proxyDeployerFactory(loader, deploy);
  const transferProxyOwnership = transferProxyOwnershipFactory(loader);

  // deploy external contracts
  const daiToken = await deploy('MockDAI');
  const daiPriceOracle = await deploy('NXMDSValueMock', owner);

  // deploy and initialize uniswap exchange
  // const factory = await deploy('FactoryMock');
  // const exchange = await deploy('ExchangeMock', daiToken.address, factory.address);
  // await factory.setFactory(daiToken.address, exchange.address);
  // await daiToken.transfer(exchange.address, EXCHANGE_TOKEN);
  // await exchange.recieveEther({ value: EXCHANGE_ETHER });

  // const uniswapExchangeAddress = factory.address;
  const uniswapExchangeAddress = '0x0000000000000000000000000000000000000000';

  const cl = await deploy('Claims');
  const cd = await deploy('ClaimsData');
  const cr = await deploy('ClaimsReward');

  const p1 = await deploy('Pool1');
  const p2 = await deploy('Pool2', uniswapExchangeAddress);
  const pd = await deploy('PoolData', owner, daiPriceOracle.address, daiToken.address);

  const mc = await deploy('MCR');

  const tk = await deploy('NXMToken', owner, INITIAL_SUPPLY);
  const tc = await deployAsProxy('TokenController');
  const td = await deploy('TokenData', owner);
  const tf = await deploy('TokenFunctions');

  const qt = await deploy('Quotation');
  const qd = await deploy('QuotationData', QE, owner);

  const gv = await deployAsProxy('Governance');
  const pc = await deployAsProxy('ProposalCategory');
  const mr = await deployAsProxy('MemberRoles');

  const ps = await deployAsProxy('PooledStaking');
  const master = await deployAsProxy('NXMaster');

  await mr.memberRolesInitiate(owner);

  const contracts = [qd, td, cd, pd, qt, tf, tc, cl, cr, p1, p2, mc, gv, pc, mr, ps];
  const addresses = contracts.map(contract => contract.address);

  await master.initiateMaster(tk.address);
  await master.addNewVersion(addresses);

  await transferProxyOwnership(tc.address, master.address);
  await transferProxyOwnership(gv.address, master.address);
  await transferProxyOwnership(pc.address, master.address);
  await transferProxyOwnership(mr.address, master.address);
  await transferProxyOwnership(master.address, gv.address);
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('An unexpected error encountered:', error);
    process.exit(1);
  });
