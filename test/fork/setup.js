const { abis, addresses } = require('@nexusmutual/deployments');
const { ethers } = require('hardhat');

const { Address, EnzymeAddress, getContractByContractCode, getSigner } = require('./utils');
const { ContractCode } = require('../../lib/constants');

const { parseEther } = ethers;

it('load contracts', async function () {
  [
    this.mcr,
    this.cover,
    this.nxm,
    this.master,
    this.coverNFT,
    this.coverProducts,
    this.pool,
    this.safeTracker,
    this.assessment,
    this.stakingNFT,
    this.stakingProducts,
    this.swapOperator,
    this.priceFeedOracle,
    this.tokenController,
    this.individualClaims,
    this.proposalCategory,
    this.stakingPoolFactory,
    this.ramm,
    this.limitOrders,
    this.governance,
    this.memberRoles,
    this.assessmentViewer,
    this.coverViewer,
    this.nexusViewer,
    this.stakingViewer,
    // External contracts
    this.coverBroker,
    // Token Mocks
    this.weth,
    this.cbBTC,
    this.dai,
    this.usdc,
    this.rEth,
    this.stEth,
    this.awEth,
    this.enzymeShares,
  ] = await Promise.all([
    ethers.getContractAt(abis.MCR, addresses.MCR),
    ethers.getContractAt(abis.Cover, addresses.Cover),
    ethers.getContractAt(abis.NXMToken, addresses.NXMToken),
    ethers.getContractAt(abis.NXMaster, addresses.NXMaster),
    ethers.getContractAt(abis.CoverNFT, addresses.CoverNFT),
    ethers.getContractAt(abis.CoverProducts, addresses.CoverProducts),
    ethers.getContractAt(abis.Pool, addresses.Pool),
    ethers.getContractAt(abis.SafeTracker, addresses.SafeTracker),
    ethers.getContractAt(abis.Assessment, addresses.Assessment),
    ethers.getContractAt(abis.StakingNFT, addresses.StakingNFT),
    ethers.getContractAt(abis.StakingProducts, addresses.StakingProducts),
    ethers.getContractAt(abis.SwapOperator, addresses.SwapOperator),
    ethers.getContractAt(abis.PriceFeedOracle, addresses.PriceFeedOracle),
    ethers.getContractAt(abis.TokenController, addresses.TokenController),
    ethers.getContractAt(abis.IndividualClaims, addresses.IndividualClaims),
    ethers.getContractAt(abis.ProposalCategory, addresses.ProposalCategory),
    ethers.getContractAt(abis.StakingPoolFactory, addresses.StakingPoolFactory),
    ethers.getContractAt(abis.Ramm, addresses.Ramm),
    ethers.getContractAt(abis.LimitOrders, addresses.LimitOrders),
    getContractByContractCode(abis.Governance, ContractCode.Governance),
    getContractByContractCode(abis.MemberRoles, ContractCode.MemberRoles),
    ethers.getContractAt(abis.AssessmentViewer, addresses.AssessmentViewer),
    ethers.getContractAt(abis.CoverViewer, addresses.CoverViewer),
    ethers.getContractAt(abis.NexusViewer, addresses.NexusViewer),
    ethers.getContractAt(abis.StakingViewer, addresses.StakingViewer),
    // External contracts
    ethers.getContractAt(abis.CoverBroker, addresses.CoverBroker),
    // Token Mocks
    ethers.getContractAt('WETH9', Address.WETH_ADDRESS),
    ethers.getContractAt('ERC20Mock', Address.CBBTC_ADDRESS),
    ethers.getContractAt('ERC20Mock', Address.DAI_ADDRESS),
    ethers.getContractAt('ERC20Mock', Address.USDC_ADDRESS),
    ethers.getContractAt('ERC20Mock', Address.RETH_ADDRESS),
    ethers.getContractAt('ERC20Mock', Address.STETH_ADDRESS),
    ethers.getContractAt('ERC20Mock', Address.AWETH_ADDRESS),
    ethers.getContractAt('ERC20Mock', EnzymeAddress.ENZYMEV4_VAULT_PROXY_ADDRESS),
  ]);

  const [coverNFTDescriptorAddress, stakingPoolImplementation] = await Promise.all([
    this.coverNFT.nftDescriptor(),
    this.cover.stakingPoolImplementation(),
  ]);

  [this.coverNFTDescriptor, this.stakingPool] = await Promise.all([
    ethers.getContractAt(abis.CoverNFTDescriptor, coverNFTDescriptorAddress),
    ethers.getContractAt(abis.StakingPool, stakingPoolImplementation),
  ]);
});

it('Impersonate AB members', async function () {
  const { memberArray: abMembers } = await this.memberRoles.members(1);
  const impersonatePromises = abMembers.map(async address => {
    await Promise.all([this.evm.impersonate(address), this.evm.setBalance(address, parseEther('1000'))]);
    return getSigner(address);
  });
  this.abMembers = await Promise.all(impersonatePromises);
});
