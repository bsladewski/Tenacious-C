.PHONY: lint test check install

lint:
	npm run lint
	npx tsc --noEmit

test:
	npm run test

check: lint test

install:
	npm run build
	npm link
