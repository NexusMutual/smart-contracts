const path = require('node:path');
const fs = require('node:fs');
const { config } = require('hardhat');
const yaml = require('yaml');
const fetch = require('node-fetch');
const bip39 = require('ethereum-cryptography/bip39');
const { wordlist } = require('ethereum-cryptography/bip39/wordlists/english');

const ACCOUNT_SLUG = 'NexusMutual';
const PROJECT_SLUG = 'nexusmutual';
const TENDERLY_API_URL = `https://api.tenderly.co/api/v1/account/${ACCOUNT_SLUG}/project/${PROJECT_SLUG}`;

const usage = () => {
  console.log(`
    Usage:
      create-tenderly-vnet [OPTIONS] [VNET_NAME]

      VNET_NAME will be generated if not provided. [optional]

    Options:
      --network-id, -n NETWORK_ID
        The network id to use for the created vnet. Defaults to 1.
      --write-env, -w
        Update the .env with the created vnet RPC URL. Will comment out an existing URL.
      --help, -h
        Print this help message.
  `);
};

const parseArgs = args => {
  const opts = {
    networkId: 1,
    writeEnv: false,
    vnetName: undefined,
  };

  const positionalArgs = [];

  while (args.length) {
    const arg = args.shift();

    if (['--help', '-h'].includes(arg)) {
      usage();
      process.exit();
    }

    if (['--network-id', '-n'].includes(arg)) {
      const id = args.shift();
      opts.networkId = Number(id);
      if (Number.isNaN(opts.networkId)) {
        console.error(`Invalid network id: ${id}`);
        process.exit(1);
      }
      continue;
    }

    if (['--write-env', '-w'].includes(arg)) {
      opts.writeEnv = true;
      continue;
    }

    positionalArgs.push(arg);
  }

  if (positionalArgs.length > 1) {
    console.error('Too many arguments');
    usage();
    process.exit(1);
  }

  const [vnetName] = positionalArgs;

  opts.vnetName = vnetName;

  if (!opts.vnetName) {
    // default name `[bip39word]-[bip39word]-YYYY-mm-dd
    const [date] = new Date().toISOString().split('T');
    const words = bip39.generateMnemonic(wordlist).split(' ').slice(0, 2).join('-');
    opts.vnetName = `${words}-${date}`;
  }

  return opts;
};

const getTenderlyToken = () => {
  const home = process.env.HOME;
  const tenderlyConfigPath = path.join(home, '.tenderly', 'config.yaml');

  if (!fs.existsSync(tenderlyConfigPath)) {
    console.error('Tenderly config file not found');
    console.error('Please install Tenderly CLI and run `tenderly login` first');
    process.exit(2);
  }

  const config = fs.readFileSync(tenderlyConfigPath, 'utf8');
  const { token } = yaml.parse(config);

  if (!token) {
    console.error('Tenderly token not found');
    console.error('Please run `tenderly login` first');
    process.exit(2);
  }

  return token;
};

const createVnet = async (opts, token) => {
  const url = `${TENDERLY_API_URL}/vnets`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const method = 'post';

  const data = {
    slug: opts.vnetName,
    fork_config: { network_id: 1 },
    virtual_network_config: { chain_config: { chain_id: opts.networkId } },
    sync_state_config: { enabled: false },
  };

  return fetch(url, { method, headers, body: JSON.stringify(data) }).then(r => r.json());
};

const updateEnv = (rpcUrl, vnetName) => {
  const envPath = path.join(config.paths.root, '.env');
  const env = fs.readFileSync(envPath, 'utf8').split('\n');

  // remove all empty lines at the end of the file
  while (env.at(-1) === '') {
    env.pop();
  }

  const test = /^TENDERLY_PROVIDER_URL=(.*)$/;
  const insert = `TENDERLY_PROVIDER_URL=${rpcUrl} # ${vnetName}`;

  const newEnv = env.flatMap(line =>
    // if match found, insert right after
    line.match(test) ? [`#${line}`, insert] : line,
  );

  // if we didn't insert, append to the end of the file
  if (newEnv.length === env.length) {
    newEnv.push('', insert);
  }

  // ensure newline at the end of the file
  newEnv.push('');

  fs.writeFileSync(envPath, newEnv.join('\n'));
};

// bold console text
const bold = text => `\x1b[1m${text}\x1b[0m`;

const main = async () => {
  const opts = parseArgs(process.argv.slice(2));
  const token = getTenderlyToken();

  const vnet = await createVnet(opts, token);
  const rpcUrl = vnet.rpcs.find(rpc => rpc.name === 'Admin RPC').url;
  const chainId = vnet.virtual_network_config.chain_config.chain_id;

  console.info(`Created ${bold(vnet.slug)} with chain id ${bold(chainId)}`);
  console.info(`RPC URL: ${rpcUrl}`);

  if (opts.writeEnv) {
    updateEnv(rpcUrl, vnet.slug);
    console.info(`TENDERLY_PROVIDER_URL was added to .env`);
  }

  console.info('');
};

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('An unexpected error encountered:', error);
    process.exit(1);
  });
