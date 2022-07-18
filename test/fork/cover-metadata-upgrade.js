const { artifacts, web3 } = require('hardhat');
const fetch = require('node-fetch');
const utils = require('../utils'); // test/utils.js

const {
  Address,
  UserAddress,
  getAddressByCodeFactory,
  fund,
  unlock,
  submitGovernanceProposal,
} = require('./utils'); // test/fork/utils.js

const {
  buyCover: { buyCover, buyCoverWithDai, buyCoverThroughGateway },
  constants: { ProposalCategory },
  helpers: { hex },
} = utils;

const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMaster');
const NXMToken = artifacts.require('NXMToken');
const Governance = artifacts.require('Governance');
const Quotation = artifacts.require('Quotation');

describe('cover metadata upgrade', async function () {

  it('initializes contracts', async function () {

    const { mainnet: { abis } } = await fetch('https://api.nexusmutual.io/version-data/data.json').then(r => r.json());
    const getAddressByCode = getAddressByCodeFactory(abis);

    this.memberRoles = this.memberRoles || await MemberRoles.at(getAddressByCode('MR'));
    this.master = this.master || await NXMaster.at(getAddressByCode(('NXMASTER')));
    this.governance = this.governance || await Governance.at(getAddressByCode('GV'));
  });

  it('funds accounts', async function () {

    console.log('Funding accounts');

    const { memberArray: boardMembers } = await this.memberRoles.members('1');
    const voters = boardMembers.slice(1, 4);

    const whales = [UserAddress.NXM_WHALE_1, UserAddress.NXM_WHALE_2];

    for (const member of [...voters, Address.NXMHOLDER, ...whales]) {
      await fund(member);
      await unlock(member);
    }

    this.voters = voters;
    this.whales = whales;
  });

  it('upgrade quotation contract', async function () {

    const { voters, governance, master } = this;
    const quotationImplementation = await Quotation.new();

    const upgradesActionDataNonProxy = web3.eth.abi.encodeParameters(
      ['bytes2[]', 'address[]'],
      [
        ['QT'].map(hex),
        [quotationImplementation].map(c => c.address),
      ],
    );

    await submitGovernanceProposal(
      ProposalCategory.upgradeNonProxy,
      upgradesActionDataNonProxy,
      voters,
      governance,
    );

    const qtStoredAddress = await master.getLatestAddress(hex('QT'));
    assert.equal(qtStoredAddress, quotationImplementation.address);
  });

  require('./basic-functionality-tests');

});
