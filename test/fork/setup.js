const { abis, addresses } = require('@nexusmutual/deployments');
const { ethers } = require('hardhat');

const { Address, EnzymeAdress, getContractByContractCode, getSigner } = require('./utils');
const { ContractCode } = require('../../lib/constants');

const { parseEther } = ethers.utils;

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

  this.governance = await getContractByContractCode(abis.Governance, ContractCode.Governance);
  this.memberRoles = await getContractByContractCode(abis.MemberRoles, ContractCode.MemberRoles);

  this.assessmentViewer = await ethers.getContractAt(abis.AssessmentViewer, addresses.AssessmentViewer);
  this.coverViewer = await ethers.getContractAt(abis.CoverViewer, addresses.CoverViewer);
  this.nexusViewer = await ethers.getContractAt(abis.NexusViewer, addresses.NexusViewer);
  this.stakingViewer = await ethers.getContractAt(abis.StakingViewer, addresses.StakingViewer);

  this.coverNFTDescriptor = await ethers.getContractAt(abis.CoverNFTDescriptor, await this.coverNFT.nftDescriptor());
  this.stakingPool = await ethers.getContractAt(abis.StakingPool, await this.cover.stakingPoolImplementation());

  // External contracts
  this.coverBroker = await ethers.getContractAt(abis.CoverBroker, addresses.CoverBroker);

  // Token Mocks
  this.weth = await ethers.getContractAt('WETH9', Address.WETH_ADDRESS);
  this.cbBTC = await ethers.getContractAt('ERC20Mock', Address.CBBTC_ADDRESS);
  this.dai = await ethers.getContractAt('ERC20Mock', Address.DAI_ADDRESS);
  this.usdc = await ethers.getContractAt('ERC20Mock', Address.USDC_ADDRESS);
  this.rEth = await ethers.getContractAt('ERC20Mock', Address.RETH_ADDRESS);
  this.stEth = await ethers.getContractAt('ERC20Mock', Address.STETH_ADDRESS);
  this.awEth = await ethers.getContractAt('ERC20Mock', Address.AWETH_ADDRESS);
  this.enzymeShares = await ethers.getContractAt('ERC20Mock', EnzymeAdress.ENZYMEV4_VAULT_PROXY_ADDRESS);
});

it('Impersonate AB members', async function () {
  const { memberArray: abMembers } = await this.memberRoles.members(1);
  const impersonatePromises = abMembers.map(async address => {
    await Promise.all([this.evm.impersonate(address), this.evm.setBalance(address, parseEther('1000'))]);
    return getSigner(address);
  });
  this.abMembers = await Promise.all(impersonatePromises);
});
