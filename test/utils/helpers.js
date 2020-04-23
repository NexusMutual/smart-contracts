const hex = string => '0x' + Buffer.from(string).toString('hex');

const parseLogs = tx => {
  return tx.logs.map(log => {
    console.log(log);
    return log;
  });
};

module.exports = { hex, parseLogs };
