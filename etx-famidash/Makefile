DEST?=_site

all: lua

deps: node_modules/.bin/tstl

node_modules/.bin/tstl: package.json
	npm i

lua: deps
	node_modules/.bin/tstl
	mkdir -p $(DEST)/SCRIPTS
	cp -f src/famidash.lua $(DEST)/SCRIPTS/Famidash.lua
	cp -f src/famidash-widget.lua $(DEST)/famidash.lua

clean:
	rm -f package-lock.json
	rm -rf $(DEST) node_modules src/*.lua
