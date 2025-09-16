const getEventsFromTxReceipt = (txReceipt, filterContract, filterName = null, filterArgs = null) => {
  let events = txReceipt.events
    .filter(e => e.address === filterContract.address)
    .map(e => filterContract.interface.parseLog(e));

  if (filterName) {
    events = events.filter(e => e.name === filterName);
  }

  if (filterArgs) {
    events = events.filter(e => Object.entries(filterArgs).every(([key, value]) => e.args[key] === value));
  }

  return events;
};

module.exports = { getEventsFromTxReceipt };
