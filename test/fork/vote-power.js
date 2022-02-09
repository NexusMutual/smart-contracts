const fetch = require('node-fetch');
const { artifacts } = require('hardhat');
const { ether } = require('@openzeppelin/test-helpers');
const Web3 = require('web3');
const PromisePool = require('es6-promise-pool');

const getAddressByCode = (items, code) => items.find(item => item.code === code).address;
const getAbiByCode = (items, code) => items.find(item => item.code === code).contractAbi;

describe('VotePower', function () {

  this.timeout(0);

  it('get vote power of all members', async function () {

    console.log('Fetching version data');
    const versionDataUrl = 'https://api.nexusmutual.io/version-data/data.json';
    const { mainnet: { abis } } = await fetch(versionDataUrl).then(r => r.json());

    console.log('Deploying VotePower contract');
    const VotePower = artifacts.require('VotePower');
    const votePower = await VotePower.new(getAddressByCode(abis, 'NXMASTER'));

    const directWeb3 = new Web3(process.env.TEST_ENV_FORK);
    const mrAbi = JSON.parse(getAbiByCode(abis, 'MR'));
    const mrAddress = getAddressByCode(abis, 'MR');
    const memberRoles = new directWeb3.eth.Contract(mrAbi, mrAddress);

    console.log('Fetching members');
    const membersArrayLength = await memberRoles.methods.membersLength(2).call();

    const memberFetcher = function * () {
      for (let i = 0; i < membersArrayLength; i++) {
        yield memberRoles.methods.memberAtIndex(2, i).call();
      }
    };

    const memberFetcherPool = new PromisePool(memberFetcher(), 50);
    const members = [];
    let counter = 0;

    memberFetcherPool.addEventListener('fulfilled', function (event) {
      process.stdout.write(`\r${++counter}/${membersArrayLength}`);
      const { 0: address, 1: isMember } = event.data.result;
      if (isMember) {
        members.push(address);
      }
    });

    await memberFetcherPool.start();

    console.log(`\rFetched ${members.length} members`);

    console.log('Fetching total balance for all members');
    let totalBalance = ether('0');

    const getAddressAndBalance = async member => {
      const balance = await votePower.balanceOf(member);
      return { member, balance };
    };

    const balanceFetcher = function * () {
      for (let i = 0; i < members.length; i++) {
        yield getAddressAndBalance(members[i]);
      }
    };

    const balanceFetcherPool = new PromisePool(balanceFetcher(), 10);
    counter = 0;

    balanceFetcherPool.addEventListener('fulfilled', function (event) {
      const { member, balance } = event.data.result;
      totalBalance = totalBalance.add(balance);

      const progress = `[${++counter}/${members.length}]`;
      const output = `Balance of member ${member} = ${balance}`;
      console.log(`${progress} ${output}`);
    });

    await balanceFetcherPool.start();

    console.log('Done!');
  });

});
