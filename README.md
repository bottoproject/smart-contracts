# BOTTO Smart Contracts
Set of Ethereum smart contracts to interact with the first decentralized autonomous artist: BOTTO

## Installation

```
cp .env.example .env.local
# modify vars in .env.local if required
nvm install && nvm use
npm install
```

## Testing

```
npx truffle compile --all
npx truffle test
```

## Migrations

```
npx truffle migrate
```
