import { MiniMeToken } from 'minimetoken';

export const milestoneStatus = (accepted, canceled) => {
  if (canceled) return 'Canceled';
  if (accepted) return 'Completed';
  return 'InProgress';
};

export const pledgePaymentStatus = (val) => {
  switch (val) {
    case '0':
      return 'Pledged';
    case '1':
      return 'Paying';
    case '2':
      return 'Paid';
    default:
      return 'Unknown';
  }
};

export const getTokenInformation = (web3, addr) => {
  const minime = new MiniMeToken(web3, addr);

  return Promise.all([
    minime.name(),
    minime.symbol()
  ])
    .then(([ name, symbol ]) => {
      return {
        name,
        symbol,
        address: addr
      };
    });
};
