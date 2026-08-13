DEST?=_site

all: lua

deps: node_modules/.bin/tstl

node_modules/.bin/tstl: package.json
	npm i

lua: deps
	node_modules/.bin/tstl
	mkdir -p $(DEST)/SCRIPTS
	cp -f src/mario.lua $(DEST)/SCRIPTS/Mario.lua
	cp -f src/mario-widget.lua $(DEST)/mario.lua

clean:
	rm -f package-lock.json
	rm -rf $(DEST) node_modules src/*.lua
