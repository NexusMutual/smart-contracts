require('dotenv').config();

const { ether } = require('@openzeppelin/test-helpers');
const Web3 = require('web3');
const Verifier = require('../lib/verifier');
const { getenv, init } = require('../lib/env');
const { hex } = require('../lib/helpers');

const INITIAL_SUPPLY = ether('1500000');
const etherscanApiKey = getenv('ETHERSCAN_API_KEY');

const contractType = code => {

  const upgradable = ['CL', 'CR', 'MC', 'P1', 'P2', 'QT', 'TF'];
  const proxies = ['GV', 'MR', 'PC', 'PS', 'TC'];

  if (upgradable.includes(code)) {
    return 2;
  }

  if (proxies.includes(code)) {
    return 1;
  }

  return 0;
};

async function run () {

  const { account: owner, loader, network, provider } = await init();
  const web3 = new Web3(provider);
  const verifier = new Verifier(web3, etherscanApiKey, network.toLowerCase());

  const deployProxy = async contract => {
    const implementation = await loader.fromArtifact(contract).new();
    const proxy = await loader.fromArtifact('OwnedUpgradeabilityProxy').new(implementation.address);
    const instance = await loader.fromArtifact(contract).at(proxy.address);
    return { implementation, instance, proxy };
  };

  const upgradeProxy = async (proxyAddress, contractName) => {
    const implementation = await loader.fromArtifact(contractName).new();
    const proxy = await loader.fromArtifact('OwnedUpgradeabilityProxy').at(proxyAddress);
    await proxy.upgradeTo(implementation.address);
    return { implementation, proxy };
  };

  const transferProxyOwnership = async (proxyAddress, newOwner) => {
    const proxy = await loader.fromArtifact('OwnedUpgradeabilityProxy').at(proxyAddress);
    await proxy.transferProxyOwnership(newOwner);
  };

  // deploy external contracts
  console.log('Deploying DAI mocks');
  const daiToken = await loader.fromArtifact('ERC20Mock').new();
  const daiPriceOracle = await loader.fromArtifact('NXMDSValueMock').new(owner);
  const uniswapExchangeAddress = '0x0000000000000000000000000000000000000000';

  verifier.add('ERC20Mock', daiToken.address);
  verifier.add('NXMDSValueMock', daiPriceOracle.address, ['address'], [owner]);

  console.log('Deploying claims contracts');
  const cl = await loader.fromArtifact('Claims').new();
  const cd = await loader.fromArtifact('ClaimsData').new();
  const cr = await loader.fromArtifact('ClaimsReward').new();

  verifier.add('Claims', cl.address);
  verifier.add('ClaimsData', cd.address);
  verifier.add('ClaimsReward', cr.address);

  console.log('Deploying capital contracts');
  const mc = await loader.fromArtifact('MCR').new();
  const p1 = await loader.fromArtifact('Pool1').new();
  const p2 = await loader.fromArtifact('Pool2').new(uniswapExchangeAddress);
  const pd = await loader.fromArtifact('PoolData').new(owner, daiPriceOracle.address, daiToken.address);

  verifier.add('MCR', mc.address);
  verifier.add('Pool1', p1.address);
  verifier.add('Pool2', p2.address, ['address'], [uniswapExchangeAddress]);
  verifier.add('PoolData', pd.address, ['address', 'address', 'address'], [owner, daiPriceOracle.address, daiToken.address]);

  console.log('Deploying token contracts');
  const tk = await loader.fromArtifact('NXMToken').new(owner, INITIAL_SUPPLY);
  const td = await loader.fromArtifact('TokenData').new(owner);
  const tf = await loader.fromArtifact('TokenFunctions').new();

  verifier.add('NXMToken', tk.address, ['address', 'uint256'], [owner, INITIAL_SUPPLY]);
  verifier.add('TokenData', td.address, ['address'], [owner]);
  verifier.add('TokenFunctions', tf.address);

  console.log('Deploying quotation contracts');
  const qt = await loader.fromArtifact('Quotation').new();
  const qd = await loader.fromArtifact('QuotationData').new(owner, owner);

  verifier.add('Quotation', qt.address);
  verifier.add('QuotationData', qd.address, ['address', 'address'], [owner, owner]);

  // proxy contracts
  console.log('Deploying proxy contracts');
  const { instance: master, implementation: masterImpl } = await deployProxy('DisposableNXMaster');
  const { instance: mr, implementation: mrImpl } = await deployProxy('DisposableMemberRoles');
  const { instance: tc, implementation: tcImpl } = await deployProxy('DisposableTokenController');
  const { instance: ps, implementation: psImpl } = await deployProxy('DisposablePooledStaking');
  const { instance: pc, implementation: pcImpl } = await deployProxy('DisposableProposalCategory');
  const { instance: gv, implementation: gvImpl } = await deployProxy('Governance');

  const proxiesAndImplementations = [
    { proxy: master, implementation: masterImpl, contract: 'DisposableNXMaster' },
    { proxy: mr, implementation: mrImpl, contract: 'DisposableMemberRoles' },
    { proxy: tc, implementation: tcImpl, contract: 'DisposableTokenController' },
    { proxy: ps, implementation: psImpl, contract: 'DisposablePooledStaking' },
    { proxy: pc, implementation: pcImpl, contract: 'DisposableProposalCategory' },
    { proxy: gv, implementation: gvImpl, contract: 'Governance' },
  ];

  for (const addresses of proxiesAndImplementations) {
    const { contract, proxy, implementation } = addresses;
    verifier.add('OwnedUpgradeabilityProxy', proxy.address, ['address'], [implementation.address]);
    verifier.add(contract, implementation.address);
  }

  const codes = ['QD', 'TD', 'CD', 'PD', 'QT', 'TF', 'TC', 'CL', 'CR', 'P1', 'P2', 'MC', 'GV', 'PC', 'MR', 'PS'];
  const addresses = [qd, td, cd, pd, qt, tf, tc, cl, cr, p1, p2, mc, { address: owner }, pc, mr, ps].map(c => c.address);

  console.log('Running initializations');
  await master.initialize(
    owner,
    tk.address,
    300, // emergency pause time
    codes.map(hex), // codes
    codes.map(contractType), // types
    addresses, // addresses
  );

  await tc.initialize(
    master.address,
    tk.address,
    ps.address,
    600, // minCALockTime
  );

  await mr.initialize(
    owner,
    master.address,
    tc.address,
    [owner], // initial members
    [ether('10000')], // initial tokens
    [owner], // advisory board members
  );

  await pc.initialize(mr.address, { gas: 10e6 });

  await ps.initialize(
    tc.address,
    ether('2'), // min stake
    ether('2'), // min unstake
    10, // max exposure
    600, // unstake lock time
  );

  console.log('Setting parameters');

  await pd.changeMasterAddress(master.address);
  await pd.changeCurrencyAssetBaseMin(hex('DAI'), '0');
  await pd.changeCurrencyAssetBaseMin(hex('ETH'), '0');

  await pd.updateUintParameters(hex('MCRMIN'), ether('12000')); // minimum capital in eth
  await pd.updateUintParameters(hex('MCRSHOCK'), 50); // mcr shock parameter
  await pd.updateUintParameters(hex('MCRCAPL'), 20); // capacity limit per contract 20%

  await cd.changeMasterAddress(master.address);
  await cd.updateUintParameters(hex('CAMAXVT'), 1); // max voting time 1h
  await cd.updateUintParameters(hex('CAMINVT'), 1); // min voting time 1h
  await cd.updateUintParameters(hex('CADEPT'), 1); // claim deposit time 1 day
  await cd.updateUintParameters(hex('CAPAUSET'), 1); // claim assessment pause time 1 day

  await td.changeMasterAddress(master.address);
  await td.updateUintParameters(hex('RACOMM'), 50); // staker commission percentage 50%
  await td.updateUintParameters(hex('CABOOKT'), 1); // "book time" 1h
  await td.updateUintParameters(hex('CALOCKT'), 1); // ca lock 1 day
  await td.updateUintParameters(hex('MVLOCKT'), 1); // ca lock mv 1 day

  await gv.changeMasterAddress(master.address);
  await gv.updateUintParameters(hex('GOVHOLD'), 1); // token holding time 1 day
  await gv.updateUintParameters(hex('ACWT'), 1); // action waiting time 1h

  await master.switchGovernanceAddress(gv.address);

  console.log('Upgrading to non-disposable contracts');

  // trigger changeDependentContractAddress() on all contracts
  await master.changeAllAddress();

  const { implementation: newMasterImpl } = await upgradeProxy(master.address, 'NXMaster');
  const { implementation: newMrImpl } = await upgradeProxy(mr.address, 'MemberRoles');
  const { implementation: newTcImpl } = await upgradeProxy(tc.address, 'TokenController');
  const { implementation: newPsImpl } = await upgradeProxy(ps.address, 'PooledStaking');
  const { implementation: newPcImpl } = await upgradeProxy(pc.address, 'ProposalCategory');

  verifier.add('NXMaster', newMasterImpl.address);
  verifier.add('MemberRoles', newMrImpl.address);
  verifier.add('TokenController', newTcImpl.address);
  verifier.add('PooledStaking', newPsImpl.address);
  verifier.add('ProposalCategory', newPcImpl.address);

  console.log("Transfering contracts' ownership");
  await transferProxyOwnership(mr.address, master.address);
  await transferProxyOwnership(tc.address, master.address);
  await transferProxyOwnership(ps.address, master.address);
  await transferProxyOwnership(pc.address, master.address);
  await transferProxyOwnership(gv.address, master.address);
  await transferProxyOwnership(master.address, gv.address);

  console.log('Contract addresses to be verified:');
  verifier.dump();

  console.log('Performing verifications');
  await verifier.submit();

  console.log('Posting MCR and IA details');

  await daiToken.mint(p1.address, ether('6500000'));

  await mc.addMCRData(
    13000,
    ether('20000'),
    ether('26000'),
    [hex('ETH'), hex('DAI')],
    [100, 25000],
    20200801,
  );

  await p2.saveIADetails([hex('ETH'), hex('DAI')], [100, 25000], 20200801, true);

  console.log('Done!');
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('An unexpected error encountered:', error);
    process.exit(1);
  });
