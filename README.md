# kit

An implementation of jit ([Building Git](https://shop.jcoglan.com/building-git/)) in TypeScript

## Supported commands

```sh
# ./bin/kit <subcommand>
kit init
kit commit
kit add
kit status
kit branch
kit checkout
kit log
kit merge
kit rm
kit reset
kit cherry-pick
kit revert
kit config
```

## Development

```sh
# build
pnpm watch

# test (unit & integ)
yarn test:unit
yarn test:integ
yarn test:all
```
