const main = async () => {

  process.env.ENABLE_OPTIMIZER = '1';

  const { network, run } = require('hardhat');
  const { task } = require('hardhat/config');
  const deploy = require('./deploy');

  if (network.name !== 'hardhat') {
    console.log('[>] Starting the deployment');
    return deploy();
  }

  const getServer = () => {
    return new Promise(resolve => {
      task('node:server-ready', (args, _, runSuper) => {
        runSuper();
        resolve(args.server);
      });
    });
  };

  console.log('[>] Starting hardhat node');
  run('node').catch(e => {
    console.error(e);
    process.exit(1);
  });

  console.log('[>] Waiting for hardhat node to be ready');
  const server = await getServer();

  console.log('[>] Starting the deployment');
  await deploy();

  const { hostname, port } = server._config;
  console.log(`[i] RPC listening at http://${hostname}:${port}`);
  console.log(`[i] Chain ID ${network.config.chainId}`);

  await server.waitUntilClosed();
};

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('An unexpected error encountered:', error);
    process.exit(1);
  });
