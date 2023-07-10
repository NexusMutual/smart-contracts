const { ethers } = require('hardhat');
const { expect } = require('chai');
const { ProposalCategory: PROPOSAL_CATEGORIES } = require('../../lib/constants');
const { setEtherBalance } = require('../utils/evm');
const { parseEther, defaultAbiCoder, toUtf8Bytes } = ethers.utils;
const { V2Addresses, UserAddress, submitGovernanceProposal, PriceFeedOracle, Address, EnzymeAddress } = require('./utils');
const { proposalCategories, constants: { PoolAddressParamType } } = require("../utils");

const { ENZYMEV4_VAULT_PROXY_ADDRESS } = EnzymeAddress;
const { DAI_ADDRESS, STETH_ADDRESS, RETH_ADDRESS } = Address;
const {
  DAI_PRICE_FEED_ORACLE_AGGREGATOR,
  STETH_PRICE_FEED_ORACLE_AGGREGATOR,
  ENZYMEV4_VAULT_PRICE_FEED_ORACLE_AGGREGATOR,
  RETH_PRICE_FEED_ORACLE_AGGREGATOR
} = PriceFeedOracle;

const evm = require('./evm')();
describe('Swap ETH for rETH', function () {
  before(async function () {
    // Initialize evm helper
    await evm.connect(ethers.provider);
    const hugh = await ethers.getImpersonatedSigner(UserAddress.HUGH);
    await setEtherBalance(hugh.address, parseEther('1000'));

    this.hugh = hugh;

    // Upgrade StakingProducts
    const governance = await ethers.getContractAt('Governance', V2Addresses.Governance);
    const memberRoles = await ethers.getContractAt('MemberRoles', V2Addresses.MemberRoles);
    const { memberArray: abMembersAddresses } = await memberRoles.members(1);

    const abMembers = [];
    for (const address of abMembersAddresses) {
      const abSigner = await ethers.getImpersonatedSigner(address);
      await setEtherBalance(address, parseEther('1000'));
      abMembers.push(abSigner);
    }

    this.abMembers = abMembers;
    this.governance = governance;
  });

  it('should edit proposal category 42 to match new signature', async function () {

    // the current signature of addAsset is addAsset(address,bool,uint256,uint256,uint256)
    // and does not match the signature of category 42
    await submitGovernanceProposal(
      // editCategory(uint256,string,uint256,uint256,uint256,uint256[],uint256,string,address,bytes2,uint256[],string)
      PROPOSAL_CATEGORIES.editCategory,
      defaultAbiCoder.encode(
        [
          'uint256',
          'string',
          'uint256',
          'uint256',
          'uint256',
          'uint256[]',
          'uint256',
          'string',
          'address',
          'bytes2',
          'uint256[]',
          'string',
        ],
        [41, ...proposalCategories[42]],
      ),
      this.abMembers,
      this.governance,
    );
  });

  it('should add new asset rETH', async function () {

    const isCoverAsset = false;
    const minValue = parseEther('13350');
    const maxValue = parseEther('13400');
    const maxSlippageRatio = 100;

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.addAsset,
      defaultAbiCoder.encode(
        ['address','bool','uint256','uint256','uint256'],
        [RETH_ADDRESS, isCoverAsset, minValue, maxValue, maxSlippageRatio]),
      this.abMembers,
      this.governance,
    );
  });

  it('should upgrade PriceFeedOracle contract', async function () {

    const assetAddresses = [DAI_ADDRESS, STETH_ADDRESS, ENZYMEV4_VAULT_PROXY_ADDRESS, RETH_ADDRESS];
    const assetAggregators = [
      DAI_PRICE_FEED_ORACLE_AGGREGATOR,
      STETH_PRICE_FEED_ORACLE_AGGREGATOR,
      ENZYMEV4_VAULT_PRICE_FEED_ORACLE_AGGREGATOR,
      RETH_PRICE_FEED_ORACLE_AGGREGATOR
    ];
    console.log('Deploying new PriceFeedOracle');
    const assetDecimals = [18, 18, 18, 18];
    const priceFeedOracle = await ethers.deployContract('PriceFeedOracle', [
      assetAddresses,
      assetAggregators,
      assetDecimals,
    ]);

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.updatePoolAddressParameters,
      defaultAbiCoder.encode(['bytes8', 'address'], [PoolAddressParamType.priceFeedOracle, priceFeedOracle.address]),
      this.abMembers,
      this.governance,
    );
  });
});
