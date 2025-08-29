const { ethers } = require('hardhat');
const { abis, addresses } = require('@nexusmutual/deployments');

const { Addresses, getFundedSigner } = require('./utils');

it('load contracts', async function () {
  this.mcr = await ethers.getContractAt(abis.MCR, addresses.MCR);
  this.cover = await ethers.getContractAt(abis.Cover, addresses.Cover);
  this.nxm = await ethers.getContractAt(abis.NXMToken, addresses.NXMToken);
  this.master = await ethers.getContractAt(abis.NXMaster, addresses.NXMaster);
  this.coverNFT = await ethers.getContractAt(abis.CoverNFT, addresses.CoverNFT);
  this.coverProducts = await ethers.getContractAt(abis.CoverProducts, addresses.CoverProducts);
  this.pool = await ethers.getContractAt(abis.Pool, addresses.Pool);
  this.safeTracker = await ethers.getContractAt(abis.SafeTracker, addresses.SafeTracker);
  this.assessment = await ethers.getContractAt(abis.Assessment, addresses.Assessment);
  this.stakingNFT = await ethers.getContractAt(abis.StakingNFT, addresses.StakingNFT);
  this.stakingProducts = await ethers.getContractAt(abis.StakingProducts, addresses.StakingProducts);
  this.swapOperator = await ethers.getContractAt(abis.SwapOperator, addresses.SwapOperator);
  this.priceFeedOracle = await ethers.getContractAt(abis.PriceFeedOracle, addresses.PriceFeedOracle);
  this.tokenController = await ethers.getContractAt(abis.TokenController, addresses.TokenController);
  this.individualClaims = await ethers.getContractAt(abis.IndividualClaims, addresses.IndividualClaims);
  this.proposalCategory = await ethers.getContractAt(abis.ProposalCategory, addresses.ProposalCategory);
  this.stakingPoolFactory = await ethers.getContractAt(abis.StakingPoolFactory, addresses.StakingPoolFactory);
  this.ramm = await ethers.getContractAt(abis.Ramm, addresses.Ramm);
  this.limitOrders = await ethers.getContractAt(abis.LimitOrders, addresses.LimitOrders);
  this.governance = await ethers.getContractAt(abis.Governance, addresses.Governance);
  this.memberRoles = await ethers.getContractAt(abis.MemberRoles, addresses.MemberRoles);
  this.assessmentViewer = await ethers.getContractAt(abis.AssessmentViewer, addresses.AssessmentViewer);
  this.coverViewer = await ethers.getContractAt(abis.CoverViewer, addresses.CoverViewer);
  this.nexusViewer = await ethers.getContractAt(abis.NexusViewer, addresses.NexusViewer);
  this.stakingViewer = await ethers.getContractAt(abis.StakingViewer, addresses.StakingViewer);

  // External contracts
  this.coverBroker = await ethers.getContractAt(abis.CoverBroker, addresses.CoverBroker);

  // Token Mocks
  this.weth = await ethers.getContractAt('WETH9', Addresses.WETH_ADDRESS);
  this.cbBTC = await ethers.getContractAt('ERC20Mock', Addresses.CBBTC_ADDRESS);
  this.dai = await ethers.getContractAt('ERC20Mock', Addresses.DAI_ADDRESS);
  this.usdc = await ethers.getContractAt('ERC20Mock', Addresses.USDC_ADDRESS);
  this.rEth = await ethers.getContractAt('ERC20Mock', Addresses.RETH_ADDRESS);
  this.stEth = await ethers.getContractAt('ERC20Mock', Addresses.STETH_ADDRESS);
  this.awEth = await ethers.getContractAt('ERC20Mock', Addresses.AWETH_ADDRESS);
  this.enzymeShares = await ethers.getContractAt('ERC20Mock', Addresses.ENZYMEV4_VAULT_PROXY_ADDRESS);
});

it('Impersonate AB members', async function () {
  const { memberArray: members } = await this.memberRoles.members(1);
  this.abMembers = await Promise.all(members.map(address => getFundedSigner(address)));
});
